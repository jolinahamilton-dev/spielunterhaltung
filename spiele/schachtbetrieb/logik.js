// Schachtbetrieb: Simulation ohne DOM und ohne Zufall.
// Eine Stufe je Station (Schacht, Aufzug, Zentrum). Bestände in Erz (1 Erz = 1 Taler beim Verkauf):
//   Bergleute füllen das Schachtlager → der Aufzug trägt es ins Eingangslager → das Zentrum verkauft.

export const MAX_SCHAECHTE = 10;
export const MAX_STUFE = 40;
export const MAX_GELD = 1e30;
export const STAND_VERSION = 3;
export const MAX_LEVEL = 9999;
export const OFFLINE_MAX_S = 8 * 3600;   // Deckel für die Abwesenheit
export const OFFLINE_FAKTOR = 0.5;       // ab OFFLINE_VOLL_S zählt nur die Hälfte
export const OFFLINE_VOLL_S = 60;
export const ANSCHUB_S = 3;              // so viel Förderung bringt ein Antippen
export const ANSCHUB_SPERRE_S = 1.5;
const MAX_SCHRITTE = 4000;
const MAX_T = 4e12;                      // Zeitstempel-Grenze (Jahr ~2096)

/** Alle Zahlen der Wachstumskurve an einer Stelle */
export const KURVE = Object.freeze({
  // Schacht k, Stufe s: alle drei Faktoren wachsen mit der Stufe, alle 3 Stufen kommt ein Bergmann dazu
  wert0: 6, wertFaktor: 8, miner0: 12, bergleuteAlle: 3, tempoF: 1.05, tragF: 1.05,
  // Aufzug, Stufe a
  fahrt0: 3, fahrtJeSchacht: 2.5, aufzugTempoF: 1.1, aufzugLadung0: 60, aufzugLadungF: 1.15,
  // Zentrum, Stufe c
  zentrumZeit0: 6, zentrumTempoF: 1.1, zentrumLadung0: 100, zentrumLadungF: 1.15,
  // Kosten: Basis · Wachstum^(Stufe−1) (· Tiefenfaktor^Schacht)
  kosten: {
    schachtStufe: { basis: 10, wachs: 1.24 },
    aufzug: { basis: 200, wachs: 1.3 },
    zentrum: { basis: 240, wachs: 1.3 },
    schacht: { basis: 300, wachs: 12 },
  },
  tiefe: 24,
  // Puffer: Schachtlager fasst so viele Sekunden Förderung, das Eingangslager des Zentrums so viele Sekunden Verkauf
  lagerSek: 40, eingangSek: 20,
});

export const SCHACHT_NAMEN = Object.freeze([
  'Kupfer', 'Zinn', 'Eisen', 'Silber', 'Kohle', 'Blei', 'Gold', 'Salz', 'Quarz', 'Opal',
]);

// ---------- Zustand ----------
export function neuesBergwerk(jetztMs = Date.now(), level = 0) {
  const def = level > 0 ? levelDef(level) : null;
  return {
    v: STAND_VERSION, t: sichereZeit(jetztMs), uhr: 0, sperre: 0, geld: def ? def.geld : 0, gesamt: 0,
    level: def ? level : 0, fertig: false, weiter: false,
    aufzug: { stufe: 1 },
    zentrum: { stufe: 1, lager: 0 },
    schaechte: Array.from({ length: def ? def.schaechte : 1 }, () => ({ stufe: 1, kiste: 0 })),
  };
}

function sichereZeit(ms) {
  return Number.isFinite(ms) && ms >= 0 && ms <= MAX_T ? ms : 0;
}

export function kopie(z) {
  return {
    v: STAND_VERSION, t: z.t, uhr: z.uhr, sperre: z.sperre, geld: z.geld, gesamt: z.gesamt,
    level: z.level, fertig: z.fertig, weiter: z.weiter,
    aufzug: { stufe: z.aufzug.stufe },
    zentrum: { stufe: z.zentrum.stufe, lager: z.zentrum.lager },
    schaechte: z.schaechte.map((s) => ({ stufe: s.stufe, kiste: s.kiste })),
  };
}

const istObjekt = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
function zahl(x, min, max, ganz = false) {
  if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max) throw new Error('ungültige Zahl');
  if (ganz && !Number.isInteger(x)) throw new Error('keine ganze Zahl');
  return x;
}

