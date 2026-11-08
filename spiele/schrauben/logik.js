// Schrauben – Logik ohne DOM (testbar).
//
// Bretter (Rasterformen) hängen in Schichten übereinander mit farbigen Schrauben an einer Wand.
// Eine Schraube ist frei, wenn kein noch hängendes Brett einer höheren Schicht ihre Zelle überdeckt.
// Eine herausgedrehte Schraube wandert automatisch in eine aktive Kiste ihrer Farbe (Kiste fasst 3),
// sonst auf einen Parkplatz. Ist eine Kiste voll, rückt die nächste der Schlange nach; geparkte
// Schrauben springen dann in passende neue Kisten. Ein Brett fällt, sobald alle Schrauben fehlen.
//
// Spielstand (JSON-tauglich):
// { v: 1, stufe, level, seed, b, h, bretter: [{ l, z: [Zellen] }], schrauben: [{ i, f, br }],
//   kisten: [Farbe …], aktiv, plaetze, loesung: [Schraube …], zuege: [Schraube …], vor: [Schraube …] }
// Alles Übrige (entfernt, Füllstände, Parkplätze) wird durch Nachspielen von `zuege` berechnet.
import { erstelleZufall } from '../../kern/zufall.js';

export const STAND_VERSION = 1;
export const KISTE = 3;            // Schrauben je Kiste
export const MAX_FARBE = 10;

export const STUFEN = Object.freeze({
  leicht: { name: 'Leicht', b: 5, h: 6, bretter: 4, farben: [3, 3], schichten: 3, plaetze: 5, aktiv: 3, parken: 0.35, schrauben: [2, 4] },
  mittel: { name: 'Mittel', b: 6, h: 7, bretter: 8, farben: [4, 5], schichten: 4, plaetze: 4, aktiv: 2, parken: 0.5, schrauben: [2, 3] },
  schwer: { name: 'Schwer', b: 7, h: 8, bretter: 12, farben: [5, 6], schichten: 5, plaetze: 3, aktiv: 1, parken: 0.5, schrauben: [2, 4] },
});
export const STUFEN_IDS = Object.keys(STUFEN);

const MAX_BRETTER = 24;
const MAX_SCHRAUBEN = 96;
const MAX_ZUEGE = 1000;

// ---------------------------------------------------------------------------------------------
// Grundregeln

const istGanz = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;

const ueberCache = new WeakMap();
/** Für jede Schraube: Indizes der Bretter höherer Schichten, die ihre Zelle überdecken (statisch je Level) */
function ueber(z) {
  let u = ueberCache.get(z.schrauben);
  if (!u) {
    const mengen = z.bretter.map((br) => new Set(br.z));
    u = z.schrauben.map((sc) => {
      const l = z.bretter[sc.br].l;
      const r = [];
      z.bretter.forEach((br, bi) => { if (br.l > l && mengen[bi].has(sc.i)) r.push(bi); });
      return r;
    });
    ueberCache.set(z.schrauben, u);
  }
  return u;
}

/** Wird Schraube s von einem noch hängenden Brett einer höheren Schicht verdeckt? */
export function verdeckt(z, s) {
  return ueber(z)[s].some((bi) => z.rest[bi] > 0);
}

/** Ist Schraube s noch drin und unverdeckt (antippbar, sofern ein Ziel da ist)? */
export function istFrei(z, s) {
  return s >= 0 && s < z.schrauben.length && !z.entfernt[s] && !verdeckt(z, s);
}

/** Index der aktiven Kiste mit Platz für Farbe f, sonst -1 (aktiv = die ersten `aktiv` unvollen Kisten) */
export function findeKiste(z, f) {
  let n = 0;
  for (let k = 0; k < z.kisten.length && n < z.aktiv; k++) {
    if (z.fuell[k] >= KISTE) continue;
    n++;
    if (z.kisten[k] === f) return k;
  }
  return -1;
}

/** Indizes der aktiven (vorne stehenden) Kisten */
export function aktiveKisten(z) {
  const r = [];
  for (let k = 0; k < z.kisten.length && r.length < z.aktiv; k++) if (z.fuell[k] < KISTE) r.push(k);
  return r;
}

