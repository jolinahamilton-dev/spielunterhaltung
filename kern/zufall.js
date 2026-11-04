// Deterministischer Zufall: gleicher Seed → gleiche Folge, auf jedem Gerät.
// Algorithmus: cyrb128 (Seed-Text → 4×32 Bit) + sfc32.

function cyrb128(text) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Neuer zufälliger Seed als kurzer Text (für „neues Rätsel“). */
export function neuerSeed() {
  const z = new Uint32Array(2);
  crypto.getRandomValues(z);
  return z[0].toString(36) + z[1].toString(36);
}

/**
 * @param {string|number} [seed]  ohne Seed wird ein neuer erzeugt
 * @param {number[]} [zustand]    gespeicherter Zustand (aus .zustand()), setzt die Folge fort
 */
export function erstelleZufall(seed, zustand) {
  const s = seed === undefined || seed === null ? neuerSeed() : String(seed);
  let [a, b, c, d] = zustand && zustand.length === 4 ? zustand : cyrb128(s);

  function roh() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = c << 21 | c >>> 11;
    c = c + t | 0;
    return t >>> 0;
  }
  // Die ersten Werte gut durchmischen (nur bei frischem Seed)
  if (!zustand) for (let i = 0; i < 12; i++) roh();

  const zufall = {
    seed: s,
    /** Zahl in [0, 1) */
    zahl: () => roh() / 4294967296,
    /** Ganze Zahl in [min, max] (beide eingeschlossen) */
    ganz(min, max) {
      return min + Math.floor(zufall.zahl() * (max - min + 1));
    },
    wahl(liste) {
      return liste[Math.floor(zufall.zahl() * liste.length)];
    },
    /** Gemischte Kopie (Fisher-Yates) */
    mische(liste) {
      const k = liste.slice();
      for (let i = k.length - 1; i > 0; i--) {
        const j = Math.floor(zufall.zahl() * (i + 1));
        [k[i], k[j]] = [k[j], k[i]];
      }
      return k;
    },
    /** Zustand zum Speichern – mit erstelleZufall(seed, zustand) geht es genau dort weiter */
    zustand: () => [a >>> 0, b >>> 0, c >>> 0, d >>> 0],
  };
  return zufall;
}
