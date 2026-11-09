// Hafen: Rechenkern (ohne DOM, ohne Zufall, ohne Uhr). Fließmodell mit Puffern:
// Schiff -> Kran -> Ebenenlager -> Lader -> Hauptlager -> Verkauf -> Münzen.
// Jede Ebene ist eine eigene Ressource mit eigenem Dock; die nächste Ebene wird gekauft.
// Alles ist eine reine Funktion des Zustands und der verstrichenen Sekunden.

export const MAX_EBENEN = 8;
export const MAX_STUFE = 40;
export const MAX_GELD = 1e30;
export const OFFLINE_MAX_S = 8 * 3600;   // Deckel der Abwesenheit
export const OFFLINE_VOLL_S = 60;        // bis hierhin voller Wert
export const OFFLINE_FAKTOR = 0.5;       // danach nur die Hälfte
export const MAX_SCHRITTE = 600;
export const ANSCHUB_ANTEIL = 0.02;      // Schub beim Antippen (Anteil einer Fahrt)
export const ANSCHUB_PAUSE_S = 1.5;
export const STAND_VERSION = 2;
const MAX_ZEIT_MS = 4e12;
const ZUKUNFT_MS = 24 * 3600 * 1000;     // so weit darf ein Zeitstempel in der Zukunft liegen
const EBENEN_FAKTOR = 5;                 // Kosten der Upgrades steigen je Ebene um diesen Faktor

/** Ressourcen der Ebenen: Wert je Einheit */
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

/** Kosten: basis · wachs^(stufe−1) (· EBENEN_FAKTOR^ebene bei Ebenen-Upgrades) */
const KOSTEN = {
  kran: { basis: 12, wachs: 1.2 },
  schiff: { basis: 15, wachs: 1.2 },
  lager: { basis: 10, wachs: 1.18 },
  lotse: { basis: 70, wachs: 1 },
  halle: { basis: 30, wachs: 1.28 },
  turm: { basis: 80, wachs: 1.28 },
};
const EBENE_BASIS = 60;                  // Preis der 2. Ebene
const EBENE_WACHS = 4;                   // Preisfaktor je weitere Ebene

export const BEZEICHNUNG = {
  kran: 'Kran', schiff: 'Schiffe', lager: 'Ebenenlager', lotse: 'Lotsenboot',
  halle: 'Verkaufshalle', turm: 'Leuchtturm', ebene: 'Neue Ebene',
};

const ZAHL = (x) => typeof x === 'number' && Number.isFinite(x);
const GANZ = (x, a, b) => ZAHL(x) && Number.isInteger(x) && x >= a && x <= b;

// ---------- Formeln ----------
export const kranRate = (e) => 1.0 * (1 + 0.2 * (e.kran - 1));
export const schiffGroesse = (z, i) => 10 * (1 + 0.12 * (z.ebenen[i].schiff - 1)) * (1 + 0.05 * (z.turm - 1));
export const anlegenZeit = (z, i) => (z.ebenen[i].lotse ? 1.5 : 4) / (1 + 0.03 * (z.turm - 1));
/** Wartezeit auf das nächste Schiff (s) */
export const wartezeit = (z, i) => 7 / ((1 + 0.08 * (z.ebenen[i].schiff - 1)) * (1 + 0.08 * (z.turm - 1)));
export const entladeZeit = (z, i) => schiffGroesse(z, i) / kranRate(z.ebenen[i]);
export const zyklusZeit = (z, i) => anlegenZeit(z, i) + entladeZeit(z, i) + wartezeit(z, i);
/** Ware, die das Dock dieser Ebene je Sekunde anliefert (Einheiten/s) */
export const anlieferung = (z, i) => schiffGroesse(z, i) / zyklusZeit(z, i);
export const ebenenKap = (e) => 20 * (1 + 0.25 * (e.lager - 1));
export const ladeRate = (e) => 0.6 * (1 + 0.25 * (e.lager - 1));
export const hallenKap = (z) => 60 * (1 + 0.25 * (z.halle - 1));
export const verkaufsRate = (z) => 1 * (1 + 0.5 * (z.halle - 1));
export const hauptSumme = (z) => z.haupt.reduce((a, b) => a + b, 0);
export const puffer = (z) => z.ebenen.reduce((a, e) => a + e.puffer, 0);

