// Bild abtragen – Logik ohne DOM (testbar, auch im Worker nutzbar).
//
// Ein Pixelbild (Farb-IDs 0–9, -1 = leer) wird von farbigen Sammlern abgetragen. Sammler stehen in
// Kolonnen, nur der vorderste jeder Kolonne kann auf einen freien Arbeitsplatz geschickt werden.
// Dort holt er nacheinander freie Pixel seiner Farbe, bis er voll ist. Frei ist ein Pixel am Bildrand
// oder neben einem leeren Feld. Alle Sammler arbeiten gleichzeitig (Platz 1 zuerst, ein Pixel je Runde).
//
// Spielstand (JSON-tauglich):
// { v: 1, stufe, level, titel, seed, b, h, bild[], rest[], kolonnen: [[[farbe, ladung], …], …],
//   pos[], plaetze: [null | [farbe, ladung, rest]], loesung[], verlauf: [{ k, px[], pl }], vor[] }
import { erstelleZufall } from '../../kern/zufall.js';

export const STAND_VERSION = 1;

export const STUFEN = Object.freeze({
  leicht: { name: 'Leicht', groesse: [8, 10], farben: [3, 3], kolonnen: 3, plaetze: 6, ladung: [3, 6], verwirrung: 0.25, schichtung: 0.45, parken: 0.1 },
  mittel: { name: 'Mittel', groesse: [12, 12], farben: [4, 5], kolonnen: 4, plaetze: 5, ladung: [4, 9], verwirrung: 0.55, schichtung: 0.6, parken: 0.3 },
  schwer: { name: 'Schwer', groesse: [14, 16], farben: [5, 6], kolonnen: 4, plaetze: 4, ladung: [5, 12], verwirrung: 0.85, schichtung: 0.72, parken: 0.5 },
});
export const STUFEN_IDS = Object.keys(STUFEN);

const MAX_SEITE = 20;
const MAX_LADUNG = 99;
const MAX_SAMMLER = 400;

// ---------------------------------------------------------------------------------------------
// Grundregeln

/** Ist Pixel i frei (Bildrand oder Nachbar leer)? */
export function istFrei(rest, b, h, i) {
  const x = i % b;
  const y = (i - x) / b;
  if (x === 0 || y === 0 || x === b - 1 || y === h - 1) return true;
  return rest[i - 1] < 0 || rest[i + 1] < 0 || rest[i - b] < 0 || rest[i + b] < 0;
}

/** Nächstes Pixel für Farbe f: das unterste, dann linkeste freie Pixel → Index oder -1 */
export function freiesPixel(rest, b, h, f) {
  for (let y = h - 1; y >= 0; y--) {
    for (let x = 0, i = y * b; x < b; x++, i++) {
      if (rest[i] === f && istFrei(rest, b, h, i)) return i;
    }
  }
  return -1;
}

/**
 * Lässt alle Sammler auf den Plätzen arbeiten, bis keiner mehr etwas holen kann (verändert rest/plaetze).
 * Jede Runde: Platz 1, 2, … holt je ein Pixel. Voller Sammler verlässt seinen Platz sofort.
 * @param {number[][]} [runden]  sammelt [[platz, pixel], …] je Runde (für die Animation)
 */
export function laufe(rest, b, h, plaetze, runden) {
  for (let schutz = rest.length + 1; schutz > 0; schutz--) {
    const runde = [];
    for (let p = 0; p < plaetze.length; p++) {
      const s = plaetze[p];
      if (!s) continue;
      const i = freiesPixel(rest, b, h, s[0]);
      if (i < 0) continue;
      rest[i] = -1;
      s[2]--;
      runde.push([p, i]);
      if (s[2] <= 0) plaetze[p] = null;
    }
    if (!runde.length) return;
    runden?.push(runde);
  }
}

/** Kann der vorderste Sammler von Kolonne k losgeschickt werden? */
export function kannTippen(z, k) {
  return Number.isInteger(k) && k >= 0 && k < z.kolonnen.length
    && z.pos[k] < z.kolonnen[k].length && z.plaetze.includes(null);
}

export const moeglicheZuege = (z) => z.kolonnen.map((_, k) => k).filter((k) => kannTippen(z, k));

