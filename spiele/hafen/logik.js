// Hafen: Rechenkern (ohne DOM, ohne Zufall, ohne Uhr). Fließmodell mit Puffern:
// Schiff -> Entladen -> Dock-Lager -> Kran -> Hauptlager -> Verkauf -> Münzen.
// Jede Ebene ist ein Dock mit eigener Ressource; neue Docks werden gekauft.
// Drei Arten von Stufen: Dock (je Dock), Kran (einer für alle), Verkauf (einer, mit Leuchtturm).

export const MAX_DOCKS = 8;
export const MAX_STUFE = 40;
export const MAX_GELD = 1e30;
export const OFFLINE_MAX_S = 8 * 3600;   // Deckel der Abwesenheit
export const OFFLINE_VOLL_S = 60;        // bis hierhin voller Wert
export const OFFLINE_FAKTOR = 0.5;       // danach nur die Hälfte
export const MAX_SCHRITTE = 600;
export const ANSCHUB_ANTEIL = 0.02;      // Schub beim Antippen (Anteil einer Fahrt)
export const ANSCHUB_PAUSE_S = 1.5;
export const STAND_VERSION = 4;
const MAX_ZEIT_MS = 4e12;
const ZUKUNFT_MS = 24 * 3600 * 1000;     // so weit darf ein Zeitstempel in der Zukunft liegen
const DOCK_FAKTOR = 5;                   // Dock-Stufen kosten je Ebene so viel mehr

/** Ressourcen der Docks (Ebenen): Wert je Einheit */
export const EBENEN = [
  { id: 'holz', name: 'Holz', wert: 1 },
  { id: 'fisch', name: 'Fisch', wert: 3 },
  { id: 'erz', name: 'Erz', wert: 9 },
  { id: 'kohle', name: 'Kohle', wert: 27 },
  { id: 'stoffe', name: 'Stoffe', wert: 81 },
  { id: 'gewuerze', name: 'Gewürze', wert: 243 },
  { id: 'porzellan', name: 'Porzellan', wert: 729 },
  { id: 'perlen', name: 'Perlen', wert: 2187 },
];

/** Kosten: basis · wachs^(stufe−1) */
const KOSTEN = {
  dock: { basis: 12, wachs: 1.2 },
  kran: { basis: 25, wachs: 1.25 },
  verkauf: { basis: 30, wachs: 1.25 },
};
const NEU_BASIS = 60;                    // Preis des 2. Docks
const NEU_WACHS = 4;                     // Preisfaktor je weiteres Dock

const ZAHL = (x) => typeof x === 'number' && Number.isFinite(x);
const GANZ = (x, a, b) => ZAHL(x) && Number.isInteger(x) && x >= a && x <= b;

// ---------- Formeln ----------
export const schiffGroesse = (d) => 10 * (1 + 0.12 * (d.stufe - 1));
export const entladeRate = (d) => 1.0 * (1 + 0.15 * (d.stufe - 1));
export const anlegenZeit = (d) => 4 / (1 + 0.03 * (d.stufe - 1));
export const wartezeit = (d) => 7 / (1 + 0.08 * (d.stufe - 1));
export const dockKap = (d) => 20 * (1 + 0.25 * (d.stufe - 1));
export const entladeZeit = (d) => schiffGroesse(d) / entladeRate(d);
export const zyklusZeit = (d) => anlegenZeit(d) + entladeZeit(d) + wartezeit(d);
/** Ware, die das Dock je Sekunde anliefert (Einheiten/s) */
export const anlieferung = (d) => schiffGroesse(d) / zyklusZeit(d);
/** Transporttempo des Krans (Einheiten/s für alle Docks zusammen) */
export const transportRate = (z) => 1.2 * (1 + 0.3 * (z.kran - 1));
export const hallenKap = (z) => 60 * (1 + 0.25 * (z.verkauf - 1));
export const verkaufsRate = (z) => 1 * (1 + 0.5 * (z.verkauf - 1));
/** Leuchtturm-Reichweite 0..1 (nur Optik, an die Verkaufsstufe gekoppelt) */
export const reichweite = (z) => Math.min(1, 0.3 + 0.025 * z.verkauf);
export const hauptSumme = (z) => z.haupt.reduce((a, b) => a + b, 0);
export const puffer = (z) => z.docks.reduce((a, d) => a + d.puffer, 0);

