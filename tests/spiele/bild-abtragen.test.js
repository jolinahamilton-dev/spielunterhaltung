import { test, gleich, tief, wahr } from '../mini-test.js';
import {
  STUFEN, STUFEN_IDS, istFrei, freiesPixel, laufe, tippe, kannTippen, rueckgaengig, wiederholen, neustart,
  gewonnen, festgefahren, restPixel, pruefeMotiv, motiveFuer, motivStufe, farbAnzahl, erzeugeMosaik,
  erzeugeLevel, loesungsReihenfolge, loese, hinweis, wegLoest, istGueltig, zumSpeichern, ausSpeicher, wartet,
  setze, setzeWieder, runde, ruhig, arbeitet,
} from '../../spiele/bild-abtragen/logik.js';
import { erstelleZufall } from '../../kern/zufall.js';

const motive = await fetch(new URL('../../spiele/bild-abtragen/motive.json', import.meta.url)).then((r) => r.json());

/** Bild aus Textzeilen: '.' leer, Ziffer = Farbe */
function bildAus(zeilen) {
  return { b: zeilen[0].length, h: zeilen.length, bild: zeilen.join('').split('').map((c) => (c === '.' ? -1 : Number(c))) };
}
/** Kleines Level von Hand */
function level(zeilen, kolonnen, plaetze = 2) {
  const { b, h, bild } = bildAus(zeilen);
  return {
    v: 1, stufe: 'leicht', level: 1, titel: 'Test', seed: 't', b, h, bild, rest: bild.slice(), kolonnen,
    pos: kolonnen.map(() => 0), plaetze: new Array(plaetze).fill(null), loesung: [], verlauf: [], vor: [],
  };
}
const spiele = (z, ks) => ks.reduce((s, k) => tippe(s, k).zustand, z);

test('Bild: frei sind Randpixel und Pixel neben leeren Feldern', () => {
  const { b, h, bild } = bildAus(['0000', '0000', '00.0', '0000']);
  gleich(istFrei(bild, b, h, 0), true, 'Ecke');
  gleich(istFrei(bild, b, h, 5), false, 'innen ohne Luft');
  gleich(istFrei(bild, b, h, 6), true, 'neben Luft (oben)');
  gleich(istFrei(bild, b, h, 9), true, 'neben Luft (links)');
  // unterstes, dann linkestes freies Pixel
  gleich(freiesPixel(bild, b, h, 0), 12);
  gleich(freiesPixel(bild, b, h, 3), -1);
});

test('Abtragen von außen nach innen: inneres Pixel wird erst nach dem Rand erreichbar', () => {
  // 1 ist ganz von 0 umgeben
  let z = level(['000', '010', '000'], [[[1, 1]], [[0, 8]]]);
  z = tippe(z, 0).zustand;
  gleich(wartet(z, 0), true, 'Sammler 1 wartet');
  gleich(restPixel(z), 9);
  const r = tippe(z, 1);
  gleich(gewonnen(r.zustand), true, 'Sammler 0 legt 1 frei, beide werden fertig');
  gleich(r.zustand.plaetze.every((s) => s === null), true, 'volle Sammler verlassen den Platz');
});

test('Gleichzeitigkeit: Platz 1 zuerst, ein Pixel je Runde', () => {
  const { b, h, bild } = bildAus(['0101']);
  const rest = bild.slice();
  const plaetze = [[1, 2, 2], [0, 2, 2]];
  const runden = [];
  laufe(rest, b, h, plaetze, runden);
  tief(runden, [[[0, 1], [1, 0]], [[0, 3], [1, 2]]]);
  tief(plaetze, [null, null]);
  wahr(rest.every((v) => v < 0));
});

test('Gleichzeitigkeit: wartender Sammler arbeitet weiter, sobald ein anderer freilegt', () => {
  // Farbe 1 liegt hinter Farbe 0 versteckt
  let z = level(['00000', '01110', '00000'], [[[1, 3]], [[0, 12]]], 2);
  z = tippe(z, 0).zustand;
  gleich(z.plaetze[0][2], 3, 'nichts frei');
  const r = tippe(z, 1);
  wahr(gewonnen(r.zustand));
  wahr(r.runden.some((runde) => runde.length === 2), 'beide arbeiten in einer Runde');
});

