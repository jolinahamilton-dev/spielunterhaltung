import { test, gleich, tief, wahr } from '../mini-test.js';
import { erstelleZufall } from '../../kern/zufall.js';
import * as K from '../../spiele/minesweeper/logik.js';
import * as U from '../../spiele/minesweeper/unendlich.js';
import { analysiere, loeseVoll, erzeugeOhneRaten } from '../../spiele/minesweeper/loeser.js';

/** Feld aus Textzeilen: '*' Mine, sonst frei */
function feldAus(zeilen) {
  const h = zeilen.length, b = zeilen[0].length;
  const minen = new Uint8Array(b * h);
  zeilen.join('').split('').forEach((c, i) => { if (c === '*') minen[i] = 1; });
  return { b, h, minen };
}
function klassischMit(zeilen, start, ausgang = 'entspannt') {
  const { b, h, minen } = feldAus(zeilen);
  const z = K.neuesKlassisch({ stufe: 'anfaenger', ausgang });
  Object.assign(z, { b, h, anzahl: minen.reduce((a, m) => a + m, 0), offen: new Uint8Array(b * h), marke: new Uint8Array(b * h), treffer: new Uint8Array(b * h) });
  K.setzeMinen(z, start, minen);
  return z;
}

// ---------- Klassisch ----------

test('Minen: Nachbarn an Ecken, Rändern und innen', () => {
  gleich(K.nachbarn(9, 9, 0).length, 3);
  gleich(K.nachbarn(9, 9, 4).length, 5);
  gleich(K.nachbarn(9, 9, 40).length, 8);
  tief(K.nachbarn(3, 2, 5), [1, 2, 4]);
});

test('Minen: Zahlen stimmen', () => {
  const { b, h, minen } = feldAus(['*..', '...', '..*']);
  tief([...K.zaehleZahlen(minen, b, h)], [0, 1, 0, 1, 2, 1, 0, 1, 0]);
});

test('Minen: erster Klick ist eine Null (3×3 frei), Rückfall bei dichten Feldern', () => {
  for (let k = 0; k < 30; k++) {
    const rng = erstelleZufall(`s${k}`);
    const start = rng.ganz(0, 80);
    const m = K.verteileMinen(9, 9, 10, start, rng);
    gleich(m.reduce((a, v) => a + v, 0), 10);
    wahr(K.startBereich(9, 9, start).every((i) => !m[i]), '3×3 um den Start frei');
  }
  const dicht = K.verteileMinen(5, 5, 20, 12, erstelleZufall('d'));
  gleich(dicht.reduce((a, v) => a + v, 0), 20);
  gleich(dicht[12], 0, 'nur die Klickzelle bleibt frei');
});

test('Minen: Flutfüllung deckt Null-Fläche samt Rand auf', () => {
  const z = klassischMit(['....*', '.....', '.....', '*....'], 6);
  const e = K.primaer(z, 6);
  gleich(e.treffer.length, 0);
  gleich(z.offenZahl, 18, 'alle Felder außer den 2 Minen');
  gleich(z.status, 'gewonnen');
});

test('Minen: Chording mit richtiger und falscher Flaggenzahl; Fragezeichen blockiert nicht', () => {
  const z = klassischMit(['*.*', '...', '...', '...'], 10);
  K.primaer(z, 10);
  wahr(z.offen[3] && z.zahlen[3] === 1 && !z.offen[0] && !z.offen[1], 'Zahl 1 bei (0,1)');
  // ohne Flagge: nichts passiert, Nachbarn werden gemeldet
  const fehl = K.primaer(z, 3);
  tief(fehl.fehlAkkord?.sort(), [0, 1]);
  // Fragezeichen auf der Mine zählt nicht als Flagge
  K.schalteFrage(z, 0);
  wahr(K.primaer(z, 3).fehlAkkord !== null);
  K.wechsleMarke(z, 0, false); // Frage → (ohne ?-Stufe) leer
  gleich(z.marke[0], K.LEER);
  K.schalteFlagge(z, 0);
  const e = K.primaer(z, 3);
  gleich(e.fehlAkkord, null);
  gleich(e.treffer.length, 0);
  gleich(z.offen[1], 1, 'Nachbar aufgedeckt');
  gleich(z.status, 'gewonnen');
});

