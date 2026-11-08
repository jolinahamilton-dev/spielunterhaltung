// Solitär (Klondike-Regeln): reine Logik ohne DOM, auch im Worker nutzbar.
// Karte = 0–51: Farbe = id div 13 (0 Herz, 1 Karo, 2 Pik, 3 Kreuz), Rang = id mod 13 (0 Ass … 12 König).
// Zustand z = { sp:[{k:[Karten unten→oben], zu:Anzahl verdeckter Karten unten}], f:[Anzahl je Farbe],
//               stapel:[…], ablage:[…], zieh:1|3 }. Oberste Karte = letztes Feld.
//
// Züge (kleine Zahlenlisten, JSON-tauglich):
//   [0] ziehen · [1] Ablagestapel umdrehen · [2,c] Ablage→Spalte · [3] Ablage→Ablagefeld
//   [4,a,b,n] n Karten Spalte a→b · [5,a] Spalte a→Ablagefeld · [6,s,b] Ablagefeld s→Spalte b
//   [7] automatisch alles Mögliche auf die Ablagefelder (ein Zug)
import { erstelleZufall } from '../../kern/zufall.js';

export const ANZAHL = 52;
export const SPALTEN = 7;
export const ZUEGE_MAX = 6000;
export const FARBEN = ['Herz', 'Karo', 'Pik', 'Kreuz'];
export const RAENGE = ['Ass', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Bube', 'Dame', 'König'];
export const RANG_KURZ = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'B', 'D', 'K'];

export const STUFEN = Object.freeze({
  leicht: { name: 'Leicht', zieh: 1, pruefen: true, schnell: 80, budget: 4000, budgetSpaet: 40000, zuLeicht: 0 },
  mittel: { name: 'Mittel', zieh: 3, pruefen: false },
  schwer: { name: 'Schwer', zieh: 3, pruefen: true, schnell: 40, budget: 12000, budgetSpaet: 60000, zuLeicht: 250 },
});
export const STUFEN_IDS = Object.keys(STUFEN);

export const farbeVon = (id) => Math.floor(id / 13);
export const rangVon = (id) => id % 13;
export const istRot = (id) => id < 26;
export const kartenName = (id) => `${FARBEN[farbeVon(id)]} ${RAENGE[rangVon(id)]}`;

// ---------- Geben ----------
export function geben(deck, zieh) {
  const sp = [];
  let p = 0;
  for (let j = 0; j < SPALTEN; j++) {
    sp.push({ k: deck.slice(p, p + j + 1), zu: j });
    p += j + 1;
  }
  return { sp, f: [0, 0, 0, 0], stapel: deck.slice(p), ablage: [], zieh };
}

// ---------- Regeln ----------
const oben = (liste) => liste[liste.length - 1];
const istZahl = (n, a, b) => Number.isInteger(n) && n >= a && n <= b;

function legtAuf(karte, spalte) {
  if (spalte.k.length === 0) return rangVon(karte) === 12;
  const t = oben(spalte.k);
  return rangVon(t) === rangVon(karte) + 1 && istRot(t) !== istRot(karte);
}
const aufAblage = (z, karte) => z.f[farbeVon(karte)] === rangVon(karte);

function ohneOben(spalte, n) {
  const k = spalte.k.slice(0, spalte.k.length - n);
  return { k, zu: k.length === 0 ? 0 : Math.min(spalte.zu, k.length - 1) };
}
const mitSpalten = (z, aend) => {
  const sp = z.sp.slice();
  for (const [i, s] of aend) sp[i] = s;
  return sp;
};
const mitF = (z, farbe) => { const f = z.f.slice(); f[farbe]++; return f; };

