import { test, gleich, tief, wahr } from '../mini-test.js';
import {
  STUFEN_IDS, pruefeBild, stufeVon, bilderFuer, erzeugeMosaik, bildFuerNr, erzeugeSpiel, ausBild, malbar, male,
  rueckgaengig, wiederholen, neustart, restJeFarbe, anzahlJeFarbe, restGesamt, fertig, naechsteOffeneFarbe,
  naechstesOffenes, hinweis, linie, zumSpeichern, ausSpeicher, kannRueckgaengig, kannWiederholen,
} from '../../spiele/malen-nach-zahlen/logik.js';
import { erstelleZufall } from '../../kern/zufall.js';
import modul from '../../spiele/malen-nach-zahlen/index.js';

const bilder = await fetch(new URL('../../spiele/malen-nach-zahlen/bilder.json', import.meta.url)).then((r) => r.json());

/** Kleines Testbild: Ziffern = Farb-IDs, '.' leer */
function testBild(zeilen, titel = 'Test') {
  const farben = {};
  for (const c of zeilen.join('')) if (c !== '.') farben[c] = Number(c);
  return pruefeBild({ titel, zeilen, farben });
}
const spiel = (zeilen) => ausBild(testBild(zeilen));

test('Bilder: Prüfung lehnt Ungültiges ab', () => {
  wahr(testBild(['0011', '0011', '2233', '2233']), 'gültig');
  gleich(pruefeBild(null), null);
  gleich(pruefeBild({ titel: 'x', zeilen: ['aaaa', 'aaa', 'aaaa', 'aaaa'], farben: { a: 1 } }), null, 'ungleiche Zeilen');
  gleich(pruefeBild({ titel: 'x', zeilen: ['abaa', 'aaaa', 'aaaa', 'aaaa'], farben: { a: 1 } }), null, 'unbekannter Buchstabe');
  gleich(pruefeBild({ titel: 'x', zeilen: ['aaaa', 'aaaa', 'aaaa', 'aaaa'], farben: { a: 12 } }), null, 'Farbe > 9');
  gleich(pruefeBild({ titel: 'x', zeilen: ['....', '....', '....', '....'], farben: {} }), null, 'leer');
  gleich(pruefeBild({ titel: 'x', zeilen: new Array(33).fill('a'.repeat(5)), farben: { a: 1 } }), null, 'zu groß');
  gleich(pruefeBild({ titel: 'x', zeilen: ['aaaa', 'aaaa', 'aaaa', 'aaaa'], farben: { a: 1, __proto__: null } })?.b, 4);
});

test('Bilder: bilder.json – alle gültig, 12–32, höchstens 10 Farben, je Stufe genug', () => {
  wahr(Array.isArray(bilder) && bilder.length >= 20, `mindestens 20 Bilder (${bilder.length})`);
  const titel = new Set();
  for (const m of bilder) {
    const p = pruefeBild(m);
    wahr(p, `ungültig: ${m.titel}`);
    const n = Math.max(p.b, p.h);
    wahr(n >= 12 && n <= 32, `${m.titel}: Größe ${p.b}×${p.h}`);
    wahr(new Set(p.bild.filter((v) => v >= 0)).size <= 10, `${m.titel}: zu viele Farben`);
    wahr(!titel.has(m.titel), `doppelter Titel ${m.titel}`);
    ausSpeicher(zumSpeichern(ausBild(p)));
    titel.add(m.titel);
  }
  for (const s of STUFEN_IDS) wahr(bilderFuer(bilder, s).length >= 6, `Stufe ${s}: ${bilderFuer(bilder, s).length} Bilder`);
});

test('Stufen nach Bildgröße', () => {
  gleich(stufeVon({ b: 16, h: 12 }), 'klein');
  gleich(stufeVon({ b: 12, h: 17 }), 'mittel');
  gleich(stufeVon({ b: 24, h: 24 }), 'mittel');
  gleich(stufeVon({ b: 25, h: 10 }), 'gross');
});

test('Mosaik: deterministisch, symmetrisch, Größe passend zur Stufe', () => {
  for (const s of STUFEN_IDS) {
    for (let k = 0; k < 12; k++) {
      const a = erzeugeMosaik(erstelleZufall(`m${k}`), s);
      const b = erzeugeMosaik(erstelleZufall(`m${k}`), s);
      tief(a, b, 'gleicher Seed');
      gleich(stufeVon(a), s, `Stufe ${s}`);
      wahr(a.b >= 12, 'mindestens 12');
      for (let y = 0; y < a.h; y++) {
        for (let x = 0; x < a.b; x++) {
          const v = a.bild[y * a.b + x];
          gleich(v, a.bild[y * a.b + (a.b - 1 - x)], 'waagerecht gespiegelt');
          gleich(v, a.bild[(a.h - 1 - y) * a.b + x], 'senkrecht gespiegelt');
        }
      }
      const farben = new Set(a.bild.filter((v) => v >= 0));
      wahr(farben.size >= 2 && farben.size <= 10, `Farben ${farben.size}`);
    }
  }
});