/** Kern eines Zugs ohne Verlauf (auch für den Löser) → { rest, pos, plaetze, platz } oder null */
function schritt(z, k, runden) {
  if (!kannTippen(z, k)) return null;
  const rest = z.rest.slice();
  const pos = z.pos.slice();
  const plaetze = z.plaetze.map((s) => (s ? s.slice() : null));
  const [f, n] = z.kolonnen[k][pos[k]];
  pos[k]++;
  const platz = plaetze.indexOf(null);
  plaetze[platz] = [f, n, n];
  laufe(rest, z.b, z.h, plaetze, runden);
  return { rest, pos, plaetze, platz };
}

/**
 * Spielzug: vordersten Sammler von Kolonne k losschicken.
 * → { zustand, runden, platz } oder null (nicht möglich)
 */
export function tippe(z, k, { vor = [] } = {}) {
  const runden = [];
  const r = schritt(z, k, runden);
  if (!r) return null;
  const eintrag = { k, px: runden.flat().map(([, i]) => i), pl: z.plaetze.map((s) => (s ? s.slice() : null)) };
  return {
    zustand: { ...z, rest: r.rest, pos: r.pos, plaetze: r.plaetze, verlauf: [...z.verlauf, eintrag], vor },
    runden,
    platz: r.platz,
  };
}

export const kannRueckgaengig = (z) => z.verlauf.length > 0;
export const kannWiederholen = (z) => z.vor.length > 0;

/** Letzten Zug zurücknehmen → neuer Zustand oder null */
export function rueckgaengig(z) {
  const e = z.verlauf[z.verlauf.length - 1];
  if (!e) return null;
  const rest = z.rest.slice();
  for (const i of e.px) rest[i] = z.bild[i];
  const pos = z.pos.slice();
  pos[e.k]--;
  return {
    ...z, rest, pos,
    plaetze: e.pl.map((s) => (s ? s.slice() : null)),
    verlauf: z.verlauf.slice(0, -1),
    vor: [...z.vor, e.k],
  };
}

/** Zurückgenommenen Zug wiederholen → { zustand, runden, platz } oder null */
export function wiederholen(z) {
  if (!z.vor.length) return null;
  return tippe(z, z.vor[z.vor.length - 1], { vor: z.vor.slice(0, -1) });
}

/** Gleiches Level von vorn */
export function neustart(z) {
  return {
    ...z, rest: z.bild.slice(), pos: z.pos.map(() => 0), plaetze: z.plaetze.map(() => null), verlauf: [], vor: [],
  };
}

export const restPixel = (z) => z.rest.reduce((n, v) => n + (v >= 0 ? 1 : 0), 0);
export const gewonnen = (z) => z.rest.every((v) => v < 0);
/** Kein Zug mehr möglich, Bild aber nicht leer */
export const festgefahren = (z) => !gewonnen(z) && moeglicheZuege(z).length === 0;
/** Sammler auf Platz p wartet (findet gerade kein freies Pixel seiner Farbe) */
export const wartet = (z, p) => Boolean(z.plaetze[p]) && freiesPixel(z.rest, z.b, z.h, z.plaetze[p][0]) < 0;

// ---------------------------------------------------------------------------------------------
// Motive und Mosaike