function autoAblage(z) {
  let aktuell = z;
  let getan = false;
  for (;;) {
    let weiter = false;
    const a = oben(aktuell.ablage);
    if (a !== undefined && aufAblage(aktuell, a)) {
      aktuell = { ...aktuell, ablage: aktuell.ablage.slice(0, -1), f: mitF(aktuell, farbeVon(a)) };
      weiter = true;
    }
    for (let c = 0; c < SPALTEN; c++) {
      const sp = aktuell.sp[c];
      const t = oben(sp.k);
      if (t !== undefined && aufAblage(aktuell, t)) {
        aktuell = { ...aktuell, sp: mitSpalten(aktuell, [[c, ohneOben(sp, 1)]]), f: mitF(aktuell, farbeVon(t)) };
        weiter = true;
      }
    }
    if (!weiter) break;
    getan = true;
  }
  return getan ? aktuell : null;
}

/** Wendet einen Zug an → neuer Zustand oder null (unzulässig). Prüft alle Eingaben (nicht vertrauenswürdig). */
export function wende(z, zug) {
  if (!Array.isArray(zug)) return null;
  switch (zug[0]) {
    case 0: {
      if (zug.length !== 1 || z.stapel.length === 0) return null;
      const n = Math.min(z.zieh, z.stapel.length);
      return { ...z, stapel: z.stapel.slice(0, -n), ablage: z.ablage.concat(z.stapel.slice(-n).reverse()) };
    }
    case 1:
      if (zug.length !== 1 || z.stapel.length !== 0 || z.ablage.length === 0) return null;
      return { ...z, stapel: z.ablage.slice().reverse(), ablage: [] };
    case 2: {
      if (zug.length !== 2 || !istZahl(zug[1], 0, SPALTEN - 1)) return null;
      const k = oben(z.ablage);
      if (k === undefined || !legtAuf(k, z.sp[zug[1]])) return null;
      const sp = z.sp[zug[1]];
      return { ...z, ablage: z.ablage.slice(0, -1), sp: mitSpalten(z, [[zug[1], { k: sp.k.concat(k), zu: sp.zu }]]) };
    }
    case 3: {
      if (zug.length !== 1) return null;
      const k = oben(z.ablage);
      if (k === undefined || !aufAblage(z, k)) return null;
      return { ...z, ablage: z.ablage.slice(0, -1), f: mitF(z, farbeVon(k)) };
    }
    case 4: {
      if (zug.length !== 4 || !istZahl(zug[1], 0, SPALTEN - 1) || !istZahl(zug[2], 0, SPALTEN - 1) || zug[1] === zug[2]) return null;
      const [, a, b, n] = zug;
      const von = z.sp[a], nach = z.sp[b];
      if (!Number.isInteger(n) || n < 1 || n > von.k.length - von.zu) return null;
      const lauf = von.k.slice(von.k.length - n);
      if (!legtAuf(lauf[0], nach)) return null;
      return { ...z, sp: mitSpalten(z, [[a, ohneOben(von, n)], [b, { k: nach.k.concat(lauf), zu: nach.zu }]]) };
    }
    case 5: {
      if (zug.length !== 2 || !istZahl(zug[1], 0, SPALTEN - 1)) return null;
      const sp = z.sp[zug[1]];
      const k = oben(sp.k);
      if (k === undefined || !aufAblage(z, k)) return null;
      return { ...z, sp: mitSpalten(z, [[zug[1], ohneOben(sp, 1)]]), f: mitF(z, farbeVon(k)) };
    }
    case 6: {
      if (zug.length !== 3 || !istZahl(zug[1], 0, 3) || !istZahl(zug[2], 0, SPALTEN - 1)) return null;
      const s = zug[1];
      if (z.f[s] === 0) return null;
      const k = s * 13 + z.f[s] - 1;
      const sp = z.sp[zug[2]];
      if (!legtAuf(k, sp)) return null;
      const f = z.f.slice(); f[s]--;
      return { ...z, f, sp: mitSpalten(z, [[zug[2], { k: sp.k.concat(k), zu: sp.zu }]]) };
    }
    case 7:
      return zug.length === 1 ? autoAblage(z) : null;
    default:
      return null;
  }
}

export const gewonnen = (z) => z.f.every((n) => n === 13);
export const anzahlAblage = (z) => z.f[0] + z.f[1] + z.f[2] + z.f[3];
export const anzahlVerdeckt = (z) => z.sp.reduce((s, c) => s + c.zu, 0);

