// Spielunterhaltung als Windows-App (Electron). Zeigt dieselben Dateien wie die Web-App –
// ausgeliefert über das eigene, sichere Schema app://spielunterhaltung/ (ES-Module und Worker
// funktionieren damit, file:// würde sie blockieren). Kein Netz, kein Node im Fenster.
const { app, BrowserWindow, protocol, net, nativeTheme, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const SCHEMA = 'app';
const HOST = 'spielunterhaltung';
const START = `${SCHEMA}://${HOST}/index.html`;
const WURZEL = path.join(__dirname, '..');
// Nur diese Teile der App werden ausgeliefert (keine Tests, Werkzeuge, Konzepte …)
const ERLAUBT = /^(index\.html|version\.js|manifest\.webmanifest|(css|kern|spiele|icons)\/[\w./-]+)$/;

// Selbsttest nie mit den echten Spielständen: eigener, frischer Datenordner
if (process.env.SPIEL_SELBSTTEST) {
  app.setPath('userData', path.join(app.getPath('temp'), `spielunterhaltung-selbsttest-${process.pid}`));
}

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEMA, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
}

// ---------- Fenstergröße merken ----------
const zustandsDatei = () => path.join(app.getPath('userData'), 'fenster.json');
function ladeFenster() {
  try {
    const z = JSON.parse(fs.readFileSync(zustandsDatei(), 'utf8'));
    if ([z.width, z.height].every((n) => Number.isInteger(n) && n >= 360 && n <= 10000)) return z;
  } catch { /* erster Start */ }
  return { width: 1200, height: 860 };
}
function speichereFenster(win) {
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(zustandsDatei(), JSON.stringify({ ...b, maximiert: win.isMaximized() }));
  } catch { /* egal */ }
}

function antwortDatei(anfrage) {
  const url = new URL(anfrage.url);
  if (url.host !== HOST) return new Response('Nicht gefunden', { status: 404 });
  let pfad = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (pfad === '') pfad = 'index.html';
  const voll = path.normalize(path.join(WURZEL, pfad));
  if (!ERLAUBT.test(pfad) || pfad.includes('..') || !voll.startsWith(WURZEL + path.sep)) {
    return new Response('Nicht gefunden', { status: 404 });
  }
  return net.fetch(pathToFileURL(voll).toString());
}

function erstelleFenster() {
  const gespeichert = ladeFenster();
  const win = new BrowserWindow({
    width: gespeichert.width,
    height: gespeichert.height,
    x: gespeichert.x,
    y: gespeichert.y,
    minWidth: 360,
    minHeight: 560,
    title: 'Spielunterhaltung',
    icon: path.join(WURZEL, 'icons', 'icon-512.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b2129' : '#f6f3ee',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  if (gespeichert.maximiert) win.maximize();

  // Das Fenster verlässt die App nie, öffnet keine weiteren Fenster und bekommt keine Geräterechte
  win.webContents.on('will-navigate', (e, ziel) => { if (!ziel.startsWith(`${SCHEMA}://${HOST}/`)) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _recht, antwort) => antwort(false));

  // F11 = Vollbild, Strg+R = neu laden (ohne Menüleiste)
  win.webContents.on('before-input-event', (e, eingabe) => {
    if (eingabe.type !== 'keyDown') return;
    if (eingabe.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if ((eingabe.control || eingabe.meta) && eingabe.key.toLowerCase() === 'r') { win.webContents.reload(); e.preventDefault(); }
  });

  // Im Selbsttest bleibt das Fenster unsichtbar (stört nicht beim Arbeiten)
  if (!process.env.SPIEL_SELBSTTEST) win.once('ready-to-show', () => win.show());
  win.on('close', () => speichereFenster(win));
  win.loadURL(START);
  return win;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle(SCHEMA, antwortDatei);
  const win = erstelleFenster();
  // Nur für die eigenen Tests (die Datei wird nicht mit ausgeliefert)
  if (process.env.SPIEL_SELBSTTEST) {
    const test = path.join(WURZEL, 'werkzeuge', 'desktop-selbsttest.cjs');
    if (fs.existsSync(test)) require(test)(win, process.env.SPIEL_SELBSTTEST);
  }
});

app.on('window-all-closed', () => app.quit());
