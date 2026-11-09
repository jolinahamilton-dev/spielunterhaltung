// Ziegelbruch – reine Logik ohne DOM: Raster, Physik (fester Zeitschritt), Level, Endlos-Reihen, Spielstand.
// Zellwerte im Feld: 0 leer · 1…999 Zahlblock · WAND · EXTRA · BOMBE · RAEUMER
import { erstelleZufall } from '../../kern/zufall.js';

export const B = 7;                 // Spalten
export const Z = 10;                // Zeilen (die unterste ist die Fallzone)
export const WAND = -1, EXTRA = -2, BOMBE = -3, RAEUMER = -4;
export const MAX_HP = 999;
export const R = 0.16;              // Ballradius in Zellen
export const V = 0.16;              // Weg je Schritt (≤ Radius → kein Tunneln)
export const ABSTAND = 7;           // Schritte zwischen zwei Bällen
export const MAX_WINKEL = 80;       // Grad von senkrecht
export const DRIFT_AB = 2500;       // Schritte je Ball, danach leichter Abwärtsdrall
export const BUDGET = 250000;       // Gesamtschritte je Schuss (Schutz gegen Endlosschleifen)
export const MAX_VERLAUF = 100;
export const START_BAELLE_ENDLOS = 3;
export const LEVEL_FEST = 30;

const MIN_VY = 0.02;
const idx = (r, c) => r * B + c;
const klemme = (x, a, b) => (x < a ? a : x > b ? b : x);

/* ================= Physik ================= */

export function klemmeWinkel(grad) {
  const g = Number.isFinite(grad) ? grad : 0;
  return klemme(g, -MAX_WINKEL, MAX_WINKEL);
}

export function startXKlemme(x) { return klemme(Number.isFinite(x) ? x : B / 2, 0.5, B - 0.5); }

/** Neue Schuss-Simulation (Feld wird kopiert, der Zustand bleibt unverändert). */
export function erstelleSchuss(z, winkelGrad) {
  const w = (klemmeWinkel(winkelGrad) * Math.PI) / 180;
  return {
    feld: z.feld.slice(), n: z.baelle, startX: startXKlemme(z.startX),
    vx0: Math.sin(w) * V, vy0: -Math.cos(w) * V,
    baelle: [], gestartet: 0, zurueck: 0, schritt: 0,
    extras: 0, treffer: 0, zerstoert: 0, neueStartX: null,
    fertig: false, version: 0, prall: null,
  };
}

function normiere(b) {
  if (Math.abs(b.vy) < MIN_VY) b.vy = b.vy < 0 ? -MIN_VY : MIN_VY;
  const sp = Math.hypot(b.vx, b.vy);
  b.vx = (b.vx / sp) * V; b.vy = (b.vy / sp) * V;
}

function bombe(s, r, c) {
  for (let rr = r - 1; rr <= r + 1; rr++) {
    for (let cc = c - 1; cc <= c + 1; cc++) {
      if (rr < 0 || cc < 0 || rr >= Z || cc >= B) continue;
      const i = idx(rr, cc);
      if (s.feld[i] > 0) {
        s.feld[i] -= 3;
        if (s.feld[i] <= 0) { s.feld[i] = 0; s.zerstoert++; }
      }
    }
  }
}

function raeumer(s, r) {
  for (let cc = 0; cc < B; cc++) {
    const i = idx(r, cc);
    if (s.feld[i] > 0) { s.feld[i] = 0; s.zerstoert++; }
  }
}

function trifft(s, r, c) {
  const i = idx(r, c);
  const v = s.feld[i];
  if (v > 0) {
    s.feld[i] = v - 1; s.treffer++;
    if (v === 1) s.zerstoert++;
  } else if (v === BOMBE) { s.feld[i] = 0; s.treffer++; bombe(s, r, c); }
  else if (v === RAEUMER) { s.feld[i] = 0; s.treffer++; raeumer(s, r); }
  s.version++;
}

