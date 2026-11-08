import { test, gleich, tief, wahr } from '../mini-test.js';
import {
  STUFEN, STUFEN_IDS, KISTE, verdeckt, istFrei, findeKiste, aktiveKisten, wartendeKisten, kannTippen, tippe,
  rueckgaengig, setzeWieder, neustart, gewonnen, festgefahren, restSchrauben, restBretter, legaleZuege,
  naechsteSchraube, loese, hinweis, erzeugeLevel, zumSpeichern, ausSpeicher, istGueltig, ausLevel,
} from '../../spiele/schrauben/logik.js';

/**
 * Kleines Level von Hand. bretter: [[Schicht, [Zellen]]], schrauben: [[Zelle, Farbe, Brett]]
 * Wand 4 × 4, Zelle = y * 4 + x
 */
function level(bretter, schrauben, kisten, { aktiv = 2, plaetze = 2, loesung = [] } = {}) {
  return ausLevel({
    stufe: 'leicht', level: 1, seed: 't', b: 4, h: 4,
    bretter: bretter.map(([l, z]) => ({ l, z })),
    schrauben: schrauben.map(([i, f, br]) => ({ i, f, br })),
    kisten, aktiv, plaetze, loesung,
  });
}
const spiele = (z, ...ss) => ss.reduce((st, s) => { const r = tippe(st, s); if (!r) throw new Error(`Zug ${s} nicht erlaubt`); return r.zustand; }, z);

test('Verdeckung: nur Bretter höherer Schicht verdecken, gefallene nicht mehr', () => {
  // Brett 0 (unten): Zellen 0, 1 · Brett 1 (oben): Zellen 1, 2, 3 → Zelle 1 liegt unter Brett 1
  let z = level([[0, [0, 1]], [1, [1, 2, 3]]], [[0, 0, 0], [1, 0, 0], [2, 1, 1], [3, 1, 1]], [0, 1]);
  gleich(verdeckt(z, 0), false, 'Zelle 0 liegt frei');
  gleich(verdeckt(z, 1), true, 'Zelle 1 liegt unter Brett 1');
  gleich(istFrei(z, 1), false);
  gleich(istFrei(z, 2), true, 'Schrauben des oberen Bretts sind frei');
  gleich(kannTippen(z, 1), false, 'verdeckte Schraube lässt sich nicht drehen');
  z = spiele(z, 2, 3);                       // Brett 1 hat keine Schrauben mehr und fällt
  gleich(z.rest[1], 0);
  gleich(verdeckt(z, 1), false, 'nach dem Fallen frei');
  gleich(istFrei(z, 1), true);
});

test('Verdeckung: gleiche Schicht und tiefere Schicht verdecken nicht', () => {
  // Zwei Bretter derselben Schicht; Brett 2 liegt eine Schicht tiefer unter allem
  const z = level([[1, [0, 1]], [1, [2, 3]], [0, [1, 2, 3, 5]]],
    [[0, 0, 0], [1, 0, 0], [2, 0, 1], [3, 0, 1], [5, 0, 2]], [0, 0]);
  gleich([0, 1, 2, 3].every((s) => istFrei(z, s)), true, 'obere Schrauben frei');
  gleich(verdeckt(z, 4), false, 'Zelle 5 wird von niemandem überdeckt');
  gleich(verdeckt(z, 0), false, 'Brett in tieferer Schicht verdeckt nicht');
});

test('Kiste: passende Farbe geht in die aktive Kiste, volle Kiste rückt nach', () => {
  // 6 Schrauben, Farbe 0 und 1 je eine Kiste, aktiv = 1 → Kiste 1 wartet
  const z0 = level([[0, [0, 1, 2]], [0, [4, 5, 6]]],
    [[0, 0, 0], [1, 0, 0], [2, 0, 0], [4, 1, 1], [5, 1, 1], [6, 1, 1]], [0, 1], { aktiv: 1, plaetze: 3 });
  gleich(aktiveKisten(z0).join(), '0');
  tief(wartendeKisten(z0), [1]);
  let r = tippe(z0, 0);
  gleich(r.ziel, 'kiste');
  gleich(r.zustand.fuell[0], 1);
  r = tippe(r.zustand, 4);
  gleich(r.ziel, 'park', 'Farbe 1 hat keine aktive Kiste');
  tief(r.zustand.park, [1]);
  r = tippe(r.zustand, 1);
  r = tippe(r.zustand, 2);
  gleich(r.kisteVoll, 1);
  gleich(r.zustand.fuell[0], KISTE);
  tief(aktiveKisten(r.zustand), [1], 'nächste Kiste rückt nach');
  tief(r.zustand.park, [], 'geparkte Schraube ist automatisch in die neue Kiste gesprungen');
  gleich(r.zustand.fuell[1], 1);
});

