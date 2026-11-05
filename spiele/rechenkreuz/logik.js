// Rechenkreuz – Logik ohne DOM (auch im Worker nutzbar).
// Zahlen liegen auf einem Gitter lb × lh (Punkt p = zeile * lb + spalte). Eine Gleichung
// [richtung, zeile, spalte, zeichen] belegt drei Punkte: waagerecht (0) nach rechts, senkrecht (1) nach unten.
// Zeichen: '+', '-', '*', '/' – gelesen als A ○ B = C.
import { erstelleZufall } from '../../kern/zufall.js';

export const STUFEN = Object.freeze({
  leicht: Object.freeze({ name: 'Leicht', zeichen: ['+', '-'], max: 20, gitter: 3, gl: [4, 6], luecken: 0.4 }),
  mittel: Object.freeze({ name: 'Mittel', zeichen: ['+', '-', '*'], max: 50, gitter: 4, gl: [5, 7], luecken: 0.55 }),
  schwer: Object.freeze({ name: 'Schwer', zeichen: ['+', '-', '*', '/'], max: 100, gitter: 5, gl: [7, 10], luecken: 0.7 }),
});
export const STUFEN_IDS = Object.keys(STUFEN);
export const ZEICHEN = Object.freeze({ '+': '+', '-': '−', '*': '×', '/': '÷' });
const ZEICHEN_NAME = Object.freeze({ '+': 'plus', '-': 'minus', '*': 'mal', '/': 'geteilt durch' });
export const zeichenName = (op) => ZEICHEN_NAME[op] ?? '';

const LOESER_BUDGET = 20000;     // Knoten je Eindeutigkeitsprüfung
const WERTE_BUDGET = 6000;       // Knoten je Wertebelegung
const MAX_ZAHL = 10000;
const MAX_VERLAUF = 2000;

// ---------- Gleichungen ----------

/** Stimmt A ○ B = C? (reine Arithmetik) */
export function stimmt(op, a, b, c) {
  switch (op) {
    case '+': return a + b === c;
    case '-': return a - b === c;
    case '*': return a * b === c;
    case '/': return b !== 0 && b * c === a;
    default: return false;
  }
}

/** Zulässig für den Generator: ganze Zahlen 1…max, bei × und ÷ keine 1 als Faktor/Teiler/Ergebnis */
export function erzeugbar(op, a, b, c, max) {
  for (const x of [a, b, c]) if (!Number.isInteger(x) || x < 1 || x > max) return false;
  if (op === '*' && (a < 2 || b < 2)) return false;
  if (op === '/' && (b < 2 || c < 2)) return false;
  return stimmt(op, a, b, c);
}

/** Fehlende dritte Zahl (Position i ∈ 0..2) aus den beiden anderen → Zahl oder -1 */
export function dritte(op, i, a, b, c) {
  let w;
  if (i === 2) w = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : (b ? a / b : NaN);
  else if (i === 0) w = op === '+' ? c - b : op === '-' ? c + b : op === '*' ? (b ? c / b : NaN) : b * c;
  else w = op === '+' ? c - a : op === '-' ? a - c : op === '*' ? (a ? c / a : NaN) : (c ? a / c : NaN);
  return Number.isInteger(w) && w >= 1 ? w : -1;
}

/** Punkte einer Gleichung */
export function punkte(g, lb) {
  const [d, r, c] = g;
  return d === 0 ? [r * lb + c, r * lb + c + 1, r * lb + c + 2] : [r * lb + c, (r + 1) * lb + c, (r + 2) * lb + c];
}

/** Gleichungen mit Punkten, dazu je Punkt die Liste seiner Gleichungen */
export function struktur(gl, lb, lh) {
  const eqs = gl.map((g) => ({ d: g[0], op: g[3], p: punkte(g, lb) }));
  const proPunkt = Array.from({ length: lb * lh }, () => []);
  eqs.forEach((e, i) => e.p.forEach((p) => proPunkt[p].push(i)));
  const benutzt = proPunkt.map((l) => l.length > 0);
  return { eqs, proPunkt, benutzt };
}

