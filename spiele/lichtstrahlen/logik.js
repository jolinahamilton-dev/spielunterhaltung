// Lichtstrahlen – Logik ohne DOM (rein, testbar).
// Feld i = Zeile * n + Spalte · Richtung d: 0 oben, 1 rechts, 2 unten, 3 links · Spiegel o: 0 = "/", 1 = "\"
import { erstelleZufall } from '../../kern/zufall.js';

export const STUFEN = Object.freeze({
  leicht: { id: 'leicht', name: 'Leicht', n: 5, quellen: [1, 1], spiegel: [2, 3], fest: [0, 0], filter: [0, 0], bloecke: [2, 3], minFalsch: 2 },
  mittel: { id: 'mittel', name: 'Mittel', n: 7, quellen: [2, 3], spiegel: [4, 6], fest: [0, 1], filter: [0, 0], bloecke: [3, 5], minFalsch: 3 },
  schwer: { id: 'schwer', name: 'Schwer', n: 9, quellen: [3, 4], spiegel: [7, 9], fest: [1, 2], filter: [1, 2], bloecke: [5, 8], minFalsch: 4 },
});
export const STUFEN_IDS = Object.freeze(Object.keys(STUFEN));

export const DR = [-1, 0, 1, 0];
export const DC = [0, 1, 0, -1];
/** Ablenkung: SPIEGEL[o][d] = neue Richtung */
export const SPIEGEL = [[1, 0, 3, 2], [3, 2, 1, 0]];
export const FARBEN = 10;                 // Anzahl der Spielfarben (ctx.farben)
export const MAX_ZUEGE = 5000;
const VERSUCHE = 400;                     // Schritt-Budget des Generators (Versuche, keine Zeit)

// ---------------------------------------------------------------------------------------------
// Strahlen

/** Raster der festen Elemente und Spiegel (Zellen: null oder Beschreibung) */
export function raster(z, orient = null) {
  const g = new Array(z.n * z.n).fill(null);
  for (const i of z.bloecke) g[i] = { t: 'b' };
  z.quellen.forEach((q, k) => { g[q.i] = { t: 'q', k }; });
  z.ziele.forEach((q, k) => { g[q.i] = { t: 'z', k, f: q.f }; });
  for (const q of z.filter) g[q.i] = { t: 'f', f: q.f };
  for (const q of z.fest) g[q.i] = { t: 'm', o: q.o, fest: true };
  z.spiegel.forEach((q, k) => { g[q.i] = { t: 'm', o: orient ? orient[k] : q.o, k }; });
  return g;
}

/**
 * Verlauf eines Strahls. Ergebnis: { segs: [{ f, pts: [[x, y]…] }], ende, ziel, f }
 * Koordinaten in Zellen (Mittelpunkt = Spalte + 0,5 / Zeile + 0,5). ende: 'aus' | 'block' | 'quelle' | 'ziel' | 'schleife'
 */
export function strahl(n, g, q) {
  let r = Math.floor(q.i / n), c = q.i % n, d = q.d, f = q.f;
  let seg = { f, pts: [[c + 0.5, r + 0.5]] };
  const segs = [seg];
  const gesehen = new Set();
  let ende = 'aus', ziel = -1;
  for (let schritt = 0; schritt <= n * n * 4 + 4; schritt++) {
    const nr = r + DR[d], nc = c + DC[d];
    if (nr < 0 || nc < 0 || nr >= n || nc >= n) {
      seg.pts.push([c + 0.5 + DC[d] * 0.5, r + 0.5 + DR[d] * 0.5]);
      ende = 'aus';
      break;
    }
    r = nr; c = nc;
    seg.pts.push([c + 0.5, r + 0.5]);
    const zelle = g[r * n + c];
    if (zelle) {
      if (zelle.t === 'b') { ende = 'block'; break; }
      if (zelle.t === 'q') { ende = 'quelle'; break; }
      if (zelle.t === 'z') { ende = 'ziel'; ziel = zelle.k; break; }
      if (zelle.t === 'm') d = SPIEGEL[zelle.o][d];
      else if (zelle.t === 'f') {
        f = zelle.f;
        seg = { f, pts: [[c + 0.5, r + 0.5]] };
        segs.push(seg);
      }
    }
    const schluessel = (r * n + c) * 4 + d;
    if (gesehen.has(schluessel)) { ende = 'schleife'; break; }
    gesehen.add(schluessel);
  }
  return { segs, ende, ziel, f };
}

