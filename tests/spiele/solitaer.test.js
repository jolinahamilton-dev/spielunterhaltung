import { test, gleich, tief, wahr } from '../mini-test.js';
import {
  ANZAHL, STUFEN, STUFEN_IDS, ZUEGE_MAX, farbeVon, rangVon, istRot, kartenName, geben, wende, gewonnen,
  zugFuer, autoZug, loese, gibtFortschritt, hinweisFuer, erzeuge, rueckfallDeck, neuesSpiel, zieheZug,
  rueckgaengig, wiederholen, kannRueckgaengig, kannWiederholen, neustart, zumSpeichern, ausSpeicher, istGueltig, zugText,
} from '../../spiele/solitaer/logik.js';
import { erstelleZufall } from '../../kern/zufall.js';

// Karten: Herz Ass = 0 … Herz König = 12 · Karo 13–25 · Pik 26–38 · Kreuz 39–51
const K = (farbe, rang) => farbe * 13 + rang - 1;       // rang 1 = Ass … 13 = König
const H = (r) => K(0, r), KA = (r) => K(1, r), P = (r) => K(2, r), KR = (r) => K(3, r);

/** Zustand von Hand: spalten = [[verdeckt…], [offen…]] oder nur [offen…] */
function zustand(spalten, { f = [0, 0, 0, 0], stapel = [], ablage = [], zieh = 1 } = {}) {
  const sp = Array.from({ length: 7 }, (_, i) => {
    const s = spalten[i] ?? [];
    if (s.length && Array.isArray(s[0])) return { k: [...s[0], ...s[1]], zu: s[0].length };
    return { k: s.slice(), zu: 0 };
  });
  return { sp, f, stapel, ablage, zieh };
}
const deck = (seed) => erstelleZufall(seed).mische(Array.from({ length: ANZAHL }, (_, i) => i));
const bunt = (z) => JSON.stringify(z);

test('Solitär: Karten – Farbe, Rang, Rot/Schwarz, Name', () => {
  gleich(farbeVon(H(1)), 0); gleich(rangVon(H(1)), 0);
  gleich(farbeVon(KR(13)), 3); gleich(rangVon(KR(13)), 12);
  wahr(istRot(H(5)) && istRot(KA(5)) && !istRot(P(5)) && !istRot(KR(5)));
  gleich(kartenName(P(12)), 'Pik Dame');
  gleich(kartenName(H(1)), 'Herz Ass');
});

test('Solitär: Geben – 1 bis 7 Karten, nur die oberste offen, Rest im Stapel', () => {
  const z = geben(deck('geben'), 1);
  tief(z.sp.map((c) => c.k.length), [1, 2, 3, 4, 5, 6, 7]);
  tief(z.sp.map((c) => c.zu), [0, 1, 2, 3, 4, 5, 6]);
  gleich(z.stapel.length, 24);
  const alle = [...z.sp.flatMap((c) => c.k), ...z.stapel].sort((a, b) => a - b);
  tief(alle, Array.from({ length: 52 }, (_, i) => i));
});

test('Solitär: Spalten – absteigend, Farbe wechselt, Folge wandert, Aufdecken', () => {
  let z = zustand([[[KR(2)], [H(8), P(7)]], [KA(9)], [P(9)]]);
  // Folge H8,P7 auf Karo 9 (rot 8 auf rot 9 → nicht erlaubt), auf Pik 9 erlaubt
  gleich(wende(z, [4, 0, 1, 2]), null, 'rot auf rot');
  const n = wende(z, [4, 0, 2, 2]);
  tief(n.sp[2].k, [P(9), H(8), P(7)]);
  tief(n.sp[0].k, [KR(2)]);
  gleich(n.sp[0].zu, 0, 'verdeckte Karte wurde aufgedeckt');
  gleich(wende(z, [4, 0, 2, 3]), null, 'mehr Karten als offen');
  gleich(wende(z, [4, 0, 0, 1]), null, 'gleiche Spalte');
  // Teilfolge: nur P7 auf Karo 8? Karo 9 braucht schwarze 8 → nicht P7
  z = zustand([[H(8), P(7)], [KA(9)]]);
  tief(wende(z, [4, 0, 1, 2])?.sp[1].k ?? null, null);
  z = zustand([[P(8), H(7)], [KA(9)]]);
  tief(wende(z, [4, 0, 1, 2]).sp[1].k, [KA(9), P(8), H(7)]);
  tief(wende(z, [4, 0, 1, 1])?.sp[1].k ?? null, null, 'H7 auf Karo 9 geht nicht');
});

