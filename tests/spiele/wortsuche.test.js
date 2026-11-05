import { test, gleich, tief, wahr } from '../mini-test.js';
import {
  STUFEN, STUFEN_IDS, RICHTUNGEN, normalisiere, istPalindrom, stoerenSich, kandidaten, themaFuerLevel, linie,
  zellenVon, textZwischen, vorkommen, erzeugeRaetsel, findeWort, markiere, rueckgaengig, wiederholen, neustart,
  gewonnen, hinweis, listenReihenfolge, istGueltig, ausSpeicher, zumSpeichern, BUDGET,
} from '../../spiele/wortsuche/logik.js';

const daten = await fetch(new URL('../../spiele/wortsuche/woerter.json', import.meta.url)).then((r) => r.json());
const themen = daten.themen;

test('Wortliste: ≥ 20 Themen mit je 15–30 Wörtern, sauber geschrieben', () => {
  wahr(themen.length >= 20, `${themen.length} Themen`);
  const namen = new Set();
  for (const t of themen) {
    wahr(typeof t.name === 'string' && t.name.length > 0 && !namen.has(t.name), t.name);
    namen.add(t.name);
    wahr(t.woerter.length >= 15 && t.woerter.length <= 30, `${t.name}: ${t.woerter.length} Wörter`);
    const norm = t.woerter.map(normalisiere);
    norm.forEach((w, k) => wahr(w, `${t.name}: „${t.woerter[k]}“ ungültig`));
    gleich(new Set(norm).size, norm.length, `${t.name}: Dubletten`);
    for (const w of t.woerter) wahr(/^[A-ZÄÖÜ][a-zäöüß]+$/.test(w), `${t.name}: Schreibweise „${w}“`);
  }
});

test('Wortliste: jedes Thema reicht für jede Stufe', () => {
  for (const t of themen) {
    for (const sid of STUFEN_IDS) {
      const pool = kandidaten(t.woerter, STUFEN[sid].n);
      wahr(pool.length >= STUFEN[sid].anzahl + 2, `${t.name} ${sid}: ${pool.length}`);
    }
  }
});

test('Normalisierung: Großbuchstaben, ß → SS, Umlaute bleiben', () => {
  gleich(normalisiere('Fußball'), 'FUSSBALL');
  gleich(normalisiere('Löwenzahn'), 'LÖWENZAHN');
  gleich(normalisiere('Ab'), null, 'zu kurz');
  gleich(normalisiere('Rote Bete'), null, 'Leerzeichen');
  gleich(normalisiere('Kühlschrankxyz'), null, 'zu lang');
  wahr(istPalindrom('KAJAK'));
  wahr(stoerenSich('BLAU', 'HIMMELBLAU'));
  wahr(stoerenSich('TOR', 'DUNKELROT'), 'rückwärts enthalten');
  wahr(!stoerenSich('HUND', 'KATZE'));
});

test('Linie: nur die 8 Richtungen', () => {
  const n = 9;
  tief(linie(n, 0, 8), { dr: 0, dc: 1, laenge: 9 });
  tief(linie(n, 80, 0), { dr: -1, dc: -1, laenge: 9 });
  tief(linie(n, 8, 72), { dr: 1, dc: -1, laenge: 9 });
  gleich(linie(n, 0, 11), null, 'Springerzug');
  gleich(linie(n, 4, 4), null, 'gleiche Zelle');
});