/** Alle Strahlen + Trefferstand der Ziele. orient (optional): Spiegelstellungen statt der aktuellen. */
export function berechne(z, orient = null) {
  const g = raster(z, orient);
  const strahlen = z.quellen.map((q) => strahl(z.n, g, q));
  const treffer = z.ziele.map(() => ({ richtig: false, falsch: false }));
  for (const s of strahlen) {
    if (s.ziel < 0) continue;
    if (s.f === z.ziele[s.ziel].f) treffer[s.ziel].richtig = true;
    else treffer[s.ziel].falsch = true;
  }
  const erfuellt = treffer.filter((t) => t.richtig).length;
  return { strahlen, treffer, erfuellt, gewonnen: z.ziele.length > 0 && erfuellt === z.ziele.length };
}

export const gewonnen = (z) => berechne(z).gewonnen;

// ---------------------------------------------------------------------------------------------
// Züge

/** Spiegel k umschalten (Zug) → neuer Zustand */
export function dreh(z, k) {
  if (!Number.isInteger(k) || k < 0 || k >= z.spiegel.length) return null;
  let spiegel = z.spiegel.map((m, j) => (j === k ? { ...m, o: 1 - m.o } : m));
  let zuege = [...z.zuege, k];
  if (zuege.length > MAX_ZUEGE) {
    // ältesten Zug in den Startstand einrechnen, damit o = o0 + Züge gültig bleibt
    const alt = zuege[0];
    zuege = zuege.slice(1);
    spiegel = spiegel.map((m, j) => (j === alt ? { ...m, o0: 1 - m.o0 } : m));
  }
  return { ...z, spiegel, zuege, vor: [] };
}

export const kannRueckgaengig = (z) => z.zuege.length > 0;
export const kannWiederholen = (z) => z.vor.length > 0;

export function rueckgaengig(z) {
  if (!z.zuege.length) return null;
  const k = z.zuege[z.zuege.length - 1];
  const spiegel = z.spiegel.map((m, j) => (j === k ? { ...m, o: 1 - m.o } : m));
  return { ...z, spiegel, zuege: z.zuege.slice(0, -1), vor: [...z.vor, k] };
}

export function wiederholen(z) {
  if (!z.vor.length) return null;
  const k = z.vor[z.vor.length - 1];
  const spiegel = z.spiegel.map((m, j) => (j === k ? { ...m, o: 1 - m.o } : m));
  return { ...z, spiegel, zuege: [...z.zuege, k], vor: z.vor.slice(0, -1) };
}

export function neustart(z) {
  return { ...z, spiegel: z.spiegel.map((m) => ({ ...m, o: m.o0 })), zuege: [], vor: [] };
}

/** Hinweis: ein Spiegel, der anders steht als in der gespeicherten Lösung → { k, i } oder null */
export function hinweis(z) {
  const b = berechne(z);
  if (b.gewonnen) return null;
  const falsch = z.spiegel.map((m, k) => (m.o !== m.l ? k : -1)).filter((k) => k >= 0);
  if (!falsch.length) return null;
  const offen = falsch.filter((k) => !b.treffer[z.spiegel[k].q]?.richtig);
  const k = (offen.length ? offen : falsch)[0];
  return { k, i: z.spiegel[k].i };
}

// ---------------------------------------------------------------------------------------------
// Generator

const bitFuer = (d) => (d % 2 === 1 ? 1 : 2);     // waagerecht 1, senkrecht 2