test('Echtzeit: zweiter Sammler steigt mitten in die Arbeit ein, beide arbeiten gleichzeitig', () => {
  // je 4 Pixel Farbe 0 und 1, alle am Rand frei
  let z = level(['0011', '0011'], [[[0, 4]], [[1, 4]]], 2);
  z = setze(z, 0).zustand;
  wahr(arbeitet(z), 'Sammler 0 hat Arbeit');
  z = runde(z).zustand;                       // Sammler 0 holt ein Pixel
  gleich(z.plaetze[0][2], 3);
  z = setze(z, 1).zustand;                    // Sammler 1 kommt dazu, während 0 noch arbeitet
  const r = runde(z);
  gleich(r.runde.length, 2, 'beide holen in derselben Runde');
  z = ruhig(r.zustand);
  wahr(gewonnen(z));
  tief(z.plaetze, [null, null]);
  gleich(z.verlauf.length, 2);
  gleich(z.verlauf[0].px.length + z.verlauf[1].px.length, 8, 'alle Pixel im Verlauf');
});

test('Echtzeit: Rückgängig mitten im Lauf stellt den Stand vor dem Einsatz genau her', () => {
  let z = level(['0011', '0011'], [[[0, 4]], [[1, 4]]], 2);
  z = setze(z, 0).zustand;
  z = runde(z).zustand;
  const vorEinsatz = JSON.stringify({ rest: z.rest, pos: z.pos, plaetze: z.plaetze });
  z = setze(z, 1).zustand;
  z = runde(z).zustand;
  z = runde(z).zustand;
  const zurueck = rueckgaengig(z);
  gleich(JSON.stringify({ rest: zurueck.rest, pos: zurueck.pos, plaetze: zurueck.plaetze }), vorEinsatz);
  wahr(arbeitet(zurueck), 'Sammler 0 arbeitet danach weiter');
  // Wiederholen setzt den Sammler erneut ein; zu Ende gerechnet ist das Bild leer
  wahr(gewonnen(ruhig(setzeWieder(zurueck).zustand)));
});

test('Echtzeit: echte Level mit überlappenden Einsätzen bleiben gültig und lassen sich vollständig zurücknehmen', () => {
  for (const stufe of STUFEN_IDS) {
    for (let s = 0; s < 10; s++) {
      const start = erzeugeLevel({ stufe, level: 5, seed: `echtzeit-${stufe}-${s}`, motive });
      let z = start;
      // Lösungsreihenfolge, aber jeder Sammler wird schon nach 1–2 Runden des vorigen eingesetzt
      for (const [j, k] of start.loesung.entries()) {
        if (!z.plaetze.includes(null)) z = ruhig(z);
        const r = setze(z, k);
        if (!r) break;
        z = r.zustand;
        for (let n = 0; n < 1 + (j % 2); n++) { const w = runde(z); if (w) z = w.zustand; }
        wahr(istGueltig(ruhig(z)), `${stufe}/${s}: ruhiger Stand nach Einsatz ${j} gültig`);
      }
      // alles zurücknehmen → Anfangsbild
      let u = z;
      while (u.verlauf.length) u = rueckgaengig(u);
      tief(u.rest, start.rest, `${stufe}/${s}: Rückgängig bis zum Anfang`);
    }
  }
});

test('Echtzeit: Ergebnis ohne Zwischenrunden = sofort zu Ende gerechnet (wie bisher)', () => {
  let a = level(['00000', '01110', '00000'], [[[1, 3]], [[0, 12]]], 2);
  const sofort = tippe(tippe(a, 0).zustand, 1).zustand;
  let b2 = ruhig(setze(a, 0).zustand);
  b2 = ruhig(setze(b2, 1).zustand);
  tief(b2.rest, sofort.rest);
  tief(b2.plaetze, sofort.plaetze);
});

test('Ladungen je Farbe = Pixel der Farbe (Generator, alle Stufen)', () => {
  for (const stufe of STUFEN_IDS) {
    for (let s = 0; s < 40; s++) {
      const z = erzeugeLevel({ stufe, level: 1 + (s % 25), seed: `summe${s}`, motive });
      const pixel = new Array(10).fill(0), ladung = new Array(10).fill(0);
      z.bild.forEach((v) => { if (v >= 0) pixel[v]++; });
      z.kolonnen.flat().forEach(([f, n]) => { ladung[f] += n; });
      tief(ladung, pixel, `${stufe} ${s}`);
      wahr(z.kolonnen.flat().every(([, n]) => n >= 1));
    }
  }
});