// ---------- Layout ----------

/** Prüft die Layout-Regeln (Grenzen, keine Überlappung, eindeutige Zeilen, zusammenhängend) */
export function layoutOk(gl, lb, lh, { zusammen = true } = {}) {
  if (!gl.length) return false;
  for (const [d, r, c] of gl) {
    if (d !== 0 && d !== 1) return false;
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0) return false;
    if (d === 0 ? (c + 2 >= lb || r >= lh) : (r + 2 >= lh || c >= lb)) return false;
  }
  // gleiche Richtung, gleiche Linie: kein gemeinsamer Punkt
  for (let i = 0; i < gl.length; i++) {
    for (let j = i + 1; j < gl.length; j++) {
      const [d1, r1, c1] = gl[i], [d2, r2, c2] = gl[j];
      if (d1 !== d2) continue;
      if (d1 === 0 && r1 === r2 && Math.abs(c1 - c2) < 3) return false;
      if (d1 === 1 && c1 === c2 && Math.abs(r1 - r2) < 3) return false;
    }
  }
  // benachbarte Punkte einer Zeile/Spalte gehören zur selben Gleichung dieser Richtung
  const h = new Array(lb * lh).fill(-1), v = new Array(lb * lh).fill(-1);
  gl.forEach((g, i) => punkte(g, lb).forEach((p) => { (g[0] === 0 ? h : v)[p] = i; }));
  const benutzt = (p) => h[p] >= 0 || v[p] >= 0;
  for (let r = 0; r < lh; r++) {
    for (let c = 0; c < lb; c++) {
      const p = r * lb + c;
      if (!benutzt(p)) continue;
      if (c + 1 < lb && benutzt(p + 1) && (h[p] < 0 || h[p] !== h[p + 1])) return false;
      if (r + 1 < lh && benutzt(p + lb) && (v[p] < 0 || v[p] !== v[p + lb])) return false;
    }
  }
  if (!zusammen) return true;
  // zusammenhängend über gemeinsame Punkte
  const gesehen = new Array(gl.length).fill(false);
  const pkt = gl.map((g) => punkte(g, lb));
  const stapel = [0];
  gesehen[0] = true;
  while (stapel.length) {
    const i = stapel.pop();
    for (let j = 0; j < gl.length; j++) {
      if (!gesehen[j] && pkt[j].some((p) => pkt[i].includes(p))) { gesehen[j] = true; stapel.push(j); }
    }
  }
  return gesehen.every(Boolean);
}

function klassisch() {
  return [[0, 0, 0], [0, 1, 0], [0, 2, 0], [1, 0, 0], [1, 0, 1], [1, 0, 2]];
}

/** Layout auf dem n × n-Gitter wachsen lassen, auf den belegten Bereich zuschneiden */
export function erzeugeLayout(rng, n, [minGl, maxGl]) {
  let gl = null;
  if (n === 3 && maxGl >= 6 && rng.zahl() < 0.3) gl = klassisch();
  for (let versuch = 0; !gl && versuch < 40; versuch++) {
    const ziel = rng.ganz(minGl, maxGl);
    const alle = [];
    for (let d = 0; d < 2; d++) {
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (d === 0 ? c + 2 < n : r + 2 < n) alle.push([d, r, c]);
        }
      }
    }
    const neu = [rng.wahl(alle)];
    while (neu.length < ziel) {
      const benutzt = new Set(neu.flatMap((g) => punkte(g, n)));
      const kandidaten = [];
      for (const g of alle) {
        if (neu.some((x) => x[0] === g[0] && x[1] === g[1] && x[2] === g[2])) continue;
        const gemeinsam = punkte(g, n).filter((p) => benutzt.has(p)).length;
        if (!gemeinsam || !layoutOk([...neu, g], n, n, { zusammen: false })) continue;
        // lieber nur ein gemeinsames Feld (offenere Muster)
        kandidaten.push({ g, gewicht: gemeinsam === 1 ? 3 : 1 });
      }
      if (!kandidaten.length) break;
      let wurf = rng.zahl() * kandidaten.reduce((s, k) => s + k.gewicht, 0);
      let wahl = kandidaten[kandidaten.length - 1].g;
      for (const k of kandidaten) { wurf -= k.gewicht; if (wurf < 0) { wahl = k.g; break; } }
      neu.push(wahl);
    }
    if (neu.length >= minGl) gl = neu;
  }
  if (!gl) gl = klassisch();
  // zuschneiden
  const pk = gl.flatMap((g) => punkte(g, n)).map((p) => [Math.floor(p / n), p % n]);
  const r0 = Math.min(...pk.map((x) => x[0])), c0 = Math.min(...pk.map((x) => x[1]));
  const lh = Math.max(...pk.map((x) => x[0])) - r0 + 1, lb = Math.max(...pk.map((x) => x[1])) - c0 + 1;
  return { lb, lh, gl: gl.map(([d, r, c]) => [d, r - r0, c - c0]) };
}