/** Lösungs-Layout bauen (null = Versuch gescheitert) */
function baueLayout(rng, S) {
  const n = S.n;
  const belegt = new Array(n * n).fill(null);   // null | { t: 'q'|'z'|'m'|'f' } | { t: 'p', achsen }
  const L = { n, quellen: [], ziele: [], bloecke: [], filter: [], fest: [], spiegel: [] };
  const nq = rng.ganz(S.quellen[0], S.quellen[1]);
  const rotGes = rng.ganz(S.spiegel[0], S.spiegel[1]);
  const festGes = rng.ganz(S.fest[0], S.fest[1]);
  const filGes = rng.ganz(S.filter[0], S.filter[1]);
  const rot = new Array(nq).fill(0), fest = new Array(nq).fill(0), fil = new Array(nq).fill(0);
  for (let j = 0; j < rotGes; j++) rot[j < nq ? j : rng.ganz(0, nq - 1)]++;
  for (let j = 0; j < festGes; j++) fest[rng.ganz(0, nq - 1)]++;
  for (let j = 0; j < filGes; j++) fil[rng.ganz(0, nq - 1)]++;
  const farben = rng.mische(Array.from({ length: FARBEN }, (_, j) => j));

  /** Felder voraus (ab Position r,c in Richtung d), solange frei oder kreuzbar */
  const strahlVoraus = (r, c, d) => {
    const feld = [];
    for (;;) {
      r += DR[d]; c += DC[d];
      if (r < 0 || c < 0 || r >= n || c >= n) break;
      const b = belegt[r * n + c];
      if (b === null) feld.push(r * n + c);
      else if (b.t === 'p' && !(b.achsen & bitFuer(d))) feld.push(r * n + c);
      else break;
    }
    return feld;
  };
  const passiert = (i, d) => { if (belegt[i]) belegt[i].achsen |= bitFuer(d); else belegt[i] = { t: 'p', achsen: bitFuer(d) }; };
  /** Weg bis zum Feld an Index idx des Strahls ziehen (davor: Wegfelder) → Position */
  const gehBis = (feld, idx, d) => { for (let j = 0; j < idx; j++) passiert(feld[j], d); return feld[idx]; };

  for (let k = 0; k < nq; k++) {
    // Startfeld am Rand, nach innen gerichtet
    const kandidaten = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (r > 0 && c > 0 && r < n - 1 && c < n - 1) continue;
      for (let d = 0; d < 4; d++) {
        if (belegt[r * n + c] !== null) continue;
        const vr = r - DR[d], vc = c - DC[d];                        // Rückseite muss außerhalb liegen
        if (vr >= 0 && vc >= 0 && vr < n && vc < n) continue;
        if (strahlVoraus(r, c, d).length < 2) continue;
        kandidaten.push({ r, c, d });
      }
    }
    if (!kandidaten.length) return null;
    const st = rng.wahl(kandidaten);
    let { r, c, d } = st;
    let f = farben[k % farben.length];
    belegt[r * n + c] = { t: 'q' };
    L.quellen.push({ i: r * n + c, d, f });

    const ereignisse = rng.mische([
      ...new Array(rot[k]).fill('s'), ...new Array(fest[k]).fill('x'), ...new Array(fil[k]).fill('f'),
    ]);
    for (const ev of ereignisse) {
      const feld = strahlVoraus(r, c, d);
      const frei = feld.map((i, idx) => (belegt[i] === null ? idx : -1)).filter((idx) => idx >= 0);
      if (!frei.length) return null;
      // eher kurze Strecken bevorzugen, aber auch weite zulassen
      const grenze = Math.min(frei.length - 1, rng.ganz(1, n - 2));
      const idx = frei[rng.ganz(0, Math.min(frei.length - 1, grenze))];
      const i = gehBis(feld, idx, d);
      r = Math.floor(i / n); c = i % n;
      if (ev === 'f') {
        const andere = farben.filter((x) => x !== f);
        f = rng.wahl(andere);
        belegt[i] = { t: 'f' };
        L.filter.push({ i, f });
        if (!strahlVoraus(r, c, d).length) return null;
      } else {
        let gewaehlt = -1;
        for (const o of rng.mische([0, 1])) {
          const d2 = SPIEGEL[o][d];
          if (strahlVoraus(r, c, d2).length) { gewaehlt = o; break; }
        }
        if (gewaehlt < 0) return null;
        belegt[i] = { t: 'm' };
        if (ev === 's') L.spiegel.push({ i, l: gewaehlt, q: k });
        else L.fest.push({ i, o: gewaehlt });
        d = SPIEGEL[gewaehlt][d];
      }
    }
    // Ziel am Ende des Weges
    const feld = strahlVoraus(r, c, d);
    const frei = feld.map((i, idx) => (belegt[i] === null ? idx : -1)).filter((idx) => idx >= 0);
    if (!frei.length) return null;
    const idx = frei[rng.ganz(Math.floor((frei.length - 1) / 2), frei.length - 1)];
    const i = gehBis(feld, idx, d);
    belegt[i] = { t: 'z' };
    L.ziele.push({ i, f });
  }
  // Hindernisse nur abseits aller Wege
  const leer = rng.mische(belegt.map((b, i) => (b === null ? i : -1)).filter((i) => i >= 0));
  const anzahl = Math.min(rng.ganz(S.bloecke[0], S.bloecke[1]), leer.length);
  L.bloecke = leer.slice(0, anzahl);
  return L;
}