test('Parken: Parkplätze begrenzt, bei Voll sind Schrauben ohne Kiste nicht drehbar', () => {
  // aktiv = 1 (Farbe 0), 2 Parkplätze, drei Schrauben der Farbe 1/2 ohne Kiste
  const z0 = level([[0, [0, 1, 2, 3, 4]]],
    [[0, 1, 0], [1, 2, 0], [2, 1, 0], [3, 0, 0], [4, 0, 0]].slice(0, 5), [0, 1, 2], { aktiv: 1, plaetze: 2 });
  // Kisten: 0 (3 Plätze), 1, 2 -> Kapazität passt hier nicht, nur Regeln prüfen
  let z = tippe(z0, 0).zustand;
  z = tippe(z, 1).zustand;
  gleich(z.park.length, 2);
  gleich(kannTippen(z, 2), false, 'Parkplätze voll, Farbe 1 hat keine aktive Kiste');
  gleich(kannTippen(z, 3), true, 'Farbe 0 hat eine Kiste');
  gleich(festgefahren(z), false);
  z = tippe(z, 3).zustand;
  z = tippe(z, 4).zustand;
  gleich(z.fuell[0], 2);
  gleich(z.park.length, 2);
  gleich(legaleZuege(z).join(), '', 'nichts mehr drehbar außer verbleibenden Schrauben');
  gleich(festgefahren(z), true, 'festgefahren');
  gleich(gewonnen(z), false);
});

test('Entparken: Kistenwechsel löst eine Kettenreaktion aus', () => {
  // aktiv 1; Kisten in Reihenfolge 0,1,2; Schrauben: je 3 pro Farbe; 1 und 2 werden zuerst geparkt
  const bretter = [[0, [0, 1, 2, 3, 4, 5, 6, 7, 8]]];
  const sch = [[0, 1, 0], [1, 2, 0], [2, 0, 0], [3, 0, 0], [4, 0, 0], [5, 1, 0], [6, 1, 0], [7, 2, 0], [8, 2, 0]];
  let z = level(bretter, sch, [0, 1, 2], { aktiv: 1, plaetze: 6 });
  z = spiele(z, 0, 1, 5, 6, 7, 8);
  tief(z.park.slice().sort(), [1, 1, 1, 2, 2, 2]);
  z = spiele(z, 2, 3);
  tief(z.park.length, 6, 'noch zwei von drei in Kiste 0');
  z = spiele(z, 4);
  // Kiste 0 voll → Kiste 1 aktiv und nimmt 3× Farbe 1 → voll → Kiste 2 aktiv und nimmt 3× Farbe 2
  tief(z.park, []);
  tief(z.fuell, [3, 3, 3]);
  gleich(gewonnen(z), true);
});

test('Brett fällt erst, wenn alle Schrauben weg sind', () => {
  let z = level([[0, [0, 1]]], [[0, 0, 0], [1, 0, 0]], [0, 0].slice(0, 1).concat([]), { aktiv: 1, plaetze: 2 });
  // Kapazität egal: eine Kiste 0 (3 Plätze), 2 Schrauben
  let r = tippe(z, 0);
  gleich(r.brettFaellt, false);
  gleich(restBretter(r.zustand), 1);
  r = tippe(r.zustand, 1);
  gleich(r.brettFaellt, true);
  gleich(restBretter(r.zustand), 0);
  gleich(gewonnen(r.zustand), true);
  gleich(restSchrauben(r.zustand), 0);
});

test('Rückgängig/Wiederholen stellen genau den vorherigen Stand her', () => {
  let z = level([[0, [0, 1, 2]], [1, [2, 3]]], [[0, 0, 0], [1, 0, 0], [2, 1, 0], [3, 1, 1]], [0, 1], { aktiv: 2, plaetze: 3 });
  const z0 = z;
  z = spiele(z, 3);           // Schraube 3 gehört zu Brett 1 (Zellen 2,3) – Zelle 3 frei
  const z1 = z;
  gleich(z.zuege.length, 1);
  const r = rueckgaengig(z);
  tief([r.entfernt, r.fuell, r.park, r.rest], [z0.entfernt, z0.fuell, z0.park, z0.rest]);
  tief(r.vor, [3]);
  gleich(kannTippen(r, 3), true);
  const w = setzeWieder(r);
  tief([w.zustand.entfernt, w.zustand.fuell, w.zustand.park, w.zustand.zuege], [z1.entfernt, z1.fuell, z1.park, z1.zuege]);
  tief(w.zustand.vor, []);
  gleich(rueckgaengig(z0), null, 'nichts zurückzunehmen');
  gleich(setzeWieder(z0), null);
  // ein neuer Zug leert die Wiederholen-Liste
  const z2 = tippe(r, 0);
  gleich(z2.zustand.vor.length, 0);
});