/** Indizes der wartenden Kisten (noch nicht aktiv, noch nicht voll) */
export function wartendeKisten(z) {
  const akt = new Set(aktiveKisten(z));
  const r = [];
  for (let k = 0; k < z.kisten.length; k++) if (z.fuell[k] < KISTE && !akt.has(k)) r.push(k);
  return r;
}

/** Schraube in Kiste/Parkplatz legen (verändert m: kisten, aktiv, fuell, park, plaetze) → 'kiste' | 'park' | null */
function einlegen(m, f) {
  const k = findeKiste(m, f);
  if (k >= 0) {
    m.fuell[k]++;
    entparken(m);
    return 'kiste';
  }
  if (m.park.length < m.plaetze) { m.park.push(f); return 'park'; }
  return null;
}

/** Geparkte Schrauben in passende aktive Kisten umlegen, bis nichts mehr geht */
function entparken(m) {
  let geaendert = true;
  while (geaendert && m.park.length) {
    geaendert = false;
    for (let p = 0; p < m.park.length; p++) {
      const k = findeKiste(m, m.park[p]);
      if (k >= 0) {
        m.fuell[k]++;
        m.park.splice(p, 1);
        geaendert = true;
        break;
      }
    }
  }
}

/** Darf Schraube s jetzt gedreht werden? (frei, und Kiste oder Parkplatz vorhanden) */
export function kannTippen(z, s) {
  if (!istGanz(s, 0, z.schrauben.length - 1) || !istFrei(z, s)) return false;
  return findeKiste(z, z.schrauben[s].f) >= 0 || z.park.length < z.plaetze;
}

export const gewonnen = (z) => z.rest.every((r) => r === 0);
export const restSchrauben = (z) => z.entfernt.reduce((n, e) => n + (e ? 0 : 1), 0);
export const restBretter = (z) => z.rest.reduce((n, r) => n + (r > 0 ? 1 : 0), 0);
export const legaleZuege = (z) => z.schrauben.map((_, s) => s).filter((s) => kannTippen(z, s));
/** Festgefahren: nicht gewonnen und keine Schraube mehr drehbar (kein Spielende – Rückgängig hilft) */
export const festgefahren = (z) => !gewonnen(z) && legaleZuege(z).length === 0;

/** Anfangszustand eines Levels (Verlauf optional) */
function anfang(level, zuege = [], vor = []) {
  const rest = level.bretter.map(() => 0);
  for (const sc of level.schrauben) rest[sc.br]++;
  return {
    v: 1, stufe: level.stufe, level: level.level, seed: level.seed, b: level.b, h: level.h,
    bretter: level.bretter, schrauben: level.schrauben, kisten: level.kisten, aktiv: level.aktiv,
    plaetze: level.plaetze, loesung: level.loesung,
    zuege, vor,
    entfernt: new Array(level.schrauben.length).fill(0), rest,
    fuell: level.kisten.map(() => 0), park: [],
  };
}

/** Einen Zug ohne Verlauf ausführen → { ziel, brettFaellt, zustand } oder null */
function schritt(z, s) {
  if (!kannTippen(z, s)) return null;
  const sc = z.schrauben[s];
  const m = { kisten: z.kisten, aktiv: z.aktiv, plaetze: z.plaetze, fuell: z.fuell.slice(), park: z.park.slice() };
  const ziel = einlegen(m, sc.f);
  const entfernt = z.entfernt.slice();
  entfernt[s] = 1;
  const rest = z.rest.slice();
  rest[sc.br]--;
  return { ziel, brettFaellt: rest[sc.br] === 0, zustand: { ...z, entfernt, rest, fuell: m.fuell, park: m.park } };
}

/**
 * Schraube s drehen. → { zustand, ziel: 'kiste'|'park', brettFaellt, kisteVoll } oder null (nicht erlaubt).
 * Ein neuer Zug leert die Wiederholen-Liste (außer bei `vorBehalten`).
 */
