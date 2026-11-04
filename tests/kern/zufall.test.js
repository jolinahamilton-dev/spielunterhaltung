import { test, gleich, tief, wahr } from '../mini-test.js';
import { erstelleZufall, neuerSeed } from '../../kern/zufall.js';

test('Zufall: gleicher Seed → gleiche Folge', () => {
  const a = erstelleZufall('abc'), b = erstelleZufall('abc');
  tief(Array.from({ length: 20 }, a.zahl), Array.from({ length: 20 }, b.zahl));
});

test('Zufall: feste Werte für festen Seed (geräteunabhängig)', () => {
  const r = erstelleZufall('spielunterhaltung');
  const werte = Array.from({ length: 5 }, () => r.ganz(0, 999));
  // Referenz einmal ermittelt (04.11.2026) – darf sich nie ändern, sonst ändern sich Rätsel zu Seeds
  tief(werte, [873, 902, 701, 695, 305]);
});

test('Zufall: verschiedene Seeds → verschiedene Folgen', () => {
  const a = erstelleZufall('1'), b = erstelleZufall('2');
  wahr(a.zahl() !== b.zahl());
});

test('Zufall: ganz() bleibt in den Grenzen und trifft beide Enden', () => {
  const r = erstelleZufall(7);
  const gesehen = new Set();
  for (let i = 0; i < 2000; i++) {
    const w = r.ganz(3, 6);
    wahr(w >= 3 && w <= 6, `außerhalb: ${w}`);
    gesehen.add(w);
  }
  gleich(gesehen.size, 4);
});

test('Zufall: mische() liefert Kopie mit gleichen Elementen', () => {
  const r = erstelleZufall('m');
  const liste = [1, 2, 3, 4, 5, 6, 7, 8];
  const m = r.mische(liste);
  tief(liste, [1, 2, 3, 4, 5, 6, 7, 8], 'Original unverändert');
  tief(m.slice().sort(), liste);
});

test('Zufall: Zustand speichern und genau dort weitermachen', () => {
  const a = erstelleZufall('z');
  a.zahl(); a.zahl();
  const b = erstelleZufall('z', a.zustand());
  tief([a.zahl(), a.zahl()], [b.zahl(), b.zahl()]);
});

test('Zufall: neuerSeed() ist Text und meist verschieden', () => {
  const a = neuerSeed(), b = neuerSeed();
  gleich(typeof a, 'string');
  wahr(a !== b);
});
