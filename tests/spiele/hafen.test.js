import { test, gleich, tief, wahr } from '../mini-test.js';
import * as L from '../../spiele/hafen/logik.js';
import modul from '../../spiele/hafen/index.js';
import { erstelleSpeicher } from '../../kern/speicher.js';
import { erstelleEinstellungen } from '../../kern/einstellungen.js';
import { erstelleZufall, neuerSeed } from '../../kern/zufall.js';
import { erstelleFarben } from '../../kern/farben.js';
import * as eingabe from '../../kern/eingabe.js';
import { falscherSpeicher } from '../kern/hilfen.js';

/**
 * Kauf-Strategie für die Kurventests. `ebenenVorrang`: die nächste Ebene wird angespart,
 * sobald sie höchstens 400 s Einkommen kostet; sonst stets das günstigste lohnende Upgrade.
 * Liefert Wartezeiten (s) je Kauf und die Zeitpunkte der Ebenen-Freischaltungen.
 */
function spiele(anzahl, { ebenenVorrang = false, maxZeit = 6 * 3600, z = L.neuerHafen(0) } = {}) {
  const waits = [];
  const ohneEbene = [];
  const ebenen = [];
  let gesamt = 0;
  for (let i = 0; i < anzahl && gesamt < maxZeit; i++) {
    let g = L.naechstesZiel(z);
    const pe = L.preis(z, 'ebene');
    if (ebenenVorrang && pe !== null && pe <= 400 * L.einkommen(z)) g = { was: 'ebene', preis: pe };
    if (!g) break;
    let w = 0;
    while (z.geld < g.preis && w < 100000) { z = L.fortschritt(z, 1); w++; }
    z = L.kaufe(z, g.was).zustand;
    waits.push(w);
    if (g.was !== 'ebene') ohneEbene.push(w);
    gesamt += w;
    if (g.was === 'ebene') ebenen.push({ zeit: gesamt, preis: g.preis, kauf: i + 1 });
  }
  return { waits, ohneEbene, gesamt, z, ebenen };
}
const greedy = (n, opt) => spiele(n, opt);

function reich(extra = {}) {
  const z = L.neuerHafen(0);
  z.geld = 1e12;
  return Object.assign(z, extra);
}

/** Zustand mit allen Ebenen */
function vollerHafen() {
  let z = reich();
  while (z.ebenen.length < L.MAX_EBENEN) z = L.kaufe(z, 'ebene').zustand;
  return z;
}

test('Zahlen: kompakt im deutschen Format', () => {
  gleich(L.formatiere(0), '0');
  gleich(L.formatiere(5), '5');
  gleich(L.formatiere(12.5), '12,5');
  gleich(L.formatiere(999), '999');
  gleich(L.formatiere(1234), '1.234');
  gleich(L.formatiere(999999), '999.999');
  gleich(L.formatiere(1.2e6), '1,2 Mio.');
  gleich(L.formatiere(3.45e9), '3,4 Mrd.');
  gleich(L.formatiere(2e12), '2 Bio.');
  gleich(L.formatiere(NaN), '0');
  gleich(L.formatiere(Infinity), '0');
  gleich(L.formatiere(-4), '0');
  wahr(L.formatiere(1e30).includes('Quadr.'));
  gleich(L.formatiereDauer(0), 'sofort');
  gleich(L.formatiereDauer(45), '45 s');
  gleich(L.formatiereDauer(600), '10 min');
  gleich(L.formatiereDauer(7500), '2 h 5 min');
  gleich(L.formatiereDauer(Infinity), 'unbekannt');
});

test('Start: eine Ebene (Holz), Stufe 1, kein Geld, leere Lager', () => {
  const z = L.neuerHafen(1000);
  gleich(z.ebenen.length, 1);
  gleich(z.geld, 0);
  gleich(z.t, 1000);
  gleich(z.v, 2);
  gleich(L.puffer(z) + L.hauptSumme(z), 0);
  wahr(L.istGueltig(z));
  wahr(L.einkommen(z) > 0.2 && L.einkommen(z) < 2);
  gleich(L.neuerHafen(NaN).t, 0);
  gleich(L.EBENEN.length, L.MAX_EBENEN);
  for (let i = 1; i < L.EBENEN.length; i++) wahr(L.EBENEN[i].wert > L.EBENEN[i - 1].wert, 'Wert steigt');
});