// ---------- Werte ----------

/** Rechenzeichen verteilen: möglichst jedes Zeichen der Stufe einmal */
function waehleZeichen(rng, anzahl, zeichen) {
  const ops = [];
  const pflicht = rng.mische(zeichen);
  for (let i = 0; i < anzahl; i++) ops.push(i < pflicht.length ? pflicht[i] : rng.wahl(zeichen));
  return rng.mische(ops);
}

/** Werte für alle Punkte finden (Backtracking mit Propagation) → Array oder null */
export function belegeWerte(rng, gl, lb, lh, max, budget = WERTE_BUDGET) {
  const { eqs, proPunkt, benutzt } = struktur(gl, lb, lh);
  const w = new Array(lb * lh).fill(0);
  const offen = [];
  benutzt.forEach((b, p) => { if (b) offen.push(p); });
  let schritte = 0;

  /** passt v an Punkt p zu allen Gleichungen? */
  function passt(p, v) {
    for (const ei of proPunkt[p]) {
      const e = eqs[ei];
      const x = e.p.map((q) => (q === p ? v : w[q]));
      const bekannt = x.filter((y) => y > 0).length;
      if (bekannt === 3) { if (!erzeugbar(e.op, x[0], x[1], x[2], max)) return false; }
      else if (bekannt === 2) {
        const i = x.findIndex((y) => y === 0);
        const f = dritte(e.op, i, x[0], x[1], x[2]);
        if (f < 1 || f > max) return false;
        x[i] = f;
        if (!erzeugbar(e.op, x[0], x[1], x[2], max)) return false;
      }
    }
    return true;
  }

  function wahlPunkt() {
    let best = -1, bestWert = -1;
    for (const p of offen) {
      if (w[p]) continue;
      let wert = 0;
      for (const ei of proPunkt[p]) {
        const k = eqs[ei].p.filter((q) => q !== p && w[q] > 0).length;
        wert = Math.max(wert, k === 2 ? 10 : k);
      }
      if (wert > bestWert) { best = p; bestWert = wert; }
    }
    return best;
  }

  function rek() {
    if (++schritte > budget) return false;
    const p = wahlPunkt();
    if (p < 0) return true;
    let kand = null;
    for (const ei of proPunkt[p]) {
      const e = eqs[ei];
      const i = e.p.indexOf(p);
      const x = e.p.map((q) => w[q]);
      if (x.filter((y, j) => j !== i && y > 0).length === 2) { kand = [dritte(e.op, i, x[0], x[1], x[2])]; break; }
    }
    if (!kand) kand = rng.mische(Array.from({ length: max }, (_, i) => i + 1));
    for (const v of kand) {
      if (v < 1 || v > max || !passt(p, v)) continue;
      w[p] = v;
      if (rek()) return true;
      w[p] = 0;
      if (schritte > budget) return false;
    }
    return false;
  }
  return rek() ? w : null;
}