/** Motiv aus motive.json prüfen → { titel, b, h, bild } oder null */
export function pruefeMotiv(m) {
  if (!m || typeof m.titel !== 'string' || !Array.isArray(m.zeilen) || !m.farben || typeof m.farben !== 'object') return null;
  const h = m.zeilen.length;
  const b = typeof m.zeilen[0] === 'string' ? m.zeilen[0].length : 0;
  if (b < 4 || h < 4 || b > MAX_SEITE || h > MAX_SEITE) return null;
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

export const farbAnzahl = (bild) => new Set(bild.filter((v) => v >= 0)).size;

/** Zu welcher Stufe passt ein Motiv (nach Größe)? */
export function motivStufe(motiv) {
  const n = Math.max(motiv.b, motiv.h);
  if (n <= 10) return 'leicht';
  if (n <= 13) return 'mittel';
  return 'schwer';
}

/** Gültige Motive einer Stufe in Datei-Reihenfolge */
export function motiveFuer(motive, stufe) {
  return (Array.isArray(motive) ? motive : []).map(pruefeMotiv).filter((m) => m && motivStufe(m) === stufe);
}

/** Symmetrisches Mosaik: gespiegeltes, geglättetes Rauschen mit k Farben */
export function erzeugeMosaik(rng, stufe) {
  const cfg = STUFEN[stufe] || STUFEN.leicht;
  const n = rng.ganz(cfg.groesse[0], cfg.groesse[1]);
  const b = n, h = n;
  const k = rng.ganz(cfg.farben[0], cfg.farben[1]);
  const farben = rng.mische([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, k);
  const senkrecht = rng.zahl() < 0.4;
  const form = rng.ganz(0, 3);

  // Rauschen (waagerecht gespiegelt, evtl. auch senkrecht)
  let feld = new Array(b * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < b; x++) {
      const qx = Math.min(x, b - 1 - x);
      const qy = senkrecht ? Math.min(y, h - 1 - y) : y;
      if (qx === x && qy === y) feld[y * b + x] = rng.zahl();
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < b; x++) {
      const qx = Math.min(x, b - 1 - x);
      const qy = senkrecht ? Math.min(y, h - 1 - y) : y;
      feld[y * b + x] = feld[qy * b + qx];
    }
  }
  // Glätten (symmetrische Operation → Symmetrie bleibt)
  for (let runde = 0; runde < 2; runde++) {
    const neu = new Array(b * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < b; x++) {
        let summe = 0, anzahl = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= b || ny >= h) continue;
            const g = dx === 0 && dy === 0 ? 2 : 1;
            summe += feld[ny * b + nx] * g;
            anzahl += g;
          }
        }
        neu[y * b + x] = summe / anzahl;
      }
    }
    feld = neu;
  }
  // Umriss (Luft am Rand)
  const mx = (b - 1) / 2, my = (h - 1) / 2, r = n / 2;
  const drin = (x, y) => {
    const dx = Math.abs(x - mx), dy = Math.abs(y - my);
    if (form === 1) return Math.hypot(dx, dy) <= r + 0.15;
    if (form === 2) return dx + dy <= r + 1.6;
    if (form === 3) return dx + dy <= 2 * r - 2.5;
    return true;
  };
  // Schichtung: Abstand zum Rand bzw. zur Luft (4er-Nachbarschaft) mischt sich ins Rauschen →
  // innere Farben liegen hinter äußeren, die Reihenfolge der Sammler zählt
  const tiefe = new Array(b * h).fill(-1);
  let welle = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < b; x++) {
      if (!drin(x, y)) continue;
      const rand = x === 0 || y === 0 || x === b - 1 || y === h - 1
        || !drin(x - 1, y) || !drin(x + 1, y) || !drin(x, y - 1) || !drin(x, y + 1);
      if (rand) { tiefe[y * b + x] = 0; welle.push([x, y]); }
    }
  }
  let maxTiefe = 0;
  while (welle.length) {
    const naechste = [];
    for (const [x, y] of welle) {
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= b || ny >= h || !drin(nx, ny) || tiefe[ny * b + nx] >= 0) continue;
        tiefe[ny * b + nx] = tiefe[y * b + x] + 1;
        maxTiefe = Math.max(maxTiefe, tiefe[ny * b + nx]);
        naechste.push([nx, ny]);
      }
    }
    welle = naechste;
  }
  // Rauschen auf [0, 1] strecken, dann mit der Tiefe mischen
  let lo = Infinity, hi = -Infinity;
  for (const v of feld) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const a = cfg.schichtung;
  for (let i = 0; i < b * h; i++) {
    const rausch = hi > lo ? (feld[i] - lo) / (hi - lo) : 0.5;
    const v = tiefe[i] < 0 ? 0 : a * (tiefe[i] / Math.max(1, maxTiefe)) + (1 - a) * rausch;
    feld[i] = Math.round(v * 1e6) / 1e6;   // Rundung: gespiegelte Felder bleiben exakt gleich
  }

  const werte = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < b; x++) if (drin(x, y)) werte.push(feld[y * b + x]);
  werte.sort((a, c) => a - c);
  const schwellen = [];
  for (let j = 1; j < k; j++) schwellen.push(werte[Math.floor((werte.length * j) / k)]);
  const bild = new Array(b * h).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < b; x++) {
      if (!drin(x, y)) continue;
      const v = feld[y * b + x];
      let stufeF = 0;
      while (stufeF < schwellen.length && v >= schwellen[stufeF]) stufeF++;
      bild[y * b + x] = farben[stufeF];
    }
  }
  return { titel: 'Mosaik', b, h, bild };
}

