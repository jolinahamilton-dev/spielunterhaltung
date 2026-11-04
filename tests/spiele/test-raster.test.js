import { test, gleich, tief, wahr } from '../mini-test.js';
import { erzeuge, druecke, geloest, nachbarn } from '../../spiele/test-raster/logik.js';

test('Lichter: Nachbarn an Ecke und Mitte', () => {
  tief(nachbarn(3, 0).sort(), [0, 1, 3]);
  tief(nachbarn(3, 4).sort(), [1, 3, 4, 5, 7]);
});

test('Lichter: zweimal drücken hebt sich auf', () => {
  const f = new Array(16).fill(0);
  tief(druecke(druecke(f, 4, 5), 4, 5), f);
});

test('Lichter: Erzeugung ist mit Seed wiederholbar', () => {
  tief(erzeuge(5, 'x'), erzeuge(5, 'x'));
});

test('Lichter: die mitgelieferte Lösung löst jedes Rätsel', () => {
  for (let k = 0; k < 50; k++) {
    const r = erzeuge(k % 2 ? 5 : 4, `s${k}`);
    wahr(!geloest(r.feld), 'Rätsel darf nicht schon gelöst sein');
    let f = r.feld;
    r.noetig.forEach((x, i) => { if (x) f = druecke(f, r.n, i); });
    gleich(geloest(f), true, `Seed s${k}`);
  }
});
