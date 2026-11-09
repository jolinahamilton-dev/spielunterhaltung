import { test, gleich, tief, wahr } from '../mini-test.js';
import * as L from '../../spiele/blasenschuss/logik.js';
import modul from '../../spiele/blasenschuss/index.js';
import { erstelleSpeicher } from '../../kern/speicher.js';
import { erstelleEinstellungen } from '../../kern/einstellungen.js';
import { erstelleZufall, neuerSeed } from '../../kern/zufall.js';
import { erstelleFarben } from '../../kern/farben.js';
import * as eingabe from '../../kern/eingabe.js';
import { falscherSpeicher } from '../kern/hilfen.js';

const { SPALTEN, idx } = L;

/** Zustand mit eigenem Brett: Einträge [zeile, spalte, code] */
function bau(eintraege, extra = {}) {
  const z = L.neuesLevel(1, 'test');
  z.brett = new Array(L.ANZAHL).fill(0);
  for (const [r, c, code] of eintraege) z.brett[idx(r, c)] = code;
  Object.assign(z, { farben: 4, aktuell: 1, naechste: 1, ...extra });
  return z;
}
const ohneVerlauf = (z) => JSON.stringify({ ...z, verlauf: [], winkel: 0 });   // Zielwinkel bleibt beim Rückgängig stehen

test('Geometrie: Nachbarschaft ist symmetrisch, innere Blasen haben 6 Nachbarn', () => {
  for (const kopf of [0, 1]) {
    for (let i = 0; i < L.ANZAHL; i++) {
      const r = Math.floor(i / SPALTEN), c = i % SPALTEN;
      if (!L.gueltigeZelle(r, c, kopf)) continue;
      for (const n of L.nachbarn(i, kopf)) wahr(L.nachbarn(n, kopf).includes(i), `${i}↔${n} (kopf ${kopf})`);
    }
    gleich(L.nachbarn(idx(5, 4), kopf).length, 6);
  }
  const [x0] = L.mitte(0, 0, 0), [x1] = L.mitte(1, 0, 0);
  gleich(x1 - x0, 1, 'Versatz der Folgezeile um einen Radius');
});

test('Einrasten: an der Decke, mit Wandprall, an einer Blase', () => {
  const leer = bau([]);
  let f = L.fliegen(leer.brett, 0, 0);
  tief([f.zelle.r, f.zelle.c], [0, 4]);
  f = L.fliegen(leer.brett, 0, 70);
  wahr(f.pfad.length >= 3, 'Wandprall erzeugt Eckpunkt');
  wahr(f.pfad.some((p) => p[0] === 1 || p[0] === L.BREITE - 1));
  gleich(f.zelle.r, 0);
  const mit = bau([[0, 4, 2]]);
  f = L.fliegen(mit.brett, 0, 0);
  gleich(f.zelle.r, 1, 'unter der Blase');
  wahr([3, 4].includes(f.zelle.c));
  wahr(L.nachbarn(f.zelle.i, 0).includes(idx(0, 4)), 'haftet an der Blase');
  // Links schräg an eine Blase im Feld
  const f2 = L.fliegen(bau([[3, 1, 2], [2, 1, 2], [1, 1, 2], [0, 1, 2]]).brett, 0, -40);
  wahr(f2.zelle && f2.schritte < L.BUDGET);
});

test('Einrasten: gleicher Schuss gibt gleiches Ergebnis (Determinismus, Schrittbudget)', () => {
  const z = L.neuesLevel(12, 'det');
  for (const w of [-75, -33, -1, 0, 17, 64, 80]) {
    const a = L.fliegen(z.brett, z.kopf, w), b = L.fliegen(z.brett, z.kopf, w);
    tief(a, b);
    wahr(a.schritte < L.BUDGET);
  }
  let a = L.neuesEndlos('same'), b = L.neuesEndlos('same');
  for (let k = 0; k < 25; k++) {
    const w = ((k * 29) % 150) - 75;
    a = L.schiesse(a, w).zustand; b = L.schiesse(b, w).zustand;
  }
  tief(a, b);
  wahr(JSON.stringify(L.neuesEndlos('andere')) !== JSON.stringify(L.neuesEndlos('same')));
});

