// Blasenschuss – reine Spiellogik ohne DOM. Geometrie in Blasen-Radien (Durchmesser 2).
// Alles deterministisch: feste Zeitschritte, gerundete Winkelfunktionen, seeded Zufall im Spielstand.
import { erstelleZufall } from '../../kern/zufall.js';

export const SPALTEN = 9;
export const ZEILEN = 12;
export const LINIE = 11;                 // Blase in dieser Zeile → Reihe wird entfernt
export const SQ3 = Math.sqrt(3);
export const BREITE = 2 * SPALTEN;       // 18
export const HOEHE = 25.5;
export const SX = BREITE / 2;
export const SY = 23.6;
export const MAX_WINKEL = 80;
export const STEP = 0.2;
export const BUDGET = 3000;
export const KOLLISION = 1.75;
export const FARBEN_MAX = 6;
export const BOMBE = 7;
export const REGENBOGEN = 8;
export const STEIN = 9;
export const FEHL_BIS_REIHE = 6;
export const MAX_VERLAUF = 100;
export const LEVEL_TABELLE_ZAHL = 30;
export const ANZAHL = SPALTEN * ZEILEN;

// ---------- Geometrie ----------
export const versatz = (r, kopf) => (r + kopf) & 1;
export const spaltenIn = (r, kopf) => SPALTEN - versatz(r, kopf);
export const idx = (r, c) => r * SPALTEN + c;
export const gueltigeZelle = (r, c, kopf) => r >= 0 && r < ZEILEN && c >= 0 && c < spaltenIn(r, kopf);
export const mitte = (r, c, kopf) => [1 + 2 * c + versatz(r, kopf), 1 + SQ3 * r];

/** Nachbarzellen als Indizes (nur gültige Zellen) */
export function nachbarn(i, kopf) {
  const r = Math.floor(i / SPALTEN), c = i % SPALTEN;
  const o = versatz(r, kopf);
  const spalten = o === 0 ? [c - 1, c] : [c, c + 1];
  const aus = [];
  if (gueltigeZelle(r, c - 1, kopf)) aus.push(idx(r, c - 1));
  if (gueltigeZelle(r, c + 1, kopf)) aus.push(idx(r, c + 1));
  for (const rr of [r - 1, r + 1]) for (const cc of spalten) if (gueltigeZelle(rr, cc, kopf)) aus.push(idx(rr, cc));
  return aus;
}

const istFarbe = (code) => code >= 1 && code <= FARBEN_MAX;
export const begrenzeWinkel = (w) => Math.max(-MAX_WINKEL, Math.min(MAX_WINKEL, Number.isFinite(w) ? w : 0));
const rund6 = (v) => Math.round(v * 1e6) / 1e6;

// ---------- Flug ----------
function trifft(brett, kopf, x, y) {
  const ro = Math.round((y - 1) / SQ3);
  for (let r = Math.max(0, ro - 1); r <= Math.min(ZEILEN - 1, ro + 1); r++) {
    const n = spaltenIn(r, kopf);
    for (let c = 0; c < n; c++) {
      if (!brett[idx(r, c)]) continue;
      const [mx, my] = mitte(r, c, kopf);
      const dx = mx - x, dy = my - y;
      if (dx * dx + dy * dy < KOLLISION * KOLLISION) return true;
    }
  }
  return false;
}

/** Nächstes freies Feld an Decke oder Blase, gemessen an (x, y); null, wenn keins existiert */
export function einrasten(brett, kopf, x, y) {
  let beste = -1, bd = Infinity;
  for (let r = 0; r < ZEILEN; r++) {
    const n = spaltenIn(r, kopf);
    for (let c = 0; c < n; c++) {
      const i = idx(r, c);
      if (brett[i]) continue;
      if (r > 0 && !nachbarn(i, kopf).some((k) => brett[k])) continue;
      const [mx, my] = mitte(r, c, kopf);
      const d = (mx - x) * (mx - x) + (my - y) * (my - y);
      if (d < bd - 1e-9) { bd = d; beste = i; }
    }
  }
  return beste < 0 ? null : { r: Math.floor(beste / SPALTEN), c: beste % SPALTEN, i: beste };
}

