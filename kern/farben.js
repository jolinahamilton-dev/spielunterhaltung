// Spielfarben (Röhren, Blöcke, Fahrzeuge …) mit festem Symbol je Farbe, damit Farben auch ohne
// Farbsehen unterscheidbar sind. Zwei Paletten: „standard“ (ruhige Töne) und „farbenblind“
// (auf Basis der Okabe-Ito-Farben). Die Werte landen als CSS-Variablen --spielfarbe-0 … -9 auf <html>.

function vieleck(ecken, aussen, innen = null, drehung = -Math.PI / 2) {
  const punkte = [];
  const n = innen ? ecken * 2 : ecken;
  for (let i = 0; i < n; i++) {
    const r = innen && i % 2 ? innen : aussen;
    const w = drehung + (i * 2 * Math.PI) / n;
    punkte.push(`${(5 + r * Math.cos(w)).toFixed(2)} ${(5 + r * Math.sin(w)).toFixed(2)}`);
  }
  return `M${punkte.join('L')}Z`;
}

/** Symbol-Pfade im viewBox 0 0 10 10 (fill-rule: evenodd) */
export const SYMBOLE = Object.freeze({
  kreis: 'M5 1.4a3.6 3.6 0 1 0 .001 0Z',
  dreieck: 'M5 1.2L8.9 8.4H1.1Z',
  quadrat: 'M1.9 1.9H8.1V8.1H1.9Z',
  raute: 'M5 .8L9.2 5 5 9.2 .8 5Z',
  stern: vieleck(5, 4.3, 1.8),
  kreuz: 'M2 3.2 3.2 2 5 3.8 6.8 2 8 3.2 6.2 5 8 6.8 6.8 8 5 6.2 3.2 8 2 6.8 3.8 5Z',
  plus: 'M3.9 1.4H6.1V3.9H8.6V6.1H6.1V8.6H3.9V6.1H1.4V3.9H3.9Z',
  sechseck: vieleck(6, 4, null, 0),
  ring: 'M5 1.2a3.8 3.8 0 1 0 .001 0ZM5 3.2a1.8 1.8 0 1 1-.001 0Z',
  streifen: 'M1.5 1.8h7v1.6h-7zM1.5 4.2h7v1.6h-7zM1.5 6.6h7v1.6h-7z',
});

const NAMEN_SYMBOLE = ['kreis', 'dreieck', 'quadrat', 'raute', 'stern', 'kreuz', 'plus', 'sechseck', 'ring', 'streifen'];

export const PALETTEN = Object.freeze({
  standard: [
    ['Koralle', '#d9675b'], ['Orange', '#e39b4c'], ['Gelb', '#e3c454'], ['Grün', '#79ad66'],
    ['Türkis', '#4aa39b'], ['Blau', '#5b8fd6'], ['Violett', '#9a78c9'], ['Rosa', '#d987b4'],
    ['Braun', '#9c7656'], ['Schiefer', '#7c8794'],
  ],
  farbenblind: [
    ['Orange', '#e69f00'], ['Himmelblau', '#56b4e9'], ['Blaugrün', '#009e73'], ['Gelb', '#f0e442'],
    ['Blau', '#0072b2'], ['Zinnober', '#d55e00'], ['Purpur', '#cc79a7'], ['Grau', '#999999'],
    ['Dunkelbraun', '#6b3e26'], ['Hellgrün', '#a6d96a'],
  ],
});

/** Farbliste einer Palette: [{ id, wert, symbol, name }] */
export function farbListe(palette = 'standard') {
  const p = PALETTEN[palette] || PALETTEN.standard;
  return p.map(([name, wert], id) => ({ id, wert, name, symbol: NAMEN_SYMBOLE[id] }));
}

/** Setzt die CSS-Variablen der aktuellen Palette auf <html>. */
export function wendeFarbenAn(palette, html = document.documentElement) {
  for (const f of farbListe(palette)) html.style.setProperty(`--spielfarbe-${f.id}`, f.wert);
}

/** ctx.farben für ein Spiel */
export function erstelleFarben(einstellungen) {
  return {
    get liste() { return farbListe(einstellungen.wert('palette')); },
    anzahl: NAMEN_SYMBOLE.length,
    /** CSS-Wert für Farbe id, z. B. fill="var(--spielfarbe-3)" */
    css: (id) => `var(--spielfarbe-${id})`,
    /** SVG-Pfad (viewBox 0 0 10 10) des Symbols zu Farbe id */
    symbolPfad: (id) => SYMBOLE[NAMEN_SYMBOLE[id % NAMEN_SYMBOLE.length]],
    /** Sollen Symbole gezeigt werden? */
    musterAn: () => einstellungen.wert('muster') || einstellungen.wert('palette') === 'farbenblind',
    /** fn() bei Palette- oder Musterwechsel; liefert Abmelde-Funktion */
    beobachte: (fn) => einstellungen.beobachte((k) => { if (k === 'palette' || k === 'muster') fn(); }),
  };
}