test('Neustart: gleiches Level von vorn', () => {
  let z = level([[0, [0, 1, 2]]], [[0, 0, 0], [1, 0, 0], [2, 0, 0]], [0], { aktiv: 1 });
  z = spiele(z, 0, 1);
  const n = neustart(z);
  gleich(n.zuege.length, 0);
  gleich(restSchrauben(n), 3);
  tief(n.bretter, z.bretter);
});

test('Tastatur-Navigation: nächste freie Schraube in der Richtung', () => {
  const z = level([[0, [0, 1, 2, 3, 4, 5, 6, 7]]], [[0, 0, 0], [3, 0, 0], [4, 0, 0], [7, 0, 0], [5, 0, 0], [6, 0, 0]], [0, 0], { aktiv: 2 });
  // Zellen: Zeile 0: 0 und 3; Zeile 1: 4,5,6,7
  gleich(naechsteSchraube(z, 0, 1, 0), 1, 'rechts von Zelle 0 liegt Zelle 3 (nächste in der Zeile)');
  gleich(naechsteSchraube(z, 0, 0, 1), 2, 'unten von Zelle 0 liegt Zelle 4');
  gleich(naechsteSchraube(z, 0, -1, 0), -1);
  gleich(naechsteSchraube(z, 0, 0, -1), -1);
});

test('Stufen: Parameter wie im Konzept', () => {
  gleich(STUFEN_IDS.join(), 'leicht,mittel,schwer');
  gleich(STUFEN.leicht.bretter, 4); gleich(STUFEN.leicht.farben[1], 3); gleich(STUFEN.leicht.plaetze, 5);
  gleich(STUFEN.schwer.bretter, 12); gleich(STUFEN.schwer.farben[1], 6); gleich(STUFEN.schwer.plaetze, 3);
});

function pruefeLevel(z, stufe) {
  const st = STUFEN[stufe];
  const N = z.schrauben.length;
  gleich(N % KISTE, 0, 'Schraubenzahl durch 3 teilbar');
  gleich(z.kisten.length * KISTE, N, 'Kistenkapazität = Schrauben');
  const farben = new Set(z.schrauben.map((s) => s.f));
  wahr(farben.size >= st.farben[0] && farben.size <= st.farben[1], `Farbenzahl ${farben.size}`);
  gleich(z.plaetze, st.plaetze); gleich(z.aktiv, st.aktiv);
  wahr(z.bretter.length >= 2 && z.bretter.length <= st.bretter, 'Brettzahl');
  const orte = new Set();
  z.bretter.forEach((br, bi) => {
    wahr(z.schrauben.filter((s) => s.br === bi).length >= 2, 'mindestens 2 Schrauben je Brett');
  });
  for (const s of z.schrauben) {
    wahr(!orte.has(s.i), 'eindeutige Zellen'); orte.add(s.i);
    wahr(z.bretter[s.br].z.includes(s.i), 'Schraube liegt im Brett');
  }
  for (const l of new Set(z.bretter.map((x) => x.l))) {
    const zellen = z.bretter.filter((x) => x.l === l).flatMap((x) => x.z);
    gleich(new Set(zellen).size, zellen.length, 'gleiche Schicht überlappt nicht');
  }
  wahr(istGueltig(zumSpeichern(z)), 'gültiger Spielstand');
  // die mitgelieferte Lösung gewinnt wirklich
  let s = z;
  for (const x of z.loesung) { const r = tippe(s, x); wahr(r, `Lösungszug ${x} erlaubt`); s = r.zustand; }
  wahr(gewonnen(s), 'Lösung gewinnt');
  gleich(s.park.length, 0, 'am Ende nichts geparkt');
  wahr(legaleZuege(z).length >= 2, 'am Anfang gibt es Auswahl');
}