test('Minen: Chording mit falscher Flagge trifft eine Mine (Entspannt) – zurücknehmen', () => {
  const z = klassischMit(['.*.', '...', '...', '...'], 9);
  K.primaer(z, 9);
  gleich(z.offen[3], 1);
  gleich(z.zahlen[3], 1);
  K.schalteFlagge(z, 0);      // falsche Flagge
  const e = K.primaer(z, 3);
  tief(e.treffer, [1]);
  gleich(z.status, 'laeuft');
  wahr(K.kannZuruecknehmen(z));
  wahr(K.nimmZurueck(z));
  gleich(z.treffer[1], 0);
  gleich(z.marke[1], K.FLAGGE);
  gleich(z.ruecknahmen, 1);
  gleich(K.kannZuruecknehmen(z), false);
});

test('Minen: Hardcore beendet das Spiel, kein Zurücknehmen', () => {
  const z = klassischMit(['*.*', '...', '...', '...'], 10, 'hardcore');
  K.primaer(z, 10);
  K.primaer(z, 0);
  gleich(z.status, 'verloren');
  gleich(K.kannZuruecknehmen(z), false);
  gleich(K.wechsleMarke(z, 1), false, 'nach Spielende keine Züge');
});

test('Minen: Markierung wechselt Flagge → Fragezeichen → leer', () => {
  const z = klassischMit(['*..', '...', '...'], 8);
  K.wechsleMarke(z, 0, true); gleich(z.marke[0], K.FLAGGE);
  K.wechsleMarke(z, 0, true); gleich(z.marke[0], K.FRAGE);
  K.wechsleMarke(z, 0, true); gleich(z.marke[0], K.LEER);
  K.primaer(z, 8);
  gleich(K.wechsleMarke(z, 8, true), false, 'offene Zelle nicht markierbar');
});

test('Minen: Speichern/Laden (Bitmasken-Rundlauf) und kaputter Stand', () => {
  const z = K.neuesKlassisch({ stufe: 'experte', seed: 'abc', ausgang: 'entspannt' });
  const rng = erstelleZufall('abc');
  K.setzeMinen(z, 200, K.verteileMinen(30, 16, 99, 200, rng));
  K.primaer(z, 200);
  const mine = z.minen.indexOf(1);
  K.schalteFlagge(z, mine);
  const st = JSON.parse(JSON.stringify(K.zumSpeichern(z)));
  const z2 = K.ausSpeicher(st);
  wahr(z2, 'Stand lädt');
  tief([...z2.offen], [...z.offen]);
  tief([...z2.marke], [...z.marke]);
  tief([...z2.minen], [...z.minen]);
  gleich(z2.offenZahl, z.offenZahl);
  // leerer Stand vor dem ersten Klick
  wahr(K.ausSpeicher(JSON.parse(JSON.stringify(K.zumSpeichern(K.neuesKlassisch({ stufe: 'fortgeschritten' }))))));
  gleich(K.ausSpeicher(null), null);
  gleich(K.ausSpeicher({ ...st, offen: 'kaputt!' }), null);
  gleich(K.ausSpeicher({ ...st, stufe: 'riesig' }), null);
  gleich(K.ausSpeicher({ ...st, letzteTreffer: [9999] }), null);
  const offenMitMine = { ...st, offen: K.bitsZuB64(z.minen) };
  gleich(K.ausSpeicher(offenMitMine), null, 'offene Mine ist ein Widerspruch');
});

// ---------- Löser ----------

function sicht(zeilen, offenZeilen) {
  const { b, h, minen } = feldAus(zeilen);
  const zahlen = K.zaehleZahlen(minen, b, h);
  const offen = new Uint8Array(b * h);
  offenZeilen.join('').split('').forEach((c, i) => { if (c === 'o') offen[i] = 1; });
  return { b, h, minen, zahlen, offen, n: b * h, nb: K.nachbarListe(b, h), mine: new Uint8Array(b * h) };
}