/** Phasen des Schiffs (Anteil an der Zykluszeit): bis `von` Anfahrt, bis `bis` Entladen, danach Ablegen */
export function phasen(z, i) {
  const T = zyklusZeit(z, i);
  const an = anlegenZeit(z, i) + wartezeit(z, i) * 0.6;
  return { von: an / T, bis: (an + entladeZeit(z, i)) / T };
}

// ---------- Zustand ----------
function neueEbene(n) {
  return { kran: 1, schiff: 1, lager: 1, lotse: 0, p: (n * 0.37) % 1, puffer: 0 };
}

export function neuerHafen(jetztMs) {
  return {
    v: STAND_VERSION, t: sichereZeit(jetztMs), uhr: 0, sperre: 0, geld: 0, gesamt: 0,
    ebenen: [neueEbene(0)], halle: 1, turm: 1,
    haupt: new Array(MAX_EBENEN).fill(0),
  };
}

function sichereZeit(t) {
  return ZAHL(t) && t >= 0 && t <= MAX_ZEIT_MS ? Math.floor(t) : 0;
}

function kopie(z) {
  return {
    v: STAND_VERSION, t: z.t, uhr: z.uhr, sperre: z.sperre, geld: z.geld, gesamt: z.gesamt,
    ebenen: z.ebenen.map((e) => ({ kran: e.kran, schiff: e.schiff, lager: e.lager, lotse: e.lotse, p: e.p, puffer: e.puffer })),
    halle: z.halle, turm: z.turm,
    haupt: z.haupt.slice(),
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
  if (!GANZ(s.halle, 1, MAX_STUFE)) fehler('halle');
  if (!GANZ(s.turm, 1, MAX_STUFE)) fehler('turm');
  if (!Array.isArray(s.ebenen) || s.ebenen.length < 1 || s.ebenen.length > MAX_EBENEN) fehler('ebenen');
  for (const e of s.ebenen) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) fehler('ebene');
    for (const k of ['kran', 'schiff', 'lager']) if (!GANZ(e[k], 1, MAX_STUFE)) fehler(`ebene.${k}`);
    if (!GANZ(e.lotse, 0, 1)) fehler('ebene.lotse');
    if (!ZAHL(e.p) || e.p < 0 || e.p >= 1) fehler('ebene.p');
    if (!ZAHL(e.puffer) || e.puffer < 0 || e.puffer > ebenenKap(e) * 1.001 + 1e-6) fehler('ebene.puffer');
  }
  if (!Array.isArray(s.haupt) || s.haupt.length !== MAX_EBENEN) fehler('haupt');
  let summe = 0;
  s.haupt.forEach((x, i) => {
    if (!ZAHL(x) || x < 0 || x > MAX_GELD) fehler('haupt');
    if (i >= s.ebenen.length && x !== 0) fehler('haupt ohne Ebene');
    summe += x;
  });
  if (summe > hallenKap({ halle: s.halle }) * 1.001 + 1e-6) fehler('Hauptlager über Kapazität');
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
  const N = c.ebenen.length;
  const T = c.ebenen.map((_, i) => zyklusZeit(c, i));
  const ph = c.ebenen.map((_, i) => phasen(c, i));
  const S = c.ebenen.map((_, i) => schiffGroesse(c, i));
  const kapE = c.ebenen.map(ebenenKap);
  const lade = c.ebenen.map(ladeRate);
  const kapH = hallenKap(c);
  const rate = verkaufsRate(c);
  for (let schritt = 0; schritt < n; schritt++) {
    // 1. Schiffe entladen in das Ebenenlager (der Lader leert es gleichzeitig)
    for (let i = 0; i < N; i++) {
      const e = c.ebenen[i];
      const dp = h / T[i];
      // Ware kommt nur im Entladefenster des Schiffs (stoßweise), mit Kranleistung
      const ein = (ueberlapp(e.p, dp, ph[i].von, ph[i].bis) / (ph[i].bis - ph[i].von)) * S[i];
      const frei = Math.max(0, kapE[i] - e.puffer) + lade[i] * h;
      const k = ein > frei ? frei / ein : 1;
      e.puffer += ein * k;
      e.p += dp * k;
      e.p -= Math.floor(e.p);
    }
    // 2. Lader bringen die Ware ins Hauptlager (begrenzt durch freien Platz, Verkauf läuft gleichzeitig)
    const freiH = Math.max(0, kapH - hauptSumme(c)) + rate * h;
    let will = 0;
    const w = c.ebenen.map((e, i) => { const x = Math.min(e.puffer, lade[i] * h); will += x; return x; });
    const f = will > freiH ? freiH / will : 1;
    for (let i = 0; i < N; i++) {
      const m = w[i] * f;
      c.ebenen[i].puffer -= m;
      c.haupt[i] += m;
    }
    // 3. Verkauf: wertvollste Ware zuerst
    let rest = rate * h;
    for (let i = N - 1; i >= 0 && rest > 0; i--) {
      const m = Math.min(c.haupt[i], rest);
      c.haupt[i] -= m;
      rest -= m;
      c.geld += m * EBENEN[i].wert;
      c.gesamt += m * EBENEN[i].wert;
    }
  }
  c.uhr = Math.min(c.uhr + dt, 1e12);
  c.sperre = Math.max(0, c.sperre - dt);
  c.geld = Math.min(c.geld, MAX_GELD);
  c.gesamt = Math.min(c.gesamt, MAX_GELD);
  for (let i = 0; i < N; i++) c.ebenen[i].puffer = Math.min(Math.max(c.ebenen[i].puffer, 0), kapE[i]);
  // Hauptlager auf Kapazität begrenzen (Rundungsreste)
  const sum = hauptSumme(c);
  if (sum > kapH) { const q = kapH / sum; for (let i = 0; i < MAX_EBENEN; i++) c.haupt[i] *= q; }
  for (let i = 0; i < MAX_EBENEN; i++) c.haupt[i] = Math.max(0, c.haupt[i]);
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
/** Einkommen je Ebene im Gleichgewicht (Münzen/s) und Gesamteinkommen (Verkauf teuerste zuerst) */
export function einkommenDetail(z) {
  const fluss = z.ebenen.map((e, i) => Math.min(anlieferung(z, i), ladeRate(e)));
  const je = new Array(z.ebenen.length).fill(0);
  let rest = verkaufsRate(z);
  for (let i = z.ebenen.length - 1; i >= 0 && rest > 0; i--) {
    const m = Math.min(fluss[i], rest);
    rest -= m;
    je[i] = m * EBENEN[i].wert;
  }
  return { je, gesamt: je.reduce((a, b) => a + b, 0), fluss };
}
export const einkommen = (z) => einkommenDetail(z).gesamt;