test('Solitär: freie Spalte nimmt nur einen König (mit Folge)', () => {
  const z = zustand([[H(12)], [KR(13), KA(12)], [P(3)], []]);
  gleich(wende(z, [4, 2, 3, 1]), null, 'Pik 3 auf leere Spalte');
  gleich(wende(z, [4, 0, 3, 1]), null, 'Dame auf leere Spalte');
  const n = wende(z, [4, 1, 3, 2]);
  tief(n.sp[3].k, [KR(13), KA(12)]);
  tief(n.sp[1].k, []);
});

test('Solitär: Ablagen – nur gleiche Farbe aufsteigend, auch zurück in die Spalte', () => {
  let z = zustand([[H(1)], [H(2)], [P(1)]]);
  const a = wende(z, [5, 0]);
  tief(a.f, [1, 0, 0, 0]);
  // Pik Ass geht auf die Ablage Pik
  tief(wende(z, [5, 2]).f, [0, 0, 1, 0]);
  gleich(wende(z, [5, 1]), null, 'Herz 2 ohne Ass');
  const b = wende(a, [5, 1]);
  tief(b.f, [2, 0, 0, 0]);
  // zurück in eine Spalte: Herz 2 auf Pik 3
  const z2 = zustand([[P(3)]], { f: [2, 0, 0, 0] });
  tief(wende(z2, [6, 0, 0]).sp[0].k, [P(3), H(2)]);
  tief(wende(z2, [6, 0, 0]).f, [1, 0, 0, 0]);
  gleich(wende(z2, [6, 1, 0]), null, 'leere Ablage');
  gleich(wende(z, [6, 0, 0]), null, 'leere Ablage');
});

test('Solitär: Stapel – 1 bzw. 3 Karten ziehen, Umdrehen, unbegrenzt', () => {
  let z = zustand([], { stapel: [1, 2, 3, 4, 5], zieh: 3 });
  z = wende(z, [0]);
  tief(z.ablage, [5, 4, 3]); tief(z.stapel, [1, 2]);
  z = wende(z, [0]);
  tief(z.ablage, [5, 4, 3, 2, 1]); tief(z.stapel, []);
  gleich(wende(z, [0]), null, 'Stapel leer');
  z = wende(z, [1]);
  tief(z.stapel, [1, 2, 3, 4, 5]); tief(z.ablage, []);
  gleich(wende(z, [1]), null, 'Stapel nicht leer');
  // Durchgänge sind unbegrenzt
  for (let i = 0; i < 40; i++) { z = wende(z, [0]); z = z.stapel.length ? z : wende(z, [1]); wahr(z); }
  const e1 = zustand([], { stapel: [7, 8], zieh: 1 });
  tief(wende(e1, [0]).ablage, [8]);
});

test('Solitär: Stapel-Karte spielen, Aufdecken der Ablage', () => {
  const z = zustand([[P(8)]], { ablage: [H(9), H(7)] });
  tief(wende(z, [2, 0]).sp[0].k, [P(8), H(7)]);
  tief(wende(z, [2, 0]).ablage, [H(9)]);
  gleich(wende(z, [2, 1]), null, 'Herz 7 auf leere Spalte');
});

test('Solitär: Ungültige Züge werden abgelehnt (auch kaputte Formate)', () => {
  const z = geben(deck('kaputt'), 1);
  for (const m of [null, 0, 'x', [], [99], [4], [4, 0, 1], [4, 0, 1, 1.5], [4, -1, 1, 1], [4, 0, 9, 1], [2, 7], [5, 'a'], [6, 4, 0], [0, 1], { 0: 1 }]) {
    gleich(wende(z, m), null, JSON.stringify(m));
  }
});

