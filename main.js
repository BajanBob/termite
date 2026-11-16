// Termite desktop (Windows and Linux): shows the same app as the web version, served from the app's own files.
const { app, BrowserWindow, protocol, net, shell, Menu } = require('electron');
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

app.whenReady().then(() => {
  protocol.handle('app', req => {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p === '/' || !p) p = '/index.html';
    const full = path.normalize(path.join(WEB, p));
    if (!full.startsWith(WEB)) return new Response('Not allowed', { status: 403 });
    return net.fetch(pathToFileURL(full).toString());
  });
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 380, minHeight: 500, title: 'Termite', backgroundColor: '#e7e9ec',
    icon: path.join(WEB, 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: true }
  });
  const external = url => { if (/^(https?|mailto):/i.test(url)) shell.openExternal(url); };
  win.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); external(url); } });
  win.webContents.on('did-finish-load', () => { if (pending) { openInPage(pending); pending = null; } });
  win.loadURL('app://termite/index.html');
});

app.on('window-all-closed', () => app.quit());
