// Malen nach Zahlen – Spiellogik ohne DOM (rein, testbar).
// Zustand: { v, stufe, nr, titel, b, h, farben, bild, verlauf, vor } – „gemalt“ wird aus dem Verlauf berechnet.
import { erstelleZufall } from '../../kern/zufall.js';

export const MIN_SEITE = 4;      // für Tests; echte Bilder haben 12–32
export const MAX_SEITE = 32;
export const MAX_FARBEN = 10;

export const STUFEN = Object.freeze({
  klein: { name: 'Klein', seite: [1, 16], mosaik: [12, 16], farben: [4, 6] },
  mittel: { name: 'Mittel', seite: [17, 24], mosaik: [18, 24], farben: [5, 7] },
  gross: { name: 'Groß', seite: [25, 32], mosaik: [26, 32], farben: [6, 8] },
});
export const STUFEN_IDS = Object.keys(STUFEN);

// ---------------------------------------------------------------------------------------------
// Bilder

/** Bild aus bilder.json prüfen → { titel, b, h, bild (Farb-IDs, −1 leer) } oder null */
export function pruefeBild(m) {
  if (!m || typeof m.titel !== 'string' || !Array.isArray(m.zeilen) || !m.farben || typeof m.farben !== 'object') return null;
  const h = m.zeilen.length;
  const b = typeof m.zeilen[0] === 'string' ? m.zeilen[0].length : 0;
  if (b < MIN_SEITE || h < MIN_SEITE || b > MAX_SEITE || h > MAX_SEITE) return null;
  const bild = [];
  for (const zeile of m.zeilen) {
    if (typeof zeile !== 'string' || zeile.length !== b) return null;
    for (const c of zeile) {
      if (c === '.') { bild.push(-1); continue; }
      const f = Object.hasOwn(m.farben, c) ? m.farben[c] : undefined;
      if (!Number.isInteger(f) || f < 0 || f > 9) return null;
      bild.push(f);
    }
  }
  if (!bild.some((v) => v >= 0)) return null;
  return { titel: m.titel.slice(0, 40), b, h, bild };
}

/** Stufe eines Bildes nach seiner längeren Seite */
export function stufeVon(bild) {
  const n = Math.max(bild.b, bild.h);
  if (n <= STUFEN.klein.seite[1]) return 'klein';
  if (n <= STUFEN.mittel.seite[1]) return 'mittel';
  return 'gross';
}

/** Gültige Bilder einer Stufe in Datei-Reihenfolge */
export function bilderFuer(liste, stufe) {
  return (Array.isArray(liste) ? liste : []).map(pruefeBild).filter((m) => m && stufeVon(m) === stufe);
}

/**
 * Symmetrisches Mosaik (4-fach gespiegelt). Feste Schrittzahl → gleicher Seed, gleiches Bild.
 * @returns {{ titel, b, h, bild }}
 */
