// Erzeugt Sudoku-Rätsel im Hintergrund. Grenze sind Rechenschritte (deterministisch);
// die Zeit dient nur als Notbremse. Verfehlt Experte die Zielstufe, hilft vorrat.json aus.
import { bedieneAuftraege } from '../../kern/worker-dienst.js';
import { erzeuge, pruefeRaetsel } from './logik.js';
import { erstelleZufall } from '../../kern/zufall.js';

const NOTBREMSE_MS = 10000;

async function ausVorratsDatei(stufe, seed) {
  try {
    const antwort = await fetch(new URL('./vorrat.json', import.meta.url));
    const daten = await antwort.json();
    const liste = (Array.isArray(daten?.[stufe]) ? daten[stufe] : []).filter((r) => r && r.stufe === stufe);
    if (!liste.length) return null;
    const r = erstelleZufall(`vorrat:${seed}`).wahl(liste);
    return pruefeRaetsel(r) ? { ...r, seed: `vorrat-${r.seed}` } : null;
  } catch {
    return null;
  }
}

bedieneAuftraege({
  async erzeuge({ stufe, seed }) {
    const ende = Date.now() + NOTBREMSE_MS;
    const r = erzeuge(stufe, seed, { notbremse: () => Date.now() > ende });
    if (r && r.erreicht === r.ziel) return r;
    const ersatz = await ausVorratsDatei(stufe, seed);
    if (ersatz) return ersatz;
    if (r) return r;
    throw new Error('Kein Rätsel gefunden');
  },
});
