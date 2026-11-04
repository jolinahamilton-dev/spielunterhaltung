// Farben sortieren – Regeln, Löser (A*) und Level-Generator. Ohne DOM, auch im Worker nutzbar.
// Röhre = Array von Farb-IDs, unten → oben. Zug = Quelle a → Ziel b; es fließt der ganze
// gleichfarbige obere Block, soweit Platz ist. Ein Gießvorgang = 1 Zug.
import { erstelleZufall } from '../../kern/zufall.js';

export const STUFEN = Object.freeze({
  sanft:    { name: 'Sanft',    farben: [3, 4],  leer: 2, kapazitaet: 4, ziel: [4, 10] },
  leicht:   { name: 'Leicht',   farben: [5, 6],  leer: 2, kapazitaet: 4, ziel: [10, 18] },
  mittel:   { name: 'Mittel',   farben: [7, 8],  leer: 2, kapazitaet: 4, ziel: [16, 28] },
  schwer:   { name: 'Schwer',   farben: [9, 10], leer: 2, kapazitaet: 4, ziel: [22, 40] },
  knifflig: { name: 'Knifflig', farben: [8, 9],  leer: 2, kapazitaet: 5, ziel: [26, 60] },
});
export const STUFEN_IDS = Object.keys(STUFEN);
export const MAX_FARBEN = 10;          // so viele Farben hat die Palette
export const MAX_ROEHREN = 13;         // 12 + Zusatzröhre

/** Knotenbudgets (Rechenschritte, nicht Zeit → gleicher Seed, gleiches Level auf jedem Gerät) */
export const BUDGET = Object.freeze({ genau: 60000, gewichtet: 60000, hinweis: 80000, sackgasse: 15000 });
const MAX_VERSUCHE = 24;

// ---------------- Regeln ----------------

/** Oberer gleichfarbiger Block: { farbe, laenge } (leere Röhre: farbe -1) */
export function obenBlock(r) {
  const n = r.length;
  if (!n) return { farbe: -1, laenge: 0 };
  const farbe = r[n - 1];
  let i = n - 1;
  while (i > 0 && r[i - 1] === farbe) i--;
  return { farbe, laenge: n - i };
}

/** Wie viele Schichten flössen von a nach b? 0 = ungültiger Zug */
export function menge(roehren, kapazitaet, a, b) {
  if (a === b) return 0;
  const q = roehren[a], z = roehren[b];
  if (!q || !z || !q.length || z.length >= kapazitaet) return 0;
  const { farbe, laenge } = obenBlock(q);
  if (z.length && z[z.length - 1] !== farbe) return 0;
  return Math.min(laenge, kapazitaet - z.length);
}

/** Gießen → { roehren (neu), zug: [a, b, menge] } oder null */
export function giesse(roehren, kapazitaet, a, b) {
  const m = menge(roehren, kapazitaet, a, b);
  if (!m) return null;
  const neu = roehren.slice();
  const q = roehren[a];
  neu[a] = q.slice(0, q.length - m);
  neu[b] = roehren[b].concat(q.slice(q.length - m));
  return { roehren: neu, zug: [a, b, m] };
}

/** Zug [a, b, m] umkehren (m Schichten von b zurück nach a) */
export function umkehren(roehren, [a, b, m]) {
  const neu = roehren.slice();
  const z = roehren[b];
  neu[b] = z.slice(0, z.length - m);
  neu[a] = roehren[a].concat(z.slice(z.length - m));
  return neu;
}

export const istFertig = (r, kapazitaet) => r.length === kapazitaet && r.every((f) => f === r[0]);

/** Gelöst: jede Röhre leer oder voll mit genau einer Farbe */
export function geloest(roehren, kapazitaet) {
  return roehren.every((r) => r.length === 0 || istFertig(r, kapazitaet));
}

/** Alle gültigen Züge [a, b] (ohne Schnitte) */
export function gueltigeZuege(roehren, kapazitaet) {
  const z = [];
  for (let a = 0; a < roehren.length; a++) {
    for (let b = 0; b < roehren.length; b++) if (menge(roehren, kapazitaet, a, b)) z.push([a, b]);
  }
  return z;
}

