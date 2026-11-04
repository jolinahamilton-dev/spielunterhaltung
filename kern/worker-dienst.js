// Gegenstück zu worker-helfer.js – läuft im Worker.
// bedieneAuftraege({ name: async (daten) => ergebnis, … })

export function bedieneAuftraege(auftraege) {
  self.addEventListener('message', async (e) => {
    const { id, auftrag, daten } = e.data || {};
    const fn = auftraege[auftrag];
    if (!fn) {
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
