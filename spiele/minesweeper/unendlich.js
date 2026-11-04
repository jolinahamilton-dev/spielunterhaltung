// Minesweeper „Unendlich“ – ohne DOM. Minen hängen nur von Seed und Koordinate ab (Ganzzahl-Hash),
// gespeichert werden nur aufgedeckte/markierte Zellen als Bitmasken je 16×16-Chunk.
import { bytesZuB64, b64ZuBytes, LEER, FLAGGE, FRAGE, AUSGAENGE } from './logik.js';

export const CHUNK = 16;
export const DICHTEN = [0.15, 0.17, 0.2, 0.23];
export const STANDARD_DICHTE = 0.17;
export const MIN_DICHTE = 0.15;
export const GRENZE = 1 << 23;           // |x|, |y| < GRENZE (reicht für jedes Leben)
export const FLUT_BUDGET = 20000;         // Zellen pro Frame
const CACHE_MAX = 4096;                   // Chunks im Minen-/Zahlen-Cache
const VERSATZ = 1 << 20;
const START_RADIUS = 2;                   // |x|,|y| ≤ 2 ist minenfrei → (0,0) ist eine Null

/** Seed-Text → 32 Bit (FNV-1a) */
export function seedZahl(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** 32-Bit-Hash aus Seed und Koordinate (nur Ganzzahl-Operationen → überall gleich) */
export function hash(s, x, y) {
  let h = (s ^ Math.imul(x | 0, 0x9e3779b1) ^ Math.imul(y | 0, 0x85ebca77)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export const schwelleAus = (dichte) => Math.floor(Math.max(MIN_DICHTE, Math.min(0.3, dichte)) * 4294967296);

/** Mine ohne Cache (Referenz für Tests) */
export function istMineRoh(s, schwelle, x, y) {
  if (Math.abs(x) <= START_RADIUS && Math.abs(y) <= START_RADIUS) return false;
  return hash(s, x, y) < schwelle;
}

const schluessel = (cx, cy) => (cx + VERSATZ) * 2097152 + (cy + VERSATZ);
const chunkVon = (v) => Math.floor(v / CHUNK);
const lokal = (v) => v - Math.floor(v / CHUNK) * CHUNK;

export function erstelleWelt({ seed = 'x', dichte = STANDARD_DICHTE, ausgang = 'entspannt' } = {}) {
  const d = DICHTEN.includes(dichte) ? dichte : STANDARD_DICHTE;
  return {
    modus: 'unendlich',
    seed: String(seed),
    s: seedZahl(String(seed)),
    dichte: d,
    schwelle: schwelleAus(d),
    ausgang: AUSGAENGE.includes(ausgang) ? ausgang : 'entspannt',
    daten: new Map(),        // schluessel → { cx, cy, o, f, q, t } (je Uint16Array(16), Bit x in Zeile y)
    minenCache: new Map(),
    zahlenCache: new Map(),
    ausstehend: [],          // Flutfüllung, die noch nicht fertig ist: x, y, x, y, …
    letzteTreffer: [],       // [[x, y]]
    zaehler: { aufgedeckt: 0, treffer: 0, hinweise: 0, ruecknahmen: 0 },
    status: 'laeuft',
  };
}

// ---------- Minen & Zahlen ----------

function chunkMinen(w, cx, cy) {
  const k = schluessel(cx, cy);
  let m = w.minenCache.get(k);
  if (m) return m;
  if (w.minenCache.size >= CACHE_MAX) w.minenCache.clear();
  m = new Uint16Array(CHUNK);
  const x0 = cx * CHUNK, y0 = cy * CHUNK;
  for (let ly = 0; ly < CHUNK; ly++) {
    let zeile = 0;
    for (let lx = 0; lx < CHUNK; lx++) if (istMineRoh(w.s, w.schwelle, x0 + lx, y0 + ly)) zeile |= 1 << lx;
    m[ly] = zeile;
  }
  w.minenCache.set(k, m);
  return m;
}

export function istMine(w, x, y) {
  return (chunkMinen(w, chunkVon(x), chunkVon(y))[lokal(y)] >> lokal(x)) & 1;
}

function chunkZahlen(w, cx, cy) {
  const k = schluessel(cx, cy);
  let z = w.zahlenCache.get(k);
  if (z) return z;
  if (w.zahlenCache.size >= CACHE_MAX) w.zahlenCache.clear();
  z = new Uint8Array(CHUNK * CHUNK);
  const x0 = cx * CHUNK, y0 = cy * CHUNK;
  for (let ly = -1; ly <= CHUNK; ly++) {
    for (let lx = -1; lx <= CHUNK; lx++) {
      if (!istMine(w, x0 + lx, y0 + ly)) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = ly + dy;
        if (ny < 0 || ny >= CHUNK) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = lx + dx;
          if ((dx || dy) && nx >= 0 && nx < CHUNK) z[ny * CHUNK + nx]++;
        }
      }
    }
  }
  w.zahlenCache.set(k, z);
  return z;
}

export function zahl(w, x, y) {
  return chunkZahlen(w, chunkVon(x), chunkVon(y))[lokal(y) * CHUNK + lokal(x)];
}

// ---------- Zustandsbits ----------

function chunk(w, x, y, anlegen) {
  const cx = chunkVon(x), cy = chunkVon(y);
  const k = schluessel(cx, cy);
  let c = w.daten.get(k);
  if (!c && anlegen) {
    c = { cx, cy, o: new Uint16Array(CHUNK), f: new Uint16Array(CHUNK), q: new Uint16Array(CHUNK), t: new Uint16Array(CHUNK) };
    w.daten.set(k, c);
  }
  return c;
}
const bit = (maske, x, y) => (maske[lokal(y)] >> lokal(x)) & 1;
function setzeBit(maske, x, y, v) {
  const ly = lokal(y), b = 1 << lokal(x);
  maske[ly] = v ? maske[ly] | b : maske[ly] & ~b;
}

export function istOffen(w, x, y) { const c = chunk(w, x, y, false); return c ? bit(c.o, x, y) === 1 : false; }
export function istTreffer(w, x, y) { const c = chunk(w, x, y, false); return c ? bit(c.t, x, y) === 1 : false; }
export function marke(w, x, y) {
  const c = chunk(w, x, y, false);
  if (!c) return LEER;
  return bit(c.f, x, y) ? FLAGGE : bit(c.q, x, y) ? FRAGE : LEER;
}
function setzeMarke(w, x, y, m) {
  const c = chunk(w, x, y, true);
  setzeBit(c.f, x, y, m === FLAGGE);
  setzeBit(c.q, x, y, m === FRAGE);
}

/**
 * Zellcode für die Anzeige: 0–8 offene Zahl · 9 verdeckt · 10 Flagge · 11 Fragezeichen · 12 Treffer
 * · 13 Mine (nur nach Spielende sichtbar) · 14 falsche Flagge (nach Spielende)
 */
export function zellCode(w, x, y) {
  const c = chunk(w, x, y, false);
  const ende = w.status === 'verloren';
  if (c) {
    if (bit(c.o, x, y)) return zahl(w, x, y);
    if (bit(c.t, x, y)) return 12;
    if (bit(c.f, x, y)) return ende && !istMine(w, x, y) ? 14 : 10;
    if (ende && istMine(w, x, y)) return 13;
    if (bit(c.q, x, y)) return 11;
    return 9;
  }
  return ende && istMine(w, x, y) ? 13 : 9;
}

export const imFeld = (x, y) => Math.abs(x) < GRENZE && Math.abs(y) < GRENZE;

// ---------- Aktionen ----------

function triff(w, x, y) {
  const c = chunk(w, x, y, true);
  setzeBit(c.t, x, y, 1);
  setzeBit(c.f, x, y, 0);
  setzeBit(c.q, x, y, 0);
  w.zaehler.treffer++;
  w.letzteTreffer.push([x, y]);
  if (w.ausgang === 'hardcore') { w.status = 'verloren'; w.ausstehend = []; }
}

/** Flutfüllung fortsetzen: höchstens `budget` Zellen. Liefert die Zahl geöffneter Zellen. */
export function arbeite(w, budget = FLUT_BUDGET) {
  const st = w.ausstehend;
  let n = 0;
  while (st.length && n < budget) {
    const y = st.pop(), x = st.pop();
    if (!imFeld(x, y)) continue;
    const c = chunk(w, x, y, true);
    if (bit(c.o, x, y) || bit(c.t, x, y) || bit(c.f, x, y)) continue;
    if (istMine(w, x, y)) continue;
    setzeBit(c.o, x, y, 1);
    setzeBit(c.q, x, y, 0);
    w.zaehler.aufgedeckt++;
    n++;
    if (zahl(w, x, y) === 0) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && !istOffen(w, x + dx, y + dy)) st.push(x + dx, y + dy);
      }
    }
  }
  return n;
}