/** Phasen des Schiffs (Anteil an der Zykluszeit): bis `von` Anfahrt, bis `bis` Entladen, danach Ablegen */
export function phasen(d) {
  const T = zyklusZeit(d);
  const an = anlegenZeit(d) + wartezeit(d) * 0.6;
  return { von: an / T, bis: (an + entladeZeit(d)) / T };
}

// ---------- Zustand ----------
function neuesDock(n) {
  return { stufe: 1, p: (n * 0.37) % 1, puffer: 0 };
}

/**
 * Frischer Hafen. Im Level-Modus (`modus` 'level', `level` ≥ 1) kommen Startkapital und Startdocks aus der Leveldefinition.
 */
export function neuerHafen(jetztMs, modus = 'endlos', level = 0) {
  const lv = modus === 'level' ? Math.max(1, Math.min(LEVEL_MAX, Math.floor(level) || 1)) : 0;
  const def = lv ? levelDef(lv) : { geld: 0, docks: 1 };
  return {
    v: STAND_VERSION, t: sichereZeit(jetztMs), uhr: 0, sperre: 0, geld: def.geld, gesamt: 0,
    modus: lv ? 'level' : 'endlos', level: lv, weiter: 0,
    kran: 1, verkauf: 1, docks: Array.from({ length: def.docks }, (_, i) => neuesDock(i)),
    haupt: new Array(MAX_DOCKS).fill(0),
    verkauft: new Array(MAX_DOCKS).fill(0),
  };
}

// ---------- Level ----------
export const LEVEL_MAX = 999;

/**
 * Handgesetzte Level: Ziele (alle müssen erreicht sein), Startkapital, Startdocks, Obergrenze der Docks.
 * Zielarten: verdient (Münzen gesamt) · docks · kran · verkauf · dockstufe (höchste Dockstufe) · ware (verkaufte Einheiten der Ressource `ware`).
 */
export const LEVEL = [
  { docks: 1, geld: 0, ziele: [{ art: 'verdient', wert: 150 }] },
  { docks: 1, geld: 0, ziele: [{ art: 'dockstufe', wert: 5 }] },
  { docks: 1, geld: 0, ziele: [{ art: 'docks', wert: 2 }, { art: 'verdient', wert: 200 }] },
  { docks: 2, geld: 0, ziele: [{ art: 'kran', wert: 5 }] },
  { docks: 2, geld: 0, ziele: [{ art: 'verdient', wert: 800 }] },
  { docks: 2, geld: 0, ziele: [{ art: 'ware', ware: 1, wert: 150 }] },
  { docks: 2, geld: 0, ziele: [{ art: 'verkauf', wert: 5 }] },
  { docks: 3, geld: 0, ziele: [{ art: 'docks', wert: 4 }, { art: 'verdient', wert: 1000 }] },
  { docks: 3, geld: 0, ziele: [{ art: 'ware', ware: 2, wert: 150 }] },
  { docks: 3, geld: 0, ziele: [{ art: 'verdient', wert: 3000 }] },
  { docks: 3, geld: 0, ziele: [{ art: 'kran', wert: 7 }, { art: 'verkauf', wert: 7 }] },
  { docks: 4, geld: 0, ziele: [{ art: 'dockstufe', wert: 14 }] },
  { docks: 4, geld: 0, ziele: [{ art: 'ware', ware: 3, wert: 150 }] },
  { docks: 4, maxDocks: 4, geld: 0, ziele: [{ art: 'verdient', wert: 8000 }] },
  { docks: 4, geld: 0, ziele: [{ art: 'docks', wert: 6 }, { art: 'verdient', wert: 6000 }] },
  { docks: 5, geld: 0, ziele: [{ art: 'ware', ware: 4, wert: 150 }] },
  { docks: 5, geld: 0, ziele: [{ art: 'verdient', wert: 20000 }, { art: 'kran', wert: 8 }] },
  { docks: 5, maxDocks: 5, geld: 0, ziele: [{ art: 'ware', ware: 1, wert: 350 }, { art: 'ware', ware: 2, wert: 200 }] },
  { docks: 6, geld: 0, ziele: [{ art: 'ware', ware: 5, wert: 150 }] },
  { docks: 6, geld: 0, ziele: [{ art: 'verkauf', wert: 12 }, { art: 'dockstufe', wert: 24 }] },
  { docks: 6, geld: 0, ziele: [{ art: 'verkauf', wert: 8 }, { art: 'verdient', wert: 25000 }] },
  { docks: 7, geld: 0, ziele: [{ art: 'ware', ware: 6, wert: 150 }] },
  { docks: 7, geld: 0, ziele: [{ art: 'verdient', wert: 150000 }] },
  { docks: 8, geld: 0, ziele: [{ art: 'ware', ware: 7, wert: 100 }, { art: 'kran', wert: 9 }] },
];

