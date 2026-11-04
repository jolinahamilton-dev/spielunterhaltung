// Erzeugt Zufalls-Nonogramme im Hintergrund (eindeutig und ohne Raten lösbar, Schritt-Budget).
import { bedieneAuftraege } from '../../kern/worker-dienst.js';
import { erzeuge } from './logik.js';

bedieneAuftraege({
  erzeuge: ({ b, h, seed }) => erzeuge(b, h, seed),
});
