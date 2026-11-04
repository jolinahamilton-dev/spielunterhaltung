import { test, gleich } from '../mini-test.js';
import { erstelleSpeicher } from '../../kern/speicher.js';
import { erstelleStatistik } from '../../kern/statistik.js';
import { falscherSpeicher } from './hilfen.js';

test('Statistik: gespielt, gelöst, Serien je Variante', () => {
  const st = erstelleStatistik(erstelleSpeicher({ backend: falscherSpeicher() }));
  st.melde('sudoku', { typ: 'gestartet', variante: 'leicht' });
  st.melde('sudoku', { typ: 'geloest', variante: 'leicht' });
  st.melde('sudoku', { typ: 'gestartet', variante: 'leicht' });
  st.melde('sudoku', { typ: 'geloest', variante: 'leicht' });
  st.melde('sudoku', { typ: 'gestartet', variante: 'leicht' });
  st.melde('sudoku', { typ: 'aufgegeben', variante: 'leicht' });
  st.melde('sudoku', { typ: 'gestartet', variante: 'schwer' });
  st.melde('sudoku', { typ: 'geloest', variante: 'schwer' });
  const { gesamt, varianten } = st.fuer('sudoku');
  gleich(gesamt.gespielt, 4);
  gleich(gesamt.geloest, 3);
  gleich(varianten.leicht.serie, 0);
  gleich(varianten.leicht.besteSerie, 2);
  gleich(gesamt.besteSerie, 2);
});

test('Statistik: Zurücksetzen betrifft nur ein Spiel', () => {
  const st = erstelleStatistik(erstelleSpeicher({ backend: falscherSpeicher() }));
  st.melde('a', { typ: 'gestartet' });
  st.melde('b', { typ: 'gestartet' });
  st.zuruecksetzen('a');
  gleich(st.fuer('a').gesamt.gespielt, 0);
  gleich(st.fuer('b').gesamt.gespielt, 1);
});

test('Statistik: unbekannter Typ wird ignoriert', () => {
  const st = erstelleStatistik(erstelleSpeicher({ backend: falscherSpeicher() }));
  st.melde('a', { typ: 'quatsch' });
  gleich(st.fuer('a').gesamt.gespielt, 0);
});
