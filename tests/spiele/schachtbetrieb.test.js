import { test, gleich, tief, wahr } from '../mini-test.js';
import * as L from '../../spiele/schachtbetrieb/logik.js';
import modul from '../../spiele/schachtbetrieb/index.js';
import { erstelleSpeicher } from '../../kern/speicher.js';
import { erstelleEinstellungen } from '../../kern/einstellungen.js';
import { erstelleZufall, neuerSeed } from '../../kern/zufall.js';
import { erstelleFarben } from '../../kern/farben.js';
import * as eingabe from '../../kern/eingabe.js';
import { falscherSpeicher } from '../kern/hilfen.js';

/** Stets das günstigste Upgrade kaufen; liefert die Wartezeiten (s) je Kauf */
function greedy(anzahl, z = L.neuesBergwerk(0)) {
  const waits = [];
  let gesamt = 0;
  for (let i = 0; i < anzahl; i++) {
    const g = L.naechstesZiel(z);
    let w = 0;
    while (z.geld < g.preis && w < 10000) { z = L.fortschritt(z, 1); w++; }
    z = L.kaufe(z, g.was).zustand;
    waits.push(w);
    gesamt += w;
  }
  return { waits, gesamt, z };
}

function reich(extra = {}) {
  const z = L.neuesBergwerk(0);
  z.geld = 1e6;
  return Object.assign(z, extra);
}

function vollesBergwerk() {
  const voll = L.neuesBergwerk(0);
  voll.aufzug = { stufe: L.MAX_STUFE };
  voll.zentrum = { stufe: L.MAX_STUFE, lager: 0 };
  voll.schaechte = Array.from({ length: L.MAX_SCHAECHTE }, () => ({ stufe: L.MAX_STUFE, kiste: 0 }));
  return voll;
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
  gleich(L.formatiere(1e30).includes('Quad.'), true);
  gleich(L.formatiereDauer(0), 'sofort');
  gleich(L.formatiereDauer(45), '45 s');
  gleich(L.formatiereDauer(600), '10 min');
  gleich(L.formatiereDauer(Infinity), 'unbekannt');
});

test('Start: ein Schacht, Stufe 1, kein Geld, Stand-Version 2', () => {
  const z = L.neuesBergwerk(1000);
  gleich(z.schaechte.length, 1);
  gleich(z.geld, 0);
  gleich(z.v, 3);
  gleich(modul.standVersion, 3);
  gleich(z.level, 0);
  gleich(z.fertig, false);
  gleich(z.weiter, false);
  wahr(L.istGueltig(z));
  wahr(L.einkommen(z) > 0 && L.einkommen(z) < 5);
});

test('Stufen: höhere Stufe fördert mehr, Bergleute kommen schrittweise dazu', () => {
  let letzte = 0;
  for (let s = 1; s <= L.MAX_STUFE; s++) {
    const f = L.foerderung({ stufe: s }, 0);
    wahr(f > letzte, `Stufe ${s}`);
    letzte = f;
  }
  gleich(L.bergleute({ stufe: 1 }), 1);
  gleich(L.bergleute({ stufe: 4 }), 2);
  wahr(L.bergleute({ stufe: L.MAX_STUFE }) <= 20);
  wahr(L.fahrtZeit({ aufzug: { stufe: 5 } }, 0) < L.fahrtZeit({ aufzug: { stufe: 1 } }, 0));
  wahr(L.aufzugLadung({ aufzug: { stufe: 5 } }) > L.aufzugLadung({ aufzug: { stufe: 1 } }));
});

test('Fortschritt: Geld wächst, Original bleibt unverändert, ohne Zufall deterministisch', () => {
  const z = reich();
  const vorher = JSON.stringify(z);
  const a = L.fortschritt(z, 123.4);
  const b = L.fortschritt(z, 123.4);
  gleich(JSON.stringify(z), vorher, 'unverändert');
  tief(a, b, 'gleich');
  wahr(a.geld > z.geld, 'Geld wächst');
  wahr(Math.abs(a.uhr - 123.4) < 1e-9);
  tief(L.fortschritt(z, 0), z);
});

test('Fortschritt: kleine und große Schritte liefern fast dasselbe', () => {
  const z = greedy(25).z;
  z.geld = 0;
  const gross = L.fortschritt(z, 1200).geld;
  let k = z;
  for (let i = 0; i < 120; i++) k = L.fortschritt(k, 10);
  wahr(Math.abs(gross - k.geld) / k.geld < 0.1, `${gross} vs ${k.geld}`);
});

test('Fortschritt: riesige dt und krumme Werte bleiben endlich', () => {
  const z = reich();
  const a = L.fortschritt(z, 1e9);
  wahr(Number.isFinite(a.geld) && a.geld > 0 && a.geld <= L.MAX_GELD);
  for (const dt of [NaN, -5, Infinity, -Infinity, 0, '3', null, undefined]) {
    const r = L.fortschritt(z, dt);
    gleich(r.geld, z.geld, `dt=${String(dt)}`);
    gleich(r.uhr, z.uhr);
  }
  const v = L.fortschritt(vollesBergwerk(), 3600);
  wahr(Number.isFinite(v.geld) && v.geld <= L.MAX_GELD && L.istGueltig(v), 'voll');
});

