// Gegenstück zu worker-helfer.js – läuft im Worker.
// bedieneAuftraege({ name: async (daten) => ergebnis, … })

export function bedieneAuftraege(auftraege) {
  self.addEventListener('message', async (e) => {
    const { id, auftrag, daten } = e.data || {};
    // nur eigene Aufträge – keine geerbten Eigenschaften wie „constructor“
    const fn = typeof auftrag === 'string' && Object.hasOwn(auftraege, auftrag) ? auftraege[auftrag] : null;
    if (typeof fn !== 'function') {
      self.postMessage({ id, fehler: `Unbekannter Auftrag „${auftrag}“` });
      return;
    }
    try {
      const ergebnis = await fn(daten);
      self.postMessage({ id, ergebnis });
    } catch (f) {
      self.postMessage({ id, fehler: f?.message || String(f) });
    }
  });
}