test('Fortschritt: Geld wächst, Original bleibt unverändert, deterministisch', () => {
  const z = L.neuerHafen(0);
  const vorher = JSON.stringify(z);
  const a = L.fortschritt(z, 100);
  const b = L.fortschritt(z, 100);
  gleich(JSON.stringify(z), vorher);
  tief(a, b);
  wahr(a.geld > 0 && a.gesamt === a.geld);
  gleich(a.uhr, 100);
  const lang = L.fortschritt(z, 1000);
  wahr(Math.abs(lang.gesamt / 1000 - L.einkommen(z)) / L.einkommen(z) < 0.1, 'Einkommen ≈ Vorhersage');
});

test('Puffer: Ware wandert Schiff → Dock-Lager → Hauptlager → Verkauf, Mengen bleiben im Rahmen', () => {
  let z = reich();
  z = L.kaufe(L.kaufe(z, 'ebene').zustand, 'ebene').zustand;
  z.geld = 0;
  let sahLager = false;
  let sahHaupt = false;
  for (let i = 0; i < 120; i++) {
    z = L.fortschritt(z, 1);
    if (z.ebenen[0].puffer > 0.01) sahLager = true;
    if (L.hauptSumme(z) > 0.01) sahHaupt = true;
    wahr(z.ebenen[0].puffer <= L.ebenenKap(z.ebenen[0]) + 1e-9, 'Dock-Lager ≤ Kapazität');
    wahr(L.hauptSumme(z) <= L.hallenKap(z) + 1e-9, 'Hauptlager ≤ Kapazität');
  }
  wahr(sahLager && sahHaupt && z.geld > 0, 'Ware kam an allen Stationen vorbei');
  // Lader zu langsam: Dock-Lager füllt sich, der Kran wartet
  const y = L.neuerHafen(0);
  y.ebenen[0].kran = 40;
  y.ebenen[0].schiff = 40;
  const r = L.fortschritt(y, 300);
  wahr(r.ebenen[0].puffer > L.ebenenKap(r.ebenen[0]) * 0.8, `Dock-Lager voll: ${r.ebenen[0].puffer}`);
  // Hauptlager randvoll: Verkauf läuft weiter, Lager läuft nie über
  const v = L.neuerHafen(0);
  v.haupt[0] = L.hallenKap(v);
  const s = L.fortschritt(v, 30);
  wahr(L.hauptSumme(s) <= L.hallenKap(v) + 1e-9 && s.geld > 0);
});

test('Verkauf: wertvollste Ware zuerst', () => {
  const z = vollerHafen();
  z.geld = 0;
  z.ebenen = z.ebenen.slice(0, 3);
  for (const e of z.ebenen) e.puffer = 0;
  z.haupt = [10, 10, 10, 0, 0, 0, 0, 0];
  z.halle = 1;   // 3 Einheiten/s
  const r = L.fortschritt(z, 2);
  wahr(r.haupt[2] < 10, `Ebene 3 wird verkauft: ${r.haupt}`);
  wahr(r.haupt[0] >= 9.9, 'Holz bleibt liegen');
});

test('Fortschritt: kleine und große Schritte liefern fast dasselbe', () => {
  const z = greedy(15).z;
  let klein = z;
  for (let i = 0; i < 60; i++) klein = L.fortschritt(klein, 1);
  const gross = L.fortschritt(z, 60);
  wahr(Math.abs(klein.gesamt - gross.gesamt) <= Math.max(1, gross.gesamt) * 0.03, `${klein.gesamt} vs ${gross.gesamt}`);
});

test('Fortschritt: riesige dt und krumme Werte bleiben endlich und gültig', () => {
  const z = greedy(20, { ebenenVorrang: true }).z;
  for (const dt of [0, -5, NaN, Infinity, -Infinity, 1e-9, 0.1, 1e6, 1e12]) {
    const r = L.fortschritt(z, dt);
    wahr(Number.isFinite(r.geld) && r.geld >= z.geld, `dt=${dt}`);
    wahr(r.ebenen.every((e) => e.puffer >= 0 && e.p >= 0 && e.p < 1), `Ebenen dt=${dt}`);
    wahr(r.haupt.every((x) => Number.isFinite(x) && x >= 0), `Haupt dt=${dt}`);
    wahr(L.istGueltig(r), `gültig dt=${dt}`);
  }
  gleich(L.fortschritt(z, -3).geld, z.geld);
});