for (const stufe of STUFEN_IDS) {
  test(`Generator ${stufe}: 30 Seeds liefern lösbare, gültige Level`, () => {
    let geparkt = 0;
    for (let i = 0; i < 30; i++) {
      const z = erzeugeLevel({ stufe, level: i + 1, seed: `seed-${stufe}-${i}` });
      pruefeLevel(z, stufe);
      let s = z;
      for (const x of z.loesung) { const r = tippe(s, x); if (r.ziel === 'park') geparkt++; s = r.zustand; }
    }
    if (stufe !== 'leicht') wahr(geparkt > 0, 'Parken kommt in Lösungen vor');
  });
}

test('Generator: deterministisch (gleicher Seed → gleiches Level), verschiedene Seeds verschieden', () => {
  const a = erzeugeLevel({ stufe: 'mittel', level: 3, seed: 'abc' });
  const b = erzeugeLevel({ stufe: 'mittel', level: 3, seed: 'abc' });
  tief(zumSpeichern(a), zumSpeichern(b));
  const c = erzeugeLevel({ stufe: 'mittel', level: 3, seed: 'abd' });
  wahr(JSON.stringify(zumSpeichern(a)) !== JSON.stringify(zumSpeichern(c)));
  const alle = new Set();
  for (let i = 0; i < 10; i++) alle.add(JSON.stringify(erzeugeLevel({ stufe: 'schwer', level: 1, seed: `v${i}` }).bretter));
  wahr(alle.size >= 8, 'Layouts unterscheiden sich');
  // unbekannte Stufe → leicht
  gleich(erzeugeLevel({ stufe: 'quatsch', seed: 'q' }).stufe, 'leicht');
});

test('Generator: Level sind nicht trivial (Schichten überdecken Schrauben)', () => {
  for (const stufe of ['mittel', 'schwer']) {
    let verdeckte = 0, summe = 0;
    for (let i = 0; i < 10; i++) {
      const z = erzeugeLevel({ stufe, level: 1, seed: `d${i}` });
      z.schrauben.forEach((_, s) => { summe++; if (verdeckt(z, s)) verdeckte++; });
    }
    wahr(verdeckte / summe > 0.2, `${stufe}: ${verdeckte}/${summe} verdeckt`);
  }
});

test('Löser: findet von jedem Stand auf dem Lösungsweg und nach Abweichungen eine Lösung oder beweist Unlösbarkeit', () => {
  for (const stufe of STUFEN_IDS) {
    for (let i = 0; i < 5; i++) {
      const z = erzeugeLevel({ stufe, level: 1, seed: `l${i}` });
      const r = loese(z);
      wahr(r.loesung, `${stufe} ${i}: Lösung`);
      let s = z;
      for (const x of r.loesung) { const t = tippe(s, x); wahr(t, 'Zug der Lösung erlaubt'); s = t.zustand; }
      wahr(gewonnen(s));
      // nach drei beliebigen legalen Zügen: Ergebnis passt zur Wirklichkeit
      let w = z;
      for (let k = 0; k < 3; k++) { const l = legaleZuege(w); if (!l.length) break; w = tippe(w, l[l.length - 1 - k % l.length]).zustand; }
      const q = loese(w, { budget: 30000 });
      if (q.loesung) {
        let u = w;
        for (const x of q.loesung) u = tippe(u, x).zustand;
        wahr(gewonnen(u), 'Folgelösung gewinnt');
      } else {
        wahr(q.vollstaendig || q.knoten > 0);
      }
    }
  }
});

test('Löser/Hinweis: Hinweis-Schleife führt zum Sieg', () => {
  for (const stufe of STUFEN_IDS) {
    let z = erzeugeLevel({ stufe, level: 2, seed: 'hs' });
    let n = 0;
    while (!gewonnen(z) && n++ < 200) {
      const h = hinweis(z);
      wahr(h.typ === 'zug' || h.typ === 'unsicher', `Hinweistyp ${h.typ}`);
      z = tippe(z, h.schraube).zustand;
    }
    wahr(gewonnen(z), `${stufe} gelöst per Hinweisen`);
  }
});

/** Level zum Festfahren (Wand 4 × 4, ein Brett oben deckt die Schrauben der Farbe 0 ab, aktiv 1, 2 Parkplätze) */
function sackgasse() {
  const sch = [[6, 1, 1], [7, 2, 1], [0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 1, 0], [4, 1, 0], [5, 2, 0], [8, 2, 0]];
  return {
    v: 1, stufe: 'leicht', level: 1, seed: 'sack', b: 4, h: 4,
    bretter: [{ l: 0, z: [0, 1, 2, 3, 4, 5, 8] }, { l: 1, z: [0, 1, 2, 6, 7] }],
    schrauben: sch.map(([i, f, br]) => ({ i, f, br })),
    kisten: [0, 1, 2], aktiv: 1, plaetze: 2, loesung: [0, 1, 2, 3, 4, 5, 6, 7, 8], zuege: [], vor: [],
  };
}

