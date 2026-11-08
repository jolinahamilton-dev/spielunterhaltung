// Hafen: Rechenkern (ohne DOM, ohne Zufall). Fließmodell: Schiffe laufen ein, Kräne entladen,
// das Lager verkauft. Alles ist eine reine Funktion des Zustands und der verstrichenen Sekunden.

export const MAX_DOCKS = 6;
export const MAX_STUFE = 40;
export const MAX_GELD = 1e30;
export const OFFLINE_MAX_S = 8 * 3600;   // Deckel der Abwesenheit
export const OFFLINE_VOLL_S = 60;        // bis hierhin voller Wert
export const OFFLINE_FAKTOR = 0.5;       // danach nur die Hälfte
export const MAX_SCHRITTE = 600;
export const ANSCHUB_ANTEIL = 0.02;      // Schub beim Antippen (Anteil einer Fahrt)
export const ANSCHUB_PAUSE_S = 1.5;
const MAX_ZEIT_MS = 4e12;                // ~ Jahr 2096
const ZUKUNFT_MS = 24 * 3600 * 1000;     // so weit darf ein Zeitstempel in der Zukunft liegen

/** Frachtarten: Wert je Einheit, Mengenfaktor je Schiff, Krantempo-Faktor, nötige Leuchtturm-Stufe */
export const FRACHT = [
  { id: 'holz', name: 'Holz', wert: 1, menge: 1, kran: 1, turm: 1 },
  { id: 'fisch', name: 'Fisch', wert: 2, menge: 0.8, kran: 0.9, turm: 4 },
  { id: 'erz', name: 'Erz', wert: 4, menge: 0.65, kran: 0.8, turm: 8 },
];

/** Kosten: basis · wachs^(stufe−1) */
const KOSTEN = {
  dock: { basis: 150, wachs: 3.5 },
  kranTempo: { basis: 12, wachs: 1.22 },
  kranKap: { basis: 20, wachs: 1.24 },
  halle: { basis: 25, wachs: 1.22 },
  schiffGroesse: { basis: 15, wachs: 1.2 },
  schiffHaeufig: { basis: 18, wachs: 1.23 },
  turm: { basis: 40, wachs: 1.28 },
  lotse: { basis: 70, wachs: 1 },
};

export const BEZEICHNUNG = {
  dock: 'Neues Dock',
  'kran:tempo': 'Kräne: Tempo',
  'kran:kap': 'Kräne: Kapazität',
  halle: 'Lagerhalle',
  'schiff:groesse': 'Schiffe: Größe',
  'schiff:haeufig': 'Schiffe: Häufigkeit',
  turm: 'Leuchtturm',
  lotse: 'Lotsenboot',
};
export const ALLE_KAEUFE = Object.keys(BEZEICHNUNG);

const ZAHL = (x) => typeof x === 'number' && Number.isFinite(x);
const GANZ = (x, a, b) => ZAHL(x) && Number.isInteger(x) && x >= a && x <= b;

// ---------- Formeln ----------
export const krGeschwindigkeit = (z, f) => 1.0 * (1 + 0.20 * (z.kran.tempo - 1)) * (1 + 0.15 * (z.kran.kap - 1)) * FRACHT[f].kran;
export const schiffGroesse = (z, f) => 10 * (1 + 0.15 * (z.schiff.groesse - 1)) * (1 + 0.05 * (z.turm - 1)) * FRACHT[f].menge;
export const anlegenZeit = (z) => (z.lotse ? 1.5 : 4) / (1 + 0.03 * (z.turm - 1));
/** Wartezeit auf das nächste Schiff am Dock (s) */
export const wartezeit = (z) => 7 / ((1 + 0.15 * (z.schiff.haeufig - 1)) * (1 + 0.08 * (z.turm - 1)));
export const lagerKap = (z) => 40 * (1 + 0.25 * (z.halle - 1));
export const verkaufsRate = (z) => 3 * (1 + 0.3 * (z.halle - 1));
export const entladeZeit = (z, f) => schiffGroesse(z, f) / krGeschwindigkeit(z, f);
export const zyklusZeit = (z, f) => anlegenZeit(z) + entladeZeit(z, f) + wartezeit(z);
export const lagerSumme = (z) => z.lager[0] + z.lager[1] + z.lager[2];
export const frachtFrei = (z, f) => z.turm >= FRACHT[f].turm;
export const besteFracht = (z) => (z.turm >= FRACHT[2].turm ? 2 : z.turm >= FRACHT[1].turm ? 1 : 0);

