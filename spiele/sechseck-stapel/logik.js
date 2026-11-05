// Sechseck-Stapel – Spiellogik ohne DOM. Zugfunktionen sind rein (neuer Zustand, alter bleibt).
// Ein Stapel ist ein Array von Farben (unten → oben), ein leeres Feld ist [].
import { erstelleZufall } from '../../kern/zufall.js';

export const ZIEL = 10;                 // so viele gleichfarbige Plättchen oben → sie verschwinden
export const MAX_HOEHE = 80;
const RUECKGAENGIG_KLASSISCH = 3;
const VERLAUF_MAX = 60;
const SCHRITT_BUDGET = 2000;
const ENTSPANNT_ABRAEUMEN = 6;

export const VARIANTEN = Object.freeze({
  entspannt: { farben: 4, form: 'wabe', modus: 'entspannt', name: 'Entspannt', zug: 0.6, lagen: [50, 40, 10] },
  leicht: { farben: 4, form: 'wabe', modus: 'klassisch', name: 'Leicht', zug: 0.4, lagen: [45, 40, 15] },
  mittel: { farben: 5, form: 'wabe', modus: 'klassisch', name: 'Mittel', zug: 0.2, lagen: [35, 45, 20] },
  schwer: { farben: 6, form: 'ohneEcken', modus: 'klassisch', name: 'Schwer', zug: 0, lagen: [25, 45, 30] },
});
export const VARIANTEN_IDS = Object.keys(VARIANTEN);

// ---------- Layout ----------

const RICHTUNGEN = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

function baueLayout(form) {
  const R = 3;
  const zellen = [];
  for (let r = -R; r <= R; r++) {
    for (let q = -R; q <= R; q++) {
      const s = -q - r;
      if (Math.abs(s) > R) continue;
      const ecke = Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) === R
        && [q, r, s].filter((v) => v === 0).length === 1;
      if (form === 'ohneEcken' && ecke) continue;
      zellen.push({ q, r, x: q + r / 2, y: r });
    }
  }
  const index = new Map(zellen.map((z, i) => [`${z.q},${z.r}`, i]));
  const nachbarn = zellen.map((z) => RICHTUNGEN
    .map(([dq, dr]) => index.get(`${z.q + dq},${z.r + dr}`))
    .filter((i) => i !== undefined));
  return { zellen, nachbarn, anzahl: zellen.length };
}

const LAYOUTS = { wabe: baueLayout('wabe'), ohneEcken: baueLayout('ohneEcken') };
export const layoutFuer = (variante) => LAYOUTS[(VARIANTEN[variante] || VARIANTEN.leicht).form];

// ---------- Stapel-Hilfen ----------

export const oben = (st) => (st.length ? st[st.length - 1] : null);

/** Länge der obersten gleichfarbigen Schicht */
export function obenAnzahl(st) {
  if (!st.length) return 0;
  const f = st[st.length - 1];
  let n = 0;
  for (let i = st.length - 1; i >= 0 && st[i] === f; i--) n++;
  return n;
}

/** Schichten eines Stapels: [{ farbe, anzahl }] unten → oben */
export function schichten(st) {
  const s = [];
  for (const f of st) {
    if (s.length && s[s.length - 1].farbe === f) s[s.length - 1].anzahl++;
    else s.push({ farbe: f, anzahl: 1 });
  }
  return s;
}

// ---------- Zusammenführen ----------

/**
 * Löst nach dem Legen auf Feld `start` alle Zusammenführungen und Auflösungen auf.
 * @returns {{ brett, schritte:[{typ:'wandern', von:number[], nach, farbe, anzahl:number[], brett} | {typ:'weg', zelle, farbe, anzahl, punkte, brett}], punkte, aufgeloest }}
 */