/** Zeit-Faktor der generierten Level: Ziel ≈ GEN_FAKTOR Sekunden des Startein­kommens */
const GEN_FAKTOR = 900;

/** Leveldefinition zur Levelnummer (1…LEVEL_MAX): handgesetzt, danach deterministisch erzeugt und gedeckelt */
export function levelDef(n) {
  const nr = Math.max(1, Math.min(LEVEL_MAX, Math.floor(n) || 1));
  if (nr <= LEVEL.length) return LEVEL[nr - 1];
  const k = nr - LEVEL.length - 1;
  const fam = k % 6;
  const stufe = Math.min(20, Math.floor(k / 6));
  const docks = Math.min(MAX_DOCKS, 4 + Math.floor(stufe / 2));
  const start = { v: STAND_VERSION, kran: 1, verkauf: 1, docks: Array.from({ length: docks }, (_, i) => neuesDock(i)) };
  const basis = einkommen(start) * GEN_FAKTOR * (1 + 0.12 * stufe) * (fam === 5 ? 1.3 : 1);
  const wert = runde(basis);
  const ziele = [{ art: 'verdient', wert }];
  if (fam === 1) ziele.push({ art: 'dockstufe', wert: Math.min(14, 6 + stufe) });
  if (fam === 2) ziele.push({ art: 'kran', wert: Math.min(14, 5 + stufe) });
  if (fam === 3) ziele.push({ art: 'verkauf', wert: Math.min(14, 5 + stufe) });
  if (fam === 4 && docks < MAX_DOCKS) ziele.push({ art: 'docks', wert: docks + 1 });
  return { docks, geld: 0, ziele };
}

/** Auf 2 gültige Stellen runden (schöne Zielzahlen) */
function runde(x) {
  if (!ZAHL(x) || x <= 0) return 100;
  const e = 10 ** Math.max(0, Math.floor(Math.log10(x)) - 1);
  return Math.max(10, Math.round(x / e) * e);
}

function istLevel(z) { return z.modus === 'level'; }
function defVon(z) { return istLevel(z) ? levelDef(z.level) : null; }

function zielWert(z, ziel) {
  switch (ziel.art) {
    case 'verdient': return z.gesamt;
    case 'docks': return z.docks.length;
    case 'kran': return z.kran;
    case 'verkauf': return z.verkauf;
    case 'dockstufe': return Math.max(...z.docks.map((d) => d.stufe));
    case 'ware': return z.verkauft[ziel.ware] ?? 0;
    default: return 0;
  }
}

/** Fortschritt zum Level-Ziel 0…1 (Mittel der Teilziele); im Endlos-Modus 0. `def` optional (für Auswertungen) */
export function zielFortschritt(z, def = defVon(z)) {
  if (!def) return 0;
  let s = 0;
  for (const ziel of def.ziele) s += Math.min(1, zielWert(z, ziel) / ziel.wert);
  return s / def.ziele.length;
}

