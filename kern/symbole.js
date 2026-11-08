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
  'bild-abtragen': kachel(`
    <g fill="var(--spielfarbe-0)"><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="20" y="4" width="6" height="6" rx="1"/><rect x="8" y="10" width="6" height="6" rx="1"/><rect x="14" y="10" width="6" height="6" rx="1"/></g>
    <g fill="var(--spielfarbe-3)"><rect x="26" y="10" width="6" height="6" rx="1"/><rect x="32" y="16" width="6" height="6" rx="1"/><rect x="26" y="16" width="6" height="6" rx="1"/></g>
    <g fill="var(--spielfarbe-2)"><rect x="8" y="16" width="6" height="6" rx="1"/><rect x="14" y="16" width="6" height="6" rx="1"/><rect x="20" y="16" width="6" height="6" rx="1"/></g>
    <g fill="none" stroke="currentColor" stroke-width="1.4" opacity=".45"><rect x="20" y="10" width="6" height="6" rx="1"/><rect x="32" y="10" width="6" height="6" rx="1"/></g>
    <rect x="6" y="32" width="10" height="10" rx="2.5" fill="var(--spielfarbe-0)"/><rect x="19" y="32" width="10" height="10" rx="2.5" fill="var(--spielfarbe-3)"/><rect x="32" y="32" width="10" height="10" rx="2.5" fill="var(--spielfarbe-2)"/>
    <path d="M24 30v-4M11 30v-4M37 30v-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>`),
  rechenkreuz: kachel(`
    <g fill="none" stroke="currentColor" stroke-width="1.6" opacity=".5"><rect x="4" y="4" width="11" height="11" rx="2"/><rect x="33" y="4" width="11" height="11" rx="2"/><rect x="4" y="33" width="11" height="11" rx="2"/><rect x="33" y="33" width="11" height="11" rx="2"/></g>
    <rect x="18.5" y="4" width="11" height="11" rx="2" fill="var(--akzent)"/><rect x="4" y="18.5" width="11" height="11" rx="2" fill="var(--akzent)"/><rect x="33" y="18.5" width="11" height="11" rx="2" fill="var(--akzent)"/><rect x="18.5" y="33" width="11" height="11" rx="2" fill="var(--akzent)"/>
    <g font-family="system-ui" font-weight="700" font-size="9" text-anchor="middle" fill="currentColor"><text x="24" y="27">+</text><text x="9.5" y="12.5">3</text><text x="38.5" y="12.5">7</text><text x="9.5" y="41.5">=</text><text x="38.5" y="41.5">×</text></g>`),
  'sechseck-stapel': kachel(`
    <path d="M24 4l8 4.6v9.2L24 22.4l-8-4.6V8.6z" fill="var(--spielfarbe-5)"/>
    <path d="M24 9l8 4.6v9.2L24 27.4l-8-4.6v-9.2z" fill="var(--spielfarbe-5)" opacity=".75"/>
    <path d="M12 25l8 4.6v9.2L12 43.4l-8-4.6v-9.2z" fill="var(--spielfarbe-0)"/>
    <path d="M36 25l8 4.6v9.2L36 43.4l-8-4.6v-9.2z" fill="var(--spielfarbe-2)"/>
    <path d="M24 32l8 4.6v9.2L24 50.4l-8-4.6v-9.2z" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".45"/>`),
  'punkte-verbinden': kachel(`
    <circle cx="11" cy="12" r="5.5" fill="var(--akzent)"/>
    <circle cx="24" cy="12" r="5.5" fill="var(--akzent)"/>
    <circle cx="37" cy="12" r="5.5" fill="var(--akzent)"/>
    <circle cx="37" cy="25" r="5.5" fill="var(--akzent)"/>
    <path d="M11 12H37V25" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="11" cy="37" r="5.5" fill="currentColor" opacity=".45"/>
    <circle cx="24" cy="30" r="5.5" fill="currentColor" opacity=".45"/>
    <circle cx="37" cy="40" r="5.5" fill="currentColor" opacity=".45"/>`),
  schrauben: kachel(`
    <rect x="4" y="8" width="40" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2.2" opacity=".5"/>
    <circle cx="13" cy="15" r="4" fill="var(--akzent)"/>
    <circle cx="35" cy="15" r="4" fill="currentColor" opacity=".45"/>
    <g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="24" cy="34" r="8.5"/><path d="M24 28.5v11M18.5 34h11"/></g>`),
  schachtbetrieb: kachel(`
    <rect x="5" y="5" width="38" height="8" rx="2" fill="var(--akzent)"/>
    <path d="M13 13v31" stroke="currentColor" stroke-width="2.2" opacity=".5"/>
    <rect x="8" y="22" width="10" height="9" rx="2" fill="var(--akzent)"/>
    <path d="M22 24h20M22 36h20" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".5"/>
    <rect x="33" y="18" width="9" height="6" rx="1.5" fill="var(--spielfarbe-2)"/>
    <rect x="33" y="30" width="9" height="6" rx="1.5" fill="var(--spielfarbe-2)"/>`),
  lichtstrahlen: kachel(`
    <rect x="4" y="4" width="40" height="40" rx="6" fill="none" stroke="currentColor" stroke-width="2.5"/>
    <path d="M8 14H34L34 38" fill="none" stroke="var(--akzent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M28 8 40 20" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="34" cy="38" r="4.5" fill="none" stroke="currentColor" stroke-width="2.2"/>
    <circle cx="8" cy="14" r="2.6" fill="var(--akzent)"/>`),
  hafen: kachel(`
    <path d="M9 40 12 14h8l3 26z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M11 24h10M10 32h12" stroke="currentColor" stroke-width="2" opacity=".6"/>
    <path d="M11 14 16 6l5 8" fill="none" stroke="var(--akzent)" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M26 34h18l-3.5 7h-11z" fill="var(--akzent)"/>
    <path d="M35 34V22l7 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M3 45c4-2 7 2 11 0s7 2 11 0 7 2 11 0 7 2 9 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".5"/>`),
  solitaer: kachel(`
    <rect x="5" y="9" width="21" height="30" rx="3.5" fill="var(--spielfarbe-4)"/>
    <g transform="rotate(14 31 26)"><rect x="19" y="7" width="21" height="31" rx="3.5" fill="#fdfbf6" stroke="currentColor" stroke-width="1.6"/>
    <path d="M29.5 31.5C26.2 29 25.2 27.5 25.2 26.2a2.3 2.3 0 0 1 4.3-1.1 2.3 2.3 0 0 1 4.3 1.1c0 1.3-1 2.8-4.3 5.3Z" fill="var(--spielfarbe-0)"/>
    <text x="23.5" y="16.5" font-size="8" fill="var(--spielfarbe-0)" font-family="system-ui" font-weight="700">A</text></g>`),
  wortsuche: kachel(`
    <g font-family="system-ui" font-weight="700" font-size="9" text-anchor="middle" fill="currentColor" opacity=".55">
      <text x="9" y="13">K</text><text x="20" y="13">A</text><text x="31" y="13">T</text><text x="42" y="13">Z</text>
      <text x="9" y="26">O</text><text x="20" y="26">P</text><text x="31" y="26">E</text><text x="42" y="26">L</text>
      <text x="9" y="39">B</text><text x="20" y="39">A</text><text x="31" y="39">U</text><text x="42" y="39">M</text></g>
    <rect x="3" y="2" width="44" height="15" rx="7.5" fill="var(--akzent)" opacity=".28"/>
    <rect x="3" y="28" width="33" height="15" rx="7.5" fill="var(--spielfarbe-2)" opacity=".4"/>
    <g font-family="system-ui" font-weight="700" font-size="9" text-anchor="middle" fill="currentColor"><text x="9" y="13">K</text><text x="20" y="13">A</text><text x="31" y="13">T</text><text x="42" y="13">Z</text><text x="9" y="39">B</text><text x="20" y="39">A</text><text x="31" y="39">U</text></g>`),
  'malen-nach-zahlen': kachel(`
    <g font-family="system-ui" font-weight="700" font-size="7.5" text-anchor="middle" fill="currentColor" opacity=".5">
      <text x="30" y="11">2</text><text x="40" y="11">2</text><text x="40" y="21">1</text><text x="30" y="31">3</text><text x="40" y="31">3</text><text x="40" y="41">3</text></g>
    <g fill="none" stroke="currentColor" stroke-width="1" opacity=".35"><rect x="5" y="4" width="40" height="40" rx="3"/><path d="M15 4v40M25 4v40M35 4v40M5 14h40M5 24h40M5 34h40"/></g>
    <rect x="5" y="4" width="20" height="10" fill="var(--spielfarbe-5)"/><rect x="5" y="14" width="30" height="10" fill="var(--spielfarbe-2)"/>
    <rect x="5" y="24" width="20" height="10" fill="var(--spielfarbe-3)"/><rect x="5" y="34" width="10" height="10" fill="var(--spielfarbe-3)"/>`),
  test: kachel(`
    <g fill="var(--akzent)"><rect x="6" y="6" width="10" height="10" rx="2"/><rect x="32" y="6" width="10" height="10" rx="2"/><rect x="19" y="19" width="10" height="10" rx="2"/><rect x="6" y="32" width="10" height="10" rx="2"/></g>
    <g fill="none" stroke="currentColor" stroke-width="1.6" opacity=".55"><rect x="19" y="6" width="10" height="10" rx="2"/><rect x="6" y="19" width="10" height="10" rx="2"/><rect x="32" y="19" width="10" height="10" rx="2"/><rect x="19" y="32" width="10" height="10" rx="2"/><rect x="32" y="32" width="10" height="10" rx="2"/></g>`),
});