test('Solitär: Automatisch auf Ablagen – ein Zug, alles Mögliche, Aufdecken folgt', () => {
  const z = zustand([[[H(2)], [H(1)]], [KA(1)], [KA(2)]], { ablage: [P(1)] });
  const n = wende(z, [7]);
  tief(n.f, [2, 2, 1, 0]);
  tief(n.sp.map((c) => c.k), [[], [], [], [], [], [], []]);
  gleich(wende(n, [7]), null, 'nichts mehr zu tun');
  gleich(wende(zustand([[P(5)]]), [7]), null);
});

test('Solitär: Gewinn erkannt', () => {
  const z = zustand([], { f: [13, 13, 13, 13] });
  wahr(gewonnen(z));
  wahr(!gewonnen(zustand([], { f: [13, 13, 13, 12] })));
});

test('Solitär: Tippen – bestes Ziel (Ablage vor Spalte, volle vor leerer Spalte)', () => {
  // Herz 1 oben auf Spalte 0: Ablage; Pik 7 darf auf Herz 8
  let z = zustand([[H(1)], [H(8)], [P(7)]]);
  tief(autoZug(z, { ort: 'spalte', s: 0, i: 0 }), [5, 0]);
  tief(autoZug(z, { ort: 'spalte', s: 2, i: 0 }), [4, 2, 1, 1]);
  // König: kein Sinn, allein auf leere Spalte zu schieben
  z = zustand([[KR(13)], [], [P(5)]]);
  gleich(autoZug(z, { ort: 'spalte', s: 0, i: 0 }), null);
  // König mit verdeckten Karten darunter wandert auf die leere Spalte
  z = zustand([[[H(3)], [KR(13)]], []]);
  tief(autoZug(z, { ort: 'spalte', s: 0, i: 1 }), [4, 0, 1, 1]);
  // Ablage → Spalte
  z = zustand([[KA(9)]], { ablage: [P(8)] });
  tief(autoZug(z, { ort: 'ablage' }), [2, 0]);
  // von der Ablage zurück in die Spalte
  z = zustand([[P(3)]], { f: [2, 0, 0, 0] });
  tief(autoZug(z, { ort: 'fundament', s: 0 }), [6, 0, 0]);
  gleich(autoZug(zustand([[P(3)]]), { ort: 'ablage' }), null);
});

test('Solitär: Ziehen – zugFuer prüft Ziel', () => {
  const z = zustand([[P(8), H(7)], [KA(9)], [P(9)]]);
  tief(zugFuer(z, { ort: 'spalte', s: 0, i: 0 }, { ort: 'spalte', s: 1 }), [4, 0, 1, 2]);
  gleich(zugFuer(z, { ort: 'spalte', s: 0, i: 1 }, { ort: 'spalte', s: 1 }), null);
  gleich(zugFuer(z, { ort: 'spalte', s: 0, i: 0 }, { ort: 'fundament' }), null);
});

test('Solitär: Spiel – Rückgängig/Wiederholen unbegrenzt, Wiederholen verfällt', () => {
  let sp = neuesSpiel(deck('verlauf'), 'mittel', 'verlauf');
  gleich(kannRueckgaengig(sp), false);
  const start = bunt(sp.z);
  let n = 0;
  for (let i = 0; i < 200; i++) {
    const z = sp.z;
    const m = z.stapel.length ? [0] : [1];
    sp = zieheZug(sp, m);
    n++;
  }
  gleich(sp.zuege.length, n);
  const mitte = rueckgaengig(rueckgaengig(sp));
  gleich(mitte.zuege.length, n - 2);
  gleich(kannWiederholen(mitte), true);
  const wieder = wiederholen(wiederholen(mitte));
  gleich(bunt(wieder.z), bunt(sp.z));
  let zurueck = sp;
  while (kannRueckgaengig(zurueck)) zurueck = rueckgaengig(zurueck);
  gleich(bunt(zurueck.z), start, 'alles zurück = Anfang');
  gleich(zurueck.vor.length, n);
  // neuer Zug nach Rückgängig löscht Wiederholen
  const eins = zieheZug(rueckgaengig(zieheZug(neuesSpiel(deck('v2'), 'leicht', 'v2'), [0])), [0]);
  gleich(kannWiederholen(eins), false);
  tief(zumSpeichern(neustart(sp)).zuege, []);
  gleich(zieheZug(sp, [4, 0, 0, 1]), null, 'unzulässig');
});