/** Flug simulieren → { pfad (Eckpunkte), ende [x, y], zelle {r,c,i}|null, schritte } */
export function fliegen(brett, kopf, winkelGrad) {
  const w = (begrenzeWinkel(winkelGrad) * Math.PI) / 180;
  let vx = rund6(Math.sin(w));
  const vy = -rund6(Math.cos(w));
  let x = SX, y = SY, schritte = 0;
  const pfad = [[x, y]];
  while (schritte < BUDGET) {
    schritte++;
    x += vx * STEP; y += vy * STEP;
    if (x < 1) { x = 2 - x; vx = -vx; pfad.push([1, y]); }
    else if (x > BREITE - 1) { x = 2 * (BREITE - 1) - x; vx = -vx; pfad.push([BREITE - 1, y]); }
    if (y <= 1) { y = 1; break; }
    if (trifft(brett, kopf, x, y)) break;
  }
  pfad.push([x, y]);
  return { pfad, ende: [x, y], zelle: einrasten(brett, kopf, x, y), schritte };
}

// ---------- Flood-Fill ----------
/** Zusammenhängende Blasen gleicher Farbe ab Index i */
export function gruppeAb(brett, kopf, i) {
  const f = brett[i];
  if (!istFarbe(f)) return [];
  const gesehen = new Set([i]);
  const stapel = [i];
  while (stapel.length) {
    const k = stapel.pop();
    for (const n of nachbarn(k, kopf)) if (!gesehen.has(n) && brett[n] === f) { gesehen.add(n); stapel.push(n); }
  }
  return [...gesehen].sort((a, b) => a - b);
}

/** Blasen ohne Verbindung zur Decke (Flood-Fill von Zeile 0) */
export function lose(brett, kopf) {
  const verbunden = new Uint8Array(ANZAHL);
  const stapel = [];
  for (let c = 0; c < spaltenIn(0, kopf); c++) if (brett[c]) { verbunden[c] = 1; stapel.push(c); }
  while (stapel.length) {
    const k = stapel.pop();
    for (const n of nachbarn(k, kopf)) if (brett[n] && !verbunden[n]) { verbunden[n] = 1; stapel.push(n); }
  }
  const aus = [];
  for (let i = 0; i < ANZAHL; i++) if (brett[i] && !verbunden[i]) aus.push(i);
  return aus;
}

export const farbenImFeld = (brett) => {
  const s = new Set();
  for (const c of brett) if (istFarbe(c)) s.add(c);
  return [...s].sort((a, b) => a - b);
};
export const anzahlFarbblasen = (brett) => brett.reduce((n, c) => n + (istFarbe(c) ? 1 : 0), 0);
export const anzahlBlasen = (brett) => brett.reduce((n, c) => n + (c ? 1 : 0), 0);

// ---------- Zufall ----------
function mitZufall(z, fn) {
  const r = erstelleZufall(z.seed, z.rng);
  const ergebnis = fn(r);
  z.rng = r.zustand();
  return ergebnis;
}

/** Neue Schuss-Blase: nur Farben, die im Feld vorkommen (z wird verändert: rng) */
function ziehe(z) {
  return mitZufall(z, (r) => {
    let farben = farbenImFeld(z.brett);
    if (!farben.length) farben = Array.from({ length: z.farben }, (_, k) => k + 1);
    if (z.spezial) {
      const x = r.zahl();
      const m = farbenImFeld(z.brett).length > 0;
      if (m && x < 0.05) return BOMBE;
      if (m && x < 0.09) return REGENBOGEN;
    }
    return r.wahl(farben);
  });
}

function reparatur(z) {
  const farben = farbenImFeld(z.brett);
  if (!farben.length) return;
  if (istFarbe(z.aktuell) && !farben.includes(z.aktuell)) z.aktuell = mitZufall(z, (r) => r.wahl(farben));
  if (istFarbe(z.naechste) && !farben.includes(z.naechste)) z.naechste = mitZufall(z, (r) => r.wahl(farben));
}

/** Eine neue Reihe (Länge SPALTEN, Rest 0) für Zeile 0 mit Versatz-Parität kopf */
function neueReihe(z, kopf, farben) {
  return mitZufall(z, (r) => {
    const zeile = new Array(SPALTEN).fill(0);
    const n = SPALTEN - (kopf & 1);
    for (let c = 0; c < n; c++) {
      zeile[c] = c > 0 && r.zahl() < 0.4 ? zeile[c - 1] : r.ganz(1, farben);
    }
    return zeile;
  });
}

