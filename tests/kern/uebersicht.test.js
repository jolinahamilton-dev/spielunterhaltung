// Reihenfolge der Spiele-Übersicht
import { test, wahr, gleich } from '../mini-test.js';
import { bereinige, ordne, verschiebe, erstelleUebersicht } from '../../kern/uebersicht.js';
import { erstelleSpeicher } from '../../kern/speicher.js';
import { falscherSpeicher } from './hilfen.js';

const spiele = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
const ids = spiele.map((s) => s.id);
const folge = (l) => l.map((s) => s.id).join('');

test('Übersicht: Standard behält die Reihenfolge', () => {
  gleich(folge(ordne(spiele, bereinige(null, ids))), 'abcd');
});

test('Übersicht: Zuletzt benutzt – neueste zuerst, nie benutzte in Standardreihenfolge dahinter', () => {
  const d = bereinige({ modus: 'zuletzt', zuletzt: { c: 50, b: 10 } }, ids);
  gleich(folge(ordne(spiele, d)), 'cbad');
});

test('Übersicht: Eigene Reihenfolge, neue Spiele hinten', () => {
  const d = bereinige({ modus: 'eigene', reihenfolge: ['d', 'b'] }, ids);
  gleich(folge(ordne(spiele, d)), 'dbac');
});

test('Übersicht: verschieben und Ränder', () => {
  gleich(verschiebe(ids, 'b', -1).join(''), 'bacd');
  gleich(verschiebe(ids, 'a', -1).join(''), 'abcd');
  gleich(verschiebe(ids, 'd', 1).join(''), 'abcd');
  gleich(verschiebe(ids, 'x', 1).join(''), 'abcd');
});

test('Übersicht: kaputte Daten werden bereinigt', () => {
  const d = bereinige({ modus: 'quatsch', reihenfolge: ['a', 'a', 'zz', 5, '__proto__'], zuletzt: { a: 'x', b: -1, c: 7, zz: 9, __proto__: { d: 1 } } }, ids);
  gleich(d.modus, 'standard');
  gleich(d.reihenfolge.join(''), 'a');
  gleich(JSON.stringify(d.zuletzt), '{"c":7}');
  gleich(JSON.stringify(bereinige([1], ids)), JSON.stringify({ modus: 'standard', reihenfolge: [], zuletzt: {} }));
});

test('Übersicht: Speichern und Wiederladen', () => {
  const speicher = erstelleSpeicher({ backend: falscherSpeicher() });
  const u = erstelleUebersicht(speicher, ids);
  u.setzeModus('eigene', ['c', 'a', 'b', 'd']);
  u.setzeReihenfolge(['d', 'c', 'a', 'b']);
  u.benutzt('b', 123);
  u.benutzt('nix', 5);
  wahr(!('nix' in u.daten().zuletzt));
  gleich(u.daten().zuletzt.b, 123);
  gleich(u.daten().modus, 'eigene');
  gleich(u.daten().reihenfolge.join(''), 'dcab');
});