export function tippe(z, s, { vorBehalten = false } = {}) {
  const r = schritt(z, s);
  if (!r) return null;
  const voll = r.zustand.fuell.reduce((n, f) => n + (f >= KISTE ? 1 : 0), 0) - z.fuell.reduce((n, f) => n + (f >= KISTE ? 1 : 0), 0);
  return {
    zustand: { ...r.zustand, zuege: [...z.zuege, s], vor: vorBehalten ? z.vor : [] },
    ziel: r.ziel, brettFaellt: r.brettFaellt, kisteVoll: voll,
  };
}

/** Level von vorn nachspielen → Zustand oder null, wenn ein Zug nicht erlaubt war */
function nachspielen(level, zuege, vor = []) {
  let z = anfang(level);
  for (const s of zuege) {
    const r = schritt(z, s);
    if (!r) return null;
    z = r.zustand;
  }
  return { ...z, zuege: zuege.slice(), vor: vor.slice() };
}

export const kannRueckgaengig = (z) => z.zuege.length > 0;
export const kannWiederholen = (z) => z.vor.length > 0;

export function rueckgaengig(z) {
  if (!z.zuege.length) return null;
  const letzte = z.zuege[z.zuege.length - 1];
  return nachspielen(z, z.zuege.slice(0, -1), [...z.vor, letzte]);
}

export function setzeWieder(z) {
  if (!z.vor.length) return null;
  const r = tippe(z, z.vor[z.vor.length - 1], { vorBehalten: true });
  if (!r) return null;
  return { ...r, zustand: { ...r.zustand, vor: z.vor.slice(0, -1) } };
}

/** Gleiches Level von vorn */
export function neustart(z) { return anfang(z); }

/** Nächste freie Schraube von `von` aus in Richtung (dx, dy) oder -1 */
export function naechsteSchraube(z, von, dx, dy) {
  const a = z.schrauben[von];
  if (!a) return -1;
  const ax = a.i % z.b, ay = Math.floor(a.i / z.b);
  let best = -1, bestKosten = Infinity;
  z.schrauben.forEach((sc, s) => {
    if (s === von || !istFrei(z, s)) return;
    const ddx = (sc.i % z.b) - ax, ddy = Math.floor(sc.i / z.b) - ay;
    const haupt = ddx * dx + ddy * dy;
    if (haupt <= 0) return;
    const quer = Math.abs(dx ? ddy : ddx);
    const kosten = haupt + quer * 2.5;
    if (kosten < bestKosten) { bestKosten = kosten; best = s; }
  });
  return best;
}

/** Freie Schraube, die einer Zelle/Schraube am nächsten liegt (oder -1) */
export function naechsteFreie(z, von) {
  const a = z.schrauben[von];
  let best = -1, bestD = Infinity;
  z.schrauben.forEach((sc, s) => {
    if (!istFrei(z, s)) return;
    const d = a ? Math.hypot((sc.i % z.b) - (a.i % z.b), Math.floor(sc.i / z.b) - Math.floor(a.i / z.b)) : s;
    if (d < bestD) { bestD = d; best = s; }
  });
  return best;
}

// ---------------------------------------------------------------------------------------------
// Löser (Tiefensuche mit Gedächtnis, Schritt-Budget)

function schluessel(z) {
  return `${z.entfernt.join('')}|${z.fuell.join('')}|${z.park.slice().sort().join('')}`;
}

/** Der Lösungsreihenfolge des Levels folgen (jeweils die erste noch erlaubte Schraube) */
function folgeLoesung(z) {
  let st = z;
  const weg = [];
  while (!gewonnen(st)) {
    let gefunden = false;
    for (const s of z.loesung) {
      if (st.entfernt[s]) continue;
      const r = schritt(st, s);
      if (r) { st = r.zustand; weg.push(s); gefunden = true; break; }
    }
    if (!gefunden) return null;
  }
  return weg;
}

/**
 * Sucht einen Weg zum Sieg.
 * → { loesung: [Schrauben] | null, vollstaendig, knoten }; `vollstaendig` = ganz durchsucht (null heißt dann: unlösbar)
 */
