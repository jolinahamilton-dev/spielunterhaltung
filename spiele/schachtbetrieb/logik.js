// Schachtbetrieb: Simulation ohne DOM und ohne Zufall.
// Bestände (in Taler-Wert): Schachtkisten, Zentrum-Lager, Geld. Alles ist ein Fließmodell:
//   Bergleute füllen die Kiste → der Aufzug trägt sie ins Lager → der Lagerarbeiter verkauft.

export const MAX_SCHAECHTE = 10;
export const MAX_BERGLEUTE = 20;
export const MAX_STUFE = 40;
export const MAX_GELD = 1e30;
export const OFFLINE_MAX_S = 8 * 3600;   // Deckel für die Abwesenheit
export const OFFLINE_FAKTOR = 0.5;       // ab OFFLINE_VOLL_S zählt nur die Hälfte
export const OFFLINE_VOLL_S = 60;
export const ANSCHUB_S = 3;              // so viel Förderung bringt ein Antippen
export const ANSCHUB_SPERRE_S = 1.5;
const MAX_SCHRITTE = 4000;
const MAX_T = 4e12;                      // Zeitstempel-Grenze (Jahr ~2096)

/** Alle Zahlen der Wachstumskurve an einer Stelle */
export const KURVE = Object.freeze({
  // Bergleute: Wert je Fahrt, Fahrzeit
  wert0: 6, wertFaktor: 8, miner0: 12, tempoF: 1.1, tragF: 1.1,
  // Aufzug
  fahrt0: 3, fahrtJeSchacht: 5, aufzugTempoF: 1.2, aufzugLadung0: 60, aufzugLadungF: 1.5,
  // Zentrum
  zentrumZeit0: 6, zentrumTempoF: 1.2, zentrumLadung0: 100, zentrumLadungF: 1.5,
  // Kosten: Basis · Wachstum^(Stufe−1) · Tiefenfaktor^Schacht
  kosten: {
    n: { basis: 10, wachs: 1.7 },
    tempo: { basis: 45, wachs: 1.5 },
    trag: { basis: 35, wachs: 1.5 },
    aufzugTempo: { basis: 180, wachs: 1.5 },
    aufzugLadung: { basis: 160, wachs: 1.5 },
    zentrumTempo: { basis: 220, wachs: 1.5 },
    zentrumLadung: { basis: 200, wachs: 1.5 },
    schacht: { basis: 300, wachs: 12 },
  },
  tiefe: 24,
  // Puffer: Schachtlager fasst so viele Sekunden Förderung, das Eingangslager des Zentrums so viele Sekunden Verkauf
  lagerSek: 40, eingangSek: 20,
});

export const SCHACHT_NAMEN = Object.freeze([
  'Kupferstollen', 'Zinnstollen', 'Eisenstollen', 'Silberstollen', 'Kohlestollen', 'Bleistollen',
  'Goldstollen', 'Salzstollen', 'Quarzstollen', 'Opalstollen', 'Rubinstollen', 'Smaragdstollen',
]);

// ---------- Zustand ----------
export function neuesBergwerk(jetztMs = Date.now()) {
  return {
    v: 1, t: sichereZeit(jetztMs), uhr: 0, sperre: 0, geld: 0, gesamt: 0,
    aufzug: { tempo: 1, ladung: 1 },
    zentrum: { tempo: 1, ladung: 1, lager: 0 },
    schaechte: [{ n: 1, tempo: 1, trag: 1, kiste: 0 }],
  };
}

function sichereZeit(ms) {
  return Number.isFinite(ms) && ms >= 0 && ms <= MAX_T ? ms : 0;
}

export function kopie(z) {
  return {
    v: 1, t: z.t, uhr: z.uhr, sperre: z.sperre, geld: z.geld, gesamt: z.gesamt,
    aufzug: { tempo: z.aufzug.tempo, ladung: z.aufzug.ladung },
    zentrum: { tempo: z.zentrum.tempo, ladung: z.zentrum.ladung, lager: z.zentrum.lager },
    schaechte: z.schaechte.map((s) => ({ n: s.n, tempo: s.tempo, trag: s.trag, kiste: s.kiste })),
  };
}

const istObjekt = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
function zahl(x, min, max, ganz = false) {
  if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max) throw new Error('ungültige Zahl');
  if (ganz && !Number.isInteger(x)) throw new Error('keine ganze Zahl');
  return x;
}

