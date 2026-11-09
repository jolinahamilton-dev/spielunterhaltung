// Punkte verbinden – Spiellogik ohne DOM. Alle Funktionen sind rein: Spielzüge geben einen neuen
// Zustand zurück und verändern den alten nicht (das macht Rückgängig einfach).
// Feld: Index i = y * b + x, y = 0 ist die oberste Zeile.
import { erstelleZufall } from '../../kern/zufall.js';

export const VARIANTEN = ['endlos', 'leicht', 'mittel', 'schwer'];
export const VERLAUF_MAX = 200;
export const LEVEL_MAX = 99999;
const HINWEIS_SCHRITTE = 600;      // Schritte je Startpunkt (nicht Zeit → überall gleiches Ergebnis)

/** Raster, Farben (IDs aus ctx.farben) und Ziel-Aufbau je Variante */
export const STUFEN = Object.freeze({
  endlos: { b: 6, hh: 7, farben: [0, 5, 3, 2, 6], ziele: null },
  leicht: { b: 6, hh: 6, farben: [0, 5, 3, 2], basis: 8, versatz: [2, 0, 0, -2], zuwachs: 6 },
  mittel: { b: 6, hh: 7, farben: [0, 5, 3, 2, 6], basis: 10, versatz: [2, 1, 0, -1, -2], zuwachs: 8 },
  schwer: { b: 7, hh: 8, farben: [0, 5, 3, 2, 6], basis: 13, versatz: [3, 1, 0, -1, -3], zuwachs: 10 },
});

/** Ziele je Farbe (in der Reihenfolge von STUFEN[v].farben) für ein Level; null in „endlos“ */
export function zieleFuer(variante, level) {
  const s = STUFEN[variante];
  if (!s || !s.basis) return null;
  const plus = Math.min(Math.max(level, 1) - 1, s.zuwachs);
  return s.versatz.map((v) => s.basis + v + plus);
}

// ---------- Felder und Nachbarn ----------

export const nachbarn = (i, b, hh) => {
  const x = i % b, y = Math.floor(i / b);
  const r = [];
  if (y > 0) r.push(i - b);
  if (x > 0) r.push(i - 1);
  if (x < b - 1) r.push(i + 1);
  if (y < hh - 1) r.push(i + b);
  return r;
};

export const sindNachbarn = (i, j, b) => (Math.abs(i - j) === b) || (Math.abs(i - j) === 1 && Math.floor(i / b) === Math.floor(j / b));

/** Gibt es irgendwo zwei gleichfarbige Nachbarn? */
export function hatPaar(brett, b, hh) {
  for (let i = 0; i < brett.length; i++) {
    const x = i % b, y = Math.floor(i / b);
    if (x < b - 1 && brett[i] === brett[i + 1]) return true;
    if (y < hh - 1 && brett[i] === brett[i + b]) return true;
  }
  return false;
}
export const festgefahren = (brett, b, hh) => !hatPaar(brett, b, hh);

/** Ordnet (nur durch Tauschen, Farbanzahlen bleiben) so um, dass mindestens ein Paar entsteht */
function erzwingePaar(brett, b, hh, rng) {
  if (hatPaar(brett, b, hh)) return;
  // häufigste Farbe (bei Gleichstand die kleinste ID) – hat nach dem Schubfachprinzip mindestens 2 Felder
  const zaehl = new Map();
  for (const f of brett) zaehl.set(f, (zaehl.get(f) || 0) + 1);
  let farbe = -1, best = 0;
  for (const [f, n] of [...zaehl].sort((a, c) => a[0] - c[0])) if (n > best) { best = n; farbe = f; }
  const felder = [];
  brett.forEach((f, i) => { if (f === farbe) felder.push(i); });
  if (felder.length < 2) return;
  const p = felder[rng.ganz(0, felder.length - 1)];
  const q = felder.find((i) => i !== p);
  const ziele = nachbarn(p, b, hh).filter((n) => n !== q);
  if (!ziele.length) return;
  const n = ziele[rng.ganz(0, ziele.length - 1)];
  [brett[n], brett[q]] = [brett[q], brett[n]];
}

function nachfuellFarbe(rng, farben) {
  return farben[rng.ganz(0, farben.length - 1)];
}

// ---------- Neues Spiel ----------

/**
 * @param {{ variante?:string, seed:string, level?:number }} o
 */