// ---------- Level ----------
// [Muster, Farben, Reihen, Steine, Spezial]
const LEVEL = [
  ['streifen', 3, 4, 0, 0], ['voll', 3, 4, 0, 0], ['diagonal', 3, 5, 0, 0], ['voll', 3, 5, 0, 0], ['spalten', 3, 5, 0, 0],
  ['pyramide', 3, 6, 0, 0], ['streifen', 4, 5, 0, 0], ['voll', 4, 6, 0, 1], ['diagonal', 4, 6, 2, 1], ['schach', 4, 6, 3, 1],
  ['ringe', 4, 7, 2, 1], ['pyramide', 4, 7, 3, 1], ['voll', 5, 6, 3, 1], ['streifen', 5, 7, 2, 1], ['diagonal', 5, 7, 4, 1],
  ['voll', 5, 7, 4, 1], ['ringe', 5, 8, 4, 1], ['schach', 5, 8, 5, 1], ['pyramide', 5, 8, 5, 1], ['voll', 5, 8, 6, 1],
  ['voll', 6, 6, 4, 1], ['diagonal', 6, 7, 5, 1], ['ringe', 6, 7, 5, 1], ['streifen', 6, 8, 6, 1], ['schach', 6, 8, 6, 1],
  ['pyramide', 6, 8, 7, 1], ['voll', 6, 8, 8, 1], ['diagonal', 6, 8, 8, 1], ['ringe', 6, 8, 9, 1], ['voll', 6, 8, 10, 1],
];
const MUSTER = ['streifen', 'voll', 'diagonal', 'spalten', 'pyramide', 'schach', 'ringe'];

/** Parameter eines Levels (Tabelle für 1–30, danach aus der Nummer erzeugt) */
export function levelDef(n) {
  if (n >= 1 && n <= LEVEL.length) {
    const [muster, farben, reihen, steine, spezial] = LEVEL[n - 1];
    return { muster, farben, reihen, steine, spezial: Boolean(spezial) };
  }
  const r = erstelleZufall(`bs-def-${n}`);
  return { muster: r.wahl(MUSTER), farben: 6, reihen: 7 + (n % 2), steine: Math.min(14, 6 + (n % 7)), spezial: true };
}

/** Startfeld eines Levels (ohne Zufall außerhalb des Levelseeds) */
export function levelBrett(n) {
  const d = levelDef(n);
  const r = erstelleZufall(`bs-level-${n}`);
  const brett = new Array(ANZAHL).fill(0);
  const f = d.farben;
  for (let zeile = 0; zeile < d.reihen; zeile++) {
    const breite = spaltenIn(zeile, 0);
    for (let c = 0; c < breite; c++) {
      let code = 0;
      switch (d.muster) {
        case 'streifen': code = (zeile % f) + 1; break;
        case 'diagonal': code = ((zeile + c) % f) + 1; break;
        case 'spalten': code = (c % f) + 1; break;
        case 'schach': {
          const a = (zeile >> 1) % f + 1;
          code = (zeile + c) & 1 ? a : (a % f) + 1;
          break;
        }
        case 'ringe': code = (Math.min(zeile, c, breite - 1 - c) % f) + 1; break;
        case 'pyramide': {
          const k = zeile >> 1;
          if (c < k || c >= breite - k) continue;
          code = c > k && r.zahl() < 0.4 ? brett[idx(zeile, c - 1)] || r.ganz(1, f) : r.ganz(1, f);
          break;
        }
        default: code = c > 0 && r.zahl() < 0.4 ? brett[idx(zeile, c - 1)] : r.ganz(1, f);
      }
      brett[idx(zeile, c)] = code;
    }
  }
  // Steine: nie in Zeile 0/1, damit sie nicht ewig an der Decke hängen
  const kandidaten = [];
  for (let i = 2 * SPALTEN; i < ANZAHL; i++) if (brett[i]) kandidaten.push(i);
  for (const i of r.mische(kandidaten).slice(0, d.steine)) brett[i] = STEIN;
  return brett;
}

export const zielText = () => 'Alle Blasen entfernen';

