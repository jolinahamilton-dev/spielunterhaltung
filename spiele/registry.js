// Alle Spiele mit Kachel-Daten. Module werden erst geladen, wenn das Spiel geöffnet wird.
// laden: null → „Kommt bald“. entwicklung: true → nur auf localhost oder mit ?dev sichtbar.

import { SPIEL_SYMBOLE } from '../kern/symbole.js';

export const SPIELE = [
  {
    id: 'sudoku', name: 'Sudoku', symbol: SPIEL_SYMBOLE.sudoku,
    beschreibung: 'Ziffern 1–9 in jede Zeile, Spalte und jeden Block.',
    laden: () => import('./sudoku/index.js'),
  },
  {
    id: 'farben-sortieren', name: 'Farben sortieren', symbol: SPIEL_SYMBOLE['farben-sortieren'],
    beschreibung: 'Farbschichten umgießen, bis jede Röhre einfarbig ist.',
    laden: () => import('./farben-sortieren/index.js'),
  },
  {
    id: 'block-puzzle', name: 'Block-Puzzle', symbol: SPIEL_SYMBOLE['block-puzzle'],
    beschreibung: 'Formen auf das Feld legen, volle Reihen verschwinden.',
    laden: () => import('./block-puzzle/index.js'),
    kachelText(speicher) {
      const r = speicher.lies('rekorde', {}) || {};
      const best = Math.max(r.klassisch || 0, r.entspannt || 0);
      return best ? `Rekord ${best.toLocaleString('de-DE')}` : '';
    },
  },
  {
    id: 'stau', name: 'Stau auflösen', symbol: SPIEL_SYMBOLE.stau,
    beschreibung: 'Fahrzeuge verschieben, bis der Weg frei ist.',
    laden: () => import('./stau/index.js'),
  },
  {
    id: 'minesweeper', name: 'Minesweeper', symbol: SPIEL_SYMBOLE.minesweeper,
    beschreibung: 'Minen finden mit Logik – auch auf unendlichem Feld.',
    laden: () => import('./minesweeper/index.js'),
  },
  {
    id: 'nonogramm', name: 'Nonogramm', symbol: SPIEL_SYMBOLE.nonogramm,
    beschreibung: 'Zahlen am Rand verraten, welche Felder ein Bild ergeben.',
    laden: () => import('./nonogramm/index.js'),
  },
  {
    id: 'bild-abtragen', name: 'Bild abtragen', symbol: SPIEL_SYMBOLE['bild-abtragen'],
    beschreibung: 'Farbige Sammler tragen ein Pixelbild Stück für Stück ab.',
    laden: () => import('./bild-abtragen/index.js'),
  },
  {
    id: 'rechenkreuz', name: 'Rechenkreuz', symbol: SPIEL_SYMBOLE.rechenkreuz,
    beschreibung: 'Rechenaufgaben kreuz und quer – jede Zahl muss in beide Richtungen passen.',
    laden: () => import('./rechenkreuz/index.js'),
  },
  {
    id: 'sechseck-stapel', name: 'Sechseck-Stapel', symbol: SPIEL_SYMBOLE['sechseck-stapel'],
    beschreibung: 'Stapel ablegen, gleiche Farben wandern zusammen und lösen sich auf.',
    laden: () => import('./sechseck-stapel/index.js'),
    kachelText(speicher) {
      const r = speicher.lies('rekorde', {}) || {};
      const best = Math.max(0, ...Object.values(r).filter(Number.isFinite));
      return best ? `Rekord ${best.toLocaleString('de-DE')}` : '';
    },
  },
  {
    id: 'wortsuche', name: 'Wortsuche', symbol: SPIEL_SYMBOLE.wortsuche,
    beschreibung: 'Versteckte Wörter im Buchstabengitter finden.',
    laden: () => import('./wortsuche/index.js'),
  },
  {
    id: 'malen-nach-zahlen', name: 'Malen nach Zahlen', symbol: SPIEL_SYMBOLE['malen-nach-zahlen'],
    beschreibung: 'Feld für Feld ein Bild ausmalen – jede Zahl hat ihre Farbe.',
    laden: () => import('./malen-nach-zahlen/index.js'),
  },
  {
    id: 'punkte-verbinden', name: 'Punkte verbinden', symbol: SPIEL_SYMBOLE['punkte-verbinden'],
    beschreibung: 'Gleichfarbige Punkte zu Ketten verbinden und Ziele sammeln.',
    laden: () => import('./punkte-verbinden/index.js'),
    kachelText(speicher) {
      const r = speicher.lies('rekord', 0);
      return Number.isInteger(r) && r > 0 ? `Rekord ${r.toLocaleString('de-DE')}` : '';
    },
  },
  {
    id: 'schrauben', name: 'Schrauben', symbol: SPIEL_SYMBOLE.schrauben,
    beschreibung: 'Schrauben lösen, Bretter fallen lassen, Kisten füllen.',
    laden: () => import('./schrauben/index.js'),
  },
  {
    id: 'schachtbetrieb', name: 'Schachtbetrieb', symbol: SPIEL_SYMBOLE.schachtbetrieb,
    beschreibung: 'Bergwerk ausbauen: Schächte, Aufzug und Verkaufszentrum verbessern.',
    laden: () => import('./schachtbetrieb/index.js'),
  },
  {
    id: 'lichtstrahlen', name: 'Lichtstrahlen', symbol: SPIEL_SYMBOLE.lichtstrahlen,
    beschreibung: 'Spiegel drehen, bis jeder Lichtstrahl sein Ziel trifft.',
    laden: () => import('./lichtstrahlen/index.js'),
  },
  {
    id: 'hafen', name: 'Hafen', symbol: SPIEL_SYMBOLE.hafen,
    beschreibung: 'Schiffe laufen ein, Kräne laden aus – den kleinen Hafen in Ruhe ausbauen.',
    laden: () => import('./hafen/index.js'),
  },
  {
    id: 'solitaer', name: 'Solitär', symbol: SPIEL_SYMBOLE.solitaer,
    beschreibung: 'Karten nach Farbe und Reihenfolge ordnen – klassische Patience.',
    laden: () => import('./solitaer/index.js'),
  },
  {
    id: 'test-raster', name: 'Lichter (Test)', symbol: SPIEL_SYMBOLE.test, entwicklung: true,
    beschreibung: 'Prüfspiel für das Grundgerüst: alle Felder ausschalten.',
    laden: () => import('./test-raster/index.js'),
  },
];

export function entwicklungsModus(ort = location) {
  return ort.hostname === 'localhost' || ort.hostname === '127.0.0.1' || new URLSearchParams(ort.search).has('dev');
}

export function sichtbareSpiele(ort = location) {
  const dev = entwicklungsModus(ort);
  return SPIELE.filter((s) => dev || !s.entwicklung);
}

export const findeSpiel = (id) => SPIELE.find((s) => s.id === id) || null;
