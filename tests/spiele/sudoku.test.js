import { test, gleich, tief, wahr } from '../mini-test.js';
import * as L from '../../spiele/sudoku/logik.js';
import { erstelleZufall } from '../../kern/zufall.js';

const aus = (zeilen) => Array.from(zeilen.join('').replace(/\./g, '0'), Number);
// Bekanntes Rätsel mit eindeutiger Lösung
const RAETSEL = aus([
  '53..7....', '6..195...', '.98....6.', '8...6...3', '4..8.3..1', '7...2...6', '.6....28.', '...419..5', '....8..79',
]);
const LOESUNG = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

test('Sudoku: Tabellen – 27 Einheiten, 20 Nachbarn je Zelle', () => {
  gleich(L.EINHEITEN.length, 27);
  wahr(L.EINHEITEN.every((u) => u.length === 9 && new Set(u).size === 9));
  wahr(L.NACHBARN.every((n) => n.length === 20));
  tief(L.BLOECKE[4], [30, 31, 32, 39, 40, 41, 48, 49, 50]);
  gleich(L.blockVon(80), 8);
  wahr(L.sieht(0, 80) === false && L.sieht(0, 20) === true);
});

test('Sudoku: Lösungszähler – eindeutig, mehrdeutig, widersprüchlich', () => {
  gleich(L.zaehleLoesungen(RAETSEL), 1);
  gleich(L.zaehleLoesungen(new Array(81).fill(0)), 2, 'leeres Gitter bricht bei 2 ab');
  const kaputt = RAETSEL.slice(); kaputt[2] = 5;   // zwei 5en in Zeile 1
  gleich(L.zaehleLoesungen(kaputt), 0);
  gleich(L.loese(RAETSEL).join(''), LOESUNG);
});

test('Sudoku: Gitter füllen ist gültig und mit Seed wiederholbar', () => {
  const a = L.fuelleGitter(erstelleZufall('g1'));
  wahr(L.istGeloest(a));
  tief(a, L.fuelleGitter(erstelleZufall('g1')));
  wahr(a.join('') !== L.fuelleGitter(erstelleZufall('g2')).join(''));
});

test('Sudoku: logischer Löser löst das bekannte Rätsel mit Singles', () => {
  const r = L.bewerte(RAETSEL, 1);
  gleich(r.geloest, true);
  gleich(r.stufe, 1);
});

const STUFE_ZAHL = { leicht: 1, mittel: 2, schwer: 3, experte: 4 };

test('Sudoku: Generator – eindeutig, Vorgaben passen, Zielstufe genau getroffen (je Stufe 4 Seeds)', () => {
  for (const stufe of L.STUFEN) {
    for (let k = 0; k < 4; k++) {
      const r = L.erzeuge(stufe, `t${k}`);
      const v = L.ausText(r.vorgabe), l = L.ausText(r.loesung);
      gleich(L.zaehleLoesungen(v), 1, `${stufe}/${k} eindeutig`);
      wahr(L.istGeloest(l), `${stufe}/${k} Lösung gültig`);
      wahr(v.every((w, i) => !w || w === l[i]), `${stufe}/${k} Vorgaben ⊆ Lösung`);
      gleich(r.erreicht, STUFE_ZAHL[stufe], `${stufe}/${k} Stufe`);
      gleich(L.bewerte(v, STUFE_ZAHL[stufe]).geloest, true, `${stufe}/${k} ohne Raten lösbar`);
      if (STUFE_ZAHL[stufe] > 1) gleich(L.bewerte(v, STUFE_ZAHL[stufe] - 1).geloest, false, `${stufe}/${k} nicht leichter`);
      wahr(L.pruefeRaetsel(r), `${stufe}/${k} pruefeRaetsel`);
    }
  }
});

test('Sudoku: Generator ist deterministisch', () => {
  tief(L.erzeuge('schwer', 'gleich'), L.erzeuge('schwer', 'gleich'));
  wahr(L.erzeuge('mittel', 'a').vorgabe !== L.erzeuge('mittel', 'b').vorgabe);
});