// ---------- Ziele (Bedienung) ----------
/** quelle: {ort:'ablage'} | {ort:'spalte', s, i} | {ort:'fundament', s}; ziel: {ort:'spalte', s} | {ort:'fundament'} → Zug oder null */
export function zugFuer(z, quelle, ziel) {
  let zug = null;
  if (ziel.ort === 'fundament') {
    if (quelle.ort === 'ablage') zug = [3];
    else if (quelle.ort === 'spalte' && quelle.i === z.sp[quelle.s]?.k.length - 1) zug = [5, quelle.s];
  } else if (ziel.ort === 'spalte') {
    if (quelle.ort === 'ablage') zug = [2, ziel.s];
    else if (quelle.ort === 'spalte') zug = [4, quelle.s, ziel.s, z.sp[quelle.s].k.length - quelle.i];
    else if (quelle.ort === 'fundament') zug = [6, quelle.s, ziel.s];
  }
  return zug && wende(z, zug) ? zug : null;
}

/** Bestes Ziel für Tippen/Enter: Ablagefeld vor Spalte, volle Spalte vor leerer, reine Verschiebung eines ganzen Königs nie. */
export function autoZug(z, quelle) {
  if (quelle.ort === 'fundament') {
    for (let c = 0; c < SPALTEN; c++) { const m = [6, quelle.s, c]; if (wende(z, m)) return m; }
    return null;
  }
  const direkt = zugFuer(z, quelle, { ort: 'fundament' });
  if (direkt) return direkt;
  let leer = null;
  for (let c = 0; c < SPALTEN; c++) {
    if (quelle.ort === 'spalte' && c === quelle.s) continue;
    const m = zugFuer(z, quelle, { ort: 'spalte', s: c });
    if (!m) continue;
    if (z.sp[c].k.length === 0) {
      if (quelle.ort === 'spalte' && quelle.i === 0) continue; // König allein verschieben bringt nichts
      leer = leer || m;
    } else return m;
  }
  return leer;
}

// ---------- Löser ----------
function sicherAblage(z) {
  const sicher = (k) => {
    if (!aufAblage(z, k)) return false;
    const r = rangVon(k);
    if (r <= 1) return true;
    const [a, b] = istRot(k) ? [2, 3] : [0, 1];
    return z.f[a] >= r && z.f[b] >= r;
  };
  const a = oben(z.ablage);
  if (a !== undefined && sicher(a)) return [3];
  for (let c = 0; c < SPALTEN; c++) {
    const t = oben(z.sp[c].k);
    if (t !== undefined && sicher(t)) return [5, c];
  }
  return null;
}

