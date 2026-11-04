import { test, gleich, tief } from '../mini-test.js';
import { erstelleSpeicher } from '../../kern/speicher.js';
import { erstelleEinstellungen, STANDARD } from '../../kern/einstellungen.js';
import { falscherSpeicher } from './hilfen.js';

test('Einstellungen: Standardwerte', () => {
  const e = erstelleEinstellungen(erstelleSpeicher({ backend: falscherSpeicher() }));
  tief(e.alle(), { ...STANDARD });
});

test('Einstellungen: setzen, speichern, wieder laden', () => {
  const sp = erstelleSpeicher({ backend: falscherSpeicher() });
  erstelleEinstellungen(sp).setze('theme', 'dunkel');
  gleich(erstelleEinstellungen(sp).wert('theme'), 'dunkel');
});

test('Einstellungen: ungültige Werte werden ignoriert', () => {
  const sp = erstelleSpeicher({ backend: falscherSpeicher() });
  sp.schreibe('einstellungen', { theme: 'lila', muster: 'ja', unbekannt: 1 });
  const e = erstelleEinstellungen(sp);
  gleich(e.wert('theme'), 'system');
  gleich(e.wert('muster'), false);
  e.setze('palette', 'neon');
  gleich(e.wert('palette'), 'standard');
});

test('Einstellungen: Beobachter und Abmelden', () => {
  const e = erstelleEinstellungen(erstelleSpeicher({ backend: falscherSpeicher() }));
  const gesehen = [];
  const ab = e.beobachte((k, v) => gesehen.push(`${k}=${v}`));
  e.setze('muster', true);
  e.setze('muster', true);   // keine Änderung → keine Meldung
  ab();
  e.setze('muster', false);
  tief(gesehen, ['muster=true']);
});

test('Einstellungen: spieleigene Werte', () => {
  const e = erstelleEinstellungen(erstelleSpeicher({ backend: falscherSpeicher() }));
  const s = e.spiel('sudoku');
  gleich(s.wert('autoNotizen', false), false);
  s.setze('autoNotizen', true);
  gleich(e.spiel('sudoku').wert('autoNotizen', false), true);
  gleich(e.spiel('nonogramm').wert('autoNotizen', 'x'), 'x');
});