test('Käufe: Preis, Abbuchung, Maximum, ungültige Namen', () => {
  let z = L.neuesBergwerk(0);
  const p = L.preis(z, 's0');
  wahr(p > 0);
  gleich(L.kaufe(z, 's0').ok, false, 'zu wenig Geld');
  gleich(L.kaufe(z, 's0').grund, 'zu wenig Geld');
  z.geld = p + 5;
  const r = L.kaufe(z, 's0');
  gleich(r.ok, true);
  gleich(r.zustand.schaechte[0].stufe, 2);
  gleich(r.zustand.geld, 5);
  gleich(z.schaechte[0].stufe, 1, 'Original unverändert');
  wahr(L.preis(r.zustand, 's0') > p, 'wird teurer');
  for (const w of ['', 'x', 's5', 's0:n', 's0:tempo', 'aufzug:tempo', 'zentrum:ladung', '__proto__', 's-1', 's99', 's', null, undefined, 12]) {
    gleich(L.preis(z, w), null, String(w));
    gleich(L.kaufe(reich(), w).ok, false, String(w));
  }
  // Aufzug und Zentrum
  const a = L.kaufe(reich(), 'aufzug');
  gleich(a.zustand.aufzug.stufe, 2);
  const c = L.kaufe(reich(), 'zentrum');
  gleich(c.zustand.zentrum.stufe, 2);
  // Maximum
  z = reich();
  z.schaechte[0].stufe = L.MAX_STUFE;
  gleich(L.preis(z, 's0'), null);
  gleich(L.kaufe(z, 's0').grund, 'nicht verfügbar');
  z.aufzug.stufe = L.MAX_STUFE;
  gleich(L.preis(z, 'aufzug'), null);
});

test('Käufe: neue Schächte bis zum Maximum', () => {
  let z = reich();
  z.geld = 1e30;
  for (let i = 1; i < L.MAX_SCHAECHTE; i++) {
    const r = L.kaufe(z, 'schacht');
    wahr(r.ok, `Schacht ${i + 1}`);
    z = r.zustand;
  }
  gleich(z.schaechte.length, L.MAX_SCHAECHTE);
  gleich(L.kaufe(z, 'schacht').ok, false);
  wahr(L.istGueltig(z));
  wahr(L.preis(z, `s${L.MAX_SCHAECHTE - 1}`) > 0);
});

test('Preise: wachsen mit der Stufe, nie explodierend (≤ ×1,4 je Stufe)', () => {
  for (const was of ['s0', 'aufzug', 'zentrum']) {
    let letzterPreis = 0;
    let c = reich();
    c.geld = 1e30;
    for (let i = 0; i < 12; i++) {
      const p = L.preis(c, was);
      if (p === null) break;
      if (letzterPreis) wahr(p > letzterPreis && p / letzterPreis < 1.4, `${was} Stufe ${i}: ${letzterPreis} → ${p}`);
      letzterPreis = p;
      c = L.kaufe(c, was).zustand;
    }
  }
});

test('Wachstumskurve: die ersten 30 Käufe (stets das Günstigste) liegen in den Zielgrenzen', () => {
  const { waits, gesamt } = greedy(30);
  for (let i = 0; i < waits.length; i++) {
    wahr(waits[i] >= 10 && waits[i] <= 180, `Kauf ${i + 1}: ${waits[i]} s`);
  }
  wahr(gesamt < 3600, `Gesamt ${gesamt} s`);
  wahr(gesamt > 300, `nicht zu schnell: ${gesamt} s`);
  const mittel = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  wahr(mittel(waits.slice(15)) >= mittel(waits.slice(0, 15)), 'Wartezeiten werden nicht kürzer');
});

test('Wachstumskurve: auch mit weiteren Schächten bleiben die Wartezeiten sanft', () => {
  const { waits, gesamt } = greedy(70);
  wahr(Math.max(...waits) <= 180, `längste Wartezeit ${Math.max(...waits)} s`);
  wahr(Math.min(...waits.slice(1)) >= 10, `kürzeste Wartezeit ${Math.min(...waits.slice(1))} s`);
  wahr(gesamt < 7200, `Gesamt ${gesamt} s`);
});

test('Nächstes Ziel: günstigstes Upgrade samt Wartezeit', () => {
  const z = L.neuesBergwerk(0);
  const g = L.naechstesZiel(z);
  gleich(g.was, 's0');
  wahr(g.wartezeit > 10 && g.wartezeit < 60, `${g.wartezeit}`);
  z.geld = g.preis;
  gleich(L.naechstesZiel(z).wartezeit, 0);
  const m = vollesBergwerk();
  gleich(L.naechstesZiel(m), null);
  gleich(L.moeglicheKaeufe(m).length, 0);
});

test('Anschub: bringt Förderung, Sperre verhindert Dauerklicken', () => {
  const z = L.neuesBergwerk(0);
  const a = L.anschub(z, 0);
  gleich(a.ok, true);
  wahr(a.zustand.schaechte[0].kiste > 0);
  gleich(L.anschub(a.zustand, 0).ok, false, 'gesperrt');
  const spaeter = L.fortschritt(a.zustand, L.ANSCHUB_SPERRE_S + 0.1);
  gleich(L.anschub(spaeter, 0).ok, true, 'wieder frei');
  gleich(L.anschub(z, 5).ok, false);
  gleich(L.anschub(z, -1).ok, false);
  gleich(L.anschub(z, 0.5).ok, false);
});

