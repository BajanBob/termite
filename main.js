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

const AI_HOSTS = /^https:\/\/(api\.anthropic\.com|api\.venice\.ai|openrouter\.ai|api\.groq\.com|api\.elevenlabs\.io|generativelanguage\.googleapis\.com)\/|^http:\/\/(localhost|127\.0\.0\.1):11434\//;
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
ipcMain.handle('termite-share-file', async (e, bytes, filename, target) => {
  if (!e.senderFrame || !String(e.senderFrame.url).startsWith('app://')) return { ok: false, error: 'Not allowed' };
  try {
    const dir = path.join(app.getPath('downloads'), 'Termite');
    fs.mkdirSync(dir, { recursive: true });
    const file = uniquePath(dir, safeName(filename));
    fs.writeFileSync(file, Buffer.from(bytes));
    const copied = await copyFileToClipboard(file);
    shell.showItemInFolder(file);
    let opened = null;
    if (target === 'whatsapp') {
      const hasApp = !!app.getApplicationNameForProtocol('whatsapp://send');
      try { await shell.openExternal(hasApp ? 'whatsapp://send' : 'https://web.whatsapp.com/'); opened = hasApp ? 'app' : 'web'; } catch (err) { opened = null; }
    }
    return { ok: true, path: file, folder: dir, copied, opened };
  } catch (err) { return { ok: false, error: err.message }; }
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