/** Alle Teilziele erreicht? */
export function zielErreicht(z, def = defVon(z)) {
  return Boolean(def) && !z.weiter && def.ziele.every((ziel) => zielWert(z, ziel) >= ziel.wert);
}

/** Kurztext eines Ziels, z. B. „3 Docks“ oder „5.000 Münzen verdient“ */
export function zielText(def) {
  const f = formatiere;
  return def.ziele.map((ziel) => {
    switch (ziel.art) {
      case 'verdient': return `${f(ziel.wert)} Münzen verdient`;
      case 'docks': return `${ziel.wert} Docks`;
      case 'kran': return `Kran Stufe ${ziel.wert}`;
      case 'verkauf': return `Verkauf Stufe ${ziel.wert}`;
      case 'dockstufe': return `Dock Stufe ${ziel.wert}`;
      case 'ware': return `${f(ziel.wert)} ${EBENEN[ziel.ware].name} verkauft`;
      default: return '';
    }
  }).join(' + ');
}

/** Leveldefinition des Zustands (null im Endlos-Modus) */
export const levelVon = (z) => defVon(z);

function sichereZeit(t) {
  return ZAHL(t) && t >= 0 && t <= MAX_ZEIT_MS ? Math.floor(t) : 0;
}

function kopie(z) {
  return {
    v: STAND_VERSION, t: z.t, uhr: z.uhr, sperre: z.sperre, geld: z.geld, gesamt: z.gesamt,
    modus: z.modus, level: z.level, weiter: z.weiter, kran: z.kran, verkauf: z.verkauf,
    docks: z.docks.map((d) => ({ stufe: d.stufe, p: d.p, puffer: d.puffer })),
    haupt: z.haupt.slice(), verkauft: z.verkauft.slice(),
  };
}

/** Streng prüfen: true nur für einen vollständig gültigen Spielstand */
export function istGueltig(s) {
  try { pruefe(s); return true; } catch { return false; }
}

function pruefe(s) {
  const fehler = (m) => { throw new Error(`Ungültiger Spielstand: ${m}`); };
  if (!s || typeof s !== 'object' || Array.isArray(s)) fehler('kein Objekt');
  if (s.v !== STAND_VERSION) fehler('Version');
  if (!ZAHL(s.t) || s.t < 0 || s.t > MAX_ZEIT_MS) fehler('t');
  if (!ZAHL(s.uhr) || s.uhr < 0 || s.uhr > 1e12) fehler('uhr');
  if (!ZAHL(s.sperre) || s.sperre < 0 || s.sperre > ANSCHUB_PAUSE_S) fehler('sperre');
  if (!ZAHL(s.geld) || s.geld < 0 || s.geld > MAX_GELD) fehler('geld');
  if (!ZAHL(s.gesamt) || s.gesamt < 0 || s.gesamt > MAX_GELD) fehler('gesamt');
  if (!GANZ(s.kran, 1, MAX_STUFE)) fehler('kran');
  if (!GANZ(s.verkauf, 1, MAX_STUFE)) fehler('verkauf');
  if (!Array.isArray(s.docks) || s.docks.length < 1 || s.docks.length > MAX_DOCKS) fehler('docks');
  for (const d of s.docks) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) fehler('dock');
    if (!GANZ(d.stufe, 1, MAX_STUFE)) fehler('dock.stufe');
    if (!ZAHL(d.p) || d.p < 0 || d.p >= 1) fehler('dock.p');
    if (!ZAHL(d.puffer) || d.puffer < 0 || d.puffer > dockKap(d) * 1.001 + 1e-6) fehler('dock.puffer');
  }
  if (!Array.isArray(s.haupt) || s.haupt.length !== MAX_DOCKS) fehler('haupt');
  let summe = 0;
  s.haupt.forEach((x, i) => {
    if (!ZAHL(x) || x < 0 || x > MAX_GELD) fehler('haupt');
    if (i >= s.docks.length && x !== 0) fehler('haupt ohne Dock');
    summe += x;
  });
  if (summe > hallenKap({ verkauf: s.verkauf }) * 1.001 + 1e-6) fehler('Hauptlager über Kapazität');
  if (!Array.isArray(s.verkauft) || s.verkauft.length !== MAX_DOCKS) fehler('verkauft');
  s.verkauft.forEach((x, i) => {
    if (!ZAHL(x) || x < 0 || x > MAX_GELD) fehler('verkauft');
    if (i >= s.docks.length && x !== 0) fehler('verkauft ohne Dock');
  });
  if (s.modus === 'endlos') {
    if (s.level !== 0 || s.weiter !== 0) fehler('level im Endlos-Modus');
  } else if (s.modus === 'level') {
    if (!GANZ(s.level, 1, LEVEL_MAX) || !GANZ(s.weiter, 0, 1)) fehler('level');
    if (!s.weiter && s.docks.length > Math.max(levelDef(s.level).maxDocks ?? MAX_DOCKS, levelDef(s.level).docks)) fehler('Docks über Level-Grenze');
  } else fehler('modus');
}

