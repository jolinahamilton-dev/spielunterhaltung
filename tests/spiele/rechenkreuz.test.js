import { test, gleich, tief, wahr } from '../mini-test.js';
import {
  STUFEN, STUFEN_IDS, stimmt, erzeugbar, dritte, punkte, struktur, layoutOk, erzeugeLayout, belegeWerte,
  loese, eindeutig, erzeugeRaetsel, werteAus, gleichungStatus, gewonnen, istFeld, freieKarten, leereFelder,
  zugSetzen, zugEntfernen, fuehreAus, rueckgaengig, wiederholen, kannRueckgaengig, kannWiederholen, neustart,
  hinweis, zumSpeichern, ausSpeicher,
} from '../../spiele/rechenkreuz/logik.js';
import { erstelleZufall } from '../../kern/zufall.js';

/** Klassisches 3×3-Rätsel von Hand:  2+3=5 / 4×1… – hier nur + und − */
function handRaetsel() {
  // Zeilen: 2+3=5, 4+1=5, 6+4=10 · Spalten: 2+4=6, 3+1=4, 5+5=10
  const gl = [[0, 0, 0, '+'], [0, 1, 0, '+'], [0, 2, 0, '+'], [1, 0, 0, '+'], [1, 0, 1, '+'], [1, 0, 2, '+']];
  const loesung = [2, 3, 5, 4, 1, 5, 6, 4, 10];
  const vorgabe = [1, 0, 1, 0, 1, 1, 1, 0, 1];
  const karten = [3, 4, 4];
  return { v: 1, stufe: 'leicht', level: 1, seed: 'hand', lb: 3, lh: 3, gl, loesung, vorgabe, karten, belegt: new Array(9).fill(-1), verlauf: [], vor: [] };
}

test('Gleichungen: Rechnen und fehlende Zahl', () => {
  wahr(stimmt('+', 2, 3, 5) && stimmt('-', 9, 4, 5) && stimmt('*', 3, 4, 12) && stimmt('/', 12, 3, 4));
  wahr(!stimmt('/', 12, 0, 0) && !stimmt('+', 2, 2, 5));
  gleich(dritte('+', 2, 2, 3, 0), 5);
  gleich(dritte('-', 1, 9, 0, 5), 4);
  gleich(dritte('*', 0, 0, 4, 12), 3);
  gleich(dritte('*', 0, 0, 5, 12), -1, 'nicht ganzzahlig');
  gleich(dritte('/', 2, 12, 5, 0), -1, 'Rest');
  gleich(dritte('/', 0, 0, 3, 4), 12);
  gleich(dritte('-', 2, 3, 5, 0), -1, 'negativ');
  wahr(!erzeugbar('*', 1, 7, 7, 50), '×1 nicht erzeugen');
  wahr(!erzeugbar('+', 30, 30, 60, 50), 'über max');
});

test('Layout-Regeln: klassisch gültig, Überlappung/Nachbarn/Lücken ungültig', () => {
  const kl = [[0, 0, 0], [0, 1, 0], [0, 2, 0], [1, 0, 0], [1, 0, 1], [1, 0, 2]];
  wahr(layoutOk(kl, 3, 3));
  wahr(!layoutOk([[0, 0, 0], [0, 0, 2]], 5, 5), 'Kette in einer Zeile');
  wahr(!layoutOk([[0, 0, 0], [0, 1, 0]], 3, 3), 'übereinander ohne Senkrechte');
  wahr(!layoutOk([[0, 0, 0], [0, 4, 0]], 3, 5), 'nicht zusammenhängend');
  wahr(!layoutOk([[0, 0, 1]], 3, 3), 'außerhalb');
  wahr(layoutOk([[0, 0, 0], [1, 0, 2], [0, 2, 2]], 5, 3), 'Treppe');
});

test('Layout-Generator: alle Stufen halten die Regeln ein', () => {
  for (const sid of STUFEN_IDS) {
    const st = STUFEN[sid];
    for (let s = 0; s < 60; s++) {
      const rng = erstelleZufall(`lay${sid}${s}`);
      const { lb, lh, gl } = erzeugeLayout(rng, st.gitter, st.gl);
      wahr(layoutOk(gl, lb, lh), `${sid} ${s}`);
      wahr(gl.length >= st.gl[0] && gl.length <= Math.max(st.gl[1], 6), `${sid} ${s}: ${gl.length} Gleichungen`);
      wahr(lb <= st.gitter && lh <= st.gitter);
    }
  }
});