test('Sudoku: Techniken streichen nie die richtige Ziffer (40 Rätsel), alle kommen vor', () => {
  const gesehen = new Set();
  for (let k = 0; k < 40; k++) {
    const r = L.erzeuge(k % 2 ? 'experte' : 'schwer', `korrekt${k}`);
    const l = L.ausText(r.loesung);
    const z = L.erstelleLoeserZustand(L.ausText(r.vorgabe));
    for (let n = 0; n < 400; n++) {
      const s = L.naechsterSchritt(z, 4);
      if (!s) break;
      gesehen.add(s.technik === 'nackt' || s.technik === 'versteckt' || s.technik === 'fisch' ? `${s.technik}${s.n}` : s.technik);
      if (s.setze) gleich(s.setze.d, l[s.setze.i], `${s.technik} setzt falsch`);
      for (const e of s.entferne) wahr(!(e.maske & L.bit(l[e.i])), `${s.technik} streicht Lösung in ${e.i}`);
      wahr(L.erklaere(s).length > 10, `Text für ${s.technik}`);
      L.wendeSchrittAn(z, s);
    }
    wahr(z.werte.every(Boolean), `Rätsel ${k} gelöst`);
  }
  for (const t of ['einzigeStelle', 'einzigeZiffer', 'pointing', 'nackt2', 'versteckt2', 'fisch2', 'xyWing', 'faerbung']) {
    wahr(gesehen.has(t), `Technik ${t} nie benutzt (gesehen: ${[...gesehen].join(', ')})`);
  }
});

test('Sudoku: X-Wing wird erkannt (konstruierte Lage)', () => {
  // Die 1 nur in Spalten 2 und 8 der Zeilen 1 und 5 → in den Spalten sonst streichen
  const z = { werte: new Array(81).fill(0), kand: new Array(81).fill(L.ALLE & ~L.bit(1)) };
  for (const r of [0, 4]) for (const c of [1, 7]) z.kand[r * 9 + c] = L.ALLE;
  z.kand[2 * 9 + 1] = L.ALLE;   // Spalte 2, Zeile 3: hier fällt die 1 weg
  z.kand[6 * 9 + 7] = L.ALLE;   // Spalte 8, Zeile 7: hier auch
  const s = L.TECHNIKEN.find((t) => t.stufe === 3 && t.fn(z)?.technik === 'fisch')?.fn(z);
  wahr(s, 'kein X-Wing gefunden');
  gleich(s.d, 1);
  tief(s.entferne.map((e) => e.i).sort((a, b) => a - b), [19, 61]);
});

test('Sudoku: Hinweis – nächster Schritt mit Text, Fehler zuerst', () => {
  const v = RAETSEL, l = L.ausText(LOESUNG);
  const werte = new Array(81).fill(0);
  const h1 = L.naechsterHinweis(v, l, werte);
  gleich(h1.art, 'setze');
  gleich(h1.d, l[h1.i]);
  wahr(h1.text.includes(String(h1.d)) && h1.zellen.includes(h1.i));
  const falsch = werte.slice(); falsch[2] = l[2] === 1 ? 2 : 1;
  const h2 = L.naechsterHinweis(v, l, falsch);
  gleich(h2.art, 'fehler');
  gleich(h2.i, 2);
  // Hinweis-Schleife löst ein Experte-Rätsel komplett
  const r = L.erzeuge('experte', 'hinweis');
  const ev = L.ausText(r.vorgabe), el = L.ausText(r.loesung);
  const w = new Array(81).fill(0);
  let schritte = 0;
  for (let h = L.naechsterHinweis(ev, el, w); h; h = L.naechsterHinweis(ev, el, w)) { w[h.i] = h.d; schritte++; }
  gleich(ev.map((x, i) => x || w[i]).join(''), r.loesung);
  gleich(schritte, ev.filter((x) => !x).length);
});

