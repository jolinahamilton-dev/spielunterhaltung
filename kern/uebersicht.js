// Reihenfolge der Spiele auf der Startseite: Standard, Zuletzt benutzt oder eigene Anordnung.
// Reine Funktionen (ohne DOM) + Speicherung im Schlüssel „uebersicht“.

export const MODI = Object.freeze(['standard', 'zuletzt', 'eigene']);

/** Gespeicherte Daten prüfen; unbekannte Spiele und Unsinn fliegen raus */
export function bereinige(roh, ids) {
  const erlaubt = new Set(ids);
  const daten = { modus: 'standard', reihenfolge: [], zuletzt: {} };
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return daten;
  if (MODI.includes(roh.modus)) daten.modus = roh.modus;
  if (Array.isArray(roh.reihenfolge)) {
    for (const id of roh.reihenfolge) {
      if (typeof id === 'string' && erlaubt.has(id) && !daten.reihenfolge.includes(id)) daten.reihenfolge.push(id);
    }
  }
  if (roh.zuletzt && typeof roh.zuletzt === 'object' && !Array.isArray(roh.zuletzt)) {
    for (const id of Object.keys(roh.zuletzt)) {
      const t = roh.zuletzt[id];
      if (erlaubt.has(id) && Number.isFinite(t) && t > 0) daten.zuletzt[id] = t;
    }
  }
  return daten;
}

/** Spiele nach Modus sortieren (stabil: bei Gleichstand gilt die Standardreihenfolge) */
export function ordne(spiele, daten) {
  const index = new Map(spiele.map((s, i) => [s.id, i]));
  const kopie = spiele.slice();
  if (daten.modus === 'zuletzt') {
    return kopie.sort((a, b) => (daten.zuletzt[b.id] || 0) - (daten.zuletzt[a.id] || 0) || index.get(a.id) - index.get(b.id));
  }
  if (daten.modus === 'eigene') {
    const platz = new Map(daten.reihenfolge.map((id, i) => [id, i]));
    // Neue (noch nicht einsortierte) Spiele stehen hinten in Standardreihenfolge
    return kopie.sort((a, b) => (platz.has(a.id) ? platz.get(a.id) : 1e6 + index.get(a.id))
      - (platz.has(b.id) ? platz.get(b.id) : 1e6 + index.get(b.id)));
  }
  return kopie;
}

/** Eine Id in der Liste um einen Platz verschieben (richtung -1 = nach vorn, +1 = nach hinten) */
export function verschiebe(ids, id, richtung) {
  const liste = ids.slice();
  const von = liste.indexOf(id);
  const nach = von + richtung;
  if (von < 0 || nach < 0 || nach >= liste.length) return liste;
  [liste[von], liste[nach]] = [liste[nach], liste[von]];
  return liste;
}

export function erstelleUebersicht(speicher, ids) {
  let daten = bereinige(speicher.lies('uebersicht', null), ids);
  const sichere = () => speicher.schreibe('uebersicht', daten);
  return {
    daten: () => daten,
    setzeModus(modus, aktuelleIds) {
      if (!MODI.includes(modus)) return;
      // Beim ersten Wechsel zu „eigene“ gilt die aktuell sichtbare Reihenfolge als Ausgangspunkt
      if (modus === 'eigene' && daten.reihenfolge.length === 0 && aktuelleIds) daten = { ...daten, reihenfolge: aktuelleIds.slice() };
      daten = { ...daten, modus };
      sichere();
    },
    setzeReihenfolge(neu) {
      daten = { ...daten, reihenfolge: bereinige({ reihenfolge: neu }, ids).reihenfolge };
      sichere();
    },
    benutzt(id, jetzt = Date.now()) {
      if (!ids.includes(id)) return;
      daten = { ...daten, zuletzt: { ...daten.zuletzt, [id]: jetzt } };
      sichere();
    },
  };
}
