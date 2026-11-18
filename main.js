// Termite desktop (Windows and Linux): shows the same app as the web version, served from the app's own files.
const { app, BrowserWindow, protocol, net, shell, Menu, ipcMain, session } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

const WEB = path.join(__dirname, 'web');
const OPENABLE = /\.(pdf|docx|doc|txt|md|html?)$/i;
const fileFrom = argv => argv.slice(1).find(a => OPENABLE.test(a) && fs.existsSync(a));
let win = null;
let pending = fileFrom(process.argv);

function openInPage(file) {
  if (!win) return;
  const b64 = fs.readFileSync(file).toString('base64');
  win.webContents.executeJavaScript(`(async () => { while (!window.termite || !termite.openBytes) await new Promise(r => setTimeout(r, 200)); termite.openBytes(${JSON.stringify(b64)}, ${JSON.stringify(path.basename(file))}); })()`).catch(() => {});
}

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (e, argv) => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  const f = fileFrom(argv); if (f) openInPage(f);
});

const AI_HOSTS = /^https:\/\/(api\.anthropic\.com|api\.venice\.ai|api\.deepseek\.com|openrouter\.ai|api\.groq\.com|api\.elevenlabs\.io|generativelanguage\.googleapis\.com)\/|^http:\/\/(localhost|127\.0\.0\.1):11434\//;
ipcMain.handle('termite-net', async (e, url, { method = 'POST', headers = {}, body, binary = false } = {}) => {
  if (!AI_HOSTS.test(url)) return { status: 403, text: JSON.stringify({ error: { message: 'Termite only talks to known AI services.' } }) };
  try { const r = await net.fetch(url, { method, headers, body: method === 'GET' ? undefined : body });
    if (binary && r.ok) return { status: r.status, b64: Buffer.from(await r.arrayBuffer()).toString('base64') };
    return { status: r.status, text: await r.text() }; }
  catch (err) { return { status: 0, text: JSON.stringify({ error: { message: err.message } }) }; }
});

