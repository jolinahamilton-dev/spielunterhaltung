// Stau auflösen – Regeln, Löser, Generatoren und Spielzustand. Ohne DOM (auch im Worker nutzbar).
//
// Level   = { version:1, modus:'klassisch'|'ausparken', variante, nr, seed, breite, hoehe,
//             ausgangZeile (nur klassisch, sonst -1), fahrzeuge:[{ x, y, laenge, achse, farbe, ziel?, pfeil? }], optimum }
//           x, y = linkes bzw. oberes Feld in der Startaufstellung.
// Position = je Fahrzeug eine Zahl (Spalte bei waagerecht, Zeile bei senkrecht), die Achse ist fest.
// Zustand = { level, pos:[], draussen:[] (0/1, nur Ausparken), zurueck:[], vor:[], hinweise, anstoesser, gewonnen }
// Verlauf  = ['z', i, von, nach] (Verschieben) · ['r', i] (ausgeparkt) · ['n', posVorher, draussenVorher] (Neustart)
import { erstelleZufall } from '../../kern/zufall.js';

export const VERSION = 1;

export const STUFEN = Object.freeze({
  leicht: { name: 'Leicht', breite: 6, hoehe: 6, fahrzeuge: [7, 10], bereich: [5, 9] },
  mittel: { name: 'Mittel', breite: 6, hoehe: 6, fahrzeuge: [9, 12], bereich: [10, 15] },
  schwer: { name: 'Schwer', breite: 6, hoehe: 6, fahrzeuge: [10, 13], bereich: [16, 60], hoechster: true },
});
export const VARIANTEN = ['leicht', 'mittel', 'schwer', 'ausparken'];
export const VARIANTEN_NAME = { leicht: 'Leicht', mittel: 'Mittel', schwer: 'Schwer', ausparken: 'Ausparken' };

// Budgets in Rechenschritten (nicht Zeit) → gleicher Seed ergibt auf jedem Gerät dasselbe Level
const CLUSTER_MAX = 5000;           // Zustände je Belegung
const GESAMT_BUDGET = 4000000;      // untersuchte Zustände je Level (alle Versuche zusammen)
const NEUSTART_NACH = 60;           // Fehlversuche, nach denen das Bergsteigen neu beginnt
const LOESER_MAX = 400000;

export const seedFuer = (variante, nr) => `stau-v1-${variante}-${nr}`;

// ---------- Grundregeln ----------

/** Belegungsraster: Fahrzeugnummer oder -1 (frei). Ausgeparkte Fahrzeuge belegen nichts. */
export function belegung(level, pos, draussen = null) {
  const { breite: B, hoehe: H, fahrzeuge } = level;
  const g = new Int16Array(B * H).fill(-1);
  fahrzeuge.forEach((f, i) => {
    if (draussen && draussen[i]) return;
    for (let k = 0; k < f.laenge; k++) {
      const x = f.achse === 'h' ? pos[i] + k : f.x;
      const y = f.achse === 'h' ? f.y : pos[i] + k;
      g[y * B + x] = i;
    }
  });
  return g;
}

/** Felder eines Fahrzeugs bei Position p */
export function felder(f, p) {
  const z = [];
  for (let k = 0; k < f.laenge; k++) z.push(f.achse === 'h' ? [p + k, f.y] : [f.x, p + k]);
  return z;
}

/** Bewegungsspielraum von Fahrzeug i: { min, max } (zusammenhängend frei) */
export function spielraum(level, pos, i, draussen = null, g = belegung(level, pos, draussen)) {
  const f = level.fahrzeuge[i];
  const B = level.breite;
  const grenze = f.achse === 'h' ? B : level.hoehe;
  const zelle = (q) => (f.achse === 'h' ? g[f.y * B + q] : g[q * B + f.x]);
  let min = pos[i], max = pos[i];
  while (min - 1 >= 0 && zelle(min - 1) < 0) min--;
  while (max + f.laenge < grenze && zelle(max + f.laenge) < 0) max++;
  return { min, max };
}

export const zielIndex = (level) => level.fahrzeuge.findIndex((f) => f.ziel);
export const zielPosition = (level) => level.breite - 2;

