// Erzeugt „ohne Raten“-Felder im Hintergrund (Löser mit Schritt-Budget, siehe loeser.js).
import { bedieneAuftraege } from '../../kern/worker-dienst.js';
import { erzeugeOhneRaten } from './loeser.js';

bedieneAuftraege({
  erzeuge: ({ b, h, anzahl, seed, start }) => erzeugeOhneRaten({ b, h, anzahl, seed, start }),
});
