// Sudoku – Spiellogik ohne DOM (auch im Worker nutzbar).
// Gitter: Array mit 81 Zahlen (0 = leer), Zelle i = zeile * 9 + spalte.
// Kandidaten als 9-Bit-Masken: Bit (d − 1) steht für die Ziffer d.
// Alle Suchen sind über Schritt-Budgets begrenzt, nicht über Zeit → gleicher Seed, gleiches Rätsel.
import { erstelleZufall } from '../../kern/zufall.js';

export const ALLE = 0x1ff;
export const STUFEN = ['leicht', 'mittel', 'schwer', 'experte'];
export const STUFEN_NAME = { leicht: 'Leicht', mittel: 'Mittel', schwer: 'Schwer', experte: 'Experte' };

// Ziel je Stufe: höchste erlaubte Technikstufe, Mindestzahl der Vorgaben, Versuche (neue Gitter)
const STUFEN_ZIEL = {
  leicht: { stufe: 1, minVorgaben: 36, versuche: 30 },
  mittel: { stufe: 2, minVorgaben: 28, versuche: 80 },
  schwer: { stufe: 3, minVorgaben: 22, versuche: 120 },
  experte: { stufe: 4, minVorgaben: 20, versuche: 300 },
};
const ZAEHL_BUDGET = 200000;          // Knoten je Lösungszählung
const GESAMT_BUDGET = 60000000;       // grobe Rechenschritte je Rätsel (deterministisch)

// ---------- Tabellen ----------
export const zeileVon = (i) => (i / 9) | 0;
export const spalteVon = (i) => i % 9;
export const blockVon = (i) => ((((i / 9) | 0) / 3) | 0) * 3 + (((i % 9) / 3) | 0);

const bereich = (n) => Array.from({ length: n }, (_, k) => k);
export const ZEILEN = bereich(9).map((r) => bereich(9).map((c) => r * 9 + c));
export const SPALTEN = bereich(9).map((c) => bereich(9).map((r) => r * 9 + c));
export const BLOECKE = bereich(9).map((b) => bereich(9).map((k) => ((((b / 3) | 0) * 3 + ((k / 3) | 0)) * 9) + (b % 3) * 3 + (k % 3)));
/** 0–8 Blöcke, 9–17 Zeilen, 18–26 Spalten */
export const EINHEITEN = [...BLOECKE, ...ZEILEN, ...SPALTEN];
export const NACHBARN = bereich(81).map((i) => {
  const m = new Set([...ZEILEN[zeileVon(i)], ...SPALTEN[spalteVon(i)], ...BLOECKE[blockVon(i)]]);
  m.delete(i);
  return [...m];
});
const SIEHT = new Uint8Array(81 * 81);
NACHBARN.forEach((liste, i) => { for (const p of liste) SIEHT[i * 81 + p] = 1; });
export const sieht = (a, b) => SIEHT[a * 81 + b] === 1;

const POP = new Uint8Array(512);
const ZIFFERN = [];          // Maske → Liste der Ziffern
for (let m = 0; m < 512; m++) {
  const z = [];
  for (let d = 1; d <= 9; d++) if (m & (1 << (d - 1))) z.push(d);
  POP[m] = z.length;
  ZIFFERN.push(z);
}
export const bit = (d) => 1 << (d - 1);
export const anzahlBits = (m) => POP[m];
export const ziffernAus = (m) => ZIFFERN[m];

// ---------- Grundfunktionen ----------
/** Kandidaten jeder leeren Zelle aus den Werten berechnen */
export function kandidaten(werte) {
  const k = new Array(81).fill(0);
  for (let i = 0; i < 81; i++) {
    if (werte[i]) continue;
    let m = ALLE;
    for (const p of NACHBARN[i]) if (werte[p]) m &= ~bit(werte[p]);
    k[i] = m;
  }
  return k;
}

/** Zellen, deren Ziffer in Zeile, Spalte oder Block doppelt vorkommt */
export function konflikte(werte) {
  const aus = [];
  for (let i = 0; i < 81; i++) {
    if (!werte[i]) continue;
    if (NACHBARN[i].some((p) => werte[p] === werte[i])) aus.push(i);
  }
  return aus;
}

