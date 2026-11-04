import { test, gleich, tief, wahr } from '../mini-test.js';
import * as L from '../../spiele/nonogramm/logik.js';

const U = 0, V = 1, E = 2;
const linie = (t) => t.split('').map((c) => (c === '#' ? V : c === 'x' ? E : U));
const text = (w) => (w ? w.map((v) => (v === V ? '#' : v === E ? 'x' : '.')).join('') : null);

test('Nonogramm: Hinweise aus Bild, leere Linie = []', () => {
  const h = L.hinweiseAus('110101000', 3, 3);
  tief(h.zeilen, [[2], [1, 1], []]);
  tief(h.spalten, [[2], [1], [1]]);
});

test('Nonogramm: Zeilen-Löser – Überlappung, voll, leer, Rand, Widerspruch', () => {
  gleich(text(L.loeseLinie([6], linie('..........'))), '....##....', 'Überlappung 6 in 10');
  gleich(text(L.loeseLinie([3, 1], linie('.....'))), '###x#', 'genau passend');
  gleich(text(L.loeseLinie([], linie('.#...'))), null, 'leere Linie mit Füllung');
  gleich(text(L.loeseLinie([], linie('.....'))), 'xxxxx');
  gleich(text(L.loeseLinie([2], linie('#....'))), '##xxx', 'Randanschluss');
  gleich(text(L.loeseLinie([1, 1], linie('###..'))), null, 'zu viele gefüllt');
  gleich(text(L.loeseLinie([3], linie('..x..'))), null, 'Lücke zu klein');
  gleich(text(L.loeseLinie([2], linie('.x...'))), 'xx.#.', 'Lücke links zu klein');
});

test('Nonogramm: Zeilen-Löser == Aufzählung (zufällige Linien bis Länge 12)', () => {
  const brute = (hinweis, l) => {
    const n = l.length, treffer = [];
    for (let m = 0; m < (1 << n); m++) {
      const w = Array.from({ length: n }, (_, i) => (m >> i) & 1);
      if (w.some((v, i) => (l[i] === V && !v) || (l[i] === E && v))) continue;
      const bl = L.bloecke(w);
      if (bl.length === hinweis.length && bl.every((v, j) => v === hinweis[j])) treffer.push(w);
    }
    if (!treffer.length) return null;
    return l.map((v, i) => (treffer.every((t) => t[i]) ? V : treffer.every((t) => !t[i]) ? E : v));
  };
  let seed = 12345;
  const zz = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let t = 0; t < 600; t++) {
    const n = 1 + Math.floor(zz() * 12);
    const bild = Array.from({ length: n }, () => (zz() < 0.5 ? 1 : 0));
    const hinweis = zz() < 0.2 ? L.bloecke(Array.from({ length: n }, () => (zz() < 0.5 ? 1 : 0))) : L.bloecke(bild);
    const l = bild.map((v) => { const r = zz(); return r < 0.65 ? U : r < 0.9 ? (v ? V : E) : (v ? E : V); });
    gleich(JSON.stringify(L.loeseLinie(hinweis, l)), JSON.stringify(brute(hinweis, l)), `Fall ${t}`);
  }
});

test('Nonogramm: Propagation – eindeutig vs. mehrdeutig', () => {
  gleich(L.istLogischLoesbar('0110111111110110', 4, 4), true);
  // 2×2-Schachbrett ist mehrdeutig → Löser steckt
  gleich(L.loeseLogisch(2, 2, L.hinweiseAus('1001', 2, 2)).status, 'steckt');
  gleich(L.istLogischLoesbar('1001', 2, 2), false);
});

test('Nonogramm: Generator – alle Größen logisch eindeutig lösbar', () => {
  for (const [n, anzahl] of [[5, 40], [10, 25], [15, 10], [20, 5]]) {
    for (let k = 0; k < anzahl; k++) {
      const r = L.erzeuge(n, n, `t${k}`);
      gleich(r.loesung.length, n * n);
      wahr(L.istLogischLoesbar(r.loesung, n, n), `${n}×${n} Seed t${k} nicht ohne Raten lösbar`);
    }
  }
});

test('Nonogramm: Generator – gleicher Seed → gleiches Rätsel', () => {
  gleich(L.erzeuge(15, 15, 'abc').loesung, L.erzeuge(15, 15, 'abc').loesung);
  wahr(L.erzeuge(10, 10, 'a').loesung !== L.erzeuge(10, 10, 'b').loesung);
});

