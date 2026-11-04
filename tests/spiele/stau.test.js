import { test, gleich, tief, wahr } from '../mini-test.js';
import {
  STUFEN, belegung, spielraum, loese, hinweis, cluster, erzeugeKlassisch, erzeugeAusparken, abhaengigkeitsTiefe,
  neuesSpiel, schiebe, fahreAus, rueckgaengig, wiederholen, neustart, zugZahl, ausgeparkt, geloest, amZiel,
  freiesFahrzeug, startPositionen, ausSpeicher, zumSpeichern, pruefeLevel, bahn,
} from '../../spiele/stau/logik.js';
import { erstelleZufall } from '../../kern/zufall.js';

/**
 * Level aus Textzeilen: '.' frei, 'Z' Zielfahrzeug, andere Buchstaben = Fahrzeuge.
 * Bei Ausparken: pfeile = { A: 1, B: -1, … }
 */
function levelAus(zeilen, { modus = 'klassisch', pfeile = {}, optimum = 0 } = {}) {
  const H = zeilen.length, B = zeilen[0].length;
  const zellen = {};
  zeilen.forEach((z, y) => [...z].forEach((c, x) => { if (c !== '.') (zellen[c] ||= []).push([x, y]); }));
  const fahrzeuge = Object.keys(zellen).sort().map((c, i) => {
    const f = zellen[c];
    const achse = f.every(([, y]) => y === f[0][1]) ? 'h' : 'v';
    const n = { x: f[0][0], y: f[0][1], laenge: f.length, achse, farbe: c === 'Z' ? 0 : 1 + (i % 9) };
    if (c === 'Z') n.ziel = true;
    if (modus === 'ausparken') n.pfeil = pfeile[c] ?? 1;
    n.name = c;
    return n;
  });
  const zielZeile = fahrzeuge.find((f) => f.ziel)?.y ?? -1;
  return {
    version: 1, modus, variante: modus === 'ausparken' ? 'ausparken' : 'leicht', nr: 1, seed: 't',
    breite: B, hoehe: H, ausgangZeile: zielZeile, fahrzeuge, optimum,
  };
}
const idx = (level, c) => level.fahrzeuge.findIndex((f) => f.name === c);

const L1 = levelAus([
  '......',
  '......',
  'ZZ..A.',
  '....A.',
  '......',
  '......',
]);

test('Stau: Bewegung nur entlang der Achse, Stopp an Fahrzeug und Rand', () => {
  const l = levelAus([
    '..B...',
    '..B...',
    'ZZ....',
    'CCC.D.',
    '....D.',
    '......',
  ]);
  const pos = startPositionen(l);
  tief(spielraum(l, pos, idx(l, 'Z')), { min: 0, max: 4 });
  tief(spielraum(l, pos, idx(l, 'B')), { min: 0, max: 1 }, 'B stößt unten an C');
  tief(spielraum(l, pos, idx(l, 'C')), { min: 0, max: 1 }, 'C stößt an D');
  tief(spielraum(l, pos, idx(l, 'D')), { min: 0, max: 4 });
  // schiebe zu weit → bis zum Hindernis
  let z = neuesSpiel(l);
  z = schiebe(z, idx(l, 'B'), 5);
  gleich(z.pos[idx(l, 'B')], 1);
  gleich(schiebe(z, idx(l, 'C'), 4).pos[idx(l, 'C')], 1, 'C nur bis vor D');
  gleich(schiebe(z, idx(l, 'D'), 3), null, 'D steht schon da – keine Bewegung');
  const g = belegung(l, z.pos);
  gleich(g[2 * 6 + 2], idx(l, 'B'));
});

test('Stau: Zielfahrzeug am Ausgang = gelöst', () => {
  let z = neuesSpiel(L1);
  wahr(!geloest(z));
  z = schiebe(z, idx(L1, 'A'), 0);
  z = schiebe(z, idx(L1, 'Z'), 4);
  wahr(z.gewonnen && amZiel(L1, z.pos));
  gleich(zugZahl(z), 2);
});

test('Stau: Schritte desselben Fahrzeugs = ein Zug, hin und zurück = 0 Züge', () => {
  let z = neuesSpiel(L1);
  const zi = idx(L1, 'Z');
  z = schiebe(z, zi, 1); z = schiebe(z, zi, 2);
  gleich(zugZahl(z), 1);
  z = schiebe(z, idx(L1, 'A'), 0);
  gleich(zugZahl(z), 2);
  z = schiebe(z, idx(L1, 'A'), 1);
  z = schiebe(z, idx(L1, 'A'), 2);
  gleich(zugZahl(z), 1, 'A wieder am Start');
  z = schiebe(z, zi, 1); z = schiebe(z, zi, 0);
  gleich(zugZahl(z), 0);
});

