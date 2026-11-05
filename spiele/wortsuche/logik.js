// Wortsuche – reine Logik (ohne DOM, auch im Worker nutzbar).
// Gitter: Array mit n*n Großbuchstaben (A–Z, Ä, Ö, Ü), Zeile für Zeile. Zelle i = r*n + c.
import { erstelleZufall } from '../../kern/zufall.js';

export const STAND_VERSION = 1;

/** Richtungen [dr, dc]: → ↓ ↘ ↗ ← ↑ ↖ ↙ */
export const RICHTUNGEN = Object.freeze([[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]]);

export const STUFEN = Object.freeze({
  leicht: Object.freeze({ name: 'Leicht', n: 9, anzahl: 8, richtungen: Object.freeze([0, 1]) }),
  mittel: Object.freeze({ name: 'Mittel', n: 12, anzahl: 12, richtungen: Object.freeze([0, 1, 2, 3]) }),
  schwer: Object.freeze({ name: 'Schwer', n: 15, anzahl: 16, richtungen: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7]) }),
});
export const STUFEN_IDS = Object.keys(STUFEN);

export const MIN_LAENGE = 3;
export const MAX_LAENGE = 12;
const BUCHSTABE = /^[A-ZÄÖÜ]$/;
const WORT = /^[A-ZÄÖÜ]{3,12}$/;

/** Buchstabenhäufigkeit im Deutschen (‰, gerundet) – für die Füllbuchstaben */
const HAEUFIGKEIT = [
  ['E', 174], ['N', 98], ['I', 76], ['S', 73], ['R', 70], ['A', 65], ['T', 62], ['D', 51], ['H', 48], ['U', 44],
  ['L', 34], ['C', 31], ['G', 30], ['M', 25], ['O', 25], ['B', 19], ['W', 19], ['F', 17], ['K', 12], ['Z', 11],
  ['P', 8], ['V', 7], ['Ü', 6], ['Ä', 5], ['Ö', 3], ['J', 3], ['Y', 1], ['X', 1], ['Q', 1],
];
const HAEUFIGKEIT_SUMME = HAEUFIGKEIT.reduce((s, [, g]) => s + g, 0);

/** Schritt-Budget für einen Generatorlauf (gleicher Seed → gleiches Gitter auf jedem Gerät) */
export const BUDGET = 4_000_000;

// ---------- Wörter ----------

/** Wort für das Gitter: Großbuchstaben, ß → SS, Ä Ö Ü bleiben. Ungültig → null */
export function normalisiere(wort) {
  if (typeof wort !== 'string') return null;
  const w = wort.trim().toUpperCase();   // JS macht aus ß bereits SS
  return WORT.test(w) ? w : null;
}

const umgedreht = (w) => [...w].reverse().join('');
export const istPalindrom = (w) => w === umgedreht(w);

/** a und b dürfen nicht zusammen im Gitter stehen (eines steckt im anderen, auch rückwärts) */
export function stoerenSich(a, b) {
  return a.includes(b) || b.includes(a) || a.includes(umgedreht(b)) || b.includes(umgedreht(a));
}

/** Verwendbare Wörter eines Themas für Gittergröße n (normalisiert, ohne Dubletten und Palindrome) */
export function kandidaten(woerter, n) {
  const max = Math.min(n, MAX_LAENGE);
  const gesehen = new Set();
  const liste = [];
  for (const roh of woerter) {
    const w = normalisiere(roh);
    if (!w || w.length > max || istPalindrom(w) || gesehen.has(w)) continue;
    gesehen.add(w);
    liste.push(w);
  }
  return liste;
}

/** Themenreihenfolge je Stufe (fest gemischt) → Thema für ein Level */
export function themaFuerLevel(stufe, level, themen) {
  const rng = erstelleZufall(`wortsuche-themen-${stufe}`);
  const reihenfolge = rng.mische(themen.map((_, i) => i));
  return themen[reihenfolge[(Math.max(1, level) - 1) % themen.length]];
}

// ---------- Gitter-Helfer ----------

/** Liegen a und b auf einer der 8 Linien? → { dr, dc, laenge } (laenge = Anzahl Zellen) oder null */
export function linie(n, a, b) {
  if (a === b) return null;
  const r1 = Math.floor(a / n), c1 = a % n, r2 = Math.floor(b / n), c2 = b % n;
  const dr = r2 - r1, dc = c2 - c1;
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
  const schritte = Math.max(Math.abs(dr), Math.abs(dc));
  return { dr: Math.sign(dr), dc: Math.sign(dc), laenge: schritte + 1 };
}