test('Generator: 200 Seeds je Stufe – Lösungsreihenfolge löst das Level', () => {
  for (const stufe of STUFEN_IDS) {
    const cfg = STUFEN[stufe];
    let gewartet = 0;
    for (let s = 0; s < 200; s++) {
      const z = erzeugeLevel({ stufe, level: 1 + (s % 30), seed: `gen${s}`, motive });
      gleich(z.kolonnen.length, cfg.kolonnen);
      gleich(z.plaetze.length, cfg.plaetze);
      wahr(Math.max(z.b, z.h) >= cfg.groesse[0] && Math.max(z.b, z.h) <= cfg.groesse[1], `${stufe} ${s} Größe ${z.b}×${z.h}`);
      wahr(wegLoest(z, z.loesung), `${stufe} ${s}: Lösung`);
      // in der Lösung bleibt immer mindestens ein Platz frei
      let x = z;
      for (const k of z.loesung) {
        x = tippe(x, k).zustand;
        wahr(x.plaetze.includes(null), `${stufe} ${s}: Platz frei`);
        if (x.plaetze.some(Boolean)) gewartet++;
      }
    }
    if (stufe !== 'leicht') wahr(gewartet > 100, `${stufe}: Lösung parkt Sammler (${gewartet})`);
  }
});

test('Generator: Lösungsreihenfolge mit gleichzeitigen Plätzen leert das Bild, alle Sammler werden voll', () => {
  const rng = erstelleZufall('reihe');
  const m = erzeugeMosaik(rng, 'schwer');
  const reihe = loesungsReihenfolge(m.bild, m.b, m.h, STUFEN.schwer, rng);
  const rest = m.bild.slice();
  const pl = [null, null, null, null];
  for (const [f, n] of reihe) {
    wahr(n >= 1, 'Ladung ≥ 1');
    pl[pl.indexOf(null)] = [f, n, n];
    laufe(rest, m.b, m.h, pl);
  }
  wahr(rest.every((v) => v < 0));
  tief(pl, [null, null, null, null]);
});

test('Generator: gleicher Seed → gleiches Level, anderer Seed → anderes', () => {
  for (const stufe of STUFEN_IDS) {
    tief(erzeugeLevel({ stufe, level: 30, seed: 'x', motive }), erzeugeLevel({ stufe, level: 30, seed: 'x', motive }));
    wahr(JSON.stringify(erzeugeLevel({ stufe, level: 30, seed: 'x', motive }).kolonnen)
      !== JSON.stringify(erzeugeLevel({ stufe, level: 30, seed: 'y', motive }).kolonnen));
  }
});

test('Motive: mindestens 16 gültige, alle Stufen vertreten, Farbanzahl passt zur Stufe', () => {
  wahr(motive.length >= 16, `${motive.length} Motive`);
  const titel = new Set();
  for (const m of motive) {
    const p = pruefeMotiv(m);
    wahr(p, `ungültig: ${m.titel}`);
    wahr(Math.max(p.b, p.h) >= 8 && Math.max(p.b, p.h) <= 16, `${m.titel} Größe`);
    const st = STUFEN[motivStufe(p)];
    const k = farbAnzahl(p.bild);
    wahr(k >= st.farben[0] && k <= st.farben[1], `${m.titel}: ${k} Farben für ${st.name}`);
    // jede Farbe aus der Tabelle wird benutzt
    gleich(new Set(Object.values(m.farben)).size, k, `${m.titel}: Farben`);
    titel.add(m.titel);
  }
  gleich(titel.size, motive.length, 'Titel eindeutig');
  for (const s of STUFEN_IDS) wahr(motiveFuer(motive, s).length >= 3, s);
  gleich(pruefeMotiv({ titel: 'x', zeilen: ['aaaa', 'aaa', 'aaaa', 'aaaa'], farben: { a: 1 } }), null);
  gleich(pruefeMotiv({ titel: 'x', zeilen: ['aaaa', 'aaaa', 'aaaa', 'aaaa'], farben: { a: 12 } }), null);
});