/** Klassisch: Zielfahrzeug steht am Ausgang */
export function amZiel(level, pos) {
  const i = zielIndex(level);
  return i >= 0 && pos[i] === level.breite - level.fahrzeuge[i].laenge;
}

/** Ausparken: Weg in Pfeilrichtung bis zum Rand → { frei, blocker, stopp } */
export function bahn(level, pos, draussen, i, g = belegung(level, pos, draussen)) {
  const f = level.fahrzeuge[i];
  const B = level.breite;
  const grenze = f.achse === 'h' ? B : level.hoehe;
  const zelle = (q) => (f.achse === 'h' ? g[f.y * B + q] : g[q * B + f.x]);
  if (f.pfeil > 0) {
    for (let q = pos[i] + f.laenge; q < grenze; q++) {
      if (zelle(q) >= 0) return { frei: false, blocker: zelle(q), stopp: q - f.laenge };
    }
  } else {
    for (let q = pos[i] - 1; q >= 0; q--) {
      if (zelle(q) >= 0) return { frei: false, blocker: zelle(q), stopp: q + 1 };
    }
  }
  return { frei: true, blocker: -1, stopp: pos[i] };
}

// ---------- Zustandsraum (Schlüssel = eine Zahl je Zustand) ----------

/** Kompakte Beschreibung für die Suche: Schlüssel in gemischter Basis (je Fahrzeug Anzahl möglicher Positionen) */
function raumVon(level) {
  const n = level.fahrzeuge.length;
  const pot = [], basis = [];
  let p = 1;
  for (const f of level.fahrzeuge) { const b = (f.achse === 'h' ? level.breite : level.hoehe) - f.laenge + 1; pot.push(p); basis.push(b); p *= b; }
  if (p > Number.MAX_SAFE_INTEGER) throw new Error('Zu viele Fahrzeuge');
  return {
    B: level.breite, H: level.hoehe, n, pot, basis,
    h: level.fahrzeuge.map((f) => f.achse === 'h'),
    lang: level.fahrzeuge.map((f) => f.laenge),
    fix: level.fahrzeuge.map((f) => (f.achse === 'h' ? f.y : f.x)),
    g: new Int16Array(level.breite * level.hoehe),
    pos: new Array(n).fill(0),
  };
}
const kodiere = (raum, pos) => pos.reduce((s, p, i) => s + p * raum.pot[i], 0);
function dekodiere(raum, k) {
  const pos = [];
  for (let i = 0; i < raum.n; i++) { const b = raum.basis[i], p = k % b; pos.push(p); k = (k - p) / b; }
  return pos;
}

/** ruft cb(i, nach, neuerSchluessel) für jeden möglichen Zug (beliebige Strecke = 1 Zug) */
function jederZug(raum, k, cb) {
  const { B, H, n, pot, basis, h, lang, fix, g, pos } = raum;
  g.fill(-1);
  let rest = k;
  for (let i = 0; i < n; i++) {
    const p = rest % basis[i];
    rest = (rest - p) / basis[i];
    pos[i] = p;
    if (h[i]) for (let t = 0; t < lang[i]; t++) g[fix[i] * B + p + t] = i;
    else for (let t = 0; t < lang[i]; t++) g[(p + t) * B + fix[i]] = i;
  }
  for (let i = 0; i < n; i++) {
    const p = pos[i], L = lang[i], c = fix[i], m = pot[i];
    if (h[i]) {
      const r = c * B;
      for (let q = p - 1; q >= 0 && g[r + q] < 0; q--) cb(i, q, k + (q - p) * m);
      for (let q = p + L; q < B && g[r + q] < 0; q++) cb(i, q - L + 1, k + (q - L + 1 - p) * m);
    } else {
      for (let q = p - 1; q >= 0 && g[q * B + c] < 0; q--) cb(i, q, k + (q - p) * m);
      for (let q = p + L; q < H && g[q * B + c] < 0; q++) cb(i, q - L + 1, k + (q - L + 1 - p) * m);
    }
  }
}

/**
 * Kürzester Lösungsweg ab pos (Breitensuche) → [[i, nach], …] (leer, wenn schon gelöst) oder null.
 */