function zustandAus(L, stufe, level, seed, orient, start) {
  return {
    v: 1, stufe, level, seed, n: L.n,
    quellen: L.quellen.map((q) => ({ ...q })), ziele: L.ziele.map((q) => ({ ...q })),
    bloecke: L.bloecke.slice(), filter: L.filter.map((q) => ({ ...q })), fest: L.fest.map((q) => ({ ...q })),
    spiegel: L.spiegel.map((m, k) => ({ i: m.i, o: start[k], o0: start[k], l: orient[k], q: m.q })),
    zuege: [], vor: [],
  };
}

/** Spiegel verdrehen, bis der Start sicher nicht gelöst ist (null = geht nicht) */
function verdrehe(rng, L, S, stufe, level, seed) {
  const loesung = L.spiegel.map((m) => m.l);
  const M = loesung.length;
  const z0 = zustandAus(L, stufe, level, seed, loesung, loesung);
  const b0 = berechne(z0);
  if (!b0.gewonnen || b0.strahlen.some((s) => s.ende !== 'ziel')) return null;
  const reihe = rng.mische(loesung.map((_, k) => k));
  const start = loesung.slice();
  const mindest = Math.min(S.minFalsch, M);
  const anzahl = rng.ganz(mindest, M);
  for (let j = 0; j < anzahl; j++) start[reihe[j]] = 1 - start[reihe[j]];
  let z = zustandAus(L, stufe, level, seed, loesung, start);
  for (let j = anzahl; berechne(z).gewonnen && j < M; j++) {
    start[reihe[j]] = 1 - start[reihe[j]];
    z = zustandAus(L, stufe, level, seed, loesung, start);
  }
  return berechne(z).gewonnen ? null : z;
}

/** Festes, bewiesen lösbares Mini-Layout (letzter Ausweg) */
function notLevel(S, stufe, level, seed) {
  const n = S.n;
  const L = {
    n,
    quellen: [{ i: 0, d: 1, f: 0 }], ziele: [{ i: 2 * n, f: 0 }],
    bloecke: [n + 1], filter: [], fest: [],
    spiegel: [{ i: n - 1, l: 1, q: 0 }, { i: 2 * n + n - 1, l: 0, q: 0 }],
  };
  return zustandAus(L, stufe, level, seed, [1, 0], [0, 1]);
}

/** Level erzeugen: { stufe, level, seed } → Zustand (komplett, JSON-tauglich). Gleicher Seed → gleiches Level. */
export function erzeugeLevel({ stufe = 'leicht', level = 1, seed = 'start' } = {}) {
  const sid = STUFEN[stufe] ? stufe : 'leicht';
  const S = STUFEN[sid];
  seed = String(seed);
  for (let v = 0; v < VERSUCHE; v++) {
    const rng = erstelleZufall(`${seed}|${sid}|${v}`);
    const L = baueLayout(rng, S);
    if (!L) continue;
    const z = verdrehe(rng, L, S, sid, level, seed);
    if (z) return z;
  }
  return notLevel(S, sid, level, seed);
}