/** Zellen eines Wortes (Lage { w, r, c, dr, dc }) */
export function zellenVon(n, lage) {
  const z = [];
  for (let k = 0; k < lage.w.length; k++) z.push((lage.r + k * lage.dr) * n + lage.c + k * lage.dc);
  return z;
}

/** Text entlang der Linie a → b (oder '' wenn nicht in Linie) */
export function textZwischen(gitter, n, a, b) {
  const l = linie(n, a, b);
  if (!l) return '';
  let t = '';
  for (let k = 0; k < l.laenge; k++) t += gitter[a + k * (l.dr * n + l.dc)];
  return t;
}

/**
 * Alle Vorkommen von w im Gitter (alle 8 Richtungen), höchstens `max` Stück.
 * @returns {{r:number,c:number,dr:number,dc:number}[]}
 */
export function vorkommen(gitter, n, w, max = 2, zaehler = { schritte: 0 }) {
  const treffer = [];
  const L = w.length;
  const erster = w[0];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      zaehler.schritte++;
      if (gitter[r * n + c] !== erster) continue;
      for (const [dr, dc] of RICHTUNGEN) {
        const er = r + dr * (L - 1), ec = c + dc * (L - 1);
        if (er < 0 || er >= n || ec < 0 || ec >= n) continue;
        let k = 1;
        while (k < L && gitter[(r + k * dr) * n + c + k * dc] === w[k]) k++;
        zaehler.schritte += k;
        if (k === L) {
          treffer.push({ r, c, dr, dc });
          if (treffer.length >= max) return treffer;
        }
      }
    }
  }
  return treffer;
}

const gleicheLage = (a, b) => a.r === b.r && a.c === b.c && a.dr === b.dr && a.dc === b.dc;

function zieheBuchstabe(rng) {
  let x = rng.zahl() * HAEUFIGKEIT_SUMME;
  for (const [b, g] of HAEUFIGKEIT) { x -= g; if (x < 0) return b; }
  return 'E';
}

// ---------- Generator ----------

/** Wörter für ein Gitter wählen: gemischt, ohne Paare, die sich stören */
function waehleWoerter(rng, pool, anzahl) {
  const gewaehlt = [];
  for (const w of rng.mische(pool)) {
    if (gewaehlt.some((g) => stoerenSich(g, w))) continue;
    gewaehlt.push(w);
    if (gewaehlt.length === anzahl) break;
  }
  return gewaehlt;
}

/** Ein Wort platzieren (Überkreuzungen bevorzugt) → Lage oder null */
function platziere(rng, gitter, n, w, richtungen, zaehler) {
  const alle = [], kreuzend = [];
  const L = w.length;
  for (const d of richtungen) {
    const [dr, dc] = RICHTUNGEN[d];
    for (let r = 0; r < n; r++) {
      const er = r + dr * (L - 1);
      if (er < 0 || er >= n) continue;
      for (let c = 0; c < n; c++) {
        const ec = c + dc * (L - 1);
        if (ec < 0 || ec >= n) continue;
        let passt = true, kreuz = 0;
        for (let k = 0; k < L; k++) {
          zaehler.schritte++;
          const g = gitter[(r + k * dr) * n + c + k * dc];
          if (g === '') continue;
          if (g !== w[k]) { passt = false; break; }
          kreuz++;
        }
        if (!passt || kreuz === L) continue;
        const lage = { w, r, c, dr, dc };
        alle.push(lage);
        if (kreuz > 0) kreuzend.push(lage);
      }
    }
  }
  if (!alle.length) return null;
  return kreuzend.length && rng.zahl() < 0.45 ? rng.wahl(kreuzend) : rng.wahl(alle);
}

