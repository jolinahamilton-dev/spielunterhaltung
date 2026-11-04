// Minesweeper – klassisches Feld ohne DOM (auch im Worker nutzbar).
// Zellen werden über den Index i = y * b + x angesprochen. Der Zustand wird an Ort und Stelle
// verändert (Felder bis 30×16, Rückgängig gibt es nur als „Fehlklick zurücknehmen“).

export const STUFEN = Object.freeze({
  anfaenger: { name: 'Anfänger', b: 9, h: 9, minen: 10 },
  fortgeschritten: { name: 'Fortgeschritten', b: 16, h: 16, minen: 40 },
  experte: { name: 'Experte', b: 30, h: 16, minen: 99 },
});
export const AUSGAENGE = ['entspannt', 'hardcore'];
export const LEER = 0, FLAGGE = 1, FRAGE = 2;
const STATUS = ['laeuft', 'gewonnen', 'verloren'];

// ---------- Nachbarn & Zahlen ----------

/** Indizes der bis zu 8 Nachbarn von i */
export function nachbarn(b, h, i) {
  const x = i % b, y = (i - x) / b;
  const n = [];
  for (let dy = -1; dy <= 1; dy++) {
    const ny = y + dy;
    if (ny < 0 || ny >= h) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      if ((dx || dy) && nx >= 0 && nx < b) n.push(ny * b + nx);
    }
  }
  return n;
}

/** Nachbar-Listen für ein ganzes Feld (einmal berechnen, oft benutzen) */
export function nachbarListe(b, h) {
  return Array.from({ length: b * h }, (_, i) => nachbarn(b, h, i));
}

/** Minenzahl rund um jede Zelle */
export function zaehleZahlen(minen, b, h) {
  const z = new Uint8Array(b * h);
  for (let i = 0; i < b * h; i++) {
    if (!minen[i]) continue;
    for (const n of nachbarn(b, h, i)) z[n]++;
  }
  return z;
}

/** Zellen im 3×3-Bereich um start (inkl. start) */
export function startBereich(b, h, start) {
  return [start, ...nachbarn(b, h, start)];
}

/**
 * Minen verteilen, sodass der erste Klick eine Null ist (3×3 frei).
 * Passt das nicht, bleibt nur die Klickzelle frei.
 * @returns {Uint8Array} 1 = Mine
 */
export function verteileMinen(b, h, anzahl, start, rng) {
  const n = b * h;
  const frei = new Uint8Array(n);
  const bereich = n - 9 >= anzahl ? startBereich(b, h, start) : [start];
  for (const i of bereich) frei[i] = 1;
  const kandidaten = [];
  for (let i = 0; i < n; i++) if (!frei[i]) kandidaten.push(i);
  // teilweises Fisher-Yates: nur die ersten `anzahl` Plätze ziehen
  const k = Math.min(anzahl, kandidaten.length);
  for (let j = 0; j < k; j++) {
    const r = j + Math.floor(rng.zahl() * (kandidaten.length - j));
    [kandidaten[j], kandidaten[r]] = [kandidaten[r], kandidaten[j]];
  }
  const minen = new Uint8Array(n);
  for (let j = 0; j < k; j++) minen[kandidaten[j]] = 1;
  return minen;
}

// ---------- Spielzustand ----------

export function neuesKlassisch({ stufe = 'anfaenger', seed = 'x', ausgang = 'entspannt', ohneRaten = true } = {}) {
  const s = STUFEN[stufe] || STUFEN.anfaenger;
  const n = s.b * s.h;
  return {
    modus: 'klassisch',
    stufe: STUFEN[stufe] ? stufe : 'anfaenger',
    b: s.b, h: s.h, anzahl: s.minen,
    seed: String(seed),
    ausgang: AUSGAENGE.includes(ausgang) ? ausgang : 'entspannt',
    ohneRaten: Boolean(ohneRaten),
    geraten: false,          // „ohne Raten“ hat nicht geklappt → ein Rateschritt möglich
    start: null,             // Index des ersten Klicks
    minen: null,             // Uint8Array, erst nach dem ersten Klick
    zahlen: null,
    offen: new Uint8Array(n),
    marke: new Uint8Array(n),   // 0 leer · 1 Flagge · 2 Fragezeichen
    treffer: new Uint8Array(n), // aufgedeckte Minen
    offenZahl: 0,
    letzteTreffer: [],       // Treffer der letzten Aktion (für „Fehlklick zurücknehmen“)
    ruecknahmen: 0,
    hinweise: 0,
    status: 'laeuft',
  };
}

/** Minen setzen (nach dem ersten Klick) und Startbereich aufdecken */
export function setzeMinen(z, start, minen) {
  z.start = start;
  z.minen = minen instanceof Uint8Array ? minen : Uint8Array.from(minen);
  z.zahlen = zaehleZahlen(z.minen, z.b, z.h);
}

/** Minen aus einer Liste von Indizes */
export function minenAusListe(n, liste) {
  const m = new Uint8Array(n);
  for (const i of liste) m[i] = 1;
  return m;
}