// ---------- Löser ----------

/**
 * Zählt Lösungen: Kärtchen (Werte) auf die leeren Punkte (werte[p] = 0 bei benutzten Punkten) verteilen.
 * @returns {{ anzahl:number, loesung:number[]|null, abgebrochen:boolean, schritte:number }}
 */
export function loese({ lb, lh, gl, werte, karten }, { budget = LOESER_BUDGET, grenze = 2 } = {}) {
  const { eqs, proPunkt, benutzt } = struktur(gl, lb, lh);
  const w = werte.slice();
  const offen = [];
  benutzt.forEach((b, p) => { if (b && !(w[p] > 0)) { w[p] = 0; offen.push(p); } });
  const ergebnis = { anzahl: 0, loesung: null, abgebrochen: false, schritte: 0 };
  if (offen.length !== karten.length) return ergebnis;
  const zahl = new Map();
  for (const k of karten) zahl.set(k, (zahl.get(k) || 0) + 1);
  const werteListe = [...zahl.keys()].sort((a, b) => a - b);
  const frei = (v) => zahl.get(v) || 0;

  for (const e of eqs) {
    const x = e.p.map((q) => w[q]);
    if (x.every((y) => y > 0) && !stimmt(e.op, x[0], x[1], x[2])) return ergebnis;
  }

  function moeglich(p, v) {
    for (const ei of proPunkt[p]) {
      const e = eqs[ei];
      const x = e.p.map((q) => (q === p ? v : w[q]));
      const fehlt = [];
      x.forEach((y, i) => { if (!y) fehlt.push(i); });
      if (!fehlt.length) { if (!stimmt(e.op, x[0], x[1], x[2])) return false; }
      else if (fehlt.length === 1) {
        const f = dritte(e.op, fehlt[0], x[0], x[1], x[2]);
        if (f < 1 || frei(f) - (f === v ? 1 : 0) < 1) return false;
      }
    }
    return true;
  }

  function rek(rest) {
    if (++ergebnis.schritte > budget) { ergebnis.abgebrochen = true; return; }
    if (!rest) {
      ergebnis.anzahl++;
      if (!ergebnis.loesung) ergebnis.loesung = w.slice();
      return;
    }
    let best = -1, bestDom = null;
    for (const p of offen) {
      if (w[p]) continue;
      const dom = [];
      for (const v of werteListe) if (frei(v) > 0 && moeglich(p, v)) dom.push(v);
      if (!dom.length) return;
      if (!bestDom || dom.length < bestDom.length) { best = p; bestDom = dom; if (dom.length === 1) break; }
    }
    for (const v of bestDom) {
      w[best] = v;
      zahl.set(v, frei(v) - 1);
      rek(rest - 1);
      zahl.set(v, frei(v) + 1);
      w[best] = 0;
      if (ergebnis.anzahl >= grenze || ergebnis.abgebrochen) return;
    }
  }
  rek(offen.length);
  return ergebnis;
}

/** Genau eine Lösung (innerhalb des Budgets)? */
export function eindeutig(r, optionen) {
  const e = loese(r, optionen);
  return e.anzahl === 1 && !e.abgebrochen;
}

// ---------- Generator ----------