/** Vollständig und regelgerecht ausgefüllt? */
export function istGeloest(werte) {
  return werte.length === 81 && werte.every((w) => w >= 1 && w <= 9) && konflikte(werte).length === 0;
}

// ---------- Backtracking (Lösungszähler, Gitter füllen) ----------
function backtrack(werte, { limit = 2, rng = null, budget = ZAEHL_BUDGET, merke = null } = {}) {
  const g = werte.slice();
  const zeile = new Uint16Array(9), spalte = new Uint16Array(9), block = new Uint16Array(9);
  const leer = [];
  for (let i = 0; i < 81; i++) {
    const d = g[i];
    if (!d) { leer.push(i); continue; }
    const b = bit(d), r = zeileVon(i), c = spalteVon(i), bl = blockVon(i);
    if ((zeile[r] | spalte[c] | block[bl]) & b) return { anzahl: 0, abgebrochen: false, knoten: 0 };
    zeile[r] |= b; spalte[c] |= b; block[bl] |= b;
  }
  let anzahl = 0, knoten = 0, abgebrochen = false;
  const R = leer.map(zeileVon), C = leer.map(spalteVon), B = leer.map(blockVon);
  const n = leer.length;

  function suche(tiefe) {
    if (tiefe === n) {
      anzahl++;
      if (merke && anzahl === 1) merke.loesung = g.slice();
      return anzahl >= limit;
    }
    if (++knoten > budget) { abgebrochen = true; return true; }
    // MRV: Zelle mit den wenigsten Möglichkeiten nach vorn tauschen
    let beste = -1, besteM = 0, besteN = 10;
    for (let k = tiefe; k < n; k++) {
      const m = ALLE & ~(zeile[R[k]] | spalte[C[k]] | block[B[k]]);
      const p = POP[m];
      if (p < besteN) { besteN = p; beste = k; besteM = m; if (p <= 1) break; }
    }
    if (besteN === 0) return false;
    if (beste !== tiefe) {
      [leer[beste], leer[tiefe]] = [leer[tiefe], leer[beste]];
      [R[beste], R[tiefe]] = [R[tiefe], R[beste]];
      [C[beste], C[tiefe]] = [C[tiefe], C[beste]];
      [B[beste], B[tiefe]] = [B[tiefe], B[beste]];
    }
    const i = leer[tiefe], r = R[tiefe], c = C[tiefe], bl = B[tiefe];
    const liste = rng ? rng.mische(ZIFFERN[besteM]) : ZIFFERN[besteM];
    for (const d of liste) {
      const b = bit(d);
      g[i] = d; zeile[r] |= b; spalte[c] |= b; block[bl] |= b;
      const stop = suche(tiefe + 1);
      g[i] = 0; zeile[r] &= ~b; spalte[c] &= ~b; block[bl] &= ~b;
      if (stop) return true;
    }
    return false;
  }
  suche(0);
  return { anzahl, abgebrochen, knoten };
}

/** Anzahl der Lösungen (bricht bei `limit` ab). Bei Budget-Ende: -1 (unbekannt). */
export function zaehleLoesungen(werte, limit = 2, budget = ZAEHL_BUDGET) {
  const r = backtrack(werte, { limit, budget });
  return r.abgebrochen ? -1 : r.anzahl;
}

/** Eine Lösung (oder null) */
export function loese(werte) {
  const merke = {};
  const r = backtrack(werte, { limit: 1, merke, budget: 2000000 });
  return r.anzahl ? merke.loesung : null;
}

/** Vollständiges, zufälliges Gitter aus dem Zufallsgenerator */
export function fuelleGitter(rng) {
  const merke = {};
  backtrack(new Array(81).fill(0), { limit: 1, rng, merke, budget: 1000000 });
  return merke.loesung;
}

// ---------- Logischer Löser mit menschlichen Techniken ----------
// Jede Technik bekommt z = { werte, kand } und liefert einen Schritt oder null:
// { technik, stufe, setze?: { i, d }, entferne: [{ i, maske }], zellen: [...], ...Details für den Text }

function kombis(liste, n, fn, start = 0, wahl = []) {
  if (wahl.length === n) return fn(wahl);
  for (let k = start; k <= liste.length - (n - wahl.length); k++) {
    wahl.push(liste[k]);
    const r = kombis(liste, n, fn, k + 1, wahl);
    wahl.pop();
    if (r) return r;
  }
  return null;
}

