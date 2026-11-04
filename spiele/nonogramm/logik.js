// Nonogramm-Logik ohne DOM: Hinweise, Zeilen-Löser (DP), Propagation, Generator, Hinweis-Schritt,
// erledigte Zahlen, Spielstand. Läuft auch im Worker.
//
// Zellwissen im Löser: 0 = unbekannt, 1 = voll, 2 = leer.
// Zellen im Spielstand (Text): '.' = offen, '#' = gefüllt, 'x' = Kreuz.
// Lösung im Spielstand (Text): '1' = voll, '0' = leer.
import { erstelleZufall } from '../../kern/zufall.js';

export const UNBEKANNT = 0, VOLL = 1, LEER = 2;
export const MAX_SEITE = 30;

// ---------------------------------------------------------------------------
// Hinweise
// ---------------------------------------------------------------------------

/** Blöcke einer Linie (Werte: truthy = voll) → z. B. [3, 1]; leere Linie → [] */
export function bloecke(werte) {
  const r = [];
  let lauf = 0;
  for (const w of werte) {
    if (w) lauf++;
    else if (lauf) { r.push(lauf); lauf = 0; }
  }
  if (lauf) r.push(lauf);
  return r;
}

/** Hinweise aus der Lösung ('1'/'0'-Text oder Array 0/1) */
export function hinweiseAus(loesung, b, h) {
  const v = (i) => loesung[i] === '1' || loesung[i] === 1 || loesung[i] === true;
  const zeilen = [], spalten = [];
  for (let y = 0; y < h; y++) zeilen.push(bloecke(Array.from({ length: b }, (_, x) => v(y * b + x))));
  for (let x = 0; x < b; x++) spalten.push(bloecke(Array.from({ length: h }, (_, y) => v(y * b + x))));
  return { zeilen, spalten };
}

/** Indizes der Zellen einer Linie. Linien-Nummer: 0..h-1 Zeilen, h..h+b-1 Spalten. */
export function linienIndizes(b, h, nr) {
  if (nr < h) return Array.from({ length: b }, (_, x) => nr * b + x);
  const x = nr - h;
  return Array.from({ length: h }, (_, y) => y * b + x);
}

// ---------------------------------------------------------------------------
// Zeilen-Löser (DP, O(n·k))
// ---------------------------------------------------------------------------

/**
 * Bestimmt alle Zellen, die in jeder gültigen Platzierung der Blöcke gleich sind.
 * @param {number[]} hinweis  Blocklängen
 * @param {ArrayLike<number>} linie  Wissen (0/1/2)
 * @returns {number[]|null}   neues Wissen oder null bei Widerspruch
 */
export function loeseLinie(hinweis, linie) {
  const n = linie.length, k = hinweis.length, N1 = n + 1;
  const leerVor = new Int32Array(N1);
  for (let i = 0; i < n; i++) leerVor[i + 1] = leerVor[i] + (linie[i] === LEER ? 1 : 0);
  const kannVoll = (a, e) => leerVor[e] - leerVor[a] === 0;   // [a, e)
  const kannLeer = (i) => linie[i] !== VOLL;

  // vor[j][i]: die ersten i Zellen fassen genau die ersten j Blöcke
  const vor = new Uint8Array((k + 1) * N1);
  vor[0] = 1;
  for (let i = 1; i <= n; i++) vor[i] = vor[i - 1] && kannLeer(i - 1) ? 1 : 0;
  for (let j = 1; j <= k; j++) {
    const L = hinweis[j - 1], z = j * N1, zv = (j - 1) * N1;
    for (let i = 0; i <= n; i++) {
      let v = i > 0 && vor[z + i - 1] && kannLeer(i - 1);
      if (!v && i >= L && kannVoll(i - L, i)) {
        v = i - L === 0 ? j === 1 : kannLeer(i - L - 1) && vor[zv + i - L - 1] === 1;
      }
      vor[z + i] = v ? 1 : 0;
    }
  }
  if (!vor[k * N1 + n]) return null;

  // nach[j][i]: die Zellen ab i fassen genau die Blöcke j..k-1
  const nach = new Uint8Array((k + 1) * N1);
  nach[k * N1 + n] = 1;
  for (let i = n - 1; i >= 0; i--) nach[k * N1 + i] = nach[k * N1 + i + 1] && kannLeer(i) ? 1 : 0;
  for (let j = k - 1; j >= 0; j--) {
    const L = hinweis[j], z = j * N1, zn = (j + 1) * N1;
    for (let i = n; i >= 0; i--) {
      let v = i < n && nach[z + i + 1] && kannLeer(i);
      if (!v && i + L <= n && kannVoll(i, i + L)) {
        v = i + L === n ? j === k - 1 : kannLeer(i + L) && nach[zn + i + L + 1] === 1;
      }
      nach[z + i] = v ? 1 : 0;
    }
  }

  const deckung = new Int32Array(N1);
  for (let j = 0; j < k; j++) {
    const L = hinweis[j];
    for (let s = 0; s + L <= n; s++) {
      if (!kannVoll(s, s + L)) continue;
      const links = s === 0 ? j === 0 : kannLeer(s - 1) && vor[j * N1 + s - 1] === 1;
      if (!links) continue;
      const rechts = s + L === n ? j === k - 1 : kannLeer(s + L) && nach[(j + 1) * N1 + s + L + 1] === 1;
      if (!rechts) continue;
      deckung[s]++; deckung[s + L]--;
    }
  }

  const ergebnis = new Array(n);
  let lauf = 0;
  for (let i = 0; i < n; i++) {
    lauf += deckung[i];
    const vollGeht = lauf > 0;
    let leerGeht = false;
    if (kannLeer(i)) {
      for (let j = 0; j <= k && !leerGeht; j++) leerGeht = vor[j * N1 + i] === 1 && nach[j * N1 + i + 1] === 1;
    }
    if (!vollGeht && !leerGeht) return null;
    ergebnis[i] = vollGeht && leerGeht ? linie[i] : vollGeht ? VOLL : LEER;
  }
  return ergebnis;
}