test('Platzen: drei gleiche Farben platzen, zwei nicht', () => {
  const z = bau([[0, 3, 1], [0, 5, 1]]);
  const r = L.schiesse(z, 0);
  gleich(r.ergebnis.platzte.length, 3);
  gleich(L.anzahlBlasen(r.zustand.brett), 0);
  gleich(r.zustand.blasen, 3);
  const z2 = bau([[0, 3, 1], [0, 5, 2]]);
  const r2 = L.schiesse(z2, 0);
  gleich(r2.ergebnis.platzte.length, 0);
  gleich(L.anzahlBlasen(r2.zustand.brett), 3);
  gleich(r2.zustand.aktuell, z2.naechste, 'Folge rückt nach');
});

test('Abfallen: lose Blasen fallen (Flood-Fill von der Decke), verbundene bleiben', () => {
  const z = bau([[0, 3, 1], [0, 5, 1], [1, 5, 2], [2, 5, 3], [0, 0, 2], [1, 0, 3]]);
  const r = L.schiesse(z, 0);
  gleich(r.ergebnis.platzte.length, 3);
  tief([...r.ergebnis.fiel].sort((a, b) => a - b), [idx(1, 5), idx(2, 5)]);
  gleich(r.zustand.brett[idx(0, 0)], 2);
  gleich(r.zustand.brett[idx(1, 0)], 3);
  gleich(L.anzahlBlasen(r.zustand.brett), 2);
  gleich(r.zustand.blasen, 5);
  // Direkte Prüfung
  const b = bau([[0, 0, 1], [1, 0, 2], [4, 4, 3], [5, 4, 9]]).brett;
  tief(L.lose(b, 0), [idx(4, 4), idx(5, 4)], 'Stein fällt, wenn er lose ist');
});

test('Spezialblasen: Bombe, Regenbogen, Stein', () => {
  const b = bau([[0, 3, 1], [0, 5, 9], [0, 0, 2]], { aktuell: L.BOMBE, farben: 4 });
  const r = L.schiesse(b, 0);
  tief([r.ergebnis.zelle.r, r.ergebnis.zelle.c], [0, 4]);
  gleich(r.ergebnis.platzte.length, 2, 'Bombe und Nachbar');
  gleich(r.zustand.brett[idx(0, 5)], L.STEIN, 'Stein bleibt (verbunden, nicht sprengbar)');
  gleich(r.zustand.brett[idx(0, 0)], 2);
  // Regenbogen nimmt die Farbe der größten Gruppe
  const reg = bau([[0, 3, 2], [0, 5, 2], [0, 6, 3]], { aktuell: L.REGENBOGEN });
  const rr = L.schiesse(reg, 0);
  gleich(rr.ergebnis.code, 2);
  gleich(rr.ergebnis.platzte.length, 3);
  // Steine zählen nicht zum Ziel
  const nurStein = bau([[0, 3, 1], [0, 5, 1], [0, 0, 9]], { aktuell: 1 });
  const g = L.schiesse(nurStein, 0);
  gleich(g.ergebnis.gewonnen, true);
  gleich(L.anzahlBlasen(g.zustand.brett), 0, 'Rest-Steine fallen beim Ziel');
});

test('Linie: Blase in der untersten Zeile → Reihe wird ruhig entfernt', () => {
  const kette = [[0, 4, 1]];
  let i = idx(0, 4);
  for (let r = 1; r <= 10; r++) {
    const b = new Array(L.ANZAHL).fill(0);
    const n = L.nachbarn(i, 0).filter((k) => Math.floor(k / SPALTEN) === r)
      .sort((a, c) => Math.abs(L.mitte(r, a % SPALTEN, 0)[0] - 9) - Math.abs(L.mitte(r, c % SPALTEN, 0)[0] - 9))[0];
    kette.push([r, n % SPALTEN, (r % 2) + 1]);
    i = n;
  }
  const z = bau(kette, { aktuell: 3, farben: 3 });
  const r = L.schiesse(z, 0);
  gleich(r.ergebnis.zelle.r, L.LINIE);
  gleich(r.ergebnis.gekappt.length, 1);
  for (let c = 0; c < SPALTEN; c++) gleich(r.zustand.brett[idx(L.LINIE, c)], 0);
  gleich(L.anzahlBlasen(r.zustand.brett), 11, 'Kette darüber bleibt');
});