test('Werte: ganze positive Zahlen bis max, keine ×1/÷1', () => {
  const rng = erstelleZufall('werte');
  const gl = [[0, 0, 0, '*'], [0, 2, 0, '/'], [1, 0, 0, '+'], [1, 0, 2, '-']];
  for (let i = 0; i < 20; i++) {
    const w = belegeWerte(rng, gl, 3, 3, 100);
    wahr(w, 'Belegung gefunden');
    for (const g of gl) {
      const [a, b, c] = punkte(g, 3).map((p) => w[p]);
      wahr(erzeugbar(g[3], a, b, c, 100), `${a} ${g[3]} ${b} = ${c}`);
    }
  }
});

test('Löser: eindeutig, mehrdeutig, keine Lösung, Budget', () => {
  const r = handRaetsel();
  const werte = r.loesung.map((v, p) => (r.vorgabe[p] ? v : 0));
  const e = loese({ ...r, werte });
  gleich(e.anzahl, 1);
  tief(e.loesung, r.loesung);
  // alles leer bei 2+3=5-artigem Kreuz → mehrere Lösungen (Vertauschen)
  const alle = r.loesung.slice().sort((a, b) => a - b);
  const leer = loese({ ...r, werte: new Array(9).fill(0), karten: alle });
  wahr(leer.anzahl >= 2, 'mehrdeutig');
  gleich(loese({ ...r, werte, karten: [3, 4, 5] }).anzahl, 0, 'falscher Vorrat');
  const knapp = loese({ ...r, werte: new Array(9).fill(0), karten: alle }, { budget: 3 });
  wahr(knapp.abgebrochen, 'Budget');
  wahr(!eindeutig({ ...r, werte: new Array(9).fill(0), karten: alle }, { budget: 3 }));
});

test('Generator: alle Stufen gültig, eindeutig, Vorrat = fehlende Zahlen', () => {
  for (const sid of STUFEN_IDS) {
    const st = STUFEN[sid];
    let luecken = 0, felder = 0;
    const zeichen = new Set();
    for (let s = 0; s < 25; s++) {
      const z = erzeugeRaetsel({ stufe: sid, level: 1, seed: `g${s}` });
      wahr(layoutOk(z.gl, z.lb, z.lh), `${sid} ${s} Layout`);
      const { benutzt } = struktur(z.gl, z.lb, z.lh);
      for (const g of z.gl) {
        const [a, b, c] = punkte(g, z.lb).map((p) => z.loesung[p]);
        wahr(st.zeichen.includes(g[3]), 'Zeichen der Stufe');
        wahr(erzeugbar(g[3], a, b, c, st.max), `${sid} ${s}: ${a}${g[3]}${b}=${c}`);
        zeichen.add(g[3]);
      }
      const fehlend = z.loesung.filter((v, p) => benutzt[p] && !z.vorgabe[p]).sort((a, b) => a - b);
      tief(z.karten, fehlend, 'Vorrat');
      wahr(z.karten.length >= 2, 'Lücken vorhanden');
      const werte = z.loesung.map((v, p) => (z.vorgabe[p] ? v : 0));
      const e = loese({ ...z, werte }, { budget: 200000 });
      gleich(e.anzahl, 1, `${sid} ${s} eindeutig`);
      luecken += z.karten.length;
      felder += benutzt.filter(Boolean).length;
      JSON.parse(JSON.stringify(z));
    }
    gleich(zeichen.size, st.zeichen.length, `${sid}: alle Zeichen kommen vor`);
    wahr(luecken / felder > st.luecken - 0.2, `${sid}: Lückenanteil ${(luecken / felder).toFixed(2)}`);
  }
});

test('Generator: gleicher Seed → gleiches Rätsel', () => {
  for (const sid of STUFEN_IDS) {
    tief(erzeugeRaetsel({ stufe: sid, seed: 'x1' }), erzeugeRaetsel({ stufe: sid, seed: 'x1' }));
  }
  wahr(JSON.stringify(erzeugeRaetsel({ stufe: 'mittel', seed: 'a' })) !== JSON.stringify(erzeugeRaetsel({ stufe: 'mittel', seed: 'b' })));
});