export function loese(brettEin, nachbarn, start) {
  const brett = brettEin.map((st) => st.slice());
  const schritte = [];
  let punkte = 0, aufgeloest = 0, kette = 0;
  const schlange = [start];
  let budget = SCHRITT_BUDGET;
  const einreihen = (i) => { if (!schlange.includes(i)) schlange.push(i); };

  while (schlange.length && budget-- > 0) {
    const c = schlange.shift();
    const farbe = oben(brett[c]);
    if (farbe === null) continue;
    const gruppe = [c, ...nachbarn[c].filter((n) => oben(brett[n]) === farbe)];
    if (gruppe.length < 2) continue;

    // Ziel: längste Oberschicht → weniger darunter → c selbst → kleinster Index
    let ziel = gruppe[0];
    for (const g of gruppe.slice(1)) {
      const a = obenAnzahl(brett[g]), b = obenAnzahl(brett[ziel]);
      const ua = brett[g].length - a, ub = brett[ziel].length - b;
      if (a > b || (a === b && (ua < ub || (ua === ub && ziel !== c && g < ziel)))) ziel = g;
    }
    const von = [], anzahl = [];
    for (const g of gruppe) {
      if (g === ziel) continue;
      const n = obenAnzahl(brett[g]);
      brett[g].length -= n;
      for (let k = 0; k < n; k++) brett[ziel].push(farbe);
      von.push(g); anzahl.push(n);
    }
    schritte.push({ typ: 'wandern', von, nach: ziel, farbe, anzahl, brett: brett.map((st) => st.slice()) });

    const n = obenAnzahl(brett[ziel]);
    if (n >= ZIEL) {
      brett[ziel].length -= n;
      kette++;
      const p = n * kette;
      punkte += p; aufgeloest += n;
      schritte.push({ typ: 'weg', zelle: ziel, farbe, anzahl: n, punkte: p, brett: brett.map((st) => st.slice()) });
    }
    einreihen(ziel);
    for (const g of von) if (brett[g].length) einreihen(g);
  }
  // Auch ein einzeln gelegter Stapel mit ≥ 10 oben löst sich auf
  return { brett, schritte, punkte, aufgeloest };
}

// ---------- Angebot ----------

const ANZAHL_GEWICHTE = [[2, 1], [3, 3], [4, 4], [5, 3], [6, 2]];

function gewichtet(rng, liste) {
  const summe = liste.reduce((s, [, g]) => s + g, 0);
  let r = rng.zahl() * summe;
  for (const [wert, g] of liste) { r -= g; if (r < 0) return wert; }
  return liste[liste.length - 1][0];
}

/** Ein Stapel fürs Angebot (fair gewichtet nach den obersten Farben auf dem Feld) */
export function neuerStapel(rng, brett, farben, schonOben = [], profil = VARIANTEN.leicht) {
  const plaettchen = gewichtet(rng, ANZAHL_GEWICHTE);
  const lagen = Math.min(plaettchen, gewichtet(rng, profil.lagen.map((g, k) => [k + 1, g])));
  const zaehler = new Array(farben).fill(0);
  for (const st of brett) { const f = oben(st); if (f !== null && f < farben) zaehler[f]++; }
  // Lagengrößen: Plättchen auf die Lagen verteilen (jede ≥ 1)
  const groessen = new Array(lagen).fill(1);
  for (let k = lagen; k < plaettchen; k++) groessen[rng.ganz(0, lagen - 1)]++;
  const stapel = [];
  let vorige = null;
  for (let l = 0; l < lagen; l++) {
    const oberste = l === lagen - 1;
    const kandidaten = [];
    for (let f = 0; f < farben; f++) {
      if (f === vorige) continue;
      let g = 1 + profil.zug * Math.min(zaehler[f], 6);
      if (oberste && schonOben.includes(f)) g *= 0.5;
      kandidaten.push([f, g]);
    }
    const f = gewichtet(rng, kandidaten);
    for (let k = 0; k < groessen[l]; k++) stapel.push(f);
    vorige = f;
  }
  return stapel;
}

export function neuesAngebot(rng, brett, farben, profil = VARIANTEN.leicht) {
  const angebot = [];
  for (let k = 0; k < 3; k++) angebot.push(neuerStapel(rng, brett, farben, angebot.map(oben), profil));
  return angebot;
}

// ---------- Spielzustand ----------

export function neuesSpiel(seed, variante = 'leicht') {
  const v = VARIANTEN_IDS.includes(variante) ? variante : 'leicht';
  const { farben, modus } = VARIANTEN[v];
  const rng = erstelleZufall(seed);
  const brett = Array.from({ length: layoutFuer(v).anzahl }, () => []);
  const angebot = neuesAngebot(rng, brett, farben, VARIANTEN[v]);
  return {
    version: 1,
    variante: v,
    seed: rng.seed,
    rng: rng.zustand(),
    brett,
    angebot,
    punkte: 0,
    zuege: 0,
    aufgeloest: 0,
    rueckgaengigRest: modus === 'klassisch' ? RUECKGAENGIG_KLASSISCH : null,
    verlauf: [],
    beendet: false,
  };
}