export const trefferZahl = (z) => z.treffer.reduce((a, t) => a + t, 0);
export const flaggenZahl = (z) => z.marke.reduce((a, m) => a + (m === FLAGGE ? 1 : 0), 0);
export const sichereZellen = (z) => z.b * z.h - z.anzahl;

function pruefeSieg(z) {
  if (z.status === 'laeuft' && z.offenZahl >= sichereZellen(z)) z.status = 'gewonnen';
}

function triffMine(z, i, erg) {
  z.treffer[i] = 1;
  z.marke[i] = LEER;
  z.letzteTreffer.push(i);
  erg.treffer.push(i);
  if (z.ausgang === 'hardcore') z.status = 'verloren';
}

/** Iterative Flutfüllung ab i (i ist keine Mine) */
function flut(z, i, erg) {
  const stapel = [i];
  while (stapel.length) {
    const c = stapel.pop();
    if (z.offen[c] || z.treffer[c] || z.minen[c]) continue;
    if (z.marke[c] === FLAGGE && c !== i) continue;
    z.offen[c] = 1;
    z.marke[c] = LEER;
    z.offenZahl++;
    erg.geoeffnet.push(c);
    if (z.zahlen[c] === 0) {
      for (const n of nachbarn(z.b, z.h, c)) if (!z.offen[n]) stapel.push(n);
    }
  }
}

const neuesErgebnis = () => ({ geoeffnet: [], treffer: [], fehlAkkord: null });

/** Eine verdeckte Zelle aufdecken (Flaggen schützen, außer mit erzwingen) */
function deckeEinzeln(z, i, erg, erzwingen = false) {
  if (z.offen[i] || z.treffer[i]) return;
  if (z.marke[i] === FLAGGE && !erzwingen) return;
  if (z.minen[i]) triffMine(z, i, erg);
  else flut(z, i, erg);
}

/** Bekannte Minen um i: Flaggen und Treffer */
function bekannteUm(z, i) {
  let k = 0;
  for (const n of nachbarn(z.b, z.h, i)) if (z.treffer[n] || (!z.offen[n] && z.marke[n] === FLAGGE)) k++;
  return k;
}

/**
 * Hauptaktion auf Zelle i: verdeckt → aufdecken; aufgedeckte Zahl → Chording.
 * Voraussetzung: Minen sind gesetzt.
 * @returns {{ geoeffnet:number[], treffer:number[], fehlAkkord:number[]|null }}
 */
export function primaer(z, i, { erzwingen = false } = {}) {
  const erg = neuesErgebnis();
  if (z.status !== 'laeuft' || !z.minen) return erg;
  if (z.offen[i]) {
    if (z.zahlen[i] === 0) return erg;
    const ns = nachbarn(z.b, z.h, i);
    const verdeckt = ns.filter((n) => !z.offen[n] && !z.treffer[n] && z.marke[n] !== FLAGGE);
    if (!verdeckt.length) return erg;
    if (bekannteUm(z, i) !== z.zahlen[i]) { erg.fehlAkkord = verdeckt; return erg; }
    z.letzteTreffer = [];
    for (const n of verdeckt) {
      if (z.status !== 'laeuft') break;
      deckeEinzeln(z, n, erg);
    }
  } else {
    if (z.treffer[i] || (z.marke[i] === FLAGGE && !erzwingen)) return erg;
    z.letzteTreffer = [];
    deckeEinzeln(z, i, erg, erzwingen);
  }
  pruefeSieg(z);
  return erg;
}

/** Rechtsklick: leer → Flagge → (Fragezeichen →) leer. Liefert true bei Änderung. */
export function wechsleMarke(z, i, fragezeichen = false) {
  if (z.status !== 'laeuft' || z.offen[i] || z.treffer[i]) return false;
  const m = z.marke[i];
  z.marke[i] = m === LEER ? FLAGGE : m === FLAGGE && fragezeichen ? FRAGE : LEER;
  return true;
}

/** Taste F: Flagge an/aus (ohne Fragezeichen-Stufe) */
export function schalteFlagge(z, i) {
  if (z.status !== 'laeuft' || z.offen[i] || z.treffer[i]) return false;
  z.marke[i] = z.marke[i] === FLAGGE ? LEER : FLAGGE;
  return true;
}

/** Taste ?: Fragezeichen an/aus */
export function schalteFrage(z, i) {
  if (z.status !== 'laeuft' || z.offen[i] || z.treffer[i]) return false;
  z.marke[i] = z.marke[i] === FRAGE ? LEER : FRAGE;
  return true;
}

/** Fehlklick zurücknehmen (nur Entspannt, direkt nach einem Treffer) */
export const kannZuruecknehmen = (z) => z.ausgang === 'entspannt' && z.status === 'laeuft' && z.letzteTreffer.length > 0;

export function nimmZurueck(z) {
  if (!kannZuruecknehmen(z)) return false;
  for (const i of z.letzteTreffer) { z.treffer[i] = 0; z.marke[i] = FLAGGE; }
  z.ruecknahmen++;
  z.letzteTreffer = [];
  return true;
}