export function erzeugeMosaik(rng, stufe) {
  const cfg = STUFEN[stufe] || STUFEN.klein;
  const n = rng.ganz(cfg.mosaik[0], cfg.mosaik[1]);
  const k = rng.ganz(cfg.farben[0], cfg.farben[1]);
  const farben = rng.mische([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, k);
  const art = rng.ganz(0, 2);
  const m = Math.ceil(n / 2);           // Viertel m × m, wird gespiegelt
  let q = new Array(m * m);

  if (art === 0) {
    // geglättetes Rauschen
    // grobes Rauschen (Blöcke 3 × 3) mit etwas Feinkörnung → zusammenhängende Flächen
    const g = Math.ceil(m / 3);
    const grob = Array.from({ length: g * g }, () => rng.zahl());
    for (let i = 0; i < q.length; i++) q[i] = grob[Math.floor(Math.floor(i / m) / 3) * g + Math.floor((i % m) / 3)] + rng.zahl() * 0.25;
    for (let runde = 0; runde < 3; runde++) {
      const neu = q.slice();
      for (let y = 0; y < m; y++) {
        for (let x = 0; x < m; x++) {
          let s = 0, z = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const yy = y + dy, xx = x + dx;
              if (yy < 0 || xx < 0 || yy >= m || xx >= m) continue;
              s += q[yy * m + xx]; z++;
            }
          }
          neu[y * m + x] = s / z;
        }
      }
      q = neu;
    }
    // in k Stufen nach Rang einteilen (gleich große Flächen)
    const rang = q.map((v, i) => [v, i]).sort((a, c) => a[0] - c[0] || a[1] - c[1]);
    const stufeF = new Array(q.length);
    rang.forEach(([, i], r) => { stufeF[i] = Math.min(k - 1, Math.floor((r * k) / q.length)); });
    q = stufeF;
  } else {
    // Ringe (Abstandsmaß Kreis/Raute/Quadrat) mit gestörten Breiten
    const mass = rng.ganz(0, 2);
    const breiten = Array.from({ length: k * 3 }, () => rng.ganz(1, 3));
    const grenzen = [];
    let summe = 0;
    for (const w of breiten) { summe += w; grenzen.push(summe); }
    const wellen = rng.ganz(0, 3);
    for (let y = 0; y < m; y++) {
      for (let x = 0; x < m; x++) {
        const dx = m - 1 - x + (n % 2 ? 0 : 0.5), dy = m - 1 - y + (n % 2 ? 0 : 0.5);
        let d = mass === 0 ? Math.hypot(dx, dy) : mass === 1 ? dx + dy : Math.max(dx, dy);
        if (art === 2 && wellen) d += Math.sin(Math.atan2(dy, dx + 0.001) * wellen * 2) * 1.2;
        let ring = grenzen.findIndex((g) => d < g);
        if (ring < 0) ring = grenzen.length;
        q[y * m + x] = ring % k;
      }
    }
  }

  // Ecken evtl. frei lassen (rundes Mosaik)
  const rund = rng.zahl() < 0.5;
  const bild = new Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const qx = Math.min(x, n - 1 - x), qy = Math.min(y, n - 1 - y);
      let f = farben[q[qy * m + qx]];
      if (rund) {
        const cx = x - (n - 1) / 2, cy = y - (n - 1) / 2;
        if (Math.hypot(cx, cy) > n / 2 + 0.2) f = -1;
      }
      bild[y * n + x] = f;
    }
  }
  return { titel: 'Mosaik', b: n, h: n, bild };
}

/** Bild Nummer nr (ab 0) einer Stufe: erst alle Bilder, dann abwechselnd Mosaik und Bild */
export function bildFuerNr(stufe, nr, bilder, rng) {
  const liste = bilderFuer(bilder, stufe);
  const L = liste.length;
  let bild = null;
  if (L) {
    if (nr < L) bild = liste[nr];
    else if ((nr - L) % 2 === 1) bild = liste[Math.floor((nr - L) / 2) % L];
  }
  return bild ? { ...bild, bild: bild.bild.slice() } : erzeugeMosaik(rng, stufe);
}

/** Neues Spiel → Zustand */
export function erzeugeSpiel({ stufe, nr = 0, seed = 'start', bilder = [] }) {
  const sid = STUFEN[stufe] ? stufe : 'klein';
  const n = Number.isInteger(nr) && nr >= 0 ? nr : 0;
  const rng = erstelleZufall(`${seed}|${sid}|${n}`);
  const motiv = bildFuerNr(sid, n, bilder, rng);
  return ausBild(motiv, { stufe: sid, nr: n });
}

/** Zustand aus { titel, b, h, bild (Farb-IDs) } */
export function ausBild(motiv, { stufe = 'klein', nr = 0 } = {}) {
  const farben = [...new Set(motiv.bild.filter((v) => v >= 0))].sort((a, c) => a - c).slice(0, MAX_FARBEN);
  const bild = motiv.bild.map((v) => (v >= 0 ? farben.indexOf(v) : -1));
  return mitGemalt({ v: 1, stufe, nr, titel: motiv.titel, b: motiv.b, h: motiv.h, farben, bild, verlauf: [], vor: [] });
}