/** Zugfolgen in Prüfreihenfolge. Eine Folge ist ein Makro (z. B. „n× ziehen, dann spielen“). */
function kandidaten(z) {
  const s = sicherAblage(z);
  if (s) return [[s]];
  const liste = [];
  const add = (p, folge) => liste.push({ p, folge });
  for (let c = 0; c < SPALTEN; c++) {
    const t = oben(z.sp[c].k);
    if (t !== undefined && aufAblage(z, t)) add(1, [[5, c]]);
  }
  const a = oben(z.ablage);
  if (a !== undefined && aufAblage(z, a)) add(1, [[3]]);

  for (let c = 0; c < SPALTEN; c++) {
    const sp = z.sp[c];
    const len = sp.k.length;
    for (let i = sp.zu; i < len; i++) {
      let leerGesehen = false;
      for (let b = 0; b < SPALTEN; b++) {
        if (b === c || !legtAuf(sp.k[i], z.sp[b])) continue;
        if (z.sp[b].k.length === 0) {
          if (i === 0 || leerGesehen) continue;
          leerGesehen = true;
        }
        add(i === sp.zu && sp.zu > 0 ? 2 : i === 0 ? 3 : 5, [[4, c, b, len - i]]);
      }
    }
  }
  if (a !== undefined) {
    let leerGesehen = false;
    for (let b = 0; b < SPALTEN; b++) {
      if (!legtAuf(a, z.sp[b])) continue;
      if (z.sp[b].k.length === 0) { if (leerGesehen) continue; leerGesehen = true; }
      add(4, [[2, b]]);
    }
  }
  // Stapel-Makros
  const gesamt = z.stapel.length + z.ablage.length;
  if (gesamt > 0) {
    const gesehen = new Set();
    if (a !== undefined) gesehen.add(a);
    const maxSchritte = Math.ceil(gesamt / z.zieh) + 2;
    let c = z;
    const folge = [];
    for (let d = 1; d <= maxSchritte; d++) {
      const m = c.stapel.length > 0 ? [0] : [1];
      c = wende(c, m);
      if (!c) break;
      folge.push(m);
      const t = oben(c.ablage);
      if (t === undefined || gesehen.has(t)) continue;
      gesehen.add(t);
      if (aufAblage(c, t)) add(6 + d / 100, [...folge, [3]]);
      let leerGesehen = false;
      for (let b = 0; b < SPALTEN; b++) {
        if (!legtAuf(t, c.sp[b])) continue;
        if (c.sp[b].k.length === 0) { if (leerGesehen) continue; leerGesehen = true; }
        add(7 + d / 100, [...folge, [2, b]]);
      }
    }
  }
  return liste.sort((x, y) => x.p - y.p).map((e) => e.folge);
}

function schluessel(z) {
  const spalten = z.sp.map((c) => `${c.zu}:${c.k.join(',')}`).sort().join('|');
  let rest;
  if (z.zieh === 1) {
    // Bei „1 ziehen“ kommt jede Stapelstellung durch Ziehen von selbst: nur die Kreisfolge zählt
    const ring = z.ablage.concat(z.stapel.slice().reverse());
    if (ring.length === 0) rest = '';
    else {
      let m = 0;
      for (let i = 1; i < ring.length; i++) if (ring[i] < ring[m]) m = i;
      rest = ring.slice(m).concat(ring.slice(0, m)).join(',');
    }
  } else rest = `${z.stapel.join(',')}/${z.ablage.join(',')}`;
  return `${spalten}#${z.f.join(',')}#${rest}`;
}

function anwenden(z, folge) {
  let n = z;
  for (const m of folge) { n = wende(n, m); if (!n) return null; }
  return n;
}

/**
 * Tiefensuche mit Gedächtnis und Schritt-Budget (Knoten, keine Zeit → überall gleiches Ergebnis).
 * → { gefunden, zuege (flache Zugliste bis zum Sieg), knoten, vollstaendig }
 */
export function loese(z0, { budget = 20000 } = {}) {
  const besucht = new Set([schluessel(z0)]);
  const pfad = [];
  let knoten = 0, abgebrochen = false;

  function dfs(z) {
    if (gewonnen(z)) return true;
    if (++knoten > budget) { abgebrochen = true; return false; }
    for (const folge of kandidaten(z)) {
      const n = anwenden(z, folge);
      if (!n) continue;
      const key = schluessel(n);
      if (besucht.has(key)) continue;
      besucht.add(key);
      for (const m of folge) pfad.push(m);
      if (dfs(n)) return true;
      pfad.length -= folge.length;
      if (abgebrochen) return false;
    }
    return false;
  }
  const ok = dfs(z0);
  return { gefunden: ok, zuege: ok ? pfad : null, knoten, vollstaendig: !ok && !abgebrochen };
}

/**
 * Gibt es von hier aus noch einen weiterführenden Zug (mehr Karten auf den Ablagen oder weniger verdeckte)?
 * → true / false / null (Budget erschöpft, unklar)
 */