test('Festgefahren: Sackgasse wird erkannt, Hinweis nennt die Zahl der Rückgängig-Schritte', () => {
  const roh = sackgasse();
  const z0 = ausSpeicher(roh);
  wahr(z0, 'Sackgassen-Level ist gültig (Lösung gewinnt)');
  gleich(hinweis(z0).typ, 'zug');
  // Lösungsweg: erst die beiden Schrauben des oberen Bretts parken, dann Farbe 0, dann der Rest
  let z = z0;
  for (const s of z0.loesung) z = tippe(z, s).zustand;
  gleich(gewonnen(z), true);
  // Sackgasse: Farbe 1 parken, dann noch eine Farbe-1-Schraube → beide Parkplätze voll
  let f = tippe(z0, 0).zustand;
  gleich(festgefahren(f), false);
  f = tippe(f, 5).zustand;
  gleich(festgefahren(f), true, 'alle Parkplätze voll und keine freie Schraube hat eine Kiste');
  gleich(legaleZuege(f).length, 0);
  const h = hinweis(f);
  gleich(h.typ, 'zurueck');
  gleich(h.n, 1, 'ein Zug zurück genügt');
  const zurueck = rueckgaengig(f);
  gleich(festgefahren(zurueck), false);
  gleich(hinweis(zurueck).typ, 'zug');
  // der Löser beweist die Sackgasse (vollständig durchsucht)
  const q = loese(f);
  gleich(q.loesung, null);
  gleich(q.vollstaendig, true);
});

test('Spielstand: speichern → laden ergibt denselben Zustand (auch mit Verlauf)', () => {
  const z0 = erzeugeLevel({ stufe: 'mittel', level: 4, seed: 'sp' });
  let z = z0;
  for (const x of z0.loesung.slice(0, 7)) z = tippe(z, x).zustand;
  z = rueckgaengig(z);
  const roh = JSON.parse(JSON.stringify(zumSpeichern(z)));
  const g = ausSpeicher(roh);
  wahr(g);
  tief([g.entfernt, g.rest, g.fuell, g.park, g.zuege, g.vor], [z.entfernt, z.rest, z.fuell, z.park, z.zuege, z.vor]);
  tief(zumSpeichern(g), zumSpeichern(z));
  // JSON-tauglich: kein Infinity, keine Sonderobjekte
  gleich(JSON.stringify(roh).includes('null'), false);
});

test('Spielstand: strenge Validierung lehnt Kaputtes ab', () => {
  const gut = zumSpeichern(erzeugeLevel({ stufe: 'leicht', level: 1, seed: 'val' }));
  wahr(istGueltig(gut));
  const kopie = () => JSON.parse(JSON.stringify(gut));
  const faelle = [null, undefined, 0, 'x', [], {}, { v: 1 }, JSON.parse('{"__proto__":{"x":1}}')];
  for (const f of faelle) gleich(istGueltig(f), false, `Fall ${JSON.stringify(f)}`);
  const ab = (name, aendere) => { const k = kopie(); aendere(k); gleich(istGueltig(k), false, name); };
  ab('Version', (k) => { k.v = 2; });
  ab('Stufe', (k) => { k.stufe = 'constructor'; });
  ab('Stufe unbekannt', (k) => { k.stufe = 'wahnsinn'; });
  ab('Level', (k) => { k.level = 0; });
  ab('Level Text', (k) => { k.level = '1'; });
  ab('Seed', (k) => { k.seed = 12; });
  ab('Breite', (k) => { k.b = 99; });
  ab('Höhe', (k) => { k.h = -1; });
  ab('Brett Zelle außerhalb', (k) => { k.bretter[0].z.push(999); });
  ab('Brett Zelle doppelt', (k) => { k.bretter[0].z.push(k.bretter[0].z[0]); });
  ab('Brett Schicht', (k) => { k.bretter[0].l = -1; });
  ab('Brett leer', (k) => { k.bretter[0].z = []; });
  ab('Schraube nicht im Brett', (k) => { const s = k.schrauben[0]; s.br = (s.br + 1) % k.bretter.length; });
  ab('Schraube Farbe', (k) => { k.schrauben[0].f = 10; });
  ab('Schraube Farbe NaN', (k) => { k.schrauben[0].f = 'a'; });
  ab('Schraube doppelt', (k) => { k.schrauben.push({ ...k.schrauben[0] }); });
  ab('Farbmenge', (k) => { k.kisten.push(k.kisten[0]); });
  ab('Kisten fehlen', (k) => { k.kisten.pop(); });
  ab('aktiv', (k) => { k.aktiv = 0; });
  ab('plaetze', (k) => { k.plaetze = 1.5; });
  ab('Lösung kaputt', (k) => { k.loesung = k.loesung.slice(1); });
  ab('Lösung Zahl', (k) => { k.loesung[0] = 'a'; });
  ab('Lösung doppelt', (k) => { k.loesung[1] = k.loesung[0]; });
  ab('Zug außerhalb', (k) => { k.zuege = [999]; });
  ab('Zug unerlaubt', (k) => { k.zuege = [k.loesung[0], k.loesung[0]]; });
  ab('Zug zu viele', (k) => { k.zuege = new Array(2000).fill(0); });
  ab('Wiederholen Text', (k) => { k.vor = ['x']; });
  ab('Brett überlappt in Schicht', (k) => { k.bretter.push({ l: k.bretter[0].l, z: [k.bretter[0].z[0]] }); });
  ab('Brett ohne Schrauben', (k) => { k.bretter.push({ l: 11, z: [0] }); });
  ab('Brettliste Text', (k) => { k.bretter = 'x'; });
  ab('Schraubenliste Objekt', (k) => { k.schrauben = {}; });
  // Unlösbares Level (Lösung gewinnt nicht) wird abgelehnt
  ab('Lösung leer', (k) => { k.loesung = []; });
});