function bewege(s, b) {
  b.t++;
  if (b.t > DRIFT_AB) b.vy += 0.0006;
  b.x += b.vx; b.y += b.vy;
  let abprall = false, art = null;
  if (b.x < R) { b.x = R; if (b.vx < 0) { b.vx = -b.vx; abprall = true; art = 'wand'; } }
  else if (b.x > B - R) { b.x = B - R; if (b.vx > 0) { b.vx = -b.vx; abprall = true; art = 'wand'; } }
  if (b.y < R) { b.y = R; if (b.vy < 0) { b.vy = -b.vy; abprall = true; art = 'wand'; } }

  const c0 = Math.max(0, Math.floor(b.x - R)), c1 = Math.min(B - 1, Math.floor(b.x + R));
  const r0 = Math.max(0, Math.floor(b.y - R)), r1 = Math.min(Z - 1, Math.floor(b.y + R));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const v = s.feld[idx(r, c)];
      if (v === 0) continue;
      const nx = klemme(b.x, c, c + 1), ny = klemme(b.y, r, r + 1);
      const dx = b.x - nx, dy = b.y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 >= R * R) continue;
      if (v === EXTRA) { s.feld[idx(r, c)] = 0; s.extras++; s.version++; continue; }
      let nxn, nyn;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        nxn = dx / d; nyn = dy / d;
        b.x = nx + nxn * R; b.y = ny + nyn * R;
      } else {
        // Mittelpunkt in der Zelle (praktisch ausgeschlossen): gegen die Flugrichtung herausschieben
        if (Math.abs(b.vx) > Math.abs(b.vy)) { nxn = b.vx > 0 ? -1 : 1; nyn = 0; } else { nxn = 0; nyn = b.vy > 0 ? -1 : 1; }
      }
      const dot = b.vx * nxn + b.vy * nyn;
      if (dot < 0) {
        b.vx -= 2 * dot * nxn; b.vy -= 2 * dot * nyn;
        abprall = true; art = 'block';
        if (v !== WAND) trifft(s, r, c);
      }
    }
  }
  if (abprall) { normiere(b); s.prall = { x: b.x, y: b.y, art }; }
  if (b.vy > 0 && b.y >= Z - R) {
    b.an = false; s.zurueck++;
    if (s.neueStartX === null) s.neueStartX = startXKlemme(b.x);
  }
}

/** Ein Takt der Simulation */
export function schrittSim(s) {
  if (s.fertig) return;
  s.schritt++;
  if (s.gestartet < s.n && s.schritt - 1 >= s.gestartet * ABSTAND) {
    s.baelle.push({ x: s.startX, y: Z - R, vx: s.vx0, vy: s.vy0, an: true, t: 0 });
    s.gestartet++;
  }
  for (const b of s.baelle) if (b.an) bewege(s, b);
  if (s.zurueck >= s.n || s.schritt >= BUDGET) {
    s.fertig = true;
    for (const b of s.baelle) b.an = false;
    if (s.neueStartX === null) s.neueStartX = s.startX;
  }
}

export function simuliereAlles(s) {
  while (!s.fertig) schrittSim(s);
  return s;
}

/** Zielhilfe: Weg eines Balls bis zur ersten Prallstelle an einem Block (höchstens 3 Wandprälle). */
export function vorschau(z, winkelGrad) {
  const s = erstelleSchuss({ ...z, baelle: 1 }, winkelGrad);
  const punkte = [[s.startX, Z - R]];
  let waende = 0;
  for (let i = 0; i < 6000 && !s.fertig; i++) {
    s.prall = null;
    schrittSim(s);
    if (s.prall) {
      punkte.push([s.prall.x, s.prall.y]);
      if (s.prall.art === 'block') return { punkte, block: true };
      if (++waende >= 3) return { punkte, block: false };
    }
  }
  const b = s.baelle[0];
  if (b) punkte.push([b.x, b.y]);
  return { punkte, block: false };
}

/** Guter Schusswinkel: wenige Kandidaten simulieren, größter Schaden gewinnt. */
export function besterWinkel(z) {
  let beste = null, bestWert = -1;
  const kandidaten = [];
  for (let g = -75; g <= 75; g += 7.5) kandidaten.push(g);
  kandidaten.sort((a, b) => Math.abs(a) - Math.abs(b));
  for (const g of kandidaten) {
    const s = simuliereAlles(erstelleSchuss(z, g));
    const wert = s.treffer + s.extras * 3;
    if (wert > bestWert) { bestWert = wert; beste = g; }
  }
  return beste ?? 0;
}