// ---------- Käufe ----------
const EBENEN_KATEGORIEN = ['kran', 'schiff', 'lager', 'lotse'];
const SCHLUESSEL = /^e([0-7]):(kran|schiff|lager|lotse)$/;

/** Alle Kaufschlüssel, die es im Zustand gibt */
export function alleKaeufe(z) {
  const l = [];
  z.ebenen.forEach((_, i) => { for (const k of EBENEN_KATEGORIEN) l.push(`e${i}:${k}`); });
  l.push('ebene', 'halle', 'turm');
  return l;
}

function stufeVon(z, was) {
  if (was === 'ebene') return { art: 'ebene', stufe: z.ebenen.length, max: MAX_EBENEN };
  if (was === 'halle') return { art: 'halle', stufe: z.halle, max: MAX_STUFE };
  if (was === 'turm') return { art: 'turm', stufe: z.turm, max: MAX_STUFE };
  const m = typeof was === 'string' ? SCHLUESSEL.exec(was) : null;
  if (!m) return null;
  const i = Number(m[1]);
  if (i >= z.ebenen.length) return null;
  const art = m[2];
  const e = z.ebenen[i];
  return art === 'lotse'
    ? { art, i, stufe: e.lotse + 1, max: 2 }
    : { art, i, stufe: e[art], max: MAX_STUFE };
}