test('Käufe: Preis, Abbuchung, Maximum, ungültige Namen', () => {
  const z = L.neuerHafen(0);
  gleich(L.kaufe(z, 'e0:kran').grund, 'zu wenig Geld');
  for (const x of ['gibtsnicht', '__proto__', 'e9:kran', 'e1:kran', 'e0:foo', '', null, 5]) {
    gleich(L.kaufe(z, x).ok, false, String(x));
    gleich(L.preis(z, x), null, String(x));
  }
  z.geld = 1e9;
  const r = L.kaufe(z, 'e0:kran');
  wahr(r.ok);
  gleich(r.zustand.ebenen[0].kran, 2);
  gleich(r.zustand.geld, 1e9 - r.preis);
  gleich(z.ebenen[0].kran, 1, 'Original unverändert');
  let m = vollerHafen();
  gleich(L.preis(m, 'ebene'), null);
  for (const was of L.alleKaeufe(m)) {
    for (let i = 0; i < L.MAX_STUFE + 3; i++) { const k = L.kaufe(m, was); if (k.ok) m = k.zustand; }
    gleich(L.preis(m, was), null, was);
  }
  wahr(L.istGueltig(m));
  gleich(m.turm, L.MAX_STUFE);
  gleich(m.ebenen.length, L.MAX_EBENEN);
  gleich(m.ebenen[0].lotse, 1);
});

test('Ebenen: neue Ressource nur durch Kauf der nächsten Ebene, jede Ebene hat eigene Upgrades', () => {
  let z = reich();
  const p2 = L.preis(z, 'ebene');
  z = L.kaufe(z, 'ebene').zustand;
  gleich(z.ebenen.length, 2);
  const t = L.kaufe(z, 'turm').zustand;
  gleich(t.ebenen.length, 2, 'Leuchtturm schaltet keine Ressource frei');
  tief({ ...z.ebenen[1], p: 0 }, { kran: 1, schiff: 1, lager: 1, lotse: 0, p: 0, puffer: 0 });
  wahr(z.ebenen[1].p !== z.ebenen[0].p, 'Schiffsphase versetzt');
  const k = L.kaufe(z, 'e1:kran').zustand;
  gleich(k.ebenen[1].kran, 2);
  gleich(k.ebenen[0].kran, 1);
  wahr(L.preis(z, 'e1:kran') > L.preis(z, 'e0:kran'), 'höhere Ebene teurer');
  let q = reich();
  let letzt = p2;
  for (let i = 2; i < L.MAX_EBENEN; i++) {
    q = L.kaufe(q, 'ebene').zustand;
    const p = L.preis(q, 'ebene');
    if (p !== null) { wahr(p > letzt, `Ebene ${i + 1} teurer`); letzt = p; }
  }
  const e = L.einkommenDetail(vollerHafen());
  wahr(e.je.length === L.MAX_EBENEN && e.gesamt > 0);
});

test('Lotsenboot und Leuchtturm wirken auf Anlegen und Wartezeit', () => {
  const z = reich();
  const l = L.kaufe(z, 'e0:lotse').zustand;
  wahr(L.anlegenZeit(l, 0) < L.anlegenZeit(z, 0) / 2);
  const t = L.kaufe(z, 'turm').zustand;
  wahr(L.wartezeit(t, 0) < L.wartezeit(z, 0));
  wahr(L.schiffGroesse(t, 0) > L.schiffGroesse(z, 0));
  wahr(L.einkommen(l) > L.einkommen(z) && L.einkommen(t) > L.einkommen(z));
  gleich(L.kaufe(l, 'e0:lotse').ok, false, 'Lotse nur einmal');
});

test('Effekt-Vorschau: Text und Zuwachs für jeden möglichen Kauf', () => {
  const z = vollerHafen();
  z.geld = 0;
  for (const was of L.alleKaeufe(z)) {
    const ef = L.effekt(z, was);
    if (L.preis(z, was) === null) { gleich(ef, null); continue; }
    wahr(ef && typeof ef.text === 'string' && ef.text.length > 3 && Number.isFinite(ef.plus), was);
  }
  const k = L.effekt(L.neuerHafen(0), 'e0:kran');
  wahr(k.text.includes('→') && k.plus > 0);
  gleich(L.effekt(L.neuerHafen(0), 'nix'), null);
});

test('Preise: wachsen mit der Stufe, nie explodierend (≤ ×1,3 je Stufe)', () => {
  for (const was of ['e0:kran', 'e0:schiff', 'e0:lager', 'halle', 'turm']) {
    let z = reich();
    let letzt = L.preis(z, was);
    for (let i = 1; i < L.MAX_STUFE - 1; i++) {
      z = L.kaufe(z, was).zustand;
      const p = L.preis(z, was);
      wahr(p >= letzt, `${was} steigt`);
      wahr(p <= letzt * 1.3 + 1, `${was} Stufe ${i + 1}: ${letzt} → ${p}`);
      letzt = p;
    }
  }
});

