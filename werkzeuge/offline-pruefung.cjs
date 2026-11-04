// Unsichtbarer Chromium (Electron) prüft: Tests, Service Worker, Offline-Start der App.
// Nötig, weil das Browser-Fenster in Claude keine Service Worker kann und kein Edge/Chrome da ist.
// Voraussetzung: Testserver läuft auf Port 8080 (werkzeuge\server.ps1). Aufruf (PowerShell):
//   & "..\anime-tracker\node_modules\electron\dist\electron.exe" werkzeuge\offline-pruefung.cjs
const { app, BrowserWindow, session } = require('electron');
const path = require('path');

app.setPath('userData', path.join(app.getPath('temp'), 'su-sw-check-' + Date.now()));

async function warteAuf(win, ausdruck, ms = 15000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) {
    const w = await win.webContents.executeJavaScript(ausdruck).catch(() => null);
    if (w) return w;
    await new Promise((r) => setTimeout(r, 200));
  }
  return 'ZEITÜBERSCHREITUNG';
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1000, height: 800 });
  const basis = 'http://localhost:8080/';

  await win.loadURL(basis + 'tests/');
  console.log('TESTS:', await warteAuf(win, "document.getElementById('ergebnis')?.textContent"));
  console.log('FEHLER:', await win.webContents.executeJavaScript("[...document.querySelectorAll('li.fehler')].map(l=>l.textContent).join(' | ') || '-'"));

  await win.loadURL(basis + 'tests/sw-pruefung.html');
  console.log('SW:', await warteAuf(win, "(t => t.startsWith('SW-') ? t : null)(document.getElementById('aus').textContent)"));

  // Offline: Netz komplett abschalten und App neu laden
  win.webContents.session.enableNetworkEmulation({ offline: true });
  await win.loadURL(basis + '#/spiel/test-raster').catch((e) => console.log('LADEN:', e.message));
  console.log('OFFLINE:', await warteAuf(win, "(() => { const i = document.querySelector('.lichter-info'); return i && i.textContent ? 'App + Spiel offline geladen: ' + i.textContent : null })()"));
  app.quit();
});
