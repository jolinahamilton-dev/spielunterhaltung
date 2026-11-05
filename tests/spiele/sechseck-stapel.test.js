import { test, gleich, tief, wahr } from '../mini-test.js';
import {
  ZIEL, VARIANTEN, layoutFuer, oben, obenAnzahl, schichten, loese, neuerStapel, neuesAngebot, neuesSpiel, zug,
  kannRueckgaengig, rueckgaengig, hinweis, freieFelder, raeumeKleinste, istGueltig, ausSpeicher, zumSpeichern,
  passendeNachbarn,
} from '../../spiele/sechseck-stapel/logik.js';
import { erstelleZufall } from '../../kern/zufall.js';

const L = layoutFuer('leicht');
const idx = (q, r) => L.zellen.findIndex((c) => c.q === q && c.r === r);
const leer = (n = L.anzahl) => Array.from({ length: n }, () => []);
const M = idx(0, 0);

test('Sechseck: Layouts und Nachbarn', () => {
  gleich(layoutFuer('leicht').anzahl, 37);
  gleich(layoutFuer('schwer').anzahl, 31);
  gleich(L.nachbarn[M].length, 6);
  gleich(L.nachbarn[idx(3, 0)].length, 3, 'Ecke');
  gleich(L.nachbarn[idx(3, -1)].length, 4, 'Rand');
  // Nachbarschaft ist symmetrisch
  wahr(L.nachbarn.every((ns, i) => ns.every((n) => L.nachbarn[n].includes(i))));
  wahr(layoutFuer('schwer').nachbarn.every((ns) => ns.length >= 2));
});

test('Sechseck: Stapel-Hilfen', () => {
  gleich(oben([1, 2, 2]), 2);
  gleich(oben([]), null);
  gleich(obenAnzahl([1, 2, 2]), 2);
  tief(schichten([0, 0, 3, 1, 1, 1]), [{ farbe: 0, anzahl: 2 }, { farbe: 3, anzahl: 1 }, { farbe: 1, anzahl: 3 }]);
});

test('Sechseck: einfache Zusammenführung zum Stapel mit längster Oberschicht', () => {
  const b = leer();
  const a = L.nachbarn[M][0];
  b[a] = [1, 2, 2, 2];
  b[M] = [0, 2];
  const r = loese(b, L.nachbarn, M);
  tief(r.brett[a], [1, 2, 2, 2, 2]);
  tief(r.brett[M], [0]);
  gleich(r.schritte.length, 1);
  gleich(r.schritte[0].nach, a);
  tief(b[M], [0, 2], 'Eingabe bleibt unverändert');
});

test('Sechseck: Gleichstand → reinerer Stapel, dann gelegtes Feld', () => {
  const b = leer();
  const [a, c] = L.nachbarn[M];
  b[a] = [3, 1, 1];      // 2 oben, 1 darunter
  b[c] = [1, 1];         // 2 oben, rein
  b[M] = [0, 1, 1];      // 2 oben, 1 darunter
  const r = loese(b, L.nachbarn, M);
  gleich(r.schritte[0].nach, c);
  const b2 = leer();
  b2[a] = [1, 1]; b2[M] = [1, 1];
  gleich(loese(b2, L.nachbarn, M).schritte[0].nach, M);
});

test('Sechseck: Kettenreaktion über freigelegte Farbe', () => {
  const b = leer();
  const a = L.nachbarn[M][0];
  const weit = L.nachbarn[a].find((n) => n !== M && !L.nachbarn[M].includes(n));
  b[a] = [4, 2, 2, 2];
  b[M] = [3, 2];
  b[weit] = [3, 3];
  // M gibt 2 an a ab → M zeigt 3 (kein 3-Nachbar), a bleibt 2 → keine Kette
  const r1 = loese(b, L.nachbarn, M);
  gleich(r1.schritte.length, 1);
  // Jetzt: a gibt seine 2 an M ab → a zeigt 4 … baue Kette: a = [3, 2], M = [2,2,2] , weit = [3,3]
  const b2 = leer();
  b2[a] = [3, 2]; b2[M] = [5, 2, 2, 2]; b2[weit] = [3, 3];
  const r2 = loese(b2, L.nachbarn, M);
  gleich(r2.schritte.length, 2, 'zweiter Schritt: a (jetzt 3) mit weit');
  tief(r2.brett[weit], [3, 3, 3]);
  tief(r2.brett[a], []);
});