test('Solitär: Spielstand – Speichern/Laden rund, JSON-tauglich', () => {
  let sp = neuesSpiel(deck('stand'), 'mittel', 'stand');
  for (let i = 0; i < 9; i++) sp = zieheZug(sp, sp.z.stapel.length ? [0] : [1]);
  sp = rueckgaengig(rueckgaengig(sp));
  const roh = JSON.parse(JSON.stringify(zumSpeichern(sp)));
  gleich(roh.v, 1);
  const neu = ausSpeicher(roh);
  gleich(bunt(neu.z), bunt(sp.z));
  tief(neu.vor, sp.vor);
  gleich(istGueltig(roh), true);
  gleich(kannWiederholen(neu), true);
});

test('Solitär: Spielstand – streng validiert', () => {
  let sp = neuesSpiel(deck('streng'), 'leicht', 'streng');
  sp = zieheZug(sp, [0]);
  const gut = zumSpeichern(sp);
  const kopie = (f) => { const o = JSON.parse(JSON.stringify(gut)); f(o); return o; };
  const schlecht = [
    null, 0, 'x', [], {}, { v: 2 },
    kopie((o) => { o.v = 2; }),
    kopie((o) => { o.stufe = 'extrem'; }),
    kopie((o) => { o.stufe = '__proto__'; }),
    kopie((o) => { o.stufe = 'constructor'; }),
    kopie((o) => { o.seed = 5; }),
    kopie((o) => { o.seed = ''; }),
    kopie((o) => { o.seed = 'x'.repeat(65); }),
    kopie((o) => { o.deal = o.deal.slice(1); }),
    kopie((o) => { o.deal[0] = o.deal[1]; }),           // doppelte Karte
    kopie((o) => { o.deal[3] = 52; }),
    kopie((o) => { o.deal[3] = -1; }),
    kopie((o) => { o.deal[3] = 1.5; }),
    kopie((o) => { o.deal[3] = '4'; }),
    kopie((o) => { o.deal.push(1); }),
    kopie((o) => { o.zuege = 'x'; }),
    kopie((o) => { o.zuege = [[99]]; }),
    kopie((o) => { o.zuege = [[0, 0]]; }),
    kopie((o) => { o.zuege = [[1]]; }),                  // Umdrehen bei vollem Stapel
    kopie((o) => { o.zuege = [[4, 0, 0, 1]]; }),
    kopie((o) => { o.zuege = [null]; }),
    kopie((o) => { o.vor = [[1]]; }),
    kopie((o) => { o.vor = [[0], [0], 'x']; }),
    kopie((o) => { o.zuege = new Array(ZUEGE_MAX + 1).fill([0]); }),
    kopie((o) => { o.vor = new Array(ZUEGE_MAX + 1).fill([0]); }),
    kopie((o) => { delete o.deal; }),
    kopie((o) => { o.zuege = {}; }),
  ];
  for (const s of schlecht) {
    gleich(istGueltig(s), false, JSON.stringify(s)?.slice(0, 80));
  }
  gleich(istGueltig(gut), true);
  // Prototyp-Verschmutzung ist wirkungslos
  gleich(istGueltig(JSON.parse('{"v":1,"__proto__":{"x":1},"stufe":"leicht","seed":"a","deal":[],"zuege":[],"vor":[]}')), false);
});

test('Solitär: Löser – Lösung spielt bis zum Sieg (Ziehen 1)', () => {
  let gefunden = 0;
  for (let i = 0; i < 12; i++) {
    const z0 = geben(deck(`loeser-${i}`), 1);
    const r = loese(z0, { budget: 6000 });
    if (!r.gefunden) continue;
    gefunden++;
    let z = z0;
    for (const m of r.zuege) { z = wende(z, m); wahr(z, `Zug ${JSON.stringify(m)} unzulässig`); }
    wahr(gewonnen(z), 'Lösung endet nicht im Sieg');
  }
  wahr(gefunden >= 3, `nur ${gefunden} von 12 gelöst`);
});