// ---------------------------------------------------------------------------------------------
// Spielzüge

/** gemalt-Feld (0/1 je Feld) aus dem Verlauf berechnen und anhängen */
function mitGemalt(z) {
  const gemalt = new Array(z.b * z.h).fill(0);
  for (const zug of z.verlauf) for (const i of zug) gemalt[i] = 1;
  return { ...z, gemalt };
}

/** Kann Feld i mit Farbindex f gemalt werden? */
export const malbar = (z, i, f) => i >= 0 && i < z.bild.length && z.bild[i] === f && f >= 0 && !z.gemalt[i];

/** Zug (Liste von Feldern) eintragen – nur malbare, doppelte entfallen. Leer → gleicher Zustand. */
export function male(z, felder, f) {
  const neu = [];
  const gesehen = new Set();
  for (const i of felder) {
    if (gesehen.has(i) || !malbar(z, i, f)) continue;
    gesehen.add(i);
    neu.push(i);
  }
  if (!neu.length) return z;
  const gemalt = z.gemalt.slice();
  for (const i of neu) gemalt[i] = 1;
  return { ...z, gemalt, verlauf: [...z.verlauf, neu], vor: [] };
}

export const kannRueckgaengig = (z) => z.verlauf.length > 0;
export const kannWiederholen = (z) => z.vor.length > 0;

export function rueckgaengig(z) {
  if (!z.verlauf.length) return null;
  const zug = z.verlauf[z.verlauf.length - 1];
  const gemalt = z.gemalt.slice();
  for (const i of zug) gemalt[i] = 0;
  return { ...z, gemalt, verlauf: z.verlauf.slice(0, -1), vor: [...z.vor, zug] };
}

export function wiederholen(z) {
  if (!z.vor.length) return null;
  const zug = z.vor[z.vor.length - 1];
  const gemalt = z.gemalt.slice();
  for (const i of zug) gemalt[i] = 1;
  return { ...z, gemalt, verlauf: [...z.verlauf, zug], vor: z.vor.slice(0, -1) };
}

export const neustart = (z) => mitGemalt({ ...z, verlauf: [], vor: [] });

/** Offene Felder je Farbindex */
export function restJeFarbe(z) {
  const rest = new Array(z.farben.length).fill(0);
  for (let i = 0; i < z.bild.length; i++) if (z.bild[i] >= 0 && !z.gemalt[i]) rest[z.bild[i]]++;
  return rest;
}
/** Felder gesamt je Farbindex */
export function anzahlJeFarbe(z) {
  const n = new Array(z.farben.length).fill(0);
  for (const v of z.bild) if (v >= 0) n[v]++;
  return n;
}
export const restGesamt = (z) => z.bild.reduce((s, v, i) => s + (v >= 0 && !z.gemalt[i] ? 1 : 0), 0);
export const fertig = (z) => restGesamt(z) === 0;

/** Erste offene Farbe ab Index ab (umlaufend) oder −1 */
export function naechsteOffeneFarbe(z, ab = 0) {
  const rest = restJeFarbe(z);
  for (let k = 0; k < rest.length; k++) {
    const f = (ab + k) % rest.length;
    if (rest[f] > 0) return f;
  }
  return -1;
}

/** Nächstes offenes Feld der Farbe f in Lesereihenfolge nach Feld ab (umlaufend) oder −1 */
export function naechstesOffenes(z, f, ab = -1) {
  const n = z.bild.length;
  for (let k = 1; k <= n; k++) {
    const i = (((ab + k) % n) + n) % n;
    if (malbar(z, i, f)) return i;
  }
  return -1;
}

/**
 * Hinweis: offenes Feld der gewählten Farbe (sonst der mit den wenigsten offenen Feldern),
 * das dem Punkt (px, py) – in Feldern, Standard Bildmitte – am nächsten liegt.
 * @returns {{ farbe, feld } | null}
 */
