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
 * Kauf-Strategie für die Kurventests. `dockVorrang`: das nächste Dock wird angespart,
 * sobald es höchstens 400 s Einkommen kostet; sonst stets das günstigste lohnende Upgrade.
 * Liefert Wartezeiten (s) je Kauf und die Zeitpunkte der Dock-Käufe.
 */
function spiele(anzahl, { dockVorrang = false, maxZeit = 6 * 3600, z = L.neuerHafen(0) } = {}) {
  const waits = [];
  const ohneDock = [];
  const docks = [];
  let gesamt = 0;
  for (let i = 0; i < anzahl && gesamt < maxZeit; i++) {
    let g = L.naechstesZiel(z);
    const pn = L.preis(z, 'neu');
    if (dockVorrang && pn !== null && pn <= 400 * L.einkommen(z)) g = { was: 'neu', preis: pn };
    if (!g) break;
    let w = 0;
    while (z.geld < g.preis && w < 100000) { z = L.fortschritt(z, 1); w++; }
    z = L.kaufe(z, g.was).zustand;
    waits.push(w);
    gesamt += w;
    if (g.was === 'neu') docks.push({ zeit: gesamt, preis: g.preis, kauf: i + 1 });
    else ohneDock.push(w);
  }
  return { waits, ohneDock, gesamt, z, docks };
}
const greedy = (n, opt) => spiele(n, opt);

function reich(extra = {}) {
  const z = L.neuerHafen(0);
  z.geld = 1e12;
  return Object.assign(z, extra);
}

