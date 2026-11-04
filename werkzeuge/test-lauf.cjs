// Unsichtbarer Chromium (Electron aus dem Anime Tracker) zum Testen ohne Edge/Chrome.
// Testserver muss laufen (werkzeuge\server.ps1, Port 8080). Jeder Aufruf startet mit leerem Speicher.
//
// Aufruf: über werkzeuge\test-lauf.ps1 (setzt die Umgebungsvariablen TL_*), siehe dort.
const { app, BrowserWindow, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');

// Electron beendet sich, sobald nach der URL weitere Argumente folgen → Optionen kommen über
// Umgebungsvariablen (am bequemsten über werkzeuge\test-lauf.ps1).
const env = process.env;
const opt = {
  url: process.argv.slice(2).find((a) => /^https?:\/\//.test(a)) || env.TL_URL,
  warte: env.TL_WARTE || null,
  js: Object.keys(env).filter((k) => /^TL_JS\d*$/.test(k)).sort((a, b) => Number(a.slice(5) || 0) - Number(b.slice(5) || 0)).map((k) => env[k]),
  bild: env.TL_BILD || null,
  breite: Number(env.TL_BREITE || 1200),
  hoehe: Number(env.TL_HOEHE || 850),
  zeit: Number(env.TL_ZEIT || 20000),
  dunkel: env.TL_DUNKEL === '1',
};
if (!opt.url) { console.log('FEHLER: keine URL angegeben'); process.exit(2); }

process.on('uncaughtException', (f) => { console.log('HAUPTPROZESS-FEHLER:', f?.stack || f); });
process.on('unhandledRejection', (f) => { console.log('HAUPTPROZESS-FEHLER:', f?.stack || f); });
app.on('window-all-closed', () => {});   // nicht vorzeitig beenden, wenn die Seite ein Fenster schließt

app.setPath('userData', path.join(app.getPath('temp'), `su-test-${process.pid}-${Date.now()}`));
app.commandLine.appendSwitch('force-device-scale-factor', '1');

async function warteAuf(win, ausdruck, ms) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) {
    const w = await win.webContents.executeJavaScript(`(async () => { try { return await (${ausdruck}); } catch { return null; } })()`).catch(() => null);
    if (w) return w;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

app.whenReady().then(async () => {
  if (opt.dunkel) nativeTheme.themeSource = 'dark';
  const win = new BrowserWindow({
    show: false, width: opt.breite, height: opt.hoehe, useContentSize: true, paintWhenInitiallyHidden: true,
    webPreferences: { backgroundThrottling: false },
  });
  win.webContents.on('console-message', (d) => {
    const lvl = typeof d.level === 'string' ? d.level : ['verbose', 'info', 'warning', 'error'][d.level];
    if (/Electron Security Warning/.test(d.message || '')) return;   // gilt nur für Electron-Apps, nicht für die Web-App
    if (lvl === 'error' || lvl === 'warning') console.log(`KONSOLE-${lvl.toUpperCase()}: ${d.message} (${(d.sourceId || '').replace(/^.*?:8080\//, '')}:${d.lineNumber})`);
  });
  win.webContents.on('render-process-gone', (_e, d) => console.log('ABSTURZ:', d.reason));

  try {
    await win.loadURL(opt.url);
  } catch (f) {
    console.log('LADEFEHLER:', f.message);
  }

  const istTest = /\/tests\//.test(opt.url);
  const warte = opt.warte || (istTest ? "document.getElementById('ergebnis')" : null);
  if (warte) {
    const ok = await warteAuf(win, warte, opt.zeit);
    if (!ok) console.log(`ZEITÜBERSCHREITUNG beim Warten auf: ${warte}`);
  } else {
    await new Promise((r) => setTimeout(r, 1500));
  }

  if (istTest) {
    const r = await win.webContents.executeJavaScript(`({
      summe: document.getElementById('ergebnis')?.textContent ?? '–',
      fehler: [...document.querySelectorAll('li.fehler')].map((l) => l.textContent),
      langsam: [...document.querySelectorAll('li')].filter((l) => / ms\\)$/.test(l.textContent)).map((l) => l.textContent),
    })`);
    console.log('TESTS:', r.summe);
    for (const f of r.fehler) console.log('  ✘', f);
    for (const l of r.langsam) console.log('  ⏱', l);
  }

  for (const js of opt.js) {
    try {
      const w = await win.webContents.executeJavaScript(`(async () => { ${/\breturn\b/.test(js) ? js : `return (${js});`} })()`);
      console.log('JS:', JSON.stringify(w));
    } catch (f) {
      console.log('JS-FEHLER:', f.message);
    }
  }

  if (opt.bild) {
    // Unsichtbare Fenster zeichnen träge: Neuzeichnen anstoßen und kurz warten, sonst ist das Bild veraltet
    win.webContents.invalidate();
    await win.webContents.executeJavaScript('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))').catch(() => {});
    await new Promise((r) => setTimeout(r, 600));
    win.webContents.invalidate();
    const bild = await win.webContents.capturePage();
    fs.mkdirSync(path.dirname(path.resolve(opt.bild)), { recursive: true });
    fs.writeFileSync(opt.bild, bild.toPNG());
    console.log('BILD:', path.resolve(opt.bild));
  }
  app.quit();
});