test('Generator: alle Stufen, viele Seeds – Größe, Richtungen, jedes Wort genau einmal', () => {
  let maxSchritte = 0;
  for (const sid of STUFEN_IDS) {
    const cfg = STUFEN[sid];
    const erlaubt = cfg.richtungen.map((d) => RICHTUNGEN[d].join());
    const richtungen = new Set();
    for (let s = 0; s < 30; s++) {
      const z = erzeugeRaetsel({ stufe: sid, level: 1 + s, seed: `t${s}`, themen });
      maxSchritte = Math.max(maxSchritte, z.schritte);
      gleich(z.gitter.length, cfg.n * cfg.n);
      gleich(z.woerter.length, cfg.anzahl, `${sid} ${s}`);
      wahr(z.gitter.every((b) => /^[A-ZÄÖÜ]$/.test(b)), 'nur Buchstaben');
      for (const l of z.woerter) {
        wahr(erlaubt.includes([l.dr, l.dc].join()), `${sid}: Richtung ${l.dr},${l.dc}`);
        richtungen.add([l.dr, l.dc].join());
        const zs = zellenVon(z.n, l);
        gleich(textZwischen(z.gitter, z.n, zs[0], zs[zs.length - 1]), l.w);
        const v = vorkommen(z.gitter, z.n, l.w, 3);
        gleich(v.length, 1, `${sid} ${s}: ${l.w} kommt ${v.length}× vor`);
      }
      for (let a = 0; a < z.woerter.length; a++) for (let b = a + 1; b < z.woerter.length; b++) {
        wahr(!stoerenSich(z.woerter[a].w, z.woerter[b].w), `${z.woerter[a].w}/${z.woerter[b].w}`);
      }
      wahr(istGueltig(z), 'gültiger Stand');
    }
    gleich(richtungen.size, cfg.richtungen.length, `${sid}: alle Richtungen kommen vor`);
  }
  wahr(maxSchritte < BUDGET, `Schritte ${maxSchritte}`);
  console.log(`Wortsuche: höchstens ${maxSchritte} Schritte je Rätsel`);
});

test('Generator: gleicher Seed → gleiches Rätsel, Thema wechselt mit dem Level', () => {
  const a = erzeugeRaetsel({ stufe: 'mittel', level: 4, seed: 'gleich', themen });
  const b = erzeugeRaetsel({ stufe: 'mittel', level: 4, seed: 'gleich', themen });
  tief(a, b);
  const t = new Set();
  for (let l = 1; l <= themen.length; l++) t.add(themaFuerLevel('leicht', l, themen).name);
  gleich(t.size, themen.length, 'jedes Thema einmal je Durchlauf');
  wahr(themaFuerLevel('schwer', 1, themen).name !== themaFuerLevel('schwer', 2, themen).name);
  gleich(erzeugeRaetsel({ stufe: 'schwer', level: 7, seed: 'x', themen }).thema, themaFuerLevel('schwer', 7, themen).name);
});

test('Generator: Rechenzeit klein (kein Worker nötig)', () => {
  const t0 = performance.now();
  for (let s = 0; s < 10; s++) erzeugeRaetsel({ stufe: 'schwer', level: s + 1, seed: `zeit${s}`, themen });
  const ms = (performance.now() - t0) / 10;
  wahr(ms < 60, `${ms.toFixed(1)} ms je Schwer-Rätsel`);
  console.log(`Wortsuche: ${ms.toFixed(1)} ms je Schwer-Rätsel`);
});

test('Finden in beiden Auswahlrichtungen, falsche Auswahl findet nichts', () => {
  const z = erzeugeRaetsel({ stufe: 'schwer', level: 2, seed: 'finde', themen });
  z.woerter.forEach((l, i) => {
    const zs = zellenVon(z.n, l);
    gleich(findeWort(z, zs[0], zs[zs.length - 1]), i);
    gleich(findeWort(z, zs[zs.length - 1], zs[0]), i, 'rückwärts ausgewählt');
    if (zs.length > 3) gleich(findeWort(z, zs[0], zs[zs.length - 2]), -1, 'zu kurz');
  });
});

test('Markieren, Rückgängig, Wiederholen, Gewinn', () => {
  let z = erzeugeRaetsel({ stufe: 'leicht', level: 1, seed: 'spiel', themen });
  z = markiere(z, 3);
  z = markiere(z, 3);
  tief(z.gefunden, [3], 'doppelt zählt nicht');
  z = markiere(z, 5);
  z = rueckgaengig(z);
  tief(z.gefunden, [3]);
  tief(z.vor, [5]);
  z = wiederholen(z);
  tief(z.gefunden, [3, 5]);
  z = rueckgaengig(rueckgaengig(z));
  tief(z.gefunden, []);
  tief(z.vor, [5, 3]);
  z = markiere(z, 0);
  tief(z.vor, [], 'neuer Fund leert Wiederholen');
  for (let i = 0; i < z.woerter.length; i++) z = markiere(z, i);
  wahr(gewonnen(z));
  const n = neustart(z);
  tief(n.gefunden, []);
  wahr(!gewonnen(n));
});