test('Offline: Lücke gedeckelt (8 h) und Faktor ≤ 1', () => {
  gleich(L.luecke(0), 0);
  gleich(L.luecke(30), 30);
  gleich(L.luecke(60), 60);
  gleich(L.luecke(120), 90);
  const deckel = L.luecke(8 * 3600);
  wahr(deckel < 8 * 3600 && deckel > 4 * 3600, `${deckel}`);
  gleich(L.luecke(100 * 3600), deckel, 'über 8 h zählt nichts mehr');
  gleich(L.luecke(1e18), deckel);
  for (const dt of [1, 59, 61, 600, 3600, 30000, 1e9]) wahr(L.luecke(dt) <= dt, `Faktor bei ${dt}`);
  let letzter = 0;
  for (let dt = 0; dt <= 40000; dt += 137) { const l = L.luecke(dt); wahr(l >= letzter); letzter = l; }
});

test('Offline: Verrechnung beim Öffnen, Deckel, kein Fortschritt bei Uhr-Unsinn', () => {
  const z = greedy(15).z;
  z.t = 1_000_000_000_000;
  const stunde = L.offline(z, z.t + 3600_000);
  wahr(stunde.gewinn > 0 && stunde.zustand.geld > z.geld);
  gleich(stunde.dt, 3600);
  gleich(stunde.zustand.t, z.t + 3600_000, 'neuer Zeitstempel');
  const tag = L.offline(z, z.t + 24 * 3600_000);
  const acht = L.offline(z, z.t + 8 * 3600_000);
  gleich(tag.zustand.geld, acht.zustand.geld, 'Deckel 8 h');
  gleich(tag.dt, 8 * 3600);
  for (const jetzt of [z.t - 5000, z.t - 1e9, NaN, Infinity, -1, 'x', undefined, null]) {
    const r = L.offline(z, jetzt);
    gleich(r.zustand.geld, z.geld, `jetzt=${String(jetzt)}`);
    gleich(r.gewinn, 0);
    gleich(r.dt, 0);
  }
  tief(L.offline(z, z.t + 7200_000).zustand, L.offline(z, z.t + 7200_000).zustand);
  const h1 = L.offline(z, z.t + 3600_000).gewinn;
  const h2 = L.offline(z, z.t + 7200_000).gewinn;
  wahr(h2 > h1 && h2 < 2 * h1 * 1.01, `${h1} ${h2}`);
});

test('Zeit rückwärts: negative dt wirkt nie; Stand-Zeitstempel bleibt begrenzt', () => {
  const z = reich();
  gleich(L.fortschritt(z, -100).geld, z.geld);
  gleich(L.zumSpeichern(z, NaN).t, 0);
  gleich(L.zumSpeichern(z, -5).t, 0);
  gleich(L.zumSpeichern(z, 1e15).t, 0);
  gleich(L.zumSpeichern(z, 1234).t, 1234);
  gleich(L.neuesBergwerk(NaN).t, 0);
});

test('Spielstand: JSON-tauglich, streng validiert, Version 1 wird verworfen', () => {
  const z = greedy(20).z;
  const s = JSON.parse(JSON.stringify(L.zumSpeichern(z, 5000)));
  tief(L.ausSpeicher(s), s);
  gleich(s.v, 3);
  const kopie = () => JSON.parse(JSON.stringify(s));
  const falsch = [];
  const setze = (fn) => { const k = kopie(); fn(k); falsch.push(k); };
  setze((k) => { k.geld = NaN; });
  setze((k) => { k.geld = null; });
  setze((k) => { k.geld = '5'; });
  setze((k) => { k.geld = -1; });
  setze((k) => { k.geld = 1e31; });
  setze((k) => { k.gesamt = -1; });
  setze((k) => { k.t = -1; });
  setze((k) => { k.t = 5e12; });
  setze((k) => { k.uhr = -3; });
  setze((k) => { k.v = 1; });
  setze((k) => { k.v = 2; });
  setze((k) => { k.v = 4; });
  setze((k) => { k.level = -1; });
  setze((k) => { k.level = 1.5; });
  setze((k) => { k.level = L.MAX_LEVEL + 1; });
  setze((k) => { k.fertig = 1; });
  setze((k) => { k.weiter = 'ja'; });
  setze((k) => { k.fertig = true; });
  setze((k) => { k.weiter = true; });
  setze((k) => { delete k.level; });
  setze((k) => { delete k.fertig; });
  setze((k) => { delete k.weiter; });
  setze((k) => { delete k.v; });
  setze((k) => { k.schaechte = []; });
  setze((k) => { k.schaechte = 'x'; });
  setze((k) => { k.schaechte = Array.from({ length: L.MAX_SCHAECHTE + 1 }, () => k.schaechte[0]); });
  setze((k) => { k.schaechte = Array.from({ length: 31 }, () => k.schaechte[0]); });
  setze((k) => { k.schaechte[0] = null; });
  setze((k) => { k.schaechte[0].stufe = 0; });
  setze((k) => { k.schaechte[0].stufe = L.MAX_STUFE + 1; });
  setze((k) => { k.schaechte[0].stufe = 1.5; });
  setze((k) => { k.schaechte[0].kiste = -1; });
  setze((k) => { k.schaechte[0].kiste = NaN; });
  setze((k) => { k.aufzug.stufe = 41; });
  setze((k) => { k.aufzug = null; });
  setze((k) => { k.zentrum.stufe = 0.5; });
  setze((k) => { k.zentrum.lager = -2; });
  setze((k) => { k.zentrum = []; });
  // alter Stand der Version 1 (Tempo/Ladung getrennt)
  falsch.push({ v: 1, t: 1, uhr: 0, sperre: 0, geld: 5, gesamt: 5, aufzug: { tempo: 1, ladung: 1 },
    zentrum: { tempo: 1, ladung: 1, lager: 0 }, schaechte: [{ n: 1, tempo: 1, trag: 1, kiste: 0 }] });
  for (const f of falsch) gleich(L.istGueltig(f), false, JSON.stringify(f).slice(0, 80));
  for (const f of [null, undefined, 0, 'x', [], {}, true, 12, () => 1]) gleich(L.istGueltig(f), false, String(f));
  const mit = kopie();
  mit.extra = '<b>x</b>';
  mit.schaechte[0].extra = 1;
  const sauber = L.ausSpeicher(mit);
  gleich('extra' in sauber, false);
  gleich('extra' in sauber.schaechte[0], false);
});