/** Spielstand aus dem Speicher: gültig → saubere Kopie ohne Zusatzfelder, sonst Fehler */
export function ausSpeicher(s) {
  pruefe(s);
  return kopie(s);
}

/** Spielstand für den Speicher (mit Zeitstempel) */
export function zumSpeichern(z, jetztMs) {
  const k = kopie(z);
  k.t = sichereZeit(jetztMs);
  return k;
}

// ---------- Simulation ----------
/** Wie viel vom Entladefenster [von, bis) wird beim Vorrücken der Phase von p um dp durchlaufen (dp darf > 1 sein) */
function ueberlapp(p, dp, von, bis) {
  const ganz = Math.floor(dp);
  const rest = dp - ganz;
  const teil = (x0, x1) => Math.max(0, Math.min(x1, bis) - Math.max(x0, von));
  let o = ganz * (bis - von) + teil(p, p + rest);
  if (p + rest > 1) o += teil(0, p + rest - 1);
  return o;
}

/**
 * Rechnet dt Sekunden weiter. Rein und deterministisch, liefert einen neuen Zustand.
 * Große dt kosten höchstens MAX_SCHRITTE Schritte.
 */
export function fortschritt(z, dt) {
  const c = kopie(z);
  if (!ZAHL(dt) || dt <= 0) return c;
  const n = Math.min(MAX_SCHRITTE, Math.max(1, Math.ceil(dt / 0.5)));
  const h = dt / n;
  const N = c.docks.length;
  const T = c.docks.map(zyklusZeit);
  const ph = c.docks.map(phasen);
  const S = c.docks.map(schiffGroesse);
  const kap = c.docks.map(dockKap);
  const kranRate = transportRate(c);
  const kapH = hallenKap(c);
  const rate = verkaufsRate(c);
  for (let schritt = 0; schritt < n; schritt++) {
    // 1. Schiffe entladen stoßweise (im Entladefenster) in das Dock-Lager; der Kran leert es gleichzeitig
    for (let i = 0; i < N; i++) {
      const d = c.docks[i];
      const dp = h / T[i];
      const ein = (ueberlapp(d.p, dp, ph[i].von, ph[i].bis) / (ph[i].bis - ph[i].von)) * S[i];
      const frei = Math.max(0, kap[i] - d.puffer) + (kranRate / N) * h;
      const k = ein > frei ? frei / ein : 1;
      d.puffer += ein * k;
      d.p += dp * k;
      d.p -= Math.floor(d.p);
    }
    // 2. Der Kran bringt die Ware ins Hauptlager (anteilig nach Lagerstand, begrenzt durch freien Platz)
    const summe = c.docks.reduce((a, d) => a + d.puffer, 0);
    const freiH = Math.max(0, kapH - hauptSumme(c)) + rate * h;
    const will = Math.min(summe, kranRate * h, freiH);
    if (will > 0) {
      for (let i = 0; i < N; i++) {
        const m = will * (c.docks[i].puffer / summe);
        c.docks[i].puffer -= m;
        c.haupt[i] += m;
      }
    }
    // 3. Verkauf: wertvollste Ware zuerst
    let rest = rate * h;
    for (let i = N - 1; i >= 0 && rest > 0; i--) {
      const m = Math.min(c.haupt[i], rest);
      c.haupt[i] -= m;
      rest -= m;
      c.geld += m * EBENEN[i].wert;
      c.gesamt += m * EBENEN[i].wert;
      c.verkauft[i] = Math.min(c.verkauft[i] + m, MAX_GELD);
    }
  }
  c.uhr = Math.min(c.uhr + dt, 1e12);
  c.sperre = Math.max(0, c.sperre - dt);
  c.geld = Math.min(c.geld, MAX_GELD);
  c.gesamt = Math.min(c.gesamt, MAX_GELD);
  for (let i = 0; i < N; i++) c.docks[i].puffer = Math.min(Math.max(c.docks[i].puffer, 0), kap[i]);
  const sum = hauptSumme(c);
  if (sum > kapH) { const q = kapH / sum; for (let i = 0; i < MAX_DOCKS; i++) c.haupt[i] *= q; }
  for (let i = 0; i < MAX_DOCKS; i++) c.haupt[i] = Math.max(0, c.haupt[i]);
  return c;
}