export function loese(z, { budget = 60000 } = {}) {
  if (gewonnen(z)) return { loesung: [], vollstaendig: true, knoten: 0 };
  const schnell = folgeLoesung(z);
  if (schnell) return { loesung: schnell, vollstaendig: true, knoten: 0 };
  const pos = new Map(z.loesung.map((s, i) => [s, i]));
  const gesehen = new Set();
  const pfad = [];
  let knoten = 0;
  let abgebrochen = false;

  function suche(st) {
    if (gewonnen(st)) return true;
    if (++knoten > budget) { abgebrochen = true; return false; }
    const key = schluessel(st);
    if (gesehen.has(key)) return false;
    gesehen.add(key);
    const zuege = [];
    for (let s = 0; s < st.schrauben.length; s++) {
      if (!kannTippen(st, s)) continue;
      zuege.push({ s, direkt: findeKiste(st, st.schrauben[s].f) >= 0 ? 0 : 1, p: pos.get(s) ?? 999 });
    }
    zuege.sort((a, b) => a.direkt - b.direkt || a.p - b.p || a.s - b.s);
    for (const m of zuege) {
      const r = schritt(st, m.s);
      pfad.push(m.s);
      if (suche(r.zustand)) return true;
      pfad.pop();
      if (abgebrochen) return false;
    }
    return false;
  }

  const ok = suche(z);
  return { loesung: ok ? pfad.slice() : null, vollstaendig: ok || !abgebrochen, knoten };
}

/**
 * Hinweis für den aktuellen Stand:
 * { typ: 'fertig' } | { typ: 'zug', schraube } | { typ: 'unsicher', schraube } | { typ: 'zurueck', n }
 */
export function hinweis(z, { budget = 60000 } = {}) {
  if (gewonnen(z)) return { typ: 'fertig' };
  const r = loese(z, { budget });
  if (r.loesung && r.loesung.length) return { typ: 'zug', schraube: r.loesung[0] };
  if (r.vollstaendig) {
    // Wie viele Züge zurück, bis der Stand wieder lösbar ist?
    for (let n = 1; n <= z.zuege.length; n++) {
      const frueher = nachspielen(z, z.zuege.slice(0, z.zuege.length - n));
      if (!frueher) continue;
      const q = loese(frueher, { budget: Math.max(2000, budget >> 2) });
      if (q.loesung) return { typ: 'zurueck', n };
    }
    return { typ: 'zurueck', n: z.zuege.length };
  }
  // Budget erschöpft: Vorschlag ohne Gewähr (bevorzugt Schrauben, die direkt in eine Kiste gehen)
  const legal = legaleZuege(z);
  if (!legal.length) return { typ: 'zurueck', n: Math.min(1, z.zuege.length) };
  const direkt = legal.filter((s) => findeKiste(z, z.schrauben[s].f) >= 0);
  return { typ: 'unsicher', schraube: (direkt.length ? direkt : legal)[0] };
}

// ---------------------------------------------------------------------------------------------
// Generator

const nachbar = (a, b, breite) => {
  const dx = Math.abs((a % breite) - (b % breite));
  const dy = Math.abs(Math.floor(a / breite) - Math.floor(b / breite));
  return dx + dy === 1;
};

