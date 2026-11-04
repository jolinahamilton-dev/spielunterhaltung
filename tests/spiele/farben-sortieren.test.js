import { test, gleich, tief, wahr } from '../mini-test.js';
import {
  STUFEN, STUFEN_IDS, menge, giesse, umkehren, geloest, gueltigeZuege, hatSinnvollenZug, loese, loeseBest,
  pruefeLoesung, erzeugeLevel, vorwaerts, rueckwaerts, standGueltig, obenBlock,
} from '../../spiele/farben-sortieren/logik.js';
import { erstelleZufall } from '../../kern/zufall.js';

/** kleine BFS ohne Schnitte – wahre Mindestzugzahl (nur für kleine Fälle) */
function bfs(roehren, k) {
  const key = (r) => r.map((x) => x.join(',')).sort().join('|');
  let ebene = [roehren];
  const gesehen = new Set([key(roehren)]);
  for (let d = 0; d < 40; d++) {
    if (ebene.some((r) => geloest(r, k))) return d;
    const naechste = [];
    for (const r of ebene) {
      for (const [a, b] of gueltigeZuege(r, k)) {
        const n = giesse(r, k, a, b).roehren;
        const s = key(n);
        if (!gesehen.has(s)) { gesehen.add(s); naechste.push(n); }
      }
    }
    if (!naechste.length) return -1;
    ebene = naechste;
  }
  return -2;
}

test('Farben: oberer Block und Gießmenge', () => {
  tief(obenBlock([0, 1, 1]), { farbe: 1, laenge: 2 });
  tief(obenBlock([]), { farbe: -1, laenge: 0 });
  const r = [[0, 1, 1], [], [2, 1], [0, 0, 0, 1], [2]];
  gleich(menge(r, 4, 0, 1), 2, 'ganzer Block in leere Röhre');
  gleich(menge(r, 4, 0, 2), 2, 'gleiche Farbe oben, 2 frei');
  gleich(menge(r, 4, 0, 3), 0, 'Ziel voll');
  gleich(menge(r, 4, 0, 4), 0, 'andere Farbe');
  gleich(menge(r, 4, 1, 0), 0, 'Quelle leer');
  gleich(menge(r, 4, 0, 0), 0, 'selbe Röhre');
  const t = [[0, 1, 1, 1], [2, 1]];
  gleich(menge(t, 4, 0, 1), 2, 'nur so viel wie passt');
  const g = giesse(t, 4, 0, 1);
  tief(g.roehren, [[0, 1], [2, 1, 1, 1]]);
  tief(g.zug, [0, 1, 2]);
  tief(t, [[0, 1, 1, 1], [2, 1]], 'Eingabe unverändert');
  tief(umkehren(g.roehren, g.zug), t);
});

test('Farben: Gewinn-Erkennung mit leeren Röhren', () => {
  gleich(geloest([[0, 0, 0, 0], [], [1, 1, 1, 1]], 4), true);
  gleich(geloest([[0, 0, 0], [0], [1, 1, 1, 1]], 4), false);
  gleich(geloest([[0, 0, 1, 1], [], [1, 1, 0, 0]], 4), false);
});

test('Farben: Zufallszüge vorwärts und komplett zurück', () => {
  const l = erzeugeLevel('mittel', 3);
  const rng = erstelleZufall('rueck');
  let z = { roehren: l.roehren, zuege: 0 };
  const verlauf = [];
  for (let i = 0; i < 80; i++) {
    const zz = gueltigeZuege(z.roehren, l.kapazitaet);
    if (!zz.length) break;
    const [a, b] = rng.wahl(zz);
    const e = ['g', a, b, menge(z.roehren, l.kapazitaet, a, b)];
    z = vorwaerts(z, e, l.roehren, l.kapazitaet);
    verlauf.push(e);
  }
  wahr(verlauf.length > 10);
  for (let i = verlauf.length - 1; i >= 0; i--) z = rueckwaerts(z, verlauf[i], l.kapazitaet);
  tief(z.roehren, l.roehren);
  gleich(z.zuege, 0);
});

test('Farben: Neustart und Zusatzröhre im Verlauf', () => {
  const start = [[0, 1], [1, 0], []];
  let z = { roehren: start, zuege: 0 };
  z = vorwaerts(z, ['g', 0, 2, 1], start, 2);
  z = vorwaerts(z, ['r'], start, 2);
  tief(z.roehren, [[0], [1, 0], [1], []]);
  const n = ['n', z.roehren, z.zuege];
  const z2 = vorwaerts(z, n, start, 2);
  tief(z2, { roehren: start, zuege: 0 });
  tief(rueckwaerts(z2, n, 2), z);
  gleich(rueckwaerts({ roehren: [[0], [1]], zuege: 0 }, ['r'], 2), null, 'Röhre nicht leer');
  gleich(vorwaerts(z, ['g', 0, 1, 1], start, 2), null, 'passt nicht');
});