export const modusVon = (z) => VARIANTEN[z.variante].modus;
export const farbenVon = (z) => VARIANTEN[z.variante].farben;
export const freieFelder = (brett) => brett.reduce((a, st, i) => (st.length ? a : [...a, i]), []);

const ohneVerlauf = ({ verlauf, ...rest }) => rest;
const kopie = (z) => JSON.parse(JSON.stringify(z));

/** Entspannt bei vollem Feld: die kleinsten Stapel abräumen (Gleichstand → kleinerer Index) */
export function raeumeKleinste(brett, anzahl = ENTSPANNT_ABRAEUMEN) {
  const reihenfolge = brett.map((st, i) => [st.length, i]).filter(([n]) => n > 0)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, anzahl).map(([, i]) => i);
  const neu = brett.map((st, i) => (reihenfolge.includes(i) ? [] : st.slice()));
  return { brett: neu, geraeumt: reihenfolge.sort((a, b) => a - b) };
}

/**
 * Stapel aus Platz `platz` (0–2) auf Feld `zelle` legen.
 * @returns {{ zustand, schritte, punkte, aufgeloest, abgeraeumt:number[], hinweis:string|null } | null}
 */
export function zug(z, platz, zelle) {
  if (z.beendet) return null;
  const stapel = z.angebot[platz];
  const layout = layoutFuer(z.variante);
  if (!stapel || !Number.isInteger(zelle) || zelle < 0 || zelle >= layout.anzahl) return null;
  if (z.brett[zelle].length) return null;

  const gelegt = z.brett.map((st) => st.slice());
  gelegt[zelle] = stapel.slice();
  const r = loese(gelegt, layout.nachbarn, zelle);
  let brett = r.brett;

  // Einzelner Stapel kann nicht ≥ 10 haben (max. 6), daher reicht loese().
  const angebot = z.angebot.map((a) => (a ? a.slice() : null));
  angebot[platz] = null;
  const rng = erstelleZufall(z.seed, z.rng);
  let neuesAng = angebot;
  if (angebot.every((a) => a === null)) neuesAng = neuesAngebot(rng, brett, farbenVon(z), VARIANTEN[z.variante]);

  let beendet = false, abgeraeumt = [], hinweis = null;
  if (freieFelder(brett).length === 0) {
    if (modusVon(z) === 'entspannt') {
      const e = raeumeKleinste(brett);
      brett = e.brett;
      abgeraeumt = e.geraeumt;
      hinweis = 'Das Feld war voll – die kleinsten Stapel wurden abgeräumt.';
    } else {
      beendet = true;
    }
  }

  const neu = {
    ...ohneVerlauf(z),
    brett,
    angebot: neuesAng,
    rng: rng.zustand(),
    punkte: z.punkte + r.punkte,
    zuege: z.zuege + 1,
    aufgeloest: z.aufgeloest + r.aufgeloest,
    beendet,
    verlauf: [...z.verlauf, kopie(ohneVerlauf(z))].slice(-VERLAUF_MAX),
  };
  return { zustand: neu, schritte: r.schritte, punkte: r.punkte, aufgeloest: r.aufgeloest, abgeraeumt, hinweis };
}

export function kannRueckgaengig(z) {
  return z.verlauf.length > 0 && (z.rueckgaengigRest === null || z.rueckgaengigRest > 0);
}

export function rueckgaengig(z) {
  if (!kannRueckgaengig(z)) return null;
  const vorher = z.verlauf[z.verlauf.length - 1];
  return {
    ...kopie(vorher),
    verlauf: z.verlauf.slice(0, -1),
    rueckgaengigRest: z.rueckgaengigRest === null ? null : z.rueckgaengigRest - 1,
  };
}