test('Nonogramm: motive.json – mind. 20 Motive, Maße, Titel, eindeutig ohne Raten', async () => {
  const d = await fetch(new URL('../../spiele/nonogramm/motive.json', import.meta.url)).then((r) => r.json());
  wahr(Array.isArray(d.motive) && d.motive.length >= 20, 'zu wenige Motive');
  const ids = new Set();
  for (const roh of d.motive) {
    const m = L.motivAus(roh);
    wahr(m, `Motiv ungültig: ${roh?.id}`);
    wahr(!ids.has(m.id), `doppelte ID ${m.id}`); ids.add(m.id);
    wahr(m.titel.length > 0 && m.b >= 5 && m.h >= 5 && m.b <= 15 && m.h <= 15, `Maße/Titel ${m.id}`);
    wahr(L.istLogischLoesbar(m.loesung, m.b, m.h), `Motiv ${m.id} nicht ohne Raten lösbar`);
  }
});

test('Nonogramm: erledigte Zahlen – vom Rand abgeschlossen, komplett, Widerspruch', () => {
  const st = (h, t) => L.linienStatus(h, t.split(''));
  tief(st([2, 1], '##x......').erledigt, [true, false]);
  tief(st([2, 1], '##.......').erledigt, [false, false], 'Block nicht abgeschlossen');
  tief(st([2, 1], '.......x#').erledigt, [false, true], 'von rechts');
  tief(st([2, 1], '..##...#.').erledigt, [true, true], 'Blöcke passen genau');
  gleich(st([2, 1], '..##...#.').komplett, true);
  gleich(st([1], '##.......').widerspruch, true);
  tief(st([3], 'x##x.....').erledigt, [false], 'falsche Länge wird nicht abgehakt');
});

test('Nonogramm: Hinweis-Schleife löst ein Motiv, Fehler werden zuerst korrigiert', () => {
  const loesung = '0110111111110110';
  let s = L.neuerStand({ quelle: 'zufall', b: 4, h: 4, loesung, seed: 'x' });
  s.zellen = '#' + s.zellen.slice(1);       // falsch gefüllt (Lösung: 0)
  const f = L.naechsterSchritt(s);
  gleich(f.typ, 'fehler');
  gleich(f.index, 0);
  for (let k = 0; k < 40 && !L.istGeloest(s); k++) {
    const r = L.naechsterSchritt(s);
    wahr(r, 'kein Hinweis gefunden');
    wahr(typeof r.text === 'string' && r.text.length > 10);
    s = { ...s, zellen: s.zellen.slice(0, r.index) + r.wert + s.zellen.slice(r.index + 1) };
  }
  gleich(L.istGeloest(s), true);
  gleich(L.falscheZellen(s).length, 0);
});

test('Nonogramm: Gewinn nur über Hinweise, Kreuze egal', () => {
  const s = L.neuerStand({ quelle: 'motiv', b: 2, h: 2, loesung: '1100', motivId: 'm', titel: 'T' });
  gleich(L.istGeloest(s), false);
  gleich(L.istGeloest({ ...s, zellen: '##..' }), true);
  gleich(L.istGeloest({ ...s, zellen: '##xx' }), true);
  gleich(L.istGeloest({ ...s, zellen: '###.' }), false);
});

test('Nonogramm: Spielstand prüfen, Zug vor/zurück, JSON-tauglich', () => {
  const s = L.neuerStand({ quelle: 'zufall', b: 5, h: 5, loesung: L.erzeuge(5, 5, 'q').loesung, seed: 'q' });
  const zug = [[0, '.', '#'], [1, '.', '#'], [2, '.', 'x']];
  const z1 = L.wendeZugAn(s.zellen, zug);
  gleich(z1.slice(0, 3), '##x');
  gleich(L.wendeZugAn(z1, zug, true), s.zellen);
  wahr(L.istGueltigerZug(zug, 25));
  wahr(!L.istGueltigerZug([[25, '.', '#']], 25));
  const geladen = L.pruefeStand(JSON.parse(JSON.stringify({ ...s, zellen: z1 })));
  gleich(geladen.zellen, z1);
  tief(geladen.hinweise, s.hinweise);
  gleich(L.pruefeStand(null), null);
  gleich(L.pruefeStand({ ...s, zellen: 'abc' }), null);
  gleich(L.pruefeStand({ ...s, loesung: '2'.repeat(25) }), null);
  gleich(L.pruefeStand({ ...s, b: Infinity }), null);
  gleich(L.pruefeStand({ ...s, quelle: 'tag' }), null);
});

test('Nonogramm: still – keine Töne/Vibration in den Spieldateien', async () => {
  for (const d of ['index.js', 'logik.js', 'generator.worker.js']) {
    const q = await fetch(new URL(`../../spiele/nonogramm/${d}`, import.meta.url)).then((r) => r.text());
    wahr(!/\bvibrate\b|new\s+Audio\b|AudioContext|\.play\(\)|\beval\(|new Function/.test(q), d);
  }
});