export const flutLaeuft = (w) => w.ausstehend.length > 0;

function deckeEinzeln(w, x, y, erzwingen = false) {
  if (istOffen(w, x, y) || istTreffer(w, x, y)) return;
  const m = marke(w, x, y);
  if (m === FLAGGE && !erzwingen) return;
  if (istMine(w, x, y)) { triff(w, x, y); return; }
  if (m !== LEER) setzeMarke(w, x, y, LEER);
  w.ausstehend.push(x, y);
}

/**
 * Hauptaktion: verdeckt → aufdecken (Flutfüllung läuft mit Budget), Zahl → Chording.
 * @returns {{ fehlAkkord: number[][]|null, treffer: number }}
 */
export function primaer(w, x, y, { erzwingen = false, budget = FLUT_BUDGET } = {}) {
  const erg = { fehlAkkord: null, treffer: 0 };
  if (w.status !== 'laeuft' || !imFeld(x, y)) return erg;
  const vorher = w.zaehler.treffer;
  if (istOffen(w, x, y)) {
    const zl = zahl(w, x, y);
    if (zl === 0) return erg;
    const verdeckt = [];
    let bekannt = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (istOffen(w, nx, ny)) continue;
      if (istTreffer(w, nx, ny) || marke(w, nx, ny) === FLAGGE) bekannt++;
      else verdeckt.push([nx, ny]);
    }
    if (!verdeckt.length) return erg;
    if (bekannt !== zl) { erg.fehlAkkord = verdeckt; return erg; }
    w.letzteTreffer = [];
    for (const [nx, ny] of verdeckt) { if (w.status === 'laeuft') deckeEinzeln(w, nx, ny); }
  } else {
    if (istTreffer(w, x, y) || (marke(w, x, y) === FLAGGE && !erzwingen)) return erg;
    w.letzteTreffer = [];
    deckeEinzeln(w, x, y, erzwingen);
  }
  if (w.status === 'laeuft') arbeite(w, budget);
  erg.treffer = w.zaehler.treffer - vorher;
  return erg;
}