export function neuesSpiel({ variante = 'endlos', seed, level = 1 }) {
  const s = STUFEN[variante] || STUFEN.endlos;
  const v = STUFEN[variante] ? variante : 'endlos';
  const lv = v === 'endlos' ? 0 : Math.min(Math.max(Math.trunc(level) || 1, 1), LEVEL_MAX);
  const rng = erstelleZufall(seed);
  const brett = [];
  for (let i = 0; i < s.b * s.hh; i++) brett.push(nachfuellFarbe(rng, s.farben));
  erzwingePaar(brett, s.b, s.hh, rng);
  const ziele = zieleFuer(v, lv);
  return {
    version: 1, variante: v, seed: String(seed), rng: rng.zustand(),
    b: s.b, hh: s.hh, farben: s.farben.slice(), brett,
    level: lv, ziele, rest: ziele ? ziele.slice() : null, weiter: false,
    gesammelt: 0, zuege: 0, verlauf: [],
  };
}

// ---------- Ketten ----------

const kante = (i, j) => (i < j ? `${i}-${j}` : `${j}-${i}`);

/**
 * Nächste Kette nach „Zeiger/Cursor ist auf Feld `ziel`“.
 * Verlängert, nimmt zurück (Ziel = vorletztes Glied) oder liefert null (nicht möglich).
 */
export function pfadSchritt(brett, b, hh, pfad, ziel) {
  if (!pfad.length || !Number.isInteger(ziel) || ziel < 0 || ziel >= b * hh) return null;
  const letztes = pfad[pfad.length - 1];
  if (ziel === letztes || !sindNachbarn(letztes, ziel, b)) return null;
  if (pfad.length >= 2 && ziel === pfad[pfad.length - 2]) return pfad.slice(0, -1);
  if (brett[ziel] !== brett[pfad[0]]) return null;
  const benutzt = new Set();
  for (let k = 1; k < pfad.length; k++) benutzt.add(kante(pfad[k - 1], pfad[k]));
  if (benutzt.has(kante(letztes, ziel))) return null;
  return [...pfad, ziel];
}

/** Hat die Kette ein Feld zweimal besucht (Schleife)? */
export function schliesst(pfad) {
  return new Set(pfad).size < pfad.length;
}

/** Gültige Kette? (Indizes, Nachbarschaft, eine Farbe, Kanten nur einmal, mindestens 2 Felder) */
export function pfadGueltig(brett, b, hh, pfad) {
  if (!Array.isArray(pfad) || pfad.length < 2 || pfad.length > b * hh * 4) return false;
  if (!pfad.every((i) => Number.isInteger(i) && i >= 0 && i < b * hh)) return false;
  const farbe = brett[pfad[0]];
  const benutzt = new Set();
  for (let k = 0; k < pfad.length; k++) {
    if (brett[pfad[k]] !== farbe) return false;
    if (k) {
      if (!sindNachbarn(pfad[k - 1], pfad[k], b)) return false;
      const e = kante(pfad[k - 1], pfad[k]);
      if (benutzt.has(e)) return false;
      benutzt.add(e);
    }
  }
  return true;
}

/** Welche Felder verschwinden bei dieser Kette (inklusive Schleifen-Bonus)? Sortiert. */
export function betroffen(brett, b, hh, pfad) {
  const set = new Set(pfad);
  if (schliesst(pfad)) {
    const farbe = brett[pfad[0]];
    brett.forEach((f, i) => { if (f === farbe) set.add(i); });
  }
  return [...set].sort((a, c) => a - c);
}

// ---------- Schwerkraft und Nachfüllen ----------

/**
 * Entfernt Felder, lässt den Rest fallen und füllt von oben auf.
 * @returns {{ brett:number[], fall:number[] }} fall[i] = Zeilen, die der Punkt auf Feld i herabgefallen ist (neue: Höhe der Lücke)
 */
export function faelltNach(brett, b, hh, weg, rng, farben) {
  const entfernt = new Set(weg);
  const neu = new Array(b * hh).fill(0);
  const fall = new Array(b * hh).fill(0);
  for (let x = 0; x < b; x++) {
    let ziel = hh - 1;
    for (let y = hh - 1; y >= 0; y--) {
      const i = y * b + x;
      if (entfernt.has(i)) continue;
      neu[ziel * b + x] = brett[i];
      fall[ziel * b + x] = ziel - y;
      ziel--;
    }
    const luecke = ziel + 1;
    for (let y = ziel; y >= 0; y--) {
      neu[y * b + x] = nachfuellFarbe(rng, farben);
      fall[y * b + x] = luecke;
    }
  }
  return { brett: neu, fall };
}