// Share a file to WhatsApp from the desktop. A wa.me link can only carry text, so instead:
// save the file, copy it to the clipboard as a file (paste it into the chat with Ctrl+V),
// show it in its folder (to drag in if paste doesn't work), and open WhatsApp.
const run = (cmd, args, opts) => new Promise(res => execFile(cmd, args, { timeout: 15000, windowsHide: true, ...opts }, err => res(!err)));
function safeName(n) { n = path.basename(String(n || 'document')).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim(); return n || 'document'; }
function uniquePath(dir, name) {
  const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
  let p = path.join(dir, name), i = 2;
  while (fs.existsSync(p)) p = path.join(dir, `${base} (${i++})${ext}`);
  return p;
}
async function copyFileToClipboard(file) {
  if (process.platform === 'win32') {
    // The path goes in through an environment variable, never into the command text.
    return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', 'Set-Clipboard -LiteralPath $env:TERMITE_FILE'], { env: { ...process.env, TERMITE_FILE: file } });
  }
  if (process.platform === 'linux') {
    const uri = pathToFileURL(file).toString();
    const pipe = (cmd, args) => new Promise(res => { try { const c = require('child_process').spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'], detached: true });
      c.on('error', () => res(false)); c.stdin.end(uri + '\n'); setTimeout(() => { res(true); c.unref(); }, 400); } catch (e) { res(false); } });
    if (process.env.WAYLAND_DISPLAY && await pipe('wl-copy', ['-t', 'text/uri-list'])) return true;
    return pipe('xclip', ['-selection', 'clipboard', '-t', 'text/uri-list']);
  }
  return false;
}
// Where Smart Send may take you. Everything else is refused.
const WEB_OK = /^https:\/\/(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|compose\.mail\.yahoo\.com|www\.facebook\.com|m\.facebook\.com|web\.whatsapp\.com|wa\.me)\//;
const digits = p => String(p || '').replace(/\D/g, '').slice(0, 15);
function whatsappUrl(phone, text) {
  const q = new URLSearchParams(); if (digits(phone)) q.set('phone', digits(phone)); if (text) q.set('text', String(text).slice(0, 2000));
  const hasApp = !!app.getApplicationNameForProtocol('whatsapp://send');
  return { url: (hasApp ? 'whatsapp://send?' : 'https://web.whatsapp.com/send?') + q.toString().replace(/\+/g, '%20'), kind: hasApp ? 'app' : 'web' };
}
function composeUrl(service, { to = '', subject = '', body = '' } = {}) {
  const e = encodeURIComponent;
  if (service === 'gmail') return `https://mail.google.com/mail/?view=cm&fs=1&to=${e(to)}&su=${e(subject)}&body=${e(body)}`;
  if (service === 'outlook') return `https://outlook.live.com/mail/0/deeplink/compose?to=${e(to)}&subject=${e(subject)}&body=${e(body)}`;
  if (service === 'office') return `https://outlook.office.com/mail/deeplink/compose?to=${e(to)}&subject=${e(subject)}&body=${e(body)}`;
  if (service === 'yahoo') return `https://compose.mail.yahoo.com/?to=${e(to)}&subject=${e(subject)}&body=${e(body)}`;
  return `mailto:${e(to)}?subject=${e(subject)}&body=${e(body)}`;
}
const okEmail = t => /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(t);
// A draft email (.eml) with the file attached; "X-Unsent: 1" makes mail apps open it as a draft.
function writeEml(file, { to = '', subject = '', body = '' }, mime) {
  const enc = t => /^[\x20-\x7e]*$/.test(t) ? t : `=?UTF-8?B?${Buffer.from(t).toString('base64')}?=`;
  const b64 = buf => buf.toString('base64').replace(/.{76}/g, '$&\r\n');
  const name = path.basename(file), ascii = name.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/"/g, '') || 'document', boundary = 'termite-' + Date.now().toString(36);
  const eml = [
    okEmail(to) ? `To: ${to}` : null, `Subject: ${enc(subject)}`, 'X-Unsent: 1', 'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`, '', `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', b64(Buffer.from(body)), `--${boundary}`,
    `Content-Type: ${mime || 'application/octet-stream'}; name="${ascii}"`, 'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${ascii}"` + (ascii === name ? '' : `; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`), '', b64(fs.readFileSync(file)), `--${boundary}--`, ''
  ].filter(l => l !== null).join('\r\n');
  const dir = path.join(path.dirname(file), 'Email drafts'); fs.mkdirSync(dir, { recursive: true });
  const out = uniquePath(dir, name.replace(/\.[^.]+$/, '') + '.eml'); fs.writeFileSync(out, eml); return out;
}
// Opens a new email in the computer's own mail app with the file already attached.
async function emailWithApp(file, mail, mime) {
  const to = okEmail(mail.to || '') ? mail.to : '';
  if (process.platform === 'win32') {
    // Classic Outlook: a real draft through Outlook itself. Values go in through environment variables.
    const ps = '$o = New-Object -ComObject Outlook.Application; $m = $o.CreateItem(0); if ($env:T_TO) { $m.To = $env:T_TO }; $m.Subject = $env:T_SUBJ; $m.Body = $env:T_BODY; [void]$m.Attachments.Add($env:T_FILE); $m.Display($false)';
    const r = await new Promise(res => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', ps],
      { timeout: 45000, windowsHide: true, env: { ...process.env, T_TO: to, T_SUBJ: mail.subject || '', T_BODY: mail.body || '', T_FILE: file } }, err => res(!err || err.killed)));
    if (r) return 'outlook';
    const eml = writeEml(file, { ...mail, to }, mime);
    return (await shell.openPath(eml)) ? null : 'eml';
  }
  if (process.platform === 'linux') {
    const args = ['--subject', mail.subject || '', '--body', mail.body || '', '--attach', file]; if (to) args.push(to);
    if (await run('xdg-email', args)) return 'app';
    const eml = writeEml(file, { ...mail, to }, mime);
    return (await shell.openPath(eml)) ? null : 'eml';
  }
  return null;
}
async function saveShared(bytes, filename) {
  const dir = path.join(app.getPath('downloads'), 'Termite');
  fs.mkdirSync(dir, { recursive: true });
  const file = uniquePath(dir, safeName(filename));
  fs.writeFileSync(file, Buffer.from(bytes));
  return file;
}
const fromApp = e => e.senderFrame && String(e.senderFrame.url).startsWith('app://');