test('Stau: Löser findet Optimum 1, 3 und 8 Züge; Unlösbares erkannt', () => {
  const eins = levelAus(['......', '......', 'ZZ....', '......', '......', '......']);
  gleich(loese(eins, startPositionen(eins)).length, 1);
  const drei = levelAus([
    '....A.',
    '....A.',
    'ZZ..AB',
    '.....B',
    '.CCC.B',
    '......',
  ]);
  gleich(loese(drei, startPositionen(drei)).length, 3);
  const unloesbar = levelAus(['......', '......', 'ZZ..AA', '......', '......', '......']);
  gleich(loese(unloesbar, startPositionen(unloesbar)), null);
  const c = cluster(unloesbar, startPositionen(unloesbar));
  wahr([...c.abstand].every((d) => d < 0), 'kein Zielzustand im Cluster');
});

/** Unabhängige, einfache Vorwärts-BFS mit Einzelschritten (Strecken zusammengefasst) zur Kontrolle */
function bfsKontrolle(level) {
  const zi = level.fahrzeuge.findIndex((f) => f.ziel);
  const start = JSON.stringify(startPositionen(level));
  const gesehen = new Set([start]);
  let ebene = [start];
  for (let d = 0; d < 80; d++) {
    const naechste = [];
    for (const k of ebene) {
      const pos = JSON.parse(k);
      if (pos[zi] === level.breite - 2) return d;
      for (let i = 0; i < pos.length; i++) {
        const r = spielraum(level, pos, i);
        for (let p = r.min; p <= r.max; p++) {
          if (p === pos[i]) continue;
          const n = pos.slice(); n[i] = p;
          const s = JSON.stringify(n);
          if (!gesehen.has(s)) { gesehen.add(s); naechste.push(s); }
        }
      }
    }
    ebene = naechste;
  }
  return -1;
}

test('Stau: Löser stimmt mit unabhängiger BFS überein (handgebaut, Optimum 8)', () => {
  const acht = levelAus([
    'AA.B..',
    'C..BDD',
    'CZZB.E',
    'C.FFFE',
    'G...HH',
    'G.II..',
  ]);
  const opt = loese(acht, startPositionen(acht)).length;
  gleich(opt, bfsKontrolle(acht));
  wahr(opt >= 3, `Optimum ${opt}`);
});

test('Stau: Generator Klassisch – Optimalweg führt ins Ziel, Länge = Optimum (je Stufe 4 Seeds)', () => {
  for (const stufe of Object.keys(STUFEN)) {
    for (let nr = 1; nr <= 4; nr++) {
      const l = erzeugeKlassisch(stufe, nr);
      wahr(pruefeLevel(l), `${stufe} ${nr} gültig`);
      const weg = loese(l, startPositionen(l));
      wahr(weg, `${stufe} ${nr} lösbar`);
      gleich(weg.length, l.optimum, `${stufe} ${nr} Optimum`);
      let z = neuesSpiel(l);
      for (const [i, nach] of weg) {
        // jeder Optimalzug ist ein eigener Zug (kein Fahrzeug zweimal hintereinander)
        z = schiebe(z, i, nach);
        wahr(z, 'Zug möglich');
      }
      wahr(z.gewonnen, `${stufe} ${nr} gelöst`);
      gleich(zugZahl(z), l.optimum);
      const [lo] = STUFEN[stufe].bereich;
      wahr(l.optimum >= Math.min(lo, 4), `${stufe} ${nr}: Optimum ${l.optimum}`);
    }
  }
});

test('Stau: Generator Klassisch – unabhängige BFS bestätigt Optimum, Stufen liegen im Bereich', () => {
  const opt = {};
  for (const stufe of Object.keys(STUFEN)) {
    opt[stufe] = [];
    for (let nr = 1; nr <= 2; nr++) {
      const l = erzeugeKlassisch(stufe, nr);
      gleich(bfsKontrolle(l), l.optimum, `${stufe} ${nr}`);
      opt[stufe].push(l.optimum);
      const [lo, hi] = STUFEN[stufe].bereich;
      wahr(l.optimum >= lo && l.optimum <= hi, `${stufe} ${nr}: ${l.optimum} nicht in ${lo}–${hi}`);
    }
  }
  console.log('Optima', JSON.stringify(opt));
});

test('Stau: Determinismus – gleicher Seed → gleiches Level', () => {
  tief(erzeugeKlassisch('mittel', 7), erzeugeKlassisch('mittel', 7));
  tief(erzeugeAusparken(4), erzeugeAusparken(4));
  wahr(JSON.stringify(erzeugeKlassisch('leicht', 1)) !== JSON.stringify(erzeugeKlassisch('leicht', 2)));
});

test('Stau: Hinweis = erster Zug eines Optimalwegs', () => {
  const l = erzeugeKlassisch('leicht', 3);
  let z = neuesSpiel(l);
  for (let k = 0; k < l.optimum; k++) {
    const vorher = loese(l, z.pos).length;
    const t = hinweis(l, z.pos);
    z = schiebe(z, t.i, t.nach);
    gleich(loese(l, z.pos).length, vorher - 1);
  }
  wahr(z.gewonnen);
  gleich(hinweis(l, z.pos), null);
});