test('Hinweis: erst Anfangsbuchstabe, dann ganzes Wort; Hinweis-Schleife gewinnt', () => {
  let z = erzeugeRaetsel({ stufe: 'mittel', level: 3, seed: 'hinweis', themen });
  const erstes = listenReihenfolge(z)[0];
  z = hinweis(z);
  tief(z.hinweis, { i: erstes, s: 1 });
  z = hinweis(z);
  tief(z.hinweis, { i: erstes, s: 2 });
  z = hinweis(z);
  wahr(z.hinweis.i !== erstes && z.hinweis.s === 1, 'nächstes Wort');
  // Schleife: Hinweis zeigt das Wort → genau dieses auswählen
  let runden = 0;
  while (!gewonnen(z) && runden++ < 100) {
    z = hinweis(z);
    const zs = zellenVon(z.n, z.woerter[z.hinweis.i]);
    z = markiere(z, findeWort(z, zs[zs.length - 1], zs[0]));
    gleich(z.hinweis, null, 'Hinweis erledigt');
  }
  wahr(gewonnen(z));
  tief(hinweis(z), z, 'nach Gewinn kein Hinweis');
});

test('Spielstand speichern/laden', () => {
  let z = erzeugeRaetsel({ stufe: 'schwer', level: 9, seed: 'speichern', themen });
  z = hinweis(markiere(markiere(z, 2), 7));
  z = rueckgaengig(z);
  const geladen = ausSpeicher(JSON.parse(JSON.stringify(zumSpeichern(z))));
  wahr(geladen, 'gültig');
  const { schritte, ...ohne } = z;
  wahr(schritte > 0);
  tief(geladen, ohne);
  tief(rueckgaengig(geladen).gefunden, []);
});

test('Kaputter oder manipulierter Stand → null', () => {
  const z = markiere(erzeugeRaetsel({ stufe: 'mittel', level: 2, seed: 'kaputt', themen }), 1);
  const k = () => JSON.parse(JSON.stringify(zumSpeichern(z)));
  const mitWort = (f) => { const x = k(); f(x.woerter[0]); return x; };
  const faelle = [
    null, 1, 'text', [], {}, { ...k(), v: 2 }, { ...k(), stufe: 'toString' }, { ...k(), stufe: 'schwer' },
    { ...k(), n: 99 }, { ...k(), level: 0 }, { ...k(), level: 1.5 }, { ...k(), thema: '<img src=x>'.repeat(9) },
    { ...k(), thema: 5 }, { ...k(), gitter: k().gitter.slice(1) }, { ...k(), gitter: k().gitter.map(() => '<') },
    { ...k(), gitter: k().gitter.map(() => 'AB') }, { ...k(), woerter: k().woerter.slice(1) },
    mitWort((l) => { l.w = 'xy'; }), mitWort((l) => { l.r = -1; }), mitWort((l) => { l.dr = 2; }),
    mitWort((l) => { l.dr = 0; l.dc = -1; }), mitWort((l) => { l.c = 11; l.dc = 1; l.dr = 0; }),
    mitWort((l) => { l.w = l.w.split('').reverse().join(''); }),
    { ...k(), gefunden: [1, 1] }, { ...k(), gefunden: [99] }, { ...k(), gefunden: 'x' }, { ...k(), vor: [1] },
    { ...k(), hinweis: { i: 0, s: 3 } }, { ...k(), hinweis: 7 }, { ...k(), hinweis: { i: 40, s: 1 } },
  ];
  for (const f of faelle) gleich(ausSpeicher(f), null, JSON.stringify(f)?.slice(0, 80));
  wahr(ausSpeicher(k()), 'unverändert gültig');
  const extra = ausSpeicher({ ...k(), boese: '<script>' });
  wahr(extra && !('boese' in extra), 'fremde Felder werden verworfen');
});

test('Still: kein vibrate/Audio/eval/innerHTML im Spiel', async () => {
  for (const d of ['index.js', 'logik.js']) {
    const q = await fetch(new URL(`../../spiele/wortsuche/${d}`, import.meta.url)).then((r) => r.text());
    wahr(!/\bvibrate\b|new\s+Audio\b|AudioContext|\.play\(\)|\beval\(|new Function|innerHTML/.test(q), d);
  }
});