/** Streng prüfen und eine saubere Kopie liefern; wirft bei jedem Fehler */
export function ausSpeicher(o) {
  if (!istObjekt(o) || o.v !== 1) throw new Error('kein Spielstand');
  if (!Array.isArray(o.schaechte) || o.schaechte.length < 1 || o.schaechte.length > MAX_SCHAECHTE) throw new Error('Schächte');
  if (!istObjekt(o.aufzug) || !istObjekt(o.zentrum)) throw new Error('Aufbau');
  const z = {
    v: 1,
    t: zahl(o.t, 0, MAX_T),
    uhr: zahl(o.uhr, 0, 1e12),
    sperre: zahl(o.sperre, 0, 1e12),
    geld: zahl(o.geld, 0, MAX_GELD),
    gesamt: zahl(o.gesamt, 0, MAX_GELD),
    aufzug: { tempo: zahl(o.aufzug.tempo, 1, MAX_STUFE, true), ladung: zahl(o.aufzug.ladung, 1, MAX_STUFE, true) },
    zentrum: {
      tempo: zahl(o.zentrum.tempo, 1, MAX_STUFE, true), ladung: zahl(o.zentrum.ladung, 1, MAX_STUFE, true),
      lager: zahl(o.zentrum.lager, 0, MAX_GELD),
    },
    schaechte: o.schaechte.map((s) => {
      if (!istObjekt(s)) throw new Error('Schacht');
      return {
        n: zahl(s.n, 1, MAX_BERGLEUTE, true), tempo: zahl(s.tempo, 1, MAX_STUFE, true),
        trag: zahl(s.trag, 1, MAX_STUFE, true), kiste: zahl(s.kiste, 0, MAX_GELD),
      };
    }),
  };
  // Übernahme älterer Stände: Puffer an die Kapazität anpassen
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
export function minerZeit(s) { return KURVE.miner0 / pot(KURVE.tempoF, s.tempo); }
export function minerLast(s, k) { return schachtWert(k) * pot(KURVE.tragF, s.trag); }
/** Förderung des Schachts in Taler pro Sekunde */
export function foerderung(s, k) { return (s.n * minerLast(s, k)) / minerZeit(s); }
export function aufzugLadung(z) { return KURVE.aufzugLadung0 * pot(KURVE.aufzugLadungF, z.aufzug.ladung); }
/** Dauer einer Fahrt (hin und zurück, mit Be-/Entladen) zu Schacht k */
export function fahrtZeit(z, k) {
  return (2 * (k + 1) * KURVE.fahrtJeSchacht * 0.5 + KURVE.fahrt0) / pot(KURVE.aufzugTempoF, z.aufzug.tempo);
}
export function zentrumLadung(z) { return KURVE.zentrumLadung0 * pot(KURVE.zentrumLadungF, z.zentrum.ladung); }
export function zentrumZeit(z) { return KURVE.zentrumZeit0 / pot(KURVE.zentrumTempoF, z.zentrum.tempo); }
/** Verkaufsleistung des Zentrums in Taler pro Sekunde */
export function verkaufsRate(z) { return zentrumLadung(z) / zentrumZeit(z); }

/** Ungefähres Einkommen im Dauerbetrieb (Taler/s): Förderung, durch Aufzug und Zentrum begrenzt */
export function aufzugFluss(z) {
  let p = 0, f = 0, t = 0;
  const lad = aufzugLadung(z);
  z.schaechte.forEach((s, k) => {
    const pk = foerderung(s, k);
    p += pk;
    f += (pk / lad) * fahrtZeit(z, k);
    t += pk * fahrtZeit(z, k);
  });
  const fluss = f > 1 ? p / f : p;
  return { fluss, fahrt: p > 0 ? t / p : 0 };
}

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
const KATEGORIEN = ['n', 'tempo', 'trag'];

function stufeVon(z, was) {
  const teile = String(was).split(':');
  if (teile[0] === 'schacht' && teile.length === 1) return { art: 'schacht', stufe: z.schaechte.length, max: MAX_SCHAECHTE };
  if (teile[0] === 'aufzug' && (teile[1] === 'tempo' || teile[1] === 'ladung') && teile.length === 2) {
    return { art: `aufzug${teile[1] === 'tempo' ? 'Tempo' : 'Ladung'}`, stufe: z.aufzug[teile[1]], max: MAX_STUFE };
  }
  if (teile[0] === 'zentrum' && (teile[1] === 'tempo' || teile[1] === 'ladung') && teile.length === 2) {
    return { art: `zentrum${teile[1] === 'tempo' ? 'Tempo' : 'Ladung'}`, stufe: z.zentrum[teile[1]], max: MAX_STUFE };
  }
  const m = /^s(\d{1,2}):(n|tempo|trag)$/.exec(String(was));
  if (m) {
    const k = Number(m[1]);
    if (k < z.schaechte.length && KATEGORIEN.includes(m[2])) {
      return { art: m[2], k, stufe: z.schaechte[k][m[2]], max: m[2] === 'n' ? MAX_BERGLEUTE : MAX_STUFE };
    }
  }
  return null;
}

/** Preis des Kaufs oder null (nicht vorhanden / schon am Maximum) */
export function preis(z, was) {
  const i = stufeVon(z, was);
  if (!i || i.stufe >= i.max) return null;
  const kk = KURVE.kosten[i.art];
  if (i.art === 'schacht') return Math.round(kk.basis * kk.wachs ** (i.stufe - 1));
  if (i.art === 'aufzugTempo' || i.art === 'aufzugLadung' || i.art === 'zentrumTempo' || i.art === 'zentrumLadung') {
    return Math.round(kk.basis * kk.wachs ** (i.stufe - 1));
  }
  return Math.round(kk.basis * kk.wachs ** (i.stufe - 1) * KURVE.tiefe ** i.k);
}

/** Alle jetzt möglichen Käufe (Schlüssel) */
export function moeglicheKaeufe(z) {
  const liste = [];
  z.schaechte.forEach((_, k) => { for (const c of KATEGORIEN) liste.push(`s${k}:${c}`); });
  liste.push('schacht', 'aufzug:tempo', 'aufzug:ladung', 'zentrum:tempo', 'zentrum:ladung');
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
  if (i.art === 'schacht') c.schaechte.push({ n: 1, tempo: 1, trag: 1, kiste: 0 });
  else if (i.art === 'n' || i.art === 'tempo' || i.art === 'trag') c.schaechte[i.k][i.art] += 1;
  else {
    const [wo, was2] = String(was).split(':');
    c[wo][was2] += 1;
  }
  return { zustand: c, ok: true, preis: p, grund: '' };
}

/** Kleiner Anschub: die Kiste des Schachts bekommt ein paar Sekunden Förderung */
export function anschub(z, k) {
  if (!Number.isInteger(k) || k < 0 || k >= z.schaechte.length) return { zustand: z, ok: false };
  if (z.uhr < z.sperre) return { zustand: z, ok: false };
  const c = kopie(z);
  c.schaechte[k].kiste = Math.min(MAX_GELD, c.schaechte[k].kiste + foerderung(c.schaechte[k], k) * ANSCHUB_S);
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
  const teile = String(was).split(':');
  const art = { n: 'Bergleute', tempo: 'Tempo', trag: 'Tragkraft', ladung: 'Ladung' }[teile[1]] ?? '';
  if (teile[0] === 'aufzug') return `Aufzug: ${art}`;
  if (teile[0] === 'zentrum') return `Zentrum: ${art}`;
  const k = Number(String(teile[0]).slice(1));
  return `Schacht ${k + 1}: ${art}`;
}

/** Kurze Wirkung eines Kaufs, z. B. „+10 % Tempo“ */
export function effektText(z, was) {
  const proz = (f) => `+${Math.round((f - 1) * 100)} %`;
  if (was === 'schacht') {
    const k = z.schaechte.length;
    return `+${formatiere(foerderung({ n: 1, tempo: 1, trag: 1 }, k))} Erz/s`;
  }
  const teile = String(was).split(':');
  const art = teile[1];
  if (teile[0] === 'aufzug') return art === 'tempo' ? `${proz(KURVE.aufzugTempoF)} Tempo` : `${proz(KURVE.aufzugLadungF)} Ladung`;
  if (teile[0] === 'zentrum') return art === 'tempo' ? `${proz(KURVE.zentrumTempoF)} Verkaufstempo` : `${proz(KURVE.zentrumLadungF)} Ladung`;
  const sh = z.schaechte[Number(teile[0].slice(1))];
  if (!sh) return '';
  if (art === 'n') return `+1 Bergmann (${proz((sh.n + 1) / sh.n)})`;
  if (art === 'tempo') return `${proz(KURVE.tempoF)} Tempo`;
  return `${proz(KURVE.tragF)} Tragkraft`;
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