/* ================= Reihen, Level ================= */

export function zaehleBloecke(feld) {
  let n = 0;
  for (const v of feld) if (v > 0) n++;
  return n;
}

/** Eine neue Endlos-Reihe (Trefferzahlen wachsen mit der Schusszahl) */
export function neueReihe(rng, schuesse) {
  const s = 1 + schuesse * 0.5;
  const lo = Math.max(1, Math.ceil(s * 0.5)), hi = Math.max(lo, Math.ceil(s * 1.1));
  const reihe = new Array(B).fill(0);
  for (let c = 0; c < B; c++) if (rng.zahl() < 0.55) reihe[c] = Math.min(MAX_HP, rng.ganz(lo, hi));
  const setze = (art) => {
    for (let k = 0; k < 6; k++) {
      const c = rng.ganz(0, B - 1);
      if (reihe[c] >= 0) { reihe[c] = art; return true; }
    }
    return false;
  };
  if (rng.zahl() < 0.75) setze(EXTRA);
  if (rng.zahl() < 0.1) setze(BOMBE);
  if (rng.zahl() < 0.04) setze(RAEUMER);
  if (rng.zahl() < 0.06 && reihe.filter((v) => v === 0).length >= 3) setze(WAND);
  if (!reihe.includes(0)) reihe[rng.ganz(0, B - 1)] = 0;
  return reihe;
}

const MUSTER = [
  (r, c) => r % 3 !== 2 && c !== (r * 2) % B && c !== (r * 2 + 3) % B,                 // Streifen mit Lücken
  (r, c) => (r + c) % 2 === 0,                                                          // Schachbrett
  (r, c) => Math.abs(c - 3) <= r % 4,                                                   // Pyramiden
  (r, c) => c === 0 || c === B - 1 || r % 4 === 0,                                      // Rahmen
  (r, c) => { const m = r % 12; const zz = m < 6 ? m : 12 - m; return c === zz || c === (zz + 2) % B || c === (zz + 4) % B; }, // Zickzack
  (r, c) => c === 3 || c === 1 || r % 4 === 1,                                          // Kreuz
  (r, c) => (c + r) % 4 < 2,                                                            // Diagonalen
  null,                                                                                 // Inseln (zufällig, seeded)
];
export const MUSTER_NAMEN = ['Streifen', 'Schachbrett', 'Pyramiden', 'Rahmen', 'Zickzack', 'Kreuz', 'Diagonalen', 'Inseln'];

/** Parameter eines Levels (Level 1–30 fest, danach aus der Nummer abgeleitet; alles deterministisch) */
export function levelParameter(n) {
  const num = Math.max(1, Math.floor(n));
  return {
    muster: ((num - 1) * 3 + Math.floor((num - 1) / 8)) % 8,
    start: Math.min(3 + Math.floor((num - 1) / 6), 6),
    nach: Math.min(1 + Math.floor(num / 3), 8),
    hp: 1 + Math.floor((num - 1) / 2.5),
    baelle: Math.min(3 + Math.floor(num / 2), 60),
  };
}

/** Level n → { feld, nachschub, baelle, name } */
export function levelDaten(n) {
  const num = Math.max(1, Math.floor(n));
  const p = levelParameter(num);
  const rng = erstelleZufall(`zb-level-${num}`);
  const gesamt = p.start + p.nach;
  const bild = [];
  for (let r = 0; r < gesamt; r++) {
    const reihe = new Array(B).fill(0);
    for (let c = 0; c < B; c++) {
      const an = MUSTER[p.muster] ? MUSTER[p.muster](r, c) : rng.zahl() < 0.5;
      if (an) reihe[c] = Math.min(MAX_HP, p.hp + ((r * 3 + c * 5 + num) % 3));
    }
    if (!reihe.includes(0)) reihe[rng.ganz(0, B - 1)] = 0;
    bild.push(reihe);
  }
  const zellen = (f) => { const l = []; bild.forEach((reihe, r) => reihe.forEach((v, c) => { if (f(v, r, c)) l.push([r, c]); })); return l; };
  const platziere = (art, anzahl, quelle) => {
    for (let k = 0; k < anzahl; k++) {
      const l = quelle();
      if (!l.length) return;
      const [r, c] = l[rng.ganz(0, l.length - 1)];
      bild[r][c] = art;
    }
  };
  platziere(EXTRA, 1 + Math.floor(num / 6), () => zellen((v) => v > 0));
  if (num >= 4) platziere(BOMBE, 1 + Math.floor(num / 10), () => zellen((v) => v > 0));
  if (num >= 10) platziere(RAEUMER, 1 + Math.floor(num / 20), () => zellen((v) => v > 0));
  if (num >= 6) {
    platziere(WAND, Math.min(2 + Math.floor(num / 5), 8),
      () => zellen((v, r) => v === 0 && bild[r].filter((x) => x === 0).length >= 3));
  }
  const feld = new Array(B * Z).fill(0);
  // Start: unterste p.start Reihen des Gesamtbilds; Nachschub: darüber, von unten nach oben
  for (let r = 0; r < p.start; r++) for (let c = 0; c < B; c++) feld[idx(r, c)] = bild[p.nach + r][c];
  const nachschub = [];
  for (let k = p.nach - 1; k >= 0; k--) nachschub.push(bild[k].slice());
  return { feld, nachschub, baelle: p.baelle, name: MUSTER_NAMEN[p.muster] };
}

