// Sicherheit/Robustheit: Jedes Spiel bekommt kaputte und manipulierte Spielstände (wie aus einer
// fremden Sicherungsdatei). Es darf nicht abstürzen, kein eingeschleustes HTML anzeigen und den
// Objekt-Prototyp nicht verändern.
import { test, wahr, gleich } from '../mini-test.js';
import { SPIELE } from '../../spiele/registry.js';
import { erstelleSpeicher } from '../../kern/speicher.js';
import { erstelleEinstellungen } from '../../kern/einstellungen.js';
import { erstelleZufall, neuerSeed } from '../../kern/zufall.js';
import { erstelleFarben } from '../../kern/farben.js';
import { erstelleWorker } from '../../kern/worker-helfer.js';
import * as eingabe from '../../kern/eingabe.js';
import { falscherSpeicher } from './hilfen.js';

const BOESE = '<img src=x data-boese="1"><script data-boese="1">window.__boese=1</script>';

function falscherKontext(modul, signal) {
  const speicher = erstelleSpeicher({ backend: falscherSpeicher() });
  const einstellungen = erstelleEinstellungen(speicher);
  return {
    variante: modul.varianten?.[0]?.id ?? null,
    speicher: speicher.bereich(`${modul.id}:daten:`),
    einstellungen: Object.assign(Object.create(einstellungen), { spiel: einstellungen.spiel(modul.id) }),
    statistik: { melde() {} },
    zufall: (s, z) => erstelleZufall(s, z),
    neuerSeed,
    farben: erstelleFarben(einstellungen),
    eingabe,
    signal,
    bewegungReduziert: () => true,
    worker: (pfad) => erstelleWorker(new URL(pfad, new URL('../../', import.meta.url)), { signal }),
    meldung() {},
    meldeAenderung() {},
    meldeGewonnen() {},
    neuesSpiel() {},
  };
}

/** Spiel starten, Fehler (auch asynchrone) einsammeln */
async function starte(modul, stand, ms = 400) {
  const fehler = [];
  const beiFehler = (e) => {
    // harmlose Browser-Meldung, kein Fehler des Spiels
    if (/ResizeObserver loop/.test(e.message || '')) { e.preventDefault?.(); return; }
    fehler.push(e.error?.message || e.reason?.message || String(e.message || e.reason)); e.preventDefault?.(); };
  window.addEventListener('error', beiFehler);
  window.addEventListener('unhandledrejection', beiFehler);
  const ac = new AbortController();
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:700px';
  document.body.append(container);
  let instanz = null;
  try {
    instanz = modul.erstelle(container, falscherKontext(modul, ac.signal), stand);
    await new Promise((r) => setTimeout(r, ms));
    instanz.getStand();
    instanz.zusammenfassung?.();
  } catch (f) {
    fehler.push(f?.message || String(f));
  }
  const html = container.innerHTML;
  try { instanz?.zerstoere(); } catch (f) { fehler.push(`zerstoere: ${f.message}`); }
  ac.abort();
  container.remove();
  window.removeEventListener('error', beiFehler);
  window.removeEventListener('unhandledrejection', beiFehler);
  return { fehler, html };
}

/** Gültigen Stand eines frischen Spiels holen (wartet auf den Generator) */
async function gueltigerStand(modul) {
  const ac = new AbortController();
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:700px';
  document.body.append(container);
  const instanz = modul.erstelle(container, falscherKontext(modul, ac.signal), null);
  let stand = null;
  for (let i = 0; i < 100 && !stand; i++) { await new Promise((r) => setTimeout(r, 100)); stand = instanz.getStand(); }
  instanz.zerstoere();
  ac.abort();
  container.remove();
  return JSON.parse(JSON.stringify(stand));
}

function verdorben(gut) {
  const faelle = [null, 0, 'x', [], {}, { version: 1 }, { __proto__: null }, JSON.parse('{"__proto__":{"verseucht":1}}')];
  const werte = [BOESE, -1, 1e12, null, [], {}, [BOESE], { a: BOESE }, true, 'NaN'];
  for (const k of Object.keys(gut || {})) {
    for (const w of werte) faelle.push({ ...gut, [k]: w });
  }
  // verschachtelt: erstes Feld eines Arrays verderben
  for (const k of Object.keys(gut || {})) {
    if (Array.isArray(gut[k]) && gut[k].length) {
      faelle.push({ ...gut, [k]: [BOESE, ...gut[k].slice(1)] });
      faelle.push({ ...gut, [k]: gut[k].slice(0, 1) });
    }
  }
  faelle.push(JSON.parse(JSON.stringify(gut).replace(/"__x__"/g, '"__proto__"')));
  return faelle;
}

for (const eintrag of SPIELE.filter((s) => s.laden && !s.entwicklung)) {
  test(`Robustheit ${eintrag.id}: kaputte/manipulierte Spielstände`, async () => {
    const modul = (await eintrag.laden()).default;
    const gut = await gueltigerStand(modul);
    wahr(gut, 'kein gültiger Stand erzeugt');
    const ok = await starte(modul, gut);
    gleich(ok.fehler.join(' | '), '', 'gültiger Stand');

    const probleme = [];
    const faelle = verdorben(gut);
    for (let i = 0; i < faelle.length; i++) {
      const r = await starte(modul, faelle[i], 60);
      if (r.fehler.length) probleme.push(`Fall ${i}: ${r.fehler[0]}`);
      if (/data-boese/.test(r.html)) probleme.push(`Fall ${i}: HTML eingeschleust`);
      if (window.__boese) probleme.push(`Fall ${i}: Skript ausgeführt`);
      if (({}).verseucht) probleme.push(`Fall ${i}: Prototyp verändert`);
    }
    gleich(probleme.slice(0, 5).join(' | '), '', `${probleme.length} Probleme bei ${faelle.length} Fällen`);
  });
}