// ---------- Zustand ----------
function neuerZustand(modus, seed, extra) {
  const z = {
    modus, seed: String(seed), rng: erstelleZufall(seed).zustand(), level: 0, farben: 4, spezial: false,
    brett: new Array(ANZAHL).fill(0), kopf: 0, aktuell: 1, naechste: 1, fehl: 0, schuesse: 0, blasen: 0, reihen: 0,
    weiter: false, winkel: 0, verlauf: [], ...extra,
  };
  z.aktuell = ziehe(z);
  z.naechste = ziehe(z);
  return z;
}

export const endlosFarben = (reihen) => Math.min(FARBEN_MAX, 4 + Math.floor(reihen / 10));

export function neuesLevel(n, seed) {
  const level = Math.max(1, Math.floor(n) || 1);
  const d = levelDef(level);
  return neuerZustand('level', seed ?? `level-${level}`, { level, farben: d.farben, spezial: d.spezial, brett: levelBrett(level) });
}

export function neuesEndlos(seed) {
  const z = neuerZustand('endlos', seed, { farben: 4, spezial: true });
  for (let k = 0; k < 5; k++) schiebeReihe(z);
  z.reihen = 0;
  z.aktuell = ziehe(z);
  z.naechste = ziehe(z);
  return z;
}

export const kopie = (z) => JSON.parse(JSON.stringify(z));

/** Neue Reihe oben einfügen, alles rückt eine Zeile nach unten (verändert z) */
function schiebeReihe(z) {
  z.farben = Math.max(z.farben, endlosFarben(z.reihen));
  const kopf = z.kopf ^ 1;
  const zeile = neueReihe(z, kopf, z.farben);
  const neu = new Array(ANZAHL).fill(0);
  for (let c = 0; c < SPALTEN; c++) neu[c] = zeile[c];
  for (let i = 0; i < ANZAHL - SPALTEN; i++) neu[i + SPALTEN] = z.brett[i];
  const verloren = z.brett.slice(ANZAHL - SPALTEN).some(Boolean);
  z.brett = neu;
  z.kopf = kopf;
  z.reihen++;
  return verloren;
}

/** Reihe der Linie entfernen; Indizes der entfernten Blasen */
function kappe(z) {
  const weg = [];
  for (let i = LINIE * SPALTEN; i < ANZAHL; i++) if (z.brett[i]) { weg.push(i); z.brett[i] = 0; }
  return weg;
}

function schnappschuss(z) {
  return {
    b: z.brett.map((c) => String.fromCharCode(48 + c)).join(''), k: z.kopf, a: z.aktuell, n: z.naechste, f: z.fehl,
    r: z.rng.slice(), s: z.schuesse, bl: z.blasen, rh: z.reihen, fa: z.farben,
  };
}

function bestFarbe(z, i) {
  const kopf = z.kopf;
  const nb = [...new Set(nachbarn(i, kopf).map((k) => z.brett[k]).filter(istFarbe))].sort((a, b) => a - b);
  let beste = 0, groesse = -1;
  for (const f of nb) {
    z.brett[i] = f;
    const g = gruppeAb(z.brett, kopf, i).length;
    if (g > groesse) { groesse = g; beste = f; }
  }
  z.brett[i] = 0;
  if (beste) return beste;
  const zaehl = new Array(FARBEN_MAX + 1).fill(0);
  for (const c of z.brett) if (istFarbe(c)) zaehl[c]++;
  let m = 0;
  for (let f = 1; f <= FARBEN_MAX; f++) if (zaehl[f] > m) { m = zaehl[f]; beste = f; }
  return beste || 1;
}

export const endlosBetrieb = (z) => z.modus === 'endlos' || z.weiter;
export const gewonnen = (z) => z.modus === 'level' && !z.weiter && anzahlFarbblasen(z.brett) === 0;

/**
 * Einen Schuss durchrechnen (ohne Verlauf). → { zustand, ergebnis } oder null.
 * ergebnis: { pfad, zelle, code, platzte, fiel, gekappt, neueReihe, gruppe, gewonnen }
 */
