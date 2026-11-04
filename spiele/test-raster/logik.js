// „Lichter“ – Prüfspiel für das Grundgerüst. Ohne DOM, damit es im Worker und in Tests läuft.
// Ein Feld schaltet sich selbst und seine vier Nachbarn um. Ziel: alle Lichter aus.
// Erzeugt wird rückwärts aus zufälligen Drücken → immer lösbar, und die Drücke sind die Lösung.
import { erstelleZufall } from '../../kern/zufall.js';

export function nachbarn(n, i) {
  const z = Math.floor(i / n), s = i % n;
  const liste = [i];
  if (z > 0) liste.push(i - n);
  if (z < n - 1) liste.push(i + n);
  if (s > 0) liste.push(i - 1);
  if (s < n - 1) liste.push(i + 1);
  return liste;
}

/** Drückt Feld i: gibt neues Feld zurück (Array aus 0/1) */
export function druecke(feld, n, i) {
  const neu = feld.slice();
  for (const j of nachbarn(n, i)) neu[j] ^= 1;
  return neu;
}

export const geloest = (feld) => feld.every((x) => x === 0);

/**
 * @returns {{ n:number, seed:string, feld:number[], noetig:number[] }}
 *   noetig[i] = 1 heißt: Feld i muss (noch) einmal gedrückt werden
 */
export function erzeuge(n, seed) {
  const rng = erstelleZufall(seed);
  let feld, noetig;
  do {
    feld = new Array(n * n).fill(0);
    noetig = new Array(n * n).fill(0);
    const anzahl = rng.ganz(Math.ceil(n * n / 4), Math.ceil(n * n / 2));
    for (let k = 0; k < anzahl; k++) {
      const i = rng.ganz(0, n * n - 1);
      feld = druecke(feld, n, i);
      noetig[i] ^= 1;
    }
  } while (geloest(feld));
  return { n, seed: rng.seed, feld, noetig };
}
