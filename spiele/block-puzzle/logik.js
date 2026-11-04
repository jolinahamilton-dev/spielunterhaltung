// Block-Puzzle – Spiellogik ohne DOM. Alle Spielzug-Funktionen sind rein: sie geben einen neuen
// Zustand zurück und verändern den alten nicht (das macht Rückgängig einfach).
import { erstelleZufall } from '../../kern/zufall.js';
import { FORMEN, FORM } from './formen.js';

export const N = 8;
export const MODI = ['klassisch', 'entspannt'];
const JOKER_ABSTAND = 1500;
const JOKER_MAX = 3;
const RUECKGAENGIG_KLASSISCH = 3;
const VERLAUF_MAX = 50;
const SUCH_BUDGET = 200000;      // Schritte, nicht Zeit → auf jedem Gerät gleiches Ergebnis

// ---------- Bit-Masken: Zelle i = y*8+x; Bits 0–31 in lo, 32–63 in hi ----------

const bit = (i) => (i < 32 ? [(1 << i) >>> 0, 0] : [0, (1 << (i - 32)) >>> 0]);

function maskeAus(indizes) {
  let lo = 0, hi = 0;
  for (const i of indizes) { const [a, b] = bit(i); lo |= a; hi |= b; }
  return [lo >>> 0, hi >>> 0];
}

const ZEILEN = Array.from({ length: N }, (_, y) => maskeAus(Array.from({ length: N }, (_, x) => y * N + x)));
const SPALTEN = Array.from({ length: N }, (_, x) => maskeAus(Array.from({ length: N }, (_, y) => y * N + x)));

/** Für jede Form alle gültigen Positionen mit Maske: [{ x, y, lo, hi, zellen:number[] }] */
const POSITIONEN = Object.fromEntries(FORMEN.map((f) => {
  const liste = [];
  for (let y = 0; y + f.h <= N; y++) {
    for (let x = 0; x + f.b <= N; x++) {
      const zellen = f.zellen.map(([dx, dy]) => (y + dy) * N + x + dx);
      const [lo, hi] = maskeAus(zellen);
      liste.push({ x, y, lo, hi, zellen });
    }
  }
  return [f.id, liste];
}));

export function bits(brett) {
  const belegt = [];
  brett.forEach((f, i) => { if (f) belegt.push(i); });
  return maskeAus(belegt);
}

const frei = (lo, hi, p) => (lo & p.lo) === 0 && (hi & p.hi) === 0;
const voll = (lo, hi, m) => ((lo & m[0]) >>> 0) === m[0] && ((hi & m[1]) >>> 0) === m[1];

function position(formId, x, y) {
  return POSITIONEN[formId]?.find((p) => p.x === x && p.y === y) ?? null;
}

export function passt(brett, formId, x, y) {
  const p = position(formId, x, y);
  if (!p) return false;
  const [lo, hi] = bits(brett);
  return frei(lo, hi, p);
}

export function passtIrgendwo(brett, formId) {
  const [lo, hi] = bits(brett);
  return POSITIONEN[formId].some((p) => frei(lo, hi, p));
}

/** Legt nur auf Bits ab (für die Suche): gibt [lo, hi, linien] zurück */
function legeBits(lo, hi, p) {
  lo = (lo | p.lo) >>> 0; hi = (hi | p.hi) >>> 0;
  let wegLo = 0, wegHi = 0, linien = 0;
  for (const m of ZEILEN) if (voll(lo, hi, m)) { wegLo |= m[0]; wegHi |= m[1]; linien++; }
  for (const m of SPALTEN) if (voll(lo, hi, m)) { wegLo |= m[0]; wegHi |= m[1]; linien++; }
  return [(lo & ~wegLo) >>> 0, (hi & ~wegHi) >>> 0, linien];
}