export function rechne(z0, winkel) {
  const z = kopie({ ...z0, verlauf: [] });
  z.verlauf = z0.verlauf;
  const w = begrenzeWinkel(winkel);
  const flug = fliegen(z.brett, z.kopf, w);
  if (!flug.zelle) return null;
  const { i } = flug.zelle;
  let code = z.aktuell;
  let platzte = [];
  let gruppe = 0;
  if (code === BOMBE) {
    platzte = [i, ...nachbarn(i, z.kopf).filter((k) => z.brett[k] && z.brett[k] !== STEIN)];
  } else {
    if (code === REGENBOGEN) code = bestFarbe(z, i);
    z.brett[i] = code;
    const g = gruppeAb(z.brett, z.kopf, i);
    gruppe = g.length;
    if (g.length >= 3) platzte = g;
  }
  for (const p of platzte) z.brett[p] = 0;
  const fiel = lose(z.brett, z.kopf);
  for (const p of fiel) z.brett[p] = 0;
  let gekappt = kappe(z);
  const nachKappen = lose(z.brett, z.kopf);
  for (const p of nachKappen) { z.brett[p] = 0; fiel.push(p); }
  z.schuesse++;
  z.blasen += platzte.length + fiel.length;
  z.winkel = w;
  const ergebnis = { pfad: flug.pfad, zelle: flug.zelle, code, platzte, fiel, gekappt, neueReihe: false, gruppe, gewonnen: false };

  if (gewonnen(z)) {
    // Rest (nur Steine) fällt mit ab
    for (let k = 0; k < ANZAHL; k++) if (z.brett[k]) { fiel.push(k); z.brett[k] = 0; }
    ergebnis.gewonnen = true;
  } else if (endlosBetrieb(z)) {
    if (!platzte.length) z.fehl++;
    if (z.fehl >= FEHL_BIS_REIHE) {
      z.fehl = 0;
      schiebeReihe(z);
      ergebnis.neueReihe = true;
      const mehr = kappe(z);
      gekappt = gekappt.concat(mehr);
      const l = lose(z.brett, z.kopf);
      for (const p of l) { z.brett[p] = 0; fiel.push(p); }
    }
    if (anzahlBlasen(z.brett) === 0) {
      for (let k = 0; k < 3; k++) schiebeReihe(z);
      ergebnis.neueReihe = true;
    }
  }
  ergebnis.gekappt = gekappt;
  z.aktuell = z.naechste;
  z.naechste = ziehe(z);
  reparatur(z);
  return { zustand: z, ergebnis };
}

/** Schuss mit Verlauf (für Rückgängig) */
export function schiesse(z, winkel) {
  const r = rechne(z, winkel);
  if (!r) return null;
  r.zustand.verlauf = [...z.verlauf, schnappschuss(z)].slice(-MAX_VERLAUF);
  return r;
}

export function tausche(z) {
  const k = kopie(z);
  [k.aktuell, k.naechste] = [z.naechste, z.aktuell];
  return k;
}

export const kannRueckgaengig = (z) => z.verlauf.length > 0;

export function rueckgaengig(z) {
  if (!z.verlauf.length) return null;
  const k = kopie(z);
  const s = k.verlauf.pop();
  k.brett = Array.from(s.b, (ch) => ch.charCodeAt(0) - 48);
  k.kopf = s.k; k.aktuell = s.a; k.naechste = s.n; k.fehl = s.f; k.rng = s.r;
  k.schuesse = s.s; k.blasen = s.bl; k.reihen = s.rh; k.farben = s.fa;
  return k;
}

export function setzeWinkel(z, w) {
  return { ...z, winkel: begrenzeWinkel(w) };
}

/** Nach dem Ziel im Endlos-Betrieb weiterspielen: Flag setzen, 3 frische Reihen, neue Schussfolge */
export function weiterspielen(z) {
  if (z.weiter) return z;
  const k = kopie(z);
  k.weiter = true;
  k.fehl = 0;
  for (let n = 0; n < 3; n++) schiebeReihe(k);
  k.aktuell = ziehe(k);
  k.naechste = ziehe(k);
  return k;
}

// ---------- Hinweis ----------
function bewertung(r) {
  const e = r.ergebnis;
  const punkte = e.platzte.length * 10 + e.fiel.length * 6 + (e.platzte.length ? 0 : 3 * e.gruppe) - e.zelle.r * 0.05;
  return e.gewonnen ? punkte + 1000 : punkte;
}