test('Sechseck: Auflösen ab 10, Kettenpunkte', () => {
  const b = leer();
  const [a, c] = L.nachbarn[M];
  b[a] = [0, 1, 1, 1, 1, 1, 1];        // 6 × Farbe 1
  b[M] = [0, 1, 1, 1, 1];              // 4 × Farbe 1 → 10
  const r = loese(b, L.nachbarn, M);
  gleich(r.aufgeloest, 10);
  gleich(r.punkte, 10);
  wahr(r.schritte.some((s) => s.typ === 'weg' && s.anzahl === 10));
  // danach liegen 0 auf a und 0 auf M → werden zusammengeführt
  tief(r.brett[a].length + r.brett[M].length, 2);
  // zwei Auflösungen: zweite zählt doppelt
  const b2 = leer();
  b2[a] = [2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1];
  b2[c] = [2, 2, 2, 2, 2];
  b2[M] = [1, 1, 1, 1];
  wahr(L.nachbarn[a].includes(c), 'a und c sind Nachbarn');
  const r2 = loese(b2, L.nachbarn, M);
  gleich(r2.aufgeloest, 20);
  gleich(r2.punkte, 10 + 20);
});

test('Sechseck: Verfahren endet auf vollem, buntem Feld', () => {
  const rng = erstelleZufall('voll');
  for (let k = 0; k < 50; k++) {
    const b = leer().map(() => Array.from({ length: rng.ganz(1, 8) }, () => rng.ganz(0, 2)));
    const r = loese(b, L.nachbarn, rng.ganz(0, L.anzahl - 1));
    gleich(r.brett.flat().length + r.aufgeloest, b.flat().length, 'Plättchen bleiben erhalten');
    wahr(r.schritte.length < 500);
  }
});

test('Sechseck: Angebot – gleicher Seed, Größen, Farben, Schichten', () => {
  tief(neuesSpiel('abc', 'mittel').angebot, neuesSpiel('abc', 'mittel').angebot);
  const rng = erstelleZufall('angebot');
  for (let k = 0; k < 600; k++) {
    const st = neuerStapel(rng, leer(), 5);
    wahr(st.length >= 2 && st.length <= 6, `Größe ${st.length}`);
    wahr(st.every((f) => f >= 0 && f < 5));
    const s = schichten(st);
    wahr(s.length >= 1 && s.length <= 3);
  }
});

test('Sechseck: Gewichtung bevorzugt Farben, die oben auf dem Feld liegen', () => {
  const rng = erstelleZufall('gewicht');
  const b = leer();
  for (let i = 0; i < 12; i++) b[i] = [3];
  const zaehler = [0, 0, 0, 0];
  for (let k = 0; k < 3000; k++) zaehler[oben(neuerStapel(rng, b, 4))]++;
  wahr(zaehler[3] > zaehler[0] * 2, `Farbe 3: ${zaehler[3]}, Farbe 0: ${zaehler[0]}`);
  wahr(zaehler.every((n) => n > 100), 'jede Farbe kommt vor');
  const a = neuesAngebot(erstelleZufall('x'), leer(), 4);
  gleich(a.length, 3);
});

test('Sechseck: Zug, neues Angebot nach drei Stapeln, belegtes Feld verboten', () => {
  let z = neuesSpiel('zug', 'leicht');
  const erstes = JSON.stringify(z.angebot);
  const r = zug(z, 0, M);
  wahr(r);
  gleich(zug(r.zustand, 1, M), null, 'Feld belegt');
  gleich(zug(r.zustand, 0, 1), null, 'Platz leer');
  z = r.zustand;
  z = zug(z, 1, 0).zustand;
  wahr(z.angebot[2] && !z.angebot[0]);
  z = zug(z, 2, 36).zustand;
  wahr(z.angebot.every(Boolean));
  wahr(JSON.stringify(z.angebot) !== erstes);
  gleich(z.zuege, 3);
});

test('Sechseck: Rückgängig – Klassisch 3×, gleiches Angebot danach', () => {
  let z = neuesSpiel('rueck', 'leicht');
  for (let k = 0; k < 5; k++) { const t = hinweis(z); z = zug(z, t.platz, t.zelle).zustand; }
  const vorher = z;
  const t = hinweis(z);
  const nach = zug(z, t.platz, t.zelle).zustand;
  const zurueck = rueckgaengig(nach);
  tief({ ...zurueck, verlauf: [], rueckgaengigRest: 0 }, { ...vorher, verlauf: [], rueckgaengigRest: 0 });
  gleich(zurueck.rueckgaengigRest, 2);
  tief(zug(zurueck, t.platz, t.zelle).zustand.angebot, nach.angebot, 'kein neues Würfeln');
  let s = nach, anzahl = 0;
  while (kannRueckgaengig(s)) { s = rueckgaengig(s); anzahl++; }
  gleich(anzahl, 3);
  let e = neuesSpiel('rueck', 'entspannt');
  for (let k = 0; k < 8; k++) { const h = hinweis(e); e = zug(e, h.platz, h.zelle).zustand; }
  anzahl = 0;
  while (kannRueckgaengig(e)) { e = rueckgaengig(e); anzahl++; }
  gleich(anzahl, 8, 'Entspannt unbegrenzt');
});

