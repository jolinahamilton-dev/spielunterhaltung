import { test, gleich, tief, wahr } from '../mini-test.js';
import { erstelleSicherung, pruefeSicherung, spieleEin, stelleBackupWiederHer, hatBackup, BACKUP_SCHLUESSEL } from '../../kern/sicherung.js';
import { PRAEFIX } from '../../kern/speicher.js';
import { falscherSpeicher } from './hilfen.js';

function befuellt() {
  const b = falscherSpeicher();
  b.setItem(`${PRAEFIX}einstellungen`, JSON.stringify({ theme: 'dunkel' }));
  b.setItem(`${PRAEFIX}sudoku:stand`, JSON.stringify({ format: 1, stand: { a: 1 } }));
  b.setItem(`${PRAEFIX}block-puzzle:daten:rekorde`, JSON.stringify({ klassisch: 5 }));
  b.setItem('fremde-app', 'bleibt');
  return b;
}

test('Sicherung: nur App-Schlüssel, ohne Präfix', () => {
  const s = erstelleSicherung(befuellt(), '1.0.0');
  tief(Object.keys(s.daten).sort(), ['block-puzzle:daten:rekorde', 'einstellungen', 'sudoku:stand']);
  gleich(s.app, 'spielunterhaltung');
});

test('Sicherung: Hin- und Rückweg', () => {
  const quelle = befuellt();
  const text = JSON.stringify(erstelleSicherung(quelle));
  const p = pruefeSicherung(text);
  gleich(p.ok, true);
  tief(p.spiele, ['block-puzzle', 'sudoku']);
  const ziel = falscherSpeicher();
  ziel.setItem(`${PRAEFIX}nonogramm:stand`, '{"alt":1}');
  ziel.setItem('fremde-app', 'unberührt');
  gleich(spieleEin(ziel, p.sicherung).ok, true);
  gleich(ziel.getItem(`${PRAEFIX}sudoku:stand`), quelle.getItem(`${PRAEFIX}sudoku:stand`));
  gleich(ziel.getItem(`${PRAEFIX}nonogramm:stand`), null, 'alter Stand ersetzt');
  gleich(ziel.getItem('fremde-app'), 'unberührt', 'fremde Daten bleiben');
  wahr(hatBackup(ziel));
});

test('Sicherung: Backup von vor dem Einlesen wiederherstellen', () => {
  const ziel = falscherSpeicher();
  ziel.setItem(`${PRAEFIX}nonogramm:stand`, '{"alt":1}');
  spieleEin(ziel, pruefeSicherung(JSON.stringify(erstelleSicherung(befuellt()))).sicherung);
  gleich(stelleBackupWiederHer(ziel).ok, true);
  gleich(ziel.getItem(`${PRAEFIX}nonogramm:stand`), '{"alt":1}');
  gleich(ziel.getItem(`${PRAEFIX}sudoku:stand`), null);
  gleich(ziel.getItem(PRAEFIX + BACKUP_SCHLUESSEL), null);
});

test('Sicherung: ungültige Dateien werden abgelehnt', () => {
  const gut = erstelleSicherung(befuellt());
  const fall = (o) => pruefeSicherung(typeof o === 'string' ? o : JSON.stringify(o)).ok;
  gleich(fall(''), false);
  gleich(fall('kein json'), false);
  gleich(fall('[]'), false);
  gleich(fall({ ...gut, app: 'andere' }), false);
  gleich(fall({ ...gut, format: 2 }), false);
  gleich(fall({ ...gut, daten: [] }), false);
  gleich(fall({ ...gut, daten: { 'a b': '1' } }), false, 'Leerzeichen im Schlüssel');
  gleich(fall({ ...gut, daten: { ok: 5 } }), false, 'Wert kein Text');
  gleich(fall({ ...gut, daten: { ok: '{kaputt' } }), false, 'Wert kein JSON');
  gleich(fall(`{"app":"spielunterhaltung","format":1,"daten":{"__proto__":"{}"}}`), false, '__proto__');
  gleich(fall({ ...gut, daten: { [BACKUP_SCHLUESSEL]: '{}' } }), false);
  gleich(fall('x'.repeat(5 * 1024 * 1024 + 1)), false, 'zu groß');
  gleich(fall(gut), true);
});

test('Sicherung: Speicher voll → nichts geändert', () => {
  const ziel = falscherSpeicher();
  ziel.setItem(`${PRAEFIX}a`, '"vorher"');
  const p = pruefeSicherung(JSON.stringify(erstelleSicherung(befuellt())));
  const voll = {
    setItem(k, v) { if (k.includes('sudoku')) throw new DOMException('voll', 'QuotaExceededError'); ziel.setItem(k, v); },
    getItem: (k) => ziel.getItem(k), removeItem: (k) => ziel.removeItem(k), key: (i) => ziel.key(i),
    get length() { return ziel.length; },
  };
  gleich(spieleEin(voll, p.sicherung).ok, false);
  gleich(ziel.getItem(`${PRAEFIX}a`), '"vorher"');
});