/** Wirksame Rechenzeit für eine Abwesenheit von dt Sekunden (Deckel 8 h, danach nur die Hälfte) */
export function luecke(dt) {
  if (!ZAHL(dt) || dt <= 0) return 0;
  const d = Math.min(dt, OFFLINE_MAX_S);
  return d <= OFFLINE_VOLL_S ? d : OFFLINE_VOLL_S + (d - OFFLINE_VOLL_S) * OFFLINE_FAKTOR;
}

/** Abwesenheit seit z.t verrechnen. Uhr zurückgestellt oder Unsinn → 0 s. */
export function offline(z, jetztMs) {
  const jetzt = sichereZeit(jetztMs);
  const roh = (jetzt - z.t) / 1000;
  const dt = ZAHL(roh) && roh > 0 ? Math.min(roh, OFFLINE_MAX_S) : 0;
  const wirk = luecke(dt);
  const neu = wirk > 0 ? fortschritt(z, wirk) : kopie(z);
  neu.t = jetzt;
  return { zustand: neu, dt, gewinn: neu.geld - z.geld };
}

/** Ein Stand mit Zeitstempel zu weit in der Zukunft gilt als manipuliert */
export function zeitPlausibel(z, jetztMs) {
  return ZAHL(z.t) && z.t <= sichereZeit(jetztMs) + ZUKUNFT_MS;
}

// ---------- Einkommen ----------
/** Einkommen je Dock im Gleichgewicht (Münzen/s) und gesamt: Kran teilt anteilig, Verkauf teuerste zuerst */
export function einkommenDetail(z) {
  const an = z.docks.map(anlieferung);
  const summe = an.reduce((a, b) => a + b, 0);
  const f = summe > 0 ? Math.min(1, transportRate(z) / summe) : 0;
  const fluss = an.map((x) => x * f);
  const je = new Array(z.docks.length).fill(0);
  let rest = verkaufsRate(z);
  for (let i = z.docks.length - 1; i >= 0 && rest > 0; i--) {
    const m = Math.min(fluss[i], rest);
    rest -= m;
    je[i] = m * EBENEN[i].wert;
  }
  return { je, gesamt: je.reduce((a, b) => a + b, 0), fluss };
}
export const einkommen = (z) => einkommenDetail(z).gesamt;

// ---------- Käufe ----------
const SCHLUESSEL = /^d([0-7])$/;