test('Spielstand: Fuzz wirft nie etwas anderes als einen Fehler', () => {
  const gut = JSON.parse(JSON.stringify(L.zumSpeichern(greedy(10).z, 1)));
  const werte = [NaN, Infinity, -Infinity, null, undefined, '1', [], {}, true, 0, -1, 1e300, 0.5];
  for (const k of ['geld', 'gesamt', 't', 'uhr', 'sperre', 'aufzug', 'zentrum', 'schaechte', 'v']) {
    for (const w of werte) {
      try { L.ausSpeicher({ ...gut, [k]: w }); } catch (e) { wahr(e instanceof Error); }
    }
  }
});

// ---------- Puffer (Schachtlager, Aufzug, Eingangslager) ----------
test('Puffer: Schachtlager und Eingangslager überschreiten nie ihre Kapazität', () => {
  let z = greedy(40).z;
  for (let i = 0; i < 300; i++) {
    z = L.fortschritt(z, 7);
    z.schaechte.forEach((s, k) => wahr(s.kiste <= L.lagerKap(s, k) + 1e-6, `Schacht ${k} voll`));
    wahr(z.zentrum.lager <= L.eingangKap(z) + 1e-6, 'Eingangslager');
  }
  const gross = L.fortschritt(z, 14430);
  gross.schaechte.forEach((s, k) => wahr(s.kiste <= L.lagerKap(s, k) + 1e-6));
  wahr(gross.zentrum.lager <= L.eingangKap(gross) + 1e-6);
});

test('Puffer: langsamer Aufzug lässt das Schachtlager volllaufen, Einnahme bleibt unter der Schätzung', () => {
  const z = L.neuesBergwerk(0);
  z.schaechte[0] = { stufe: 30, kiste: 0 };   // Förderung weit über dem Aufzug
  const a = L.fortschritt(z, 600);
  const kap = L.lagerKap(a.schaechte[0], 0);
  wahr(a.schaechte[0].kiste > kap * 0.5, 'Lager (fast) voll');
  wahr(a.geld / 600 <= L.einkommen(z) * 1.05, `Einnahme ${a.geld / 600} ≤ ${L.einkommen(z)}`);
});

test('Puffer: Aufzug-Last begrenzt; Erz geht nicht verloren', () => {
  const z = greedy(20).z;
  wahr(L.aufzugLast(z) > 0 && L.aufzugLast(z) <= L.aufzugLadung(z));
  const a = L.neuesBergwerk(0);
  const b = L.fortschritt(a, 30);
  const foerder = L.foerderung(a.schaechte[0], 0) * 30;
  wahr(Math.abs(b.geld + b.zentrum.lager + b.schaechte[0].kiste - foerder) < 1e-6, 'Erz bleibt erhalten');
});

test('Puffer: Offline-Rechnung bleibt gedeckelt und konsistent', () => {
  const z = greedy(25).z;
  z.t = 1_000_000_000_000;
  const o = L.offline(z, z.t + 24 * 3600_000).zustand;
  wahr(Number.isFinite(o.geld) && L.istGueltig(o));
  o.schaechte.forEach((s, k) => wahr(s.kiste <= L.lagerKap(s, k) + 1e-6));
  tief(L.offline(z, z.t + 100 * 3600_000).zustand.geld, o.geld);
  wahr(o.geld - z.geld <= L.einkommen(z) * L.luecke(8 * 3600) * 1.05 + z.zentrum.lager + 1, 'nicht über dem Dauereinkommen');
});

test('Puffer: Stände mit Puffern über der Kapazität werden gekappt', () => {
  const s = JSON.parse(JSON.stringify(L.zumSpeichern(greedy(8).z, 1)));
  s.schaechte[0].kiste = 1e9;
  s.zentrum.lager = 1e9;
  const n = L.ausSpeicher(s);
  gleich(n.schaechte[0].kiste, L.lagerKap(n.schaechte[0], 0));
  gleich(n.zentrum.lager, L.eingangKap(n));
});

test('Wirkungs-Vorschau: kurzer Text je Kauf (für Tooltip und aria-label)', () => {
  const z = L.neuesBergwerk(0);
  wahr(/^\+\d+ % Förderung$/.test(L.effektText(z, 's0')), L.effektText(z, 's0'));
  gleich(L.effektText(z, 'aufzug'), '+10 % Tempo, +15 % Ladung');
  gleich(L.effektText(z, 'zentrum'), '+10 % Verkaufstempo, +15 % Ladung');
  wahr(L.effektText(z, 'schacht').includes('Erz/s'));
  gleich(L.effektText(z, 's9'), '');
  gleich(L.effektText(z, 'xyz'), '');
});