// ---------- Zustand und Verlauf ----------

const schnappschuss = (z) => ({
  brett: z.brett.slice(), rng: z.rng.slice(), rest: z.rest ? z.rest.slice() : null,
  gesammelt: z.gesammelt, zuege: z.zuege,
});
const mitVerlauf = (z, neu) => ({ ...neu, verlauf: [...z.verlauf, schnappschuss(z)].slice(-VERLAUF_MAX) });

export const gewonnen = (z) => Boolean(z.rest) && !z.weiter && z.rest.every((r) => r === 0);

/** Nach dem Ziel ohne Ziele weiterspielen (Flag im Spielstand; das Ziel wird nie erneut gemeldet) */
export const weiterspielen = (z) => (z.rest ? { ...z, weiter: true } : z);

/** Wie viele Punkte welcher Farbe wurden entfernt → Restzahlen senken */
function senkeRest(z, farbe, anzahl) {
  if (!z.rest) return null;
  const k = z.farben.indexOf(farbe);
  return z.rest.map((r, i) => (i === k ? Math.max(0, r - anzahl) : r));
}

/**
 * Führt eine Kette aus.
 * @returns {{ zustand, entfernt:number[], schleife:boolean, farbe:number, fall:number[], altesBrett:number[] } | null}
 */
export function zug(z, pfad) {
  if (!pfadGueltig(z.brett, z.b, z.hh, pfad)) return null;
  const farbe = z.brett[pfad[0]];
  const entfernt = betroffen(z.brett, z.b, z.hh, pfad);
  const rng = erstelleZufall(z.seed, z.rng);
  const { brett, fall } = faelltNach(z.brett, z.b, z.hh, entfernt, rng, z.farben);
  const zustand = mitVerlauf(z, {
    ...z, brett, rng: rng.zustand(), rest: senkeRest(z, farbe, entfernt.length),
    gesammelt: z.gesammelt + entfernt.length, zuege: z.zuege + 1,
  });
  return { zustand, entfernt, schleife: schliesst(pfad), farbe, fall, altesBrett: z.brett };
}

/** Umordnen: vorhandene Punkte mischen (seeded), danach garantiert mindestens ein Paar. Zählt als Zug. */
export function umordnen(z) {
  const rng = erstelleZufall(z.seed, z.rng);
  const brett = rng.mische(z.brett);
  erzwingePaar(brett, z.b, z.hh, rng);
  return mitVerlauf(z, { ...z, brett, rng: rng.zustand(), zuege: z.zuege + 1 });
}

export const kannRueckgaengig = (z) => z.verlauf.length > 0;

export function rueckgaengig(z) {
  if (!kannRueckgaengig(z)) return null;
  const v = z.verlauf[z.verlauf.length - 1];
  return {
    ...z, brett: v.brett.slice(), rng: v.rng.slice(), rest: v.rest ? v.rest.slice() : null,
    gesammelt: v.gesammelt, zuege: v.zuege, verlauf: z.verlauf.slice(0, -1),
  };
}

// ---------- Hinweis ----------

/**
 * Sucht eine gute Kette: längste gefundene (Tiefensuche mit Schritt-Budget je Startpunkt).
 * Schleifen werden nach ihrem Gesamtgewinn bewertet; Farben mit offenem Ziel bevorzugt.
 * @returns {{ pfad:number[], schleife:boolean, anzahl:number } | null}
 */
export function hinweis(z) {
  const { brett, b, hh } = z;
  const gesamt = new Map();
  for (const f of brett) gesamt.set(f, (gesamt.get(f) || 0) + 1);
  const offen = (f) => {
    if (!z.rest || z.weiter) return true;
    const k = z.farben.indexOf(f);
    return k >= 0 && z.rest[k] > 0;
  };
  let bestes = null;
  const wert = (anzahl, farbe) => anzahl + (offen(farbe) ? 1000 : 0);

  for (let start = 0; start < brett.length; start++) {
    const farbe = brett[start];
    let schritte = 0;
    const pfad = [start];
    const imPfad = new Set([start]);
    const dfs = () => {
      if (schritte++ > HINWEIS_SCHRITTE) return;
      const letztes = pfad[pfad.length - 1];
      if (pfad.length >= 2) {
        const w = wert(pfad.length, farbe);
        if (!bestes || w > bestes.w) bestes = { w, pfad: pfad.slice(), schleife: false, anzahl: pfad.length };
      }
      for (const n of nachbarn(letztes, b, hh)) {
        if (brett[n] !== farbe) continue;
        if (pfad.length >= 2 && n === pfad[pfad.length - 2]) continue;
        if (imPfad.has(n)) {
          // Schleife schließen (über eine noch nicht benutzte Kante)
          if (pfad.length >= 4) {
            const w = wert(gesamt.get(farbe), farbe) + 500;
            if (!bestes || w > bestes.w) bestes = { w, pfad: [...pfad, n], schleife: true, anzahl: gesamt.get(farbe) };
          }
          continue;
        }
        pfad.push(n); imPfad.add(n);
        dfs();
        pfad.pop(); imPfad.delete(n);
        if (schritte > HINWEIS_SCHRITTE) return;
      }
    };
    dfs();
  }
  return bestes ? { pfad: bestes.pfad, schleife: bestes.schleife, anzahl: bestes.anzahl } : null;
}