/** Gibt es einen Zug, der den Zustand wirklich ändert (nicht nur Röhren tauscht)? */
export function hatSinnvollenZug(roehren, kapazitaet) {
  const t = alsText(roehren);
  return nachfolger(t, kapazitaet, () => true) > 0;
}

// ---------------- Löser ----------------
// Zustand intern als Text je Röhre (ein Zeichen pro Schicht), Röhrenreihenfolge bleibt erhalten,
// damit Züge auf echte Röhren-Nummern zeigen. Duplikate erkennt der sortierte Schlüssel.

const ZEICHEN = 'abcdefghijklmnopqrstuvwxyz';
const alsText = (roehren) => roehren.map((r) => r.map((f) => ZEICHEN[f]).join(''));
const schluessel = (t) => t.slice().sort().join('|');

function heuristik(t) {
  // Σ (Segmente − 1) + Σ_Farben (Röhren, in denen die Farbe unten liegt − 1): zulässig, Ziel = 0
  let h = 0;
  const unten = {};
  for (const s of t) {
    if (!s.length) continue;
    for (let i = 1; i < s.length; i++) if (s[i] !== s[i - 1]) h++;
    const c = s[0];
    if (unten[c]) h++; else unten[c] = 1;
  }
  return h;
}

const fertigText = (s, k) => {
  if (s.length !== k) return false;
  for (let i = 1; i < k; i++) if (s[i] !== s[0]) return false;
  return true;
};
const einfarbig = (s) => {
  for (let i = 1; i < s.length; i++) if (s[i] !== s[0]) return false;
  return true;
};

/** Erzeugt Nachfolger mit Schnitten; ruft besuche(t2, a, b) – liefert Anzahl */
function nachfolger(t, k, besuche) {
  let n = 0;
  let ersteLeere = -1;
  for (let i = 0; i < t.length; i++) if (!t[i].length) { ersteLeere = i; break; }
  for (let a = 0; a < t.length; a++) {
    const q = t[a];
    if (!q.length || fertigText(q, k)) continue;
    const c = q[q.length - 1];
    let lang = 1;
    while (lang < q.length && q[q.length - 1 - lang] === c) lang++;
    const qEinfarbig = lang === q.length;
    for (let b = 0; b < t.length; b++) {
      if (b === a) continue;
      const z = t[b];
      if (!z.length) {
        if (b !== ersteLeere || qEinfarbig) continue;   // nur erste leere, nie einfarbig umfüllen
      } else if (z.length >= k || z[z.length - 1] !== c) continue;
      const m = Math.min(lang, k - z.length);
      const t2 = t.slice();
      t2[a] = q.slice(0, q.length - m);
      t2[b] = z + q.slice(q.length - m);
      n++;
      if (besuche(t2, a, b) === false) return n;
    }
  }
  return n;
}

const geloestText = (t, k) => t.every((s) => !s.length || fertigText(s, k));

/** Binärer Min-Heap über (prio, ordnung) */
function erstelleHeap() {
  const p = [], v = [];
  const kleiner = (i, j) => p[i] < p[j];
  const tausche = (i, j) => { [p[i], p[j]] = [p[j], p[i]]; [v[i], v[j]] = [v[j], v[i]]; };
  return {
    get groesse() { return p.length; },
    rein(prio, wert) {
      p.push(prio); v.push(wert);
      let i = p.length - 1;
      while (i > 0) { const e = (i - 1) >> 1; if (!kleiner(i, e)) break; tausche(i, e); i = e; }
    },
    raus() {
      const w = v[0];
      const lp = p.pop(), lv = v.pop();
      if (p.length) {
        p[0] = lp; v[0] = lv;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < p.length && kleiner(l, m)) m = l;
          if (r < p.length && kleiner(r, m)) m = r;
          if (m === i) break;
          tausche(i, m); i = m;
        }
      }
      return w;
    },
  };
}