test('Level: erst Motive, danach Mosaike (symmetrisch)', () => {
  const liste = motiveFuer(motive, 'leicht');
  gleich(erzeugeLevel({ stufe: 'leicht', level: 1, seed: 'a', motive }).titel, liste[0].titel);
  const mosaikLevel = (liste.length + 1) % 4 === 0 ? liste.length + 2 : liste.length + 1;
  const z = erzeugeLevel({ stufe: 'leicht', level: mosaikLevel, seed: 'a', motive });
  gleich(z.titel, 'Mosaik');
  for (let y = 0; y < z.h; y++) for (let x = 0; x < z.b; x++) gleich(z.bild[y * z.b + x], z.bild[y * z.b + z.b - 1 - x]);
  gleich(erzeugeLevel({ stufe: 'mittel', level: 3, seed: 'a', motive: [] }).titel, 'Mosaik', 'ohne Motive');
  const k = farbAnzahl(erzeugeLevel({ stufe: 'schwer', level: 99, seed: 'f', motive }).bild);
  wahr(k >= 5 && k <= 6, `${k} Farben`);
});

test('Festgefahren: alle Plätze belegt und keiner kommt weiter', () => {
  // 1 und 2 liegen innen, außen nur 0
  let z = level(['00000', '01200', '00000'], [[[1, 1]], [[2, 1]], [[0, 13]]], 2);
  gleich(festgefahren(z), false);
  z = spiele(z, [0, 1]);
  gleich(festgefahren(z), true);
  gleich(kannTippen(z, 2), false);
  wahr(tippe(z, 2) === null);
  const h = hinweis(z);
  gleich(h.typ, 'zurueck');
  gleich(h.n, 1, 'ein Schritt zurück genügt');
  const zurueck = rueckgaengig(z);
  gleich(festgefahren(zurueck), false);
  wahr(gewonnen(spiele(zurueck, [2, 1])));
});

test('Festgefahren: alle wartenden Sammler sind markiert, ein freier Platz verhindert die Anzeige', () => {
  let z = level(['00000', '01200', '00000'], [[[1, 1]], [[2, 1]], [[0, 13]]], 3);
  z = spiele(z, [0, 1]);
  gleich(festgefahren(z), false, 'dritter Platz frei');
  gleich(wartet(z, 0) && wartet(z, 1), true);
  gleich(wartet(z, 2), false);
  wahr(gewonnen(spiele(z, [2])), 'Sammler 0 befreit beide');
});

test('Rückgängig und Wiederholen stellen den Zustand genau her', () => {
  const start = erzeugeLevel({ stufe: 'mittel', level: 2, seed: 'rueck', motive });
  let z = start;
  const zustaende = [JSON.stringify({ ...z, verlauf: [], vor: [] })];
  for (const k of start.loesung.slice(0, 6)) {
    z = tippe(z, k).zustand;
    zustaende.push(JSON.stringify({ ...z, verlauf: [], vor: [] }));
  }
  for (let i = 5; i >= 0; i--) {
    z = rueckgaengig(z);
    gleich(JSON.stringify({ ...z, verlauf: [], vor: [] }), zustaende[i], `zurück ${i}`);
  }
  gleich(z.vor.length, 6);
  z = wiederholen(z).zustand;
  gleich(JSON.stringify({ ...z, verlauf: [], vor: [] }), zustaende[1]);
  gleich(rueckgaengig(start), null);
  tief(neustart(spiele(start, start.loesung.slice(0, 3))), start);
});

test('Hinweis-Schleife führt zum Ziel (Start mit bekannter Lösung)', () => {
  for (const stufe of STUFEN_IDS) {
    for (let s = 0; s < 5; s++) {
      let z = erzeugeLevel({ stufe, level: 10 + s, seed: `hs${s}`, motive });
      for (let i = 0; i < 400 && !gewonnen(z); i++) {
        const h = hinweis(z);
        gleich(h.typ, 'zug', `${stufe} ${s}`);
        z = tippe(z, h.kolonne).zustand;
      }
      wahr(gewonnen(z), `${stufe} ${s} gelöst`);
    }
  }
});