// ---------- Speichern und Laden (streng) ----------

const istGanz = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;
const istListe = (a, n, f) => Array.isArray(a) && a.length === n && a.every(f);
const gleichListe = (a, b2) => a.length === b2.length && a.every((v, i) => v === b2[i]);

/** Prüft einen geladenen Stand streng und liefert ein neues, bereinigtes Objekt – oder null. */
export function ausSpeicher(roh) {
  try {
    if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return null;
    if (roh.version !== 1 || !VARIANTEN.includes(roh.variante)) return null;
    const s = STUFEN[roh.variante];
    if (typeof roh.seed !== 'string' || roh.seed.length > 64) return null;
    if (roh.b !== s.b || roh.hh !== s.hh) return null;
    if (!Array.isArray(roh.farben) || !gleichListe(roh.farben, s.farben)) return null;
    const n = s.b * s.hh;
    const farbeOk = (f) => Number.isInteger(f) && s.farben.includes(f);
    const rngOk = (r) => istListe(r, 4, (x) => istGanz(x, 0, 0xffffffff));
    if (!istListe(roh.brett, n, farbeOk) || !rngOk(roh.rng)) return null;
    const level = roh.variante === 'endlos' ? 0 : roh.level;
    if (roh.variante === 'endlos' ? roh.level !== 0 : !istGanz(level, 1, LEVEL_MAX)) return null;
    const ziele = zieleFuer(roh.variante, level);
    let rest = null;
    const restOk = (r) => (ziele === null
      ? r === null
      : istListe(r, ziele.length, (x, i) => true) && r.every((x, i) => istGanz(x, 0, ziele[i])));
    if (!restOk(roh.rest)) return null;
    if (ziele !== null) {
      if (!Array.isArray(roh.ziele) || !gleichListe(roh.ziele, ziele)) return null;
      rest = roh.rest.slice();
    } else if (roh.ziele !== null) return null;
    const weiter = roh.weiter === undefined ? false : roh.weiter;   // alte Stände ohne Flag: false
    if (typeof weiter !== 'boolean' || (weiter && ziele === null)) return null;
    if (!istGanz(roh.gesammelt, 0, 1e9) || !istGanz(roh.zuege, 0, 1e9)) return null;
    if (!Array.isArray(roh.verlauf) || roh.verlauf.length > VERLAUF_MAX) return null;
    const verlauf = [];
    for (const v of roh.verlauf) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
      if (!istListe(v.brett, n, farbeOk) || !rngOk(v.rng) || !restOk(v.rest)) return null;
      if (!istGanz(v.gesammelt, 0, 1e9) || !istGanz(v.zuege, 0, 1e9)) return null;
      verlauf.push({
        brett: v.brett.slice(), rng: v.rng.slice(), rest: v.rest ? v.rest.slice() : null,
        gesammelt: v.gesammelt, zuege: v.zuege,
      });
    }
    return {
      version: 1, variante: roh.variante, seed: roh.seed, rng: roh.rng.slice(),
      b: s.b, hh: s.hh, farben: s.farben.slice(), brett: roh.brett.slice(),
      level, ziele: ziele ? ziele.slice() : null, rest, weiter,
      gesammelt: roh.gesammelt, zuege: roh.zuege, verlauf,
    };
  } catch {
    return null;
  }
}

export const istGueltig = (roh) => ausSpeicher(roh) !== null;

/** Alles ist schon JSON-tauglich; tiefe Kopie, damit der Spielstand nicht mit dem laufenden Zustand geteilt wird */
export function zumSpeichern(z) {
  return JSON.parse(JSON.stringify(z));
}