export function loese(level, pos, max = LOESER_MAX) {
  const zi = zielIndex(level);
  if (zi < 0 || level.fahrzeuge.length > 17) return null;   // Schlüssel muss in eine sichere Ganzzahl passen
  const raum = raumVon(level);
  const zielP = level.breite - level.fahrzeuge[zi].laenge;
  const zielTeil = (k) => Math.floor(k / raum.pot[zi]) % raum.basis[zi];
  const start = kodiere(raum, pos);
  if (zielTeil(start) === zielP) return [];
  const index = new Map([[start, 0]]);
  const liste = [start], eltern = [-1], zugI = [-1], zugNach = [-1];
  for (let kopf = 0; kopf < liste.length; kopf++) {
    let gefunden = -1;
    jederZug(raum, liste[kopf], (i, nach, nk) => {
      if (gefunden >= 0 || index.has(nk)) return;
      index.set(nk, liste.length);
      liste.push(nk); eltern.push(kopf); zugI.push(i); zugNach.push(nach);
      if (zielTeil(nk) === zielP) gefunden = liste.length - 1;
    });
    if (gefunden >= 0) {
      const weg = [];
      for (let j = gefunden; j > 0; j = eltern[j]) weg.push([zugI[j], zugNach[j]]);
      return weg.reverse();
    }
    if (liste.length > max) return null;
  }
  return null;
}

/** Nächster optimaler Zug → { i, nach } oder null */
export function hinweis(level, pos) {
  const weg = loese(level, pos);
  return weg && weg.length ? { i: weg[0][0], nach: weg[0][1] } : null;
}

/**
 * Alle von pos aus erreichbaren Zustände + exakter Abstand zum Ziel (Mehrquellen-Breitensuche rückwärts,
 * Züge sind umkehrbar) → { zustaende:[Schlüssel], abstand:Int16Array (-1 = Ziel unerreichbar), maxAbstand } oder null (zu groß)
 */
export function cluster(level, pos, max = CLUSTER_MAX, raum = raumVon(level)) {
  const zi = zielIndex(level);
  const zielP = level.breite - level.fahrzeuge[zi].laenge;
  const start = kodiere(raum, pos);
  const index = new Map([[start, 0]]);
  const zustaende = [start];
  for (let kopf = 0; kopf < zustaende.length; kopf++) {
    jederZug(raum, zustaende[kopf], (i, nach, nk) => {
      if (!index.has(nk)) { index.set(nk, zustaende.length); zustaende.push(nk); }
    });
    if (zustaende.length > max) return null;
  }
  const abstand = new Int16Array(zustaende.length).fill(-1);
  const schlange = [];
  const pz = raum.pot[zi], c0 = raum;
  zustaende.forEach((k, j) => { if (Math.floor(k / pz) % c0.basis[zi] === zielP) { abstand[j] = 0; schlange.push(j); } });
  let maxAbstand = schlange.length ? 0 : -1;
  for (let kopf = 0; kopf < schlange.length; kopf++) {
    const j = schlange[kopf];
    const d = abstand[j] + 1;
    jederZug(raum, zustaende[j], (i, nach, nk) => {
      const m = index.get(nk);
      if (abstand[m] < 0) { abstand[m] = d; schlange.push(m); if (d > maxAbstand) maxAbstand = d; }
    });
  }
  return { zustaende, abstand, maxAbstand, raum };
}

// ---------- Generator Klassisch (Zufallsbelegung + Bergsteigen über die Cluster-Tiefe) ----------

const startVon = (f) => (f.achse === 'h' ? f.x : f.y);

function freiFuer(fahrzeuge, B, H, f) {
  const g = new Int8Array(B * H);
  for (const a of fahrzeuge) for (const [x, y] of felder(a, startVon(a))) g[y * B + x] = 1;
  return felder(f, startVon(f)).every(([x, y]) => x >= 0 && y >= 0 && x < B && y < H && !g[y * B + x]);
}

function zufallsFahrzeug(r, B, H, zeile) {
  for (;;) {
    const laenge = r.zahl() < 0.72 ? 2 : 3;
    const achse = r.zahl() < 0.5 ? 'h' : 'v';
    const x = r.ganz(0, achse === 'h' ? B - laenge : B - 1);
    const y = r.ganz(0, achse === 'v' ? H - laenge : H - 1);
    // waagerecht in der Ausgangszeile → unlösbar (rechts vom Ziel) oder sinnlos (links)
    if (!(achse === 'h' && y === zeile)) return { x, y, laenge, achse };
  }
}