function einzigeStelle(z) {
  for (let u = 0; u < 27; u++) {
    const zellen = EINHEITEN[u];
    for (let d = 1; d <= 9; d++) {
      const b = bit(d);
      let pos = -1, n = 0;
      for (const i of zellen) if (z.kand[i] & b) { n++; pos = i; if (n > 1) break; }
      if (n === 1) return { technik: 'einzigeStelle', stufe: 1, setze: { i: pos, d }, entferne: [], einheit: u, zellen: [pos] };
    }
  }
  return null;
}

function einzigeZiffer(z) {
  for (let i = 0; i < 81; i++) {
    if (!z.werte[i] && POP[z.kand[i]] === 1) {
      return { technik: 'einzigeZiffer', stufe: 1, setze: { i, d: ZIFFERN[z.kand[i]][0] }, entferne: [], zellen: [i] };
    }
  }
  return null;
}

function gesperrteKandidaten(z) {
  // Pointing: im Block nur in einer Zeile/Spalte → dort außerhalb des Blocks streichen
  for (let bl = 0; bl < 9; bl++) {
    for (let d = 1; d <= 9; d++) {
      const b = bit(d);
      const mit = BLOECKE[bl].filter((i) => z.kand[i] & b);
      if (mit.length < 2) continue;
      for (const [linien, von, basis] of [[ZEILEN, zeileVon, 9], [SPALTEN, spalteVon, 18]]) {
        const l = von(mit[0]);
        if (!mit.every((i) => von(i) === l)) continue;
        const ent = linien[l].filter((i) => blockVon(i) !== bl && (z.kand[i] & b)).map((i) => ({ i, maske: b }));
        if (ent.length) return { technik: 'pointing', stufe: 2, d, einheit: bl, ziel: basis + l, entferne: ent, zellen: mit };
      }
    }
  }
  // Claiming: in Zeile/Spalte nur in einem Block → im Rest des Blocks streichen
  for (let u = 9; u < 27; u++) {
    for (let d = 1; d <= 9; d++) {
      const b = bit(d);
      const mit = EINHEITEN[u].filter((i) => z.kand[i] & b);
      if (mit.length < 2) continue;
      const bl = blockVon(mit[0]);
      if (!mit.every((i) => blockVon(i) === bl)) continue;
      const linie = new Set(EINHEITEN[u]);
      const ent = BLOECKE[bl].filter((i) => !linie.has(i) && (z.kand[i] & b)).map((i) => ({ i, maske: b }));
      if (ent.length) return { technik: 'claiming', stufe: 2, d, einheit: u, ziel: bl, entferne: ent, zellen: mit };
    }
  }
  return null;
}

const UNTERGRUPPE_STUFE = { 2: 2, 3: 3, 4: 3 };

function nackteGruppe(n) {
  return (z) => {
    for (let u = 0; u < 27; u++) {
      const leer = EINHEITEN[u].filter((i) => !z.werte[i]);
      if (leer.length <= n) continue;
      const kandidatenZellen = leer.filter((i) => POP[z.kand[i]] >= 2 && POP[z.kand[i]] <= n);
      if (kandidatenZellen.length < n) continue;
      const r = kombis(kandidatenZellen, n, (wahl) => {
        let m = 0;
        for (const i of wahl) m |= z.kand[i];
        if (POP[m] !== n) return null;
        const ent = leer.filter((i) => !wahl.includes(i) && (z.kand[i] & m)).map((i) => ({ i, maske: z.kand[i] & m }));
        return ent.length ? { technik: 'nackt', n, stufe: UNTERGRUPPE_STUFE[n], einheit: u, maske: m, entferne: ent, zellen: wahl.slice() } : null;
      });
      if (r) return r;
    }
    return null;
  };
}