test('Farben: Löser – bekannte Optima, unlösbar, Kanonisierung', () => {
  const a = [[0, 1, 0, 1], [1, 0, 1, 0], [], []];
  const r = loese(a, 4);
  gleich(r.status, 'geloest');
  gleich(r.zuege.length, bfs(a, 4), 'gleich BFS');
  wahr(pruefeLoesung(a, 4, r.zuege));
  gleich(loese([[0, 1], [1, 0]], 2).status, 'unloesbar');
  const b = [[], [1, 0, 1, 0], [], [0, 1, 0, 1]];
  gleich(loese(b, 4).zuege.length, r.zuege.length, 'Röhren vertauscht → gleiches Optimum');
  gleich(loese([[0, 0], [1, 1], []], 2).zuege.length, 0, 'schon gelöst');
});

test('Farben: Löser optimal auf kleinen Leveln (Vergleich mit BFS)', () => {
  for (let i = 1; i <= 15; i++) {
    const rng = erstelleZufall(`klein-${i}`);
    const s = rng.mische([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    const roehren = [s.slice(0, 3), s.slice(3, 6), s.slice(6, 9), [], []];
    const r = loese(roehren, 3);
    const w = bfs(roehren, 3);
    if (w === -1) { gleich(r.status, 'unloesbar', `Fall ${i}`); continue; }
    gleich(r.zuege.length, w, `Fall ${i}`);
  }
});

test('Farben: Hinweis-Kette – Sackgasse wird erkannt', () => {
  const s = [[0, 1], [1, 0], []];
  // gelöst in 3 Zügen, nach falschem Zug wird es eng
  const r = loeseBest(s, 2);
  gleich(r.status, 'geloest');
  gleich(r.optimal, true);
  gleich(hatSinnvollenZug([[0, 1], [1, 0]], 2), false);
  gleich(hatSinnvollenZug(s, 2), true);
});

test('Farben: Generator – 40 Level je Stufe lösbar, Farben je K-mal, im Zielbereich', () => {
  for (const id of STUFEN_IDS) {
    const st = STUFEN[id];
    for (let n = 1; n <= 40; n++) {
      const l = erzeugeLevel(id, n);
      wahr(pruefeLoesung(l.roehren, l.kapazitaet, l.loesung), `${id} ${n} Lösung ungültig`);
      gleich(l.loesung.length, l.optimum);
      wahr(l.farben >= st.farben[0] && l.farben <= st.farben[1], `${id} ${n} Farbanzahl`);
      gleich(l.roehren.length, l.farben + st.leer);
      const zaehl = {};
      for (const r of l.roehren) for (const f of r) zaehl[f] = (zaehl[f] || 0) + 1;
      wahr(Object.values(zaehl).every((c) => c === l.kapazitaet), `${id} ${n} je K-mal`);
      wahr(l.optimum >= st.ziel[0] && l.optimum <= st.ziel[1], `${id} ${n} Zugzahl ${l.optimum}`);
      wahr(!geloest(l.roehren, l.kapazitaet));
    }
  }
});

test('Farben: Determinismus – gleiches Level, verschiedene Nummern verschieden', () => {
  tief(erzeugeLevel('schwer', 7), erzeugeLevel('schwer', 7));
  wahr(JSON.stringify(erzeugeLevel('leicht', 1).roehren) !== JSON.stringify(erzeugeLevel('leicht', 2).roehren));
});

test('Farben: Spielstand prüfen', () => {
  const { loesung, ...level } = erzeugeLevel('leicht', 5);
  const st = { stufe: 'leicht', nr: 5, level, roehren: level.roehren, zuege: 0, hinweise: 0, zusatz: false, verlauf: [], wieder: [], gewonnen: false };
  gleich(standGueltig(st), true);
  const [a, b] = loesung[0];
  const g = giesse(level.roehren, level.kapazitaet, a, b);
  const st2 = { ...st, roehren: g.roehren, zuege: 1, verlauf: [['g', ...g.zug]] };
  gleich(standGueltig(JSON.parse(JSON.stringify(st2))), true, 'nach einem Zug');
  gleich(standGueltig({ ...st2, verlauf: [] }), false, 'Verlauf passt nicht zum Zustand');
  gleich(standGueltig({ ...st, stufe: 'quatsch' }), false);
  gleich(standGueltig({ ...st, roehren: [[99]] }), false);
  gleich(standGueltig({ ...st, zuege: Infinity }), false);
  gleich(standGueltig({ stufe: 'mittel', nr: 3, level: null }), true, 'noch in Erzeugung');
  gleich(standGueltig(null), false);
  gleich(standGueltig('x'), false);
});
