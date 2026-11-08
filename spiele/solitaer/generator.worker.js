// Mischt lösbare Spiele und berechnet Hinweise im Hintergrund (Schritt-Budgets, keine Zeit).
import { bedieneAuftraege } from '../../kern/worker-dienst.js';
import { erzeuge, hinweisFuer } from './logik.js';

bedieneAuftraege({
  erzeuge: ({ stufe, seed }) => erzeuge(stufe, seed),
  hinweis: ({ z }) => hinweisFuer(z),
});
