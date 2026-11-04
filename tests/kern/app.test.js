// Prüfungen über die ganze App: Precache-Liste vollständig, keine Töne/Vibration, Registry stimmig.
import { test, wahr, gleich } from '../mini-test.js';
import { SPIELE } from '../../spiele/registry.js';

const wurzel = new URL('../../', import.meta.url);
const liste = self.SPIEL_DATEIEN || [];
const inListe = new Set(liste.map((p) => new URL(p, wurzel).href));

async function text(pfad) {
  const r = await fetch(new URL(pfad, wurzel), { cache: 'no-store' });
  if (!r.ok) throw new Error(`${pfad}: HTTP ${r.status}`);
  return r.text();
}

test('Precache: jede gelistete Datei ist erreichbar', async () => {
  wahr(liste.length > 10, 'version.js nicht geladen?');
  const fehlend = [];
  await Promise.all(liste.map(async (p) => {
    const r = await fetch(new URL(p, wurzel), { cache: 'no-store' });
    if (!r.ok) fehlend.push(p);
  }));
  gleich(fehlend.join(', '), '');
});

test('Precache: alle Importe, Worker und Stile der App sind gelistet', async () => {
  const fehlend = new Set();
  const jsDateien = liste.filter((p) => p.endsWith('.js'));
  await Promise.all(jsDateien.map(async (p) => {
    const quelle = await text(p);
    const basis = new URL(p, wurzel);
    const muster = [
      /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g,     // import … from '…'
      /import\(\s*['"]([^'"]+)['"]\s*\)/g,                      // import('…')
      /^\s*import\s*['"]([^'"]+)['"]/gm,                        // import '…'
    ];
    for (const m of muster) for (const [, ziel] of quelle.matchAll(m)) {
      const url = new URL(ziel, basis).href;
      if (!inListe.has(url)) fehlend.add(`${ziel} (in ${p})`);
    }
    // Pfade relativ zur App-Wurzel: ctx.worker('…') und ladeStil('…')
    for (const [, ziel] of quelle.matchAll(/(?:worker|ladeStil)\(\s*['"]([^'"]+\.(?:js|css))['"]/g)) {
      if (!inListe.has(new URL(ziel, wurzel).href)) fehlend.add(`${ziel} (in ${p})`);
    }
  }));
  gleich([...fehlend].join(', '), '');
});

test('Still: kein vibrate, kein Audio im App-Code', async () => {
  const treffer = [];
  await Promise.all(liste.filter((p) => p.endsWith('.js')).map(async (p) => {
    const q = await text(p);
    if (/\bvibrate\b|new\s+Audio\b|AudioContext|\.play\(\)/.test(q)) treffer.push(p);
  }));
  gleich(treffer.join(', '), '');
});

test('Registry: eindeutige IDs, verfügbare Spiele laden und passen zur Schnittstelle', async () => {
  const ids = SPIELE.map((s) => s.id);
  gleich(new Set(ids).size, ids.length, 'doppelte IDs');
  for (const s of SPIELE.filter((x) => x.laden)) {
    const modul = (await s.laden()).default;
    gleich(modul.id, s.id, `ID von ${s.id}`);
    gleich(typeof modul.erstelle, 'function', `${s.id}.erstelle`);
  }
});

test('Service Worker und Manifest sind erreichbar', async () => {
  const sw = await text('sw.js');
  wahr(sw.includes("importScripts('version.js')"));
  const manifest = JSON.parse(await text('manifest.webmanifest'));
  gleich(manifest.name, 'Spielunterhaltung');
  wahr(manifest.icons.some((i) => i.purpose === 'maskable'));
});