function fuegeHinzu(r, fahrzeuge, B, H, zeile) {
  for (let t = 0; t < 40; t++) {
    const f = zufallsFahrzeug(r, B, H, zeile);
    if (freiFuer(fahrzeuge, B, H, f)) return [...fahrzeuge, f];
  }
  return null;
}

function zufallsBelegung(r, stufe) {
  const { breite: B, hoehe: H } = stufe;
  const zeile = Math.floor((H - 1) / 2);
  let fahrzeuge = [{ x: r.ganz(0, B - 3), y: zeile, laenge: 2, achse: 'h', ziel: true }];
  const ziel = r.ganz(stufe.fahrzeuge[0], stufe.fahrzeuge[1]);
  while (fahrzeuge.length < ziel) {
    const neu = fuegeHinzu(r, fahrzeuge, B, H, zeile);
    if (!neu) break;
    fahrzeuge = neu;
  }
  return fahrzeuge;
}

function mutiere(r, fahrzeuge, stufe) {
  const { breite: B, hoehe: H } = stufe;
  const zeile = Math.floor((H - 1) / 2);
  const [minF, maxF] = stufe.fahrzeuge;
  const wahl = r.zahl();
  const andere = fahrzeuge.map((f, i) => i).filter((i) => !fahrzeuge[i].ziel);
  if (wahl < 0.35 && fahrzeuge.length < maxF) return fuegeHinzu(r, fahrzeuge, B, H, zeile);
  if (wahl < 0.55 && fahrzeuge.length > minF && andere.length) {
    const weg = r.wahl(andere);
    return fahrzeuge.filter((f, i) => i !== weg);
  }
  if (!andere.length) return null;
  const weg = r.wahl(andere);
  return fuegeHinzu(r, fahrzeuge.filter((f, i) => i !== weg), B, H, zeile);
}

function bewerte(fahrzeuge, stufe) {
  const lv = { breite: stufe.breite, hoehe: stufe.hoehe, fahrzeuge };
  const c = cluster(lv, fahrzeuge.map(startVon));
  return { fahrzeuge, c, tiefe: c ? c.maxAbstand : -1, kosten: c ? c.zustaende.length * 2 : CLUSTER_MAX };
}