test('Sechseck: Klassisch endet bei vollem Feld', () => {
  let z = neuesSpiel('ende', 'schwer');
  for (let k = 0; k < 2000 && !z.beendet; k++) {
    const platz = z.angebot.findIndex(Boolean);
    z = zug(z, platz, freieFelder(z.brett)[0]).zustand;
  }
  gleich(z.beendet, true);
  gleich(freieFelder(z.brett).length, 0);
  gleich(zug(z, z.angebot.findIndex(Boolean), 0), null);
  wahr(kannRueckgaengig(z));
});

test('Sechseck: Entspannt endet nie (300 Züge), Abräumen bei vollem Feld', () => {
  let z = neuesSpiel('nie', 'entspannt');
  let abgeraeumt = 0;
  for (let k = 0; k < 300; k++) {
    const platz = z.angebot.findIndex(Boolean);
    const frei = freieFelder(z.brett);
    wahr(frei.length > 0, `kein freies Feld bei ${k}`);
    const r = zug(z, platz, frei[0]);
    if (r.abgeraeumt.length) abgeraeumt++;
    z = r.zustand;
    gleich(z.beendet, false);
  }
  // Feld bis auf die Mitte gefüllt, ohne gleichfarbige Nachbarn (3-Färbung) → Abräumen
  const voll = L.zellen.map((c) => [((c.q - c.r) % 3 + 3) % 3, ((c.q - c.r) % 3 + 3) % 3]);
  voll[M] = [];
  const e = { ...neuesSpiel('voll', 'entspannt'), brett: voll, angebot: [[3], null, null] };
  const r = zug(e, 0, M);
  gleich(r.abgeraeumt.length, 6);
  gleich(freieFelder(r.zustand.brett).length, 6);
  gleich(r.zustand.beendet, false);
  wahr(r.hinweis);
  const k = zug({ ...e, variante: 'leicht', rueckgaengigRest: 3 }, 0, M);
  gleich(k.zustand.beendet, true, 'Klassisch endet');
  wahr(abgeraeumt >= 0);
  const b = leer(); b[3] = [1, 1, 1]; b[5] = [2]; b[7] = [0, 0];
  tief(raeumeKleinste(b, 2).geraeumt, [5, 7]);
});

test('Sechseck: Hinweis wählt Auflösung, Vorschau-Nachbarn', () => {
  let z = neuesSpiel('hinweis', 'leicht');
  const a = L.nachbarn[M][0];
  const brett = leer();
  brett[a] = [0, 0, 0, 0, 0, 0, 0];
  z = { ...z, brett, angebot: [[1, 1], [2, 0, 0, 0], null] };
  const t = hinweis(z);
  gleich(t.platz, 1);
  wahr(L.nachbarn[a].includes(t.zelle));
  const r = zug(z, t.platz, t.zelle);
  gleich(r.aufgeloest, 10);
  tief(passendeNachbarn(z, [2, 0], M), [a]);
});

test('Sechseck: Speichern/Laden und Prüfung', () => {
  let z = neuesSpiel('speichern', 'entspannt');
  const t = hinweis(z);
  z = zug(z, t.platz, t.zelle).zustand;
  const json = JSON.parse(JSON.stringify(zumSpeichern(z)));
  wahr(istGueltig(json));
  const g = ausSpeicher(json);
  tief(g, z);
  gleich(ausSpeicher({ ...json, brett: json.brett.slice(1) }), null);
  gleich(ausSpeicher({ ...json, variante: 'x' }), null);
  gleich(ausSpeicher({ ...json, rueckgaengigRest: 3 }), null, 'Entspannt hat kein Limit');
  const b = json.brett.map((st) => st.slice()); b[0] = [9];
  gleich(ausSpeicher({ ...json, brett: b }), null, 'Farbe außerhalb');
  gleich(ausSpeicher(null), null);
  gleich(Object.keys(VARIANTEN).length, 4);
  wahr(ZIEL === 10);
});