test('Wachstumskurve: die ersten 30 Käufe (stets das Günstigste) liegen in den Zielgrenzen', () => {
  const { waits, gesamt } = greedy(30);
  gleich(waits.length, 30);
  wahr(Math.max(...waits) <= 180, `längste Wartezeit ${Math.max(...waits)} s`);
  wahr(Math.min(...waits) >= 3, `kürzeste Wartezeit ${Math.min(...waits)} s`);
  wahr(waits.filter((w) => w >= 15).length >= 20, 'meist 15 s oder mehr');
  wahr(gesamt <= 30 * 60 && gesamt >= 5 * 60, `Gesamtzeit ${gesamt} s`);
});

test('Wachstumskurve: Ebenen werden mit Vorrang nach etwa 1,5 bis 20 Minuten freigeschaltet, Preise steigen', () => {
  const { ebenen, ohneEbene: waits } = spiele(600, { ebenenVorrang: true, maxZeit: 60 * 60 });
  wahr(ebenen.length >= 6, `Ebenen: ${ebenen.length}`);
  let letztZeit = 0;
  let letztPreis = 0;
  for (const e of ebenen) {
    const abstand = e.zeit - letztZeit;
    wahr(abstand >= 90 && abstand <= 20 * 60, `Abstand ${Math.round(abstand)} s bei Preis ${e.preis}`);
    wahr(e.preis > letztPreis, 'Preise steigen');
    letztZeit = e.zeit;
    letztPreis = e.preis;
  }
  wahr(Math.max(...waits) <= 180, `längste Upgrade-Wartezeit ${Math.max(...waits)} s`);
});

test('Wachstumskurve: auch Günstigstes-zuerst schaltet die 2. Ebene in 3–15 Minuten frei', () => {
  const { ebenen, waits } = greedy(120);
  wahr(ebenen.length >= 1);
  wahr(ebenen[0].zeit >= 180 && ebenen[0].zeit <= 15 * 60, `2. Ebene nach ${ebenen[0].zeit} s`);
  wahr(Math.max(...waits) <= 180, `längste Wartezeit ${Math.max(...waits)} s`);
});

test('Nächstes Ziel: günstigstes lohnendes Upgrade samt Wartezeit', () => {
  const z = L.neuerHafen(0);
  const g = L.naechstesZiel(z);
  wahr(g && g.preis > 0 && g.wartezeit > 0 && Number.isFinite(g.wartezeit));
  gleich(L.naechstesZiel({ ...z, geld: g.preis }).wartezeit, 0);
  let ende = vollerHafen();
  for (const was of L.alleKaeufe(ende)) while (L.preis(ende, was) !== null) ende = L.kaufe(ende, was).zustand;
  gleich(L.naechstesZiel(ende), null);
});

test('Anschub: kleiner Schub in das Dock-Lager, Sperre verhindert Dauerklicken', () => {
  let z = L.neuerHafen(0);
  const r = L.anschub(z, 0);
  wahr(r.ok);
  gleich(r.zustand.sperre, L.ANSCHUB_PAUSE_S);
  wahr(r.zustand.ebenen[0].puffer <= L.schiffGroesse(z, 0) * 0.021 + 1e-9 && r.zustand.ebenen[0].puffer > 0);
  gleich(L.anschub(r.zustand, 0).ok, false);
  gleich(L.anschub(z, 3).ok, false, 'Ebene gibt es nicht');
  gleich(L.anschub(z, -1).ok, false);
  z = L.fortschritt(r.zustand, 2);
  gleich(z.sperre, 0);
  wahr(L.anschub(z, 0).ok);
});

test('Offline: Lücke gedeckelt (8 h) und Faktor ≤ 1', () => {
  gleich(L.luecke(0), 0);
  gleich(L.luecke(-10), 0);
  gleich(L.luecke(NaN), 0);
  gleich(L.luecke(Infinity), 0);
  gleich(L.luecke(30), 30);
  gleich(L.luecke(60), 60);
  wahr(L.luecke(120) < 120 && L.luecke(120) > 60);
  gleich(L.luecke(8 * 3600), L.luecke(30 * 3600), 'Deckel 8 h');
  gleich(L.luecke(1e12), L.luecke(8 * 3600));
  wahr(L.luecke(8 * 3600) <= 8 * 3600);
  let letzt = 0;
  for (const s of [10, 100, 1000, 10000, 30000, 90000]) { const w = L.luecke(s); wahr(w >= letzt && w <= s); letzt = w; }
});

