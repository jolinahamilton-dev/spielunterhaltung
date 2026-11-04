// Globale Einstellungen + spieleigene Einstellungen. Änderungen werden sofort gespeichert und an
// Beobachter gemeldet (z. B. Palette wechseln ohne Neuladen).

export const STANDARD = Object.freeze({
  theme: 'system',          // system | hell | dunkel
  palette: 'standard',      // standard | farbenblind
  muster: false,            // Symbole zusätzlich zu Farben
  animationen: 'system',    // system | reduziert | aus
  fehlerMarkieren: true,    // Konflikte/Fehler sofort zeigen
});

export const WAHLEN = Object.freeze({
  theme: ['system', 'hell', 'dunkel'],
  palette: ['standard', 'farbenblind'],
  animationen: ['system', 'reduziert', 'aus'],
});

function gueltig(k, v) {
  if (!(k in STANDARD)) return false;
  if (WAHLEN[k]) return WAHLEN[k].includes(v);
  return typeof v === typeof STANDARD[k];
}

/** @param {ReturnType<import('./speicher.js').erstelleSpeicher>} speicher */
export function erstelleEinstellungen(speicher) {
  const gespeichert = speicher.lies('einstellungen', {}) || {};
  const werte = { ...STANDARD };
  for (const [k, v] of Object.entries(gespeichert)) if (gueltig(k, v)) werte[k] = v;

  const beobachter = new Set();
  const melde = (k, v) => beobachter.forEach((fn) => { try { fn(k, v); } catch (f) { console.error(f); } });

  const einstellungen = {
    wert: (k) => werte[k],
    alle: () => ({ ...werte }),
    setze(k, v) {
      if (!gueltig(k, v) || werte[k] === v) return;
      werte[k] = v;
      speicher.schreibe('einstellungen', werte);
      melde(k, v);
    },
    /** @returns {() => void} abmelden */
    beobachte(fn) {
      beobachter.add(fn);
      return () => beobachter.delete(fn);
    },
    /** Spieleigene Einstellungen (frei, Standardwerte liefert das Spiel) */
    spiel(spielId) {
      const schluessel = `spiel-einstellungen:${spielId}`;
      return {
        wert(k, standard) {
          const alle = speicher.lies(schluessel, {}) || {};
          return k in alle ? alle[k] : standard;
        },
        setze(k, v) {
          const alle = speicher.lies(schluessel, {}) || {};
          alle[k] = v;
          speicher.schreibe(schluessel, alle);
          melde(`${spielId}.${k}`, v);
        },
      };
    },
    /** Bewegung reduziert? (Einstellung oder System) */
    bewegungReduziert() {
      if (werte.animationen === 'aus' || werte.animationen === 'reduziert') return true;
      return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    },
  };
  return einstellungen;
}

/** Überträgt Einstellungen als Attribute auf <html> (für CSS). */
export function wendeAufDokumentAn(einstellungen, html = document.documentElement) {
  const t = einstellungen.wert('theme');
  if (t === 'system') html.removeAttribute('data-theme');
  else html.setAttribute('data-theme', t);
  html.setAttribute('data-palette', einstellungen.wert('palette'));
  html.setAttribute('data-muster', einstellungen.wert('muster') ? 'an' : 'aus');
  html.setAttribute('data-bewegung', einstellungen.wert('animationen'));
}