function versteckteGruppe(n) {
  return (z) => {
    for (let u = 0; u < 27; u++) {
      const zellen = EINHEITEN[u];
      const leer = zellen.filter((i) => !z.werte[i]);
      if (leer.length <= n) continue;
      const pos = {};
      const ziffern = [];
      for (let d = 1; d <= 9; d++) {
        const b = bit(d);
        let p = 0;
        zellen.forEach((i, k) => { if (z.kand[i] & b) p |= 1 << k; });
        const c = POP[p];
        if (c >= 2 && c <= n) { pos[d] = p; ziffern.push(d); }
      }
      if (ziffern.length < n) continue;
      const r = kombis(ziffern, n, (wahl) => {
        let p = 0, m = 0;
        for (const d of wahl) { p |= pos[d]; m |= bit(d); }
        if (POP[p] !== n) return null;
        const orte = zellen.filter((_, k) => p & (1 << k));
        const ent = orte.filter((i) => z.kand[i] & ~m).map((i) => ({ i, maske: z.kand[i] & ~m }));
        return ent.length ? { technik: 'versteckt', n, stufe: UNTERGRUPPE_STUFE[n], einheit: u, maske: m, entferne: ent, zellen: orte } : null;
      });
      if (r) return r;
    }
    return null;
  };
}

function fisch(n) {
  const stufe = n === 2 ? 3 : 4;
  return (z) => {
    for (let d = 1; d <= 9; d++) {
      const b = bit(d);
      for (const zeilenBasis of [true, false]) {
        const basis = zeilenBasis ? ZEILEN : SPALTEN;
        const deck = zeilenBasis ? SPALTEN : ZEILEN;
        const lage = zeilenBasis ? spalteVon : zeileVon;
        const linien = [];
        const masken = {};
        for (let l = 0; l < 9; l++) {
          let m = 0;
          for (const i of basis[l]) if (z.kand[i] & b) m |= 1 << lage(i);
          const c = POP[m];
          if (c >= 2 && c <= n) { linien.push(l); masken[l] = m; }
        }
        if (linien.length < n) continue;
        const r = kombis(linien, n, (wahl) => {
          let m = 0;
          for (const l of wahl) m |= masken[l];
          if (POP[m] !== n) return null;
          const deckLinien = [];
          for (let k = 0; k < 9; k++) if (m & (1 << k)) deckLinien.push(k);
          const ent = [];
          for (const k of deckLinien) {
            for (const i of deck[k]) {
              const l = zeilenBasis ? zeileVon(i) : spalteVon(i);
              if (!wahl.includes(l) && (z.kand[i] & b)) ent.push({ i, maske: b });
            }
          }
          if (!ent.length) return null;
          const zellen = [];
          for (const l of wahl) for (const i of basis[l]) if (z.kand[i] & b) zellen.push(i);
          return { technik: 'fisch', n, stufe, d, zeilen: zeilenBasis, basis: wahl.slice(), deck: deckLinien, entferne: ent, zellen };
        });
        if (r) return r;
      }
    }
    return null;
  };
}

function xyWing(z) {
  const zwei = [];
  for (let i = 0; i < 81; i++) if (!z.werte[i] && POP[z.kand[i]] === 2) zwei.push(i);
  for (const p of zwei) {
    const mp = z.kand[p];
    const fluegel = zwei.filter((q) => q !== p && sieht(p, q) && POP[z.kand[q] & mp] === 1);
    for (let a = 0; a < fluegel.length; a++) {
      const q1 = fluegel[a];
      const x = z.kand[q1] & mp;
      const c = z.kand[q1] & ~mp;
      const soll = (mp & ~x) | c;
      for (let b2 = 0; b2 < fluegel.length; b2++) {
        const q2 = fluegel[b2];
        if (q2 === q1 || z.kand[q2] !== soll) continue;
        const ent = [];
        for (let i = 0; i < 81; i++) {
          if (i === p || i === q1 || i === q2) continue;
          if ((z.kand[i] & c) && sieht(i, q1) && sieht(i, q2)) ent.push({ i, maske: c });
        }
        if (ent.length) return { technik: 'xyWing', stufe: 3, angel: p, fluegel: [q1, q2], d: ZIFFERN[c][0], entferne: ent, zellen: [p, q1, q2] };
      }
    }
  }
  return null;
}