/**
 * Form auf das Brett legen (ohne Gültigkeitsprüfung des Spiels).
 * @returns {{ brett:number[], linien:number, geraeumt:number[], zeilen:number[], spalten:number[] } | null}
 */
export function lege(brett, formId, x, y) {
  const p = position(formId, x, y);
  if (!p) return null;
  if (p.zellen.some((i) => brett[i])) return null;
  const neu = brett.slice();
  const farbe = FORM[formId].farbe + 1;
  for (const i of p.zellen) neu[i] = farbe;
  const zeilen = [], spalten = [];
  for (let k = 0; k < N; k++) {
    if (Array.from({ length: N }, (_, j) => neu[k * N + j]).every(Boolean)) zeilen.push(k);
    if (Array.from({ length: N }, (_, j) => neu[j * N + k]).every(Boolean)) spalten.push(k);
  }
  const geraeumt = new Set();
  for (const z of zeilen) for (let j = 0; j < N; j++) geraeumt.add(z * N + j);
  for (const s of spalten) for (let j = 0; j < N; j++) geraeumt.add(j * N + s);
  for (const i of geraeumt) neu[i] = 0;
  return { brett: neu, linien: zeilen.length + spalten.length, geraeumt: [...geraeumt].sort((a, b) => a - b), zeilen, spalten };
}

/** Welche Zeilen/Spalten würden beim Ablegen verschwinden? (für die Vorschau) */
export function vorschau(brett, formId, x, y) {
  const r = lege(brett, formId, x, y);
  return r ? { gueltig: true, zellen: position(formId, x, y).zellen, geraeumt: r.geraeumt } : { gueltig: false, zellen: [], geraeumt: [] };
}

// ---------- Punkte ----------

export const linienPunkte = (n) => (10 * n * (n + 1)) / 2;
export const serienFaktor = (serie) => Math.min(4, 1 + 0.5 * Math.max(0, serie - 1));

// ---------- Angebot ----------

/** Sind alle Formen in irgendeiner Reihenfolge legbar (inkl. Abräumen dazwischen)? */
export function legbar(brett, formIds) {
  const [lo, hi] = bits(brett);
  let budget = SUCH_BUDGET;
  function suche(lo, hi, rest) {
    if (rest.length === 0) return true;
    for (let k = 0; k < rest.length; k++) {
      if (rest.indexOf(rest[k]) !== k) continue;          // gleiche Form nur einmal probieren
      const ohne = rest.filter((_, j) => j !== k);
      for (const p of POSITIONEN[rest[k]]) {
        if (--budget < 0) return false;
        if (!frei(lo, hi, p)) continue;
        const [nlo, nhi] = legeBits(lo, hi, p);
        if (suche(nlo, nhi, ohne)) return true;
      }
    }
    return false;
  }
  return suche(lo, hi, formIds);
}

function ziehe(rng, brett, anzahl) {
  const fuellung = brett.filter(Boolean).length / (N * N);
  const gewicht = (f) => f.gewicht * (fuellung > 0.6 && f.zellen.length <= 3 ? 2 : 1);
  const gewaehlt = [];
  while (gewaehlt.length < anzahl) {
    const moeglich = FORMEN.filter((f) => !gewaehlt.includes(f.id)
      && !(f.zellen.length === 9 && gewaehlt.some((id) => FORM[id].zellen.length === 9)));
    const summe = moeglich.reduce((s, f) => s + gewicht(f), 0);
    let r = rng.zahl() * summe;
    let wahl = moeglich[moeglich.length - 1];
    for (const f of moeglich) { r -= gewicht(f); if (r < 0) { wahl = f; break; } }
    gewaehlt.push(wahl.id);
  }
  return gewaehlt;
}

