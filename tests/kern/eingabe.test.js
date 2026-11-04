import { test, gleich, tief } from '../mini-test.js';
import { erstelleRasterFokus, zeiger, ziehen } from '../../kern/eingabe.js';

const taste = (key, extra = {}) => ({ key, ...extra });

test('Rasterfokus: Pfeiltasten mit Randbegrenzung', () => {
  const wege = [];
  const f = erstelleRasterFokus({ zeilen: 3, spalten: 3, beiBewegung: (z, s) => wege.push([z, s]) });
  gleich(f.taste(taste('ArrowRight')), true);
  f.taste(taste('ArrowDown'));
  f.taste(taste('ArrowDown'));
  f.taste(taste('ArrowDown'));       // Rand – keine Bewegung
  tief([f.zeile, f.spalte], [2, 1]);
  tief(wege, [[0, 1], [1, 1], [2, 1]]);
  gleich(f.taste(taste('a')), false);
});

test('Rasterfokus: Pos1/Ende und Umlaufen', () => {
  const f = erstelleRasterFokus({ zeilen: 2, spalten: 4, umlaufen: true });
  f.taste(taste('End'));
  gleich(f.spalte, 3);
  f.taste(taste('ArrowRight'));
  gleich(f.spalte, 0);
  f.taste(taste('ArrowUp'));
  gleich(f.zeile, 1);
});

function zeigerEreignis(typ, x, y, extra = {}) {
  return new PointerEvent(typ, { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, pointerType: 'mouse', ...extra });
}

test('Zeiger: Tippen ja, Wischen nein', () => {
  const el = document.createElement('div');
  let tipps = 0;
  const ac = new AbortController();
  zeiger(el, { tippen: () => tipps++, signal: ac.signal });
  el.dispatchEvent(zeigerEreignis('pointerdown', 10, 10));
  el.dispatchEvent(zeigerEreignis('pointerup', 12, 11));
  el.dispatchEvent(zeigerEreignis('pointerdown', 10, 10));
  el.dispatchEvent(zeigerEreignis('pointermove', 40, 10));
  el.dispatchEvent(zeigerEreignis('pointerup', 40, 10));
  ac.abort();
  el.dispatchEvent(zeigerEreignis('pointerdown', 10, 10));
  el.dispatchEvent(zeigerEreignis('pointerup', 10, 10));
  gleich(tipps, 1);
});

test('Ziehen: start → bewege → ablegen, mit Schwelle', () => {
  const el = document.createElement('div');
  document.body.append(el);
  const ablauf = [];
  ziehen(el, {
    schwelle: 5,
    start: () => { ablauf.push('start'); return { ok: true }; },
    bewege: (e) => ablauf.push(`bewege ${e.clientX}`),
    ablegen: (e) => ablauf.push(`ablegen ${e.clientX}`),
  });
  el.dispatchEvent(zeigerEreignis('pointerdown', 0, 0));
  el.dispatchEvent(zeigerEreignis('pointermove', 3, 0));   // unter Schwelle
  el.dispatchEvent(zeigerEreignis('pointermove', 10, 0));
  el.dispatchEvent(zeigerEreignis('pointermove', 20, 0));
  el.dispatchEvent(zeigerEreignis('pointerup', 20, 0));
  el.remove();
  tief(ablauf, ['start', 'bewege 10', 'bewege 20', 'ablegen 20']);
});