test('Reihenfolge: erst alle Bilder, dann abwechselnd Mosaik und Bild', () => {
  const liste = bilderFuer(bilder, 'klein');
  const rng = () => erstelleZufall('r');
  gleich(bildFuerNr('klein', 0, bilder, rng()).titel, liste[0].titel);
  gleich(bildFuerNr('klein', liste.length - 1, bilder, rng()).titel, liste[liste.length - 1].titel);
  gleich(bildFuerNr('klein', liste.length, bilder, rng()).titel, 'Mosaik');
  gleich(bildFuerNr('klein', liste.length + 1, bilder, rng()).titel, liste[0].titel);
  gleich(bildFuerNr('klein', liste.length + 3, bilder, rng()).titel, liste[1].titel);
  gleich(bildFuerNr('gross', 0, [], rng()).titel, 'Mosaik', 'ohne Bilder');
});

test('Spiel: Farben werden fortlaufend nummeriert', () => {
  const z = spiel(['77..', '7733', '..33', '9999']);
  tief(z.farben, [3, 7, 9]);
  tief(z.bild, [1, 1, -1, -1, 1, 1, 0, 0, -1, -1, 0, 0, 2, 2, 2, 2]);
  tief(anzahlJeFarbe(z), [4, 4, 4]);
  gleich(restGesamt(z), 12);
});

test('Malen: nur passende, offene Felder – falsche bleiben unberührt', () => {
  let z = spiel(['0011', '0011', '2222', '....']);
  gleich(malbar(z, 0, 0), true);
  gleich(malbar(z, 2, 0), false, 'andere Zahl');
  gleich(malbar(z, 12, 0), false, 'leeres Feld');
  z = male(z, [0, 1, 2, 3, 1, 12], 0);
  tief(z.verlauf, [[0, 1]], 'nur passende, ohne Doppelte');
  const gleichBleibend = male(z, [0, 2, 3], 0);
  gleich(gleichBleibend, z, 'nichts Neues → gleicher Zustand, kein Verlaufseintrag');
  tief(restJeFarbe(z), [2, 4, 4]);
});

test('Rückgängig/Wiederholen: ein Zug = ein Eintrag', () => {
  let z = spiel(['0011', '0011', '2222', '2222']);
  z = male(z, [0, 1, 4], 0);
  z = male(z, [2, 3], 1);
  gleich(kannRueckgaengig(z), true);
  z = rueckgaengig(z);
  tief(restJeFarbe(z), [1, 4, 8]);
  gleich(kannWiederholen(z), true);
  z = rueckgaengig(z);
  gleich(restGesamt(z), 16);
  gleich(rueckgaengig(z), null);
  z = wiederholen(z);
  tief(restJeFarbe(z), [1, 4, 8]);
  z = male(z, [5], 0);
  gleich(kannWiederholen(z), false, 'neuer Zug löscht Wiederholen');
  z = neustart(z);
  gleich(restGesamt(z), 16);
  gleich(kannRueckgaengig(z), false);
});

test('Fertig: alle Felder gemalt', () => {
  let z = spiel(['00..', '0011', '..11', '2222']);
  for (let f = 0; f < z.farben.length; f++) z = male(z, z.bild.map((_, i) => i), f);
  gleich(fertig(z), true);
  gleich(naechsteOffeneFarbe(z, 0), -1);
});

test('Hinweis und nächste Stelle', () => {
  let z = spiel(['0000', '0110', '0110', '0022']);
  // gewählte Farbe mit offenen Feldern → nächstes Feld zur Mitte
  const a = hinweis(z, 1);
  gleich(a.farbe, 1);
  wahr([5, 6, 9, 10].includes(a.feld));
  // gewählte Farbe fertig → Farbe mit den wenigsten Restfeldern (Farbe 2 hat 2)
  z = male(z, [5, 6, 9, 10], 1);
  const b = hinweis(z, 1);
  gleich(b.farbe, 2);
  wahr([14, 15].includes(b.feld));
  gleich(naechstesOffenes(z, 0, -1), 0);
  gleich(naechstesOffenes(z, 0, 4), 7);
  gleich(naechstesOffenes(z, 0, 13), 0, 'umlaufend');
  gleich(naechstesOffenes(z, 1, 0), -1, 'Farbe fertig');
  gleich(naechsteOffeneFarbe(z, 1), 2);
  // Hinweis-Schleife malt das Bild fertig
  let n = 0;
  while (!fertig(z) && n++ < 100) { const hw = hinweis(z, -1); z = male(z, [hw.feld], hw.farbe); }
  gleich(fertig(z), true);
  gleich(hinweis(z, 0), null);
});