/** Guter Schuss: Kandidatenwinkel für aktuelle und nächste Blase simulieren → { winkel, tausch, wert, zelle } */
export function hinweis(z) {
  let beste = null;
  for (const tauschen of [false, true]) {
    const basis = tauschen ? tausche(z) : z;
    for (let w = -78; w <= 78; w += 2) {
      const r = rechne(basis, w);
      if (!r) continue;
      const wert = bewertung(r) - (tauschen ? 0.5 : 0);
      if (!beste || wert > beste.wert + 1e-9 || (Math.abs(wert - beste.wert) <= 1e-9 && Math.abs(w) < Math.abs(beste.winkel))) {
        beste = { winkel: w, tausch: tauschen, wert, zelle: r.ergebnis.zelle, platzt: r.ergebnis.platzte.length };
      }
    }
  }
  return beste;
}

// ---------- Speichern ----------
const ganz = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
const rngGueltig = (r) => Array.isArray(r) && r.length === 4 && r.every((v) => ganz(v, 0, 4294967295));
const schussCode = (v, farben) => ganz(v, 1, farben) || v === BOMBE || v === REGENBOGEN;

function schnappGueltig(s, farben) {
  return s && typeof s === 'object' && typeof s.b === 'string' && s.b.length === ANZAHL && /^[0-9]+$/.test(s.b)
    && [...s.b].every((ch) => { const c = ch.charCodeAt(0) - 48; return c <= FARBEN_MAX || c === STEIN; })
    && ganz(s.k, 0, 1) && ganz(s.fa, 3, FARBEN_MAX) && schussCode(s.a, s.fa) && schussCode(s.n, s.fa)
    && ganz(s.f, 0, 99) && rngGueltig(s.r) && ganz(s.s, 0, 1e9) && ganz(s.bl, 0, 1e9) && ganz(s.rh, 0, 1e9);
}

export function istGueltig(z) {
  try {
    if (!z || typeof z !== 'object' || Array.isArray(z)) return false;
    if (z.modus !== 'level' && z.modus !== 'endlos') return false;
    if (typeof z.seed !== 'string' || !z.seed.length || z.seed.length > 64) return false;
    if (!rngGueltig(z.rng)) return false;
    if (z.modus === 'level' ? !ganz(z.level, 1, 1e6) : z.level !== 0) return false;
    if (!ganz(z.farben, 3, FARBEN_MAX) || typeof z.spezial !== 'boolean' || typeof z.weiter !== 'boolean') return false;
    if (!ganz(z.kopf, 0, 1)) return false;
    if (!Array.isArray(z.brett) || z.brett.length !== ANZAHL) return false;
    for (let i = 0; i < ANZAHL; i++) {
      const c = z.brett[i];
      if (!(ganz(c, 0, z.farben) || c === STEIN)) return false;
      const r = Math.floor(i / SPALTEN), col = i % SPALTEN;
      if (c && col >= spaltenIn(r, z.kopf)) return false;
    }
    if (!schussCode(z.aktuell, z.farben) || !schussCode(z.naechste, z.farben)) return false;
    if (!ganz(z.fehl, 0, 99) || !ganz(z.schuesse, 0, 1e9) || !ganz(z.blasen, 0, 1e9) || !ganz(z.reihen, 0, 1e9)) return false;
    if (typeof z.winkel !== 'number' || !Number.isFinite(z.winkel) || Math.abs(z.winkel) > MAX_WINKEL) return false;
    if (!Array.isArray(z.verlauf) || z.verlauf.length > MAX_VERLAUF) return false;
    return z.verlauf.every((s) => schnappGueltig(s));
  } catch { return false; }
}

export function zumSpeichern(z) { return kopie(z); }

export function ausSpeicher(s) {
  if (!istGueltig(s)) throw new Error('Ungültiger Blasenschuss-Stand');
  const z = kopie(s);
  const nur = ['modus', 'seed', 'rng', 'level', 'farben', 'spezial', 'brett', 'kopf', 'aktuell', 'naechste', 'fehl', 'schuesse', 'blasen', 'reihen', 'weiter', 'winkel', 'verlauf'];
  return Object.fromEntries(nur.map((k) => [k, z[k]]));
}