test('Spielstand: Sonderwerte werden nicht angenommen', () => {
  const gut = zumSpeichern(erzeugeLevel({ stufe: 'leicht', level: 1, seed: 'val2' }));
  for (const w of [Infinity, NaN, null, true, {}, [], '<img>']) {
    const k = JSON.parse(JSON.stringify(gut));
    k.schrauben[0].i = w;
    gleich(istGueltig(k), false);
    const k2 = JSON.parse(JSON.stringify(gut));
    k2.aktiv = w;
    gleich(istGueltig(k2), false);
  }
});

test('Still: kein vibrate/Audio/eval/innerHTML im Spiel', async () => {
  for (const d of ['index.js', 'logik.js']) {
    const q = await fetch(new URL(`../../spiele/schrauben/${d}`, import.meta.url)).then((r) => r.text());
    wahr(!/\bvibrate\b|new\s+Audio\b|AudioContext|\.play\(\)|\beval\(|new Function|innerHTML/.test(q), d);
  }
  const css = await fetch(new URL('../../spiele/schrauben/stil.css', import.meta.url)).then((r) => r.text());
  wahr(css.length > 200);
});


// ---------------------------------------------------------------------------------------------
// Oberfläche (mit Ersatz-Kontext)
import modul from '../../spiele/schrauben/index.js';
import { erstelleSpeicher } from '../../kern/speicher.js';
import { erstelleEinstellungen } from '../../kern/einstellungen.js';
import { erstelleZufall, neuerSeed } from '../../kern/zufall.js';
import { erstelleFarben } from '../../kern/farben.js';
import * as eingabe from '../../kern/eingabe.js';
import { falscherSpeicher } from '../kern/hilfen.js';

function kontext(signal, { muster = false } = {}) {
  const speicher = erstelleSpeicher({ backend: falscherSpeicher() });
  const einstellungen = erstelleEinstellungen(speicher);
  if (muster) einstellungen.setze('muster', true);
  const log = { meldungen: [], aenderungen: 0, gewonnen: [] };
  return {
    log,
    variante: 'leicht',
    speicher: speicher.bereich('schrauben:daten:'),
    einstellungen: Object.assign(Object.create(einstellungen), { spiel: einstellungen.spiel('schrauben') }),
    statistik: { melde() {} },
    zufall: (s, z) => erstelleZufall(s, z),
    neuerSeed,
    farben: erstelleFarben(einstellungen),
    eingabe, signal,
    bewegungReduziert: () => true,
    worker: () => { throw new Error('kein Worker nötig'); },
    meldung: (t) => log.meldungen.push(t),
    meldeAenderung: () => { log.aenderungen++; },
    meldeGewonnen: (t) => log.gewonnen.push(t),
    neuesSpiel() {},
  };
}

function mounte(stand = null, optionen) {
  const ac = new AbortController();
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:700px';
  document.body.append(container);
  const ctx = kontext(ac.signal, optionen);
  const inst = modul.erstelle(container, ctx, stand);
  const weg = () => { try { inst.zerstoere(); } catch { /* egal */ } ac.abort(); container.remove(); };
  return { container, ctx, inst, weg };
}

test('Oberfläche: Level wird aufgebaut, Tippen dreht eine Schraube, Stand ist JSON-tauglich', () => {
  const m = mounte();
  try {
    const stand = m.inst.getStand();
    wahr(istGueltig(stand), 'Stand gültig');
    gleich(m.container.querySelectorAll('.sr-schraube').length, stand.schrauben.length);
    gleich(m.container.querySelectorAll('.sr-brett').length, stand.bretter.length);
    const frei = [...m.container.querySelectorAll('.sr-schraube:not(.verdeckt):not(.weg)')];
    wahr(frei.length >= 2, 'freie Schrauben vorhanden');
    gleich(m.container.querySelectorAll('.sr-schraube[tabindex="0"]').length, 1, 'genau eine Schraube per Tab erreichbar');
    const vorher = m.container.querySelector('.sr-rest').textContent;
    frei[0].click();
    wahr(m.container.querySelector('.sr-rest').textContent !== vorher, 'Anzeige aktualisiert');
    gleich(m.inst.getStand().zuege.length, 1);
    gleich(m.inst.kannRueckgaengig(), true);
    m.inst.rueckgaengig();
    gleich(m.inst.getStand().zuege.length, 0);
    gleich(m.inst.kannWiederholen(), true);
    wahr(m.ctx.log.aenderungen >= 2, 'meldeAenderung nach Zügen');
    const verd = m.container.querySelector('.sr-schraube.verdeckt');
    if (verd) { verd.click(); wahr(m.ctx.log.meldungen.some((t) => /verdeckt/.test(t)), 'Meldung bei verdeckter Schraube'); }
    JSON.parse(JSON.stringify(m.inst.getStand()));
  } finally { m.weg(); }
});

test('Oberfläche: Hinweise führen bis zum Sieg, danach wird „gewonnen“ gemeldet', async () => {
  const m = mounte();
  try {
    let n = 0;
    while (n++ < 100 && !m.ctx.log.gewonnen.length) {
      m.inst.hinweis();
      const s = m.container.querySelector('.sr-schraube.tipp');
      wahr(s, 'Tipp sichtbar');
      s.click();
      await new Promise((r) => setTimeout(r, 0));
    }
    await new Promise((r) => setTimeout(r, 30));
    gleich(m.ctx.log.gewonnen.length, 1);
    gleich(m.container.querySelectorAll('.sr-brett:not(.weg)').length, 0, 'alle Bretter gefallen');
    gleich(m.ctx.speicher.lies('geloest', {}).leicht, 1, 'Level-Zähler');
  } finally { m.weg(); }
});

test('Oberfläche: Tastatur – Pfeile springen zu freien Schrauben, Fokus bleibt nach dem Drehen erhalten', () => {
  const m = mounte();
  try {
    const start = m.container.querySelector('.sr-schraube[tabindex="0"]');
    start.focus();
    gleich(document.activeElement, start);
    let bewegt = 0;
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      const vor = document.activeElement;
      gleich(m.inst.onTaste(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })), true, key);
      if (document.activeElement !== vor) bewegt++;
      wahr(!document.activeElement.classList.contains('verdeckt'), 'Fokus nie auf verdeckter Schraube');
    }
    wahr(bewegt >= 1, 'Fokus bewegt sich');
    gleich(m.inst.onTaste(new KeyboardEvent('keydown', { key: 'a' })), false);
    // Drehen per Klick (Enter/Leertaste lösen bei Buttons selbst einen Klick aus) → Fokus wandert weiter
    const aktuell = document.activeElement;
    aktuell.click();
    wahr(document.activeElement !== aktuell && document.activeElement.classList.contains('sr-schraube'), 'Fokus auf neuer freier Schraube');
    wahr(!document.activeElement.classList.contains('verdeckt'));
  } finally { m.weg(); }
});

