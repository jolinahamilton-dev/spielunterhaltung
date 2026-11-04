// Stau auflösen: Level erzeugen und Hinweise berechnen im Hintergrund.
import { bedieneAuftraege } from '../../kern/worker-dienst.js';
import { erzeugeLevel, hinweis, pruefeLevel } from './logik.js';

bedieneAuftraege({
  erzeuge: ({ variante, nr }) => erzeugeLevel(variante, nr),
  hinweis: ({ level, pos }) => {
    const l = pruefeLevel(level);
    return l ? hinweis(l, pos) : null;
  },
});