test('Offline: Verrechnung beim Öffnen, Deckel, konsistent mit Online, kein Fortschritt bei Uhr-Unsinn', () => {
  const z = greedy(25, { ebenenVorrang: true }).z;
  z.t = 1_000_000;
  const o1 = L.offline(z, 1_000_000 + 3600_000);
  wahr(o1.gewinn > 0 && o1.dt === 3600);
  gleich(o1.zustand.t, 1_000_000 + 3600_000);
  wahr(L.istGueltig(o1.zustand), 'Stand nach Offline gültig');
  const a = L.offline(z, 1_000_000 + 8 * 3600_000);
  const b = L.offline(z, 1_000_000 + 100 * 3600_000);
  gleich(a.zustand.geld, b.zustand.geld);
  wahr(b.dt <= L.OFFLINE_MAX_S);
  gleich(L.offline(z, 500_000).gewinn, 0);
  gleich(L.offline(z, 1_000_000).gewinn, 0);
  gleich(L.offline(z, NaN).gewinn, 0);
  gleich(L.offline(z, -1).gewinn, 0);
  const online = L.fortschritt(z, 3600);
  wahr(o1.zustand.geld <= online.geld + 1e-6, 'Offline ≤ online');
  const stueckweise = (() => { let q = z; for (let i = 0; i < 36; i++) q = L.fortschritt(q, 100); return q; })();
  wahr(Math.abs(stueckweise.geld - online.geld) <= online.geld * 0.15 + 1, `${stueckweise.geld} vs ${online.geld}`);
  wahr(L.zeitPlausibel({ t: 1000 }, 2000));
  wahr(L.zeitPlausibel({ t: 2000 + 3600_000 }, 2000));
  wahr(!L.zeitPlausibel({ t: 2000 + 3 * 24 * 3600_000 }, 2000));
});

test('Zeit rückwärts: negative dt wirkt nie', () => {
  const z = greedy(8).z;
  for (const dt of [-1, -1e9, -0.0001]) tief(L.fortschritt(z, dt), z);
});

test('Spielstand: JSON-tauglich, streng validiert, alte Stände (Version 1) werden verworfen', () => {
  const z = greedy(25, { ebenenVorrang: true }).z;
  const s = JSON.parse(JSON.stringify(L.zumSpeichern(z, 5000)));
  tief(L.ausSpeicher(s), s);
  gleich(s.v, 2);
  const kopie = () => JSON.parse(JSON.stringify(s));
  const falsch = [];
  const setze = (fn) => { const k = kopie(); fn(k); falsch.push(k); };
  for (const v of [NaN, null, '5', -1, 1e31, true, [], {}]) setze((k) => { k.geld = v; });
  setze((k) => { k.gesamt = -1; });
  setze((k) => { k.t = -1; });
  setze((k) => { k.t = 5e12; });
  setze((k) => { k.uhr = -3; });
  setze((k) => { k.sperre = 99; });
  setze((k) => { k.v = 1; });
  setze((k) => { k.v = 3; });
  setze((k) => { delete k.v; });
  setze((k) => { k.ebenen = []; });
  setze((k) => { k.ebenen = 'x'; });
  setze((k) => { k.ebenen = Array.from({ length: L.MAX_EBENEN + 1 }, () => k.ebenen[0]); });
  setze((k) => { k.ebenen[0] = null; });
  setze((k) => { k.ebenen[0] = []; });
  setze((k) => { k.ebenen[0].kran = 0; });
  setze((k) => { k.ebenen[0].schiff = L.MAX_STUFE + 1; });
  setze((k) => { k.ebenen[0].lager = 1.5; });
  setze((k) => { k.ebenen[0].lotse = 2; });
  setze((k) => { k.ebenen[0].p = 1; });
  setze((k) => { k.ebenen[0].p = -0.1; });
  setze((k) => { k.ebenen[0].p = NaN; });
  setze((k) => { k.ebenen[0].puffer = -1; });
  setze((k) => { k.ebenen[0].puffer = 1e6; });
  setze((k) => { k.ebenen[0].puffer = NaN; });
  setze((k) => { k.halle = 0; });
  setze((k) => { k.halle = L.MAX_STUFE + 1; });
  setze((k) => { k.turm = 0; });
  setze((k) => { k.haupt = [0]; });
  setze((k) => { k.haupt = 'abc'; });
  setze((k) => { k.haupt[0] = -1; });
  setze((k) => { k.haupt[0] = NaN; });
  setze((k) => { k.haupt[0] = 1e9; });
  setze((k) => { k.haupt[7] = 1; k.ebenen = k.ebenen.slice(0, 1); });
  for (const f of falsch) gleich(L.istGueltig(f), false, JSON.stringify(f).slice(0, 90));
  for (const f of [null, undefined, 0, 'x', [], {}, true, 12, () => 1]) gleich(L.istGueltig(f), false, String(f));
  const mit = kopie();
  mit.extra = '<b>x</b>';
  mit.ebenen[0].extra = 1;
  const sauber = L.ausSpeicher(mit);
  gleich('extra' in sauber, false);
  gleich('extra' in sauber.ebenen[0], false);
  const alt = { v: 1, t: 1, uhr: 0, sperre: 0, geld: 5, gesamt: 5, docks: [{ f: 0, p: 0 }], kran: { tempo: 1, kap: 1 }, halle: 1, schiff: { groesse: 1, haeufig: 1 }, turm: 1, lotse: 0, lager: [0, 0, 0] };
  gleich(L.istGueltig(alt), false);
  gleich(modul.standVersion, 2);
});