// ---------------------------------------------------------------------------
// Propagation über alle Linien
// ---------------------------------------------------------------------------

/**
 * Löst nur mit Linien-Logik (ohne Raten).
 * @returns {{ status: 'geloest'|'steckt'|'widerspruch'|'budget', wissen: Uint8Array, schritte: number }}
 */
export function loeseLogisch(b, h, hinweise, { start = null, budget = 1e9 } = {}) {
  const wissen = start ? Uint8Array.from(start) : new Uint8Array(b * h);
  const anzahl = h + b;
  const schlange = [];
  const drin = new Uint8Array(anzahl);
  for (let nr = 0; nr < anzahl; nr++) { schlange.push(nr); drin[nr] = 1; }
  let kopf = 0, schritte = 0;
  while (kopf < schlange.length) {
    const nr = schlange[kopf++];
    drin[nr] = 0;
    if (++schritte > budget) return { status: 'budget', wissen, schritte };
    const idx = linienIndizes(b, h, nr);
    const hinweis = nr < h ? hinweise.zeilen[nr] : hinweise.spalten[nr - h];
    const neu = loeseLinie(hinweis, idx.map((i) => wissen[i]));
    if (!neu) return { status: 'widerspruch', wissen, schritte };
    for (let p = 0; p < idx.length; p++) {
      const i = idx[p];
      if (neu[p] !== wissen[i]) {
        wissen[i] = neu[p];
        const quer = nr < h ? h + (i % b) : Math.floor(i / b);
        if (!drin[quer]) { drin[quer] = 1; schlange.push(quer); }
      }
    }
    if (kopf > 4096) { schlange.splice(0, kopf); kopf = 0; }
  }
  return { status: wissen.includes(UNBEKANNT) ? 'steckt' : 'geloest', wissen, schritte };
}

/** Prüft ein Bild: allein mit Linien-Logik eindeutig lösbar? */
export function istLogischLoesbar(loesung, b, h) {
  const r = loeseLogisch(b, h, hinweiseAus(loesung, b, h));
  if (r.status !== 'geloest') return false;
  for (let i = 0; i < b * h; i++) if ((r.wissen[i] === VOLL) !== (loesung[i] === '1' || loesung[i] === 1)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Generator: geglättetes Rauschen + Reparaturschleife
// ---------------------------------------------------------------------------

function rauschen(b, h, rng) {
  const dichte = 0.45 + rng.zahl() * 0.15;
  let bild = Array.from({ length: b * h }, () => (rng.zahl() < dichte ? 1 : 0));
  const runden = Math.min(b, h) >= 10 ? (rng.zahl() < 0.5 ? 1 : 2) : (rng.zahl() < 0.5 ? 0 : 1);
  for (let r = 0; r < runden; r++) {
    const neu = bild.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < b; x++) {
        let voll = 0, alle = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= b || ny >= h) continue;
            alle++; voll += bild[ny * b + nx];
          }
        }
        if (voll * 2 > alle) neu[y * b + x] = 1;
        else if (voll * 2 < alle) neu[y * b + x] = 0;
      }
    }
    bild = neu;
  }
  return bild;
}