export function gibtFortschritt(z0, budget = 1500) {
  const f0 = anzahlAblage(z0), v0 = anzahlVerdeckt(z0);
  const besucht = new Set([schluessel(z0)]);
  const warte = [z0];
  let knoten = 0;
  for (let i = 0; i < warte.length; i++) {
    const z = warte[i];
    if (anzahlAblage(z) > f0 || anzahlVerdeckt(z) < v0) return true;
    if (++knoten > budget) return null;
    for (const folge of kandidaten(z)) {
      const n = anwenden(z, folge);
      if (!n) continue;
      const key = schluessel(n);
      if (besucht.has(key)) continue;
      besucht.add(key);
      warte.push(n);
    }
  }
  return false;
}

/** Heuristischer Zug ohne Gewähr (wenn der Löser nichts findet) */
export function heuristischerZug(z) {
  const k = kandidaten(z);
  return k.length ? k[0][0] : null;
}

/** Hinweis → { zug, gewinnWeg:true|false|null } (null = Budget erschöpft). zug kann null sein. */
export function hinweisFuer(z, budget = 25000) {
  if (gewonnen(z)) return { zug: null, gewinnWeg: true };
  const r = loese(z, { budget });
  if (r.gefunden && r.zuege.length) return { zug: r.zuege[0], gewinnWeg: true };
  return { zug: heuristischerZug(z), gewinnWeg: r.vollstaendig ? false : null };
}

// ---------- Generator ----------
const deckAus = (rnd) => rnd.mische(Array.from({ length: ANZAHL }, (_, i) => i));

/** Festes Rückfall-Deck: ab Versuch-Grenze nie nötig, im Test als lösbar belegt */
export const RUECKFALL = Object.freeze({ leicht: 'rueckfall-leicht', schwer: 'rueckfall-schwer' });

/**
 * Erzeugt ein Deck (Permutation) für die Stufe. Gleicher Seed → gleiches Deck (Schritt-Budgets).
 * → { deck, versuche, geprueft, knoten }
 */
export function erzeuge(stufe, seed, maxVersuche = 150) {
  const cfg = STUFEN[stufe];
  if (!cfg) throw new Error('Unbekannte Stufe');
  if (!cfg.pruefen) return { deck: deckAus(erstelleZufall(`${seed}|${stufe}|0`)), versuche: 1, geprueft: false, knoten: 0 };
  for (let v = 0; v < maxVersuche; v++) {
    const deck = deckAus(erstelleZufall(`${seed}|${stufe}|${v}`));
    const z = geben(deck, cfg.zieh);
    const r = loese(z, { budget: v < cfg.schnell ? cfg.budget : cfg.budgetSpaet });
    if (!r.gefunden) continue;
    if (cfg.zuLeicht && loese(z, { budget: cfg.zuLeicht }).gefunden) continue;
    return { deck, versuche: v + 1, geprueft: true, knoten: r.knoten };
  }
  return { deck: rueckfallDeck(stufe), versuche: maxVersuche, geprueft: true, knoten: 0 };
}

/** Deterministisch gesucht (kleinste Versuchsnummer mit großem Budget), danach als Konstante gültig */
export function rueckfallDeck(stufe) {
  const cfg = STUFEN[stufe];
  for (let v = 0; ; v++) {
    const deck = deckAus(erstelleZufall(`${RUECKFALL.leicht}|${v}`));
    if (loese(geben(deck, cfg.zieh), { budget: 60000 }).gefunden) return deck;
  }
}

// ---------- Spiel (Zustand + Verlauf) ----------
export function neuesSpiel(deck, stufe, seed) {
  return { stufe, seed, deal: deck.slice(), zieh: STUFEN[stufe].zieh, z: geben(deck, STUFEN[stufe].zieh), zuege: [], vor: [], alt: [] };
}