/** Preis des Kaufs oder null (unbekannt / schon am Maximum) */
export function preis(z, was) {
  const s = stufeVon(z, was);
  if (!s || s.stufe >= s.max) return null;
  if (s.art === 'ebene') return Math.round(EBENE_BASIS * EBENE_WACHS ** (s.stufe - 1));
  const k = KOSTEN[s.art];
  const mal = s.i === undefined ? 1 : EBENEN_FAKTOR ** s.i;
  return Math.max(1, Math.round(k.basis * k.wachs ** (s.stufe - 1) * mal));
}

/** Angezeigte Stufe */
export function stufe(z, was) {
  const s = stufeVon(z, was);
  if (!s) return 0;
  return s.art === 'lotse' ? s.stufe - 1 : s.stufe;
}

/** Name des Kaufs, z. B. „Holz: Kran“ */
export function bezeichnung(was) {
  if (BEZEICHNUNG[was]) return BEZEICHNUNG[was];
  const m = typeof was === 'string' ? SCHLUESSEL.exec(was) : null;
  return m ? `${EBENEN[Number(m[1])].name}: ${BEZEICHNUNG[m[2]]}` : String(was);
}

/** Kauf ausführen: { ok, zustand, preis } oder { ok:false, grund } (Eingabe bleibt unverändert) */
export function kaufe(z, was) {
  const p = preis(z, was);
  if (p === null) return { ok: false, grund: 'nicht verfügbar' };
  if (z.geld < p) return { ok: false, grund: 'zu wenig Geld' };
  const c = kopie(z);
  c.geld -= p;
  if (was === 'ebene') c.ebenen.push(neueEbene(c.ebenen.length));
  else if (was === 'halle') c.halle++;
  else if (was === 'turm') c.turm++;
  else {
    const m = SCHLUESSEL.exec(was);
    const e = c.ebenen[Number(m[1])];
    if (m[2] === 'lotse') e.lotse = 1; else e[m[2]]++;
  }
  return { ok: true, zustand: c, preis: p };
}

/** Wirkung eines Kaufs für die Anzeige: { text, plus } (plus = Einkommenszuwachs in Münzen/s) */
export function effekt(z, was) {
  const r = kaufe({ ...z, geld: MAX_GELD }, was);
  if (!r.ok) return null;
  const a = r.zustand;
  const f1 = (x) => formatiere(x);
  const s = stufeVon(z, was);
  let text = '';
  switch (s.art) {
    case 'kran': text = `Kran ${f1(kranRate(z.ebenen[s.i]))} → ${f1(kranRate(a.ebenen[s.i]))}/s`; break;
    case 'schiff': text = `Schiff ${f1(schiffGroesse(z, s.i))} → ${f1(schiffGroesse(a, s.i))}`; break;
    case 'lager': text = `Platz ${f1(ebenenKap(z.ebenen[s.i]))} → ${f1(ebenenKap(a.ebenen[s.i]))}`; break;
    case 'lotse': text = `Anlegen ${f1(anlegenZeit(z, s.i))} → ${f1(anlegenZeit(a, s.i))} s`; break;
    case 'halle': text = `Verkauf ${f1(verkaufsRate(z))} → ${f1(verkaufsRate(a))}/s`; break;
    case 'turm': text = `Reichweite ${z.turm} → ${a.turm}`; break;
    case 'ebene': text = `Neu: ${EBENEN[z.ebenen.length].name}`; break;
    default: break;
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
export function anschub(z, ebene) {
  if (!GANZ(ebene, 0, z.ebenen.length - 1)) return { ok: false, grund: 'keine Ebene' };
  if (z.sperre > 0) return { ok: false, grund: 'zu früh' };
  const c = kopie(z);
  const e = c.ebenen[ebene];
  const S = schiffGroesse(c, ebene);
  const frei = Math.max(0, ebenenKap(e) - e.puffer);
  const dp = Math.min(ANSCHUB_ANTEIL, frei / S);
  if (dp <= 0) return { ok: false, grund: 'Lager voll' };
  e.puffer += dp * S;
  e.p += dp;
  e.p -= Math.floor(e.p);
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