test('Solitär: Löser – deterministisch, Budget begrenzt (kein Zeitlimit)', () => {
  const z0 = geben(deck('det'), 3);
  const a = loese(z0, { budget: 500 }), b = loese(z0, { budget: 500 });
  tief(a, b);
  wahr(a.knoten <= 501);
});

test('Solitär: Löser – Aufgabe von Hand (alles offen, einfacher Sieg)', () => {
  // zwei Spalten, alle Karten offen: Ablagen in Reihenfolge
  // eine fast fertige Aufgabe
  const fast = zustand([[KR(13)]], { f: [13, 13, 13, 12] });
  const r2 = loese(fast);
  gleich(r2.gefunden, true);
  tief(r2.zuege, [[5, 0]]);
  gleich(hinweisFuer(fast).gewinnWeg, true);
  tief(hinweisFuer(fast).zug, [5, 0]);
});

test('Solitär: Hinweis – liefert immer einen legalen Zug, wenn einer existiert', () => {
  for (let i = 0; i < 8; i++) {
    const z = geben(deck(`hint-${i}`), i % 2 ? 3 : 1);
    const r = hinweisFuer(z, 3000);
    wahr(r.zug, 'kein Hinweis');
    wahr(wende(z, r.zug), 'Hinweis nicht legal');
    wahr(zugText(z, r.zug).length > 3);
  }
});

test('Solitär: Kein Zug mehr – erkannt, wenn nichts mehr weiterhilft', () => {
  // Zwei Könige, Stapel und Ablage leer, nichts bewegt sich weiter
  const fest = zustand([[KR(13)], [H(13)], [P(13)], [KA(13)]]);
  gleich(gibtFortschritt(fest), false);
  // Mit Ass obenauf geht es weiter
  const weiter = zustand([[KR(13)], [H(1)]]);
  gleich(gibtFortschritt(weiter), true);
  // verdeckte Karte kann aufgedeckt werden
  const decken = zustand([[[H(5)], [P(8)]], [KA(9)]]);
  gleich(gibtFortschritt(decken), true);
});

test('Solitär: Generator – Stufen, Gültigkeit, Determinismus', () => {
  gleich(STUFEN_IDS.join(','), 'leicht,mittel,schwer');
  for (const stufe of STUFEN_IDS) {
    const a = erzeuge(stufe, 'seed-a'), b = erzeuge(stufe, 'seed-a'), c = erzeuge(stufe, 'seed-b');
    tief(a.deck, b.deck, 'gleicher Seed');
    wahr(JSON.stringify(a.deck) !== JSON.stringify(c.deck), 'anderer Seed gibt anderes Deck');
    tief([...a.deck].sort((x, y) => x - y), Array.from({ length: 52 }, (_, i) => i));
  }
});

test('Solitär: Generator Leicht – 12 Seeds, alle lösbar (Löser spielt zum Sieg)', () => {
  for (let i = 0; i < 12; i++) {
    const e = erzeuge('leicht', `leicht-${i}`);
    wahr(e.geprueft);
    const z0 = geben(e.deck, 1);
    const r = loese(z0, { budget: 40000 });
    wahr(r.gefunden, `Seed ${i} nicht lösbar`);
    let z = z0;
    for (const m of r.zuege) { z = wende(z, m); wahr(z); }
    wahr(gewonnen(z));
  }
});

test('Solitär: Generator Schwer – 4 Seeds, lösbar mit Ziehen 3, aber nicht offensichtlich', () => {
  for (let i = 0; i < 4; i++) {
    const e = erzeuge('schwer', `schwer-${i}`);
    const z0 = geben(e.deck, 3);
    const r = loese(z0, { budget: 60000 });
    wahr(r.gefunden, `Seed ${i} nicht lösbar`);
    let z = z0;
    for (const m of r.zuege) { z = wende(z, m); wahr(z); }
    wahr(gewonnen(z));
    gleich(loese(z0, { budget: STUFEN.schwer.zuLeicht }).gefunden, false, 'zu einfach');
  }
});