test('Oberfläche: Symbole bei eingeschaltetem Muster, aria-Labels vorhanden', () => {
  const m = mounte(null, { muster: true });
  try {
    wahr(m.container.querySelectorAll('.sr-schraube .sr-kopf-symbol').length > 0, 'Symbole an den Schrauben');
    wahr([...m.container.querySelectorAll('.sr-schraube')].every((e) => /^Schraube /.test(e.getAttribute('aria-label'))), 'aria-labels');
    wahr(m.container.querySelectorAll('.sr-kiste .sr-kiste-symbol').length > 0, 'Symbole an den Kisten');
    gleich(m.container.querySelector('.sr-parken').getAttribute('role'), 'list');
  } finally { m.weg(); }
});

test('Oberfläche: gespeicherter Stand wird wiederhergestellt, kaputter ergibt ein neues Spiel', () => {
  const z0 = erzeugeLevel({ stufe: 'mittel', level: 5, seed: 'ui' });
  let z = z0;
  for (const x of z0.loesung.slice(0, 5)) z = tippe(z, x).zustand;
  const a = mounte(zumSpeichern(z));
  try {
    gleich(a.inst.getStand().zuege.length, 5);
    gleich(a.inst.getStand().level, 5);
    wahr(/Mittel/.test(a.inst.zusammenfassung()));
  } finally { a.weg(); }
  const kaputt = zumSpeichern(z0);
  kaputt.kisten.pop();
  const b = mounte(kaputt);
  try {
    wahr(istGueltig(b.inst.getStand()), 'neues, gültiges Spiel');
    gleich(b.inst.getStand().zuege.length, 0);
  } finally { b.weg(); }
});

