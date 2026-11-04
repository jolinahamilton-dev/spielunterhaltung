// Farben sortieren – Level erzeugen und Hinweise berechnen (im Hintergrund).
import { bedieneAuftraege } from '../../kern/worker-dienst.js';
import { erzeugeLevel, loeseBest, BUDGET } from './logik.js';

bedieneAuftraege({
  erzeuge: ({ stufe, nr }) => erzeugeLevel(stufe, nr),

  // zustaende[0] = aktuell, zustaende[i] = nach i-mal Rückgängig.
  // → { schritte: i, zug, laenge, optimal } für den ersten lösbaren Zustand, sonst { schritte: -1 }
  hinweis: ({ kapazitaet, zustaende }) => {
    for (let i = 0; i < zustaende.length; i++) {
      const budget = i === 0 ? BUDGET.hinweis : BUDGET.sackgasse;
      const r = loeseBest(zustaende[i], kapazitaet, { budget, budgetGewichtet: budget });
      if (r.status === 'geloest') {
        return { schritte: i, zug: r.zuege[0] ?? null, laenge: r.zuege.length, optimal: r.optimal };
      }
    }
    return { schritte: -1 };
  },
});