/** Neues Dreier-Angebot: Klassisch → mindestens eine passt (wenn möglich); Entspannt → alle legbar */
export function neuesAngebot(rng, brett, modus) {
  if (modus === 'entspannt') {
    for (let v = 0; v < 40; v++) {
      const a = ziehe(rng, brett, 3);
      if (legbar(brett, a)) return a;
    }
    return ['P1-0', 'P1-0', 'P1-0'];
  }
  let a = null;
  for (let v = 0; v < 20; v++) {
    a = ziehe(rng, brett, 3);
    if (a.some((id) => passtIrgendwo(brett, id))) return a;
  }
  return a;
}

// ---------- Spielzustand ----------

export function neuesSpiel(seed, modus = 'klassisch') {
  const m = MODI.includes(modus) ? modus : 'klassisch';
  const rng = erstelleZufall(seed);
  const brett = new Array(N * N).fill(0);
  const angebot = neuesAngebot(rng, brett, m);
  return {
    version: 1,
    modus: m,
    seed: rng.seed,
    rng: rng.zustand(),
    brett,
    angebot,
    punkte: 0,
    serie: 0,
    ohneAbraeumen: 0,
    zuege: 0,
    joker: m === 'klassisch' ? 1 : Infinity,
    naechsterJokerBei: JOKER_ABSTAND,
    rueckgaengigRest: m === 'klassisch' ? RUECKGAENGIG_KLASSISCH : Infinity,
    verlauf: [],
    beendet: false,
  };
}

const ohneVerlauf = ({ verlauf, ...rest }) => rest;

function merke(alt, neu) {
  const verlauf = [...alt.verlauf, ohneVerlauf(alt)].slice(-VERLAUF_MAX);
  return { ...neu, verlauf };
}

/** Prüft nach einem Zug: neues Angebot nötig? Spielende? Entspannt: festgefahren → neues Angebot */
function nachZug(z) {
  const rng = erstelleZufall(z.seed, z.rng);
  let angebot = z.angebot;
  let hinweis = null;
  if (angebot.every((id) => id === null)) angebot = neuesAngebot(rng, z.brett, z.modus);
  const rest = angebot.filter(Boolean);
  let beendet = false;
  if (!rest.some((id) => passtIrgendwo(z.brett, id))) {
    if (z.modus === 'entspannt') {
      angebot = neuesAngebot(rng, z.brett, z.modus);
      hinweis = 'Neue Formen – die alten passten nicht mehr.';
    } else {
      beendet = true;
    }
  }
  return { zustand: { ...z, angebot, rng: rng.zustand(), beendet }, hinweis };
}

/**
 * Form aus Platz `platz` (0–2) bei (x, y) ablegen.
 * @returns {{ zustand, ergebnis:{linien:number, geraeumt:number[], punkte:number, leer:boolean}, hinweis:string|null } | null}
 */
export function zug(z, platz, x, y) {
  if (z.beendet) return null;
  const formId = z.angebot[platz];
  if (!formId) return null;
  const r = lege(z.brett, formId, x, y);
  if (!r) return null;

  let { serie, ohneAbraeumen } = z;
  if (r.linien > 0) { serie += 1; ohneAbraeumen = 0; } else { ohneAbraeumen += 1; if (ohneAbraeumen >= 3) serie = 0; }
  const leer = r.linien > 0 && r.brett.every((f) => f === 0);
  const gewinn = FORM[formId].zellen.length
    + Math.round(linienPunkte(r.linien) * (r.linien > 0 ? serienFaktor(serie) : 1))
    + (leer ? 300 : 0);

  let { joker, naechsterJokerBei } = z;
  const punkte = z.punkte + gewinn;
  while (z.modus === 'klassisch' && punkte >= naechsterJokerBei) {
    joker = Math.min(JOKER_MAX, joker + 1);
    naechsterJokerBei += JOKER_ABSTAND;
  }

  const angebot = z.angebot.slice();
  angebot[platz] = null;
  const { zustand, hinweis } = nachZug({
    ...z, brett: r.brett, angebot, punkte, serie, ohneAbraeumen, zuege: z.zuege + 1, joker, naechsterJokerBei,
  });
  return { zustand: merke(z, zustand), ergebnis: { linien: r.linien, geraeumt: r.geraeumt, punkte: gewinn, leer }, hinweis };
}