test('Linie (Bresenham) ohne Lücken', () => {
  tief(linie(5, 0, 4), [0, 1, 2, 3, 4]);
  tief(linie(5, 0, 24), [0, 6, 12, 18, 24]);
  const l = linie(10, 0, 93);
  gleich(l[0], 0); gleich(l[l.length - 1], 93);
  for (let k = 1; k < l.length; k++) {
    const dx = Math.abs((l[k] % 10) - (l[k - 1] % 10)), dy = Math.abs(Math.floor(l[k] / 10) - Math.floor(l[k - 1] / 10));
    wahr(dx <= 1 && dy <= 1, 'Nachbarfelder');
  }
});

test('Erzeugen: alle Stufen, Bild steckt im Zustand', () => {
  for (const s of STUFEN_IDS) {
    for (const nr of [0, 3, 500, 501]) {
      const z = erzeugeSpiel({ stufe: s, nr, seed: 'x', bilder });
      gleich(z.stufe, s);
      gleich(z.bild.length, z.b * z.h);
      wahr(z.farben.length >= 1 && z.farben.length <= 10);
      wahr(Math.max(z.b, z.h) >= 12 && Math.max(z.b, z.h) <= 32);
      tief(erzeugeSpiel({ stufe: s, nr, seed: 'x', bilder }), z, 'gleicher Seed');
    }
  }
  gleich(erzeugeSpiel({ stufe: 'quatsch', bilder }).stufe, 'klein');
});

test('Speichern/Laden: Runde und JSON-tauglich', () => {
  let z = erzeugeSpiel({ stufe: 'mittel', nr: 0, seed: 's', bilder });
  const f0 = naechstesOffenes(z, 0, -1);
  z = male(z, [f0], 0);
  z = male(z, [naechstesOffenes(z, 1, -1)], 1);
  z = rueckgaengig(z);
  const d = zumSpeichern(z);
  gleich(d.gemalt, undefined, 'gemalt wird nicht gespeichert');
  const text = JSON.stringify(d);
  const z2 = ausSpeicher(JSON.parse(text));
  tief(z2.gemalt, z.gemalt);
  tief(zumSpeichern(z2), d);
  tief(wiederholen(z2).verlauf, wiederholen(z).verlauf);
});

test('Laden: kaputte Stände werden abgelehnt', () => {
  const gut = zumSpeichern(male(spiel(['0011', '0011', '2222', '....']), [0, 1], 0));
  ausSpeicher(gut);
  const kaputt = [
    null, 5, {}, { ...gut, v: 2 }, { ...gut, stufe: 'x' }, { ...gut, b: 3 }, { ...gut, b: 40 }, { ...gut, nr: -1 },
    { ...gut, titel: 7 }, { ...gut, titel: '<img src=x>' }, { ...gut, titel: '' }, { ...gut, farben: [] }, { ...gut, farben: [1, 1, 2] }, { ...gut, farben: [0, 1, 20] },
    { ...gut, bild: gut.bild.slice(1) }, { ...gut, bild: gut.bild.map(() => 5) }, { ...gut, bild: gut.bild.map(() => -1) },
    { ...gut, verlauf: 'x' }, { ...gut, verlauf: [[99]] }, { ...gut, verlauf: [[12]] }, { ...gut, verlauf: [[0], [0]] },
    { ...gut, verlauf: [[0]], vor: [[0]] }, { ...gut, verlauf: [[]] }, { ...gut, verlauf: [['0']] }, { ...gut, bild: gut.bild.map(() => 0.5) },
  ];
  for (const k of kaputt) {
    let geworfen = false;
    try { ausSpeicher(k); } catch { geworfen = true; }
    wahr(geworfen, `nicht abgelehnt: ${JSON.stringify(k)?.slice(0, 80)}`);
  }
});

test('Modul: Schnittstelle', () => {
  gleich(modul.id, 'malen-nach-zahlen');
  gleich(modul.standVersion, 1);
  gleich(modul.variantenTitel, 'Bildgröße');
  tief(modul.varianten.map((v) => v.id), ['klein', 'mittel', 'gross']);
  gleich(typeof modul.erstelle, 'function');
});