/** Anteil der Zykluszeit, in dem das Schiff entladen wird: [von, bis) der Phase p; davor Anfahrt, danach Ablegen */
export function phasen(z, f) {
  const T = zyklusZeit(z, f);
  const an = anlegenZeit(z) + wartezeit(z) * 0.6;
  const ent = entladeZeit(z, f);
  const von = an / T;
  const bis = (an + ent) / T;
  return { von, bis };
}

// ---------- Zustand ----------
export function neuerHafen(jetztMs) {
  return {
    v: 1, t: sichereZeit(jetztMs), uhr: 0, sperre: 0, geld: 0, gesamt: 0,
    docks: [{ f: 0, p: 0 }],
    kran: { tempo: 1, kap: 1 }, halle: 1, schiff: { groesse: 1, haeufig: 1 }, turm: 1, lotse: 0,
    lager: [0, 0, 0],
  };
}

function sichereZeit(t) {
  return ZAHL(t) && t >= 0 && t <= MAX_ZEIT_MS ? Math.floor(t) : 0;
}

function kopie(z) {
  return {
    v: 1, t: z.t, uhr: z.uhr, sperre: z.sperre, geld: z.geld, gesamt: z.gesamt,
    docks: z.docks.map((d) => ({ f: d.f, p: d.p })),
    kran: { tempo: z.kran.tempo, kap: z.kran.kap }, halle: z.halle,
    schiff: { groesse: z.schiff.groesse, haeufig: z.schiff.haeufig }, turm: z.turm, lotse: z.lotse,
    lager: [z.lager[0], z.lager[1], z.lager[2]],
  };
}

/** Streng prüfen: gibt true nur für einen vollständig gültigen Spielstand */
export function istGueltig(s) {
  try { pruefe(s); return true; } catch { return false; }
}

