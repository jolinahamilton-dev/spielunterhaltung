// Statistik pro Spiel und Variante: gespielt, gelöst, aktuelle Serie, beste Serie.
// Bewusst ohne Zeiten (die App hat keinen Timer).

const LEER = () => ({ gespielt: 0, geloest: 0, serie: 0, besteSerie: 0, hinweise: 0 });

/** @param {ReturnType<import('./speicher.js').erstelleSpeicher>} speicher */
export function erstelleStatistik(speicher) {
  const lies = () => speicher.lies('statistik', {}) || {};

  return {
    /**
     * @param {string} spielId
     * @param {{ typ: 'gestartet'|'geloest'|'aufgegeben'|'hinweis', variante?: string }} ereignis
     */
    melde(spielId, { typ, variante = 'standard' }) {
      const alle = lies();
      const spiel = (alle[spielId] ||= {});
      const e = (spiel[variante] ||= LEER());
      switch (typ) {
        case 'gestartet': e.gespielt++; break;
        case 'geloest':
          e.geloest++;
          e.serie++;
          e.besteSerie = Math.max(e.besteSerie, e.serie);
          break;
        case 'aufgegeben': e.serie = 0; break;
        case 'hinweis': e.hinweise++; break;
        default: return;
      }
      speicher.schreibe('statistik', alle);
    },
    /** @returns {{ gesamt: ReturnType<LEER>, varianten: Record<string, ReturnType<LEER>> }} */
    fuer(spielId) {
      const varianten = lies()[spielId] || {};
      const gesamt = LEER();
      for (const e of Object.values(varianten)) {
        gesamt.gespielt += e.gespielt;
        gesamt.geloest += e.geloest;
        gesamt.hinweise += e.hinweise;
        gesamt.besteSerie = Math.max(gesamt.besteSerie, e.besteSerie);
        gesamt.serie = Math.max(gesamt.serie, e.serie);
      }
      return { gesamt, varianten };
    },
    zuruecksetzen(spielId) {
      const alle = lies();
      delete alle[spielId];
      speicher.schreibe('statistik', alle);
    },
  };
}