/** Bild für ein Level: erst die Motive der Stufe der Reihe nach, danach Mosaike (jedes 4. wieder ein Motiv) */
export function bildFuerLevel(stufe, level, rng, motive) {
  const liste = motiveFuer(motive, stufe);
  let motiv = null;
  if (liste.length) {
    if (level <= liste.length) motiv = liste[level - 1];
    else if (level % 4 === 0) motiv = liste[(level / 4) % liste.length];
  }
  return motiv ? { ...motiv, bild: motiv.bild.slice() } : erzeugeMosaik(rng, stufe);
}

// ---------------------------------------------------------------------------------------------
// Generator

/**
 * Lösungsreihenfolge erzeugen – mit den echten Spielregeln (gleichzeitige Arbeitsplätze):
 * Meist wird ein Sammler einer Farbe mit freien Pixeln losgeschickt. Kommt er nicht auf seine Zielladung,
 * bekommt er genau so viel, wie er holen konnte (er wird also voll). Mit Wahrscheinlichkeit `parken`
 * wird stattdessen ein Sammler einer (noch) verdeckten Farbe geschickt, der auf seinem Platz wartet.
 * Höchstens Plätze − 1 warten gleichzeitig, also bleibt immer ein Platz frei.
 * → [[farbe, ladung], …] – genau in dieser Reihenfolge losgeschickt, wird das Bild leer.
 */
export function loesungsReihenfolge(bild, b, h, cfg, rng, plaetzeAnzahl = cfg.plaetze) {
  const rest = bild.slice();
  const offen = new Array(10).fill(0);           // Pixel je Farbe, die noch keinem Sammler gehören
  for (const v of rest) if (v >= 0) offen[v]++;
  const plaetze = new Array(Math.max(1, plaetzeAnzahl)).fill(null);
  const reihe = [];
  for (let schutz = 4 * rest.length + 10; rest.some((v) => v >= 0) && schutz > 0; schutz--) {
    const frei = [], verdeckt = [];
    for (let f = 0; f <= 9; f++) {
      if (!offen[f]) continue;
      if (freiesPixel(rest, b, h, f) >= 0) frei.push(f); else verdeckt.push(f);
    }
    const belegt = plaetze.filter(Boolean).length;
    const platz = plaetze.indexOf(null);
    const ziel = rng.ganz(cfg.ladung[0], cfg.ladung[1]);
    // Ladung so wählen, dass von der Farbe kein winziger Rest (kleiner als die Mindestladung) übrig bleibt
    const ladungFuer = (f) => {
      const n = Math.min(ziel, offen[f]);
      const uebrig = offen[f] - n;
      if (uebrig > 0 && uebrig < cfg.ladung[0]) return offen[f] <= cfg.ladung[1] ? offen[f] : Math.max(1, offen[f] - cfg.ladung[0]);
      return n;
    };
    if (verdeckt.length && belegt < plaetze.length - 1 && rng.zahl() < cfg.parken) {
      const f = rng.wahl(verdeckt);
      const n = ladungFuer(f);
      offen[f] -= n;
      plaetze[platz] = [f, n, n];
      reihe.push([f, n]);
      continue;
    }
    if (!frei.length) break;     // kommt nicht vor: ein freies Pixel gehört immer einer Farbe mit offenen Pixeln
    const f = rng.wahl(frei);
    const n = ladungFuer(f);
    plaetze[platz] = [f, n, n];
    laufe(rest, b, h, plaetze);
    let ladung = n;
    if (plaetze[platz]) {        // kam nicht weiter → Ladung = tatsächlich geholt
      ladung = n - plaetze[platz][2];
      plaetze[platz] = null;
    }
    offen[f] -= ladung;
    reihe.push([f, ladung]);
  }
  return reihe;
}

/**
 * Komplettes Level erzeugen (garantiert lösbar, gleicher Seed → gleiches Level).
 * @param {{ stufe: string, level: number, seed: string, motive?: object[] }} p
 */
