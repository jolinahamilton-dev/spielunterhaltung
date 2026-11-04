import { test, gleich, tief, wahr } from '../mini-test.js';
import { erstelleVerlauf, ladeVerlauf } from '../../kern/rueckgaengig.js';

test('Verlauf: zurück und vor', () => {
  const v = erstelleVerlauf();
  v.merke('a'); v.merke('b');
  gleich(v.zurueck(), 'b');
  gleich(v.kannVor(), true);
  gleich(v.vor(), 'b');
  gleich(v.zurueck(), 'b');
  gleich(v.zurueck(), 'a');
  gleich(v.zurueck(), null);
  gleich(v.kannZurueck(), false);
});

test('Verlauf: neuer Zug löscht Wiederholen', () => {
  const v = erstelleVerlauf();
  v.merke(1); v.merke(2);
  v.zurueck();
  v.merke(3);
  gleich(v.kannVor(), false);
  gleich(v.zurueck(), 3);
  gleich(v.zurueck(), 1);
});

test('Verlauf: Grenze max', () => {
  const v = erstelleVerlauf({ max: 3 });
  [1, 2, 3, 4, 5].forEach((z) => v.merke(z));
  gleich(v.anzahl(), 3);
  tief([v.zurueck(), v.zurueck(), v.zurueck(), v.zurueck()], [5, 4, 3, null]);
});

test('Verlauf: speichern und laden', () => {
  const v = erstelleVerlauf();
  v.merke({ i: 1 }); v.merke({ i: 2 }); v.zurueck();
  const geladen = ladeVerlauf(JSON.parse(JSON.stringify(v.toJSON())));
  tief(geladen.vor(), { i: 2 });
  tief(geladen.zurueck(), { i: 2 });
  tief(geladen.zurueck(), { i: 1 });
});

test('Verlauf: kaputte Daten → leerer Verlauf', () => {
  const v = ladeVerlauf({ zurueck: 'x' });
  wahr(!v.kannZurueck() && !v.kannVor());
  wahr(!ladeVerlauf(null).kannZurueck());
});