/** Zug ausführen → neues Spiel oder null (unzulässig oder Verlauf zu lang). Wiederholen-Liste verfällt. */
export function zieheZug(sp, zug) {
  if (sp.zuege.length >= ZUEGE_MAX) return null;
  const n = wende(sp.z, zug);
  if (!n) return null;
  return { ...sp, z: n, zuege: sp.zuege.concat([zug]), vor: [], alt: sp.alt.concat([sp.z]) };
}
export const kannRueckgaengig = (sp) => sp.zuege.length > 0;
export const kannWiederholen = (sp) => sp.vor.length > 0;
export function rueckgaengig(sp) {
  if (!sp.zuege.length) return null;
  return { ...sp, z: sp.alt[sp.alt.length - 1], alt: sp.alt.slice(0, -1), zuege: sp.zuege.slice(0, -1), vor: sp.vor.concat([sp.zuege[sp.zuege.length - 1]]) };
}
export function wiederholen(sp) {
  if (!sp.vor.length) return null;
  const zug = sp.vor[sp.vor.length - 1];
  const n = wende(sp.z, zug);
  if (!n) return null;
  return { ...sp, z: n, alt: sp.alt.concat([sp.z]), zuege: sp.zuege.concat([zug]), vor: sp.vor.slice(0, -1) };
}
export const neustart = (sp) => neuesSpiel(sp.deal, sp.stufe, sp.seed);

// ---------- Spielstand ----------
export function zumSpeichern(sp) {
  return { v: 1, stufe: sp.stufe, seed: sp.seed, deal: sp.deal.slice(), zuege: sp.zuege.map((m) => m.slice()), vor: sp.vor.map((m) => m.slice()) };
}

/** Streng: wirft bei jedem Fehler */
export function ausSpeicher(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o) || o.v !== 1) throw new Error('Spielstand ungültig');
  if (typeof o.stufe !== 'string' || !Object.hasOwn(STUFEN, o.stufe)) throw new Error('Stufe ungültig');
  if (typeof o.seed !== 'string' || o.seed.length < 1 || o.seed.length > 64) throw new Error('Seed ungültig');
  if (!Array.isArray(o.deal) || o.deal.length !== ANZAHL) throw new Error('Karten ungültig');
  const da = new Set();
  for (const k of o.deal) {
    if (!istZahl(k, 0, ANZAHL - 1) || da.has(k)) throw new Error('Karten ungültig');
    da.add(k);
  }
  if (!Array.isArray(o.zuege) || !Array.isArray(o.vor) || o.zuege.length > ZUEGE_MAX || o.vor.length > ZUEGE_MAX) throw new Error('Züge ungültig');
  let sp = neuesSpiel(o.deal, o.stufe, o.seed);
  for (const m of o.zuege) {
    const n = Array.isArray(m) ? zieheZug(sp, m.slice()) : null;
    if (!n) throw new Error('Zug unzulässig');
    sp = n;
  }
  let z = sp.z;
  for (let i = o.vor.length - 1; i >= 0; i--) {
    z = Array.isArray(o.vor[i]) ? wende(z, o.vor[i]) : null;
    if (!z) throw new Error('Wiederholen-Zug unzulässig');
  }
  return { ...sp, vor: o.vor.map((m) => m.slice()) };
}

export function istGueltig(o) {
  try { ausSpeicher(o); return true; } catch { return false; }
}

// ---------- Texte ----------
export function zugText(z, zug) {
  switch (zug?.[0]) {
    case 0: return 'Vom Stapel ziehen';
    case 1: return 'Ablagestapel wieder zum Stapel drehen';
    case 2: return `${kartenName(oben(z.ablage))} auf Spalte ${zug[1] + 1} legen`;
    case 3: return `${kartenName(oben(z.ablage))} auf die Ablage legen`;
    case 4: {
      const sp = z.sp[zug[1]];
      const k = sp.k[sp.k.length - zug[3]];
      return `${kartenName(k)}${zug[3] > 1 ? ` mit ${zug[3] - 1} weiteren` : ''} auf Spalte ${zug[2] + 1} legen`;
    }
    case 5: return `${kartenName(oben(z.sp[zug[1]].k))} auf die Ablage legen`;
    case 6: return `${kartenName(zug[1] * 13 + z.f[zug[1]] - 1)} zurück auf Spalte ${zug[2] + 1} legen`;
    case 7: return 'Alles Mögliche auf die Ablagen legen';
    default: return '';
  }
}