/**
 * Erzeugt ein eindeutig und ohne Raten lösbares Zufallsbild.
 * Deterministisch: gleiche Größe + Seed → gleiches Rätsel (Grenze in Schritten, nicht in Zeit).
 * @returns {{ b, h, seed, loesung: string }}
 */
export function erzeuge(b, h, seed, { budget = 400000 } = {}) {
  const rng = erstelleZufall(`nono-${b}x${h}-${seed}`);
  const flipsJeVersuch = Math.max(30, Math.round(b * h * 0.6));
  let verbraucht = 0;
  let bild = null;
  for (;;) {
    bild = rauschen(b, h, rng);
    for (let f = 0; f <= flipsJeVersuch; f++) {
      const r = loeseLogisch(b, h, hinweiseAus(bild, b, h));
      verbraucht += r.schritte;
      if (r.status === 'geloest') {
        const voll = bild.reduce((a, v) => a + v, 0) / (b * h);
        if (voll >= 0.3 && voll <= 0.7) return { b, h, seed: String(seed), loesung: bild.join('') };
        break;   // zu leer/zu voll → neues Rauschen
      }
      if (verbraucht > budget) return { b, h, seed: String(seed), loesung: notloesung(bild, b, h).join('') };
      // eine unbestimmte Zelle kippen – bevorzugt am Rand eines unbestimmten Bereichs
      const offen = [];
      for (let i = 0; i < b * h; i++) if (r.wissen[i] === UNBEKANNT) offen.push(i);
      const rand = offen.filter((i) => {
        const x = i % b, y = Math.floor(i / b);
        return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const nx = x + dx, ny = y + dy;
          return nx >= 0 && ny >= 0 && nx < b && ny < h && r.wissen[ny * b + nx] !== UNBEKANNT;
        });
      });
      const i = rng.wahl(rand.length && rng.zahl() < 0.7 ? rand : offen);
      bild[i] ^= 1;
    }
  }
}

// Notbremse (Budget aufgebraucht): unbestimmte Zeilen ganz füllen, bis alles lösbar ist – terminiert immer.
function notloesung(bild, b, h) {
  for (let runde = 0; runde <= h; runde++) {
    const r = loeseLogisch(b, h, hinweiseAus(bild, b, h));
    if (r.status === 'geloest') return bild;
    let beste = 0, besteZahl = -1;
    for (let y = 0; y < h; y++) {
      let z = 0;
      for (let x = 0; x < b; x++) if (r.wissen[y * b + x] === UNBEKANNT) z++;
      if (z > besteZahl) { besteZahl = z; beste = y; }
    }
    for (let x = 0; x < b; x++) bild[beste * b + x] = 1;
  }
  return bild;
}

// ---------------------------------------------------------------------------
// Spielzellen auswerten
// ---------------------------------------------------------------------------

const ZU_WISSEN = { '.': UNBEKANNT, '#': VOLL, x: LEER };
export const wissenAus = (zeichen) => ZU_WISSEN[zeichen] ?? UNBEKANNT;

/**
 * Welche Zahlen einer Linie sind erledigt? (Nur Abgleich mit dem Hinweis, nie mit der Lösung.)
 * @param {number[]} hinweis
 * @param {string[]} zeichen  Zellen der Linie ('.', '#', 'x')
 * @returns {{ erledigt: boolean[], widerspruch: boolean, komplett: boolean }}
 */
export function linienStatus(hinweis, zeichen) {
  const k = hinweis.length;
  const erledigt = new Array(k).fill(false);
  const wissen = zeichen.map(wissenAus);
  const widerspruch = loeseLinie(hinweis, wissen) === null;
  const ist = bloecke(zeichen.map((c) => c === '#'));
  const komplett = !widerspruch && ist.length === k && ist.every((v, j) => v === hinweis[j]);
  if (komplett) return { erledigt: erledigt.fill(true), widerspruch, komplett };
  if (widerspruch) return { erledigt, widerspruch, komplett };
  // vom Rand her abgeschlossene Blöcke (nur Kreuze/Rand davor, Kreuz/Rand dahinter)
  const vonLinks = (folge, zahlen) => {
    const fertig = [];
    let i = 0, j = 0;
    const n = folge.length;
    while (i < n && j < zahlen.length) {
      if (folge[i] === 'x') { i++; continue; }
      if (folge[i] !== '#') break;
      let e = i;
      while (e < n && folge[e] === '#') e++;
      if (e < n && folge[e] !== 'x') break;          // Block nicht abgeschlossen
      if (e - i !== zahlen[j]) break;
      fertig.push(j);
      j++; i = e;
    }
    return fertig;
  };
  for (const j of vonLinks(zeichen, hinweis)) erledigt[j] = true;
  for (const j of vonLinks(zeichen.slice().reverse(), hinweis.slice().reverse())) erledigt[k - 1 - j] = true;
  return { erledigt, widerspruch, komplett };
}