export function hinweis(z, gewaehlt = -1, px = (z.b - 1) / 2, py = (z.h - 1) / 2) {
  const rest = restJeFarbe(z);
  let f = gewaehlt >= 0 && rest[gewaehlt] > 0 ? gewaehlt : -1;
  if (f < 0) {
    for (let k = 0; k < rest.length; k++) if (rest[k] > 0 && (f < 0 || rest[k] < rest[f])) f = k;
  }
  if (f < 0) return null;
  let best = -1, bestD = Infinity;
  for (let i = 0; i < z.bild.length; i++) {
    if (!malbar(z, i, f)) continue;
    const d = Math.hypot((i % z.b) - px, Math.floor(i / z.b) - py);
    if (d < bestD) { bestD = d; best = i; }
  }
  return { farbe: f, feld: best };
}

/** Felder auf der Linie von Feld a nach Feld b (Bresenham), beide eingeschlossen */
export function linie(b, a, c) {
  let x0 = a % b, y0 = Math.floor(a / b);
  const x1 = c % b, y1 = Math.floor(c / b);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const felder = [];
  for (let n = 0; n < 200; n++) {
    felder.push(y0 * b + x0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return felder;
}

// ---------------------------------------------------------------------------------------------
// Speichern / Laden

export function zumSpeichern(z) {
  const { v, stufe, nr, titel, b, h, farben, bild, verlauf, vor } = z;
  return JSON.parse(JSON.stringify({ v, stufe, nr, titel, b, h, farben, bild, verlauf, vor }));
}

/** Erlaubte Bildtitel im Spielstand (nur Buchstaben, Ziffern, wenige Satzzeichen) */
const TITEL_MUSTER = /^[\p{L}\p{N} .,'’()-]{1,40}$/u;

const istGanz =(x, min, max) => Number.isInteger(x) && x >= min && x <= max;

/** Gespeicherten Stand prüfen → Zustand; wirft bei Ungültigem */
export function ausSpeicher(d) {
  if (!d || typeof d !== 'object' || d.v !== 1) throw new Error('Stand: Version');
  if (!STUFEN[d.stufe]) throw new Error('Stand: Stufe');
  if (!istGanz(d.nr, 0, 1e7)) throw new Error('Stand: Nummer');
  if (typeof d.titel !== 'string' || !TITEL_MUSTER.test(d.titel)) throw new Error('Stand: Titel');
  if (!istGanz(d.b, MIN_SEITE, MAX_SEITE) || !istGanz(d.h, MIN_SEITE, MAX_SEITE)) throw new Error('Stand: Größe');
  const n = d.b * d.h;
  if (!Array.isArray(d.farben) || d.farben.length < 1 || d.farben.length > MAX_FARBEN) throw new Error('Stand: Farben');
  if (!d.farben.every((f) => istGanz(f, 0, 9)) || new Set(d.farben).size !== d.farben.length) throw new Error('Stand: Farben');
  const k = d.farben.length;
  if (!Array.isArray(d.bild) || d.bild.length !== n || !d.bild.every((v) => istGanz(v, -1, k - 1))) throw new Error('Stand: Bild');
  if (!d.bild.some((v) => v >= 0)) throw new Error('Stand: leeres Bild');
  const gesehen = new Uint8Array(n);
  const pruefeZuege = (liste) => {
    if (!Array.isArray(liste) || liste.length > n) throw new Error('Stand: Verlauf');
    return liste.map((zug) => {
      if (!Array.isArray(zug) || zug.length < 1 || zug.length > n) throw new Error('Stand: Zug');
      for (const i of zug) {
        if (!istGanz(i, 0, n - 1) || d.bild[i] < 0 || gesehen[i]) throw new Error('Stand: Feld');
        gesehen[i] = 1;
      }
      return zug.slice();
    });
  };
  const verlauf = pruefeZuege(d.verlauf);
  const vor = pruefeZuege(d.vor);
  return mitGemalt({
    v: 1, stufe: d.stufe, nr: d.nr, titel: d.titel.slice(0, 40), b: d.b, h: d.h,
    farben: d.farben.slice(), bild: d.bild.slice(), verlauf, vor,
  });
}