function faerbung(z) {
  for (let d = 1; d <= 9; d++) {
    const b = bit(d);
    const kanten = bereich(81).map(() => []);
    for (let u = 0; u < 27; u++) {
      const mit = EINHEITEN[u].filter((i) => z.kand[i] & b);
      if (mit.length === 2) { kanten[mit[0]].push(mit[1]); kanten[mit[1]].push(mit[0]); }
    }
    const farbe = new Int8Array(81).fill(-1);
    for (let s = 0; s < 81; s++) {
      if (farbe[s] >= 0 || !kanten[s].length) continue;
      const teil = [s];
      farbe[s] = 0;
      for (let k = 0; k < teil.length; k++) {
        const i = teil[k];
        for (const j of kanten[i]) if (farbe[j] < 0) { farbe[j] = 1 - farbe[i]; teil.push(j); }
      }
      if (teil.length < 3) continue;
      const gruppen = [teil.filter((i) => farbe[i] === 0), teil.filter((i) => farbe[i] === 1)];
      // Farbe widerspricht sich (zwei gleich gefärbte Zellen sehen sich) → diese Farbe ist falsch
      for (let f = 0; f < 2; f++) {
        const g = gruppen[f];
        let widerspruch = false;
        for (let x = 0; x < g.length && !widerspruch; x++) for (let y = x + 1; y < g.length; y++) if (sieht(g[x], g[y])) { widerspruch = true; break; }
        if (widerspruch) return { technik: 'faerbung', art: 'widerspruch', stufe: 4, d, entferne: g.map((i) => ({ i, maske: b })), zellen: teil };
      }
      // Zelle sieht beide Farben → kann die Ziffer nicht sein
      const ent = [];
      for (let i = 0; i < 81; i++) {
        if (!(z.kand[i] & b) || farbe[i] >= 0) continue;
        if (gruppen[0].some((j) => sieht(i, j)) && gruppen[1].some((j) => sieht(i, j))) ent.push({ i, maske: b });
      }
      if (ent.length) return { technik: 'faerbung', art: 'falle', stufe: 4, d, entferne: ent, zellen: teil };
    }
  }
  return null;
}

/** Techniken in fester Reihenfolge (einfachste zuerst) */
export const TECHNIKEN = [
  { stufe: 1, fn: einzigeStelle },
  { stufe: 1, fn: einzigeZiffer },
  { stufe: 2, fn: gesperrteKandidaten },
  { stufe: 2, fn: nackteGruppe(2) },
  { stufe: 2, fn: versteckteGruppe(2) },
  { stufe: 3, fn: nackteGruppe(3) },
  { stufe: 3, fn: versteckteGruppe(3) },
  { stufe: 3, fn: fisch(2) },
  { stufe: 3, fn: nackteGruppe(4) },
  { stufe: 3, fn: versteckteGruppe(4) },
  { stufe: 3, fn: xyWing },
  { stufe: 4, fn: fisch(3) },
  { stufe: 4, fn: faerbung },
];

export function erstelleLoeserZustand(werte) {
  return { werte: werte.slice(), kand: kandidaten(werte) };
}

/** Nächster logischer Schritt (oder null) */
export function naechsterSchritt(z, maxStufe = 4) {
  for (const t of TECHNIKEN) {
    if (t.stufe > maxStufe) break;
    const s = t.fn(z);
    if (s) return s;
  }
  return null;
}

export function wendeSchrittAn(z, s) {
  if (s.setze) {
    const { i, d } = s.setze;
    z.werte[i] = d;
    z.kand[i] = 0;
    for (const p of NACHBARN[i]) z.kand[p] &= ~bit(d);
  }
  for (const e of s.entferne) z.kand[e.i] &= ~e.maske;
}

/**
 * Löst nur mit Techniken bis maxStufe.
 * @returns {{ geloest:boolean, stufe:number, schritte:number, techniken:object }}
 */
export function bewerte(werte, maxStufe = 4, budget = null) {
  const z = erstelleLoeserZustand(werte);
  let stufe = 0, schritte = 0;
  const techniken = {};
  for (;;) {
    let leer = 0;
    for (let i = 0; i < 81; i++) if (!z.werte[i]) { leer++; if (!z.kand[i]) return { geloest: false, stufe, schritte, techniken }; }
    if (!leer) return { geloest: true, stufe, schritte, techniken };
    const s = naechsterSchritt(z, maxStufe);
    schritte++;
    if (budget) budget.rest -= 400 + 30 * (s ? s.stufe : 0);
    if (!s) return { geloest: false, stufe, schritte, techniken };
    const name = s.technik === 'nackt' || s.technik === 'versteckt' || s.technik === 'fisch' ? `${s.technik}${s.n}` : s.technik;
    techniken[name] = (techniken[name] || 0) + 1;
    if (s.stufe > stufe) stufe = s.stufe;
    wendeSchrittAn(z, s);
  }
}