/** Neues Rätsel erzeugen (rein über Schritte begrenzt: gleicher Seed → gleiches Rätsel) */
export function erzeugeRaetsel({ stufe = 'leicht', level = 1, seed = 'rk' } = {}) {
  const sid = STUFEN[stufe] ? stufe : 'leicht';
  const st = STUFEN[sid];
  const rng = erstelleZufall(`rechenkreuz|${sid}|${seed}`);
  let lay = null, loesung = null;
  for (let versuch = 0; versuch < 30 && !loesung; versuch++) {
    lay = erzeugeLayout(rng, st.gitter, st.gl);
    for (let z = 0; z < 4 && !loesung; z++) {
      const ops = waehleZeichen(rng, lay.gl.length, st.zeichen);
      const gl = lay.gl.map((g, i) => [g[0], g[1], g[2], ops[i]]);
      const w = belegeWerte(rng, gl, lay.lb, lay.lh, st.max);
      if (w) { loesung = w; lay = { ...lay, gl }; }
    }
  }
  if (!loesung) {
    // Notlösung (praktisch nie): festes kleines Rätsel
    lay = { lb: 3, lh: 3, gl: [[0, 0, 0, '+'], [0, 2, 0, '+'], [1, 0, 0, '+'], [1, 0, 2, '+']] };
    loesung = [1, 1, 2, 2, 0, 3, 3, 1, 5];
  }
  const { lb, lh, gl } = lay;
  const { benutzt } = struktur(gl, lb, lh);
  const punkteListe = [];
  benutzt.forEach((b, p) => { if (b) punkteListe.push(p); });
  const vorgabe = benutzt.map((b) => (b ? 1 : 0));
  const ziel = Math.max(2, Math.round(punkteListe.length * st.luecken));
  let leer = 0;
  for (const p of rng.mische(punkteListe)) {
    if (leer >= ziel) break;
    vorgabe[p] = 0;
    const werte = loesung.map((v, q) => (vorgabe[q] ? v : 0));
    const karten = punkteListe.filter((q) => !vorgabe[q]).map((q) => loesung[q]);
    if (eindeutig({ lb, lh, gl, werte, karten })) leer++;
    else vorgabe[p] = 1;
  }
  const karten = punkteListe.filter((q) => !vorgabe[q]).map((q) => loesung[q]).sort((a, b) => a - b);
  return {
    v: 1, stufe: sid, level: Number.isInteger(level) && level > 0 ? level : 1, seed: String(seed),
    lb, lh, gl, loesung, vorgabe, karten,
    belegt: new Array(lb * lh).fill(-1), verlauf: [], vor: [],
  };
}

// ---------- Spielzustand ----------

/** Aktuelle Zahl je Punkt (vorgegeben, gesetzt oder 0) */
export function werteAus(z) {
  return z.loesung.map((v, p) => (z.vorgabe[p] ? v : z.belegt[p] >= 0 ? z.karten[z.belegt[p]] : 0));
}

/** Status je Gleichung: 'offen' | 'richtig' | 'falsch' */
export function gleichungStatus(z) {
  const w = werteAus(z);
  return z.gl.map((g) => {
    const x = punkte(g, z.lb).map((p) => w[p]);
    if (x.some((y) => !y)) return 'offen';
    return stimmt(g[3], x[0], x[1], x[2]) ? 'richtig' : 'falsch';
  });
}

export const gewonnen = (z) => gleichungStatus(z).every((s) => s === 'richtig');

/** Kann der Punkt ein Kärtchen aufnehmen? */
export function istFeld(z, p) {
  return Number.isInteger(p) && p >= 0 && p < z.loesung.length && z.loesung[p] > 0 && !z.vorgabe[p];
}

/** Indizes der Kärtchen im Vorrat (nicht gesetzt) */
export function freieKarten(z) {
  const gesetzt = new Set(z.belegt.filter((k) => k >= 0));
  return z.karten.map((_, k) => k).filter((k) => !gesetzt.has(k));
}

export const leereFelder = (z) => z.loesung.map((_, p) => p).filter((p) => istFeld(z, p) && z.belegt[p] < 0);

/** Zug „Kärtchen k auf Feld p“ als Änderungsliste [[feld, alt, neu], …] oder null */
export function zugSetzen(z, p, k) {
  if (!istFeld(z, p) || !Number.isInteger(k) || k < 0 || k >= z.karten.length) return null;
  if (z.belegt[p] === k) return null;
  const aend = [];
  const von = z.belegt.indexOf(k);
  if (von >= 0) aend.push([von, k, -1]);
  aend.push([p, z.belegt[p], k]);
  return aend;
}