/** Streng prüfen und eine saubere Kopie liefern; wirft bei jedem Fehler (auch bei Ständen der Version 1) */
export function ausSpeicher(o) {
  if (!istObjekt(o) || o.v !== STAND_VERSION) throw new Error('kein Spielstand');
  const level = zahl(o.level, 0, MAX_LEVEL, true);
  if (typeof o.fertig !== 'boolean' || typeof o.weiter !== 'boolean') throw new Error('Flags');
  if ((o.fertig && level === 0) || (o.weiter && !o.fertig)) throw new Error('Flags passen nicht');
  const grenze = level > 0 ? levelDef(level).max : MAX_SCHAECHTE;
  if (!Array.isArray(o.schaechte) || o.schaechte.length < 1 || o.schaechte.length > grenze) throw new Error('Schächte');
  if (!istObjekt(o.aufzug) || !istObjekt(o.zentrum)) throw new Error('Aufbau');
  const z = {
    v: STAND_VERSION,
    t: zahl(o.t, 0, MAX_T),
    uhr: zahl(o.uhr, 0, 1e12),
    sperre: zahl(o.sperre, 0, 1e12),
    geld: zahl(o.geld, 0, MAX_GELD),
    gesamt: zahl(o.gesamt, 0, MAX_GELD),
    level,
    fertig: o.fertig,
    weiter: o.weiter,
    aufzug: { stufe: zahl(o.aufzug.stufe, 1, MAX_STUFE, true) },
    zentrum: { stufe: zahl(o.zentrum.stufe, 1, MAX_STUFE, true), lager: zahl(o.zentrum.lager, 0, MAX_GELD) },
    schaechte: o.schaechte.map((s) => {
      if (!istObjekt(s)) throw new Error('Schacht');
      return { stufe: zahl(s.stufe, 1, MAX_STUFE, true), kiste: zahl(s.kiste, 0, MAX_GELD) };
    }),
  };
  // Puffer an die Kapazität anpassen
  z.schaechte.forEach((s, k) => { s.kiste = Math.min(s.kiste, lagerKap(s, k)); });
  z.zentrum.lager = Math.min(z.zentrum.lager, eingangKap(z));
  return z;
}

export function istGueltig(o) {
  try { ausSpeicher(o); return true; } catch { return false; }
}

/** JSON-tauglicher Stand mit aktuellem Zeitstempel */
export function zumSpeichern(z, jetztMs = Date.now()) {
  const k = kopie(z);
  k.t = sichereZeit(jetztMs);
  return k;
}

// ---------- Werte aus den Stufen ----------
const pot = (f, stufe) => f ** (stufe - 1);

export function schachtWert(k) { return KURVE.wert0 * KURVE.wertFaktor ** k; }
/** Zahl der Bergleute im Schacht (nur Anzeige und Förderung) */
export function bergleute(s) { return 1 + Math.floor((s.stufe - 1) / KURVE.bergleuteAlle); }
export function minerZeit(s) { return KURVE.miner0 / pot(KURVE.tempoF, s.stufe); }
export function minerLast(s, k) { return schachtWert(k) * pot(KURVE.tragF, s.stufe); }
/** Förderung des Schachts in Erz pro Sekunde */
export function foerderung(s, k) { return (bergleute(s) * minerLast(s, k)) / minerZeit(s); }
export function aufzugLadung(z) { return KURVE.aufzugLadung0 * pot(KURVE.aufzugLadungF, z.aufzug.stufe); }
/** Dauer einer Fahrt (hin und zurück, mit Be-/Entladen) zu Schacht k */
export function fahrtZeit(z, k) {
  return ((k + 1) * 2 * KURVE.fahrtJeSchacht + KURVE.fahrt0) / pot(KURVE.aufzugTempoF, z.aufzug.stufe);
}
export function zentrumLadung(z) { return KURVE.zentrumLadung0 * pot(KURVE.zentrumLadungF, z.zentrum.stufe); }
export function zentrumZeit(z) { return KURVE.zentrumZeit0 / pot(KURVE.zentrumTempoF, z.zentrum.stufe); }
/** Verkaufsleistung des Zentrums in Erz pro Sekunde */
export function verkaufsRate(z) { return zentrumLadung(z) / zentrumZeit(z); }

/** Durchsatz des Aufzugs im Dauerbetrieb und mittlere Fahrzeit */
export function aufzugFluss(z) {
  let p = 0, f = 0, t = 0;
  const lad = aufzugLadung(z);
  z.schaechte.forEach((s, k) => {
    const pk = foerderung(s, k);
    p += pk;
    f += (pk / lad) * fahrtZeit(z, k);
    t += pk * fahrtZeit(z, k);
  });
  return { fluss: f > 1 ? p / f : p, fahrt: p > 0 ? t / p : 0 };
}