// ---------- Generator ----------
const text81 = (werte) => werte.join('');
export const ausText = (t) => Array.from(t, Number);

/**
 * Erzeugt ein Rätsel mit genau einer Lösung, das ohne Raten lösbar ist.
 * @param {string} stufeId  leicht | mittel | schwer | experte
 * @param {string} seed
 * @param {{ notbremse?: () => boolean, budget?: number }} [optionen]
 * @returns {{ seed, stufe, vorgabe:string, loesung:string, erreicht:number, ziel:number, vorgaben:number }}
 */
export function erzeuge(stufeId, seed, { notbremse = () => false, budget = GESAMT_BUDGET } = {}) {
  const ziel = STUFEN_ZIEL[stufeId] ?? STUFEN_ZIEL.leicht;
  const rng = erstelleZufall(`sudoku:${stufeId}:${seed}`);
  const b = { rest: budget };
  let bestes = null;

  for (let versuch = 0; versuch < ziel.versuche; versuch++) {
    const loesung = fuelleGitter(rng);
    const werte = loesung.slice();
    // punktsymmetrische Paare, zufällige Reihenfolge
    const paare = rng.mische(bereich(41).map((i) => (i === 40 ? [40] : [i, 80 - i])));
    let vorgaben = 81;
    const versucheLoch = (gruppe) => {
      if (vorgaben - gruppe.length < ziel.minVorgaben) return false;
      for (const i of gruppe) werte[i] = 0;
      const r = backtrack(werte, { limit: 2, budget: ZAEHL_BUDGET });
      b.rest -= r.knoten * 20;
      let ok = !r.abgebrochen && r.anzahl === 1;
      if (ok) ok = bewerte(werte, ziel.stufe, b).geloest;
      if (ok) vorgaben -= gruppe.length;
      else for (const i of gruppe) werte[i] = loesung[i];
      return ok;
    };
    for (const paar of paare) {
      versucheLoch(paar);
      if (b.rest <= 0) break;
    }
    let r = bewerte(werte, ziel.stufe);
    // Zu leicht? Einzelne weitere Vorgaben (ohne Symmetrie) entfernen, bis die Zielstufe erreicht ist
    if (r.geloest && r.stufe < ziel.stufe && ziel.stufe >= 3) {
      for (const i of rng.mische(bereich(81).filter((k) => werte[k]))) {
        if (b.rest <= 0) break;
        if (versucheLoch([i])) {
          r = bewerte(werte, ziel.stufe, b);
          if (r.stufe === ziel.stufe) break;
        }
      }
    }
    const kandidat = { seed: String(seed), stufe: stufeId, vorgabe: text81(werte), loesung: text81(loesung), erreicht: r.stufe, ziel: ziel.stufe, vorgaben };
    if (r.geloest && (!bestes || r.stufe > bestes.erreicht)) bestes = kandidat;
    if (r.geloest && r.stufe === ziel.stufe) return kandidat;
    if (b.rest <= 0 || notbremse()) break;
  }
  return bestes;
}

// ---------- Prüfen (Spielstand gilt als nicht vertrauenswürdig) ----------
const ist81 = (t, min = 0) => typeof t === 'string' && t.length === 81 && new RegExp(`^[${min}-9]{81}$`).test(t);

/** Fertiges Rätsel aus Vorrat/Datei prüfen (inkl. eindeutiger Lösung) */
export function pruefeRaetsel(r) {
  if (!r || typeof r !== 'object' || !STUFEN.includes(r.stufe)) return false;
  if (!ist81(r.vorgabe) || !ist81(r.loesung, 1)) return false;
  const v = ausText(r.vorgabe), l = ausText(r.loesung);
  if (!istGeloest(l)) return false;
  if (v.some((w, i) => w && w !== l[i])) return false;
  return zaehleLoesungen(v, 2) === 1;
}