/**
 * A*-Suche. gewicht 1 = optimal; > 1 = schneller, nicht unbedingt kürzester Weg.
 * → { status: 'geloest' | 'unloesbar' | 'budget', zuege: [[a,b], …], knoten }
 */
export function loese(roehren, kapazitaet, { budget = BUDGET.genau, gewicht = 1 } = {}) {
  const start = alsText(roehren);
  if (geloestText(start, kapazitaet)) return { status: 'geloest', zuege: [], knoten: 0 };
  const zust = [start], eltern = [-1], zugA = [-1], zugB = [-1], gw = [0];
  const best = new Map([[schluessel(start), 0]]);
  const heap = erstelleHeap();
  const FAKTOR = 1024;   // Gleichstand: tiefere Knoten zuerst
  heap.rein(gewicht * heuristik(start) * FAKTOR, 0);
  let knoten = 0;
  while (heap.groesse) {
    const id = heap.raus();
    const t = zust[id], g = gw[id];
    if (best.get(schluessel(t)) < g) continue;     // veralteter Eintrag
    if (geloestText(t, kapazitaet)) {
      const zuege = [];
      for (let i = id; eltern[i] >= 0; i = eltern[i]) zuege.push([zugA[i], zugB[i]]);
      return { status: 'geloest', zuege: zuege.reverse(), knoten };
    }
    if (++knoten > budget) return { status: 'budget', zuege: null, knoten };
    nachfolger(t, kapazitaet, (t2, a, b) => {
      const k = schluessel(t2);
      const alt = best.get(k);
      if (alt !== undefined && alt <= g + 1) return;
      best.set(k, g + 1);
      const nid = zust.length;
      zust.push(t2); eltern.push(id); zugA.push(a); zugB.push(b); gw.push(g + 1);
      heap.rein((g + 1 + gewicht * heuristik(t2)) * FAKTOR - (g + 1), nid);
    });
  }
  return { status: 'unloesbar', zuege: null, knoten };
}

/**
 * Erst optimal, bei Budget-Überlauf gewichtet (Lösbarkeit trotzdem sicher).
 * → { status, zuege, optimal } – status 'unbekannt', wenn beides am Budget scheitert
 */
export function loeseBest(roehren, kapazitaet, { budget = BUDGET.genau, budgetGewichtet = BUDGET.gewichtet } = {}) {
  const genau = loese(roehren, kapazitaet, { budget });
  if (genau.status !== 'budget') return { status: genau.status, zuege: genau.zuege, optimal: genau.status === 'geloest' };
  for (const gewicht of [2, 4]) {
    const r = loese(roehren, kapazitaet, { budget: budgetGewichtet, gewicht });
    if (r.status === 'geloest') return { status: 'geloest', zuege: r.zuege, optimal: false };
    if (r.status === 'unloesbar') return { status: 'unloesbar', zuege: null, optimal: false };
  }
  return { status: 'unbekannt', zuege: null, optimal: false };
}

/** Lösungsweg nachspielen → true, wenn er gültig ist und gelöst endet */
export function pruefeLoesung(roehren, kapazitaet, zuege) {
  let r = roehren;
  for (const [a, b] of zuege) {
    const e = giesse(r, kapazitaet, a, b);
    if (!e) return false;
    r = e.roehren;
  }
  return geloest(r, kapazitaet);
}

// ---------------- Generator ----------------

export const levelSeed = (stufe, nr, versuch = 0) => `farben-v1-${stufe}-${nr}-${versuch}`;

function mischung(rng, farben, leer, kapazitaet) {
  const schichten = [];
  for (let f = 0; f < farben; f++) for (let i = 0; i < kapazitaet; i++) schichten.push(f);
  const gemischt = rng.mische(schichten);
  const roehren = [];
  for (let i = 0; i < farben; i++) roehren.push(gemischt.slice(i * kapazitaet, (i + 1) * kapazitaet));
  for (let i = 0; i < leer; i++) roehren.push([]);
  return roehren;
}