export function erzeugeLevel({ stufe, level = 1, seed, motive = [] }) {
  const sid = STUFEN[stufe] ? stufe : 'leicht';
  const cfg = STUFEN[sid];
  const rng = erstelleZufall(`${seed}|${sid}|${level}`);
  const motiv = bildFuerLevel(sid, level, rng, motive);
  const { b, h, bild } = motiv;
  const reihe = loesungsReihenfolge(bild, b, h, cfg, rng);

  // Sammler in Lösungsreihenfolge auf die Kolonnen verteilen (hinten anhängen)
  const K = cfg.kolonnen;
  const kolonnen = Array.from({ length: K }, () => []);
  const heimat = new Map();
  const loesung = [];
  for (const s of reihe) {
    if (!heimat.has(s[0])) heimat.set(s[0], heimat.size % K);
    let k = rng.zahl() < cfg.verwirrung ? rng.ganz(0, K - 1) : heimat.get(s[0]);
    // keine Kolonne mehr als doppelt so lang wie die kürzeste + 2
    const kuerzeste = Math.min(...kolonnen.map((c) => c.length));
    if (kolonnen[k].length > 2 * kuerzeste + 2) k = kolonnen.findIndex((c) => c.length === kuerzeste);
    kolonnen[k].push(s.slice());
    loesung.push(k);
  }

  return {
    v: STAND_VERSION,
    stufe: sid,
    level,
    titel: motiv.titel,
    seed: String(seed),
    b, h,
    bild: bild.slice(),
    rest: bild.slice(),
    kolonnen,
    pos: kolonnen.map(() => 0),
    plaetze: new Array(cfg.plaetze).fill(null),
    loesung,
    verlauf: [],
    vor: [],
  };
}

// ---------------------------------------------------------------------------------------------
// Löser und Hinweis

function schluessel(z) {
  let bits = '';
  const r = z.rest;
  for (let i = 0; i < r.length; i += 15) {
    let v = 0;
    for (let j = 0; j < 15 && i + j < r.length; j++) if (r[i + j] >= 0) v |= 1 << j;
    bits += String.fromCharCode(v + 48);
  }
  let pl = '';
  for (const s of z.plaetze) pl += s ? `${s[0]}:${s[2]},` : '-,';
  return `${z.pos.join(',')}|${pl}|${bits}`;
}

function bewertung(k) {
  let belegt = 0;
  for (const s of k.plaetze) if (s) belegt++;
  let rest = 0;
  for (const v of k.rest) if (v >= 0) rest++;
  return -belegt * 1000 - rest;
}

/**
 * Tiefensuche mit Gedächtnis. Budget in Knoten (nicht Zeit).
 * → { status: 'loesbar', weg: [k, …] } | { status: 'unloesbar' } | { status: 'unbekannt' }
 * @param {{ budget?: number, zaehler?: { knoten: number } }} [opt]  zaehler: gemeinsames Budget
 */
export function loese(z, { budget = 20000, zaehler = { knoten: 0 } } = {}) {
  const grenze = zaehler.knoten + budget;
  const besucht = new Set();
  const weg = [];
  let abgebrochen = false;
  const basis = { b: z.b, h: z.h, kolonnen: z.kolonnen };

  function suche(k) {
    if (k.rest.every((v) => v < 0)) return true;
    const key = schluessel(k);
    if (besucht.has(key)) return false;
    besucht.add(key);
    if (++zaehler.knoten > grenze) { abgebrochen = true; return false; }
    const kinder = [];
    for (let c = 0; c < k.kolonnen.length; c++) {
      const n = schritt(k, c);
      if (n) kinder.push({ c, n: { ...basis, rest: n.rest, pos: n.pos, plaetze: n.plaetze } });
    }
    for (const kind of kinder) kind.w = bewertung(kind.n);
    kinder.sort((a, c) => c.w - a.w || a.c - c.c);
    for (const kind of kinder) {
      weg.push(kind.c);
      if (suche(kind.n)) return true;
      weg.pop();
      if (abgebrochen) return false;
    }
    return false;
  }

  const start = { ...basis, rest: z.rest, pos: z.pos, plaetze: z.plaetze };
  if (suche(start)) return { status: 'loesbar', weg };
  return { status: abgebrochen ? 'unbekannt' : 'unloesbar' };
}