/** Bewertung eines Ablageorts (für Hinweis) */
function bewerte(z, platz, zelle) {
  const layout = layoutFuer(z.variante);
  const gelegt = z.brett.map((st) => st.slice());
  gelegt[zelle] = z.angebot[platz].slice();
  const r = loese(gelegt, layout.nachbarn, zelle);
  const bewegt = r.schritte.reduce((s, x) => s + (x.typ === 'wandern' ? x.anzahl.reduce((a, b) => a + b, 0) : 0), 0);
  const frei = freieFelder(r.brett).length;
  // Nachbarn mit passender Oberfarbe für spätere Züge
  let passend = 0;
  for (const n of layout.nachbarn[zelle]) if (r.brett[zelle].length && oben(r.brett[n]) === oben(r.brett[zelle])) passend++;
  const c = layout.zellen[zelle];
  const rand = Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.q + c.r));   // Einzelgänger lieber an den Rand
  return r.aufgeloest * 100 + bewegt * 10 + frei * 3 + passend * 2 + rand;
}

/** Bester Ablageort: { platz, zelle } oder null */
export function hinweis(z) {
  if (z.beendet) return null;
  let bestes = null;
  const frei = freieFelder(z.brett);
  z.angebot.forEach((st, platz) => {
    if (!st) return;
    for (const zelle of frei) {
      const wert = bewerte(z, platz, zelle);
      if (!bestes || wert > bestes.wert) bestes = { platz, zelle, wert };
    }
  });
  return bestes ? { platz: bestes.platz, zelle: bestes.zelle } : null;
}

/** Vorschau: Nachbarn, deren oberste Farbe zur obersten Farbe des Stapels passt */
export function passendeNachbarn(z, stapel, zelle) {
  const f = oben(stapel);
  return layoutFuer(z.variante).nachbarn[zelle].filter((n) => oben(z.brett[n]) === f);
}

// ---------- Prüfen / Speichern ----------

const istGanz = (x, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isInteger(x) && x >= min && x <= max;

function istStapel(st, farben, leerErlaubt) {
  return Array.isArray(st) && st.length <= MAX_HOEHE && (leerErlaubt || st.length > 0)
    && st.every((f) => istGanz(f, 0, farben - 1));
}

function istGueltigerStand(z) {
  if (!z || typeof z !== 'object' || Array.isArray(z) || z.version !== 1) return false;
  if (typeof z.variante !== 'string' || !Object.hasOwn(VARIANTEN, z.variante)) return false;
  const { farben, modus } = VARIANTEN[z.variante];
  const n = layoutFuer(z.variante).anzahl;
  return typeof z.seed === 'string' && z.seed.length <= 64
    && Array.isArray(z.rng) && z.rng.length === 4 && z.rng.every((x) => istGanz(x, 0, 0xffffffff))
    && Array.isArray(z.brett) && z.brett.length === n && z.brett.every((st) => istStapel(st, farben, true))
    && Array.isArray(z.angebot) && z.angebot.length === 3
    && z.angebot.every((st) => st === null || (istStapel(st, farben, false) && st.length <= 12))
    && z.angebot.some((st) => st !== null)
    && istGanz(z.punkte) && istGanz(z.zuege) && istGanz(z.aufgeloest)
    && (modus === 'klassisch' ? istGanz(z.rueckgaengigRest, 0, RUECKGAENGIG_KLASSISCH) : z.rueckgaengigRest === null)
    && typeof z.beendet === 'boolean';
}

/** Gründliche Prüfung (Stand kann aus einer fremden Sicherungsdatei stammen) */
export function istGueltig(z) {
  return istGueltigerStand(z) && Array.isArray(z.verlauf) && z.verlauf.length <= VERLAUF_MAX
    && z.verlauf.every((v) => istGueltigerStand(v) && !('verlauf' in v) && v.variante === z.variante);
}

/** Geprüfter, frischer Zustand aus einem gespeicherten Stand – oder null */
export function ausSpeicher(stand) {
  if (!istGueltig(stand)) return null;
  const z = kopie(stand);
  // nur bekannte Felder übernehmen
  const nimm = (s) => ({
    version: 1, variante: s.variante, seed: s.seed, rng: s.rng, brett: s.brett, angebot: s.angebot,
    punkte: s.punkte, zuege: s.zuege, aufgeloest: s.aufgeloest, rueckgaengigRest: s.rueckgaengigRest, beendet: s.beendet,
  });
  return { ...nimm(z), verlauf: z.verlauf.map(nimm) };
}

export const zumSpeichern = (z) => kopie(z);