/** Ein Versuch: platzieren, füllen, reparieren → { gitter, woerter } oder null */
function versuch(rng, pool, cfg, zaehler) {
  const { n } = cfg;
  const gewaehlt = waehleWoerter(rng, pool, cfg.anzahl);
  if (gewaehlt.length < cfg.anzahl) return null;
  gewaehlt.sort((a, b) => b.length - a.length);

  const gitter = new Array(n * n).fill('');
  const lagen = [];
  for (const w of gewaehlt) {
    const lage = platziere(rng, gitter, n, w, cfg.richtungen, zaehler);
    if (!lage) return null;
    zellenVon(n, lage).forEach((i, k) => { gitter[i] = w[k]; });
    lagen.push(lage);
  }
  const fest = gitter.map((b) => b !== '');
  for (let i = 0; i < gitter.length; i++) if (!fest[i]) gitter[i] = zieheBuchstabe(rng);

  // Reparieren: jedes Wort genau einmal
  for (let runde = 0; runde < 600; runde++) {
    if (zaehler.schritte > BUDGET) return null;
    let falsch = null;
    for (const lage of lagen) {
      const v = vorkommen(gitter, n, lage.w, 2, zaehler);
      if (v.length === 1 && gleicheLage(v[0], lage)) continue;
      falsch = v.find((o) => !gleicheLage(o, lage)) ?? null;
      if (!falsch) return null;   // sollte nicht vorkommen (eigene Lage fehlt)
      falsch = { ...falsch, w: lage.w };
      break;
    }
    if (!falsch) return { gitter, woerter: lagen };
    const frei = zellenVon(n, falsch).filter((i) => !fest[i]);
    if (!frei.length) return null;   // Zweitvorkommen nur aus Wortbuchstaben → neuer Versuch
    gitter[rng.wahl(frei)] = zieheBuchstabe(rng);
  }
  return null;
}

/**
 * Neues Rätsel erzeugen.
 * @param {{ stufe: string, level?: number, seed: string, themen: {name:string, woerter:string[]}[] }} o
 */
export function erzeugeRaetsel({ stufe, level = 1, seed, themen }) {
  const sid = STUFEN[stufe] ? stufe : 'leicht';
  const cfg = STUFEN[sid];
  if (!Array.isArray(themen) || !themen.length) throw new Error('Wortsuche: keine Themen');
  const lvl = Number.isInteger(level) && level >= 1 ? level : 1;
  const zaehler = { schritte: 0 };
  // passt das Thema nicht (zu wenige Wörter), nacheinander die folgenden Level-Themen probieren
  for (let versatz = 0; versatz < themen.length; versatz++) {
    const thema = themaFuerLevel(sid, lvl + versatz, themen);
    const pool = kandidaten(thema.woerter, cfg.n);
    if (pool.length < cfg.anzahl) continue;
    const rng = erstelleZufall(`${seed}|${sid}|${lvl}|${versatz}`);
    for (let v = 0; v < 400 && zaehler.schritte <= BUDGET; v++) {
      const r = versuch(rng, pool, cfg, zaehler);
      if (r) {
        return {
          v: STAND_VERSION, stufe: sid, level: lvl, thema: thema.name, seed: String(seed), n: cfg.n,
          gitter: r.gitter, woerter: r.woerter, gefunden: [], vor: [], hinweis: null,
          schritte: zaehler.schritte,
        };
      }
    }
  }
  throw new Error('Wortsuche: kein Gitter gefunden');
}

// ---------- Spielzüge ----------

/** Welches Wort liegt genau zwischen a und b (in beiden Richtungen)? → Index oder -1 */
export function findeWort(z, a, b) {
  for (let i = 0; i < z.woerter.length; i++) {
    const zellen = zellenVon(z.n, z.woerter[i]);
    const s = zellen[0], e = zellen[zellen.length - 1];
    if ((s === a && e === b) || (s === b && e === a)) return i;
  }
  return -1;
}

export const istGefunden = (z, i) => z.gefunden.includes(i);
export const gewonnen = (z) => z.gefunden.length === z.woerter.length;
export const kannRueckgaengig = (z) => z.gefunden.length > 0;
export const kannWiederholen = (z) => z.vor.length > 0;

/** Wort i als gefunden eintragen (neuer Zustand) */
export function markiere(z, i) {
  if (i < 0 || i >= z.woerter.length || istGefunden(z, i)) return z;
  return { ...z, gefunden: [...z.gefunden, i], vor: [], hinweis: z.hinweis?.i === i ? null : z.hinweis };
}

export function rueckgaengig(z) {
  if (!kannRueckgaengig(z)) return z;
  const i = z.gefunden[z.gefunden.length - 1];
  return { ...z, gefunden: z.gefunden.slice(0, -1), vor: [...z.vor, i] };
}

export function wiederholen(z) {
  if (!kannWiederholen(z)) return z;
  const i = z.vor[z.vor.length - 1];
  return { ...z, gefunden: [...z.gefunden, i], vor: z.vor.slice(0, -1), hinweis: z.hinweis?.i === i ? null : z.hinweis };
}

