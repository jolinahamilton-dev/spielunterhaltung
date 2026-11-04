// Speicher auf Basis von localStorage. Alle Schlüssel beginnen mit „spielunterhaltung:v1:“.
// Fehler (Speicher voll, privates Fenster, kaputtes JSON) führen nie zum Absturz, sondern
// werden über beiFehler gemeldet. Ohne nutzbaren localStorage wird im Arbeitsspeicher gespeichert.

export const PRAEFIX = 'spielunterhaltung:v1:';

function speicherImArbeitsspeicher() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

function standardBackend() {
  try {
    const ls = globalThis.localStorage;
    const probe = PRAEFIX + '__probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return speicherImArbeitsspeicher();
  }
}

/**
 * @param {object} [optionen]
 * @param {Storage} [optionen.backend]   für Tests austauschbar
 * @param {(meldung:string, fehler?:unknown)=>void} [optionen.beiFehler]
 * @param {string} [optionen.bereich]    zusätzlicher Präfix, z. B. „sudoku:“
 */
export function erstelleSpeicher({ backend = standardBackend(), beiFehler = () => {}, bereich = '' } = {}) {
  const voll = (k) => PRAEFIX + bereich + k;

  const speicher = {
    lies(schluessel, standard = null) {
      try {
        const roh = backend.getItem(voll(schluessel));
        return roh === null ? standard : JSON.parse(roh);
      } catch (f) {
        beiFehler(`Gespeicherte Daten „${schluessel}“ konnten nicht gelesen werden.`, f);
        return standard;
      }
    },
    schreibe(schluessel, wert) {
      try {
        backend.setItem(voll(schluessel), JSON.stringify(wert));
        return true;
      } catch (f) {
        beiFehler('Speichern hat nicht geklappt – der Speicher ist eventuell voll.', f);
        return false;
      }
    },
    entferne(schluessel) {
      try { backend.removeItem(voll(schluessel)); } catch { /* egal */ }
    },
    /** Alle Schlüssel dieses Bereichs (ohne Präfix) */
    schluessel() {
      const p = PRAEFIX + bereich;
      const liste = [];
      try {
        for (let i = 0; i < backend.length; i++) {
          const k = backend.key(i);
          if (k && k.startsWith(p)) liste.push(k.slice(p.length));
        }
      } catch { /* egal */ }
      return liste;
    },
    /** Unterbereich, z. B. speicher.bereich('sudoku:') */
    bereich: (unter) => erstelleSpeicher({ backend, beiFehler, bereich: bereich + unter }),
  };
  return speicher;
}

// ---------- Spielstand-Hülle mit Versionierung ----------

export const HUELLEN_FORMAT = 1;

/**
 * Packt einen Spielstand in die Hülle.
 * @param {object} modul    Spielmodul (für standVersion)
 * @param {object} daten    { stand, variante, geloest, zusammenfassung }
 */
export function packeStand(modul, { stand, variante = null, geloest = false, zusammenfassung = '' }) {
  return {
    format: HUELLEN_FORMAT,
    spielVersion: modul.standVersion ?? 1,
    gespeichertAm: Date.now(),
    variante,
    geloest,
    zusammenfassung,
    stand,
  };
}

/**
 * Holt den Spielstand aus der Hülle und migriert ihn bei Bedarf.
 * @returns {{ huelle: object|null, hinweis: string|null }}
 */
export function entpackeStand(modul, huelle) {
  if (!huelle || typeof huelle !== 'object' || huelle.format !== HUELLEN_FORMAT || !('stand' in huelle)) {
    return { huelle: null, hinweis: huelle ? 'Altes Spiel konnte nicht übernommen werden.' : null };
  }
  const ziel = modul.standVersion ?? 1;
  const von = huelle.spielVersion ?? 1;
  if (von === ziel) return { huelle, hinweis: null };
  if (von > ziel || typeof modul.migriere !== 'function') {
    return { huelle: null, hinweis: 'Altes Spiel konnte nicht übernommen werden.' };
  }
  try {
    const stand = modul.migriere(huelle.stand, von);
    if (stand === null || stand === undefined) throw new Error('Migration lieferte nichts');
    return { huelle: { ...huelle, spielVersion: ziel, stand }, hinweis: null };
  } catch {
    return { huelle: null, hinweis: 'Altes Spiel konnte nicht übernommen werden.' };
  }
}