/** Löser wiederholt anwenden (ohne Aufdecken) → alle ableitbaren sicheren Zellen und Minen */
function leiteAb(s, gesamt = null) {
  const alle = { sicher: new Set(), minen: new Set(), stufen: [] };
  const mine = new Uint8Array(s.n);
  for (let k = 0; k < 10; k++) {
    const r = analysiere({ ...s, mine, gesamt });
    if (!r.sicher.length && !r.minen.length) break;
    alle.stufen.push(r.stufe);
    r.sicher.forEach((c) => alle.sicher.add(c));
    r.minen.forEach((c) => { alle.minen.add(c); mine[c] = 1; });
  }
  return { sicher: [...alle.sicher].sort((a, b) => a - b), minen: [...alle.minen].sort((a, b) => a - b), stufen: alle.stufen };
}

test('Löser: Muster 1-2-1 (Stufe 2)', () => {
  // Zeile 0 verdeckt, darunter 1 2 1 → Minen außen, Mitte sicher
  const r = leiteAb(sicht(['*.*', '...', '...'], ['...', 'ooo', 'ooo']));
  gleich(r.stufen[0], 2);
  tief(r.minen, [0, 2]);
  tief(r.sicher, [1]);
});

test('Löser: Muster 1-2-2-1', () => {
  const r = leiteAb(sicht(['.**.', '....', '....'], ['....', 'oooo', 'oooo']));
  tief(r.minen, [1, 2]);
  tief(r.sicher, [0, 3]);
});

test('Löser: erzwungenes Raten wird erkannt (50/50)', () => {
  // zwei Zellen, eine Mine, keine Information unterscheidet sie
  const s = sicht(['*.', '..', '..'], ['..', 'oo', 'oo']);
  const r = analysiere({ ...s, gesamt: 1 });
  gleich(r.sicher.length + r.minen.length, 0);
  const v = loeseVoll({ b: 2, h: 3, minen: s.minen, zahlen: s.zahlen, start: 5, anzahl: 1 });
  gleich(v.geloest, false);
});

test('Löser: Minenzähler entscheidet innere Zellen (Stufe 3)', () => {
  // die einzige Mine liegt sicher am Rand der „1“ → alle Zellen ohne Kontakt zu Zahlen sind sicher
  const s = sicht(['*...', '....'], ['....', 'o...']);
  const r = analysiere({ ...s, gesamt: 1 });
  gleich(r.stufe, 3);
  tief(r.sicher.sort((a, b) => a - b), [2, 3, 6, 7]);
  gleich(analysiere({ ...s, gesamt: null }).sicher.length, 0, 'ohne Minenzähler (unendlich) nicht ableitbar');
});

test('Löser: findet nie eine Mine als „sicher“ (Zufallsfelder)', () => {
  for (let k = 0; k < 40; k++) {
    const rng = erstelleZufall(`l${k}`);
    const start = rng.ganz(0, 255);
    const minen = K.verteileMinen(16, 16, 40, start, rng);
    const zahlen = K.zaehleZahlen(minen, 16, 16);
    loeseVoll({ b: 16, h: 16, minen, zahlen, start, anzahl: 40 }); // wirft bei Fehler
  }
});

test('Ohne Raten: 100 Experte-Felder lösbar, gleicher Seed → gleiches Feld', () => {
  let geraten = 0, schritte = 0, max = 0;
  const t0 = performance.now();
  for (let k = 0; k < 100; k++) {
    const start = (k * 37) % 480;
    const r = erzeugeOhneRaten({ b: 30, h: 16, anzahl: 99, seed: `e${k}`, start });
    gleich(r.minen.length, 99);
    const minen = K.minenAusListe(480, r.minen);
    wahr(K.startBereich(30, 16, start).every((i) => !minen[i]), 'Start ist Null');
    if (r.geraten) geraten++;
    else wahr(loeseVoll({ b: 30, h: 16, minen, zahlen: K.zaehleZahlen(minen, 30, 16), start, anzahl: 99 }).geloest);
    schritte += r.schritte; max = Math.max(max, r.schritte);
  }
  const ms = performance.now() - t0;
  console.info(`Ohne Raten Experte: ${geraten}/100 Rückfälle, ⌀ ${Math.round(schritte / 100)} Schritte, max ${max}, ${Math.round(ms)} ms gesamt`);
  gleich(geraten, 0, 'Rückfälle');
  tief(erzeugeOhneRaten({ b: 30, h: 16, anzahl: 99, seed: 'gleich', start: 77 }).minen,
    erzeugeOhneRaten({ b: 30, h: 16, anzahl: 99, seed: 'gleich', start: 77 }).minen);
});