/** Ungefähres Einkommen im Dauerbetrieb (Taler/s): Förderung, durch Aufzug und Zentrum begrenzt */
export function einkommen(z) {
  return Math.min(aufzugFluss(z).fluss, verkaufsRate(z));
}

/** Fassungsvermögen des Schachtlagers (Erz) */
export function lagerKap(s, k) { return KURVE.lagerSek * foerderung(s, k); }
/** Fassungsvermögen des Eingangslagers im Zentrum (Erz) */
export function eingangKap(z) { return KURVE.eingangSek * verkaufsRate(z); }
/** Ungefähre Last, die der Aufzug im Dauerbetrieb je Fahrt trägt (Erz, nach Little: Durchsatz · Fahrzeit) */
export function aufzugLast(z) {
  const a = aufzugFluss(z);
  return Math.min(aufzugLadung(z), a.fluss * a.fahrt);
}

// ---------- Fortschritt ----------
/** Rechnet dt Sekunden voran (neuer Zustand, deterministisch). Große dt: höchstens MAX_SCHRITTE Schritte. */
export function fortschritt(z, dt) {
  const c = kopie(z);
  if (!Number.isFinite(dt) || dt <= 0) return c;
  dt = Math.min(dt, 1e7);
  const n = Math.min(MAX_SCHRITTE, Math.max(1, Math.ceil(dt / 0.5)));
  const h = dt / n;
  const K = c.schaechte.length;
  const prod = c.schaechte.map((s, k) => foerderung(s, k));
  const fahrt = c.schaechte.map((_, k) => fahrtZeit(c, k));
  const lad = aufzugLadung(c);
  const rate = verkaufsRate(c);
  const kap = c.schaechte.map((s, k) => lagerKap(s, k));
  const capZ = eingangKap(c);
  for (let schritt = 0; schritt < n; schritt++) {
    for (let i = 0; i < K; i++) {
      const s = c.schaechte[i];
      s.kiste = Math.min(kap[i], s.kiste + prod[i] * h);
    }
    let frei = Math.max(0, capZ - c.zentrum.lager);
    // Aufzug: Zeitbudget h, zwei Durchgänge proportional zu den Beständen
    let zeit = h;
    let geliefert = 0;
    for (let durchgang = 0; durchgang < 2 && zeit > 1e-12; durchgang++) {
      let summe = 0;
      for (let i = 0; i < K; i++) summe += c.schaechte[i].kiste;
      if (summe <= 0) break;
      const budget = zeit;
      for (let i = 0; i < K; i++) {
        const s = c.schaechte[i];
        const t = (budget * s.kiste) / summe;
        const traeg = Math.min(s.kiste, (t * lad) / fahrt[i], frei);
        frei -= traeg;
        s.kiste -= traeg;
        geliefert += traeg;
        zeit -= (traeg * fahrt[i]) / lad;
      }
    }
    c.zentrum.lager += geliefert;
    const verkauf = Math.min(c.zentrum.lager, rate * h);
    c.zentrum.lager -= verkauf;
    c.geld += verkauf;
    c.gesamt += verkauf;
  }
  c.uhr += dt;
  // Sicherheitsnetz gegen Überlauf
  c.geld = Math.min(c.geld, MAX_GELD);
  c.gesamt = Math.min(c.gesamt, MAX_GELD);
  c.zentrum.lager = Math.min(c.zentrum.lager, MAX_GELD);
  for (const s of c.schaechte) s.kiste = Math.min(s.kiste, MAX_GELD);
  return c;
}

/** Wirksame Rechenzeit für eine Abwesenheit von dt Sekunden (Deckel 8 h, danach nur die Hälfte) */
export function luecke(dt) {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  const d = Math.min(dt, OFFLINE_MAX_S);
  return d <= OFFLINE_VOLL_S ? d : OFFLINE_VOLL_S + (d - OFFLINE_VOLL_S) * OFFLINE_FAKTOR;
}

/** Abwesenheit seit z.t verrechnen. Uhr zurückgestellt oder Unsinn → 0 s. */
export function offline(z, jetztMs) {
  const jetzt = sichereZeit(jetztMs);
  const roh = (jetzt - z.t) / 1000;
  const dt = Number.isFinite(roh) && roh > 0 ? Math.min(roh, OFFLINE_MAX_S) : 0;
  const wirk = luecke(dt);
  const neu = wirk > 0 ? fortschritt(z, wirk) : kopie(z);
  neu.t = jetzt;
  return { zustand: neu, dt, gewinn: neu.geld - z.geld };
}