/** Alle Hinweise erfüllt? (Kreuze zählen nicht.) */
export function istGeloest(s) {
  const { b, h, hinweise, zellen } = s;
  for (let nr = 0; nr < h + b; nr++) {
    const ist = bloecke(linienIndizes(b, h, nr).map((i) => zellen[i] === '#'));
    const soll = nr < h ? hinweise.zeilen[nr] : hinweise.spalten[nr - h];
    if (ist.length !== soll.length || ist.some((v, j) => v !== soll[j])) return false;
  }
  return true;
}

/** Falsch gesetzte Zellen (gefüllt, aber in der Lösung leer) */
export function falscheZellen(s) {
  const r = [];
  for (let i = 0; i < s.zellen.length; i++) if (s.zellen[i] === '#' && s.loesung[i] === '0') r.push(i);
  return r;
}

// ---------------------------------------------------------------------------
// Hinweis: nächster logischer Schritt mit Erklärung
// ---------------------------------------------------------------------------

export function linienName(b, h, nr) {
  return nr < h ? `Zeile ${nr + 1}` : `Spalte ${nr - h + 1}`;
}

/**
 * @returns {null | { typ: 'fehler'|'schritt', linie?, index, wert: '.'|'#'|'x', text }}
 */
export function naechsterSchritt(s) {
  const { b, h, hinweise, zellen, loesung } = s;
  const pos = (i) => `Zeile ${Math.floor(i / b) + 1}, Spalte ${(i % b) + 1}`;
  // 1. Fehler zuerst
  for (let i = 0; i < b * h; i++) {
    if (zellen[i] === '#' && loesung[i] === '0') {
      return { typ: 'fehler', index: i, wert: '.', text: `${pos(i)} gehört nicht zum Bild – die Füllung wurde entfernt.` };
    }
    if (zellen[i] === 'x' && loesung[i] === '1') {
      return { typ: 'fehler', index: i, wert: '.', text: `${pos(i)} gehört zum Bild – das Kreuz wurde entfernt.` };
    }
  }
  // 2. Linie mit dem meisten sicheren Fortschritt
  let beste = null;
  for (let nr = 0; nr < h + b; nr++) {
    const idx = linienIndizes(b, h, nr);
    const hinweis = nr < h ? hinweise.zeilen[nr] : hinweise.spalten[nr - h];
    const vorher = idx.map((i) => wissenAus(zellen[i]));
    const neu = loeseLinie(hinweis, vorher);
    if (!neu) continue;
    const neuVoll = [], neuLeer = [];
    for (let p = 0; p < idx.length; p++) {
      if (neu[p] === vorher[p]) continue;
      // Kreuze fehlen oft nur – nur melden, wenn die Lösung zustimmt (sie tut es bei korrektem Stand)
      (neu[p] === VOLL ? neuVoll : neuLeer).push(p);
    }
    const zahl = neuVoll.length * 2 + neuLeer.length;
    if (zahl && (!beste || zahl > beste.zahl)) beste = { nr, idx, hinweis, vorher, neu, neuVoll, neuLeer, zahl };
  }
  if (!beste) return null;
  const { nr, idx, hinweis, vorher, neuVoll, neuLeer } = beste;
  const p = neuVoll.length ? neuVoll[0] : neuLeer[0];
  const voll = neuVoll.length > 0;
  const n = idx.length;
  const name = linienName(b, h, nr);
  const zellName = nr < h ? `Spalte ${p + 1}` : `Zeile ${p + 1}`;
  const summe = hinweis.reduce((a, v) => a + v, 0);
  const schonVoll = vorher.filter((v) => v === VOLL).length;
  let grund;
  if (!hinweis.length) grund = 'Die Zahl ist 0 – die ganze Linie bleibt leer.';
  else if (summe + hinweis.length - 1 === n) grund = 'Die Blöcke füllen die Linie mit je einer Lücke genau aus.';
  else if (!voll && schonVoll === summe) grund = 'Alle Blöcke sind schon gesetzt – die übrigen Felder bleiben leer.';
  else if (vorher.every((v) => v === UNBEKANNT)) grund = 'Die Blöcke überlappen sich in jeder möglichen Lage – dort muss ein Feld voll sein.';
  else if (voll) grund = 'In jeder Lage der Blöcke, die zu den gesetzten Feldern passt, ist dieses Feld voll.';
  else grund = 'Kein Block kann dieses Feld erreichen, ohne den Zahlen oder den gesetzten Feldern zu widersprechen.';
  const zahlen = hinweis.length ? hinweis.join(' ') : '0';
  return {
    typ: 'schritt', linie: nr, index: idx[p], wert: voll ? '#' : 'x',
    text: `${name} (${zahlen}): ${zellName} ist ${voll ? 'voll' : 'leer'}. ${grund}`,
  };
}