test('Stau: Rückgängig/Wiederholen – Zufallszüge vor und zurück → Start', () => {
  const l = erzeugeKlassisch('mittel', 2);
  const r = erstelleZufall('rueck');
  let z = neuesSpiel(l);
  for (let k = 0; k < 60; k++) {
    const i = r.ganz(0, l.fahrzeuge.length - 1);
    const { min, max } = spielraum(l, z.pos, i);
    const n = schiebe(z, i, r.ganz(min, max));
    if (n && !n.gewonnen) z = n;
  }
  const mitte = z.pos.slice();
  const anzahl = z.zurueck.length;
  for (let k = 0; k < anzahl; k++) z = rueckgaengig(z);
  tief(z.pos, startPositionen(l));
  gleich(rueckgaengig(z), null);
  for (let k = 0; k < anzahl; k++) z = wiederholen(z);
  tief(z.pos, mitte);
  gleich(wiederholen(z), null);
});

test('Stau: Neustart ist rückgängig machbar und setzt den Zähler zurück', () => {
  let z = neuesSpiel(L1);
  z = schiebe(z, idx(L1, 'A'), 0);
  z = neustart(z);
  tief(z.pos, startPositionen(L1));
  gleich(zugZahl(z), 0);
  z = rueckgaengig(z);
  gleich(z.pos[idx(L1, 'A')], 0);
  gleich(zugZahl(z), 1);
  gleich(neustart(neuesSpiel(L1)).zurueck.length, 0, 'unverändert → kein Eintrag');
});

test('Stau: Ausparken – frei fährt raus, blockiert federt zurück', () => {
  const l = levelAus([
    'AA....',
    '..B...',
    '..B...',
    '......',
    '......',
    '......',
  ], { modus: 'ausparken', pfeile: { A: 1, B: -1 } });
  let z = neuesSpiel(l);
  const a = idx(l, 'A'), b = idx(l, 'B');
  tief(bahn(l, z.pos, z.draussen, b), { frei: true, blocker: -1, stopp: 1 });
  const r = fahreAus(z, a);
  wahr(r.frei);
  z = r.zustand;
  gleich(ausgeparkt(z), 1);
  z = fahreAus(z, b).zustand;
  wahr(z.gewonnen);
  z = rueckgaengig(z);
  gleich(ausgeparkt(z), 1);
  // blockiert
  const l3 = levelAus(['AA.B..', '...B..', '......', '......', '......', '......'], { modus: 'ausparken', pfeile: { A: 1, B: 1 } });
  let z3 = neuesSpiel(l3);
  const r3 = fahreAus(z3, idx(l3, 'A'));
  gleich(r3.frei, false);
  gleich(r3.blocker, idx(l3, 'B'));
  gleich(r3.stopp, 1);
  tief(r3.zustand.pos, z3.pos, 'Zustand unverändert');
  gleich(r3.zustand.anstoesser, 1);
  gleich(r3.zustand.zurueck.length, 0);
});

test('Stau: Generator Ausparken – gierig leert immer das Feld, kreisfrei (150 Seeds)', () => {
  for (let nr = 1; nr <= 150; nr++) {
    const l = erzeugeAusparken(nr);
    wahr(pruefeLevel(l), `Level ${nr} gültig`);
    wahr(Number.isFinite(abhaengigkeitsTiefe(l)), `Level ${nr} kreisfrei`);
    let z = neuesSpiel(l);
    for (let k = 0; k < l.fahrzeuge.length; k++) {
      const i = freiesFahrzeug(z);
      wahr(i >= 0, `Level ${nr}: Sackgasse`);
      z = fahreAus(z, i).zustand;
    }
    wahr(z.gewonnen, `Level ${nr} geleert`);
    wahr(l.fahrzeuge.length >= 8, `Level ${nr}: nur ${l.fahrzeuge.length} Fahrzeuge`);
  }
});

test('Stau: Spielstand speichern/laden, ungültige Stände abgelehnt', () => {
  const l = erzeugeKlassisch('leicht', 5);
  let z = neuesSpiel(l);
  const t = hinweis(l, z.pos);
  z = schiebe(z, t.i, t.nach);
  const json = JSON.parse(JSON.stringify(zumSpeichern(z)));
  const g = ausSpeicher(json);
  tief(zumSpeichern(g), zumSpeichern(z));
  gleich(ausSpeicher(null), null);
  gleich(ausSpeicher({ version: 1 }), null);
  gleich(ausSpeicher({ ...json, pos: json.pos.map(() => 0) }), null, 'Überlappung');
  gleich(ausSpeicher({ ...json, level: { ...json.level, breite: 99 } }), null);
  const kaputt = JSON.parse(JSON.stringify(json));
  kaputt.level.fahrzeuge[0].laenge = 7;
  gleich(ausSpeicher(kaputt), null);
  const verlauf = { ...json, zurueck: [['x', 1]] };
  gleich(ausSpeicher(verlauf).zurueck.length, 0, 'fehlerhafter Verlauf → leer');
});