/** Zu leicht? (volle einfarbige Röhre oder K−1 gleiche am Stück) */
function zuLeicht(roehren, kapazitaet) {
  for (const r of roehren) {
    let lauf = 1;
    for (let i = 1; i < r.length; i++) {
      lauf = r[i] === r[i - 1] ? lauf + 1 : 1;
      if (lauf >= kapazitaet - 1) return true;
    }
  }
  return false;
}

/**
 * Level n einer Stufe – deterministisch aus (Stufe, n), garantiert lösbar ohne Zusatzröhre.
 * → { version, stufe, nr, kapazitaet, farben, roehren, optimum, optimal, loesung }
 */
export function erzeugeLevel(stufe, nr) {
  const st = STUFEN[stufe] || STUFEN.mittel;
  const id = STUFEN[stufe] ? stufe : 'mittel';
  const [zMin, zMax] = st.ziel;
  let ersatz = null;    // bester lösbarer Versuch außerhalb des Zielbereichs
  for (let v = 0; v < MAX_VERSUCHE; v++) {
    const rng = erstelleZufall(levelSeed(id, nr, v));
    const farben = rng.ganz(st.farben[0], st.farben[1]);
    const roehren = mischung(rng, farben, st.leer, st.kapazitaet);
    if (zuLeicht(roehren, st.kapazitaet)) continue;
    const r = loeseBest(roehren, st.kapazitaet);
    if (r.status !== 'geloest') continue;
    const laenge = r.zuege.length;
    const level = {
      version: 1, stufe: id, nr, kapazitaet: st.kapazitaet, farben, roehren,
      optimum: laenge, optimal: r.optimal, loesung: r.zuege,
    };
    if (laenge >= zMin && laenge <= zMax) return level;
    const abstand = laenge < zMin ? zMin - laenge : laenge - zMax;
    if (!ersatz || abstand < ersatz.abstand) ersatz = { abstand, level };
  }
  if (ersatz) return ersatz.level;
  // Notfall (praktisch nie): rückwärts aus dem gelösten Zustand – immer lösbar
  return notLevel(id, nr, st);
}

function notLevel(id, nr, st) {
  const rng = erstelleZufall(levelSeed(id, nr, 'not'));
  const farben = st.farben[0];
  let roehren = [];
  for (let f = 0; f < farben; f++) roehren.push(new Array(st.kapazitaet).fill(f));
  for (let i = 0; i < st.leer; i++) roehren.push([]);
  // zufällige Züge vorwärts – jeder Zustand bleibt lösbar? Nicht sicher, daher am Ende prüfen.
  for (let i = 0; i < 40; i++) {
    const z = gueltigeZuege(roehren, st.kapazitaet);
    const [a, b] = rng.wahl(z);
    roehren = giesse(roehren, st.kapazitaet, a, b).roehren;
  }
  const r = loeseBest(roehren, st.kapazitaet, { budget: 400000 });
  return {
    version: 1, stufe: id, nr, kapazitaet: st.kapazitaet, farben, roehren,
    optimum: r.zuege?.length ?? 0, optimal: r.optimal, loesung: r.zuege ?? [],
  };
}

// ---------------- Verlauf ----------------
// Einträge: ['g', a, b, menge] Gießen · ['r'] Zusatzröhre · ['n', alteRoehren, alteZuege] Neustart
// Zustand im Verlauf: { roehren, zuege }

/** Eintrag anwenden (auch Wiederholen) → neuer Zustand oder null, wenn er nicht passt */
export function vorwaerts(z, e, start, kapazitaet) {
  if (e[0] === 'g') {
    const r = giesse(z.roehren, kapazitaet, e[1], e[2]);
    if (!r || r.zug[2] !== e[3]) return null;
    return { roehren: r.roehren, zuege: z.zuege + 1 };
  }
  if (e[0] === 'r') return z.roehren.length >= MAX_ROEHREN ? null : { roehren: z.roehren.concat([[]]), zuege: z.zuege };
  if (e[0] === 'n') return { roehren: start.map((r) => r.slice()), zuege: 0 };
  return null;
}