// target: 'whatsapp' | 'email' | 'facebook' | 'save'. opts: { phone, text, to, subject, body, service, url, mime }
ipcMain.handle('termite-share-file', async (e, bytes, filename, target, opts = {}) => {
  if (!fromApp(e)) return { ok: false, error: 'Not allowed' };
  try {
    const file = await saveShared(bytes, filename);
    const out = { ok: true, path: file, folder: path.dirname(file), copied: false, opened: null };
    if (target === 'email' && (opts.service || 'app') === 'app') {
      out.opened = await emailWithApp(file, opts, opts.mime);
      if (out.opened) return out;                                   // attached already: nothing to paste
      opts.service = 'mailto';
    }
    out.copied = await copyFileToClipboard(file);
    shell.showItemInFolder(file);
    try {
      if (target === 'whatsapp') { const w = whatsappUrl(opts.phone, opts.text); await shell.openExternal(w.url); out.opened = w.kind; }
      else if (target === 'email') { await shell.openExternal(composeUrl(opts.service, opts)); out.opened = opts.service; }
      else if (target === 'facebook') { const u = WEB_OK.test(opts.url || '') ? opts.url : 'https://www.facebook.com/'; await shell.openExternal(u); out.opened = 'web'; }
    } catch (err) { out.opened = null; }
    return out;
  } catch (err) { return { ok: false, error: err.message }; }
});

// Opens WhatsApp, an email service or Facebook with nothing attached ("open my WhatsApp").
ipcMain.handle('termite-open-app', async (e, target, opts = {}) => {
  if (!fromApp(e)) return { ok: false };
  try {
    if (target === 'whatsapp') { const w = whatsappUrl(opts.phone, opts.text); await shell.openExternal(w.url); return { ok: true, opened: w.kind }; }
    if (target === 'email') { const u = composeUrl(opts.service, opts); if (opts.service && opts.service !== 'app' && opts.service !== 'mailto' && !WEB_OK.test(u)) return { ok: false };
      await shell.openExternal(opts.service === 'gmail' && !opts.to && !opts.subject ? 'https://mail.google.com/' : u); return { ok: true, opened: opts.service || 'app' }; }
    if (target === 'facebook') { await shell.openExternal(WEB_OK.test(opts.url || '') ? opts.url : 'https://www.facebook.com/'); return { ok: true, opened: 'web' }; }
  } catch (err) {}
  return { ok: false };
});

app.whenReady().then(() => {
  protocol.handle('app', req => {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p === '/' || !p) p = '/index.html';
    const full = path.normalize(path.join(WEB, p));
    if (!full.startsWith(WEB)) return new Response('Not allowed', { status: 403 });
    return net.fetch(pathToFileURL(full).toString());
  });
  Menu.setApplicationMenu(null);
  // Microphone for VoiceOver recording; nothing else is granted.
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => cb(perm === 'media' && (details.mediaTypes || []).every(t => t === 'audio') && wc.getURL().startsWith('app://')));
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => perm === 'media' && String(origin).startsWith('app://'));
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 380, minHeight: 500, title: 'Termite', backgroundColor: '#e7e9ec',
    icon: path.join(WEB, 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: true, preload: path.join(__dirname, 'preload.js') }
  });
  const external = url => { if (/^(https?|mailto):/i.test(url)) shell.openExternal(url); };
  win.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); external(url); } });
  win.webContents.on('did-finish-load', () => { if (pending) { openInPage(pending); pending = null; } });
  win.loadURL('app://termite/index.html');
});

app.on('window-all-closed', () => app.quit());