test('Hinweis-Schleife nach eigenen (abweichenden) Zügen – Löser mit Budget', () => {
  let ok = 0;
  const t0 = performance.now();
  let laengste = 0;
  for (const stufe of STUFEN_IDS) {
    for (let s = 0; s < 6; s++) {
      let z = erzeugeLevel({ stufe, level: 20 + s, seed: `ab${s}`, motive });
      const rng = erstelleZufall(`ab${stufe}${s}`);
      // sechs zufällige Züge, die meist nicht der Lösung folgen
      for (let i = 0; i < 6 && !festgefahren(z) && !gewonnen(z); i++) {
        const moeglich = z.kolonnen.map((_, k) => k).filter((k) => kannTippen(z, k));
        z = tippe(z, rng.wahl(moeglich)).zustand;
      }
      for (let i = 0; i < 400 && !gewonnen(z); i++) {
        const a = performance.now();
        const h = hinweis(z);
        laengste = Math.max(laengste, performance.now() - a);
        if (h.typ === 'zurueck') { for (let n = 0; n < h.n; n++) z = rueckgaengig(z); continue; }
        z = tippe(z, h.kolonne).zustand;
      }
      if (gewonnen(z)) ok++;
    }
  }
  gleich(ok, 18, 'alle gelöst');
  wahr(laengste < 1500, `längster Hinweis ${Math.round(laengste)} ms`);
  globalThis.baHinweisMs = Math.round(laengste);
  console.log(`Hinweis-Schleifen: ${Math.round(performance.now() - t0)} ms, längster Hinweis ${Math.round(laengste)} ms`);
});

test('Löser: erkennt unlösbar und lösbar', () => {
  const z = level(['00000', '01200', '00000'], [[[1, 1]], [[2, 1]], [[0, 13]]], 2);
  gleich(loese(z).status, 'loesbar');
  gleich(loese(spiele(z, [0, 1])).status, 'unloesbar');
  gleich(loese(erzeugeLevel({ stufe: 'schwer', level: 40, seed: 'b', motive }), { budget: 3 }).status, 'unbekannt');
});

test('Spielstand speichern/laden', () => {
  let z = erzeugeLevel({ stufe: 'schwer', level: 5, seed: 'spe', motive });
  z = spiele(z, z.loesung.slice(0, 5));
  const geladen = ausSpeicher(JSON.parse(JSON.stringify(zumSpeichern(z))));
  wahr(geladen, 'gültig');
  tief(geladen, z);
  wahr(istGueltig(geladen));
  tief(rueckgaengig(geladen), rueckgaengig(z));
});

test('Kaputter oder manipulierter Stand → null (neues Spiel)', () => {
  const z = spiele(erzeugeLevel({ stufe: 'leicht', level: 2, seed: 'kaputt', motive }), [0]);
  const kopie = () => JSON.parse(JSON.stringify(z));
  const faelle = [
    null, 42, 'text', {}, [], { ...kopie(), v: 2 }, { ...kopie(), stufe: 'irre' },
    { ...kopie(), b: 100 }, { ...kopie(), bild: kopie().bild.slice(1) },
    { ...kopie(), titel: '<img src=x>'.repeat(10) },
    { ...kopie(), kolonnen: kopie().kolonnen.map((k) => k.map(([f, n]) => [f, n + 1])) },
    { ...kopie(), pos: kopie().pos.map(() => 999) },
    { ...kopie(), plaetze: [[0, 5, 9]] },
    { ...kopie(), verlauf: [] },
    { ...kopie(), verlauf: [{ k: 0, px: [99999], pl: kopie().plaetze }] },
    { ...kopie(), loesung: [7, 'x'] },
    { ...kopie(), rest: kopie().rest.map((v, i) => (i === 0 ? 9 : v)) },
  ];
  for (const f of faelle) gleich(ausSpeicher(f), null, JSON.stringify(f)?.slice(0, 60));
  // ein Pixel entfernt, ohne dass ein Sammler es geholt hat → Farbsumme passt nicht
  const k = kopie();
  const i = k.rest.findIndex((v) => v >= 0);
  k.rest[i] = -1;
  gleich(ausSpeicher(k), null, 'Farbsumme');
  wahr(ausSpeicher(kopie()));
});

test('Still: kein vibrate/Audio/eval im Spiel', async () => {
  for (const d of ['index.js', 'logik.js']) {
    const q = await fetch(new URL(`../../spiele/bild-abtragen/${d}`, import.meta.url)).then((r) => r.text());
    wahr(!/\bvibrate\b|new\s+Audio\b|AudioContext|\.play\(\)|\beval\(|new Function|innerHTML/.test(q), d);
  }
});
