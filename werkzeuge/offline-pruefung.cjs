// Unsichtbarer Chromium (Electron) prüft: Tests, Service Worker, Offline-Start der App.
// Nötig, weil das Browser-Fenster in Claude keine Service Worker kann und kein Edge/Chrome da ist.
// Voraussetzung: Testserver läuft auf Port 8080 (werkzeuge\server.ps1). Aufruf (PowerShell):
//   & "..\anime-tracker\node_modules\electron\dist\electron.exe" werkzeuge\offline-pruefung.cjs
// Vorzeitig geschlossene Ausgabe (z. B. „| Select-Object -First 3“) darf keine Fehlermeldung auslösen
for (const strom of [process.stdout, process.stderr]) strom.on('error', () => {});
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
  // andere Adresse prüfen (z. B. die veröffentlichte): $env:PRUEF_BASIS = 'https://…/spielunterhaltung/'
  const basis = process.env.PRUEF_BASIS || 'http://localhost:8080/';

  await win.loadURL(basis + 'tests/');
  console.log('TESTS:', await warteAuf(win, "document.getElementById('ergebnis')?.textContent", 180000));
  console.log('FEHLER:', await win.webContents.executeJavaScript("[...document.querySelectorAll('li.fehler')].map(l=>l.textContent).join(' | ') || '-'"));

  await win.loadURL(basis + 'tests/sw-pruefung.html');
  console.log('SW:', await warteAuf(win, "(t => t.startsWith('SW-') ? t : null)(document.getElementById('aus').textContent)"));

  // Offline: Netz komplett abschalten und App neu laden
  win.webContents.session.enableNetworkEmulation({ offline: true });
  await win.loadURL(basis + '#/spiel/test-raster').catch((e) => console.log('LADEN:', e.message));
  await new Promise((ok) => setTimeout(ok, 700)); await win.webContents.executeJavaScript("document.querySelector('dialog[open] .dialog-fuss .knopf')?.click()").catch(() => {}); // Auswahl beim ersten Start: Standard
  console.log('OFFLINE:', await warteAuf(win, "(() => { const i = document.querySelector('.lichter-info'); return i && i.textContent ? 'App + Spiel offline geladen: ' + i.textContent : null })()"));
  // Alle Spiele offline öffnen: Spielfläche gefüllt, keine Fehlermeldung, keine dauerhafte Warte-Anzeige
  for (const id of ['sudoku', 'farben-sortieren', 'block-puzzle', 'stau', 'minesweeper', 'nonogramm', 'bild-abtragen', 'sechseck-stapel', 'rechenkreuz', 'wortsuche', 'malen-nach-zahlen', 'punkte-verbinden', 'schrauben', 'schachtbetrieb', 'lichtstrahlen', 'hafen', 'solitaer', 'ziegelbruch', 'blasenschuss']) {
    await win.webContents.executeJavaScript(`location.hash = '#/spiel/${id}'`);
    await new Promise((ok) => setTimeout(ok, 700)); await win.webContents.executeJavaScript("document.querySelector('dialog[open] .dialog-fuss .knopf')?.click()").catch(() => {}); // Auswahl beim ersten Start: Standard
    const r = await warteAuf(win, `(() => {
      const f = document.getElementById('spielflaeche');
      if (!f || !f.children.length) return null;
      if (document.querySelector('.fehler-text')) return 'FEHLER: ' + document.querySelector('.fehler-text').textContent;
      if (document.querySelector('.warten') && !document.querySelector('.warten').hidden) return null;
      return 'ok (' + f.querySelectorAll('*').length + ' Elemente)';
    })()`, 30000);
    // kurz warten (Generator im Worker) und dann den fertigen Inhalt zählen
    await new Promise((ok) => setTimeout(ok, 4000));
    const danach = await win.webContents.executeJavaScript(`({
      elemente: document.getElementById('spielflaeche')?.querySelectorAll('*').length ?? 0,
      wartet: !(document.querySelector('.warten')?.hidden ?? true),
      text: (document.getElementById('spielflaeche')?.innerText || '').replace(/\\s+/g, ' ').slice(0, 70),
    })`).catch(() => null);
    console.log(`OFFLINE ${id}:`, r || 'ZEITÜBERSCHREITUNG', '→ nach 4 s:', JSON.stringify(danach));
    await win.webContents.executeJavaScript(`location.hash = '#/'`);
    await new Promise((ok) => setTimeout(ok, 300));
  }
  app.quit();
});