// ---------------------------------------------------------------------------
// Spielstand
// ---------------------------------------------------------------------------

/**
 * @param {{ quelle: 'motiv'|'zufall', b, h, loesung: string, seed?, motivId?, titel? }} r
 */
export function neuerStand(r) {
  return {
    quelle: r.quelle, seed: r.seed ?? null, motivId: r.motivId ?? null, titel: r.titel ?? null,
    b: r.b, h: r.h, loesung: r.loesung,
    hinweise: hinweiseAus(r.loesung, r.b, r.h),
    zellen: '.'.repeat(r.b * r.h),
    hinweiseGenutzt: 0, zuege: 0, geloest: false,
  };
}

const ganz = (v, a, e) => Number.isInteger(v) && v >= a && v <= e;
const textOderNull = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);

/** Lösung (Text) gültig für b×h? */
export function istGueltigeLoesung(loesung, b, h) {
  return typeof loesung === 'string' && loesung.length === b * h && /^[01]*$/.test(loesung);
}

/** Gespeicherten (nicht vertrauenswürdigen) Stand prüfen → bereinigter Stand oder null */
export function pruefeStand(g) {
  if (!g || typeof g !== 'object') return null;
  const { b, h } = g;
  if (!ganz(b, 1, MAX_SEITE) || !ganz(h, 1, MAX_SEITE)) return null;
  if (!istGueltigeLoesung(g.loesung, b, h)) return null;
  if (typeof g.zellen !== 'string' || g.zellen.length !== b * h || !/^[.#x]*$/.test(g.zellen)) return null;
  if (g.quelle !== 'motiv' && g.quelle !== 'zufall') return null;
  return {
    quelle: g.quelle, seed: textOderNull(g.seed, 80), motivId: textOderNull(g.motivId, 60), titel: textOderNull(g.titel, 60),
    b, h, loesung: g.loesung,
    hinweise: hinweiseAus(g.loesung, b, h),     // nie aus dem Speicher übernehmen
    zellen: g.zellen,
    hinweiseGenutzt: ganz(g.hinweiseGenutzt, 0, 1e6) ? g.hinweiseGenutzt : 0,
    zuege: ganz(g.zuege, 0, 1e7) ? g.zuege : 0,
    geloest: g.geloest === true,
  };
}

/** Ein Verlaufseintrag: [[index, alt, neu], …] – prüfen */
export function istGueltigerZug(zug, anzahl) {
  return Array.isArray(zug) && zug.length > 0 && zug.length <= anzahl && zug.every((e) => Array.isArray(e) && e.length === 3
    && ganz(e[0], 0, anzahl - 1) && ['.', '#', 'x'].includes(e[1]) && ['.', '#', 'x'].includes(e[2]));
}

/** Zug anwenden (vorwärts: neu, rückwärts: alt) → neuer Zellen-Text */
export function wendeZugAn(zellen, zug, rueckwaerts = false) {
  const z = zellen.split('');
  if (rueckwaerts) for (let p = zug.length - 1; p >= 0; p--) z[zug[p][0]] = zug[p][1];
  else for (const [i, , neu] of zug) z[i] = neu;
  return z.join('');
}

// ---------------------------------------------------------------------------
// Motive
// ---------------------------------------------------------------------------

/** Motiv aus motive.json prüfen → { id, titel, sammlung, b, h, loesung } oder null */
export function motivAus(m) {
  if (!m || typeof m !== 'object' || typeof m.id !== 'string' || typeof m.titel !== 'string') return null;
  const { b, h, zeilen } = m;
  if (!ganz(b, 1, MAX_SEITE) || !ganz(h, 1, MAX_SEITE) || !Array.isArray(zeilen) || zeilen.length !== h) return null;
  if (!zeilen.every((z) => typeof z === 'string' && z.length === b && /^[#.]*$/.test(z))) return null;
  return {
    id: m.id, titel: m.titel, sammlung: typeof m.sammlung === 'string' ? m.sammlung : '',
    b, h, loesung: zeilen.join('').replace(/#/g, '1').replace(/\./g, '0'),
  };
}