/** Zustand mit allen Docks */
function vollerHafen() {
  let z = reich();
  while (z.docks.length < L.MAX_DOCKS) z = L.kaufe(z, 'neu').zustand;
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

test('Start: ein Dock (Holz), Stufe 1, kein Geld, leere Lager', () => {
  const z = L.neuerHafen(1000);
  gleich(z.docks.length, 1);
  gleich(z.geld, 0);
  gleich(z.t, 1000);
  gleich(z.v, L.STAND_VERSION);
  gleich(L.puffer(z) + L.hauptSumme(z), 0);
  wahr(L.istGueltig(z));
  wahr(L.einkommen(z) > 0.2 && L.einkommen(z) < 2);
  gleich(L.neuerHafen(NaN).t, 0);
  gleich(L.EBENEN.length, L.MAX_DOCKS);
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

test('Puffer: Ware wandert Schiff → Dock-Lager → Kran → Hauptlager → Verkauf, Mengen bleiben im Rahmen', () => {
  let z = reich();
  z = L.kaufe(L.kaufe(z, 'neu').zustand, 'neu').zustand;
  z.geld = 0;
  let sahLager = false;
  let sahHaupt = false;
  for (let i = 0; i < 120; i++) {
    z = L.fortschritt(z, 1);
    if (L.puffer(z) > 0.01) sahLager = true;
    if (L.hauptSumme(z) > 0.01) sahHaupt = true;
    for (const d of z.docks) wahr(d.puffer <= L.dockKap(d) + 1e-9, 'Dock-Lager ≤ Kapazität');
    wahr(L.hauptSumme(z) <= L.hallenKap(z) + 1e-9, 'Hauptlager ≤ Kapazität');
  }
  wahr(sahLager && sahHaupt && z.geld > 0, 'Ware kam an allen Stationen vorbei');
  // Kran zu langsam: Dock-Lager füllt sich, das Entladen wartet
  const y = L.neuerHafen(0);
  y.docks[0].stufe = 40;
  const r = L.fortschritt(y, 300);
  wahr(r.docks[0].puffer > L.dockKap(r.docks[0]) * 0.5, `Dock-Lager voll: ${r.docks[0].puffer}`);
  // Hauptlager randvoll: Verkauf läuft weiter, Lager läuft nie über
  const v = L.neuerHafen(0);
  v.haupt[0] = L.hallenKap(v);
  const s = L.fortschritt(v, 30);
  wahr(L.hauptSumme(s) <= L.hallenKap(v) + 1e-9 && s.geld > 0);
});

test('Verkauf: wertvollste Ware zuerst', () => {
  const z = vollerHafen();
  z.geld = 0;
  z.docks = z.docks.slice(0, 3);
  for (const d of z.docks) d.puffer = 0;
  z.haupt = [10, 10, 10, 0, 0, 0, 0, 0];
  z.verkauf = 1;   // 1 Einheit/s
  z.kran = 1;
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
  const z = greedy(20, { dockVorrang: true }).z;
  for (const dt of [0, -5, NaN, Infinity, -Infinity, 1e-9, 0.1, 1e6, 1e12]) {
    const r = L.fortschritt(z, dt);
    wahr(Number.isFinite(r.geld) && r.geld >= z.geld, `dt=${dt}`);
    wahr(r.docks.every((d) => d.puffer >= 0 && d.p >= 0 && d.p < 1), `Docks dt=${dt}`);
    wahr(r.haupt.every((x) => Number.isFinite(x) && x >= 0), `Haupt dt=${dt}`);
    wahr(L.istGueltig(r), `gültig dt=${dt}`);
  }
  gleich(L.fortschritt(z, -3).geld, z.geld);
});

test('Käufe: Preis, Abbuchung, Maximum, ungültige Namen', () => {
  const z = L.neuerHafen(0);
  gleich(L.kaufe(z, 'd0').grund, 'zu wenig Geld');
  for (const x of ['gibtsnicht', '__proto__', 'd9', 'd1', 'dock', 'e0:kran', '', null, 5]) {
    gleich(L.kaufe(z, x).ok, false, String(x));
    gleich(L.preis(z, x), null, String(x));
  }
  z.geld = 1e9;
  const r = L.kaufe(z, 'd0');
  wahr(r.ok);
  gleich(r.zustand.docks[0].stufe, 2);
  gleich(r.zustand.geld, 1e9 - r.preis);
  gleich(z.docks[0].stufe, 1, 'Original unverändert');
  let m = vollerHafen();
  gleich(L.preis(m, 'neu'), null);
  for (const was of L.alleKaeufe(m)) {
    for (let i = 0; i < L.MAX_STUFE + 3; i++) { const k = L.kaufe(m, was); if (k.ok) m = k.zustand; }
    gleich(L.preis(m, was), null, was);
  }
  wahr(L.istGueltig(m));
  gleich(m.kran, L.MAX_STUFE);
  gleich(m.verkauf, L.MAX_STUFE);
  gleich(m.docks.length, L.MAX_DOCKS);
  // pro Station genau ein Upgrade: dN, kran, verkauf, neu
  gleich(L.alleKaeufe(L.neuerHafen(0)).join(), 'd0,kran,verkauf,neu');
});

test('Docks: jedes Dock ist eine eigene Ressource, Stufen wirken auf Schiff, Entladen und Lager', () => {
  let z = reich();
  const p2 = L.preis(z, 'neu');
  z = L.kaufe(z, 'neu').zustand;
  gleich(z.docks.length, 2);
  tief({ ...z.docks[1], p: 0 }, { stufe: 1, p: 0, puffer: 0 });
  wahr(z.docks[1].p !== z.docks[0].p, 'Schiffsphase versetzt');
  const k = L.kaufe(z, 'd1').zustand;
  gleich(k.docks[1].stufe, 2);
  gleich(k.docks[0].stufe, 1);
  wahr(L.schiffGroesse(k.docks[1]) > L.schiffGroesse(z.docks[1]));
  wahr(L.entladeRate(k.docks[1]) > L.entladeRate(z.docks[1]));
  wahr(L.dockKap(k.docks[1]) > L.dockKap(z.docks[1]));
  wahr(L.anlegenZeit(k.docks[1]) < L.anlegenZeit(z.docks[1]), 'Lotsen-Effekt in der Dockstufe');
  wahr(L.preis(z, 'd1') > L.preis(z, 'd0'), 'höheres Dock teurer');
  let q = reich();
  let letzt = p2;
  for (let i = 2; i < L.MAX_DOCKS; i++) {
    q = L.kaufe(q, 'neu').zustand;
    const p = L.preis(q, 'neu');
    if (p !== null) { wahr(p > letzt, `Dock ${i + 1} teurer`); letzt = p; }
  }
  wahr(L.einkommenDetail(vollerHafen()).gesamt > 0);
});

test('Kran und Verkauf: je eine Stufe für alle', () => {
  const z = vollerHafen();
  z.kran = 1; z.verkauf = 1;
  const k = L.kaufe(z, 'kran').zustand;
  wahr(L.transportRate(k) > L.transportRate(z));
  const v = L.kaufe(z, 'verkauf').zustand;
  wahr(L.verkaufsRate(v) > L.verkaufsRate(z) && L.hallenKap(v) > L.hallenKap(z));
  wahr(L.reichweite(v) >= L.reichweite(z), 'Leuchtturm an die Verkaufsstufe gekoppelt');
  wahr(L.einkommen(k) >= L.einkommen(z) && L.einkommen(v) >= L.einkommen(z));
});

test('Effekt-Vorschau: Text und Zuwachs für jeden möglichen Kauf', () => {
  const z = vollerHafen();
  z.geld = 0;
  for (const was of L.alleKaeufe(z)) {
    const ef = L.effekt(z, was);
    if (L.preis(z, was) === null) { gleich(ef, null); continue; }
    wahr(ef && typeof ef.text === 'string' && ef.text.length > 3 && Number.isFinite(ef.plus), was);
  }
  const k = L.effekt(L.neuerHafen(0), 'd0');
  wahr(k.text.includes('→') && k.plus > 0);
  gleich(L.effekt(L.neuerHafen(0), 'nix'), null);
});

test('Preise: wachsen mit der Stufe, nie explodierend (≤ ×1,3 je Stufe)', () => {
  for (const was of ['d0', 'd1', 'kran', 'verkauf']) {
    let z = reich();
    z = L.kaufe(z, 'neu').zustand;
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

test('Wachstumskurve: neue Docks mit Vorrang nach 1,5 bis 20 Minuten Abstand, Preise steigen', () => {
  const { docks, ohneDock } = spiele(600, { dockVorrang: true, maxZeit: 60 * 60 });
  wahr(docks.length >= 6, `Docks: ${docks.length}`);
  let letztZeit = 0;
  let letztPreis = 0;
  for (const e of docks) {
    const abstand = e.zeit - letztZeit;
    wahr(abstand >= 90 && abstand <= 20 * 60, `Abstand ${Math.round(abstand)} s bei Preis ${e.preis}`);
    wahr(e.preis > letztPreis, 'Preise steigen');
    letztZeit = e.zeit;
    letztPreis = e.preis;
  }
  wahr(Math.max(...ohneDock) <= 180, `längste Upgrade-Wartezeit ${Math.max(...ohneDock)} s`);
});

test('Wachstumskurve: auch Günstigstes-zuerst schaltet das 2. Dock in 3–15 Minuten frei', () => {
  const { docks, waits } = greedy(90);
  wahr(docks.length >= 1);
  wahr(docks[0].zeit >= 180 && docks[0].zeit <= 15 * 60, `2. Dock nach ${docks[0].zeit} s`);
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
  wahr(r.zustand.docks[0].puffer <= L.schiffGroesse(z.docks[0]) * 0.021 + 1e-9 && r.zustand.docks[0].puffer > 0);
  gleich(L.anschub(r.zustand, 0).ok, false);
  gleich(L.anschub(z, 3).ok, false, 'Dock gibt es nicht');
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
  const z = greedy(25, { dockVorrang: true }).z;
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

test('Spielstand: JSON-tauglich, streng validiert, alte Stände werden verworfen', () => {
  const z = greedy(25, { dockVorrang: true }).z;
  const s = JSON.parse(JSON.stringify(L.zumSpeichern(z, 5000)));
  tief(L.ausSpeicher(s), s);
  gleich(s.v, L.STAND_VERSION);
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
  setze((k) => { k.v = 2; });
  setze((k) => { k.v = 5; });
  setze((k) => { delete k.v; });
  setze((k) => { k.docks = []; });
  setze((k) => { k.docks = 'x'; });
  setze((k) => { k.docks = Array.from({ length: L.MAX_DOCKS + 1 }, () => k.docks[0]); });
  setze((k) => { k.docks[0] = null; });
  setze((k) => { k.docks[0] = []; });
  setze((k) => { k.docks[0].stufe = 0; });
  setze((k) => { k.docks[0].stufe = L.MAX_STUFE + 1; });
  setze((k) => { k.docks[0].stufe = 1.5; });
  setze((k) => { k.docks[0].p = 1; });
  setze((k) => { k.docks[0].p = -0.1; });
  setze((k) => { k.docks[0].p = NaN; });
  setze((k) => { k.docks[0].puffer = -1; });
  setze((k) => { k.docks[0].puffer = 1e6; });
  setze((k) => { k.docks[0].puffer = NaN; });
  setze((k) => { k.kran = 0; });
  setze((k) => { k.kran = L.MAX_STUFE + 1; });
  setze((k) => { k.verkauf = 0; });
  setze((k) => { k.verkauf = '3'; });
  setze((k) => { k.haupt = [0]; });
  setze((k) => { k.haupt = 'abc'; });
  setze((k) => { k.haupt[0] = -1; });
  setze((k) => { k.haupt[0] = NaN; });
  setze((k) => { k.haupt[0] = 1e9; });
  setze((k) => { k.haupt[7] = 1; k.docks = k.docks.slice(0, 1); });
  setze((k) => { k.modus = 'x'; });
  setze((k) => { delete k.modus; });
  setze((k) => { k.modus = 'level'; k.level = 0; k.weiter = 0; });
  setze((k) => { k.level = 5; });
  setze((k) => { k.weiter = 1; });
  setze((k) => { k.modus = 'level'; k.level = 1000; k.weiter = 0; });
  setze((k) => { k.modus = 'level'; k.level = 1.5; k.weiter = 0; });
  setze((k) => { k.verkauft = [0]; });
  setze((k) => { k.verkauft[0] = -1; });
  setze((k) => { k.verkauft[0] = NaN; });
  setze((k) => { delete k.verkauft; });
  setze((k) => { k.verkauft[7] = 1; k.docks = k.docks.slice(0, 1); });
  for (const f of falsch) gleich(L.istGueltig(f), false, JSON.stringify(f).slice(0, 90));
  for (const f of [null, undefined, 0, 'x', [], {}, true, 12, () => 1]) gleich(L.istGueltig(f), false, String(f));
  const mit = kopie();
  mit.extra = '<b>x</b>';
  mit.docks[0].extra = 1;
  const sauber = L.ausSpeicher(mit);
  gleich('extra' in sauber, false);
  gleich('extra' in sauber.docks[0], false);
  // Stand der zweiten Fassung (Version 2, mit Ebenen) → Fehler → neuer Hafen
  const alt = { v: 2, t: 1, uhr: 0, sperre: 0, geld: 5, gesamt: 5, halle: 1, turm: 1, ebenen: [{ kran: 1, schiff: 1, lager: 1, lotse: 0, p: 0, puffer: 0 }], haupt: [0, 0, 0, 0, 0, 0, 0, 0] };
  gleich(L.istGueltig(alt), false);
  gleich(modul.standVersion, 4);
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
    variante: zaehler.variante ?? 'endlos',
    speicher: (zaehler.sp = zaehler.sp ?? speicher.bereich('hafen:daten:')),
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
    meldeGewonnen(text, opt) { zaehler.gewonnen = (zaehler.gewonnen || 0) + 1; zaehler.gewonnenText = text; zaehler.gewonnenOpt = opt; },
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
  gleich(modul.standVersion, 4);
  tief(modul.varianten.map((v) => v.id), ['level', 'endlos']);
  wahr(modul.varianten[0].name.startsWith('Level – ') && modul.varianten[1].name.startsWith('Endlos – '));
});

test('Oberfläche: frischer Start, schlanker Aufbau, genau ein Upgrade-Knopf je Station', async () => {
  await mit(null, async (i, c) => {
    wahr(c.querySelector('.ha-leiste .ha-geld-wert') && c.querySelector('.ha-leiste .ha-rate'), 'Leiste mit Münzen und Einkommen');
    gleich(c.querySelectorAll('.ha-dock').length, 1);
    gleich(c.querySelectorAll('.ha-dock .ha-up').length, 1);
    gleich(c.querySelectorAll('.ha-verkauf .ha-up').length, 1);
    gleich(c.querySelectorAll('.ha-kran-streifen .ha-up').length, 1);
    gleich(c.querySelectorAll('.ha-up').length, 4, 'Dock, Verkauf, Kran, Neues Dock');
    wahr(c.querySelector('.ha-kran-streifen') && c.querySelector('.ha-turm'), 'Kran-Streifen und Leuchtturm');
    gleich(i.kannRueckgaengig(), false);
    gleich(i.rueckgaengig(), false);
    const st = i.getStand();
    tief(JSON.parse(JSON.stringify(st)), st);
    wahr(L.istGueltig(st));
    wahr(i.zusammenfassung().includes('Münzen'));
    wahr(c.querySelector('.ha-weg').hidden, 'kein Abwesenheitshinweis beim Neustart');
    for (const b of c.querySelectorAll('.ha-up')) {
      wahr(b.getAttribute('aria-label') && b.getAttribute('title'), 'Wirkung als aria-label/title');
      gleich(b.tagName, 'BUTTON');
      wahr(b.textContent.length < 14, `kurzer Knopftext: ${b.textContent}`);
    }
    wahr(c.querySelector('[data-was="d0"]').getAttribute('aria-label').includes('→'), 'Effekt im aria-label');
    wahr(c.querySelector('.ha-schiff').getAttribute('aria-label'));
  });
});

test('Oberfläche: Knöpfe und Anzeigen werden pro Tick nicht neu aufgebaut (Klicks gehen nicht verloren)', async () => {
  await mit(null, async (i, c) => {
    const knoten = [...c.querySelectorAll('button, .ha-balken, .ha-zahl')];
    wahr(knoten.length > 6);
    await warte(900);
    const danach = [...c.querySelectorAll('button, .ha-balken, .ha-zahl')];
    gleich(danach.length, knoten.length);
    wahr(knoten.every((k, n) => k === danach[n]), 'gleiche Knoten');
    const z = L.neuerHafen(Date.now());
    z.geld = 1e6;
    await mit(L.zumSpeichern(z, Date.now()), async (j, d) => {
      const kn = d.querySelector('[data-was="d0"]');
      await warte(450);
      kn.click();
      await warte(450);
      kn.click();
      gleich(j.getStand().docks[0].stufe, 3);
      gleich(d.querySelector('[data-was="d0"]'), kn);
    });
  });
});

test('Oberfläche: zu teure Knöpfe sind aria-disabled; Kaufen zieht Geld ab und meldet die Änderung', async () => {
  const z = L.neuerHafen(Date.now());
  z.geld = L.preis(z, 'd0') + 1;
  const zaehler = {};
  await mit(L.zumSpeichern(z, Date.now()), async (i, c) => {
    const dock = c.querySelector('[data-was="d0"]');
    const neu = c.querySelector('[data-was="neu"]');
    gleich(dock.getAttribute('aria-disabled'), 'false');
    gleich(neu.getAttribute('aria-disabled'), 'true');
    neu.click();
    gleich(i.getStand().docks.length, 1, 'zu teuer → nichts gekauft');
    wahr((zaehler.meldungen || 0) >= 1, 'Hinweis „zu wenig Münzen“');
    dock.click();
    gleich(i.getStand().docks[0].stufe, 2);
    wahr(i.getStand().geld < z.geld, 'Geld abgebucht');
    wahr((zaehler.aenderungen || 0) >= 1, 'meldeAenderung');
    gleich(c.querySelector('[data-was="d0"] .ha-abzeichen').textContent, '2');
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

test('Oberfläche: neues Dock erscheint mit eigener Zeile; Antippen gibt Schub; Neuer Hafen', async () => {
  const z = L.neuerHafen(Date.now());
  z.geld = 1e6;
  await mit(L.zumSpeichern(z, Date.now()), async (i, c) => {
    c.querySelector('[data-was="neu"]').click();
    gleich(c.querySelectorAll('.ha-dock').length, 2);
    gleich(c.querySelectorAll('.ha-dock .ha-up').length, 2);
    wahr(c.querySelectorAll('.ha-dock')[1].textContent.includes('Fisch'));
    c.querySelector('[data-was="d1"]').click();
    gleich(i.getStand().docks[1].stufe, 2);
    c.querySelector('[data-was="kran"]').click();
    gleich(i.getStand().kran, 2);
    c.querySelector('[data-was="verkauf"]').click();
    gleich(i.getStand().verkauf, 2);
    c.querySelector('.ha-schiff').click();
    wahr(i.getStand().sperre > 0, 'Schub ausgelöst');
    await warte(700);
    wahr(i.getStand().geld !== 1e6, 'Tick rechnet');
    i.neu();
    gleich(c.querySelectorAll('.ha-dock').length, 1, 'Neuer Hafen');
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
  faelle.push({ ...gut, docks: [BOESE] });
  faelle.push({ ...gut, docks: [{ stufe: BOESE, p: 0, puffer: 0 }] });
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

// ---------- Level-Modus ----------
/** Welche Käufe bringen ein Teilziel voran? */
function relevant(z, def) {
  const out = [];
  for (const zl of def.ziele) {
    if (L.zielFortschritt(z, { ziele: [zl] }) >= 1) continue;
    if (zl.art === 'docks') out.push('neu');
    else if (zl.art === 'kran') out.push('kran');
    else if (zl.art === 'verkauf') out.push('verkauf');
    else if (zl.art === 'dockstufe') out.push('d0');
    else if (zl.art === 'ware') out.push(z.docks.length <= zl.ware ? 'neu' : `d${zl.ware}`);
  }
  return out;
}

/**
 * Zeit (s) bis zum Level-Ziel. Strategie 'B': nur zielgerichtete Käufe (bei reinem Verdienstziel: günstigstes lohnendes Upgrade).
 * Strategie 'C': das Günstigere aus Zielkauf und günstigstem lohnenden Upgrade (investiert nebenbei).
 */
function levelZeit(n, strategie, max = 25 * 60) {
  let z = L.neuerHafen(0, 'level', n);
  const def = L.levelDef(n);
  let t = 0;
  while (t < max) {
    if (L.zielErreicht(z)) return t;
    const g = L.naechstesZiel(z);
    let wahl = g ? { was: g.was, preis: g.preis } : null;
    const rel = relevant(z, def).map((w) => ({ was: w, preis: L.preis(z, w) })).filter((x) => x.preis !== null).sort((a, b) => a.preis - b.preis);
    if (strategie === 'B') { if (rel.length) wahl = rel[0]; } else if (rel.length && (!wahl || rel[0].preis <= wahl.preis)) wahl = rel[0];
    if (!wahl) return t;
    while (z.geld < wahl.preis && t < max) { z = L.fortschritt(z, 2); t += 2; if (L.zielErreicht(z)) return t; }
    if (t >= max) break;
    z = L.kaufe(z, wahl.was).zustand;
  }
  return max;
}

test('Level: Definitionen sind gültig, deterministisch, gedeckelt und steigen sanft', () => {
  wahr(L.LEVEL.length >= 20 && L.LEVEL.length <= 30, `handgesetzt: ${L.LEVEL.length}`);
  const arten = ['verdient', 'docks', 'kran', 'verkauf', 'dockstufe', 'ware'];
  const gesehen = new Set();
  for (let n = 1; n <= 80; n++) {
    const d = L.levelDef(n);
    tief(d, L.levelDef(n), 'deterministisch');
    wahr(d.ziele.length >= 1 && d.docks >= 1 && d.docks <= L.MAX_DOCKS && d.geld >= 0, `Level ${n}`);
    for (const zl of d.ziele) {
      wahr(arten.includes(zl.art) && Number.isFinite(zl.wert) && zl.wert > 0, `Ziel Level ${n}`);
      if (zl.art === 'ware') wahr(Number.isInteger(zl.ware) && zl.ware >= 0 && zl.ware < L.MAX_DOCKS);
      if (zl.art === 'docks') wahr(zl.wert <= (d.maxDocks ?? L.MAX_DOCKS) && zl.wert > d.docks, `Docks-Ziel Level ${n}`);
      gesehen.add(zl.art);
    }
    wahr(L.zielText(d).length > 3);
    wahr(!L.zielErreicht(L.neuerHafen(0, 'level', n)), `Level ${n} nicht schon beim Start erreicht`);
  }
  tief([...gesehen].sort(), [...arten].sort());
  tief(L.levelDef(L.LEVEL_MAX), L.levelDef(L.LEVEL_MAX + 500), 'gedeckelt');
  tief(L.levelDef(0), L.levelDef(1));
  wahr(L.levelDef(60).ziele[0].wert > L.levelDef(31).ziele[0].wert, 'erzeugte Level wachsen');
});

test('Level: jedes der ersten 30 Level ist in 1–20 Minuten erreichbar (zielgerichtet), nie unter 1 Minute (auch mit Investieren)', () => {
  const fehler = [];
  for (let n = 1; n <= 30; n++) {
    const b = levelZeit(n, 'B');
    const c = levelZeit(n, 'C');
    if (b < 60 || b > 20 * 60) fehler.push(`Level ${n}: zielgerichtet ${Math.round(b)} s`);
    if (c < 60) fehler.push(`Level ${n}: investierend ${Math.round(c)} s`);
  }
  gleich(fehler.join(' | '), '', 'Zielzeiten');
});

test('Level: Spielstand im Level-Modus wird streng geprüft (Docks-Obergrenze, Level 1…999)', () => {
  const z = L.neuerHafen(0, 'level', 14);   // Level 14: höchstens 4 Docks
  wahr(L.istGueltig(z));
  gleich(z.modus, 'level');
  gleich(z.docks.length, 4);
  gleich(L.kaufe({ ...z, geld: 1e12 }, 'neu').ok, false, 'Obergrenze verfügbarer Docks');
  const viele = JSON.parse(JSON.stringify(z));
  viele.docks.push({ stufe: 1, p: 0, puffer: 0 });
  gleich(L.istGueltig(viele), false);
  viele.weiter = 1;
  gleich(L.istGueltig(viele), true, 'beim Weiterspielen entfällt die Grenze');
  gleich(L.neuerHafen(0, 'level', 19).docks.length, 6);
  gleich(L.neuerHafen(0, 'endlos', 19).docks.length, 1);
  gleich(L.neuerHafen(0, 'endlos').level, 0);
});

test('Level: Verkaufszähler und Zielfortschritt wachsen mit dem Spiel', () => {
  let z = L.neuerHafen(0, 'level', 1);
  gleich(L.zielFortschritt(z), 0);
  z = L.fortschritt(z, 120);
  wahr(z.verkauft[0] > 0 && z.gesamt > 0);
  wahr(L.zielFortschritt(z) > 0.2 && L.zielFortschritt(z) <= 1);
  gleich(L.zielFortschritt(L.neuerHafen(0)), 0, 'Endlos hat kein Ziel');
  const w = L.neuerHafen(0, 'level', 6);
  w.verkauft[1] = 75;
  wahr(Math.abs(L.zielFortschritt(w) - 0.5) < 1e-9);
});

test('Oberfläche Level: Zielleiste, Ziel erreicht → meldeGewonnen mit „Weiterspielen“, nächstes Level über neu()', async () => {
  const zaehler = { variante: 'level' };
  await mit(null, async (i, c) => {
    wahr(!c.querySelector('.ha-ziel').hidden, 'Zielleiste sichtbar');
    wahr(c.querySelector('.ha-ziel-text').textContent.includes('Level 1'));
    wahr(c.querySelector('.ha-ziel-text').textContent.includes('Münzen verdient'));
    wahr(i.zusammenfassung().startsWith('Level 1 · Ziel'));
    gleich(i.getStand().modus, 'level');
    gleich(zaehler.gewonnen, undefined);
  }, zaehler);

  const z = L.neuerHafen(Date.now(), 'level', 1);
  z.gesamt = 150;
  await mit(L.zumSpeichern(z, Date.now()), async (i, c) => {
    await warte(1000);
    gleich(zaehler.gewonnen, 1, 'einmal gemeldet');
    wahr(zaehler.gewonnenText.includes('Level 1'));
    gleich(zaehler.gewonnenOpt?.weiterspielen, true);
    gleich(zaehler.sp.lies('level', 1), 2, 'nächstes Level vorgemerkt');
    const vorher = i.getStand().uhr;
    await warte(500);
    gleich(i.getStand().uhr, vorher, 'Takt steht nach dem Ziel');
    i.neu('level');   // Shell: „Neues Spiel“
    gleich(i.getStand().level, 2);
    wahr(c.querySelector('.ha-ziel-text').textContent.includes('Level 2'));
  }, zaehler);
});

test('Oberfläche Level: weiterspielen() → Endlos-Betrieb, Flag im Spielstand, Ziel nie ein zweites Mal', async () => {
  const zaehler = { variante: 'level' };
  const z = L.neuerHafen(Date.now(), 'level', 1);
  z.gesamt = 150;
  let stand;
  await mit(L.zumSpeichern(z, Date.now()), async (i, c) => {
    await warte(700);
    gleich(zaehler.gewonnen, 1);
    i.weiterspielen();
    stand = i.getStand();
    gleich(stand.weiter, 1);
    wahr(L.istGueltig(stand));
    wahr(c.querySelector('.ha-ziel-text').textContent.includes('Endlos'));
    wahr(c.querySelector('.ha-ziel .ha-balken').hidden);
    const uhr = stand.uhr;
    await warte(700);
    wahr(i.getStand().uhr > uhr, 'Takt läuft wieder');
    gleich(zaehler.gewonnen, 1, 'nicht noch einmal gemeldet');
  }, zaehler);
  const z2 = { variante: 'level' };
  await mit(stand, async (i, c) => {
    await warte(500);
    gleich(z2.gewonnen, undefined);
    wahr(c.querySelector('.ha-ziel-text').textContent.includes('Endlos'));
    wahr(i.zusammenfassung().includes('Endlos'));
  }, z2);
});

test('Oberfläche Level: Ziel in der Abwesenheit erreicht → beim Öffnen gemeldet; Modus-Wechsel verwirft den Stand', async () => {
  const zaehler = { variante: 'level' };
  const z = L.neuerHafen(Date.now(), 'level', 1);
  await mit(L.zumSpeichern(z, Date.now() - 3 * 3600_000), async (i, c) => {
    await warte(300);
    gleich(zaehler.gewonnen, 1, 'Ziel offline erreicht');
    wahr(!c.querySelector('.ha-weg').hidden, 'Abwesenheit angezeigt');
  }, zaehler);
  await mit(L.zumSpeichern(z, Date.now() - 3 * 3600_000), async (i) => {
    gleich(i.getStand().modus, 'endlos');
    gleich(i.getStand().geld, 0);
  }, { variante: 'endlos' });
  await mit(L.zumSpeichern(L.neuerHafen(Date.now()), Date.now()), async (i) => {
    gleich(i.getStand().modus, 'level');
  }, { variante: 'level' });
  await mit(null, async (i, c) => {
    i.neu('endlos');
    gleich(i.getStand().modus, 'endlos');
    wahr(c.querySelector('.ha-ziel').hidden);
    wahr(i.zusammenfassung().startsWith('Endlos'));
    i.neu('level');
    gleich(i.getStand().modus, 'level');
    wahr(!c.querySelector('.ha-ziel').hidden);
  }, { variante: 'level' });
});