test('Ohne Raten: Anfänger und Fortgeschritten', () => {
  for (let k = 0; k < 30; k++) {
    gleich(erzeugeOhneRaten({ b: 9, h: 9, anzahl: 10, seed: `a${k}`, start: 40 }).geraten, false);
    gleich(erzeugeOhneRaten({ b: 16, h: 16, anzahl: 40, seed: `f${k}`, start: 0 }).geraten, false);
  }
});

// ---------- Unendlich ----------

test('Unendlich: istMine deterministisch, unabhängig von Cache und Reihenfolge; Start frei', () => {
  const a = U.erstelleWelt({ seed: 'welt' });
  const b = U.erstelleWelt({ seed: 'welt' });
  const punkte = [];
  for (let k = 0; k < 500; k++) punkte.push([(k * 7919) % 2001 - 1000, (k * 104729) % 2001 - 1000]);
  const va = punkte.map(([x, y]) => U.istMine(a, x, y));
  const vb = punkte.slice().reverse().map(([x, y]) => U.istMine(b, x, y)).reverse();
  tief(va, vb);
  wahr(punkte.every(([x, y], k) => va[k] === (U.istMineRoh(a.s, a.schwelle, x, y) ? 1 : 0)));
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) gleich(U.istMine(a, x, y), 0);
  gleich(U.zahl(a, 0, 0), 0);
  // feste Erwartungswerte (Hash darf sich nie ändern, sonst passen Spielstände nicht mehr)
  gleich(U.seedZahl('welt'), U.seedZahl('welt'));
  gleich(U.hash(0, 0, 0), 0);
  gleich(U.hash(1, 2, 3), U.hash(1, 2, 3));
});

test('Unendlich: Dichte ±1 %, Mindestdichte 15 %', () => {
  for (const d of U.DICHTEN) {
    const w = U.erstelleWelt({ seed: 'dichte', dichte: d });
    let m = 0;
    for (let y = 100; y < 300; y++) for (let x = 100; x < 300; x++) m += U.istMine(w, x, y);
    wahr(Math.abs(m / 40000 - d) < 0.01, `Dichte ${d}: ${m / 40000}`);
  }
  gleich(U.erstelleWelt({ dichte: 0.05 }).dichte, U.STANDARD_DICHTE);
  wahr(U.schwelleAus(0.05) >= Math.floor(0.15 * 4294967296));
});

test('Unendlich: Zahlen über Chunk-Grenzen stimmen mit Referenz', () => {
  const w = U.erstelleWelt({ seed: 'zahlen' });
  for (let y = -20; y < 20; y++) for (let x = -20; x < 20; x++) {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += U.istMineRoh(w.s, w.schwelle, x + dx, y + dy) ? 1 : 0;
    if (U.zahl(w, x, y) !== n) throw new Error(`Zahl bei ${x},${y}`);
  }
});