/** Eintrag zurücknehmen → vorheriger Zustand oder null */
export function rueckwaerts(z, e, kapazitaet) {
  const r = z.roehren;
  if (e[0] === 'g') {
    const [, a, b, m] = e;
    if (!r[a] || !r[b] || r[b].length < m || r[a].length + m > kapazitaet) return null;
    return { roehren: umkehren(r, [a, b, m]), zuege: Math.max(0, z.zuege - 1) };
  }
  if (e[0] === 'r') return r.length && !r[r.length - 1].length ? { roehren: r.slice(0, -1), zuege: z.zuege } : null;
  if (e[0] === 'n') return { roehren: e[1].map((x) => x.slice()), zuege: e[2] };
  return null;
}

const gleicheRoehren = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------- Spielstand ----------------

const istGanz = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;

/** Prüft ein Röhren-Array (Typen, Längen, Farbbereich) */
export function roehrenGueltig(roehren, kapazitaet, farben) {
  return Array.isArray(roehren) && roehren.length >= 2 && roehren.length <= MAX_ROEHREN
    && roehren.every((r) => Array.isArray(r) && r.length <= kapazitaet && r.every((f) => istGanz(f, 0, farben - 1)));
}

/** Farbzählung muss zur Startaufstellung passen */
function gleicheSchichten(a, b) {
  const zaehle = (rs) => { const z = {}; for (const r of rs) for (const f of r) z[f] = (z[f] || 0) + 1; return JSON.stringify(Object.entries(z).sort()); };
  return zaehle(a) === zaehle(b);
}

function eintragGueltig(e, roehren, l) {
  if (!Array.isArray(e)) return false;
  if (e[0] === 'g') return e.length === 4 && istGanz(e[1], 0, roehren - 1) && istGanz(e[2], 0, roehren - 1) && istGanz(e[3], 1, 10);
  if (e[0] === 'r') return e.length === 1;
  if (e[0] === 'n') {
    return e.length === 3 && roehrenGueltig(e[1], l.kapazitaet, l.farben) && e[1].length <= roehren
      && gleicheSchichten(l.roehren, e[1]) && istGanz(e[2], 0, 1e6);
  }
  return false;
}

/** Gespeicherten Stand prüfen → true, wenn er geladen werden kann */
export function standGueltig(s) {
  if (!s || typeof s !== 'object') return false;
  if (!STUFEN[s.stufe] || !istGanz(s.nr, 1, 1e9)) return false;
  if (s.level === null) return true;   // Level wurde noch erzeugt → neu erzeugen
  const l = s.level;
  if (!l || typeof l !== 'object' || !istGanz(l.kapazitaet, 2, 8) || !istGanz(l.farben, 1, MAX_FARBEN)) return false;
  if (!istGanz(l.optimum, 0, 1000) || typeof l.optimal !== 'boolean') return false;
  if (!roehrenGueltig(l.roehren, l.kapazitaet, l.farben) || l.roehren.length > MAX_ROEHREN - 1) return false;
  if (!roehrenGueltig(s.roehren, l.kapazitaet, l.farben)) return false;
  if (s.roehren.length < l.roehren.length || s.roehren.length > l.roehren.length + 1) return false;
  if (!gleicheSchichten(l.roehren, s.roehren)) return false;
  if (!istGanz(s.zuege, 0, 1e6) || !istGanz(s.hinweise, 0, 1e6) || typeof s.zusatz !== 'boolean') return false;
  if (!Array.isArray(s.verlauf) || !Array.isArray(s.wieder) || s.verlauf.length > 20000 || s.wieder.length > 20000) return false;
  const n = l.roehren.length + 1;
  if (!s.verlauf.every((e) => eintragGueltig(e, n, l)) || !s.wieder.every((e) => eintragGueltig(e, n, l))) return false;
  // Verlauf muss vom aktuellen Zustand exakt zum Start zurückführen
  let z = { roehren: s.roehren, zuege: s.zuege };
  for (let i = s.verlauf.length - 1; i >= 0; i--) {
    z = rueckwaerts(z, s.verlauf[i], l.kapazitaet);
    if (!z) return false;
  }
  return gleicheRoehren(z.roehren, l.roehren) && z.zuege === 0;
}
