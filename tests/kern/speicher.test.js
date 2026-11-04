import { test, gleich, tief, wahr } from '../mini-test.js';
import { erstelleSpeicher, packeStand, entpackeStand, PRAEFIX } from '../../kern/speicher.js';
import { falscherSpeicher } from './hilfen.js';

test('Speicher: schreiben, lesen, Präfix, Standardwert', () => {
  const backend = falscherSpeicher();
  const sp = erstelleSpeicher({ backend });
  sp.schreibe('a', { x: 1 });
  tief(sp.lies('a'), { x: 1 });
  gleich(sp.lies('fehlt', 42), 42);
  wahr(backend.roh.has(`${PRAEFIX}a`));
});

test('Speicher: Bereiche trennen Spiele', () => {
  const backend = falscherSpeicher();
  const sp = erstelleSpeicher({ backend });
  const a = sp.bereich('sudoku:'), b = sp.bereich('nonogramm:');
  a.schreibe('stand', 1); b.schreibe('stand', 2);
  gleich(a.lies('stand'), 1);
  gleich(b.lies('stand'), 2);
  tief(a.schluessel(), ['stand']);
  wahr(backend.roh.has(`${PRAEFIX}sudoku:stand`));
});

test('Speicher: kaputtes JSON → Standardwert + Meldung, kein Absturz', () => {
  const backend = falscherSpeicher();
  backend.setItem(`${PRAEFIX}x`, '{kaputt');
  let meldung = '';
  const sp = erstelleSpeicher({ backend, beiFehler: (t) => { meldung = t; } });
  gleich(sp.lies('x', 'std'), 'std');
  wahr(meldung.length > 0);
});

test('Speicher: voller Speicher → false + Meldung, kein Absturz', () => {
  let meldung = '';
  const sp = erstelleSpeicher({ backend: falscherSpeicher({ voll: true }), beiFehler: (t) => { meldung = t; } });
  gleich(sp.schreibe('a', 1), false);
  wahr(meldung.includes('voll'));
});

test('Stand-Hülle: packen und entpacken', () => {
  const modul = { standVersion: 2 };
  const huelle = packeStand(modul, { stand: { a: 1 }, variante: 'mittel', zusammenfassung: 'x' });
  gleich(huelle.spielVersion, 2);
  const { huelle: zurueck, hinweis } = entpackeStand(modul, JSON.parse(JSON.stringify(huelle)));
  tief(zurueck.stand, { a: 1 });
  gleich(zurueck.variante, 'mittel');
  gleich(hinweis, null);
});

test('Stand-Hülle: Migration von alter Version', () => {
  const alt = packeStand({ standVersion: 1 }, { stand: { wert: 3 } });
  const modul = { standVersion: 2, migriere: (s, von) => (von === 1 ? { wert: s.wert * 10 } : null) };
  const { huelle } = entpackeStand(modul, alt);
  tief(huelle.stand, { wert: 30 });
  gleich(huelle.spielVersion, 2);
});

test('Stand-Hülle: fehlende/fehlerhafte Migration → verwerfen mit Hinweis', () => {
  const alt = packeStand({ standVersion: 1 }, { stand: {} });
  const ohne = entpackeStand({ standVersion: 2 }, alt);
  gleich(ohne.huelle, null);
  wahr(ohne.hinweis);
  const kaputt = entpackeStand({ standVersion: 2, migriere: () => { throw new Error('x'); } }, alt);
  gleich(kaputt.huelle, null);
  const neuer = entpackeStand({ standVersion: 1 }, packeStand({ standVersion: 3 }, { stand: {} }));
  gleich(neuer.huelle, null, 'neuere Version als das Spiel');
});

test('Stand-Hülle: nichts gespeichert → kein Hinweis', () => {
  tief(entpackeStand({}, null), { huelle: null, hinweis: null });
});
