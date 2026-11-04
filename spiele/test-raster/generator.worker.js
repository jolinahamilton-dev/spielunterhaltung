// Erzeugt Lichter-Rätsel im Hintergrund (prüft die Worker-Anbindung des Grundgerüsts).
import { bedieneAuftraege } from '../../kern/worker-dienst.js';
import { erzeuge } from './logik.js';

bedieneAuftraege({
  erzeuge: ({ n, seed }) => erzeuge(n, seed),
});
