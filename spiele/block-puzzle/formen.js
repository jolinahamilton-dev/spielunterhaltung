// Formen-Katalog. Gedreht wird nicht: jede Ausrichtung ist eine eigene Form.
// Die Ausrichtungen werden aus Grundformen erzeugt (drehen/spiegeln, Doppelte entfernt).

const GRUPPEN = [
  // id,  Name,              Zellen der Grundform,                       Ausrichtungen, Gewicht je Ausrichtung, Farbe
  ['P1', 'Punkt', [[0, 0]], 'keine', 2, 7],
  ['I2', 'Kurzer Stab', [[0, 0], [1, 0]], 'drehen', 3, 5],
  ['I3', 'Stab', [[0, 0], [1, 0], [2, 0]], 'drehen', 3, 5],
  ['I4', 'Langer Stab', [[0, 0], [1, 0], [2, 0], [3, 0]], 'drehen', 2, 4],
  ['I5', 'Sehr langer Stab', [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], 'drehen', 1, 4],
  ['O2', 'Quadrat', [[0, 0], [1, 0], [0, 1], [1, 1]], 'keine', 4, 2],
  ['O3', 'Großes Quadrat', [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]], 'keine', 1, 1],
  ['R6', 'Rechteck', [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]], 'drehen', 1, 6],
  ['W3', 'Kleiner Winkel', [[0, 0], [0, 1], [1, 1]], 'drehen', 2, 3],
  ['L4', 'L-Form', [[0, 0], [0, 1], [0, 2], [1, 2]], 'drehen+spiegeln', 1, 0],
  ['T4', 'T-Form', [[0, 0], [1, 0], [2, 0], [1, 1]], 'drehen', 1, 8],
  ['S4', 'Treppe', [[1, 0], [2, 0], [0, 1], [1, 1]], 'drehen+spiegeln', 1, 9],
  ['W5', 'Großer Winkel', [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]], 'drehen', 1, 6],
];

function normalisiere(zellen) {
  const minX = Math.min(...zellen.map(([x]) => x));
  const minY = Math.min(...zellen.map(([, y]) => y));
  return zellen.map(([x, y]) => [x - minX, y - minY]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

const drehe = (zellen) => zellen.map(([x, y]) => [-y, x]);
const spiegle = (zellen) => zellen.map(([x, y]) => [-x, y]);

function ausrichtungen(grund, art) {
  const kandidaten = [grund];
  if (art !== 'keine') {
    let z = grund;
    for (let i = 0; i < 3; i++) { z = drehe(z); kandidaten.push(z); }
  }
  if (art === 'drehen+spiegeln') {
    let z = spiegle(grund);
    for (let i = 0; i < 4; i++) { kandidaten.push(z); z = drehe(z); }
  }
  const gesehen = new Map();
  for (const k of kandidaten) {
    const n = normalisiere(k);
    const schluessel = JSON.stringify(n);
    if (!gesehen.has(schluessel)) gesehen.set(schluessel, n);
  }
  return [...gesehen.values()];
}

/** @type {{id:string, gruppe:string, name:string, zellen:number[][], b:number, h:number, gewicht:number, farbe:number}[]} */
export const FORMEN = GRUPPEN.flatMap(([gruppe, name, grund, art, gewicht, farbe]) =>
  ausrichtungen(grund, art).map((zellen, i) => ({
    id: `${gruppe}-${i}`,
    gruppe,
    name,
    zellen,
    b: Math.max(...zellen.map(([x]) => x)) + 1,
    h: Math.max(...zellen.map(([, y]) => y)) + 1,
    gewicht,
    farbe,
  })));

export const FORM = Object.fromEntries(FORMEN.map((f) => [f.id, f]));