/** Führt ein Weg (Kolonnen-Folge) vom Zustand z zum leeren Bild? */
export function wegLoest(z, weg) {
  let k = { b: z.b, h: z.h, kolonnen: z.kolonnen, rest: z.rest, pos: z.pos, plaetze: z.plaetze };
  for (const c of weg) {
    const n = schritt(k, c);
    if (!n) return false;
    k = { ...k, rest: n.rest, pos: n.pos, plaetze: n.plaetze };
  }
  return k.rest.every((v) => v < 0);
}

/** Rest eines bekannten Lösungswegs { zuege, weg } für die Zugfolge ks (oder null) */
function restWeg(ks, kand) {
  const a = kand.zuege;
  if (!Array.isArray(a) || !Array.isArray(kand.weg) || ks.length < a.length) return null;
  for (let i = 0; i < a.length; i++) if (ks[i] !== a[i]) return null;
  const d = ks.length - a.length;
  if (d > kand.weg.length) return null;
  for (let i = 0; i < d; i++) if (ks[a.length + i] !== kand.weg[i]) return null;
  return kand.weg.slice(d);
}

/** Zug mit der besten Bewertung (ohne Gewähr) */
function gierig(z) {
  let best = null;
  for (const c of moeglicheZuege(z)) {
    const n = schritt(z, c);
    const w = bewertung(n);
    if (!best || w > best.w) best = { c, w };
  }
  return best ? best.c : null;
}

/**
 * Hinweis: Zug, nach dem das Level noch lösbar ist, oder wie oft zurück.
 * @param {object} z
 * @param {{ bekannt?: {zuege:number[], weg:number[]}[], budget?: number }} [opt]
 * → { typ: 'zug', kolonne, weg, zuege } | { typ: 'zurueck', n } | { typ: 'unsicher', kolonne } | { typ: 'fertig' }
 */
export function hinweis(z, { bekannt = [], budget = 20000 } = {}) {
  if (gewonnen(z)) return { typ: 'fertig' };
  const ks = z.verlauf.map((e) => e.k);
  const kandidaten = [{ zuege: [], weg: z.loesung }, ...bekannt];
  const bekannterWeg = (zuege, zustand) => {
    for (const kand of kandidaten) {
      const w = restWeg(zuege, kand);
      if (w && w.length && wegLoest(zustand, w)) return w;
    }
    return null;
  };

  const w = bekannterWeg(ks, z);
  if (w) return { typ: 'zug', kolonne: w[0], weg: w, zuege: ks };

  const zaehler = { knoten: 0 };
  const r = loese(z, { budget, zaehler });
  if (r.status === 'loesbar') return { typ: 'zug', kolonne: r.weg[0], weg: r.weg, zuege: ks };
  if (r.status === 'unbekannt') {
    const c = gierig(z);
    return c === null ? { typ: 'zurueck', n: 1 } : { typ: 'unsicher', kolonne: c };
  }

  // nicht mehr lösbar: letzten lösbaren Stand im Verlauf suchen
  let s = z;
  for (let n = 1; n <= ks.length; n++) {
    s = rueckgaengig(s);
    const zuege = ks.slice(0, ks.length - n);
    if (bekannterWeg(zuege, s)) return { typ: 'zurueck', n };
    if (zaehler.knoten < budget * 3) {
      const t = loese(s, { budget: Math.min(budget, budget * 3 - zaehler.knoten), zaehler });
      if (t.status === 'loesbar') return { typ: 'zurueck', n };
    }
  }
  return { typ: 'zurueck', n: Math.max(1, ks.length) };
}

// ---------------------------------------------------------------------------------------------
// Speichern / Laden (Spielstand gilt als nicht vertrauenswürdig)

const ganz = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

function platzGueltig(s) {
  return s === null || (Array.isArray(s) && s.length === 3 && ganz(s[0], 0, 9) && ganz(s[1], 1, MAX_LADUNG) && ganz(s[2], 1, s[1]));
}

