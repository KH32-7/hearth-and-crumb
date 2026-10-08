// Hearth & Crumb — desktop shell (Electron). Serves the Vite build through a
// privileged app:// protocol so absolute asset paths behave exactly like the web
// build, and optionally connects to Steam via steamworks.js.
const { app, BrowserWindow, protocol, net, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const DIST = path.join(__dirname, '..', 'dist');
const isDev = process.argv.includes('--dev');
const smokeOut = (process.argv.find((a) => a.startsWith('--smoke=')) || '').slice(8);

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
]);

// ---------------------------------------------------------------- Steam
let steam = null;
const requestLog = [];
function initSteam() {
  const idFile = path.join(path.dirname(app.getPath('exe')), 'steam_appid.txt');
  const appId = process.env.STEAM_APP_ID ? Number(process.env.STEAM_APP_ID) : fs.existsSync(idFile) ? Number(fs.readFileSync(idFile, 'utf8').trim()) : null;
  if (!appId) return;
  try {
    const sw = require('steamworks.js');
    steam = sw.init(appId);
    sw.electronEnableSteamOverlay();
    console.log(`[steam] connected as ${steam.localplayer.getName()} (app ${appId})`);
  } catch (err) {
    console.warn('[steam] not available:', err && err.message);
    steam = null;
  }
}

ipcMain.handle('steam:achievement', (_e, id) => {
  try {
    return steam ? steam.achievement.activate(String(id)) : false;
  } catch {
    return false;
  }
});
ipcMain.handle('steam:status', () => ({ connected: !!steam, name: steam ? steam.localplayer.getName() : null }));
ipcMain.on('app:quit', () => app.quit());
ipcMain.on('app:fullscreen', (e, on) => BrowserWindow.fromWebContents(e.sender)?.setFullScreen(!!on));

// ---------------------------------------------------------------- window
function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    backgroundColor: '#2a1a14',
    title: 'Hearth & Crumb',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.setMenu(null);
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  // F11 fullscreen toggle, F12 devtools in dev only.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (input.key === 'F12' && isDev) {
      win.webContents.toggleDevTools();
    }
  });
  if (isDev) void win.loadURL('http://127.0.0.1:5188');
  else void win.loadURL('app://bakery/index.html');
  if (smokeOut) {
    // Automated check: capture the title screen, then a gameplay frame, then quit.
    const errors = [];
    win.webContents.on('console-message', (e) => errors.push(`${e.level}: ${e.message}`));
    win.webContents.once('did-finish-load', async () => {
      await new Promise((r) => setTimeout(r, 5000));
      fs.writeFileSync(`${smokeOut}-title.png`, (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript("window.__THREE_GAME_TEST_HOOKS__.setState('kitchen')");
      await new Promise((r) => setTimeout(r, 2500));
      fs.writeFileSync(`${smokeOut}-play.png`, (await win.webContents.capturePage()).toPNG());
      const diag = await win.webContents.executeJavaScript('JSON.stringify(window.__THREE_GAME_DIAGNOSTICS__ && window.__THREE_GAME_DIAGNOSTICS__.renderer)');
      fs.writeFileSync(`${smokeOut}-report.json`, JSON.stringify({ errors, requests: requestLog, renderer: JSON.parse(diag || 'null'), gpu: app.getGPUFeatureStatus() }, null, 2));
      app.quit();
    });
  }
}

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST)) return new Response('Forbidden', { status: 403 });
    if (smokeOut) requestLog.push(`${fs.existsSync(file) ? 'ok ' : 'MISS'} ${rel}`);
    return net.fetch(pathToFileURL(file).toString());
  });
  initSteam();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
