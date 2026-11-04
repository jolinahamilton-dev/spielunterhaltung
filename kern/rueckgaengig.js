// Rückgängig/Wiederholen-Verlauf. Gespeichert werden kleine Züge (Diffs), keine Komplettkopien.
// Der Verlauf ist Teil des Spielstands (toJSON / ladeVerlauf), damit Rückgängig auch nach einem
// Neustart der App funktioniert.

export function erstelleVerlauf({ max = 500, zurueck = [], vor = [] } = {}) {
  let rueck = zurueck.slice(-max);
  let wieder = vor.slice(-max);

  return {
    /** Neuen Zug merken – Wiederholen-Liste verfällt */
    merke(zug) {
      rueck.push(zug);
      if (rueck.length > max) rueck.shift();
      wieder = [];
    },
    /** Letzten Zug zurücknehmen → der Zug (zum Umkehren) oder null */
    zurueck() {
      const zug = rueck.pop();
      if (zug === undefined) return null;
      wieder.push(zug);
      return zug;
    },
    /** Zurückgenommenen Zug wiederholen → der Zug oder null */
    vor() {
      const zug = wieder.pop();
      if (zug === undefined) return null;
      rueck.push(zug);
      return zug;
    },
    kannZurueck: () => rueck.length > 0,
    kannVor: () => wieder.length > 0,
    anzahl: () => rueck.length,
    leeren() { rueck = []; wieder = []; },
    toJSON: () => ({ zurueck: rueck.slice(), vor: wieder.slice() }),
  };
}

/** Verlauf aus gespeichertem toJSON()-Ergebnis wiederherstellen (fehlerhaft → leer) */
export function ladeVerlauf(daten, { max = 500 } = {}) {
  const ok = daten && Array.isArray(daten.zurueck) && Array.isArray(daten.vor);
  return erstelleVerlauf({ max, zurueck: ok ? daten.zurueck : [], vor: ok ? daten.vor : [] });
}