/** Alle Kaufschlüssel, die es im Zustand gibt: dN (Dock-Stufe), kran, verkauf, neu (neues Dock) */
export function alleKaeufe(z) {
  const l = z.docks.map((_, i) => `d${i}`);
  l.push('kran', 'verkauf', 'neu');
  return l;
}

function stufeVon(z, was) {
  if (was === 'neu') return { art: 'neu', stufe: z.docks.length, max: MAX_DOCKS };
  if (was === 'kran') return { art: 'kran', stufe: z.kran, max: MAX_STUFE };
  if (was === 'verkauf') return { art: 'verkauf', stufe: z.verkauf, max: MAX_STUFE };
  const m = typeof was === 'string' ? SCHLUESSEL.exec(was) : null;
  if (!m) return null;
  const i = Number(m[1]);
  if (i >= z.docks.length) return null;
  return { art: 'dock', i, stufe: z.docks[i].stufe, max: MAX_STUFE };
}

/** Preis des Kaufs oder null (unbekannt / schon am Maximum) */
export function preis(z, was) {
  const s = stufeVon(z, was);
  if (!s || s.stufe >= s.max) return null;
  if (s.art === 'neu' && z.modus === 'level' && !z.weiter) {
    const d = levelDef(z.level);
    if (z.docks.length >= (d.maxDocks ?? MAX_DOCKS)) return null;
  }
  if (s.art === 'neu') return Math.round(NEU_BASIS * NEU_WACHS ** (s.stufe - 1));
  const k = KOSTEN[s.art];
  const mal = s.art === 'dock' ? DOCK_FAKTOR ** s.i : 1;
  return Math.max(1, Math.round(k.basis * k.wachs ** (s.stufe - 1) * mal));
}

/** Angezeigte Stufe (Dock, Kran, Verkauf) */
export function stufe(z, was) {
  const s = stufeVon(z, was);
  return s ? s.stufe : 0;
}

/** Name des Kaufs, z. B. „Holz-Dock“ */
export function bezeichnung(was) {
  if (was === 'kran') return 'Kran';
  if (was === 'verkauf') return 'Verkauf';
  if (was === 'neu') return 'Neues Dock';
  const m = typeof was === 'string' ? SCHLUESSEL.exec(was) : null;
  return m ? `${EBENEN[Number(m[1])].name}-Dock` : String(was);
}

/** Kauf ausführen: { ok, zustand, preis } oder { ok:false, grund } (Eingabe bleibt unverändert) */
export function kaufe(z, was) {
  const p = preis(z, was);
  if (p === null) return { ok: false, grund: 'nicht verfügbar' };
  if (z.geld < p) return { ok: false, grund: 'zu wenig Geld' };
  const c = kopie(z);
  c.geld -= p;
  if (was === 'neu') c.docks.push(neuesDock(c.docks.length));
  else if (was === 'kran') c.kran++;
  else if (was === 'verkauf') c.verkauf++;
  else c.docks[Number(SCHLUESSEL.exec(was)[1])].stufe++;
  return { ok: true, zustand: c, preis: p };
}

/** Wirkung eines Kaufs (für Tooltip/aria-label): { text, plus } (plus = Einkommenszuwachs in Münzen/s) */
export function effekt(z, was) {
  const r = kaufe({ ...z, geld: MAX_GELD }, was);
  if (!r.ok) return null;
  const a = r.zustand;
  const f = formatiere;
  const s = stufeVon(z, was);
  let text = '';
  if (s.art === 'dock') {
    const x = z.docks[s.i]; const y = a.docks[s.i];
    text = `Schiff ${f(schiffGroesse(x))} → ${f(schiffGroesse(y))}, Entladen ${f(entladeRate(x))} → ${f(entladeRate(y))}/s, Dock-Lager ${f(dockKap(x))} → ${f(dockKap(y))}`;
  } else if (s.art === 'kran') {
    text = `Kran-Transport ${f(transportRate(z))} → ${f(transportRate(a))} Einheiten/s`;
  } else if (s.art === 'verkauf') {
    text = `Verkauf ${f(verkaufsRate(z))} → ${f(verkaufsRate(a))}/s, Hauptlager ${f(hallenKap(z))} → ${f(hallenKap(a))}`;
  } else {
    text = `Neues Dock: ${EBENEN[z.docks.length].name}, ${f(EBENEN[z.docks.length].wert)} Münzen je Einheit`;
  }
  return { text, plus: einkommen(a) - einkommen(z) };
}