test('Endlos: nach 6 Fehlschüssen rückt die Decke nach, Versatz wechselt', () => {
  let z = bau([[0, 0, 1]], { aktuell: 2, naechste: 1, farben: 4, modus: 'endlos', level: 0, spezial: false, fehl: L.FEHL_BIS_REIHE - 1 });
  gleich(z.reihen, 0);
  const r = L.schiesse(z, 0);
  z = r.zustand;
  gleich(r.ergebnis.neueReihe, true);
  gleich(z.reihen, 1);
  gleich(z.kopf, 1);
  gleich(z.fehl, 0);
  gleich(z.brett[idx(1, 0)], 1, 'alte Blase eine Zeile tiefer, gleiche Position');
  wahr(z.brett.slice(0, SPALTEN - 1).every((c) => c >= 1 && c <= 4), 'neue Reihe mit 8 Blasen');
  gleich(z.brett[SPALTEN - 1], 0);
  wahr(L.istGueltig(z));
});

test('Farbfolge: nur Farben, die noch im Feld vorkommen', () => {
  for (const start of [L.neuesEndlos('folge'), L.neuesLevel(9, 'folge'), L.neuesLevel(1, 'folge')]) {
    let z = start;
    for (let k = 0; k < 80 && !L.gewonnen(z); k++) {
      const farben = L.farbenImFeld(z.brett);
      if (farben.length) {
        for (const code of [z.aktuell, z.naechste]) wahr(code === L.BOMBE || code === L.REGENBOGEN || farben.includes(code), `Farbe ${code} nicht im Feld`);
      }
      const h = L.hinweis(z);
      if (h.tausch) z = L.tausche(z);
      z = L.schiesse(z, h.winkel).zustand;
    }
  }
  // Letzte Farbe im Feld: nur noch diese wird gezogen
  let z = bau([[0, 4, 2]], { aktuell: 2, naechste: 2, farben: 5 });
  for (let k = 0; k < 10; k++) {
    z = L.schiesse(z, 0).zustand;
    const f = L.farbenImFeld(z.brett);
    if (f.length) wahr(f.every((c) => c === 2));
    if (f.length) wahr([z.aktuell, z.naechste].every((c) => c === 2 || c === L.BOMBE || c === L.REGENBOGEN));
  }
});

test('Level: Tabelle und erzeugte Level sind gültig und deterministisch', () => {
  for (const n of [1, 2, 10, 20, 30, 31, 57, 200]) {
    const z = L.neuesLevel(n, 's');
    wahr(L.istGueltig(z), `Level ${n}`);
    tief(L.levelBrett(n), L.levelBrett(n));
    gleich(z.brett.slice(0, SPALTEN).includes(L.STEIN), false, 'keine Steine an der Decke');
    wahr(L.anzahlFarbblasen(z.brett) > 0);
    gleich(z.farben, L.levelDef(n).farben);
  }
  tief([1, 5, 8, 21].map((n) => L.levelDef(n).farben), [3, 3, 4, 6]);
  gleich(L.levelDef(1).steine, 0);
  wahr(L.levelDef(30).steine >= 8);
});

test('Level lösbar: einfache Hinweis-Strategie räumt die ersten Level', () => {
  for (const n of [1, 2, 3, 4, 6, 8, 10]) {
    let z = L.neuesLevel(n, `loesen-${n}`);
    let schuesse = 0, fertig = false;
    while (schuesse < 450 && !fertig) {
      const h = L.hinweis(z);
      if (h.tausch) z = L.tausche(z);
      const r = L.schiesse(z, h.winkel);
      z = r.zustand;
      fertig = r.ergebnis.gewonnen;
      schuesse++;
    }
    wahr(fertig, `Level ${n} nicht gelöst nach ${schuesse} Schüssen`);
  }
});

