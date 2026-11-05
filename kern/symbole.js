// Feste SVG-Symbole der Oberfläche (24×24, Linienstil, Farbe über currentColor).

const svg = (inhalt) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inhalt}</svg>`;

export const ICONS = Object.freeze({
  zurueck: svg('<path d="M15 5l-7 7 7 7"/>'),
  neu: svg('<path d="M12 5v14M5 12h14"/>'),
  rueckgaengig: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  wiederholen: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  hinweis: svg('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>'),
  einstellungen: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  statistik: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>'),
  schliessen: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  auswahl: svg('<path d="M7 10l5 5 5-5"/>'),
});

/** Spiel-Symbole für die Kacheln (48×48, gefüllt mit Akzent-/Spielfarben) */
const kachel = (inhalt) => `<svg viewBox="0 0 48 48" width="48" height="48">${inhalt}</svg>`;

export const SPIEL_SYMBOLE = Object.freeze({
  sudoku: kachel(`
    <rect x="4" y="4" width="40" height="40" rx="6" fill="none" stroke="currentColor" stroke-width="2.5"/>
    <path d="M17.3 4v40M30.7 4v40M4 17.3h40M4 30.7h40" stroke="currentColor" stroke-width="1.5" opacity=".55"/>
    <text x="10.6" y="15" font-size="10" text-anchor="middle" fill="var(--akzent)" font-family="system-ui" font-weight="700">5</text>
    <text x="24" y="28.4" font-size="10" text-anchor="middle" fill="currentColor" font-family="system-ui" font-weight="700">3</text>
    <text x="37.4" y="41.8" font-size="10" text-anchor="middle" fill="var(--akzent)" font-family="system-ui" font-weight="700">8</text>`),
  'farben-sortieren': kachel(`
    <g stroke="currentColor" stroke-width="2.2" fill="none"><path d="M9 6v32a6 6 0 0 0 12 0V6"/><path d="M27 6v32a6 6 0 0 0 12 0V6"/></g>
    <path d="M10.2 30h9.6v8a4.8 4.8 0 0 1-9.6 0z" fill="var(--spielfarbe-4)"/>
    <path d="M10.2 21h9.6v9h-9.6z" fill="var(--spielfarbe-0)"/>
    <path d="M28.2 30h9.6v8a4.8 4.8 0 0 1-9.6 0z" fill="var(--spielfarbe-0)"/>
    <path d="M28.2 21h9.6v9h-9.6z" fill="var(--spielfarbe-4)"/>`),
  'block-puzzle': kachel(`
    <g fill="var(--spielfarbe-5)"><rect x="6" y="6" width="11" height="11" rx="2"/><rect x="6" y="18.5" width="11" height="11" rx="2"/><rect x="18.5" y="18.5" width="11" height="11" rx="2"/></g>
    <g fill="var(--spielfarbe-2)"><rect x="18.5" y="31" width="11" height="11" rx="2"/><rect x="31" y="31" width="11" height="11" rx="2"/><rect x="31" y="18.5" width="11" height="11" rx="2"/></g>`),
  stau: kachel(`
    <rect x="4" y="4" width="40" height="40" rx="6" fill="none" stroke="currentColor" stroke-width="2.2"/>
    <rect x="8" y="19" width="20" height="10" rx="3" fill="var(--spielfarbe-0)"/>
    <rect x="31" y="8" width="9" height="20" rx="3" fill="var(--spielfarbe-5)"/>
    <rect x="12" y="33" width="24" height="7" rx="3" fill="var(--spielfarbe-3)"/>
    <path d="M44 20v8" stroke="var(--hg)" stroke-width="4"/>`),
  minesweeper: kachel(`
    <g stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M24 7v34M7 24h34M12 12l24 24M36 12L12 36"/></g>
    <circle cx="24" cy="24" r="10" fill="currentColor"/><circle cx="20.5" cy="20.5" r="2.6" fill="var(--hg)"/>`),
  nonogramm: kachel(`
    <g fill="currentColor" opacity=".55" font-family="system-ui" font-size="7" font-weight="700"><text x="4" y="25">2</text><text x="4" y="34">3</text><text x="4" y="43">1</text></g>
    <g fill="var(--akzent)"><rect x="12" y="19" width="7.5" height="7.5" rx="1.2"/><rect x="21" y="19" width="7.5" height="7.5" rx="1.2"/>
    <rect x="21" y="28" width="7.5" height="7.5" rx="1.2"/><rect x="30" y="28" width="7.5" height="7.5" rx="1.2"/><rect x="39" y="28" width="7.5" height="7.5" rx="1.2"/>
    <rect x="30" y="37" width="7.5" height="7.5" rx="1.2"/></g>
    <rect x="12" y="19" width="34.5" height="25.5" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".5"/>`),
  test: kachel(`
    <g fill="var(--akzent)"><rect x="6" y="6" width="10" height="10" rx="2"/><rect x="32" y="6" width="10" height="10" rx="2"/><rect x="19" y="19" width="10" height="10" rx="2"/><rect x="6" y="32" width="10" height="10" rx="2"/></g>
    <g fill="none" stroke="currentColor" stroke-width="1.6" opacity=".55"><rect x="19" y="6" width="10" height="10" rx="2"/><rect x="6" y="19" width="10" height="10" rx="2"/><rect x="32" y="19" width="10" height="10" rx="2"/><rect x="19" y="32" width="10" height="10" rx="2"/><rect x="32" y="32" width="10" height="10" rx="2"/></g>`),
});