export function wechsleMarke(w, x, y, fragezeichen = false) {
  if (w.status !== 'laeuft' || !imFeld(x, y) || istOffen(w, x, y) || istTreffer(w, x, y)) return false;
  const m = marke(w, x, y);
  setzeMarke(w, x, y, m === LEER ? FLAGGE : m === FLAGGE && fragezeichen ? FRAGE : LEER);
  return true;
}
export function schalteFlagge(w, x, y) {
  if (w.status !== 'laeuft' || !imFeld(x, y) || istOffen(w, x, y) || istTreffer(w, x, y)) return false;
  setzeMarke(w, x, y, marke(w, x, y) === FLAGGE ? LEER : FLAGGE);
  return true;
}
export function schalteFrage(w, x, y) {
  if (w.status !== 'laeuft' || !imFeld(x, y) || istOffen(w, x, y) || istTreffer(w, x, y)) return false;
  setzeMarke(w, x, y, marke(w, x, y) === FRAGE ? LEER : FRAGE);
  return true;
}

export const kannZuruecknehmen = (w) => w.ausgang === 'entspannt' && w.status === 'laeuft' && w.letzteTreffer.length > 0;
export function nimmZurueck(w) {
  if (!kannZuruecknehmen(w)) return false;
  for (const [x, y] of w.letzteTreffer) {
    const c = chunk(w, x, y, true);
    setzeBit(c.t, x, y, 0);
    setzeMarke(w, x, y, FLAGGE);
    w.zaehler.treffer--;
  }
  w.zaehler.ruecknahmen++;
  w.letzteTreffer = [];
  return true;
}

/** Start: (0,0) aufdecken */
export function beginne(w) {
  primaer(w, 0, 0, { budget: Infinity });
}

/** Ausschnitt für den Löser: Fenster x0..x0+b-1, y0..y0+h-1 */
export function ausschnitt(w, x0, y0, b, h) {
  const n = b * h;
  const offen = new Uint8Array(n), zahlen = new Uint8Array(n), mine = new Uint8Array(n), nutzbar = new Uint8Array(n);
  let offeneZellen = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < b; x++) {
    const i = y * b + x, gx = x0 + x, gy = y0 + y;
    if (istOffen(w, gx, gy)) {
      offen[i] = 1;
      zahlen[i] = zahl(w, gx, gy);
      offeneZellen++;
      // Zahlen am Fensterrand haben Nachbarn außerhalb → nicht als Bedingung nutzen
      nutzbar[i] = x > 0 && y > 0 && x < b - 1 && y < h - 1 ? 1 : 0;
    } else if (istTreffer(w, gx, gy)) mine[i] = 1;
  }
  return { offen, zahlen, mine, nutzbar, offeneZellen };
}