/** Zug „Feld p leeren“ oder null */
export function zugEntfernen(z, p) {
  if (!istFeld(z, p) || z.belegt[p] < 0) return null;
  return [[p, z.belegt[p], -1]];
}

function wende(z, aend, rueckwaerts) {
  const liste = rueckwaerts ? aend.slice().reverse() : aend;
  for (const [p, alt, neu] of liste) z.belegt[p] = rueckwaerts ? alt : neu;
}

/** Zug ausführen (verändert z) */
export function fuehreAus(z, aend) {
  if (!aend || !aend.length) return false;
  wende(z, aend, false);
  z.verlauf.push(aend);
  if (z.verlauf.length > MAX_VERLAUF) z.verlauf.shift();
  z.vor = [];
  return true;
}

export const kannRueckgaengig = (z) => z.verlauf.length > 0;
export const kannWiederholen = (z) => z.vor.length > 0;

/** Letzten Zug zurücknehmen → die Änderungen oder null */
export function rueckgaengig(z) {
  const aend = z.verlauf.pop();
  if (!aend) return null;
  wende(z, aend, true);
  z.vor.push(aend);
  return aend;
}

export function wiederholen(z) {
  const aend = z.vor.pop();
  if (!aend) return null;
  wende(z, aend, false);
  z.verlauf.push(aend);
  return aend;
}

/** Gleiches Rätsel von vorn */
export function neustart(z) {
  z.belegt = z.belegt.map(() => -1);
  z.verlauf = [];
  z.vor = [];
  return z;
}

/**
 * Hinweis: zuerst eine falsche Zahl herausnehmen, sonst eine richtige setzen (bevorzugt am Feld `wunsch`).
 * @returns {{ typ:'entfernen', feld:number, aend } | { typ:'setzen', feld:number, karte:number, aend } | null}
 */
export function hinweis(z, wunsch = -1) {
  const falsch = z.loesung.map((_, p) => p).filter((p) => istFeld(z, p) && z.belegt[p] >= 0 && z.karten[z.belegt[p]] !== z.loesung[p]);
  if (falsch.length) {
    const feld = falsch.includes(wunsch) ? wunsch : falsch[0];
    return { typ: 'entfernen', feld, aend: zugEntfernen(z, feld) };
  }
  const leer = leereFelder(z);
  if (!leer.length) return null;
  let feld = leer.includes(wunsch) ? wunsch : -1;
  if (feld < 0) {
    // das Feld, dessen Gleichungen am vollsten sind
    const w = werteAus(z);
    const { proPunkt, eqs } = struktur(z.gl, z.lb, z.lh);
    let best = -1;
    for (const p of leer) {
      const voll = Math.max(...proPunkt[p].map((ei) => eqs[ei].p.filter((q) => w[q] > 0).length));
      if (voll > best) { best = voll; feld = p; }
    }
  }
  const karte = freieKarten(z).find((k) => z.karten[k] === z.loesung[feld]);
  if (karte === undefined) return null;
  return { typ: 'setzen', feld, karte, aend: zugSetzen(z, feld, karte) };
}

// ---------- Speichern / Laden ----------

export const zumSpeichern = (z) => JSON.parse(JSON.stringify(z));

const istGanz = (x, a, b) => Number.isInteger(x) && x >= a && x <= b;

function pruefeZuege(liste, z) {
  if (!Array.isArray(liste) || liste.length > MAX_VERLAUF) return null;
  const K = z.karten.length;
  const aus = [];
  for (const zug of liste) {
    if (!Array.isArray(zug) || !zug.length || zug.length > 3) return null;
    const sauber = [];
    for (const a of zug) {
      if (!Array.isArray(a) || a.length !== 3) return null;
      const [p, alt, neu] = a;
      if (!istFeld(z, p) || !istGanz(alt, -1, K - 1) || !istGanz(neu, -1, K - 1)) return null;
      sauber.push([p, alt, neu]);
    }
    aus.push(sauber);
  }
  return aus;
}