test('Solitär: Generator Mittel – 30 Seeds, gültige Decks ohne Prüfung', () => {
  for (let i = 0; i < 30; i++) {
    const e = erzeuge('mittel', `mittel-${i}`);
    gleich(e.geprueft, false);
    wahr(istGueltig({ v: 1, stufe: 'mittel', seed: 's', deal: e.deck, zuege: [], vor: [] }));
  }
});

test('Solitär: Rückfall-Deck ist lösbar', () => {
  const d = rueckfallDeck('leicht');
  wahr(loese(geben(d, 1), { budget: 60000 }).gefunden);
  tief([...d].sort((x, y) => x - y), Array.from({ length: 52 }, (_, i) => i));
  tief(rueckfallDeck('leicht'), d, 'deterministisch');
});

test('Solitär: komplette Partie per Löser über das Spiel-Objekt (Zugzähler, Gewinn)', () => {
  const e = erzeuge('leicht', 'partie');
  let sp = neuesSpiel(e.deck, 'leicht', 'partie');
  const r = loese(sp.z, { budget: 40000 });
  wahr(r.gefunden);
  for (const m of r.zuege) { sp = zieheZug(sp, m); wahr(sp); }
  wahr(gewonnen(sp.z));
  gleich(sp.zuege.length, r.zuege.length);
  const neu = ausSpeicher(JSON.parse(JSON.stringify(zumSpeichern(sp))));
  wahr(gewonnen(neu.z));
});