/** Gespeicherten Spielstand prüfen → bereinigter Stand oder null */
export function pruefeStand(st) {
  try {
    if (!st || typeof st !== 'object' || st.version !== 1) return null;
    if (!pruefeRaetsel(st)) return null;
    if (!ist81(st.werte)) return null;
    const v = ausText(st.vorgabe);
    const werte = ausText(st.werte).map((w, i) => (v[i] ? 0 : w));
    if (!Array.isArray(st.notizen) || st.notizen.length !== 81) return null;
    const notizen = st.notizen.map((n, i) => (Number.isInteger(n) && n >= 0 && n <= ALLE && !v[i] ? n : 0));
    const zahl = (x, max) => (Number.isInteger(x) && x >= 0 && x <= max ? x : 0);
    const zugOk = (z) => Array.isArray(z) && z.length <= 81 && z.every((d) => Array.isArray(d) && d.length === 5
      && zahl(d[0], 80) === d[0] && !v[d[0]] && [d[1], d[2]].every((w) => zahl(w, 9) === w) && [d[3], d[4]].every((n) => zahl(n, ALLE) === n));
    const vl = st.verlauf;
    const verlauf = vl && Array.isArray(vl.zurueck) && Array.isArray(vl.vor) && vl.zurueck.every(zugOk) && vl.vor.every(zugOk)
      ? { zurueck: vl.zurueck, vor: vl.vor } : { zurueck: [], vor: [] };
    return {
      version: 1,
      stufe: st.stufe,
      seed: String(st.seed ?? ''),
      vorgabe: st.vorgabe,
      loesung: st.loesung,
      werte,
      notizen,
      auswahl: zahl(st.auswahl, 80),
      notizmodus: st.notizmodus === true,
      hinweise: zahl(st.hinweise, 1e6),
      verlauf,
    };
  } catch {
    return null;
  }
}

// ---------- Hinweise ----------
const ort = (i) => `Zeile ${zeileVon(i) + 1}, Spalte ${spalteVon(i) + 1}`;
export function einheitName(u) {
  if (u < 9) return `Block ${u + 1}`;
  if (u < 18) return `Zeile ${u - 8}`;
  return `Spalte ${u - 17}`;
}
const liste = (zahlen) => (zahlen.length < 2 ? String(zahlen[0] ?? '') : `${zahlen.slice(0, -1).join(', ')} und ${zahlen[zahlen.length - 1]}`);
const GRUPPE = { 2: 'Paar', 3: 'Dreiergruppe', 4: 'Vierergruppe' };
const ZAHLWORT = { 2: 'zwei', 3: 'drei', 4: 'vier' };

export const TECHNIK_NAME = {
  einzigeStelle: 'Einzige Stelle',
  einzigeZiffer: 'Einzige Ziffer',
  pointing: 'Gesperrte Kandidaten',
  claiming: 'Gesperrte Kandidaten',
  nackt: 'Offene Gruppe',
  versteckt: 'Versteckte Gruppe',
  fisch: 'X-Wing',
  xyWing: 'XY-Wing',
  faerbung: 'Färbung',
};

export function technikName(s) {
  if (s.technik === 'fisch') return s.n === 2 ? 'X-Wing' : 'Swordfish';
  if (s.technik === 'nackt') return s.n === 2 ? 'Offenes Paar' : `Offene ${GRUPPE[s.n]}`;
  if (s.technik === 'versteckt') return s.n === 2 ? 'Verstecktes Paar' : `Versteckte ${GRUPPE[s.n]}`;
  return TECHNIK_NAME[s.technik] ?? s.technik;
}