// ---------- Käufe ----------
// Schlüssel: 's<k>' (Schacht k verbessern), 'aufzug', 'zentrum', 'schacht' (neuer Schacht)
function stufeVon(z, was) {
  if (was === 'schacht') return { art: 'schacht', stufe: z.schaechte.length, max: maxSchaechte(z) };
  if (was === 'aufzug') return { art: 'aufzug', stufe: z.aufzug.stufe, max: MAX_STUFE };
  if (was === 'zentrum') return { art: 'zentrum', stufe: z.zentrum.stufe, max: MAX_STUFE };
  const m = /^s(\d{1,2})$/.exec(String(was));
  if (m && Number(m[1]) < z.schaechte.length) {
    const k = Number(m[1]);
    return { art: 'schachtStufe', k, stufe: z.schaechte[k].stufe, max: MAX_STUFE };
  }
  return null;
}

/** Preis des Kaufs oder null (nicht vorhanden / schon am Maximum) */
export function preis(z, was) {
  const i = stufeVon(z, was);
  if (!i || i.stufe >= i.max) return null;
  const kk = KURVE.kosten[i.art];
  const p = kk.basis * kk.wachs ** (i.stufe - 1);
  return Math.round(i.art === 'schachtStufe' ? p * KURVE.tiefe ** i.k : p);
}

/** Alle jetzt möglichen Käufe (Schlüssel) */
export function moeglicheKaeufe(z) {
  const liste = z.schaechte.map((_, k) => `s${k}`);
  liste.push('schacht', 'aufzug', 'zentrum');
  return liste.filter((w) => preis(z, w) !== null);
}

/** Kauf ausführen: { zustand, ok, preis, grund } (Original bleibt unverändert) */
export function kaufe(z, was) {
  const p = preis(z, was);
  if (p === null) return { zustand: z, ok: false, preis: null, grund: 'nicht verfügbar' };
  if (z.geld < p) return { zustand: z, ok: false, preis: p, grund: 'zu wenig Geld' };
  const c = kopie(z);
  c.geld -= p;
  const i = stufeVon(c, was);
  if (i.art === 'schacht') c.schaechte.push({ stufe: 1, kiste: 0 });
  else if (i.art === 'schachtStufe') c.schaechte[i.k].stufe += 1;
  else c[i.art].stufe += 1;
  return { zustand: c, ok: true, preis: p, grund: '' };
}

/** Kleiner Anschub: die Kiste des Schachts bekommt ein paar Sekunden Förderung */
export function anschub(z, k) {
  if (!Number.isInteger(k) || k < 0 || k >= z.schaechte.length) return { zustand: z, ok: false };
  if (z.uhr < z.sperre) return { zustand: z, ok: false };
  const c = kopie(z);
  c.schaechte[k].kiste = Math.min(lagerKap(c.schaechte[k], k), c.schaechte[k].kiste + foerderung(c.schaechte[k], k) * ANSCHUB_S);
  c.sperre = c.uhr + ANSCHUB_SPERRE_S;
  return { zustand: c, ok: true };
}

/** Günstigstes mögliches Upgrade samt ungefährer Wartezeit in Sekunden */
export function naechstesZiel(z) {
  let best = null;
  for (const w of moeglicheKaeufe(z)) {
    const p = preis(z, w);
    if (best === null || p < best.preis) best = { was: w, preis: p };
  }
  if (!best) return null;
  const e = einkommen(z);
  const fehlt = Math.max(0, best.preis - z.geld);
  best.wartezeit = fehlt <= 0 ? 0 : e > 0 ? fehlt / e : Infinity;
  return best;
}

export function bezeichnung(was) {
  if (was === 'schacht') return 'Neuer Schacht';
  if (was === 'aufzug') return 'Aufzug';
  if (was === 'zentrum') return 'Verkaufszentrum';
  const m = /^s(\d{1,2})$/.exec(String(was));
  return m ? `Schacht ${Number(m[1]) + 1}` : '';
}