test('Züge: setzen, tauschen, verschieben, entfernen, Rückgängig/Wiederholen', () => {
  const z = handRaetsel();
  wahr(!istFeld(z, 0) && istFeld(z, 1), 'Vorgabe ist kein Feld');
  gleich(zugSetzen(z, 0, 0), null, 'auf Vorgabe nicht setzen');
  tief(leereFelder(z), [1, 3, 7]);
  fuehreAus(z, zugSetzen(z, 1, 1));            // 4 auf Feld 1 (falsch)
  gleich(werteAus(z)[1], 4);
  tief(freieKarten(z), [0, 2]);
  fuehreAus(z, zugSetzen(z, 1, 0));            // 3 auf Feld 1 → 4 zurück
  tief(freieKarten(z), [1, 2]);
  fuehreAus(z, zugSetzen(z, 3, 1));
  fuehreAus(z, zugSetzen(z, 7, 1));            // Kärtchen 1 von Feld 3 nach Feld 7
  gleich(z.belegt[3], -1);
  gleich(z.belegt[7], 1);
  fuehreAus(z, zugEntfernen(z, 7));
  gleich(z.belegt[7], -1);
  gleich(zugEntfernen(z, 7), null);
  rueckgaengig(z); gleich(z.belegt[7], 1);
  rueckgaengig(z); gleich(z.belegt[3], 1); gleich(z.belegt[7], -1);
  wahr(kannWiederholen(z));
  wiederholen(z); gleich(z.belegt[7], 1); gleich(z.belegt[3], -1);
  while (kannRueckgaengig(z)) rueckgaengig(z);
  wahr(z.belegt.every((k) => k === -1), 'alles zurück');
  neustart(z);
  wahr(!kannWiederholen(z));
});

test('Status und Gewinn', () => {
  const z = handRaetsel();
  // Zeile 3 (6+?=10) offen, Spalte 3 (5+5=10) richtig
  gleich(gleichungStatus(z)[5], 'richtig');
  gleich(gleichungStatus(z)[2], 'offen');
  fuehreAus(z, zugSetzen(z, 7, 0));            // 3 statt 4 → 6+3≠10
  gleich(gleichungStatus(z)[2], 'falsch');
  fuehreAus(z, zugSetzen(z, 1, 0));
  fuehreAus(z, zugSetzen(z, 3, 1));
  fuehreAus(z, zugSetzen(z, 7, 2));
  wahr(gewonnen(z));
});

test('Hinweis: erst Falsches heraus, dann Richtiges setzen – bis zum Gewinn', () => {
  for (const sid of STUFEN_IDS) {
    const z = erzeugeRaetsel({ stufe: sid, seed: 'hinweis' });
    // absichtlich falsch belegen: Kärtchen verdreht einsetzen
    const leer = leereFelder(z);
    leer.forEach((p, i) => fuehreAus(z, zugSetzen(z, p, (i + 1) % z.karten.length)));
    let n = 0;
    while (!gewonnen(z) && n++ < 200) {
      const h = hinweis(z);
      wahr(h, 'Hinweis vorhanden');
      if (h.typ === 'entfernen') wahr(z.karten[z.belegt[h.feld]] !== z.loesung[h.feld]);
      else gleich(z.karten[h.karte], z.loesung[h.feld]);
      fuehreAus(z, h.aend);
    }
    wahr(gewonnen(z), `${sid} gelöst`);
    gleich(hinweis(z), null);
  }
  const z = handRaetsel();
  const h = hinweis(z, 7);
  gleich(h.feld, 7, 'Wunschfeld');
  gleich(h.typ, 'setzen');
});

test('Speichern/Laden: gültig, Verlauf, kaputte Stände', () => {
  const z = erzeugeRaetsel({ stufe: 'schwer', seed: 'laden' });
  const leer = leereFelder(z);
  fuehreAus(z, zugSetzen(z, leer[0], 0));
  fuehreAus(z, zugSetzen(z, leer[1], 1));
  rueckgaengig(z);
  const s = zumSpeichern(z);
  tief(ausSpeicher(s), z);
  gleich(ausSpeicher(null), null);
  gleich(ausSpeicher({ ...s, stufe: '__proto__' }), null);
  gleich(ausSpeicher({ ...s, loesung: s.loesung.map((v) => (v ? v + 1 : 0)) }), null, 'Gleichungen falsch');
  gleich(ausSpeicher({ ...s, karten: [...s.karten.slice(1), 999] }), null, 'Vorrat passt nicht');
  gleich(ausSpeicher({ ...s, belegt: s.belegt.map(() => 0) }), null, 'Kärtchen doppelt');
  gleich(ausSpeicher({ ...s, gl: [[0, 0, 0, 'x']] }), null);
  gleich(ausSpeicher({ ...s, lb: 1e12 }), null);
  // kaputter Verlauf → Stand bleibt, Verlauf leer
  const ohne = ausSpeicher({ ...s, verlauf: [[[leer[0], -1, 1]]] });
  wahr(ohne && ohne.verlauf.length === 0 && ohne.vor.length === 0, 'unpassender Verlauf');
  const fremd = ausSpeicher({ ...s, verlauf: [[[leer[0], -1, 0, '<b>']]] });
  wahr(fremd && fremd.verlauf.length === 0, 'fremder Verlauf');
});