/** Fahrzeuge zeilenweise sortieren (Tab-Reihenfolge) und Farben verteilen */
function ordne(fahrzeuge, r, zielFarbe) {
  const liste = fahrzeuge.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  let farben = [];
  return liste.map((f) => {
    const basis = { x: f.x, y: f.y, laenge: f.laenge, achse: f.achse };
    const extra = (o) => Object.assign(o, f.ziel ? { ziel: true } : {}, f.pfeil ? { pfeil: f.pfeil } : {});
    if (f.ziel) return extra({ ...basis, farbe: zielFarbe });
    // Klassisch: Farbe 0 und Farbe 4 (Stern-Symbol) bleiben dem Zielfahrzeug vorbehalten
    if (!farben.length) farben = r.mische([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((c) => zielFarbe < 0 || (c !== zielFarbe && c !== 4)));
    return extra({ ...basis, farbe: farben.pop() });
  });
}

/** Klassisches Level mit exakter Mindestzugzahl */
export function erzeugeKlassisch(variante, nr, seed = seedFuer(variante, nr)) {
  const stufe = STUFEN[variante];
  if (!stufe) throw new Error(`Unbekannte Stufe ${variante}`);
  const r = erstelleZufall(seed);
  const [lo, hi] = stufe.bereich;
  let schritte = 0;
  let akt = bewerte(zufallsBelegung(r, stufe), stufe);
  let bester = akt;
  let stillstand = 0;
  while (bester.tiefe < lo && schritte < GESAMT_BUDGET) {
    let kand;
    if (stillstand > NEUSTART_NACH) {
      kand = bewerte(zufallsBelegung(r, stufe), stufe);
      akt = kand;
      stillstand = 0;
    } else {
      const m = mutiere(r, akt.fahrzeuge, stufe);
      if (!m) { stillstand++; schritte += 10; continue; }
      kand = bewerte(m, stufe);
      if (kand.tiefe > akt.tiefe) stillstand = 0; else stillstand++;
      if (kand.tiefe >= akt.tiefe) akt = kand;
    }
    schritte += kand.kosten;
    if (kand.tiefe > bester.tiefe) bester = kand;
  }
  if (bester.tiefe < 1) throw new Error('Kein Level gefunden');
  const { c, fahrzeuge } = bester;
  const ziel = stufe.hoechster ? bester.tiefe : r.ganz(Math.min(lo, bester.tiefe), Math.min(hi, bester.tiefe));
  const kand = [];
  c.abstand.forEach((d, j) => { if (d === ziel) kand.push(j); });
  const start = dekodiere(c.raum, c.zustaende[kand[r.ganz(0, kand.length - 1)]]);
  const fz = fahrzeuge.map((f, i) => ({ ...f, x: f.achse === 'h' ? start[i] : f.x, y: f.achse === 'h' ? f.y : start[i] }));
  return {
    version: VERSION, modus: 'klassisch', variante, nr, seed,
    breite: stufe.breite, hoehe: stufe.hoehe, ausgangZeile: Math.floor((stufe.hoehe - 1) / 2),
    fahrzeuge: ordne(fz, r, 0), optimum: ziel,
  };
}

// ---------- Generator Ausparken (lösbar per Konstruktion) ----------

export function ausparkenStufe(nr) {
  const gross = nr > 6;
  const n = gross ? 7 : 6;
  const dichte = Math.min(0.8, 0.6 + 0.02 * Math.min(nr, 10));
  return { breite: n, hoehe: n, dichte };
}

/** Abhängigkeitstiefe: längste Kette „A muss vor B raus“ (Kreis → Infinity) */
export function abhaengigkeitsTiefe(level) {
  const n = level.fahrzeuge.length;
  const pos = startPositionen(level);
  const g = belegung(level, pos);
  // blockiert[i] = Fahrzeuge, die auf der Bahn von i stehen
  const blockiert = level.fahrzeuge.map((f, i) => {
    const B = level.breite, grenze = f.achse === 'h' ? B : level.hoehe;
    const zelle = (q) => (f.achse === 'h' ? g[f.y * B + q] : g[q * B + f.x]);
    const s = [];
    if (f.pfeil > 0) for (let q = pos[i] + f.laenge; q < grenze; q++) { if (zelle(q) >= 0 && !s.includes(zelle(q))) s.push(zelle(q)); }
    else for (let q = pos[i] - 1; q >= 0; q--) { if (zelle(q) >= 0 && !s.includes(zelle(q))) s.push(zelle(q)); }
    return s;
  });
  const tiefe = new Array(n).fill(-1);   // -1 offen, -2 in Arbeit
  const besuche = (i) => {
    if (tiefe[i] === -2) return Infinity;
    if (tiefe[i] >= 0) return tiefe[i];
    tiefe[i] = -2;
    let t = 1;
    for (const b of blockiert[i]) t = Math.max(t, 1 + besuche(b));
    tiefe[i] = t;
    return t;
  };
  let max = 0;
  for (let i = 0; i < n; i++) max = Math.max(max, besuche(i));
  return max;
}

export function erzeugeAusparken(nr, seed = seedFuer('ausparken', nr)) {
  const st = ausparkenStufe(nr);
  const { breite: B, hoehe: H } = st;
  const r = erstelleZufall(seed);
  let bestes = null;
  for (let versuch = 0; versuch < 30; versuch++) {
    const g = new Int8Array(B * H);
    const fahrzeuge = [];
    let belegt = 0;
    for (let fehl = 0; belegt < st.dichte * B * H && fehl < 400; fehl++) {
      const laenge = r.zahl() < 0.7 ? 2 : 3;
      const achse = r.zahl() < 0.5 ? 'h' : 'v';
      const pfeil = r.zahl() < 0.5 ? 1 : -1;
      const x = r.ganz(0, achse === 'h' ? B - laenge : B - 1);
      const y = r.ganz(0, achse === 'v' ? H - laenge : H - 1);
      const f = { x, y, laenge, achse, pfeil };
      const p = achse === 'h' ? x : y;
      if (!felder(f, p).every(([fx, fy]) => !g[fy * B + fx])) continue;
      // Bahn bis zum Rand muss jetzt frei sein → umgekehrte Einsetz-Reihenfolge löst das Level
      let frei = true;
      const grenze = achse === 'h' ? B : H;
      const zelle = (q) => (achse === 'h' ? g[y * B + q] : g[q * B + x]);
      if (pfeil > 0) { for (let q = p + laenge; q < grenze; q++) if (zelle(q)) { frei = false; break; } }
      else { for (let q = p - 1; q >= 0; q--) if (zelle(q)) { frei = false; break; } }
      if (!frei) continue;
      for (const [fx, fy] of felder(f, p)) g[fy * B + fx] = 1;
      fahrzeuge.push(f);
      belegt += laenge;
    }
    const lv = { version: VERSION, modus: 'ausparken', variante: 'ausparken', nr, seed, breite: B, hoehe: H, ausgangZeile: -1, fahrzeuge: ordne(fahrzeuge, r, -1), optimum: fahrzeuge.length };
    const tiefe = abhaengigkeitsTiefe(lv);
    if (!bestes || tiefe > bestes.tiefe) bestes = { lv, tiefe };
    if (tiefe >= Math.min(6, 3 + Math.floor(nr / 3))) break;
  }
  return bestes.lv;
}

export function erzeugeLevel(variante, nr) {
  return variante === 'ausparken' ? erzeugeAusparken(nr) : erzeugeKlassisch(variante, nr);
}

// ---------- Spielzustand ----------

export const startPositionen = (level) => level.fahrzeuge.map((f) => (f.achse === 'h' ? f.x : f.y));

export function neuesSpiel(level) {
  return {
    level,
    pos: startPositionen(level),
    draussen: level.fahrzeuge.map(() => 0),
    zurueck: [], vor: [],
    hinweise: 0, anstoesser: 0, gewonnen: false,
  };
}

export const istAusparken = (z) => z.level.modus === 'ausparken';

/** Züge seit dem letzten Neustart */
export function zugZahl(z) {
  let n = 0;
  for (let k = z.zurueck.length - 1; k >= 0; k--) {
    if (z.zurueck[k][0] === 'n') break;
    n++;
  }
  return n;
}
export const ausgeparkt = (z) => z.draussen.reduce((a, b) => a + b, 0);
export const geloest = (z) => (istAusparken(z) ? ausgeparkt(z) === z.level.fahrzeuge.length : amZiel(z.level, z.pos));

/**
 * Fahrzeug i auf Position nach schieben (bis zum Hindernis, falls der Weg nicht frei ist).
 * Aufeinanderfolgende Schritte desselben Fahrzeugs werden zu einem Zug zusammengefasst.
 * → neuer Zustand oder null (keine Bewegung)
 */
export function schiebe(z, i, nach) {
  if (z.gewonnen || istAusparken(z) || !Number.isInteger(i) || !z.level.fahrzeuge[i]) return null;
  const { min, max } = spielraum(z.level, z.pos, i);
  const ziel = Math.max(min, Math.min(max, nach));
  const von = z.pos[i];
  if (ziel === von) return null;
  const pos = z.pos.slice();
  pos[i] = ziel;
  const zurueck = z.zurueck.slice();
  const letzter = zurueck[zurueck.length - 1];
  if (letzter && letzter[0] === 'z' && letzter[1] === i) {
    zurueck.pop();
    if (letzter[2] !== ziel) zurueck.push(['z', i, letzter[2], ziel]);
  } else {
    zurueck.push(['z', i, von, ziel]);
  }
  const neu = { ...z, pos, zurueck, vor: [] };
  neu.gewonnen = geloest(neu);
  return neu;
}

/**
 * Ausparken: Fahrzeug i losfahren lassen → { zustand, frei, blocker, stopp } oder null.
 * Blockiert → Zustand bleibt (nur der Anstoßer wird gezählt).
 */
export function fahreAus(z, i) {
  if (z.gewonnen || !istAusparken(z) || !z.level.fahrzeuge[i] || z.draussen[i]) return null;
  const b = bahn(z.level, z.pos, z.draussen, i);
  if (!b.frei) return { ...b, zustand: { ...z, anstoesser: z.anstoesser + 1 } };
  const draussen = z.draussen.slice();
  draussen[i] = 1;
  const neu = { ...z, draussen, zurueck: [...z.zurueck, ['r', i]], vor: [] };
  neu.gewonnen = geloest(neu);
  return { ...b, zustand: neu };
}

/** Ausparken-Hinweis: ein gerade freies Fahrzeug (das erste in Lesereihenfolge) */
export function freiesFahrzeug(z) {
  const g = belegung(z.level, z.pos, z.draussen);
  for (let i = 0; i < z.level.fahrzeuge.length; i++) {
    if (!z.draussen[i] && bahn(z.level, z.pos, z.draussen, i, g).frei) return i;
  }
  return -1;
}

function wende(z, e, rueck) {
  const pos = z.pos.slice();
  const draussen = z.draussen.slice();
  let gespeichert = null;
  if (e[0] === 'z') pos[e[1]] = rueck ? e[2] : e[3];
  else if (e[0] === 'r') draussen[e[1]] = rueck ? 0 : 1;
  else if (e[0] === 'n') {
    if (rueck) { e[1].forEach((p, i) => { pos[i] = p; }); e[2].forEach((d, i) => { draussen[i] = d; }); }
    else { startPositionen(z.level).forEach((p, i) => { pos[i] = p; }); draussen.fill(0); }
  }
  if (!stimmig(z.level, pos, draussen)) return null;
  gespeichert = { ...z, pos, draussen };
  return gespeichert;
}

export function rueckgaengig(z) {
  if (!z.zurueck.length) return null;
  const e = z.zurueck[z.zurueck.length - 1];
  const neu = wende(z, e, true);
  if (!neu) return { ...z, zurueck: [], vor: [] };
  neu.zurueck = z.zurueck.slice(0, -1);
  neu.vor = [...z.vor, e];
  neu.gewonnen = false;
  return neu;
}

export function wiederholen(z) {
  if (!z.vor.length) return null;
  const e = z.vor[z.vor.length - 1];
  const neu = wende(z, e, false);
  if (!neu) return { ...z, vor: [] };
  neu.vor = z.vor.slice(0, -1);
  neu.zurueck = [...z.zurueck, e];
  neu.gewonnen = geloest(neu);
  return neu;
}

/** Neustart als eigener Verlaufseintrag (direkt danach rückgängig machbar) */
export function neustart(z) {
  const start = startPositionen(z.level);
  const unveraendert = start.every((p, i) => p === z.pos[i]) && z.draussen.every((d) => !d);
  if (unveraendert) return z;
  return {
    ...z, pos: start, draussen: z.draussen.map(() => 0), gewonnen: false,
    zurueck: [...z.zurueck, ['n', z.pos.slice(), z.draussen.slice()]], vor: [],
  };
}

// ---------- Prüfen von gespeicherten Daten (gilt als nicht vertrauenswürdig) ----------

const ganz = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;

function stimmig(level, pos, draussen) {
  const { breite: B, hoehe: H } = level;
  const g = new Int8Array(B * H);
  for (let i = 0; i < level.fahrzeuge.length; i++) {
    const f = level.fahrzeuge[i];
    if (!ganz(pos[i], 0, (f.achse === 'h' ? B : H) - f.laenge)) return false;
    if (draussen[i]) continue;
    for (const [x, y] of felder(f, pos[i])) {
      if (g[y * B + x]) return false;
      g[y * B + x] = 1;
    }
  }
  return true;
}

export function pruefeLevel(l) {
  if (!l || typeof l !== 'object' || l.version !== VERSION) return null;
  if (l.modus !== 'klassisch' && l.modus !== 'ausparken') return null;
  if (!VARIANTEN.includes(l.variante) || (l.variante === 'ausparken') !== (l.modus === 'ausparken')) return null;
  if (!ganz(l.breite, 4, 9) || !ganz(l.hoehe, 4, 9) || !ganz(l.nr, 1, 1e9) || !ganz(l.optimum, 0, 999)) return null;
  if (!Array.isArray(l.fahrzeuge) || l.fahrzeuge.length < 1 || l.fahrzeuge.length > 40) return null;
  const klassisch = l.modus === 'klassisch';
  if (klassisch && (!ganz(l.ausgangZeile, 0, l.hoehe - 1) || l.fahrzeuge.length > 17)) return null;
  const fahrzeuge = [];
  let ziele = 0;
  for (const f of l.fahrzeuge) {
    if (!f || typeof f !== 'object') return null;
    if (f.achse !== 'h' && f.achse !== 'v') return null;
    if (f.laenge !== 2 && f.laenge !== 3) return null;
    if (!ganz(f.x, 0, l.breite - 1) || !ganz(f.y, 0, l.hoehe - 1) || !ganz(f.farbe, -1, 9)) return null;
    const n = { x: f.x, y: f.y, laenge: f.laenge, achse: f.achse, farbe: f.farbe };
    if (f.ziel === true) {
      if (!klassisch || f.achse !== 'h' || f.y !== l.ausgangZeile || f.laenge !== 2) return null;
      n.ziel = true; ziele++;
    }
    if (!klassisch) {
      if (f.pfeil !== 1 && f.pfeil !== -1) return null;
      n.pfeil = f.pfeil;
    }
    fahrzeuge.push(n);
  }
  if (klassisch && ziele !== 1) return null;
  const level = {
    version: VERSION, modus: l.modus, variante: l.variante, nr: l.nr, seed: String(l.seed ?? '').slice(0, 80),
    breite: l.breite, hoehe: l.hoehe, ausgangZeile: klassisch ? l.ausgangZeile : -1, fahrzeuge, optimum: l.optimum,
  };
  const pos = startPositionen(level);
  if (!stimmig(level, pos, fahrzeuge.map(() => 0))) return null;
  return level;
}

function pruefeEintrag(e, n, level) {
  if (!Array.isArray(e)) return false;
  const max = Math.max(level.breite, level.hoehe);
  if (e[0] === 'z') return e.length === 4 && ganz(e[1], 0, n - 1) && ganz(e[2], 0, max) && ganz(e[3], 0, max);
  if (e[0] === 'r') return e.length === 2 && ganz(e[1], 0, n - 1);
  if (e[0] === 'n') {
    return e.length === 3 && Array.isArray(e[1]) && Array.isArray(e[2]) && e[1].length === n && e[2].length === n
      && e[1].every((p) => ganz(p, 0, max)) && e[2].every((d) => d === 0 || d === 1);
  }
  return false;
}

/** Spielstand in einen Zustand übernehmen – ungültig → null */
export function ausSpeicher(s) {
  if (!s || typeof s !== 'object' || s.version !== VERSION) return null;
  const level = pruefeLevel(s.level);
  if (!level) return null;
  const n = level.fahrzeuge.length;
  if (!Array.isArray(s.pos) || s.pos.length !== n) return null;
  const draussen = Array.isArray(s.draussen) && s.draussen.length === n ? s.draussen.map((d) => (d === 1 ? 1 : 0)) : new Array(n).fill(0);
  if (level.modus === 'klassisch' && draussen.some(Boolean)) return null;
  if (!stimmig(level, s.pos, draussen)) return null;
  const liste = (a) => (Array.isArray(a) && a.length <= 5000 && a.every((e) => pruefeEintrag(e, n, level)) ? a.map((e) => JSON.parse(JSON.stringify(e))) : []);
  const z = {
    level, pos: s.pos.slice(), draussen,
    zurueck: liste(s.zurueck), vor: liste(s.vor),
    hinweise: ganz(s.hinweise, 0, 1e6) ? s.hinweise : 0,
    anstoesser: ganz(s.anstoesser, 0, 1e6) ? s.anstoesser : 0,
    gewonnen: false,
  };
  z.gewonnen = geloest(z);
  return z;
}

export function zumSpeichern(z) {
  return {
    version: VERSION, level: z.level, pos: z.pos.slice(), draussen: z.draussen.slice(),
    zurueck: z.zurueck, vor: z.vor, hinweise: z.hinweise, anstoesser: z.anstoesser, gewonnen: z.gewonnen,
  };
}
