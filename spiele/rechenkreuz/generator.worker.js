// Erzeugt Rechenkreuz-Rätsel im Hintergrund (Layout, Werte, Eindeutigkeitsprüfung).
import { bedieneAuftraege } from '../../kern/worker-dienst.js';
import { erzeugeRaetsel } from './logik.js';

bedieneAuftraege({
  erzeuge: ({ stufe, level, seed }) => erzeugeRaetsel({ stufe, level, seed }),
});