/** Kurze Wirkung eines Kaufs (für Tooltip und aria-label), z. B. „+20 % Förderung“ */
export function effektText(z, was) {
  const proz = (f) => `+${Math.round((f - 1) * 100)} %`;
  if (was === 'schacht') {
    return `+${formatiere(foerderung({ stufe: 1 }, z.schaechte.length))} Erz/s`;
  }
  if (was === 'aufzug') return `${proz(KURVE.aufzugTempoF)} Tempo, ${proz(KURVE.aufzugLadungF)} Ladung`;
  if (was === 'zentrum') return `${proz(KURVE.zentrumTempoF)} Verkaufstempo, ${proz(KURVE.zentrumLadungF)} Ladung`;
  const m = /^s(\d{1,2})$/.exec(String(was));
  const sh = m ? z.schaechte[Number(m[1])] : null;
  if (!sh) return '';
  const k = Number(m[1]);
  const vor = foerderung(sh, k);
  const nach = foerderung({ stufe: sh.stufe + 1 }, k);
  return `${proz(nach / vor)} Förderung`;
}

// ---------- Level ----------
// Ein Level ist ein frisches Bergwerk mit einem klaren Ziel (oder wenigen Zielen, die alle erfüllt sein müssen).
// Alles (Ziele, Startgeld, Startschächte, Obergrenze der Schächte) ergibt sich aus der Levelnummer – nie aus dem Spielstand.
const Z = (art, wert) => ({ art, wert });
/** Handgesetzte Level: [Ziele, Startgeld, Startschächte, höchstens Schächte] */
const LEVEL_TABELLE = [
  [[Z('verdient', 500)], 0, 1, 1],
  [[Z('aufzug', 3)], 0, 1, 1],
  [[Z('schachtStufe', 18)], 0, 1, 1],
  [[Z('schaechte', 2)], 0, 1, 2],
  [[Z('zentrum', 4)], 0, 1, 1],
  [[Z('verdient', 4000)], 0, 1, 1],
  [[Z('aufzug', 5), Z('zentrum', 4)], 0, 1, 1],
  [[Z('verdient', 8000)], 300, 2, 4],
  [[Z('alleStufe', 6)], 300, 2, 4],
  [[Z('aufzug', 6), Z('zentrum', 5)], 300, 2, 4],
  [[Z('verdient', 6000)], 300, 2, 4],
  [[Z('schachtStufe', 22)], 300, 2, 4],
  [[Z('verdient', 7000), Z('aufzug', 5)], 500, 3, 5],
  [[Z('alleStufe', 8)], 300, 2, 4],
  [[Z('schachtStufe', 20), Z('zentrum', 5)], 500, 3, 5],
  [[Z('schaechte', 3)], 2000, 2, 3],
  [[Z('aufzug', 6)], 800, 3, 5],
  [[Z('verdient', 6000)], 800, 3, 5],
  [[Z('zentrum', 6)], 800, 3, 5],
  [[Z('alleStufe', 6), Z('aufzug', 5)], 300, 2, 4],
  [[Z('schachtStufe', 24)], 0, 1, 1],
  [[Z('schaechte', 2), Z('aufzug', 4)], 0, 1, 2],
  [[Z('verdient', 8000)], 100, 2, 3],
  [[Z('zentrum', 6), Z('aufzug', 5)], 100, 2, 3],
  [[Z('verdient', 10000), Z('alleStufe', 6)], 300, 2, 4],
];
const HANDGESETZT = LEVEL_TABELLE.length;
export const LEVEL_HANDGESETZT = HANDGESETZT;
const GEN_MAX_FAKTOR = 1.2;        // generierte Level werden höchstens so viel schwerer als die handgesetzten

/** Definition von Level n (n ≥ 1): { ziele, geld, schaechte, max } – deterministisch, ohne Zufall */
export function levelDef(n) {
  const i = Math.min(Math.max(1, Math.floor(Number(n)) || 1), MAX_LEVEL) - 1;
  const basis = LEVEL_TABELLE[i % HANDGESETZT];
  let faktor = 1;
  if (i >= HANDGESETZT) faktor = Math.min(GEN_MAX_FAKTOR, 1 + 0.04 * Math.floor(i / HANDGESETZT) + 0.01 * (i % HANDGESETZT));
  const ziele = basis[0].map(({ art, wert }) => {
    if (faktor === 1) return { art, wert };
    // Zahlen-Ziele wachsen mit dem Faktor, Stufen- und Schachtziele um höchstens eins
    if (art === 'verdient' || art === 'einkommen') return { art, wert: Math.round(wert * faktor) };
    if (art === 'schaechte') return { art, wert };
    return { art, wert: wert + (faktor >= 1.15 ? 1 : 0) };
  });
  const schaechte = basis[2];
  const max = Math.min(MAX_SCHAECHTE, Math.max(basis[3], ziele.reduce((m, zi) => (zi.art === 'schaechte' ? Math.max(m, zi.wert) : m), 1)));
  return { ziele, geld: basis[1], schaechte, max };
}