test('Spielstand: Zufallsbelastung (Fuzz) wirft nie etwas anderes als einen Fehler', () => {
  const gut = JSON.parse(JSON.stringify(L.zumSpeichern(greedy(10).z, 1)));
  const werte = [NaN, Infinity, -Infinity, null, undefined, '1', [], {}, true, 0, -1, 1e300, 0.5];
  for (const k of Object.keys(gut)) {
    for (const w of werte) {
      try { L.ausSpeicher({ ...gut, [k]: w }); } catch (e) { wahr(e instanceof Error); }
    }
  }
});

// ---------- Oberfläche ----------
function falscherKontext(signal, zaehler = {}) {
  const speicher = erstelleSpeicher({ backend: falscherSpeicher() });
  const einstellungen = erstelleEinstellungen(speicher);
  return {
    variante: 'standard',
    speicher: speicher.bereich('hafen:daten:'),
    einstellungen: Object.assign(Object.create(einstellungen), { spiel: einstellungen.spiel('hafen') }),
    statistik: { melde() {} },
    zufall: (s, z) => erstelleZufall(s, z),
    neuerSeed,
    farben: erstelleFarben(einstellungen),
    eingabe,
    signal,
    bewegungReduziert: () => zaehler.still ?? false,
    worker: () => { throw new Error('kein Worker'); },
    meldung(t) { zaehler.meldungen = (zaehler.meldungen || 0) + 1; zaehler.letzte = t; },
    meldeAenderung() { zaehler.aenderungen = (zaehler.aenderungen || 0) + 1; },
    meldeGewonnen() {},
    neuesSpiel() {},
  };
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function mit(stand, fn, zaehler = {}) {
  const ac = new AbortController();
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;height:700px';
  document.body.append(container);
  const instanz = modul.erstelle(container, falscherKontext(ac.signal, zaehler), stand);
  try { return await fn(instanz, container); } finally {
    instanz.zerstoere();
    ac.abort();
    container.remove();
  }
}

test('Modul: Metadaten', () => {
  gleich(modul.id, 'hafen');
  gleich(modul.name, 'Hafen');
  gleich(modul.standVersion, 2);
  tief(modul.varianten, [{ id: 'standard', name: 'Standard' }]);
});

test('Oberfläche: frischer Start, feste Geldleiste, Rückgängig gibt es nicht, Stand JSON-tauglich', async () => {
  await mit(null, async (i, c) => {
    gleich(c.querySelectorAll('.ha-ebene').length, 1);
    wahr(c.querySelector('.ha-leiste .ha-geld-wert') && c.querySelector('.ha-leiste .ha-rate') && c.querySelector('.ha-leiste .ha-ziel-text'), 'Leiste mit Geld, Einkommen, Ziel');
    // Upgrades liegen in der Ebenen-Karte, nicht in einer langen Liste
    gleich(c.querySelectorAll('.ha-ebene .ha-kauf').length, 4);
    gleich(c.querySelectorAll('.ha-anlagen .ha-kauf').length, 2);
    gleich(c.querySelectorAll('.ha-ebene .ha-messer').length, 3, 'Schiff, Dock-Lager, Verkauf');
    gleich(i.kannRueckgaengig(), false);
    gleich(i.rueckgaengig(), false);
    const st = i.getStand();
    tief(JSON.parse(JSON.stringify(st)), st);
    wahr(L.istGueltig(st));
    wahr(i.zusammenfassung().includes('Münzen'));
    wahr(c.querySelector('.ha-weg').hidden, 'kein Abwesenheitshinweis beim Neustart');
    for (const b of c.querySelectorAll('.ha-kauf')) {
      wahr(b.getAttribute('aria-label'), 'aria-label');
      gleich(b.tagName, 'BUTTON');
    }
    wahr(c.querySelector('.ha-schiff').getAttribute('aria-label'));
    wahr(c.querySelector('.ha-ebene .ha-kauf-wirkung').textContent.includes('→'), 'Effekt-Vorschau');
  });
});

test('Oberfläche: Knöpfe und Anzeigen werden pro Tick nicht neu aufgebaut (Klicks gehen nicht verloren)', async () => {
  await mit(null, async (i, c) => {
    const knoten = [...c.querySelectorAll('button, .ha-balken, .ha-zahl')];
    const kranKnopf = c.querySelector('[data-was="e0:kran"]');
    wahr(knoten.length > 8);
    await warte(900);
    const danach = [...c.querySelectorAll('button, .ha-balken, .ha-zahl')];
    gleich(danach.length, knoten.length);
    wahr(knoten.every((k, n) => k === danach[n]), 'gleiche Knoten');
    gleich(c.querySelector('[data-was="e0:kran"]'), kranKnopf);
    // Kaufen mitten im Tick-Betrieb: Klick wirkt, Knopf bleibt derselbe
    const z = L.neuerHafen(Date.now());
    z.geld = 1e6;
    await mit(L.zumSpeichern(z, Date.now()), async (j, d) => {
      const kn = d.querySelector('[data-was="e0:kran"]');
      await warte(450);
      kn.click();
      await warte(450);
      kn.click();
      gleich(j.getStand().ebenen[0].kran, 3);
      gleich(d.querySelector('[data-was="e0:kran"]'), kn);
    });
  });
});

test('Oberfläche: zu teure Knöpfe sind aria-disabled; Kaufen zieht Geld ab und meldet die Änderung', async () => {
  const z = L.neuerHafen(Date.now());
  z.geld = L.preis(z, 'e0:kran') + 1;
  const zaehler = {};
  await mit(L.zumSpeichern(z, Date.now()), async (i, c) => {
    const kran = c.querySelector('[data-was="e0:kran"]');
    const lotse = c.querySelector('[data-was="e0:lotse"]');
    gleich(kran.getAttribute('aria-disabled'), 'false');
    gleich(lotse.getAttribute('aria-disabled'), 'true');
    lotse.click();
    gleich(i.getStand().ebenen[0].lotse, 0, 'zu teuer → nichts gekauft');
    wahr((zaehler.meldungen || 0) >= 1, 'Hinweis „zu wenig Münzen“');
    kran.click();
    gleich(i.getStand().ebenen[0].kran, 2);
    wahr(i.getStand().geld < z.geld, 'Geld abgebucht');
    wahr((zaehler.aenderungen || 0) >= 1, 'meldeAenderung');
    wahr(c.querySelector('[data-was="e0:kran"] .ha-kauf-stufe').textContent.includes('2'));
  }, zaehler);
});

test('Oberfläche: Taste K kauft das Nächste Ziel; andere Tasten gehören der Shell', async () => {
  const z = L.neuerHafen(Date.now());
  z.geld = 100;
  await mit(L.zumSpeichern(z, Date.now()), async (i) => {
    gleich(i.onTaste({ key: 'z' }), false);
    gleich(i.onTaste({ key: 'n' }), false);
    gleich(i.onTaste({ key: 'k', ctrlKey: true }), false);
    gleich(i.onTaste({ key: 'k' }), true);
    wahr(i.getStand().geld < 100);
  });
});

test('Oberfläche: neue Ebene erscheint nach dem Kauf mit eigener Karte; Antippen gibt Schub; Neuer Hafen', async () => {
  const z = L.neuerHafen(Date.now());
  z.geld = 1e6;
  await mit(L.zumSpeichern(z, Date.now()), async (i, c) => {
    c.querySelector('[data-was="ebene"]').click();
    gleich(c.querySelectorAll('.ha-ebene').length, 2);
    gleich(c.querySelectorAll('.ha-ebene .ha-kauf').length, 8);
    wahr(c.querySelectorAll('.ha-ebene')[1].textContent.includes('Fisch'));
    c.querySelector('[data-was="e1:kran"]').click();
    gleich(i.getStand().ebenen[1].kran, 2);
    c.querySelector('.ha-schiff').click();
    wahr(i.getStand().sperre > 0, 'Schub ausgelöst');
    await warte(700);
    wahr(i.getStand().geld !== 1e6, 'Tick rechnet');
    i.neu();
    gleich(c.querySelectorAll('.ha-ebene').length, 1, 'Neuer Hafen');
    gleich(i.getStand().geld, 0);
  });
});

test('Oberfläche: Abwesenheit wird beim Öffnen verrechnet und angezeigt', async () => {
  const z = greedy(10).z;
  const jetzt = Date.now();
  const vorher = z.geld;
  await mit(L.zumSpeichern(z, jetzt - 3 * 3600_000), async (i, c) => {
    wahr(!c.querySelector('.ha-weg').hidden, 'Hinweis sichtbar');
    wahr(c.querySelector('.ha-weg-text').textContent.startsWith('Während du weg warst'));
    wahr(i.getStand().geld > vorher);
    c.querySelector('.ha-weg .knopf').click();
    wahr(c.querySelector('.ha-weg').hidden, 'Hinweis schließbar');
  });
  await mit(L.zumSpeichern(z, jetzt + 5 * 24 * 3600_000), async (i, c) => {
    gleich(i.getStand().geld, 0);
    wahr(c.querySelector('.ha-weg').hidden);
  });
  await mit(L.zumSpeichern(z, jetzt + 3600_000), async (i, c) => {
    wahr(i.getStand().geld < vorher + 5 * L.einkommen(z));
    wahr(c.querySelector('.ha-weg').hidden);
  });
});

test('Oberfläche: bewegungReduziert schaltet die Dauerbewegung ab (Klasse ha-still)', async () => {
  await mit(null, async (i, c) => { wahr(!c.querySelector('.ha').classList.contains('ha-still')); }, { still: false });
  await mit(null, async (i, c) => {
    wahr(c.querySelector('.ha').classList.contains('ha-still'));
    gleich(c.querySelector('.ha-schiff').style.getPropertyValue('--x'), '0');
  }, { still: true });
});

test('Oberfläche: Pause und Fortsetzen (versteckter Tab) rechnen nach', async () => {
  const z = greedy(10).z;
  await mit(L.zumSpeichern(z, Date.now()), async (i) => {
    i.pausiere();
    const g = i.getStand().geld;
    i.fortsetze();
    wahr(i.getStand().geld >= g);
    i.zerstoere();
    i.fortsetze();
  });
});

// Kaputte/manipulierte Spielstände (wie kern/robustheit.test.js, hier direkt für dieses Spiel)
const BOESE = '<img src=x data-boese="1"><script data-boese="1">window.__boese=1</script>';
test('Robustheit: kaputte und manipulierte Spielstände', async () => {
  const gut = JSON.parse(JSON.stringify(L.zumSpeichern(greedy(12).z, Date.now())));
  const faelle = [null, 0, 'x', [], {}, { version: 1 }, { __proto__: null }, JSON.parse('{"__proto__":{"verseucht":1}}')];
  const werte = [BOESE, -1, 1e12, null, [], {}, [BOESE], { a: BOESE }, true, 'NaN'];
  for (const k of Object.keys(gut)) for (const w of werte) faelle.push({ ...gut, [k]: w });
  faelle.push({ ...gut, ebenen: [BOESE] });
  faelle.push({ ...gut, ebenen: [{ kran: BOESE, schiff: 1, lager: 1, lotse: 0, p: 0, puffer: 0 }] });
  const probleme = [];
  for (let n = 0; n < faelle.length; n++) {
    try {
      await mit(faelle[n], async (i, c) => {
        await warte(20);
        i.getStand(); i.zusammenfassung();
        if (/data-boese/.test(c.innerHTML)) probleme.push(`Fall ${n}: HTML`);
      });
    } catch (f) { probleme.push(`Fall ${n}: ${f.message}`); }
  }
  wahr(!window.__boese && !({}).verseucht);
  gleich(probleme.slice(0, 4).join(' | '), '', `${probleme.length} Probleme bei ${faelle.length} Fällen`);
});

test('Still: kein vibrate/Audio/eval/innerHTML, kein Zufall, keine Inline-Styles als Text', async () => {
  for (const d of ['index.js', 'logik.js']) {
    const q = await fetch(new URL(`../../spiele/hafen/${d}`, import.meta.url)).then((r) => r.text());
    wahr(!/\bvibrate\b|new\s+Audio\b|AudioContext|\.play\(\)|\beval\(|new Function|innerHTML|cssText|setAttribute\(\s*'style'/.test(q), d);
    wahr(!/Math\.random|requestAnimationFrame/.test(q), `${d}: kein Zufall, kein rAF`);
  }
  const l = await fetch(new URL('../../spiele/hafen/logik.js', import.meta.url)).then((r) => r.text());
  wahr(!/Date\.now|new Date|performance\.now/.test(l), 'logik.js: keine Uhr (Zeit kommt als Parameter)');
  const css = await fetch(new URL('../../spiele/hafen/stil.css', import.meta.url)).then((r) => r.text());
  wahr(!/#[0-9a-f]{3,8}\b/i.test(css), 'keine festen Farben im CSS');
  wahr(/position:\s*sticky/.test(css), 'feste Geldleiste');
});