/* ================= Spielzustand ================= */

export function neuesSpiel(modus, { level = 1, seed } = {}) {
  const sd = String(seed ?? `zb-${Math.random().toString(36).slice(2, 10)}`);
  const z = {
    standVersion: 1, modus, level: 1, seed: sd, rng: null,
    feld: new Array(B * Z).fill(0), nachschub: [], baelle: START_BAELLE_ENDLOS,
    schuesse: 0, startX: B / 2, winkel: 0, weiter: false, fertig: false,
    reihen: 0, gefallen: 0, verlauf: [],
  };
  const rng = erstelleZufall(sd);
  if (modus === 'level') {
    const d = levelDaten(level);
    z.level = Math.max(1, Math.floor(level));
    z.feld = d.feld; z.nachschub = d.nachschub; z.baelle = d.baelle;
  } else {
    for (let r = 2; r >= 0; r--) {
      const reihe = neueReihe(rng, 0);
      for (let c = 0; c < B; c++) z.feld[idx(r, c)] = reihe[c];
    }
  }
  z.rng = rng.zustand();
  return z;
}

export const schnappschuss = (z) => JSON.parse(JSON.stringify({ ...z, verlauf: [] }));

/** Endlos-Betrieb aktiv (Endlos-Variante oder nach „Weiterspielen“) */
export const istEndlos = (z) => z.modus === 'endlos' || z.weiter;

/** Schuss abschließen → { zustand, ereignis } (reine Funktion, z bleibt unverändert) */
export function beendeSchuss(z, s) {
  const n = schnappschuss(z);
  const alt = z.verlauf.slice(-(MAX_VERLAUF - 1));
  alt.push(schnappschuss(z));
  n.verlauf = alt;
  n.feld = s.feld.slice();
  n.baelle = Math.min(200, z.baelle + s.extras);
  n.schuesse = z.schuesse + 1;
  n.startX = startXKlemme(s.neueStartX ?? z.startX);
  const ereignis = {
    treffer: s.treffer, zerstoert: s.zerstoert, extras: s.extras,
    fertig: false, gefallen: 0, neueReihe: false,
  };
  // Ziel erreicht?
  if (z.modus === 'level' && !z.weiter && !z.fertig && zaehleBloecke(n.feld) === 0 && n.nachschub.length === 0) {
    n.fertig = true; ereignis.fertig = true;
    return { zustand: n, ereignis };
  }
  // Nachrücken: Level mit Nachschub oder Endlos
  let neu = null;
  if (istEndlos(n)) {
    const rng = erstelleZufall(n.seed, n.rng);
    neu = neueReihe(rng, n.schuesse);
    n.rng = rng.zustand();
  } else if (n.nachschub.length) {
    neu = n.nachschub.shift();
  }
  if (neu) {
    for (let r = Z - 1; r >= 1; r--) for (let c = 0; c < B; c++) n.feld[idx(r, c)] = n.feld[idx(r - 1, c)];
    for (let c = 0; c < B; c++) n.feld[idx(0, c)] = neu[c];
    n.reihen = z.reihen + 1;
    ereignis.neueReihe = true;
    let fall = false;
    for (let c = 0; c < B; c++) {
      const i = idx(Z - 1, c);
      if (n.feld[i] !== 0) { fall = true; if (n.feld[i] > 0) n.gefallen++; n.feld[i] = 0; }
    }
    if (fall) ereignis.gefallen = 1;
  }
  return { zustand: n, ereignis };
}

