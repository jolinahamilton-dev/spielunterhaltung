// Web-Worker-Anbindung mit Aufträgen und Promises.
// Seite:  const w = erstelleWorker(url); const ergebnis = await w.rufe('erzeuge', { stufe: 2 });
// Worker: import { bedieneAuftraege } from '../../kern/worker-dienst.js';
//         bedieneAuftraege({ erzeuge: (daten) => … });

/**
 * @param {string|URL} url        Pfad zum Modul-Worker
 * @param {object} [optionen]
 * @param {AbortSignal} [optionen.signal]           beendet den Worker (z. B. beim Spielwechsel)
 * @param {(wartet:boolean)=>void} [optionen.beiWarten]  für die Anzeige „wird vorbereitet …“
 */
export function erstelleWorker(url, { signal, beiWarten = () => {} } = {}) {
  const worker = new Worker(url, { type: 'module' });
  const offen = new Map();
  let naechsteId = 1;
  let beendet = false;

  const warteStatus = () => beiWarten(offen.size > 0);

  worker.addEventListener('message', (e) => {
    const { id, ergebnis, fehler } = e.data || {};
    const auftrag = offen.get(id);
    if (!auftrag) return;
    offen.delete(id);
    warteStatus();
    if (fehler) auftrag.ablehnen(new Error(fehler));
    else auftrag.erfuellen(ergebnis);
  });

  worker.addEventListener('error', (e) => {
    const f = new Error(`Worker-Fehler: ${e.message || 'unbekannt'}`);
    for (const a of offen.values()) a.ablehnen(f);
    offen.clear();
    warteStatus();
  });

  const beende = () => {
    if (beendet) return;
    beendet = true;
    worker.terminate();
    const f = new DOMException('Abgebrochen', 'AbortError');
    for (const a of offen.values()) a.ablehnen(f);
    offen.clear();
    warteStatus();
  };
  signal?.addEventListener('abort', beende, { once: true });

  return {
    /** Auftrag senden → Promise mit dem Ergebnis */
    rufe(auftrag, daten, transfer = []) {
      if (beendet) return Promise.reject(new DOMException('Abgebrochen', 'AbortError'));
      const id = naechsteId++;
      return new Promise((erfuellen, ablehnen) => {
        offen.set(id, { erfuellen, ablehnen });
        warteStatus();
        worker.postMessage({ id, auftrag, daten }, transfer);
      });
    },
    beende,
  };
}