/** Bretter + Schrauben platzieren (ohne Farben) → { bretter, schrauben } oder null */
function layout(R, st, anzahl) {
  const { b, h } = st;
  const schichten = Math.max(1, Math.min(st.schichten, anzahl));
  const bretter = [];
  const belegt = Array.from({ length: schichten }, () => new Set());   // Zellen je Schicht
  const darunter = [];                                                 // Zellen aller tieferen Schichten

  for (let i = 0; i < anzahl; i++) {
    const l = Math.floor((i * schichten) / anzahl);
    const tiefer = new Set();
    for (let k = 0; k < l; k++) for (const c of belegt[k]) tiefer.add(c);
    darunter[i] = tiefer;
    let zellen = null;
    for (let t = 0; t < 90 && !zellen; t++) {
      const w = R.ganz(1, Math.min(4, b));
      const hh = R.ganz(1, Math.min(3, h));
      if (w * hh < 2) continue;
      const x = R.ganz(0, b - w);
      const y = R.ganz(0, h - hh);
      let z = [];
      for (let yy = 0; yy < hh; yy++) for (let xx = 0; xx < w; xx++) z.push((y + yy) * b + x + xx);
      if (w >= 2 && hh >= 2 && w * hh >= 5 && R.zahl() < 0.35) {
        const ecke = R.wahl([y * b + x, y * b + x + w - 1, (y + hh - 1) * b + x, (y + hh - 1) * b + x + w - 1]);
        z = z.filter((c) => c !== ecke);
      }
      if (z.some((c) => belegt[l].has(c))) continue;
      if (l > 0 && t < 60 && !z.some((c) => tiefer.has(c))) continue;   // soll etwas überdecken
      zellen = z;
    }
    if (!zellen) return null;
    zellen.forEach((c) => belegt[l].add(c));
    bretter.push({ l, z: zellen.slice().sort((p, q) => p - q) });
  }

  // Zellen, die von höheren Schichten überdeckt werden (je Brett)
  const gedeckt = bretter.map((br) => {
    const s = new Set();
    for (const o of bretter) if (o.l > br.l) for (const c of o.z) s.add(c);
    return s;
  });

  const benutzt = new Set();
  const proBrett = bretter.map(() => []);
  const nah = (c, eigene) => eigene.some((g) => nachbar(g, c, b)) || [...benutzt].some((g) => nachbar(g, c, b));
  function waehle(bi, k) {
    const br = bretter[bi];
    const eigene = proBrett[bi];
    const frei = br.z.filter((c) => !benutzt.has(c) && !eigene.includes(c));
    const dichtGedeckt = R.mische(frei.filter((c) => gedeckt[bi].has(c)));
    const offen = R.mische(frei.filter((c) => !gedeckt[bi].has(c)));
    const nimm = (liste, max, streng) => {
      for (const c of liste) {
        if (eigene.length >= max) break;
        if (eigene.includes(c) || (streng && nah(c, eigene))) continue;
        eigene.push(c);
        benutzt.add(c);
      }
    };
    nimm(dichtGedeckt, Math.ceil(k / 2), true);
    nimm(offen, k, true);
    nimm(dichtGedeckt, k, true);
    nimm([...dichtGedeckt, ...offen], k, false);
  }

  for (let bi = 0; bi < anzahl; bi++) {
    const k = R.ganz(st.schrauben[0], Math.min(st.schrauben[1], bretter[bi].z.length));
    waehle(bi, k);
    if (proBrett[bi].length < 2) return null;
  }

  // Gesamtzahl auf ein Vielfaches von 3 bringen
  for (let versuch = 0; versuch < 20 && proBrett.reduce((n, p) => n + p.length, 0) % KISTE; versuch++) {
    const mehr = R.zahl() < 0.5;
    const kand = [];
    proBrett.forEach((p, bi) => {
      if (mehr ? p.length < 4 && bretter[bi].z.some((c) => !benutzt.has(c)) : p.length > 2) kand.push(bi);
    });
    if (!kand.length) continue;
    const bi = R.wahl(kand);
    if (mehr) waehle(bi, proBrett[bi].length + 1);
    else benutzt.delete(proBrett[bi].splice(R.ganz(0, proBrett[bi].length - 1), 1)[0]);
  }
  const summe = proBrett.reduce((n, p) => n + p.length, 0);
  if (summe % KISTE || summe < KISTE || summe > MAX_SCHRAUBEN) return null;

  const schrauben = [];
  proBrett.forEach((p, bi) => p.slice().sort((x, y) => x - y).forEach((c) => schrauben.push({ i: c, f: -1, br: bi })));
  return { bretter, schrauben };
}