const kartenEinmalig = (belegt) => {
  const g = belegt.filter((k) => k >= 0);
  return new Set(g).size === g.length;
};

/** Verlauf gegen den aktuellen Stand nachspielen (rückwärts bzw. vorwärts) */
function verlaufPasst(z) {
  const b = z.belegt.slice();
  for (let i = z.verlauf.length - 1; i >= 0; i--) {
    const aend = z.verlauf[i];
    for (let j = aend.length - 1; j >= 0; j--) {
      const [p, alt, neu] = aend[j];
      if (b[p] !== neu) return false;
      b[p] = alt;
    }
    if (!kartenEinmalig(b)) return false;
  }
  const v = z.belegt.slice();
  for (let i = z.vor.length - 1; i >= 0; i--) {
    for (const [p, alt, neu] of z.vor[i]) {
      if (v[p] !== alt) return false;
      v[p] = neu;
    }
    if (!kartenEinmalig(v)) return false;
  }
  return true;
}

/** Gespeicherten Stand laden → Zustand oder null (ungültig) */
export function ausSpeicher(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  if (d.v !== 1 || typeof d.stufe !== 'string' || !Object.hasOwn(STUFEN, d.stufe)) return null;
  if (!istGanz(d.level, 1, 1e6) || typeof d.seed !== 'string' || d.seed.length > 80) return null;
  const { lb, lh } = d;
  if (!istGanz(lb, 3, 7) || !istGanz(lh, 3, 7)) return null;
  const n = lb * lh;
  if (!Array.isArray(d.gl) || !d.gl.length || d.gl.length > 30) return null;
  const gl = [];
  for (const g of d.gl) {
    if (!Array.isArray(g) || g.length !== 4 || typeof g[3] !== 'string' || !Object.hasOwn(ZEICHEN, g[3])) return null;
    gl.push([g[0], g[1], g[2], g[3]]);
  }
  if (!layoutOk(gl, lb, lh)) return null;
  const { benutzt } = struktur(gl, lb, lh);
  for (const k of ['loesung', 'vorgabe', 'belegt']) if (!Array.isArray(d[k]) || d[k].length !== n) return null;
  const loesung = [], vorgabe = [];
  for (let p = 0; p < n; p++) {
    const v = d.loesung[p], f = d.vorgabe[p];
    if (benutzt[p] ? !istGanz(v, 1, MAX_ZAHL) : v !== 0) return null;
    if (f !== 0 && f !== 1) return null;
    loesung.push(v);
    vorgabe.push(benutzt[p] ? f : 0);
  }
  for (const g of gl) {
    const [a, b, c] = punkte(g, lb).map((p) => loesung[p]);
    if (!stimmt(g[3], a, b, c)) return null;
  }
  if (!Array.isArray(d.karten) || d.karten.length > 60) return null;
  const karten = [];
  for (const k of d.karten) { if (!istGanz(k, 1, MAX_ZAHL)) return null; karten.push(k); }
  const fehlend = loesung.filter((v, p) => benutzt[p] && !vorgabe[p]).sort((a, b) => a - b);
  if (fehlend.join(',') !== karten.slice().sort((a, b) => a - b).join(',')) return null;
  const z = { v: 1, stufe: d.stufe, level: d.level, seed: d.seed, lb, lh, gl, loesung, vorgabe, karten, belegt: [], verlauf: [], vor: [] };
  for (let p = 0; p < n; p++) {
    const k = d.belegt[p];
    if (!istGanz(k, -1, karten.length - 1)) return null;
    if (k >= 0 && !istFeld(z, p)) return null;
    z.belegt.push(k);
  }
  if (!kartenEinmalig(z.belegt)) return null;
  const verlauf = pruefeZuege(d.verlauf, z), vor = pruefeZuege(d.vor, z);
  if (verlauf && vor) {
    z.verlauf = verlauf;
    z.vor = vor;
    if (!verlaufPasst(z)) { z.verlauf = []; z.vor = []; }
  }
  return z;
}