test('Oberfläche: Festgefahren zeigt den Hinweis, blockierte Schrauben melden es, Rückgängig hilft', () => {
  const roh = sackgasse();
  roh.zuege = [0];
  const m = mounte(JSON.parse(JSON.stringify(roh)));
  try {
    gleich(m.container.querySelector('.sr-fest').hidden, true, 'noch nicht festgefahren');
    m.container.querySelector('.sr-schraube[data-s="5"]').click();       // zweite Farbe-1-Schraube → Parkplätze voll
    gleich(m.container.querySelector('.sr-fest').hidden, false, 'festgefahren');
    wahr(/Festgefahren/.test(m.container.querySelector('.sr-fest').textContent), 'Text');
    gleich(m.container.querySelector('.sr-schraube[data-s="1"]').classList.contains('blockiert'), true, 'blockiert');
    m.container.querySelector('.sr-schraube[data-s="1"]').click();
    wahr(m.ctx.log.meldungen.some((t) => /Parkpl/.test(t)), 'Meldung „Parkplätze belegt“');
    m.inst.hinweis();
    wahr(/1× Rückgängig/.test(m.container.querySelector('.sr-status').textContent), 'Hinweis nennt Zahl der Schritte');
    [...m.container.querySelectorAll('.sr-fest button')].find((b) => b.textContent === 'Rückgängig').click();
    gleich(m.container.querySelector('.sr-fest').hidden, true, 'wieder spielbar');
    gleich(m.inst.getStand().zuege.length, 1);
  } finally { m.weg(); }
});

// Kaputte Spielstände dürfen nichts kaputt machen (wie kern/robustheit.test.js, hier gezielt für dieses Spiel)
test('Robustheit: kaputte und manipulierte Spielstände', async () => {
  const BOESE = '<img src=x data-boese="1"><script data-boese="1">window.__boese=1</script>';
  const gut = zumSpeichern(erzeugeLevel({ stufe: 'mittel', level: 1, seed: 'rob' }));
  gut.zuege = gut.loesung.slice(0, 3);
  const faelle = [null, 0, 'x', [], {}, { v: 1 }, { __proto__: null }, JSON.parse('{"__proto__":{"verseucht":1}}')];
  const werte = [BOESE, -1, 1e12, null, [], {}, [BOESE], { a: BOESE }, true, 'NaN'];
  for (const k of Object.keys(gut)) {
    for (const w of werte) faelle.push({ ...gut, [k]: w });
    if (Array.isArray(gut[k]) && gut[k].length) {
      faelle.push({ ...gut, [k]: [BOESE, ...gut[k].slice(1)] });
      faelle.push({ ...gut, [k]: gut[k].slice(0, 1) });
    }
  }
  const fehler = [];
  const beiFehler = (e) => { fehler.push(String(e.message || e.reason)); e.preventDefault?.(); };
  window.addEventListener('error', beiFehler);
  window.addEventListener('unhandledrejection', beiFehler);
  try {
    for (let i = 0; i < faelle.length; i++) {
      const m = mounte(faelle[i]);
      try {
        m.inst.getStand(); m.inst.zusammenfassung?.();
        wahr(!/data-boese/.test(m.container.innerHTML), `Fall ${i}: HTML eingeschleust`);
      } finally { m.weg(); }
    }
  } finally {
    window.removeEventListener('error', beiFehler);
    window.removeEventListener('unhandledrejection', beiFehler);
  }
  gleich(fehler.join(' | '), '');
  gleich(window.__boese, undefined);
  gleich(({}).verseucht, undefined);
});