/** Farben, Kistenschlange und Lösungsreihenfolge vergeben → Level oder null */
function faerbe(R, st, lay, parken) {
  const { bretter, schrauben } = lay;
  const N = schrauben.length;
  const basis = anfang({ bretter, schrauben, kisten: [], aktiv: st.aktiv, plaetze: st.plaetze, loesung: [], stufe: '', level: 1, seed: '', b: st.b, h: st.h });
  // Entfernungsreihenfolge: zufällig freie Schrauben abtragen
  let z = { ...basis };
  const ordnung = [];
  for (let n = 0; n < N; n++) {
    const frei = [];
    for (let s = 0; s < N; s++) if (istFrei(z, s)) frei.push(s);
    const s = R.wahl(frei);
    ordnung.push(s);
    const entfernt = z.entfernt.slice(); entfernt[s] = 1;
    const rest = z.rest.slice(); rest[schrauben[s].br]--;
    z = { ...z, entfernt, rest };
  }
  // Am Anfang sollen mehrere Schrauben frei sein
  let frei0 = 0;
  for (let s = 0; s < N; s++) if (istFrei(basis, s)) frei0++;
  if (frei0 < Math.min(3, N)) return null;

  // Kistenschlange
  const nKisten = N / KISTE;
  const k = Math.min(R.ganz(st.farben[0], st.farben[1]), nKisten);
  const ids = R.mische(Array.from({ length: MAX_FARBE }, (_, i) => i)).slice(0, k);
  const liste = ids.slice();
  while (liste.length < nKisten) liste.push(R.wahl(ids));
  const kisten = R.mische(liste);
  const quota = new Map(ids.map((id) => [id, kisten.filter((c) => c === id).length * KISTE]));

  const m = { kisten, aktiv: st.aktiv, plaetze: st.plaetze, fuell: kisten.map(() => 0), park: [] };
  const farbe = new Array(N).fill(-1);
  for (const s of ordnung) {
    const mitPlatz = [];
    for (const kk of aktiveKisten(m)) if (!mitPlatz.includes(kisten[kk])) mitPlatz.push(kisten[kk]);
    let c = -1;
    if (parken > 0 && m.park.length < m.plaetze && R.zahl() < parken) {
      const B = ids.filter((id) => quota.get(id) > 0 && !mitPlatz.includes(id));
      if (B.length) c = R.wahl(B);
    }
    if (c < 0) {
      const A = mitPlatz.filter((id) => quota.get(id) > 0);
      if (!A.length) return null;
      c = R.wahl(A);
    }
    quota.set(c, quota.get(c) - 1);
    farbe[s] = c;
    if (!einlegen(m, c)) return null;
  }
  if (m.park.length || m.fuell.some((f) => f !== KISTE)) return null;

  return {
    bretter,
    schrauben: schrauben.map((sc, s) => ({ i: sc.i, f: farbe[s], br: sc.br })),
    kisten, loesung: ordnung,
  };
}

/**
 * Erzeugt ein garantiert lösbares Level (deterministisch aus Seed, Stufe und Level-Nummer).
 * Versuche statt Zeit: bleibt ein Versuch erfolglos, folgt ein weiterer mit abgewandeltem Seed.
 */
export function erzeugeLevel({ stufe = 'leicht', level = 1, seed = 'x' } = {}) {
  const sid = Object.hasOwn(STUFEN, stufe) ? stufe : 'leicht';
  const st = STUFEN[sid];
  for (let versuch = 0; versuch < 400; versuch++) {
    const R = erstelleZufall(`${seed}|${sid}|${level}|${versuch}`);
    const anzahl = Math.max(2, st.bretter - Math.floor(versuch / 100));
    const lay = layout(R, st, anzahl);
    if (!lay) continue;
    const f = faerbe(R, st, lay, versuch < 150 ? st.parken : 0);
    if (!f) continue;
    const z = anfang({
      stufe: sid, level, seed: String(seed), b: st.b, h: st.h, bretter: f.bretter, schrauben: f.schrauben,
      kisten: f.kisten, aktiv: st.aktiv, plaetze: st.plaetze, loesung: f.loesung,
    });
    return z;
  }
  throw new Error('Level konnte nicht erzeugt werden');
}

// ---------------------------------------------------------------------------------------------
// Speichern / Laden (Spielstand gilt als nicht vertrauenswürdig)

/** JSON-taugliche Kopie (ohne abgeleitete Felder) */
export function zumSpeichern(z) {
  return JSON.parse(JSON.stringify({
    v: 1, stufe: z.stufe, level: z.level, seed: z.seed, b: z.b, h: z.h,
    bretter: z.bretter, schrauben: z.schrauben, kisten: z.kisten, aktiv: z.aktiv, plaetze: z.plaetze,
    loesung: z.loesung, zuege: z.zuege, vor: z.vor,
  }));
}