test('Sudoku: Spielstand prüfen – gültig, JSON-tauglich, Unsinn wird abgelehnt', () => {
  const r = L.erzeuge('leicht', 'stand');
  const werte = L.ausText(r.vorgabe).map((x, i) => (x ? 0 : (i % 7 === 0 ? L.ausText(r.loesung)[i] : 0)));
  const st = {
    version: 1, stufe: r.stufe, seed: r.seed, vorgabe: r.vorgabe, loesung: r.loesung,
    werte: werte.join(''), notizen: new Array(81).fill(3), auswahl: 10, notizmodus: true, hinweise: 2,
    verlauf: { zurueck: [[[werte.findIndex(Boolean), 0, 5, 0, 0]]], vor: [] },
  };
  const g = L.pruefeStand(JSON.parse(JSON.stringify(st)));
  wahr(g, 'gültiger Stand abgelehnt');
  gleich(g.auswahl, 10);
  gleich(g.notizmodus, true);
  gleich(g.verlauf.zurueck.length, 1);
  wahr(g.notizen.every((n, i) => (L.ausText(r.vorgabe)[i] ? n === 0 : n === 3)), 'Notizen auf Vorgaben entfernt');
  gleich(L.pruefeStand(null), null);
  gleich(L.pruefeStand({ ...st, version: 2 }), null);
  gleich(L.pruefeStand({ ...st, werte: 'x'.repeat(81) }), null);
  gleich(L.pruefeStand({ ...st, vorgabe: r.vorgabe.slice(1) }), null);
  gleich(L.pruefeStand({ ...st, loesung: r.loesung.replace(/^./, (c) => String(c % 9 + 1)) }), null);
  gleich(L.pruefeStand({ ...st, notizen: [] }), null);
  gleich(L.pruefeStand({ ...st, stufe: 'unmoeglich' }), null);
  gleich(L.pruefeStand({ ...st, verlauf: { zurueck: [[[99, 0, 0, 0, 0]]], vor: [] } }).verlauf.zurueck.length, 0, 'kaputter Verlauf wird verworfen');
  gleich(L.pruefeStand({ ...st, vorgabe: '0'.repeat(81) }), null, 'mehrdeutig');
});

test('Sudoku: Konflikte und Kandidaten', () => {
  const w = new Array(81).fill(0);
  w[0] = 4; w[8] = 4; w[40] = 4;
  tief(L.konflikte(w), [0, 8]);
  const k = L.kandidaten(w);
  gleich(k[1] & L.bit(4), 0);
  wahr((k[10] & L.bit(4)) === 0 && (k[14] & L.bit(4)) !== 0);
});

test('Sudoku: vorrat.json ist gültig', async () => {
  const daten = await (await fetch(new URL('../../spiele/sudoku/vorrat.json', import.meta.url))).json();
  wahr(Array.isArray(daten.experte) && daten.experte.length >= 10);
  for (const r of daten.experte) {
    wahr(L.pruefeRaetsel(r), `Rätsel ${r.seed}`);
    gleich(L.bewerte(L.ausText(r.vorgabe), 4).geloest, true);
  }
});

test('Sudoku: Laufzeit je Stufe (Median von 5)', () => {
  const zeilen = [];
  for (const stufe of L.STUFEN) {
    const ms = [];
    for (let k = 0; k < 5; k++) { const t0 = performance.now(); L.erzeuge(stufe, `zeit${k}`); ms.push(performance.now() - t0); }
    ms.sort((a, b) => a - b);
    zeilen.push(`${stufe} ${ms[2].toFixed(0)} ms (max ${ms[4].toFixed(0)})`);
    wahr(ms[2] < 3000, `${stufe} zu langsam: ${zeilen.at(-1)}`);
  }
  console.info(zeilen.join(' · '));
});

test('Sudoku: still – kein Ton, keine Vibration', async () => {
  for (const datei of ['index.js', 'logik.js', 'generator.worker.js']) {
    const q = await (await fetch(new URL(`../../spiele/sudoku/${datei}`, import.meta.url))).text();
    wahr(!/\bvibrate\b|new\s+Audio\b|AudioContext|\.play\(\)/.test(q), datei);
  }
});