// ---------- Speichern / Laden ----------

const maskeLeer = (m) => m.every((v) => v === 0);
function maskeZuB64(m) {
  if (maskeLeer(m)) return '';
  const bytes = new Uint8Array(CHUNK * 2);
  for (let i = 0; i < CHUNK; i++) { bytes[2 * i] = m[i] & 255; bytes[2 * i + 1] = m[i] >> 8; }
  return bytesZuB64(bytes);
}
function b64ZuMaske(text) {
  const m = new Uint16Array(CHUNK);
  if (text === '') return m;
  const bytes = b64ZuBytes(text);
  if (!bytes || bytes.length !== CHUNK * 2) return null;
  for (let i = 0; i < CHUNK; i++) m[i] = bytes[2 * i] | (bytes[2 * i + 1] << 8);
  return m;
}

export function zumSpeichern(w) {
  const chunks = {};
  for (const c of w.daten.values()) {
    const teile = [c.o, c.f, c.q, c.t].map(maskeZuB64);
    if (teile.every((t) => t === '')) continue;
    chunks[`${c.cx},${c.cy}`] = teile.join('.');
  }
  return {
    modus: 'unendlich', seed: w.seed, dichte: w.dichte, ausgang: w.ausgang,
    chunks,
    ausstehend: w.ausstehend.slice(0, 200000),
    letzteTreffer: w.letzteTreffer.map((p) => p.slice()),
    zaehler: { ...w.zaehler },
    status: w.status,
  };
}

const popcount = (v) => { let n = 0; while (v) { v &= v - 1; n++; } return n; };
const ganz = (v) => Number.isInteger(v) && Math.abs(v) < GRENZE;

export function ausSpeicher(st) {
  if (!st || typeof st !== 'object' || st.modus !== 'unendlich') return null;
  if (typeof st.seed !== 'string' || st.seed.length > 64 || !DICHTEN.includes(st.dichte) || !AUSGAENGE.includes(st.ausgang)) return null;
  if (!['laeuft', 'verloren'].includes(st.status) || !st.chunks || typeof st.chunks !== 'object') return null;
  const w = erstelleWelt({ seed: st.seed, dichte: st.dichte, ausgang: st.ausgang });
  const eintraege = Object.entries(st.chunks);
  if (eintraege.length > 200000) return null;
  let aufgedeckt = 0, treffer = 0;
  for (const [k, v] of eintraege) {
    const m = /^(-?\d{1,7}),(-?\d{1,7})$/.exec(k);
    if (!m || typeof v !== 'string') return null;
    const cx = Number(m[1]), cy = Number(m[2]);
    if (Math.abs(cx) * CHUNK >= GRENZE || Math.abs(cy) * CHUNK >= GRENZE) return null;
    const teile = v.split('.');
    if (teile.length !== 4) return null;
    const [o, f, q, t] = teile.map(b64ZuMaske);
    if (!o || !f || !q || !t) return null;
    // Widersprüche ausschließen: offen nur ohne Mine, Treffer nur auf Minen
    const minen = chunkMinen(w, cx, cy);
    for (let i = 0; i < CHUNK; i++) {
      if (o[i] & minen[i] || t[i] & ~minen[i] || o[i] & t[i]) return null;
      f[i] &= ~(o[i] | t[i]);
      q[i] &= ~(o[i] | t[i] | f[i]);
      aufgedeckt += popcount(o[i]);
      treffer += popcount(t[i]);
    }
    w.daten.set(schluessel(cx, cy), { cx, cy, o, f, q, t });
  }
  const a = st.ausstehend;
  if (!Array.isArray(a) || a.length % 2 || a.length > 200000 || !a.every(ganz)) return null;
  w.ausstehend = a.slice();
  const lt = st.letzteTreffer;
  if (!Array.isArray(lt) || lt.length > 8 || !lt.every((p) => Array.isArray(p) && p.length === 2 && ganz(p[0]) && ganz(p[1]) && istTreffer(w, p[0], p[1]))) return null;
  w.letzteTreffer = lt.map((p) => p.slice());
  const z = st.zaehler;
  const zahlOk = (v) => Number.isInteger(v) && v >= 0 && v < 1e12;
  if (!z || !zahlOk(z.hinweise) || !zahlOk(z.ruecknahmen)) return null;
  w.zaehler = { aufgedeckt, treffer, hinweise: z.hinweise, ruecknahmen: z.ruecknahmen };
  w.status = st.status;
  return w;
}