/** Kurze Erklärung eines Schritts auf Deutsch */
export function erklaere(s) {
  switch (s.technik) {
    case 'einzigeStelle':
      return `In ${einheitName(s.einheit)} passt die ${s.setze.d} nur hier.`;
    case 'einzigeZiffer':
      return `Hier passt nur noch die ${s.setze.d} – alle anderen Ziffern stehen schon in Zeile, Spalte oder Block.`;
    case 'pointing':
      return `In ${einheitName(s.einheit)} kann die ${s.d} nur in ${einheitName(s.ziel)} stehen. Im Rest von ${einheitName(s.ziel)} fällt sie deshalb weg.`;
    case 'claiming':
      return `In ${einheitName(s.einheit)} kann die ${s.d} nur in ${einheitName(s.ziel)} stehen. Im Rest von ${einheitName(s.ziel)} fällt sie deshalb weg.`;
    case 'nackt':
      return `${technikName(s)}: In ${einheitName(s.einheit)} teilen sich ${ZAHLWORT[s.n]} Zellen genau die Ziffern ${liste(ziffernAus(s.maske))}. In den übrigen Zellen fallen sie weg.`;
    case 'versteckt':
      return `${technikName(s)}: In ${einheitName(s.einheit)} können ${liste(ziffernAus(s.maske))} nur in ${ZAHLWORT[s.n]} Zellen stehen. Dort fallen alle anderen Ziffern weg.`;
    case 'fisch': {
      const basis = s.basis.map((l) => l + 1), deck = s.deck.map((l) => l + 1);
      const [B, D] = s.zeilen ? ['Zeilen', 'Spalten'] : ['Spalten', 'Zeilen'];
      return `${technikName(s)}: In den ${B} ${liste(basis)} steht die ${s.d} nur in den ${D} ${liste(deck)}. In diesen ${D} fällt sie sonst überall weg.`;
    }
    case 'xyWing':
      return `${technikName(s)}: Egal welche der beiden Ziffern in ${ort(s.angel)} steht – in ${ort(s.fluegel[0])} oder ${ort(s.fluegel[1])} steht dann die ${s.d}. Zellen, die beide sehen, können keine ${s.d} sein.`;
    case 'faerbung':
      return s.art === 'widerspruch'
        ? `Färbung der ${s.d}: Die markierten Zellen bilden Paare, in denen die ${s.d} genau einmal steht – sie zerfallen in zwei Hälften. Eine Hälfte widerspricht sich selbst, dort fällt die ${s.d} weg.`
        : `Färbung der ${s.d}: In den markierten Zellen ist entweder die eine oder die andere Hälfte richtig. Zellen, die beide Hälften sehen, können keine ${s.d} sein.`;
    default:
      return '';
  }
}

/**
 * Nächster Hinweis für einen Spielstand.
 * @param {number[]} vorgabe  @param {number[]} loesung  @param {number[]} werte  Spielereinträge
 * @returns {{ art:'fehler'|'setze', i:number, d:number, text:string, zellen:number[], technik?:string }|null}
 */
export function naechsterHinweis(vorgabe, loesung, werte) {
  const alle = vorgabe.map((v, i) => v || werte[i]);
  const falsch = alle.findIndex((w, i) => w && w !== loesung[i]);
  if (falsch >= 0) {
    return { art: 'fehler', i: falsch, d: loesung[falsch], zellen: [falsch], text: 'Diese Ziffer passt nicht zur Lösung. Noch einmal Hinweis trägt die richtige ein.' };
  }
  if (alle.every(Boolean)) return null;
  const z = erstelleLoeserZustand(alle);
  const vorher = [];
  for (let k = 0; k < 60; k++) {
    const s = naechsterSchritt(z, 4);
    if (!s) break;
    if (s.setze) {
      const bezug = new Set(s.technik === 'einzigeStelle' ? EINHEITEN[s.einheit] : [s.setze.i]);
      for (const v of vorher) for (const i of v.zellen) bezug.add(i);
      let text = erklaere(s);
      if (vorher.length === 1) text = `${erklaere(vorher[0])} Danach: ${text}`;
      else if (vorher.length > 1) text = `Mit ${liste([...new Set(vorher.map(technikName))])} fallen einige Möglichkeiten weg. Danach: ${text}`;
      return { art: 'setze', i: s.setze.i, d: s.setze.d, text, zellen: [...bezug], technik: s.technik };
    }
    // Nur Kandidaten gestrichen – weiterdenken bis zur nächsten sicheren Ziffer
    if (s.entferne.some((e) => loesung[e.i] && (bit(loesung[e.i]) & e.maske))) break;   // Sicherheitsnetz
    vorher.push(s);
    wendeSchrittAn(z, s);
  }
  // Rückfall: irgendeine leere Zelle aufdecken
  const i = alle.findIndex((w) => !w);
  return { art: 'setze', i, d: loesung[i], zellen: [i], text: `Hier gehört die ${loesung[i]} hin.` };
}
