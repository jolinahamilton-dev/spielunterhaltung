import { test, gleich, tief, wahr } from '../mini-test.js';
import { FORMEN, FORM } from '../../spiele/block-puzzle/formen.js';
import {
  N, lege, passt, passtIrgendwo, legbar, linienPunkte, serienFaktor, neuesSpiel, zug, joker,
  rueckgaengig, kannRueckgaengig, hinweis, neuesAngebot, istGueltig, zumSpeichern, ausSpeicher, vorschau,
} from '../../spiele/block-puzzle/logik.js';
import { erstelleZufall } from '../../kern/zufall.js';

const leer = () => new Array(N * N).fill(0);
/** Brett aus 8 Textzeilen ('#' belegt, '.' frei) */
const brettAus = (zeilen) => zeilen.join('').split('').map((c) => (c === '#' ? 1 : 0));

test('Block: Katalog – Anzahl Ausrichtungen und eindeutige IDs', () => {
  const zahl = (g) => FORMEN.filter((f) => f.gruppe === g).length;
  tief([zahl('P1'), zahl('I2'), zahl('I5'), zahl('O2'), zahl('W3'), zahl('L4'), zahl('T4'), zahl('S4'), zahl('W5')], [1, 2, 2, 1, 4, 8, 4, 4, 4]);
  gleich(new Set(FORMEN.map((f) => f.id)).size, FORMEN.length);
  wahr(FORMEN.every((f) => f.b <= 5 && f.h <= 5));
});

test('Block: Rand und Überlappung', () => {
  gleich(passt(leer(), 'I5-0', 3, 0), true);
  gleich(passt(leer(), 'I5-0', 4, 0), false, 'ragt rechts über');
  const b = leer(); b[0] = 1;
  gleich(passt(b, 'O2-0', 0, 0), false);
  gleich(passt(b, 'O2-0', 1, 0), true);
  gleich(lege(b, 'O2-0', 0, 0), null);
});

test('Block: Reihe und Spalte gleichzeitig, Kreuzung zählt einmal', () => {
  const b = brettAus([
    '###.####',
    '...#....',
    '...#....',
    '...#....',
    '...#....',
    '...#....',
    '...#....',
    '...#....',
  ]);
  const r = lege(b, 'P1-0', 3, 0);
  gleich(r.linien, 2);
  gleich(r.geraeumt.length, 15, '8 + 8 − 1 Kreuzung');
  wahr(r.brett.every((f) => f === 0));
});

test('Block: Vorschau zeigt verschwindende Zellen', () => {
  const b = brettAus(['#######.', '........', '........', '........', '........', '........', '........', '........']);
  const v = vorschau(b, 'P1-0', 7, 0);
  gleich(v.gueltig, true);
  gleich(v.geraeumt.length, 8);
  gleich(vorschau(b, 'P1-0', 0, 0).gueltig, false);
});

test('Block: Punkte für Linien und Serienfaktor', () => {
  tief([1, 2, 3, 4, 5, 6].map(linienPunkte), [10, 30, 60, 100, 150, 210]);
  tief([0, 1, 2, 3, 7, 20].map(serienFaktor), [1, 1, 1.5, 2, 4, 4]);
});

test('Block: Spielzug – Punkte, Serie, Leer-Bonus, Serienbruch nach 3 Zügen', () => {
  let z = neuesSpiel('punkte', 'klassisch');
  z = { ...z, brett: brettAus(['#######.', '........', '........', '........', '........', '........', '........', '........']), angebot: ['P1-0', 'P1-0', 'I2-0'] };
  const r = zug(z, 0, 7, 0);
  gleich(r.ergebnis.linien, 1);
  gleich(r.ergebnis.leer, true);
  gleich(r.ergebnis.punkte, 1 + 10 + 300);
  gleich(r.zustand.serie, 1);
  let s = r.zustand;
  for (let k = 0; k < 2; k++) { s = zug(s, s.angebot.findIndex(Boolean), k * 2, 4).zustand; }
  gleich(s.serie, 1, 'nach 2 Zügen ohne Abräumen noch da');
  s = zug(s, s.angebot.findIndex(Boolean), 0, 6)?.zustand ?? s;
  wahr(s.serie === 0 || s.ohneAbraeumen === 0, 'nach 3 Zügen ohne Abräumen weg');
});

test('Block: gleicher Seed → gleiche Angebote', () => {
  tief(neuesSpiel('abc').angebot, neuesSpiel('abc').angebot);
  const a = erstelleZufall('x'), b = erstelleZufall('x');
  tief(neuesAngebot(a, leer(), 'klassisch'), neuesAngebot(b, leer(), 'klassisch'));
});