/** Günstigstes Upgrade, das das Einkommen wirklich steigert, samt Wartezeit; null wenn alles ausgebaut */
export function naechstesZiel(z) {
  const e0 = einkommen(z);
  let best = null;
  for (const was of alleKaeufe(z)) {
    const p = preis(z, was);
    if (p === null) continue;
    if (best && p >= best.preis) continue;
    const r = kaufe({ ...z, geld: p }, was);
    if (!r.ok) continue;
    if (einkommen(r.zustand) <= e0 * 1.0001) continue;
    best = { was, preis: p };
  }
  if (!best) return null;
  const fehlt = Math.max(0, best.preis - z.geld);
  best.wartezeit = fehlt <= 0 ? 0 : (e0 > 0 ? fehlt / e0 : Infinity);
  return best;
}

// ---------- Aktionen ohne Kosten ----------
/** Schiff antippen: leichter Schub beim Entladen (Pause zwischen zwei Schüben) */
export function anschub(z, dock) {
  if (!GANZ(dock, 0, z.docks.length - 1)) return { ok: false, grund: 'kein Dock' };
  if (z.sperre > 0) return { ok: false, grund: 'zu früh' };
  const c = kopie(z);
  const d = c.docks[dock];
  const S = schiffGroesse(d);
  const frei = Math.max(0, dockKap(d) - d.puffer);
  const dp = Math.min(ANSCHUB_ANTEIL, frei / S);
  if (dp <= 0) return { ok: false, grund: 'Lager voll' };
  d.puffer += dp * S;
  d.p += dp;
  d.p -= Math.floor(d.p);
  c.sperre = ANSCHUB_PAUSE_S;
  return { ok: true, zustand: c };
}

// ---------- Anzeige ----------
const EINHEITEN = [
  [1e24, 'Quadr.'], [1e21, 'Trd.'], [1e18, 'Trl.'], [1e15, 'Brd.'], [1e12, 'Bio.'], [1e9, 'Mrd.'], [1e6, 'Mio.'],
];

/** Kompakte Zahl, deutsch: 12,5 · 1.234 · 1,2 Mio. · 3,4 Mrd. · 2 Bio. */
export function formatiere(x) {
  if (!ZAHL(x) || x <= 0) return '0';
  if (x < 1000) return rund(x, x < 100 ? 1 : 0);
  if (x < 1e6) return Math.floor(x).toLocaleString('de-DE');
  for (const [grenze, name] of EINHEITEN) {
    if (x >= grenze) return `${rund(Math.floor((x / grenze) * 10) / 10, 1)} ${name}`;
  }
  return Math.floor(x).toLocaleString('de-DE');
}

function rund(x, stellen) {
  const f = 10 ** stellen;
  const w = Math.floor(x * f + 1e-9) / f;
  return w.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: stellen });
}

/** Dauer kurz: 45 s · 10 min · 2 h 5 min */
export function formatiereDauer(s) {
  if (!ZAHL(s)) return 'unbekannt';
  if (s <= 0) return 'sofort';
  if (s < 60) return `${Math.max(1, Math.round(s))} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) {
    const min = Math.round(s / 60);
    const hh = Math.floor(min / 60);
    const mm = min % 60;
    return mm ? `${hh} h ${mm} min` : `${hh} h`;
  }
  return `${Math.round(s / 86400)} Tage`;
}

/** Nach erreichtem Ziel ohne Ziel weiterspielen (Obergrenze der Docks entfällt, Ziel wird nicht noch einmal gemeldet) */
export function weiterspielen(z) {
  const c = kopie(z);
  if (c.modus === 'level') c.weiter = 1;
  return c;
}