/** Obergrenze der Schächte in diesem Bergwerk (Level: je nach Level, Endlos: 10) */
export function maxSchaechte(z) {
  return z.level > 0 ? levelDef(z.level).max : MAX_SCHAECHTE;
}

function zielIst(z, art) {
  switch (art) {
    case 'verdient': return z.gesamt;
    case 'schaechte': return z.schaechte.length;
    case 'aufzug': return z.aufzug.stufe;
    case 'zentrum': return z.zentrum.stufe;
    case 'schachtStufe': return Math.max(...z.schaechte.map((s) => s.stufe));
    case 'alleStufe': return Math.min(...z.schaechte.map((s) => s.stufe));
    case 'einkommen': return einkommen(z);
    default: return 0;
  }
}
function zielStart(def, art) {
  if (art === 'schaechte') return def.schaechte;
  if (art === 'verdient') return 0;
  if (art === 'einkommen') {
    const z0 = { aufzug: { stufe: 1 }, zentrum: { stufe: 1, lager: 0 }, schaechte: Array.from({ length: def.schaechte }, () => ({ stufe: 1, kiste: 0 })) };
    return einkommen(z0);
  }
  return 1;
}

/** Fortschritt zum Ziel: { anteil 0..1, erreicht } – nur im Level-Modus */
export function zielStand(z) {
  if (!(z.level > 0)) return null;
  const def = levelDef(z.level);
  let summe = 0;
  let erreicht = true;
  for (const zi of def.ziele) {
    const ist = zielIst(z, zi.art);
    const start = zielStart(def, zi.art);
    if (!(ist >= zi.wert - 1e-9)) erreicht = false;
    const a = zi.wert > start ? (ist - start) / (zi.wert - start) : 1;
    summe += Math.min(1, Math.max(0, a));
  }
  return { anteil: erreicht ? 1 : Math.min(0.999, summe / def.ziele.length), erreicht };
}

/** Ziel als Text, z. B. „3 Schächte öffnen“ */
export function zielText(def) {
  return def.ziele.map(({ art, wert }) => {
    switch (art) {
      case 'verdient': return `${formatiere(wert)} Taler verdienen`;
      case 'schaechte': return `${wert} Schächte öffnen`;
      case 'aufzug': return `Aufzug auf Stufe ${wert}`;
      case 'zentrum': return `Zentrum auf Stufe ${wert}`;
      case 'schachtStufe': return `Ein Schacht auf Stufe ${wert}`;
      case 'alleStufe': return `Alle Schächte auf Stufe ${wert}`;
      case 'einkommen': return `${formatiere(wert)} Taler pro Sekunde`;
      default: return '';
    }
  }).join(' und ');
}

// ---------- Darstellung der Zahlen ----------
const EINHEITEN = [[1e6, 'Mio.'], [1e9, 'Mrd.'], [1e12, 'Bio.'], [1e15, 'Brd.'], [1e18, 'Trio.'], [1e21, 'Trd.'], [1e24, 'Quad.']];
function dezimal(x, stellen) {
  return x.toFixed(stellen).replace('.', ',').replace(/,0+$/, '');
}
function tausender(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Kompakte deutsche Zahl: 12,5 · 1.234 · 1,2 Mio. */
export function formatiere(x) {
  if (!Number.isFinite(x)) return '0';
  if (x < 0) return `−${formatiere(-x)}`;
  if (x < 100) return dezimal(Math.floor(x * 10 + 1e-9) / 10, 1);
  if (x < 1e6) return tausender(Math.floor(x));
  for (let i = EINHEITEN.length - 1; i >= 0; i--) {
    const [e, name] = EINHEITEN[i];
    if (x >= e) {
      const m = x / e;
      const t = Math.floor(m * 10) / 10;
      if (t >= 1000 && i < EINHEITEN.length - 1) continue;
      return `${m >= 100 ? tausender(Math.floor(m)) : dezimal(t, 1)} ${name}`;
    }
  }
  return String(Math.floor(x));
}

/** Ungefähre Wartezeit als Text */
export function formatiereDauer(s) {
  if (!Number.isFinite(s)) return 'unbekannt';
  if (s < 1) return 'sofort';
  if (s < 90) return `${Math.ceil(s)} s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  if (s < 172800) return `${dezimal(s / 3600, 1)} h`;
  return `${Math.round(s / 86400)} Tage`;
}