// ---------------------------------------------------------------------------------------------
// Spielstand

export function zumSpeichern(z) {
  return JSON.parse(JSON.stringify(z));
}

const istInt = (x, a, b) => Number.isInteger(x) && x >= a && x <= b;
const istListe = (x, max) => Array.isArray(x) && x.length <= max;
const eigene = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);

/** Gespeicherten Stand streng prüfen → bereinigte Kopie oder null */
export function ausSpeicher(s) {
  try {
    if (!eigene(s) || s.v !== 1) return null;
    const S = STUFEN[s.stufe];
    if (typeof s.stufe !== 'string' || !Object.hasOwn(STUFEN, s.stufe) || s.n !== S.n) return null;
    if (!istInt(s.level, 1, 1e6) || typeof s.seed !== 'string' || s.seed.length > 64) return null;
    const N = s.n * s.n;
    const belegt = new Set();
    const platz = (i) => {
      if (!istInt(i, 0, N - 1) || belegt.has(i)) return false;
      belegt.add(i);
      return true;
    };
    if (!istListe(s.quellen, 6) || s.quellen.length < 1) return null;
    const quellen = [];
    for (const q of s.quellen) {
      if (!eigene(q) || !platz(q.i) || !istInt(q.d, 0, 3) || !istInt(q.f, 0, FARBEN - 1)) return null;
      quellen.push({ i: q.i, d: q.d, f: q.f });
    }
    if (!istListe(s.ziele, 6) || s.ziele.length !== quellen.length) return null;
    const ziele = [];
    for (const q of s.ziele) {
      if (!eigene(q) || !platz(q.i) || !istInt(q.f, 0, FARBEN - 1)) return null;
      ziele.push({ i: q.i, f: q.f });
    }
    if (!istListe(s.bloecke, N)) return null;
    const bloecke = [];
    for (const i of s.bloecke) { if (!platz(i)) return null; bloecke.push(i); }
    if (!istListe(s.filter, 8)) return null;
    const filter = [];
    for (const q of s.filter) {
      if (!eigene(q) || !platz(q.i) || !istInt(q.f, 0, FARBEN - 1)) return null;
      filter.push({ i: q.i, f: q.f });
    }
    if (!istListe(s.fest, 12)) return null;
    const fest = [];
    for (const q of s.fest) {
      if (!eigene(q) || !platz(q.i) || !istInt(q.o, 0, 1)) return null;
      fest.push({ i: q.i, o: q.o });
    }
    if (!istListe(s.spiegel, 30) || s.spiegel.length < 1) return null;
    const spiegel = [];
    for (const m of s.spiegel) {
      if (!eigene(m) || !platz(m.i) || !istInt(m.o, 0, 1) || !istInt(m.o0, 0, 1) || !istInt(m.l, 0, 1)
        || !istInt(m.q, 0, quellen.length - 1)) return null;
      spiegel.push({ i: m.i, o: m.o, o0: m.o0, l: m.l, q: m.q });
    }
    if (!istListe(s.zuege, MAX_ZUEGE) || !istListe(s.vor, MAX_ZUEGE)) return null;
    for (const k of [...s.zuege, ...s.vor]) if (!istInt(k, 0, spiegel.length - 1)) return null;
    // aktuelle Stellung muss aus Start + Zügen folgen
    const stellung = spiegel.map((m) => m.o0);
    for (const k of s.zuege) stellung[k] = 1 - stellung[k];
    if (stellung.some((o, k) => o !== spiegel[k].o)) return null;
    const z = {
      v: 1, stufe: s.stufe, level: s.level, seed: s.seed, n: s.n,
      quellen, ziele, bloecke, filter, fest, spiegel, zuege: s.zuege.slice(), vor: s.vor.slice(),
    };
    // die gespeicherte Lösung muss das Rätsel wirklich lösen
    if (!berechne(z, spiegel.map((m) => m.l)).gewonnen) return null;
    return z;
  } catch {
    return null;
  }
}

export const istGueltig = (s) => ausSpeicher(s) !== null;