/** Gleiches Feld von vorn: alles verdeckt, Startbereich wieder offen */
export function vonVorn(z) {
  const n = z.b * z.h;
  z.offen = new Uint8Array(n);
  z.marke = new Uint8Array(n);
  z.treffer = new Uint8Array(n);
  z.offenZahl = 0;
  z.letzteTreffer = [];
  z.ruecknahmen = 0;
  z.hinweise = 0;
  z.status = 'laeuft';
  if (z.minen && z.start !== null) primaer(z, z.start);
}

// ---------- Bitmasken ↔ Base64 ----------

/** Uint8Array mit 0/1 → Base64 (8 Zellen pro Byte) */
export function bitsZuB64(werte) {
  const bytes = new Uint8Array(Math.ceil(werte.length / 8));
  for (let i = 0; i < werte.length; i++) if (werte[i]) bytes[i >> 3] |= 1 << (i & 7);
  return bytesZuB64(bytes);
}

export function b64ZuBits(text, n) {
  const bytes = b64ZuBytes(text);
  if (!bytes || bytes.length !== Math.ceil(n / 8)) return null;
  const werte = new Uint8Array(n);
  for (let i = 0; i < n; i++) werte[i] = (bytes[i >> 3] >> (i & 7)) & 1;
  return werte;
}

export function bytesZuB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function b64ZuBytes(text) {
  if (typeof text !== 'string' || text.length > 100000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return null;
  try {
    const s = atob(text);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
  } catch { return null; }
}

// ---------- Speichern / Laden ----------

export function zumSpeichern(z) {
  return {
    modus: 'klassisch',
    stufe: z.stufe, b: z.b, h: z.h, anzahl: z.anzahl, seed: z.seed,
    ausgang: z.ausgang, ohneRaten: z.ohneRaten, geraten: z.geraten,
    start: z.start,
    minen: z.minen ? bitsZuB64(z.minen) : null,
    offen: bitsZuB64(z.offen),
    flagge: bitsZuB64(z.marke.map((m) => (m === FLAGGE ? 1 : 0))),
    frage: bitsZuB64(z.marke.map((m) => (m === FRAGE ? 1 : 0))),
    treffer: bitsZuB64(z.treffer),
    letzteTreffer: z.letzteTreffer.slice(),
    ruecknahmen: z.ruecknahmen, hinweise: z.hinweise, status: z.status,
  };
}

const istZaehler = (v) => Number.isInteger(v) && v >= 0 && v < 1e9;

/** Gespeicherten Stand prüfen und laden → Zustand oder null (ungültig) */
export function ausSpeicher(st) {
  if (!st || typeof st !== 'object' || st.modus !== 'klassisch') return null;
  const s = STUFEN[st.stufe];
  if (!s || st.b !== s.b || st.h !== s.h || st.anzahl !== s.minen) return null;
  if (typeof st.seed !== 'string' || st.seed.length > 64 || !AUSGAENGE.includes(st.ausgang)) return null;
  if (!STATUS.includes(st.status) || ![st.ruecknahmen, st.hinweise].every(istZaehler)) return null;
  const n = s.b * s.h;
  const z = neuesKlassisch({ stufe: st.stufe, seed: st.seed, ausgang: st.ausgang, ohneRaten: st.ohneRaten === true });
  z.geraten = st.geraten === true;
  const offen = b64ZuBits(st.offen, n), flagge = b64ZuBits(st.flagge, n), frage = b64ZuBits(st.frage, n), treffer = b64ZuBits(st.treffer, n);
  if (!offen || !flagge || !frage || !treffer) return null;
  if (st.minen === null) {
    if (st.start !== null || offen.some(Boolean) || treffer.some(Boolean)) return null;
  } else {
    if (!Number.isInteger(st.start) || st.start < 0 || st.start >= n) return null;
    const minen = b64ZuBits(st.minen, n);
    if (!minen || minen.reduce((a, m) => a + m, 0) !== s.minen || minen[st.start]) return null;
    for (let i = 0; i < n; i++) if ((offen[i] && minen[i]) || (treffer[i] && !minen[i]) || (offen[i] && treffer[i])) return null;
    setzeMinen(z, st.start, minen);
  }
  if (!Array.isArray(st.letzteTreffer) || st.letzteTreffer.length > n
    || !st.letzteTreffer.every((i) => Number.isInteger(i) && i >= 0 && i < n && treffer[i])) return null;
  z.offen = offen;
  z.treffer = treffer;
  for (let i = 0; i < n; i++) z.marke[i] = offen[i] || treffer[i] ? LEER : flagge[i] ? FLAGGE : frage[i] ? FRAGE : LEER;
  z.offenZahl = offen.reduce((a, o) => a + o, 0);
  z.letzteTreffer = st.letzteTreffer.slice();
  z.ruecknahmen = st.ruecknahmen;
  z.hinweise = st.hinweise;
  z.status = st.status;
  // Status zur Sicherheit aus dem Feld ableiten
  if (z.status === 'gewonnen' && z.offenZahl < sichereZellen(z)) z.status = 'laeuft';
  if (z.status === 'laeuft') pruefeSieg(z);
  return z;
}