test('Weiterspielen: Flag gesetzt, danach nie wieder gewonnen', () => {
  const z = bau([[0, 3, 1], [0, 5, 1]]);
  const r = L.schiesse(z, 0);
  gleich(r.ergebnis.gewonnen, true);
  gleich(L.gewonnen(r.zustand), true);
  let w = L.weiterspielen(r.zustand);
  gleich(w.weiter, true);
  gleich(L.gewonnen(w), false);
  wahr(L.anzahlBlasen(w.brett) > 0, 'frische Reihen');
  wahr(L.istGueltig(w));
  for (let k = 0; k < 40; k++) {
    const h = L.hinweis(w);
    if (h.tausch) w = L.tausche(w);
    const x = L.schiesse(w, h.winkel);
    gleich(x.ergebnis.gewonnen, false);
    w = x.zustand;
  }
  gleich(L.weiterspielen(w), w, 'zweites Weiterspielen ändert nichts');
});

test('Rückgängig: stellt exakt den Zustand vor dem Schuss her, 100 Zustände', () => {
  let z = L.neuesEndlos('undo');
  const start = ohneVerlauf(z);
  z = L.schiesse(z, 12).zustand;
  wahr(L.kannRueckgaengig(z));
  gleich(ohneVerlauf(L.rueckgaengig(z)), start);
  gleich(L.rueckgaengig(L.neuesEndlos('x')), null);
  for (let k = 0; k < 130; k++) z = L.schiesse(z, ((k * 13) % 140) - 70).zustand;
  gleich(z.verlauf.length, L.MAX_VERLAUF);
  let t = z, n = 0;
  while (t.verlauf.length) { t = L.rueckgaengig(t); n++; wahr(L.istGueltig(t)); }
  gleich(n, 100);
});

test('Hinweis: findet einen platzenden Schuss, wenn es einen gibt', () => {
  const z = bau([[0, 3, 1], [0, 5, 1]]);
  const h = L.hinweis(z);
  wahr(Math.abs(h.winkel) <= 78);
  gleich(h.tausch, false);
  gleich(h.platzt, 3);
  const r = L.rechne(z, h.winkel);
  gleich(r.ergebnis.platzte.length, 3);
});

test('Spielstand: JSON-tauglich, streng validiert', () => {
  const z = L.schiesse(L.neuesLevel(3, 'v'), 5).zustand;
  const s = JSON.parse(JSON.stringify(L.zumSpeichern(z)));
  wahr(L.istGueltig(s));
  tief(L.ausSpeicher(s), s);
  const kopie = () => JSON.parse(JSON.stringify(s));
  const falsch = [];
  const setze = (fn) => { const k = kopie(); fn(k); falsch.push(k); };
  setze((k) => { k.brett.pop(); });
  setze((k) => { k.brett[0] = L.BOMBE; });
  setze((k) => { k.brett[0] = 7.5; });
  setze((k) => { k.brett[0] = k.farben + 1; });
  setze((k) => { k.brett[SPALTEN - 1] = 1; k.kopf = 1; k.brett[SPALTEN - 1] = 1; });
  setze((k) => { k.rng = [1, 2, 3]; });
  setze((k) => { k.rng = [1, 2, 3, -1]; });
  setze((k) => { k.winkel = NaN; });
  setze((k) => { k.winkel = 200; });
  setze((k) => { k.level = 0; });
  setze((k) => { k.modus = 'xyz'; });
  setze((k) => { k.farben = 9; });
  setze((k) => { k.aktuell = 0; });
  setze((k) => { k.naechste = 99; });
  setze((k) => { k.weiter = 'ja'; });
  setze((k) => { k.fehl = -1; });
  setze((k) => { k.seed = ''; });
  setze((k) => { k.verlauf = new Array(101).fill(k.verlauf[0]); });
  setze((k) => { k.verlauf[0].b = 'abc'; });
  setze((k) => { k.verlauf[0].r = null; });
  for (const f of falsch) gleich(L.istGueltig(f), false);
  for (const v of [null, undefined, 5, 'x', [], {}, true]) gleich(L.istGueltig(v), false);
  let wirft = false;
  try { L.ausSpeicher({ ...s, brett: [] }); } catch { wirft = true; }
  wahr(wirft);
});

