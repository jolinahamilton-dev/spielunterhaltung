// Selbsttest der Desktop-App: öffnet alle Spiele, prüft auf Fehler, macht Screenshots und beendet sich.
// Aufruf (PowerShell, im Projektordner):
//   $env:SPIEL_SELBSTTEST = "$env:TEMP\desktop-test"; & "..\anime-tracker\node_modules\electron\dist\electron.exe" .
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

module.exports = async function selbsttest(win, ordner) {
  fs.mkdirSync(ordner, { recursive: true });
  const fehler = [];
  win.webContents.on('console-message', (d) => {
    if ((d.level === 'error' || d.level === 3) && !/Electron Security Warning/.test(d.message)) fehler.push(d.message);
  });
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => win.webContents.executeJavaScript(code);
  const bild = async (name) => {
    win.webContents.invalidate();
    await warte(600);
    fs.writeFileSync(path.join(ordner, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };

  await new Promise((r) => (win.webContents.isLoading() ? win.webContents.once('did-finish-load', r) : r()));
  await warte(1500);
  console.log('START:', JSON.stringify(await js(`({ url: location.href, titel: document.title, kacheln: document.querySelectorAll('.kachel').length, version: self.SPIEL_VERSION })`)));
  await bild('start');

  for (const id of ['sudoku', 'farben-sortieren', 'block-puzzle', 'stau', 'minesweeper', 'nonogramm']) {
    await js(`location.hash = '#/spiel/${id}'`);
    // Auswahl beim ersten Start: warten, bis sie da ist, dann „Standard nehmen“
    for (let i = 0; i < 20; i++) {
      await warte(200);
      if (await js("(() => { const k = document.querySelector('dialog[open] .dialog-fuss .knopf'); if (k) k.click(); return !!k; })()")) break;
    }
    await warte(5000);
    const r = await js(`({ hash: location.hash, h1: document.querySelector('h1')?.textContent, dialoge: [...document.querySelectorAll('dialog')].map(d => (d.open ? 'offen:' : 'zu:') + d.querySelector('h2')?.textContent),
      elemente: document.getElementById('spielflaeche')?.querySelectorAll('*').length ?? 0,
      fehler: document.querySelector('.fehler-text')?.textContent ?? null,
      wartet: !(document.querySelector('.warten')?.hidden ?? true) })`);
    console.log(`SPIEL ${id}:`, JSON.stringify(r));
    await bild(id);
  }
  // Speichern bleibt erhalten?
  await js(`location.hash = '#/'`);
  await warte(800);
  console.log('SPEICHER:', JSON.stringify(await js(`Object.keys(localStorage).filter(k => k.startsWith('spielunterhaltung:')).length`)));
  // Sicherheit: Dateien außerhalb der freigegebenen Ordner dürfen nicht ladbar sein
  console.log('SPERRE:', JSON.stringify(await js(`Promise.all(['plan.md', 'package.json', 'desktop/main.cjs', '../package.json', 'tests/index.html', 'kern/app.js']
    .map(p => fetch(p).then(r => p + ' ' + r.status).catch(() => p + ' blockiert')))`)));
  console.log('NODE IM FENSTER:', JSON.stringify(await js(`typeof require + ' / ' + typeof process`)));
  console.log('KONSOLENFEHLER:', fehler.length ? fehler.slice(0, 5).join(' | ') : '-');
  app.quit();
};