// ---------- Oberfläche ----------
function falscherKontext(signal, zaehler = {}) {
  const speicher = erstelleSpeicher({ backend: falscherSpeicher() });
  const einstellungen = erstelleEinstellungen(speicher);
  return {
    variante: zaehler.variante ?? 'endlos',
    speicher: (zaehler.speicher = speicher.bereich('schachtbetrieb:daten:')),
    einstellungen: Object.assign(Object.create(einstellungen), { spiel: einstellungen.spiel('schachtbetrieb') }),
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
    meldeGewonnen(text, opt) { (zaehler.gewonnen ??= []).push({ text, opt }); },
    neuesSpiel() {},
  };
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function mit(stand, fn, zaehler = {}) {
  const ac = new AbortController();
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;height:700px';
  document.body.append(container);
  const kontext = falscherKontext(ac.signal, zaehler);
  if (zaehler.geloest !== undefined) kontext.speicher.schreibe('geloest', zaehler.geloest);
  const instanz = modul.erstelle(container, kontext, stand);
  try { return await fn(instanz, container); } finally {
    instanz.zerstoere();
    ac.abort();
    container.remove();
  }
}

test('Modul: Metadaten', () => {
  gleich(modul.id, 'schachtbetrieb');
  gleich(modul.name, 'Schachtbetrieb');
  tief(modul.varianten, [{ id: 'level', name: 'Level – mit Ziel' }, { id: 'endlos', name: 'Endlos – ohne Ziel' }]);
});

test('Oberfläche: schlanker Aufbau, genau ein Upgrade-Knopf je Station', async () => {
  await mit(null, async (i, c) => {
    gleich(c.querySelectorAll('.sb-schacht').length, 1);
    gleich(c.querySelectorAll('.sb-schacht .sb-up').length, 1, 'ein Knopf je Schacht');
    gleich(c.querySelectorAll('.sb-zentrum .sb-up').length, 1);
    gleich(c.querySelectorAll('.sb-aufzug .sb-up').length, 1);
    gleich(c.querySelectorAll('.sb-up').length, 3);
    wahr(c.querySelector('.sb-leiste'), 'feste Leiste');
    wahr(c.querySelector('.sb-aufzug .sb-schiene .sb-kabine'), 'Aufzugsschacht mit Kabine');
    wahr(c.querySelector('.sb-schacht .sb-lager'), 'Schachtlager');
    wahr(c.querySelector('.sb-neuer'), 'Neuer Schacht');
    gleich(i.kannRueckgaengig(), false);
    gleich(i.rueckgaengig(), false);
    const st = i.getStand();
    tief(JSON.parse(JSON.stringify(st)), st);
    wahr(L.istGueltig(st));
    wahr(i.zusammenfassung().includes('Taler'));
    wahr(c.querySelector('.sb-weg').hidden, 'kein Abwesenheitshinweis beim Neustart');
    for (const b of c.querySelectorAll('.sb-up, .sb-neuer')) {
      wahr(b.getAttribute('aria-label'), 'aria-label');
      wahr(b.getAttribute('title'), 'title (Wirkung)');
      gleich(b.tagName, 'BUTTON');
    }
    wahr(c.querySelector('.sb-up .sb-up-stufe').textContent === '1', 'Stufen-Abzeichen');
  });
});

test('Oberfläche: zu teure Knöpfe sind aria-disabled; Kaufen erhöht die Stufe und meldet die Änderung', async () => {
  const z = L.neuesBergwerk(Date.now());
  z.geld = L.preis(z, 's0') + 1;
  const zaehler = {};
  await mit(L.zumSpeichern(z, Date.now()), async (i, c) => {
    const s0 = c.querySelector('[data-was="s0"]');
    const aufzug = c.querySelector('[data-was="aufzug"]');
    gleich(s0.getAttribute('aria-disabled'), 'false');
    gleich(aufzug.getAttribute('aria-disabled'), 'true');
    aufzug.click();
    gleich(i.getStand().aufzug.stufe, 1, 'zu teuer → nichts gekauft');
    wahr((zaehler.meldungen || 0) >= 1, 'Hinweis „zu wenig Taler“');
    s0.click();
    gleich(i.getStand().schaechte[0].stufe, 2);
    wahr(i.getStand().geld < z.geld, 'Geld abgebucht');
    wahr((zaehler.aenderungen || 0) >= 1, 'meldeAenderung');
    gleich(s0.querySelector('.sb-up-stufe').textContent, '2');
  }, zaehler);
});

test('Oberfläche: Taste K kauft das Nächste Ziel; andere Tasten gehören der Shell', async () => {
  const z = L.neuesBergwerk(Date.now());
  z.geld = 100;
  await mit(L.zumSpeichern(z, Date.now()), async (i) => {
    gleich(i.onTaste({ key: 'z' }), false);
    gleich(i.onTaste({ key: 'n' }), false);
    gleich(i.onTaste({ key: 'k', ctrlKey: true }), false);
    gleich(i.onTaste({ key: 'k' }), true);
    gleich(i.getStand().schaechte[0].stufe, 2);
  });
});

test('Oberfläche: Abwesenheit wird beim Öffnen verrechnet und angezeigt', async () => {
  const z = greedy(10).z;
  const jetzt = Date.now();
  const vorher = z.geld;
  await mit(L.zumSpeichern(z, jetzt - 3 * 3600_000), async (i, c) => {
    wahr(!c.querySelector('.sb-weg').hidden, 'Hinweis sichtbar');
    wahr(c.querySelector('.sb-weg-text').textContent.startsWith('Während du weg warst'));
    wahr(i.getStand().geld > vorher);
    c.querySelector('.sb-weg .knopf').click();
    wahr(c.querySelector('.sb-weg').hidden, 'Hinweis schließbar');
  });
  await mit(L.zumSpeichern(z, jetzt + 3600_000), async (i, c) => {
    wahr(i.getStand().geld < vorher + 5 * L.einkommen(z));
    wahr(c.querySelector('.sb-weg').hidden);
  });
});

test('Oberfläche: Alter Stand (Version 1) wird verworfen mit Hinweis', async () => {
  const alt = { v: 1, t: Date.now(), uhr: 0, sperre: 0, geld: 50, gesamt: 50, aufzug: { tempo: 1, ladung: 1 },
    zentrum: { tempo: 1, ladung: 1, lager: 0 }, schaechte: [{ n: 1, tempo: 1, trag: 1, kiste: 0 }] };
  const zaehler = {};
  await mit(alt, async (i, c) => {
    gleich(i.getStand().v, 3);
    gleich(c.querySelectorAll('.sb-schacht').length, 1);
    wahr((zaehler.meldungen || 0) >= 1, 'Hinweis auf neues Bergwerk');
  }, zaehler);
});

test('Oberfläche: Tick rechnet weiter, Schächte erscheinen nach dem Kauf, Neues Bergwerk setzt zurück', async () => {
  const z = L.neuesBergwerk(Date.now());
  z.geld = 1e6;
  await mit(L.zumSpeichern(z, Date.now()), async (i, c) => {
    c.querySelector('[data-was="schacht"]').click();
    gleich(c.querySelectorAll('.sb-schacht').length, 2);
    await warte(700);
    wahr(i.getStand().geld !== 1e6 - L.preis(z, 'schacht'), 'Geld hat sich bewegt');
    i.neu();
    gleich(c.querySelectorAll('.sb-schacht').length, 1, 'Neues Bergwerk');
    gleich(i.getStand().geld, 0);
    gleich(i.getStand().schaechte.length, 1);
  });
});

test('Oberfläche: Knöpfe und Textknoten bleiben über viele Ticks erhalten (Klicks gehen nicht verloren)', async () => {
  const z = L.neuesBergwerk(Date.now());
  z.geld = 5;
  await mit(L.zumSpeichern(z, Date.now()), async (i, c) => {
    const vorher = [...c.querySelectorAll('button')];
    const preis = c.querySelector('[data-was="s0"] .sb-up-preis').firstChild;
    await warte(1200);
    const nachher = [...c.querySelectorAll('button')];
    gleich(nachher.length, vorher.length);
    vorher.forEach((b, n) => wahr(b === nachher[n] && b.isConnected, `Knopf ${n} neu aufgebaut`));
    wahr(c.querySelector('[data-was="s0"] .sb-up-preis').firstChild === preis, 'Textknoten bleibt');
  });
});

test('Oberfläche: bewegungReduziert schaltet die Dauerbewegung ab (Klasse sb-still)', async () => {
  await mit(null, async (i, c) => { wahr(!c.querySelector('.sb').classList.contains('sb-still')); }, { still: false });
  await mit(null, async (i, c) => { wahr(c.querySelector('.sb').classList.contains('sb-still')); }, { still: true });
});

test('Oberfläche: Pause und Fortsetzen rechnen nach dem Zeitstempel nach', async () => {
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
  faelle.push({ ...gut, schaechte: [BOESE, ...gut.schaechte.slice(1)] });
  faelle.push({ ...gut, schaechte: gut.schaechte.slice(0, 1) });
  const probleme = [];
  for (let n = 0; n < faelle.length; n++) {
    try {
      await mit(faelle[n], async (i, c) => {
        await warte(30);
        i.getStand(); i.zusammenfassung();
        if (/data-boese/.test(c.innerHTML)) probleme.push(`Fall ${n}: HTML`);
      });
    } catch (f) { probleme.push(`Fall ${n}: ${f.message}`); }
  }
  wahr(!window.__boese && !({}).verseucht);
  gleich(probleme.slice(0, 4).join(' | '), '', `${probleme.length} Probleme bei ${faelle.length} Fällen`);
});

test('Still: kein vibrate/Audio/eval/innerHTML, keine Inline-Styles als Text', async () => {
  for (const d of ['index.js', 'logik.js']) {
    const q = await fetch(new URL(`../../spiele/schachtbetrieb/${d}`, import.meta.url)).then((r) => r.text());
    wahr(!/\bvibrate\b|new\s+Audio\b|AudioContext|\.play\(\)|\beval\(|new Function|innerHTML|cssText|setAttribute\(\s*'style'/.test(q), d);
    wahr(!/Math\.random|requestAnimationFrame/.test(q), `${d}: kein Zufall, kein rAF`);
  }
  const css = await fetch(new URL('../../spiele/schachtbetrieb/stil.css', import.meta.url)).then((r) => r.text());
  wahr(!/#[0-9a-f]{3,8}\b/i.test(css), 'keine festen Farben im CSS');
});

// ---------- Level ----------
/** Zeit (s) bis zum Ziel: „Günstigstes zuerst“; bei Schacht-Zielen sparsam auf den Schacht hinsparen */
function levelZeit(n, gezielt = false) {
  let z = L.neuesBergwerk(0, n);
  const def = L.levelDef(n);
  const schachtZiel = def.ziele.some((x) => x.art === 'schaechte');
  let t = 0;
  while (t < 4000) {
    if (L.zielStand(z).erreicht) return t;
    let best = null;
    for (const w of L.moeglicheKaeufe(z)) {
      const p = L.preis(z, w);
      if (gezielt && schachtZiel && w !== 'schacht' && p > L.preis(z, 'schacht') * 0.1) continue;
      if (!best || p < best.preis) best = { was: w, preis: p };
      if (gezielt && w === 'schacht' && z.geld >= p) { best = { was: w, preis: p }; break; }
    }
    if (best && z.geld >= best.preis) { z = L.kaufe(z, best.was).zustand; continue; }
    z = L.fortschritt(z, 1);
    t++;
  }
  return 9999;
}

test('Level: Definitionen deterministisch, gedeckelt und sinnvoll', () => {
  wahr(L.LEVEL_HANDGESETZT >= 20 && L.LEVEL_HANDGESETZT <= 30, `${L.LEVEL_HANDGESETZT} handgesetzte Level`);
  for (const n of [1, 2, 25, 26, 40, 77, 500, 9999]) {
    const d = L.levelDef(n);
    tief(d, L.levelDef(n), 'deterministisch');
    wahr(d.ziele.length >= 1 && d.ziele.length <= 3);
    wahr(d.schaechte >= 1 && d.max >= d.schaechte && d.max <= L.MAX_SCHAECHTE, `Schächte Level ${n}`);
    wahr(d.geld >= 0 && d.geld <= 5000);
    for (const zi of d.ziele) {
      wahr(Number.isFinite(zi.wert) && zi.wert > 0, `Wert Level ${n}`);
      wahr(zi.art !== 'schaechte' || zi.wert <= d.max, 'Schachtziel erreichbar');
      wahr(zi.art !== 'verdient' || zi.wert <= 20000, `Taler-Ziel gedeckelt (${zi.wert})`);
    }
    wahr(L.zielText(d).length > 3);
  }
  for (const n of [0, -5, NaN, 'x', 1.5, 1e9, null, undefined]) wahr(L.levelDef(n).ziele.length >= 1, String(n));
  const w1 = L.levelDef(1).ziele[0].wert;                         // Level 1 und 7501 haben dieselbe Vorlage
  const w2 = L.levelDef(1 + L.LEVEL_HANDGESETZT * 300).ziele[0].wert;
  wahr(w2 > w1 && w2 <= w1 * 1.2 + 2, `Deckel ${w1} → ${w2}`);
});

test('Level: Fortschritt zum Ziel, Kombinationen brauchen alle Ziele', () => {
  const z = L.neuesBergwerk(0, 1);
  gleich(z.level, 1);
  gleich(z.geld, L.levelDef(1).geld);
  gleich(L.zielStand(z).anteil, 0);
  z.gesamt = 250;
  gleich(L.zielStand(z).anteil, 0.5);
  gleich(L.zielStand(z).erreicht, false);
  z.gesamt = 500;
  gleich(L.zielStand(z).erreicht, true);
  gleich(L.zielStand(z).anteil, 1);
  gleich(L.zielStand(L.neuesBergwerk(0)), null, 'Endlos hat kein Ziel');
  // Level 7: Aufzug 5 und Zentrum 4
  const k = L.neuesBergwerk(0, 7);
  k.aufzug.stufe = 5;
  gleich(L.zielStand(k).erreicht, false);
  wahr(L.zielStand(k).anteil < 1 && L.zielStand(k).anteil >= 0.5);
  k.zentrum.stufe = 4;
  gleich(L.zielStand(k).erreicht, true);
  // Schachtziel: Level 4 (2 Schächte, höchstens 2)
  let s = L.neuesBergwerk(0, 4);
  gleich(L.zielStand(s).erreicht, false);
  s.geld = 1e6;
  s = L.kaufe(s, 'schacht').zustand;
  gleich(L.zielStand(s).erreicht, true);
  gleich(L.preis(s, 'schacht'), null, 'Obergrenze der Schächte im Level');
});

test('Level: Obergrenze, Startbedingungen und Flags kommen aus der Levelnummer', () => {
  const z = L.neuesBergwerk(0, 1);
  z.geld = 1e9;
  gleich(L.preis(z, 'schacht'), null, 'Level 1 hat nur einen Schacht');
  const l8 = L.neuesBergwerk(0, 8);
  gleich(l8.schaechte.length, 2);
  gleich(l8.geld, 300);
  const s = JSON.parse(JSON.stringify(L.zumSpeichern(L.neuesBergwerk(0, 1), 1)));
  s.schaechte.push({ stufe: 1, kiste: 0 });
  gleich(L.istGueltig(s), false, 'zu viele Schächte für Level 1');
  s.level = 8;
  gleich(L.istGueltig(s), true);
  const e = JSON.parse(JSON.stringify(L.zumSpeichern(L.neuesBergwerk(0), 1)));
  e.fertig = true;
  gleich(L.istGueltig(e), false, 'Endlos kann nicht fertig sein');
  const l = JSON.parse(JSON.stringify(L.zumSpeichern(L.neuesBergwerk(0, 1), 1)));
  l.weiter = true;
  gleich(L.istGueltig(l), false, 'weiter ohne fertig');
  l.fertig = true;
  gleich(L.istGueltig(l), true, 'fertig und weiter');
});

test('Level: jedes der ersten 40 Level ist in 1–20 min erreichbar (Günstigstes zuerst bzw. zielgerichtet)', () => {
  const zeiten = [];
  for (let n = 1; n <= 40; n++) {
    const def = L.levelDef(n);
    const t = def.ziele.some((x) => x.art === 'schaechte') ? Math.min(levelZeit(n, false), levelZeit(n, true)) : levelZeit(n, false);
    zeiten.push(t);
    wahr(t >= 60 && t <= 1200, `Level ${n} (${L.zielText(def)}): ${t} s`);
  }
  const mittel = zeiten.reduce((x, y) => x + y, 0) / zeiten.length;
  wahr(mittel >= 300 && mittel <= 900, `Mittel ${Math.round(mittel)} s`);
});

test('Level: Oberfläche zeigt Ziel mit Fortschrittsbalken; Endlos zeigt keinen', async () => {
  await mit(null, async (i, c) => {
    const t = c.querySelector('.sb-hinweis').textContent;
    wahr(t.startsWith('Level 1 · Ziel: 500 Taler verdienen'), t);
    wahr(!c.querySelector('.sb-ziel-balken').hidden, 'Balken sichtbar');
    gleich(i.getStand().level, 1);
    wahr(i.zusammenfassung().startsWith('Level 1 · Ziel '), i.zusammenfassung());
  }, { variante: 'level', geloest: 0 });
  await mit(null, async (i, c) => {
    gleich(i.getStand().level, 4, 'nächstes Level nach 3 geschafften');
    wahr(c.querySelector('.sb-hinweis').textContent.startsWith('Level 4'));
  }, { variante: 'level', geloest: 3 });
  await mit(null, async (i, c) => {
    gleich(i.getStand().level, 0);
    wahr(c.querySelector('.sb-ziel-balken').hidden, 'kein Balken im Endlos-Modus');
    wahr(c.querySelector('.sb-hinweis').textContent.startsWith('Endlos'));
    wahr(i.zusammenfassung().startsWith('Endlos · '), i.zusammenfassung());
    i.neu('level');
    gleich(i.getStand().level, 1);
    i.neu('endlos');
    gleich(i.getStand().level, 0);
  }, { variante: 'endlos' });
});

test('Level: Ziel erreicht → einmal melden (mit Weiterspielen), Zähler steigt, Takt steht, Weiterspielen bleibt gespeichert', async () => {
  const z = L.neuesBergwerk(Date.now(), 1);
  z.gesamt = 600;           // Ziel (500 Taler) schon erreicht, z. B. offline
  const zaehler = { variante: 'level', geloest: 0 };
  let stand = null;
  await mit(L.zumSpeichern(z, Date.now()), async (i) => {
    await warte(150);
    gleich((zaehler.gewonnen || []).length, 1, 'einmal gemeldet');
    gleich(zaehler.gewonnen[0].opt.weiterspielen, true);
    wahr(zaehler.gewonnen[0].text.includes('Level 1'));
    gleich(zaehler.speicher.lies('geloest', 0), 1, 'Levelzähler');
    gleich(i.getStand().fertig, true);
    gleich(i.zusammenfassung(), 'Level 1 geschafft');
    const g = i.getStand().geld;
    await warte(500);
    gleich(i.getStand().geld, g, 'Takt steht nach dem Ziel');
    gleich((zaehler.gewonnen || []).length, 1, 'nicht ein zweites Mal');
    i.weiterspielen();
    gleich(i.getStand().weiter, true);
    await warte(700);
    wahr(i.getStand().geld > g, 'läuft wieder');
    gleich((zaehler.gewonnen || []).length, 1, 'Ziel wird nie ein zweites Mal gemeldet');
    stand = JSON.parse(JSON.stringify(i.getStand()));
  }, zaehler);
  const zaehler2 = { variante: 'level', geloest: 1 };
  await mit(stand, async (i, c) => {
    await warte(300);
    gleich(i.getStand().level, 1);
    gleich(i.getStand().weiter, true);
    wahr(c.querySelector('.sb-hinweis').textContent.startsWith('Endlos'));
    wahr(c.querySelector('.sb-ziel-balken').hidden);
    wahr(i.zusammenfassung().startsWith('Endlos · '));
    gleich((zaehler2.gewonnen || []).length, 0, 'keine neue Meldung');
  }, zaehler2);
  // Ein Stand mit erreichtem Ziel ohne Weiterspielen führt in ein frisches Level
  const fertig = JSON.parse(JSON.stringify(stand));
  fertig.weiter = false;
  await mit(fertig, async (i) => { gleich(i.getStand().fertig, false); }, { variante: 'level', geloest: 1 });
});

test('Level: Ziel durch einen Kauf wird sofort gemeldet', async () => {
  const z = L.neuesBergwerk(Date.now(), 2);     // Aufzug auf Stufe 3
  z.aufzug.stufe = 2;
  z.geld = 1e6;
  const zaehler = { variante: 'level', geloest: 1 };
  await mit(L.zumSpeichern(z, Date.now()), async (i, c) => {
    c.querySelector('[data-was="aufzug"]').click();
    gleich((zaehler.gewonnen || []).length, 1);
    gleich(zaehler.speicher.lies('geloest', 0), 2);
    gleich(i.getStand().fertig, true);
  }, zaehler);
});