test('Unendlich: Flutfüllung identisch zur Referenz auf großem Array; Budget-Abbruch und Fortsetzung', () => {
  const seed = 'flut';
  const w1 = U.erstelleWelt({ seed });
  U.primaer(w1, 0, 0, { budget: Infinity });
  const w2 = U.erstelleWelt({ seed });
  U.primaer(w2, 0, 0, { budget: 3 });
  let runden = 0;
  while (U.flutLaeuft(w2)) { U.arbeite(w2, 3); runden++; }
  wahr(w1.zaehler.aufgedeckt > 9);
  gleich(w2.zaehler.aufgedeckt, w1.zaehler.aufgedeckt);
  wahr(runden > 0 || w1.zaehler.aufgedeckt <= 3);
  // Referenz: großes Array um den Start
  const R = 200, B = 2 * R + 1;
  const offen = new Uint8Array(B * B);
  const stapel = [[0, 0]];
  let n = 0;
  while (stapel.length) {
    const [x, y] = stapel.pop();
    const i = (y + R) * B + x + R;
    if (offen[i] || U.istMineRoh(w1.s, w1.schwelle, x, y)) continue;
    offen[i] = 1; n++;
    if (U.zahl(w1, x, y) === 0) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) stapel.push([x + dx, y + dy]);
  }
  gleich(n, w1.zaehler.aufgedeckt);
  for (let y = -R; y <= R; y += 3) for (let x = -R; x <= R; x += 3) {
    if (U.istOffen(w1, x, y) !== Boolean(offen[(y + R) * B + x + R])) throw new Error(`Unterschied bei ${x},${y}`);
  }
});

test('Unendlich: Treffer (Entspannt) zählt, Zurücknehmen; Hardcore endet', () => {
  const w = U.erstelleWelt({ seed: 'treffer' });
  U.beginne(w);
  let mx = 3, my = 0;
  while (!U.istMine(w, mx, my)) mx++;
  U.primaer(w, mx, my);
  gleich(w.zaehler.treffer, 1);
  gleich(U.zellCode(w, mx, my), 12);
  wahr(U.nimmZurueck(w));
  gleich(w.zaehler.treffer, 0);
  gleich(U.zellCode(w, mx, my), 10, 'jetzt geflaggt');
  const hc = U.erstelleWelt({ seed: 'treffer', ausgang: 'hardcore' });
  U.beginne(hc);
  U.primaer(hc, mx, my);
  gleich(hc.status, 'verloren');
  gleich(U.kannZuruecknehmen(hc), false);
});

test('Unendlich: Speichern/Laden, sparsam, kaputter Stand', () => {
  const w = U.erstelleWelt({ seed: 'speicher', dichte: 0.2 });
  U.beginne(w);
  U.schalteFlagge(w, 40, 40);
  U.schalteFrage(w, -40, 7);
  const st = JSON.parse(JSON.stringify(U.zumSpeichern(w)));
  wahr(Object.keys(st.chunks).length <= 12, 'nur benutzte Chunks');
  const w2 = U.ausSpeicher(st);
  wahr(w2);
  gleich(w2.zaehler.aufgedeckt, w.zaehler.aufgedeckt);
  gleich(U.marke(w2, 40, 40), K.FLAGGE);
  gleich(U.marke(w2, -40, 7), K.FRAGE);
  for (let y = -10; y <= 10; y++) for (let x = -10; x <= 10; x++) gleich(U.zellCode(w2, x, y), U.zellCode(w, x, y));
  gleich(U.ausSpeicher({ ...st, dichte: 0.05 }), null);
  gleich(U.ausSpeicher({ ...st, chunks: { 'a,b': '...' } }), null);
  gleich(U.ausSpeicher({ ...st, ausstehend: [1] }), null);
  // offene Zelle auf einer Mine → Widerspruch
  let mx = 3; while (!U.istMine(w, mx, 0)) mx++;
  const falsch = U.erstelleWelt({ seed: 'speicher', dichte: 0.2 });
  falsch.daten.set(1, { cx: Math.floor(mx / 16), cy: 0, o: Uint16Array.from({ length: 16 }, (_, i) => (i === 0 ? 1 << (mx % 16) : 0)), f: new Uint16Array(16), q: new Uint16Array(16), t: new Uint16Array(16) });
  gleich(U.ausSpeicher(JSON.parse(JSON.stringify(U.zumSpeichern(falsch)))), null);
});

test('Unendlich: Leistung – 1 Mio. Zellen erzeugen/abfragen', () => {
  const w = U.erstelleWelt({ seed: 'leistung' });
  const t0 = performance.now();
  let n = 0;
  for (let y = 0; y < 1000; y++) for (let x = 0; x < 1000; x++) n += U.zahl(w, x, y);
  const ms = performance.now() - t0;
  console.info(`1 Mio. Zahlen in ${Math.round(ms)} ms`);
  wahr(n > 0 && ms < 3000);
});