test('Spielstand: Zufallsbelastung (Fuzz) wirft nie etwas anderes als einen Fehler', () => {
  const gut = JSON.parse(JSON.stringify(L.zumSpeichern(L.schiesse(L.neuesEndlos('fz'), 3).zustand)));
  const werte = [NaN, Infinity, -Infinity, null, undefined, '1', [], {}, true, 0, -1, 1e300, 0.5];
  for (const k of Object.keys(gut)) {
    for (const w of werte) {
      try { L.ausSpeicher({ ...gut, [k]: w }); } catch (e) { wahr(e instanceof Error); }
    }
  }
});

// ---------- Oberfläche ----------
function falscherKontext(signal, zaehler = {}) {
  const speicher = erstelleSpeicher({ backend: falscherSpeicher() });
  const einstellungen = erstelleEinstellungen(speicher);
  zaehler.einstellungen = einstellungen;
  return {
    variante: zaehler.variante ?? 'level',
    speicher: (zaehler.sp = zaehler.sp ?? speicher.bereich('blasenschuss:daten:')),
    einstellungen: Object.assign(Object.create(einstellungen), { spiel: einstellungen.spiel('blasenschuss') }),
    statistik: { melde() {} },
    zufall: (s, z) => erstelleZufall(s, z),
    neuerSeed,
    farben: erstelleFarben(einstellungen),
    eingabe,
    signal,
    bewegungReduziert: () => zaehler.still ?? true,
    worker: () => { throw new Error('kein Worker'); },
    meldung(t) { zaehler.letzte = t; },
    meldeAenderung() { zaehler.aenderungen = (zaehler.aenderungen || 0) + 1; },
    meldeGewonnen(text, opt) { zaehler.gewonnen = (zaehler.gewonnen || 0) + 1; zaehler.gewonnenText = text; zaehler.gewonnenOpt = opt; },
    neuesSpiel() {},
  };
}

async function mit(stand, fn, zaehler = {}) {
  const ac = new AbortController();
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;height:700px';
  document.body.append(container);
  const instanz = modul.erstelle(container, falscherKontext(ac.signal, zaehler), stand);
  try { return await fn(instanz, container); } finally {
    instanz.zerstoere();
    ac.abort();
    container.remove();
  }
}
const taste = (i, key, extra = {}) => i.onTaste({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, target: document.body, ...extra });

test('Modul: Metadaten', () => {
  gleich(modul.id, 'blasenschuss');
  gleich(modul.name, 'Blasenschuss');
  gleich(modul.standVersion, 1);
  tief(modul.varianten.map((v) => v.id), ['level', 'endlos']);
  wahr(modul.varianten[0].name.startsWith('Level – ') && modul.varianten[1].name.startsWith('Endlos – '));
});

test('Oberfläche: Feld, Blasen, Schütze, Beschriftungen', async () => {
  await mit(null, async (i, c) => {
    const svg = c.querySelector('svg.bs-feld');
    wahr(svg && svg.getAttribute('aria-label'));
    const st = i.getStand();
    gleich(c.querySelectorAll('.bs-blasen .bs-blase').length, L.anzahlBlasen(st.brett));
    gleich(c.querySelectorAll('.bs-schuetze .bs-blase').length, 2, 'aktuelle und nächste Blase');
    wahr(c.querySelector('.bs-zielpfad'), 'gestrichelte Zielhilfe');
    wahr(c.querySelector('.bs-info').textContent.includes('Level 1'));
    gleich(c.querySelector('.bs-tausch') !== null, true);
    tief(JSON.parse(JSON.stringify(st)), st);
    wahr(L.istGueltig(st));
    wahr(i.zusammenfassung().includes('Level 1'));
    gleich(i.kannRueckgaengig(), false);
  });
});