const istListe = (a, max) => Array.isArray(a) && a.length <= max;

/** Streng prüfen und Zustand aufbauen → Zustand oder null */
export function ausSpeicher(d) {
  try {
    if (!d || typeof d !== 'object' || Array.isArray(d) || d.v !== 1) return null;
    if (typeof d.stufe !== 'string' || !Object.hasOwn(STUFEN, d.stufe)) return null;
    if (!istGanz(d.level, 1, 999999) || typeof d.seed !== 'string' || d.seed.length > 64) return null;
    if (!istGanz(d.b, 2, 12) || !istGanz(d.h, 2, 12)) return null;
    const zellen = d.b * d.h;
    if (!istListe(d.bretter, MAX_BRETTER) || d.bretter.length < 1) return null;
    const bretter = [];
    const schicht = new Map();   // Schicht → belegte Zellen
    for (const br of d.bretter) {
      if (!br || typeof br !== 'object' || !istGanz(br.l, 0, 11) || !istListe(br.z, zellen) || br.z.length < 1) return null;
      const menge = new Set();
      for (const c of br.z) {
        if (!istGanz(c, 0, zellen - 1) || menge.has(c)) return null;
        menge.add(c);
      }
      const bel = schicht.get(br.l) ?? new Set();
      for (const c of menge) { if (bel.has(c)) return null; bel.add(c); }
      schicht.set(br.l, bel);
      bretter.push({ l: br.l, z: br.z.slice() });
    }
    if (!istListe(d.schrauben, MAX_SCHRAUBEN) || d.schrauben.length < 1) return null;
    const schrauben = [];
    const orte = new Set();
    const proBrett = new Array(bretter.length).fill(0);
    for (const sc of d.schrauben) {
      if (!sc || typeof sc !== 'object' || !istGanz(sc.i, 0, zellen - 1) || !istGanz(sc.f, 0, MAX_FARBE - 1)
        || !istGanz(sc.br, 0, bretter.length - 1)) return null;
      if (orte.has(sc.i) || !bretter[sc.br].z.includes(sc.i)) return null;
      orte.add(sc.i);
      proBrett[sc.br]++;
      schrauben.push({ i: sc.i, f: sc.f, br: sc.br });
    }
    if (proBrett.some((n) => n < 1)) return null;
    if (!istListe(d.kisten, MAX_SCHRAUBEN) || d.kisten.some((f) => !istGanz(f, 0, MAX_FARBE - 1))) return null;
    const proFarbe = new Array(MAX_FARBE).fill(0);
    const kapazitaet = new Array(MAX_FARBE).fill(0);
    for (const sc of schrauben) proFarbe[sc.f]++;
    for (const f of d.kisten) kapazitaet[f] += KISTE;
    if (proFarbe.some((n, f) => n !== kapazitaet[f])) return null;
    if (!istGanz(d.aktiv, 1, 6) || !istGanz(d.plaetze, 1, 8)) return null;
    const N = schrauben.length;
    const listeGanz = (a, max) => istListe(a, max) && a.every((s) => istGanz(s, 0, N - 1));
    if (!listeGanz(d.loesung, N) || !listeGanz(d.zuege, MAX_ZUEGE) || !listeGanz(d.vor, MAX_ZUEGE)) return null;

    const level = {
      stufe: d.stufe, level: d.level, seed: d.seed, b: d.b, h: d.h, bretter, schrauben,
      kisten: d.kisten.slice(), aktiv: d.aktiv, plaetze: d.plaetze, loesung: d.loesung.slice(),
    };
    // Die Lösungsreihenfolge muss das Level wirklich gewinnen (belegt die Lösbarkeit)
    const probe = nachspielen(level, level.loesung);
    if (!probe || !gewonnen(probe)) return null;
    return nachspielen(level, d.zuege, d.vor);
  } catch {
    return null;
  }
}

export const istGueltig = (d) => ausSpeicher(d) !== null;

/** Zustand aus Leveldaten (ohne Prüfung; für Tests und den Generator) */
export const ausLevel = (level) => anfang(level);