test('Block: Angebot ohne doppelte Formen, höchstens ein 3×3', () => {
  const rng = erstelleZufall('dubletten');
  for (let k = 0; k < 500; k++) {
    const a = neuesAngebot(rng, leer(), 'klassisch');
    gleich(new Set(a).size, 3);
    wahr(a.filter((id) => FORM[id].zellen.length === 9).length <= 1);
  }
});

test('Block: Gewichtung ungefähr eingehalten (10 000 Ziehungen)', () => {
  const rng = erstelleZufall('gewicht');
  const zaehler = {};
  for (let k = 0; k < 3400; k++) for (const id of neuesAngebot(rng, leer(), 'klassisch')) zaehler[FORM[id].gruppe] = (zaehler[FORM[id].gruppe] || 0) + 1;
  // O2 (Gewicht 4) muss deutlich häufiger sein als O3 (Gewicht 1)
  wahr(zaehler.O2 > zaehler.O3 * 2.5, `O2 ${zaehler.O2} vs O3 ${zaehler.O3}`);
});

test('Block: legbar – unmöglich und nur in bestimmter Reihenfolge', () => {
  const voll = brettAus(['#######.', '########', '########', '########', '########', '########', '########', '########']);
  gleich(legbar(voll, ['O2-0']), false);
  gleich(legbar(voll, ['P1-0']), true);
  // Erst der Punkt räumt Reihe + Spalte frei, dann passt das 2×2
  gleich(legbar(voll, ['O2-0', 'P1-0']), true);
});

test('Block: Entspannt – Angebot immer komplett legbar, Zeitbudget', () => {
  const rng = erstelleZufall('entspannt');
  const t0 = performance.now();
  for (let k = 0; k < 300; k++) {
    const b = leer().map(() => (rng.zahl() < 0.45 ? 1 : 0));
    const a = neuesAngebot(rng, b, 'entspannt');
    wahr(legbar(b, a), `Brett ${k}`);
  }
  const ms = (performance.now() - t0) / 300;
  wahr(ms < 30, `${ms.toFixed(1)} ms je Angebot`);
});

test('Block: Rückgängig stellt alles wieder her, Klassisch nur 3×', () => {
  const text = (o) => JSON.stringify(o, Object.keys(o).sort());
  let z = neuesSpiel('rueck', 'klassisch');
  const start = text({ ...z, verlauf: [] });
  const platz = z.angebot.findIndex((id) => passtIrgendwo(z.brett, id));
  const h = hinweis(z);
  z = zug(z, h.platz, h.x, h.y).zustand;
  wahr(kannRueckgaengig(z));
  const zurueck = rueckgaengig(z);
  gleich(text({ ...zurueck, verlauf: [], rueckgaengigRest: 3 }), start);
  gleich(zurueck.rueckgaengigRest, 2);
  wahr(platz >= 0);
  let s = neuesSpiel('limit', 'klassisch');
  for (let k = 0; k < 5; k++) { const t = hinweis(s); s = zug(s, t.platz, t.x, t.y).zustand; }
  let anzahl = 0;
  while (kannRueckgaengig(s)) { s = rueckgaengig(s); anzahl++; }
  gleich(anzahl, 3);
});

test('Block: Entspannt endet nie (200 Hinweis-Züge)', () => {
  let z = neuesSpiel('nie', 'entspannt');
  for (let k = 0; k < 200; k++) {
    const h = hinweis(z);
    wahr(h, `kein Zug möglich bei ${k}`);
    z = zug(z, h.platz, h.x, h.y).zustand;
    gleich(z.beendet, false);
  }
});

test('Block: Klassisch endet irgendwann, Joker kann danach helfen', () => {
  let z = neuesSpiel('ende', 'klassisch');
  // ungeschickt spielen: jede Form in die erste freie Position
  for (let k = 0; k < 500 && !z.beendet; k++) {
    const platz = z.angebot.findIndex((id) => id && passtIrgendwo(z.brett, id));
    const id = z.angebot[platz];
    let gelegt = null;
    for (let y = 0; y < N && !gelegt; y++) for (let x = 0; x < N && !gelegt; x++) gelegt = zug(z, platz, x, y);
    z = gelegt.zustand;
  }
  gleich(z.beendet, true);
  wahr(z.angebot.filter(Boolean).every((id) => !passtIrgendwo(z.brett, id)));
  if (z.joker > 0) wahr(joker(z), 'Joker nach Ende');
});

test('Block: Spielstand speichern/laden inkl. Infinity', () => {
  const z = neuesSpiel('speichern', 'entspannt');
  const h = hinweis(z);
  const z2 = zug(z, h.platz, h.x, h.y).zustand;
  const geladen = ausSpeicher(JSON.parse(JSON.stringify(zumSpeichern(z2))));
  gleich(geladen.joker, Infinity);
  gleich(geladen.verlauf[0].rueckgaengigRest, Infinity);
  wahr(istGueltig(geladen));
  gleich(istGueltig({ version: 1, brett: [] }), false);
});