/** Joker: Restangebot verwerfen, neues ziehen (zählt als Zug, Serie bleibt) */
export function joker(z) {
  if (!(z.joker > 0)) return null;     // geht auch nach Spielende – der Joker kann retten
  const rng = erstelleZufall(z.seed, z.rng);
  const angebot = neuesAngebot(rng, z.brett, z.modus);
  const { zustand, hinweis } = nachZug({ ...z, angebot, rng: rng.zustand(), joker: z.joker - 1, zuege: z.zuege + 1, beendet: false });
  return { zustand: merke(z, zustand), hinweis };
}

export function kannRueckgaengig(z) {
  return z.verlauf.length > 0 && z.rueckgaengigRest > 0;
}

export function rueckgaengig(z) {
  if (!kannRueckgaengig(z)) return null;
  const vorher = z.verlauf[z.verlauf.length - 1];
  return {
    ...vorher,
    verlauf: z.verlauf.slice(0, -1),
    rueckgaengigRest: z.rueckgaengigRest - 1,   // alles andere (auch Joker) wie vor dem Zug
  };
}

/** Bester Platz für einen Hinweis: räumt möglichst viele Linien, sonst möglichst viele Zellen */
export function hinweis(z) {
  let bestes = null;
  z.angebot.forEach((formId, platz) => {
    if (!formId) return;
    for (const p of POSITIONEN[formId]) {
      const r = lege(z.brett, formId, p.x, p.y);
      if (!r) continue;
      // Nachbarschaft: lieber an Rand/andere Steine anlegen als mitten ins Freie
      let kontakt = 0;
      for (const i of p.zellen) {
        const x = i % N, y = Math.floor(i / N);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N || z.brett[ny * N + nx]) kontakt++;
        }
      }
      const wert = r.linien * 100 + kontakt;
      if (!bestes || wert > bestes.wert) bestes = { platz, x: p.x, y: p.y, wert };
    }
  });
  return bestes;
}

/** Erste gültige Position nahe der Mitte (für Tastatur-Start) */
export function startPosition(brett, formId) {
  const f = FORM[formId];
  const mx = (N - f.b) / 2, my = (N - f.h) / 2;
  const [lo, hi] = bits(brett);
  const sortiert = POSITIONEN[formId].slice().sort((a, b) =>
    (Math.abs(a.x - mx) + Math.abs(a.y - my)) - (Math.abs(b.x - mx) + Math.abs(b.y - my)));
  const p = sortiert.find((q) => frei(lo, hi, q)) || sortiert[0];
  return { x: p.x, y: p.y };
}

/** Prüft einen geladenen Stand grob auf Gültigkeit */
export function istGueltig(z) {
  return z && z.version === 1 && MODI.includes(z.modus) && Array.isArray(z.brett) && z.brett.length === N * N
    && Array.isArray(z.angebot) && z.angebot.length === 3 && z.angebot.every((id) => id === null || FORM[id])
    && Array.isArray(z.rng) && Array.isArray(z.verlauf);
}

/** JSON kennt kein Infinity → beim Speichern als null, beim Laden zurück */
export function zumSpeichern(z) {
  const fix = (s) => ({ ...s, joker: s.joker === Infinity ? null : s.joker, rueckgaengigRest: s.rueckgaengigRest === Infinity ? null : s.rueckgaengigRest });
  return { ...fix(z), verlauf: z.verlauf.map(fix) };
}
export function ausSpeicher(z) {
  const fix = (s) => ({ ...s, joker: s.joker ?? Infinity, rueckgaengigRest: s.rueckgaengigRest ?? Infinity });
  return { ...fix(z), verlauf: (z.verlauf || []).map(fix) };
}