/** Prüft einen Spielstand gründlich (Typen, Längen, Farbsummen) */
export function istGueltig(z) {
  if (!z || typeof z !== 'object' || z.v !== STAND_VERSION) return false;
  if (!STUFEN[z.stufe] || !ganz(z.level, 1, 1e6) || typeof z.titel !== 'string' || z.titel.length > 40) return false;
  if (typeof z.seed !== 'string' || z.seed.length > 64) return false;
  if (!ganz(z.b, 4, MAX_SEITE) || !ganz(z.h, 4, MAX_SEITE)) return false;
  const n = z.b * z.h;
  if (!Array.isArray(z.bild) || z.bild.length !== n || !z.bild.every((v) => ganz(v, -1, 9))) return false;
  if (!Array.isArray(z.rest) || z.rest.length !== n || !z.rest.every((v, i) => v === -1 || v === z.bild[i])) return false;
  if (!Array.isArray(z.kolonnen) || z.kolonnen.length < 1 || z.kolonnen.length > 6) return false;
  let sammler = 0;
  for (const kol of z.kolonnen) {
    if (!Array.isArray(kol)) return false;
    sammler += kol.length;
    if (!kol.every((s) => Array.isArray(s) && s.length === 2 && ganz(s[0], 0, 9) && ganz(s[1], 1, MAX_LADUNG))) return false;
  }
  if (sammler > MAX_SAMMLER) return false;
  if (!Array.isArray(z.pos) || z.pos.length !== z.kolonnen.length || !z.pos.every((p, k) => ganz(p, 0, z.kolonnen[k].length))) return false;
  if (!Array.isArray(z.plaetze) || z.plaetze.length < 1 || z.plaetze.length > 8 || !z.plaetze.every(platzGueltig)) return false;

  // Ladungen je Farbe = Pixel je Farbe (gesamt und für den aktuellen Rest)
  const imBild = new Array(10).fill(0), uebrig = new Array(10).fill(0), geladen = new Array(10).fill(0), offen = new Array(10).fill(0);
  z.bild.forEach((v) => { if (v >= 0) imBild[v]++; });
  z.rest.forEach((v) => { if (v >= 0) uebrig[v]++; });
  z.kolonnen.forEach((kol, k) => kol.forEach(([f, l], j) => { geladen[f] += l; if (j >= z.pos[k]) offen[f] += l; }));
  z.plaetze.forEach((s) => { if (s) offen[s[0]] += s[2]; });
  for (let f = 0; f < 10; f++) if (imBild[f] !== geladen[f] || uebrig[f] !== offen[f]) return false;
  // ruhiger Stand: kein Sammler auf einem Platz könnte noch etwas holen
  if (z.plaetze.some((s) => s && freiesPixel(z.rest, z.b, z.h, s[0]) >= 0)) return false;

  if (!Array.isArray(z.loesung) || z.loesung.length > MAX_SAMMLER || !z.loesung.every((k) => ganz(k, 0, z.kolonnen.length - 1))) return false;
  if (!Array.isArray(z.vor) || z.vor.length > MAX_SAMMLER || !z.vor.every((k) => ganz(k, 0, z.kolonnen.length - 1))) return false;
  if (!Array.isArray(z.verlauf) || z.verlauf.length > MAX_SAMMLER) return false;
  const gezogen = z.pos.reduce((a, p) => a + p, 0);
  if (z.verlauf.length !== gezogen) return false;
  for (const e of z.verlauf) {
    if (!e || typeof e !== 'object' || !ganz(e.k, 0, z.kolonnen.length - 1)) return false;
    if (!Array.isArray(e.px) || e.px.length > n || !e.px.every((i) => ganz(i, 0, n - 1) && z.rest[i] === -1 && z.bild[i] >= 0)) return false;
    if (!Array.isArray(e.pl) || e.pl.length !== z.plaetze.length || !e.pl.every(platzGueltig)) return false;
  }
  return true;
}

/** Spielstand → Kopie zum Speichern */
export const zumSpeichern = (z) => JSON.parse(JSON.stringify(z));

/** Gespeicherten Stand laden → Zustand oder null (ungültig) */
export function ausSpeicher(daten) {
  if (!istGueltig(daten)) return null;
  const z = JSON.parse(JSON.stringify(daten));
  // nur bekannte Felder übernehmen
  const sauber = {
    v: z.v, stufe: z.stufe, level: z.level, titel: z.titel, seed: z.seed, b: z.b, h: z.h,
    bild: z.bild, rest: z.rest, kolonnen: z.kolonnen, pos: z.pos, plaetze: z.plaetze,
    loesung: z.loesung, verlauf: z.verlauf.map((e) => ({ k: e.k, px: e.px, pl: e.pl })), vor: z.vor,
  };
  return sauber;
}