/** Ganzer Schuss am Stück: Zustand + Ereignis */
export function schiesse(z, winkelGrad) {
  const s = simuliereAlles(erstelleSchuss(z, winkelGrad));
  return { ...beendeSchuss({ ...z, winkel: klemmeWinkel(winkelGrad) }, s), sim: s };
}

export const kannRueckgaengig = (z) => z.verlauf.length > 0;

export function rueckgaengig(z) {
  if (!z.verlauf.length) return null;
  const verlauf = z.verlauf.slice(0, -1);
  const vorher = z.verlauf[z.verlauf.length - 1];
  return { ...JSON.parse(JSON.stringify(vorher)), verlauf };
}

/** Nach dem Ziel im Endlos-Betrieb weiterspielen (ohne ein zweites Mal zu gewinnen) */
export function weiterspielen(z) {
  return { ...z, weiter: true, fertig: true };
}

/* ================= Spielstand ================= */

const ganz = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
const zelleOk = (v) => Number.isInteger(v) && ((v >= 1 && v <= MAX_HP) || (v >= RAEUMER && v <= 0));

function kernGueltig(z) {
  if (!z || typeof z !== 'object' || Array.isArray(z)) return false;
  if (z.standVersion !== 1) return false;
  if (z.modus !== 'level' && z.modus !== 'endlos') return false;
  if (!ganz(z.level, 1, 1e6)) return false;
  if (typeof z.seed !== 'string' || z.seed.length < 1 || z.seed.length > 64) return false;
  if (!Array.isArray(z.rng) || z.rng.length !== 4 || !z.rng.every((v) => Number.isInteger(v) && v >= -2147483648 && v <= 4294967295)) return false;
  if (!Array.isArray(z.feld) || z.feld.length !== B * Z || !z.feld.every(zelleOk)) return false;
  if (!Array.isArray(z.nachschub) || z.nachschub.length > 40) return false;
  if (!z.nachschub.every((r) => Array.isArray(r) && r.length === B && r.every(zelleOk))) return false;
  if (!ganz(z.baelle, 1, 200)) return false;
  if (!ganz(z.schuesse, 0, 1e7) || !ganz(z.reihen, 0, 1e7) || !ganz(z.gefallen, 0, 1e7)) return false;
  if (typeof z.startX !== 'number' || !Number.isFinite(z.startX) || z.startX < 0.5 || z.startX > B - 0.5) return false;
  if (typeof z.winkel !== 'number' || !Number.isFinite(z.winkel) || Math.abs(z.winkel) > MAX_WINKEL) return false;
  if (typeof z.weiter !== 'boolean' || typeof z.fertig !== 'boolean') return false;
  if (z.weiter && !z.fertig) return false;
  return true;
}

export function istGueltig(z) {
  if (!kernGueltig(z)) return false;
  if (!Array.isArray(z.verlauf) || z.verlauf.length > MAX_VERLAUF) return false;
  return z.verlauf.every((v) => kernGueltig(v) && Array.isArray(v.verlauf) && v.verlauf.length === 0);
}

/** Spielstand → Zustand (flache, bereinigte Kopie) oder null */
export function ausSpeicher(roh) {
  if (!istGueltig(roh)) return null;
  const kopie = JSON.parse(JSON.stringify(roh));
  return {
    standVersion: 1, modus: kopie.modus, level: kopie.level, seed: kopie.seed, rng: kopie.rng,
    feld: kopie.feld, nachschub: kopie.nachschub, baelle: kopie.baelle, schuesse: kopie.schuesse,
    startX: kopie.startX, winkel: kopie.winkel, weiter: kopie.weiter, fertig: kopie.fertig,
    reihen: kopie.reihen, gefallen: kopie.gefallen, verlauf: kopie.verlauf,
  };
}

export const zumSpeichern = (z) => JSON.parse(JSON.stringify(z));