function pruefe(s) {
  const fehler = (m) => { throw new Error(`Ungültiger Spielstand: ${m}`); };
  if (!s || typeof s !== 'object' || Array.isArray(s)) fehler('kein Objekt');
  if (s.v !== 1) fehler('Version');
  if (!ZAHL(s.t) || s.t < 0 || s.t > MAX_ZEIT_MS) fehler('t');
  if (!ZAHL(s.uhr) || s.uhr < 0 || s.uhr > 1e12) fehler('uhr');
  if (!ZAHL(s.sperre) || s.sperre < 0 || s.sperre > ANSCHUB_PAUSE_S) fehler('sperre');
  if (!ZAHL(s.geld) || s.geld < 0 || s.geld > MAX_GELD) fehler('geld');
  if (!ZAHL(s.gesamt) || s.gesamt < 0 || s.gesamt > MAX_GELD) fehler('gesamt');
  if (!Array.isArray(s.docks) || s.docks.length < 1 || s.docks.length > MAX_DOCKS) fehler('docks');
  if (!s.kran || typeof s.kran !== 'object' || !GANZ(s.kran.tempo, 1, MAX_STUFE) || !GANZ(s.kran.kap, 1, MAX_STUFE)) fehler('kran');
  if (!s.schiff || typeof s.schiff !== 'object' || !GANZ(s.schiff.groesse, 1, MAX_STUFE) || !GANZ(s.schiff.haeufig, 1, MAX_STUFE)) fehler('schiff');
  if (!GANZ(s.halle, 1, MAX_STUFE)) fehler('halle');
  if (!GANZ(s.turm, 1, MAX_STUFE)) fehler('turm');
  if (!GANZ(s.lotse, 0, 1)) fehler('lotse');
  for (const d of s.docks) {
    if (!d || typeof d !== 'object' || !GANZ(d.f, 0, FRACHT.length - 1)) fehler('dock.f');
    if (!ZAHL(d.p) || d.p < 0 || d.p >= 1) fehler('dock.p');
    if (s.turm < FRACHT[d.f].turm) fehler('Fracht nicht freigeschaltet');
  }
  if (!Array.isArray(s.lager) || s.lager.length !== 3) fehler('lager');
  const kap = lagerKap({ halle: s.halle });
  let summe = 0;
  for (const x of s.lager) {
    if (!ZAHL(x) || x < 0 || x > MAX_GELD) fehler('lager');
    summe += x;
  }
  if (summe > kap * 1.001 + 1e-6) fehler('Lager über Kapazität');
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
/**
 * Rechnet dt Sekunden weiter. Rein und deterministisch, liefert einen neuen Zustand.
 * Große dt kosten höchstens MAX_SCHRITTE Schritte.
 */
export function fortschritt(z, dt) {
  const c = kopie(z);
  if (!ZAHL(dt) || dt <= 0) return c;
  const n = Math.min(MAX_SCHRITTE, Math.max(1, Math.ceil(dt / 0.5)));
  const h = dt / n;
  const kap = lagerKap(c);
  const rate = verkaufsRate(c);
  const D = c.docks.length;
  const T = c.docks.map((d) => zyklusZeit(c, d.f));
  const S = c.docks.map((d) => schiffGroesse(c, d.f));
  for (let schritt = 0; schritt < n; schritt++) {
    let geliefert = 0;
    for (let i = 0; i < D; i++) geliefert += (h / T[i]) * S[i];
    const frei = Math.max(0, kap - lagerSumme(c)) + rate * h;
    const k = geliefert > frei ? frei / geliefert : 1;
    for (let i = 0; i < D; i++) {
      const dp = (h / T[i]) * k;
      const d = c.docks[i];
      c.lager[d.f] += dp * S[i];
      d.p += dp;
      d.p -= Math.floor(d.p);
    }
    // Verkauf: wertvollste Fracht zuerst
    let rest = rate * h;
    for (let f = FRACHT.length - 1; f >= 0 && rest > 0; f--) {
      const m = Math.min(c.lager[f], rest);
      c.lager[f] -= m;
      rest -= m;
      c.geld += m * FRACHT[f].wert;
      c.gesamt += m * FRACHT[f].wert;
    }
  }
  c.uhr = Math.min(c.uhr + dt, 1e12);
  c.sperre = Math.max(0, c.sperre - dt);
  c.geld = Math.min(c.geld, MAX_GELD);
  c.gesamt = Math.min(c.gesamt, MAX_GELD);
  for (let f = 0; f < 3; f++) c.lager[f] = Math.min(Math.max(c.lager[f], 0), kap);
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
/** Gleichgewichts-Einkommen (Münzen/s): Produktion je Fracht, Verkauf teuerste zuerst */
export function einkommen(z) {
  const prod = [0, 0, 0];
  for (const d of z.docks) prod[d.f] += schiffGroesse(z, d.f) / zyklusZeit(z, d.f);
  let rest = verkaufsRate(z);
  let summe = 0;
  for (let f = FRACHT.length - 1; f >= 0 && rest > 0; f--) {
    const m = Math.min(prod[f], rest);
    rest -= m;
    summe += m * FRACHT[f].wert;
  }
  return summe;
}

// ---------- Käufe ----------
function stufeVon(z, was) {
  switch (was) {
    case 'dock': return { art: 'dock', stufe: z.docks.length, max: MAX_DOCKS };
    case 'kran:tempo': return { art: 'kranTempo', stufe: z.kran.tempo, max: MAX_STUFE };
    case 'kran:kap': return { art: 'kranKap', stufe: z.kran.kap, max: MAX_STUFE };
    case 'halle': return { art: 'halle', stufe: z.halle, max: MAX_STUFE };
    case 'schiff:groesse': return { art: 'schiffGroesse', stufe: z.schiff.groesse, max: MAX_STUFE };
    case 'schiff:haeufig': return { art: 'schiffHaeufig', stufe: z.schiff.haeufig, max: MAX_STUFE };
    case 'turm': return { art: 'turm', stufe: z.turm, max: MAX_STUFE };
    case 'lotse': return { art: 'lotse', stufe: z.lotse + 1, max: 2 };
    default: return null;
  }
}

/** Preis des Kaufs oder null (unbekannt / schon am Maximum) */
export function preis(z, was) {
  const i = stufeVon(z, was);
  if (!i || i.stufe >= i.max) return null;
  const k = KOSTEN[i.art];
  return Math.max(1, Math.round(k.basis * k.wachs ** (i.stufe - 1)));
}

/** Stufe des Kaufs für die Anzeige */
export function stufe(z, was) {
  const i = stufeVon(z, was);
  if (!i) return 0;
  return was === 'lotse' ? z.lotse : i.stufe;
}

export const bezeichnung = (was) => BEZEICHNUNG[was] ?? String(was);

/** Kauf ausführen: { ok, zustand, preis } oder { ok:false, grund } (Eingabe bleibt unverändert) */
export function kaufe(z, was) {
  const p = preis(z, was);
  if (p === null) return { ok: false, grund: 'nicht verfügbar' };
  if (z.geld < p) return { ok: false, grund: 'zu wenig Geld' };
  const c = kopie(z);
  c.geld -= p;
  switch (was) {
    case 'dock': c.docks.push({ f: besteFracht(c), p: (c.docks.length * 0.37) % 1 }); break;
    case 'kran:tempo': c.kran.tempo++; break;
    case 'kran:kap': c.kran.kap++; break;
    case 'halle': c.halle++; break;
    case 'schiff:groesse': c.schiff.groesse++; break;
    case 'schiff:haeufig': c.schiff.haeufig++; break;
    case 'lotse': c.lotse = 1; break;
    case 'turm': {
      const alt = besteFracht(c);
      c.turm++;
      const neu = besteFracht(c);
      // Docks, die auf der bisher besten Fracht liefen, wechseln auf die neue beste
      if (neu !== alt) for (const d of c.docks) if (d.f === alt) d.f = neu;
      break;
    }
    default: break;
  }
  return { ok: true, zustand: c, preis: p };
}

/** Günstigstes Upgrade, das das Einkommen wirklich steigert, samt Wartezeit; null wenn alles ausgebaut */
export function naechstesZiel(z) {
  const e0 = einkommen(z);
  let best = null;
  for (const was of ALLE_KAEUFE) {
    const p = preis(z, was);
    if (p === null) continue;
    if (best && p >= best.preis) continue;
    const r = kaufe({ ...z, geld: p }, was);
    if (!r.ok) continue;
    // Turm schaltet Fracht frei (steigert das Einkommen auch über Größe/Häufigkeit), daher einfach vergleichen
    if (einkommen(r.zustand) <= e0 * 1.0001) continue;
    best = { was, preis: p };
  }
  if (!best) return null;
  const fehlt = Math.max(0, best.preis - z.geld);
  best.wartezeit = fehlt <= 0 ? 0 : (e0 > 0 ? fehlt / e0 : Infinity);
  return best;
}

// ---------- Aktionen ohne Kosten ----------
/** Fracht eines Docks setzen (nur freigeschaltete Fracht) */
export function weise(z, dock, fracht) {
  if (!GANZ(dock, 0, z.docks.length - 1) || !GANZ(fracht, 0, FRACHT.length - 1) || !frachtFrei(z, fracht)) {
    return { ok: false, grund: 'nicht möglich' };
  }
  const c = kopie(z);
  c.docks[dock].f = fracht;
  return { ok: true, zustand: c };
}

/** Nächste freigeschaltete Fracht des Docks (Rundlauf) */
export function naechsteFracht(z, dock) {
  const d = z.docks[dock];
  for (let i = 1; i <= FRACHT.length; i++) {
    const f = (d.f + i) % FRACHT.length;
    if (frachtFrei(z, f)) return f;
  }
  return d.f;
}

/** Schiff antippen: leichter Schub beim Entladen (Pause zwischen zwei Schüben) */
export function anschub(z, dock) {
  if (!GANZ(dock, 0, z.docks.length - 1)) return { ok: false, grund: 'kein Dock' };
  if (z.sperre > 0) return { ok: false, grund: 'zu früh' };
  const c = kopie(z);
  const d = c.docks[dock];
  const S = schiffGroesse(c, d.f);
  const frei = Math.max(0, lagerKap(c) - lagerSumme(c));
  const dp = Math.min(ANSCHUB_ANTEIL, frei / S);
  if (dp <= 0) return { ok: false, grund: 'Lager voll' };
  c.lager[d.f] += dp * S;
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
  if (x < 1000) return rund(x, x < 10 ? 1 : x < 100 ? 1 : 0);
  if (x < 1e6) return Math.floor(x).toLocaleString('de-DE');
  for (const [grenze, name] of EINHEITEN) {
    if (x >= grenze) return `${rund(Math.floor((x / grenze) * 10) / 10, 1)} ${name}`;
  }
  return Math.floor(x).toLocaleString('de-DE');
}

function rund(x, stellen) {
  // abrunden, damit „999,99“ nicht zu „1.000“ aufgerundet wird
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