test('Solitär: Quelltext – kein Audio, keine Vibration, kein eval, kein innerHTML mit Daten', async () => {
  for (const datei of ['index.js', 'logik.js', 'generator.worker.js']) {
    const text = await (await fetch(new URL(`../../spiele/solitaer/${datei}`, import.meta.url))).text();
    wahr(!/vibrate|AudioContext|new Audio|\.play\(|eval\(|new Function|innerHTML|insertAdjacentHTML/.test(text), `${datei} enthält Verbotenes`);
  }
  const css = await (await fetch(new URL('../../spiele/solitaer/stil.css', import.meta.url))).text();
  wahr(!/@import|url\(http/.test(css));
});

// ---------- Robustheit der Oberfläche (wie tests/kern/robustheit.test.js, solange das Spiel nicht in der Registry steht) ----------
import modul from '../../spiele/solitaer/index.js';
import { erstelleSpeicher } from '../../kern/speicher.js';
import { erstelleEinstellungen } from '../../kern/einstellungen.js';
import { neuerSeed } from '../../kern/zufall.js';
import { erstelleFarben } from '../../kern/farben.js';
import { erstelleWorker } from '../../kern/worker-helfer.js';
import * as eingabe from '../../kern/eingabe.js';
import { falscherSpeicher } from '../kern/hilfen.js';

function kontext(signal, log = []) {
  const speicher = erstelleSpeicher({ backend: falscherSpeicher() });
  const einstellungen = erstelleEinstellungen(speicher);
  return {
    variante: 'leicht',
    speicher: speicher.bereich('solitaer:daten:'),
    einstellungen: Object.assign(Object.create(einstellungen), { spiel: einstellungen.spiel('solitaer') }),
    statistik: { melde() {} }, zufall: (s, z) => erstelleZufall(s, z), neuerSeed,
    farben: erstelleFarben(einstellungen), eingabe, signal, bewegungReduziert: () => true,
    worker: (pfad) => erstelleWorker(new URL(pfad, new URL('../../', import.meta.url)), { signal }),
    meldung() {}, meldeAenderung: () => log.push('aenderung'), meldeGewonnen: (t) => log.push(`gewonnen:${t}`), neuesSpiel() {},
  };
}
async function starteSpiel(stand, ms = 60, vorher = null) {
  const fehler = [];
  const beiFehler = (e) => { if (/ResizeObserver loop/.test(e.message || '')) { e.preventDefault?.(); return; } fehler.push(e.error?.message || e.reason?.message || String(e.message || e.reason)); e.preventDefault?.(); };
  window.addEventListener('error', beiFehler); window.addEventListener('unhandledrejection', beiFehler);
  const ac = new AbortController(), log = [];
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:700px';
  document.body.append(box);
  let inst = null;
  try {
    inst = modul.erstelle(box, kontext(ac.signal, log), stand);
    await new Promise((r) => setTimeout(r, ms));
    await vorher?.(inst, box, log);
    inst.getStand(); inst.zusammenfassung();
  } catch (f) { fehler.push(f?.message || String(f)); }
  const html = box.innerHTML;
  try { inst?.zerstoere(); } catch (f) { fehler.push(`zerstoere: ${f.message}`); }
  ac.abort(); box.remove();
  window.removeEventListener('error', beiFehler); window.removeEventListener('unhandledrejection', beiFehler);
  return { fehler, html, log };
}

test('Solitär: Oberfläche überlebt kaputte und manipulierte Spielstände', async () => {
  const BOESE = '<img src=x data-boese="1"><script data-boese="1">window.__boese=1</script>';
  const gut = zumSpeichern(zieheZug(neuesSpiel(deck('ober'), 'mittel', 'ober'), [0]));
  const faelle = [null, 0, 'x', [], {}, { v: 1 }, JSON.parse('{"__proto__":{"verseucht":1}}')];
  for (const k of Object.keys(gut)) {
    for (const w of [BOESE, -1, 1e12, null, [], {}, [BOESE], { a: BOESE }, true, 'NaN']) faelle.push({ ...gut, [k]: w });
    if (Array.isArray(gut[k]) && gut[k].length) { faelle.push({ ...gut, [k]: [BOESE, ...gut[k].slice(1)] }); faelle.push({ ...gut, [k]: gut[k].slice(0, 1) }); }
  }
  const ok = await starteSpiel(gut, 100);
  gleich(ok.fehler.join('|'), '', 'gültiger Stand');
  gleich(ok.html.includes('so-karte'), true);
  const probleme = [];
  for (let i = 0; i < faelle.length; i++) {
    const r = await starteSpiel(faelle[i], 15);
    if (r.fehler.length) probleme.push(`Fall ${i}: ${r.fehler[0]}`);
    if (/data-boese/.test(r.html)) probleme.push(`Fall ${i}: HTML eingeschleust`);
    if (window.__boese) probleme.push(`Fall ${i}: Skript ausgeführt`);
    if (({}).verseucht) probleme.push(`Fall ${i}: Prototyp verändert`);
  }
  gleich(probleme.slice(0, 5).join(' | '), '', `${probleme.length} Probleme bei ${faelle.length} Fällen`);
});

test('Solitär: Oberfläche – Taste A gewinnt, Rückgängig/Wiederholen/Neustart', async () => {
  // Lösung bis auf die letzten reinen Ablagezüge spielen, dann „Automatisch“ drücken
  const e = erzeuge('leicht', 'ober-gewinn');
  const r = loese(geben(e.deck, 1), { budget: 40000 });
  let rest = 0;
  while (rest < r.zuege.length && [3, 5].includes(r.zuege[r.zuege.length - 1 - rest][0])) rest++;
  wahr(rest >= 1);
  let sp = neuesSpiel(e.deck, 'leicht', 'ober-gewinn');
  for (const m of r.zuege.slice(0, r.zuege.length - rest)) sp = zieheZug(sp, m);
  const res = await starteSpiel(zumSpeichern(sp), 100, async (inst, box, log) => {
    const taste = (k) => inst.onTaste(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    wahr(taste('a'), 'Taste A nicht verarbeitet');
    wahr(log.some((l) => l.startsWith('gewonnen:')), 'kein Gewinn gemeldet');
    inst.rueckgaengig();
    wahr(inst.kannWiederholen());
    inst.wiederholen();
    inst.neustart();
    gleich(inst.getStand().zuege.length, 0);
    wahr(!inst.kannRueckgaengig());
    wahr(taste(' '), 'Leertaste zieht');
    gleich(inst.getStand().zuege.length, 1);
  });
  gleich(res.fehler.join('|'), '');
});