export const neustart = (z) => ({ ...z, gefunden: [], vor: [], hinweis: null });

/** Anzeigereihenfolge der Wortliste (alphabetisch) → Indizes */
export function listenReihenfolge(z) {
  return z.woerter.map((_, i) => i).sort((a, b) => z.woerter[a].w.localeCompare(z.woerter[b].w, 'de'));
}

/**
 * Hinweis: 1. Stufe markiert den Anfangsbuchstaben, 2. Stufe umrahmt das ganze Wort.
 * Ein weiterer Hinweis bei Stufe 2 nimmt das nächste offene Wort.
 * @returns neuer Zustand (unverändert, wenn gewonnen)
 */
export function hinweis(z) {
  if (gewonnen(z)) return z;
  const h = z.hinweis;
  if (h && !istGefunden(z, h.i) && h.s === 1) return { ...z, hinweis: { i: h.i, s: 2 } };
  const offen = listenReihenfolge(z).filter((i) => !istGefunden(z, i));
  let naechstes = offen[0];
  if (h && !istGefunden(z, h.i) && offen.length > 1) naechstes = offen[(offen.indexOf(h.i) + 1) % offen.length];
  return { ...z, hinweis: { i: naechstes, s: 1 } };
}

// ---------- Speichern / Laden ----------

const ganz = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;

export function istGueltig(z) {
  if (!z || typeof z !== 'object' || Array.isArray(z) || z.v !== STAND_VERSION) return false;
  const cfg = Object.hasOwn(STUFEN, z.stufe) ? STUFEN[z.stufe] : null;
  if (!cfg || z.n !== cfg.n || !ganz(z.level, 1, 1e6)) return false;
  if (typeof z.thema !== 'string' || z.thema.length < 1 || z.thema.length > 40) return false;
  if (typeof z.seed !== 'string' || z.seed.length > 80) return false;
  const n = cfg.n;
  if (!Array.isArray(z.gitter) || z.gitter.length !== n * n || !z.gitter.every((b) => typeof b === 'string' && BUCHSTABE.test(b))) return false;
  if (!Array.isArray(z.woerter) || z.woerter.length !== cfg.anzahl) return false;
  const erlaubt = cfg.richtungen.map((d) => RICHTUNGEN[d]);
  const namen = new Set();
  for (const l of z.woerter) {
    if (!l || typeof l !== 'object' || typeof l.w !== 'string' || !WORT.test(l.w) || l.w.length > n) return false;
    if (!ganz(l.r, 0, n - 1) || !ganz(l.c, 0, n - 1)) return false;
    if (!erlaubt.some(([dr, dc]) => dr === l.dr && dc === l.dc)) return false;
    const er = l.r + l.dr * (l.w.length - 1), ec = l.c + l.dc * (l.w.length - 1);
    if (!ganz(er, 0, n - 1) || !ganz(ec, 0, n - 1)) return false;
    const zellen = zellenVon(n, l);
    if (!zellen.every((i, k) => z.gitter[i] === l.w[k])) return false;
    if (namen.has(l.w)) return false;
    namen.add(l.w);
  }
  const anz = z.woerter.length;
  const indizes = (a) => Array.isArray(a) && a.length <= anz && a.every((i) => ganz(i, 0, anz - 1)) && new Set(a).size === a.length;
  if (!indizes(z.gefunden) || !indizes(z.vor)) return false;
  if (z.vor.some((i) => z.gefunden.includes(i))) return false;
  if (z.hinweis !== null) {
    const h = z.hinweis;
    if (!h || typeof h !== 'object' || !ganz(h.i, 0, anz - 1) || !ganz(h.s, 1, 2)) return false;
  }
  return true;
}

export const zumSpeichern = (z) => ausSpeicher(z);

/** Geprüfte, saubere Kopie (nur bekannte Felder) oder null */
export function ausSpeicher(daten) {
  if (!istGueltig(daten)) return null;
  return {
    v: daten.v, stufe: daten.stufe, level: daten.level, thema: daten.thema, seed: daten.seed, n: daten.n,
    gitter: daten.gitter.slice(),
    woerter: daten.woerter.map(({ w, r, c, dr, dc }) => ({ w, r, c, dr, dc })),
    gefunden: daten.gefunden.slice(), vor: daten.vor.slice(),
    hinweis: daten.hinweis ? { i: daten.hinweis.i, s: daten.hinweis.s } : null,
  };
}