test('Oberfläche: Tastatur zielt, tauscht, schießt; Rückgängig stellt zurück', async () => {
  await mit(null, async (i, c) => {
    const vor = i.getStand();
    gleich(taste(i, 'ArrowRight'), true);
    gleich(taste(i, 'ArrowRight', { shiftKey: true }), true);
    gleich(i.getStand().winkel, 6);
    taste(i, 'ArrowLeft');
    gleich(i.getStand().winkel, 5);
    taste(i, 't');
    gleich(i.getStand().aktuell, vor.naechste);
    gleich(i.getStand().naechste, vor.aktuell);
    gleich(taste(i, 'Enter'), true);
    const nach = i.getStand();
    gleich(nach.schuesse, 1);
    gleich(i.kannRueckgaengig(), true);
    i.rueckgaengig();
    gleich(i.getStand().schuesse, 0);
    gleich(i.getStand().brett.join(), vor.brett.join());
    gleich(taste(i, 'Enter', { target: document.createElement('button') }), false, 'Enter auf Knopf gehört dem Knopf');
    gleich(taste(i, 'q'), false);
  });
});

test('Oberfläche: Hinweis zeigt Zielhilfe; Endlos zeigt Rekord; Muster zeigt Symbole', async () => {
  const z = {};
  await mit(null, async (i, c) => {
    i.hinweis();
    wahr(c.querySelector('.bs-zielpfad.hinweis'));
    wahr(c.querySelector('.bs-info').textContent.includes('Rekord'));
    gleich(c.querySelectorAll('.bs-symbol:not(.hell)').length, 0); // Regenbogen-Blasen tragen immer ein (helles) Symbol
    z.einstellungen.setze('muster', true);
    wahr(c.querySelectorAll('.bs-blase .bs-symbol').length >= c.querySelectorAll('.bs-blase .bs-farbe').length, 'Symbole in den farbigen Blasen');
  }, Object.assign(z, { variante: 'endlos' }));
});

test('Oberfläche: Ziel erreicht → meldeGewonnen mit Weiterspielen; Weiterspielen läuft ohne Ziel', async () => {
  const z = bau([[0, 3, 1], [0, 5, 1]]);
  const stand = L.zumSpeichern(z);
  const zaehler = {};
  await mit(stand, async (i, c) => {
    taste(i, 'Enter');
    gleich(zaehler.gewonnen, 1);
    gleich(zaehler.gewonnenOpt.weiterspielen, true);
    wahr(zaehler.gewonnenText.includes('Level 1'));
    gleich(zaehler.sp.lies('level'), 2, 'Levelzähler gespeichert');
    i.weiterspielen();
    gleich(i.getStand().weiter, true);
    wahr(c.querySelectorAll('.bs-blasen .bs-blase').length > 0);
    for (let k = 0; k < 20; k++) { const h = L.hinweis(i.getStand()); if (h.tausch) taste(i, 't'); i.hinweis(); taste(i, 'Enter'); }
    gleich(zaehler.gewonnen, 1, 'nie ein zweites Mal gewonnen');
    wahr(L.istGueltig(i.getStand()));
  }, zaehler);
});

test('Oberfläche: gespeicherter Stand wird wiederhergestellt, kaputter ergibt neues Spiel', async () => {
  const z = L.schiesse(L.neuesEndlos('rest'), 9).zustand;
  await mit(L.zumSpeichern(z), async (i) => {
    gleich(i.getStand().seed, 'rest');
    gleich(i.getStand().schuesse, 1);
  });
  for (const kaputt of [{ modus: 'level' }, { ...L.zumSpeichern(z), brett: [1, 2, 3] }, 'xyz', 12]) {
    await mit(kaputt, async (i, c) => {
      wahr(L.istGueltig(i.getStand()));
      wahr(c.querySelector('.bs-blase'));
    });
  }
});
