import { test, gleich, tief, wahr } from '../mini-test.js';
import {
  STUFEN, VARIANTEN, VERLAUF_MAX, zieleFuer, nachbarn, sindNachbarn, hatPaar, festgefahren, neuesSpiel,
  pfadSchritt, schliesst, pfadGueltig, betroffen, faelltNach, zug, umordnen, rueckgaengig, kannRueckgaengig,
  gewonnen, weiterspielen, hinweis, ausSpeicher, istGueltig, zumSpeichern,
} from '../../spiele/punkte-verbinden/logik.js';
import { erstelleZufall, neuerSeed } from '../../kern/zufall.js';

/** Brett (b × hh) aus Textzeilen, jedes Zeichen = Farb-ID (Ziffer) */
const brettAus = (zeilen) => zeilen.join('').split('').map(Number);
/** Kleines Testspiel mit festem Brett (Variante endlos hat 6×7 → wir bauen frei) */
const stand = (zeilen, extra = {}) => {
  const b = zeilen[0].length, hh = zeilen.length;
  return {
    version: 1, variante: 'endlos', seed: 'test', rng: erstelleZufall('test').zustand(), b, hh,
    farben: [0, 1, 2, 3], brett: brettAus(zeilen), level: 0, ziele: null, rest: null,
    gesammelt: 0, zuege: 0, verlauf: [], ...extra,
  };
};

test('Punkte: Nachbarschaft', () => {
  tief(nachbarn(0, 4, 3), [1, 4]);
  tief(nachbarn(5, 4, 3), [1, 4, 6, 9]);
  gleich(sindNachbarn(3, 4, 4), false, 'Zeilenumbruch');
  gleich(sindNachbarn(3, 7, 4), true);
  gleich(sindNachbarn(0, 5, 4), false, 'diagonal');
});

test('Punkte: Kette – verlängern, zurücknehmen, ungültige Schritte', () => {
  const b = brettAus(['0011', '0100', '2200']);
  gleich(pfadSchritt(b, 4, 3, [], 0), null);
  tief(pfadSchritt(b, 4, 3, [0], 1), [0, 1]);
  gleich(pfadSchritt(b, 4, 3, [0], 2), null, 'andere Farbe');
  gleich(pfadSchritt(b, 4, 3, [0], 5), null, 'diagonal');
  gleich(pfadSchritt(b, 4, 3, [0], 0), null, 'dasselbe Feld');
  tief(pfadSchritt(b, 4, 3, [0, 1, 5], 1), [0, 1], 'Zurückziehen nimmt Glied zurück');
  gleich(pfadSchritt(b, 4, 3, [0], 99), null);
  gleich(pfadSchritt(b, 4, 3, [0], -1), null);
});

test('Punkte: Pfadgültigkeit (Länge, Farbe, Kanten, Nachbarn)', () => {
  const b = brettAus(['0011', '0100', '2200']);
  gleich(pfadGueltig(b, 4, 3, [0, 1]), true);
  gleich(pfadGueltig(b, 4, 3, [0]), false, 'zu kurz');
  gleich(pfadGueltig(b, 4, 3, []), false);
  gleich(pfadGueltig(b, 4, 3, [0, 4, 5]), false, 'Farbwechsel (0,0,1)');
  gleich(pfadGueltig(b, 4, 3, [0, 1, 0]), false, 'Kante doppelt');
  gleich(pfadGueltig(b, 4, 3, [0, 5]), false, 'diagonal');
  gleich(pfadGueltig(b, 4, 3, [0, 'a']), false);
  gleich(pfadGueltig(b, 4, 3, [0, 1.5]), false);
  gleich(pfadGueltig(b, 4, 3, [0, 99]), false);
  gleich(pfadGueltig(b, 4, 3, null), false);
  gleich(pfadGueltig(b, 4, 3, [2, 3]), true, 'zwei Einsen');
  gleich(pfadGueltig(b, 4, 3, [2, 3, 7]), false, 'Farbwechsel am Ende');
});

test('Punkte: Schleife erkennen und ganze Farbe räumen', () => {
  const b = brettAus([
    '0011',
    '0010',
    '1100',
  ]);
  // Quadrat aus Nullen: Felder 0,1,4,5? Zeile 0: 0,0 | Zeile 1: 0,0 → Felder 0,1,4,5 sind 0
  const quadrat = [0, 1, 5, 4, 0];
  gleich(pfadGueltig(b, 4, 3, quadrat), true);
  gleich(schliesst(quadrat), true);
  gleich(schliesst([0, 1, 5, 4]), false);
  const alle0 = b.map((f, i) => (f === 0 ? i : -1)).filter((i) => i >= 0);
  tief(betroffen(b, 4, 3, quadrat), alle0, 'alle Nullen im Feld');
  tief(betroffen(b, 4, 3, [0, 1, 5, 4]), [0, 1, 4, 5], 'ohne Schleife nur die Kette');
});

test('Punkte: Schwerkraft und Nachfüllen sind deterministisch', () => {
  const b = brettAus([
    '012',
    '120',
    '201',
  ]);
  const r1 = faelltNach(b, 3, 3, [3, 6], erstelleZufall('s1'), [0, 1, 2]);
  const r2 = faelltNach(b, 3, 3, [3, 6], erstelleZufall('s1'), [0, 1, 2]);
  tief(r1, r2);
  // Spalte 0 hatte 0,1,2 (oben→unten); 1 und 2 entfernt → die 0 fällt auf die unterste Zeile
  gleich(r1.brett[6], 0, 'Punkt fällt');
  tief([r1.fall[6], r1.fall[3], r1.fall[0]], [2, 2, 2], 'Fallhöhen');
  // andere Spalten unverändert
  gleich(r1.brett[1], 1); gleich(r1.brett[4], 2); gleich(r1.brett[7], 0);
  gleich(r1.brett[2], 2); gleich(r1.brett[5], 0); gleich(r1.brett[8], 1);
  const r3 = faelltNach(b, 3, 3, [3, 6], erstelleZufall('s2'), [0, 1, 2]);
  wahr(r3.brett.every((f) => [0, 1, 2].includes(f)));
});

test('Punkte: Zug – entfernt, füllt nach, zählt, merkt Verlauf, verändert den Alten nicht', () => {
  const z = stand(['0012', '3012', '3312']);
  const alt = JSON.stringify(z);
  const r = zug(z, [0, 1, 5]);
  wahr(r, 'gültiger Zug');
  gleich(JSON.stringify(z), alt, 'Original unverändert');
  tief(r.entfernt, [0, 1, 5]);
  gleich(r.zustand.gesammelt, 3);
  gleich(r.zustand.zuege, 1);
  gleich(r.zustand.verlauf.length, 1);
  gleich(r.schleife, false);
  gleich(r.zustand.brett.length, 12);
  // gleicher Zustand + gleiche Kette → gleiches Ergebnis
  tief(zug(z, [0, 1, 5]).zustand, r.zustand);
  gleich(zug(z, [0, 2]), null, 'ungültige Kette');
});

test('Punkte: Zug mit Schleife räumt die ganze Farbe und zählt sie', () => {
  const z = stand(['0012', '0013', '2032']);
  const r = zug(z, [0, 1, 5, 4, 0]);
  wahr(r);
  gleich(r.schleife, true);
  tief(r.entfernt, [0, 1, 4, 5, 9], 'inkl. verstreuter Null in Zeile 3');
  gleich(r.zustand.gesammelt, 5);
});

test('Punkte: Ziele senken sich, Gewinn wird erkannt, Rest nie negativ', () => {
  const z = stand(['0012', '3012', '3312'], { variante: 'leicht', level: 1, ziele: zieleFuer('leicht', 1), rest: [2, 5, 5, 5], farben: [0, 5, 3, 2] });
  // eigene Farb-IDs passen nicht zu 'leicht' – hier nur Rechnung prüfen (ohne ausSpeicher)
  const z2 = { ...z, farben: [0, 1, 2, 3], rest: [2, 5, 5, 5] };
  const r = zug(z2, [0, 1, 5]);
  tief(r.zustand.rest, [0, 5, 5, 5], '3 Nullen entfernt, Rest 2 → 0');
  gleich(gewonnen(r.zustand), false);
  gleich(gewonnen({ ...z2, rest: [0, 0, 0, 0] }), true);
  gleich(gewonnen(stand(['00'])), false, 'endlos gewinnt nie');
});

test('Punkte: Ziele je Variante und Level steigen moderat', () => {
  gleich(zieleFuer('endlos', 1), null);
  tief(zieleFuer('leicht', 1), [10, 8, 8, 6]);
  tief(zieleFuer('leicht', 99), [16, 14, 14, 12], 'gedeckelt');
  tief(zieleFuer('mittel', 1), [12, 11, 10, 9, 8]);
  tief(zieleFuer('schwer', 1), [16, 14, 13, 12, 10]);
  wahr(zieleFuer('schwer', 2)[0] > zieleFuer('schwer', 1)[0]);
  tief([STUFEN.leicht.farben.length, STUFEN.mittel.farben.length, STUFEN.schwer.farben.length], [4, 5, 5]);
});

test('Punkte: neues Spiel – deterministisch, immer mit Paar, richtige Größe', () => {
  for (const v of VARIANTEN) {
    const a = neuesSpiel({ variante: v, seed: 'abc', level: 3 });
    tief(a, neuesSpiel({ variante: v, seed: 'abc', level: 3 }), v);
    gleich(a.brett.length, STUFEN[v].b * STUFEN[v].hh);
    wahr(a.brett.every((f) => STUFEN[v].farben.includes(f)));
    wahr(ausSpeicher(a), `${v} ist gültig`);
  }
  for (let i = 0; i < 300; i++) {
    const v = VARIANTEN[i % 4];
    wahr(hatPaar(neuesSpiel({ variante: v, seed: `s${i}` }).brett, STUFEN[v].b, STUFEN[v].hh), `Seed s${i}`);
  }
  gleich(neuesSpiel({ variante: 'quatsch', seed: 'x' }).variante, 'endlos');
});

test('Punkte: Festgefahren-Erkennung', () => {
  gleich(festgefahren(brettAus(['01', '10']), 2, 2), true, 'Schachbrett');
  gleich(festgefahren(brettAus(['01', '11']), 2, 2), false);
  gleich(festgefahren(brettAus(['010', '101', '010']), 3, 3), true);
  gleich(festgefahren(brettAus(['012', '120', '201']), 3, 3), true, 'Diagonalen zählen nicht');
  gleich(festgefahren(brettAus(['0120', '3333']), 4, 2), false);
  gleich(festgefahren(brettAus(['0', '0']), 1, 2), false, 'senkrecht');
});

test('Punkte: Umordnen – gleiche Farben, danach ein Paar, deterministisch, zählt als Zug, rückgängig', () => {
  const z = stand(['0101', '1010', '0101', '1010']);
  gleich(festgefahren(z.brett, z.b, z.hh), true);
  const u = umordnen(z);
  tief(u.brett.slice().sort(), z.brett.slice().sort(), 'selbe Punkte');
  gleich(festgefahren(u.brett, u.b, u.hh), false);
  tief(umordnen(z), u, 'deterministisch');
  gleich(u.zuege, 1);
  gleich(u.gesammelt, 0);
  gleich(u.verlauf.length, 1);
  tief(rueckgaengig(u).brett, z.brett);
  // viele Zufallsfelder: nach dem Umordnen immer ein Paar
  for (let i = 0; i < 200; i++) {
    const s0 = neuesSpiel({ variante: VARIANTEN[i % 4], seed: `m${i}` });
    wahr(hatPaar(umordnen(s0).brett, s0.b, s0.hh), `m${i}`);
  }
});

test('Punkte: Rückgängig stellt alles her (Brett, Zufall, Rest) und ist unbegrenzt bis 200', () => {
  let z = neuesSpiel({ variante: 'leicht', seed: 'rg', level: 1 });
  const start = JSON.stringify(z);
  const folge = [];
  for (let i = 0; i < 5; i++) {
    const h = hinweis(z);
    folge.push(JSON.stringify(z));
    z = zug(z, h.pfad).zustand;
  }
  for (let i = 4; i >= 0; i--) {
    wahr(kannRueckgaengig(z));
    z = rueckgaengig(z);
    gleich(JSON.stringify(z), folge[i], `Schritt ${i}`);
  }
  gleich(JSON.stringify(z), start);
  gleich(rueckgaengig(z), null);

  // Verlaufsgrenze
  let g = neuesSpiel({ variante: 'endlos', seed: 'viel' });
  for (let i = 0; i < VERLAUF_MAX + 20; i++) {
    g = hatPaar(g.brett, g.b, g.hh) ? zug(g, hinweis(g).pfad).zustand : umordnen(g);
  }
  gleich(g.verlauf.length, VERLAUF_MAX);
  wahr(ausSpeicher(zumSpeichern(g)), 'voller Verlauf bleibt gültig');
});

test('Punkte: Hinweis – gültige Kette, bevorzugt Schleifen und offene Ziele', () => {
  const z = stand(['0012', '3012', '3312']);
  const t = hinweis(z);
  wahr(t && pfadGueltig(z.brett, z.b, z.hh, t.pfad));
  gleich(t.anzahl, 3);
  const q = stand(['0012', '0013', '2032']);
  const s = hinweis(q);
  gleich(s.schleife, true, 'Quadrat aus Nullen wird als Schleife gefunden');
  gleich(s.anzahl, 5);
  tief(hinweis(stand(['01', '10'])), null);
  // Ziel bevorzugt: Farbe 3 ist das einzig offene Ziel
  const r = stand(['0012', '3012', '3312'], { rest: [0, 0, 0, 1], ziele: [1, 1, 1, 1] });
  gleich(r.brett[hinweis(r).pfad[0]], 3);
  // Auf echten Feldern immer gültig
  for (let i = 0; i < 30; i++) {
    const g = neuesSpiel({ variante: VARIANTEN[i % 4], seed: `h${i}`, level: 2 });
    const h = hinweis(g);
    wahr(h && pfadGueltig(g.brett, g.b, g.hh, h.pfad), `h${i}`);
  }
});

test('Punkte: Spiel bis zum Ziel – Level wird mit Hinweisen immer erreicht', () => {
  for (const v of ['leicht', 'mittel', 'schwer']) {
    let z = neuesSpiel({ variante: v, seed: `ziel-${v}`, level: 4 });
    let n = 0;
    while (!gewonnen(z) && n++ < 400) z = hatPaar(z.brett, z.b, z.hh) ? zug(z, hinweis(z).pfad).zustand : umordnen(z);
    wahr(gewonnen(z), `${v} gelöst nach ${n} Zügen`);
    wahr(ausSpeicher(zumSpeichern(z)));
  }
});

test('Punkte: Spielstand – Rundlauf und strenge Prüfung', () => {
  let z = neuesSpiel({ variante: 'mittel', seed: 'sp', level: 2 });
  z = zug(z, hinweis(z).pfad).zustand;
  const s = JSON.parse(JSON.stringify(zumSpeichern(z)));
  tief(ausSpeicher(s), z, 'Rundlauf');
  gleich(istGueltig(s), true);
  const kaputt = (f) => { const k = JSON.parse(JSON.stringify(s)); f(k); return ausSpeicher(k); };
  gleich(ausSpeicher(null), null);
  gleich(ausSpeicher('x'), null);
  gleich(ausSpeicher([]), null);
  gleich(ausSpeicher({}), null);
  gleich(kaputt((k) => { k.version = 2; }), null);
  gleich(kaputt((k) => { k.variante = 'x'; }), null);
  gleich(kaputt((k) => { k.variante = 'leicht'; }), null, 'passt nicht zu Raster');
  gleich(kaputt((k) => { k.seed = 5; }), null);
  gleich(kaputt((k) => { k.seed = 'x'.repeat(100); }), null);
  gleich(kaputt((k) => { k.b = 7; }), null);
  gleich(kaputt((k) => { k.brett.pop(); }), null);
  gleich(kaputt((k) => { k.brett[0] = 9; }), null, 'fremde Farbe');
  gleich(kaputt((k) => { k.brett[0] = 1.5; }), null);
  gleich(kaputt((k) => { k.brett[0] = '0'; }), null);
  gleich(kaputt((k) => { k.farben = [0, 1]; }), null);
  gleich(kaputt((k) => { k.rng = [1, 2, 3]; }), null);
  gleich(kaputt((k) => { k.rng[0] = -1; }), null);
  gleich(kaputt((k) => { k.rng[0] = 2 ** 32; }), null);
  gleich(kaputt((k) => { k.level = 0; }), null);
  gleich(kaputt((k) => { k.level = 1.5; }), null);
  gleich(kaputt((k) => { k.ziele[0] += 1; }), null, 'Ziele müssen zum Level passen');
  gleich(kaputt((k) => { k.ziele = null; }), null);
  gleich(kaputt((k) => { k.rest[0] = -1; }), null);
  gleich(kaputt((k) => { k.rest[0] = 999; }), null, 'Rest über Ziel');
  gleich(kaputt((k) => { k.rest = null; }), null);
  gleich(kaputt((k) => { k.rest.push(1); }), null);
  gleich(kaputt((k) => { k.gesammelt = -1; }), null);
  gleich(kaputt((k) => { k.gesammelt = 1e12; }), null);
  gleich(kaputt((k) => { k.zuege = 'a'; }), null);
  gleich(kaputt((k) => { k.verlauf = {}; }), null);
  gleich(kaputt((k) => { k.verlauf[0].brett.pop(); }), null);
  gleich(kaputt((k) => { k.verlauf[0].rng = null; }), null);
  gleich(kaputt((k) => { k.verlauf[0] = null; }), null);
  gleich(kaputt((k) => { k.verlauf = new Array(VERLAUF_MAX + 1).fill(k.verlauf[0]); }), null, 'zu langer Verlauf');
  // endlos: Ziele müssen null sein
  const e = JSON.parse(JSON.stringify(zumSpeichern(neuesSpiel({ variante: 'endlos', seed: 'e' }))));
  wahr(ausSpeicher(e));
  const e2 = { ...e, ziele: [1], rest: [1] };
  gleich(ausSpeicher(e2), null);
  gleich(ausSpeicher({ ...e, level: 1 }), null);
  // Unbekannte Felder werden verworfen, Prototyp bleibt sauber
  const fremd = ausSpeicher({ ...e, boese: '<img>', __proto__: { x: 1 } });
  wahr(fremd && !('boese' in fremd));
  const proto = ausSpeicher(JSON.parse(`{"__proto__":{"verseucht":1},"version":1}`));
  gleich(proto, null);
  gleich(({}).verseucht, undefined);
});

test('Punkte: Spielstand ist reines JSON (keine Sonderwerte)', () => {
  let z = neuesSpiel({ variante: 'leicht', seed: 'json' });
  z = zug(z, hinweis(z).pfad).zustand;
  const text = JSON.stringify(zumSpeichern(z));
  wahr(!/Infinity|NaN|null,null/.test(text));
  tief(JSON.parse(text), zumSpeichern(z));
  gleich(zumSpeichern(z).standVersion, undefined);
});

test('Punkte: Quelltext enthält keine Töne, Vibration, eval oder innerHTML mit Daten', async () => {
  for (const datei of ['logik.js', 'index.js']) {
    const text = await (await fetch(new URL(`../../spiele/punkte-verbinden/${datei}`, import.meta.url))).text();
    wahr(!/vibrate|AudioContext|new Audio|\.play\(|eval\(|new Function|innerHTML/.test(text), datei);
  }
  const css = await (await fetch(new URL('../../spiele/punkte-verbinden/stil.css', import.meta.url))).text();
  wahr(!/#[0-9a-fA-F]{3,6}\b/.test(css), 'keine festen Farben im CSS');
});

// ---------- Oberfläche mit kaputten Spielständen (wie kern/robustheit.test.js) ----------
import modul from '../../spiele/punkte-verbinden/index.js';
import { erstelleSpeicher } from '../../kern/speicher.js';
import { erstelleEinstellungen } from '../../kern/einstellungen.js';
import { erstelleFarben } from '../../kern/farben.js';
import * as eingabe from '../../kern/eingabe.js';
import { falscherSpeicher } from '../kern/hilfen.js';

function kontext(signal, variante = 'endlos', protokoll = {}) {
  const speicher = erstelleSpeicher({ backend: falscherSpeicher() });
  const einstellungen = erstelleEinstellungen(speicher);
  return {
    variante,
    speicher: speicher.bereich(`${modul.id}:daten:`),
    einstellungen: Object.assign(Object.create(einstellungen), { spiel: einstellungen.spiel(modul.id) }),
    statistik: { melde() {} },
    zufall: (s, zz) => erstelleZufall(s, zz),
    neuerSeed,
    farben: erstelleFarben(einstellungen),
    eingabe,
    signal,
    bewegungReduziert: () => true,
    worker: () => { throw new Error('kein Worker nötig'); },
    meldung(t) { (protokoll.meldungen ||= []).push(t); },
    meldeAenderung() { protokoll.aenderungen = (protokoll.aenderungen || 0) + 1; },
    meldeGewonnen(t, o) { protokoll.gewonnen = t; protokoll.gewonnenOptionen = o; },
    neuesSpiel() {},
  };
}

async function starte(stand, variante = 'endlos', fn = null) {
  const fehler = [];
  const beiFehler = (e) => { fehler.push(e.error?.message || e.reason?.message || String(e.message)); e.preventDefault?.(); };
  window.addEventListener('error', beiFehler);
  window.addEventListener('unhandledrejection', beiFehler);
  const ac = new AbortController();
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:700px';
  document.body.append(container);
  const protokoll = {};
  let html = '';
  try {
    const instanz = modul.erstelle(container, kontext(ac.signal, variante, protokoll), stand);
    if (fn) await fn(instanz, container, protokoll);
    instanz.getStand(); instanz.zusammenfassung?.();
    html = container.innerHTML;
    instanz.zerstoere();
  } catch (f) { fehler.push(f?.message || String(f)); }
  ac.abort();
  container.remove();
  window.removeEventListener('error', beiFehler);
  window.removeEventListener('unhandledrejection', beiFehler);
  return { fehler, html, protokoll };
}

test('Punkte: Oberfläche übersteht kaputte und manipulierte Spielstände', async () => {
  const BOESE = '<img src=x data-boese="1">';
  const gut = JSON.parse(JSON.stringify(zumSpeichern(neuesSpiel({ variante: 'leicht', seed: 'rob', level: 2 }))));
  const faelle = [null, 0, 'x', [], {}, { version: 1 }, JSON.parse('{"__proto__":{"verseucht":1}}')];
  for (const k of Object.keys(gut)) {
    for (const w of [BOESE, -1, 1e12, null, [], {}, [BOESE], true, 'NaN']) faelle.push({ ...gut, [k]: w });
    if (Array.isArray(gut[k]) && gut[k].length) {
      faelle.push({ ...gut, [k]: [BOESE, ...gut[k].slice(1)] });
      faelle.push({ ...gut, [k]: gut[k].slice(0, 1) });
    }
  }
  const ok = await starte(gut, 'leicht');
  gleich(ok.fehler.join('|'), '');
  wahr(/pv-zelle/.test(ok.html));
  const probleme = [];
  for (let i = 0; i < faelle.length; i++) {
    const r = await starte(faelle[i]);
    if (r.fehler.length) probleme.push(`Fall ${i}: ${r.fehler[0]}`);
    if (/data-boese/.test(r.html)) probleme.push(`Fall ${i}: HTML`);
  }
  gleich(probleme.slice(0, 5).join(' | '), '', `${probleme.length} Probleme bei ${faelle.length} Fällen`);
  gleich(({}).verseucht, undefined);
});

test('Punkte: Oberfläche – Tastatur-Bedienung, Rückgängig, Gewinn, Neustart', async () => {
  const taste = (key) => ({ key, ctrlKey: false, metaKey: false, altKey: false, target: document.body });
  // Feld mit bekannter Kette: obere Zeile 0,0 (Felder 0 und 1)
  let z = neuesSpiel({ variante: 'endlos', seed: 'tast' });
  z = { ...z, brett: z.brett.map((_, i) => [0, 5, 3, 2, 6][(i * 7 + Math.floor(i / 6)) % 5]) };
  z.brett[0] = 0; z.brett[1] = 0; z.brett[2] = 5; z.brett[3] = 3;
  const r = await starte(zumSpeichern(z), 'endlos', (instanz, container, prot) => {
    const vorher = instanz.getStand().brett.slice();
    gleich(instanz.onTaste(taste('Enter')), true, 'Enter ohne Kette wird verarbeitet');
    // Cursor auf Feld 0 (Mitte → nach links/oben)
    for (let i = 0; i < 6; i++) instanz.onTaste(taste('ArrowLeft'));
    for (let i = 0; i < 6; i++) instanz.onTaste(taste('ArrowUp'));
    gleich(instanz.onTaste(taste(' ')), true);
    instanz.onTaste(taste('ArrowRight'));
    instanz.onTaste(taste(' '));
    gleich(container.querySelectorAll('.pv-zelle.im-pfad').length, 2, 'zwei Glieder gesetzt');
    instanz.onTaste(taste(' '));            // Leertaste auf letztem Glied nimmt es zurück
    gleich(container.querySelectorAll('.pv-zelle.im-pfad').length, 1);
    instanz.onTaste(taste(' '));
    gleich(container.querySelectorAll('.pv-zelle.im-pfad').length, 2);
    instanz.onTaste(taste('Escape'));
    gleich(container.querySelectorAll('.pv-zelle.im-pfad').length, 0, 'Esc verwirft');
    instanz.onTaste(taste(' ')); instanz.onTaste(taste('ArrowLeft')); instanz.onTaste(taste(' '));
    instanz.onTaste(taste('Enter'));
    const nachher = instanz.getStand();
    gleich(nachher.zuege, 1);
    gleich(nachher.gesammelt, 2);
    wahr(instanz.kannRueckgaengig());
    instanz.rueckgaengig();
    tief(instanz.getStand().brett, vorher, 'Rückgängig');
    gleich(instanz.onTaste(taste('q')), false, 'andere Tasten gehören der Shell');
    instanz.hinweis();
    wahr(container.querySelectorAll('.pv-zelle.hinweis').length >= 2, 'Hinweis sichtbar');
    instanz.neustart();
    gleich(instanz.getStand().zuege, 0);
    gleich(prot.gewonnen, undefined);
  });
  gleich(r.fehler.join('|'), '');
});

test('Punkte: Oberfläche – Level gewonnen wird gemeldet und Level-Zähler steigt', async () => {
  let z = neuesSpiel({ variante: 'leicht', seed: 'sieg', level: 1 });
  z = { ...z, rest: [2, 0, 0, 0] };
  // zwei benachbarte Nullen an den Anfang setzen
  z.brett[0] = 0; z.brett[1] = 0;
  const r = await starte(zumSpeichern(z), 'leicht', (instanz, container, prot) => {
    const t = (key) => ({ key, ctrlKey: false, metaKey: false, altKey: false, target: document.body });
    for (let i = 0; i < 6; i++) { instanz.onTaste(t('ArrowLeft')); instanz.onTaste(t('ArrowUp')); }
    instanz.onTaste(t(' ')); instanz.onTaste(t('ArrowRight')); instanz.onTaste(t(' ')); instanz.onTaste(t('Enter'));
    wahr(prot.gewonnen && /Level 1 geschafft/.test(prot.gewonnen), `Gewinn gemeldet: ${prot.gewonnen}`);
    gleich(instanz.kannRueckgaengig(), false, 'nach dem Gewinn gesperrt');
  });
  gleich(r.fehler.join('|'), '');
});


test('Punkte: Oberfläche – festgefahrenes Feld zeigt Meldung, Neu mischen hilft und ist rückgängig-fähig', async () => {
  const z0 = neuesSpiel({ variante: 'endlos', seed: 'fest' });
  const brett = z0.brett.map((_, i) => z0.farben[((i % z0.b) + 2 * Math.floor(i / z0.b)) % 5]);
  gleich(festgefahren(brett, z0.b, z0.hh), true, 'Testfeld ist wirklich festgefahren');
  const r = await starte(zumSpeichern({ ...z0, brett }), 'endlos', (instanz, container, prot) => {
    const status = container.querySelector('.pv-status');
    wahr(/Kein Zug mehr – Rückgängig oder Neu mischen/.test(status.textContent), 'Meldung sichtbar');
    wahr(prot.meldungen.some((m) => /Kein Zug mehr/.test(m)), 'ctx.meldung');
    gleich(instanz.getStand().zuege, 0, 'nicht heimlich gemischt');
    container.querySelector('.pv-misch').click();
    gleich(status.textContent, '', 'Meldung weg');
    gleich(instanz.getStand().zuege, 1, 'Umordnen zählt als Zug');
    wahr(instanz.kannRueckgaengig());
    instanz.rueckgaengig();
    tief(instanz.getStand().brett, brett, 'Rückgängig stellt das alte Feld her');
    wahr(/Kein Zug mehr/.test(status.textContent));
  });
  gleich(r.fehler.join('|'), '');
});

test('Punkte: Oberfläche – Zeiger-Ziehen setzt Kette, Loslassen räumt, Zurückziehen nimmt Glied zurück', async () => {
  let z = neuesSpiel({ variante: 'endlos', seed: 'maus' });
  z.brett[0] = 0; z.brett[1] = 0; z.brett[2] = 0; z.brett[8] = 5;
  const r = await starte(zumSpeichern(z), 'endlos', async (instanz, container) => {
    const f = container.querySelector('.pv-feld');
    await new Promise((res) => {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('../../spiele/punkte-verbinden/stil.css', import.meta.url).href;
      l.onload = l.onerror = res; document.head.append(l); setTimeout(res, 1500);
    });
    const box = f.getBoundingClientRect();
    const mitte = (i) => ({ clientX: box.left + ((i % 6) + 0.5) * box.width / 6, clientY: box.top + (Math.floor(i / 6) + 0.5) * box.height / 7 });
    const ev = (typ, i) => f.dispatchEvent(new PointerEvent(typ, { ...mitte(i), pointerId: 7, isPrimary: true, button: 0, pointerType: 'mouse', bubbles: true }));
    ev('pointerdown', 0); ev('pointermove', 1); ev('pointermove', 2);
    gleich(container.querySelectorAll('.pv-zelle.im-pfad').length, 3);
    ev('pointermove', 1);
    gleich(container.querySelectorAll('.pv-zelle.im-pfad').length, 2, 'Zurückziehen');
    ev('pointermove', 7);                  // senkrechter Nachbar mit anderer Farbe → ignoriert
    gleich(container.querySelectorAll('.pv-zelle.im-pfad').length, 2);
    ev('pointerup', 1);
    gleich(instanz.getStand().gesammelt, 2);
    gleich(container.querySelectorAll('.pv-zelle.im-pfad').length, 0);
    // einzelnes Antippen räumt nichts
    ev('pointerdown', 20); ev('pointerup', 20);
    gleich(instanz.getStand().zuege, 1);
  });
  gleich(r.fehler.join('|'), '');
});

test('Punkte: Weiterspielen – Flag, Validierung, kein zweites Gewonnen', async () => {
  let z = neuesSpiel({ variante: 'leicht', seed: 'weiter', level: 1 });
  gleich(z.weiter, false);
  z = { ...z, rest: [0, 0, 0, 0] };
  gleich(gewonnen(z), true);
  const w = weiterspielen(z);
  gleich(w.weiter, true);
  gleich(gewonnen(w), false, 'nach Weiterspielen nie wieder gewonnen');
  const s = JSON.parse(JSON.stringify(zumSpeichern(w)));
  tief(ausSpeicher(s), w, 'Flag überlebt Speichern/Laden');
  // alter Stand ohne Flag → false
  const alt = JSON.parse(JSON.stringify(zumSpeichern(neuesSpiel({ variante: 'mittel', seed: 'alt' }))));
  delete alt.weiter;
  gleich(ausSpeicher(alt).weiter, false);
  for (const falsch of [1, 'true', null, [], {}]) gleich(ausSpeicher({ ...alt, weiter: falsch }), null, JSON.stringify(falsch));
  const e = JSON.parse(JSON.stringify(zumSpeichern(neuesSpiel({ variante: 'endlos', seed: 'e' }))));
  gleich(ausSpeicher({ ...e, weiter: true }), null, 'endlos kennt kein Weiterspielen');
  gleich(weiterspielen(neuesSpiel({ variante: 'endlos', seed: 'e' })).weiter, false);

  // Oberfläche: Gewinn einmal melden, weiterspielen, danach nie wieder melden, Neuladen bleibt endlos
  const start = JSON.parse(JSON.stringify(zumSpeichern({ ...neuesSpiel({ variante: 'leicht', seed: 'ui', level: 1 }), rest: [2, 0, 0, 0] })));
  start.brett[0] = 0; start.brett[1] = 0; start.brett[2] = 0; start.brett[3] = 0;
  const t = (key) => ({ key, ctrlKey: false, metaKey: false, altKey: false, target: document.body });
  let stand = null;
  const r = await starte(start, 'leicht', (instanz, container, prot) => {
    let gemeldet = 0; let optionen = null;
    const ursprung = prot.gewonnen;
    for (let i = 0; i < 6; i++) { instanz.onTaste(t('ArrowLeft')); instanz.onTaste(t('ArrowUp')); }
    instanz.onTaste(t(' ')); instanz.onTaste(t('ArrowRight')); instanz.onTaste(t(' ')); instanz.onTaste(t('Enter'));
    wahr(prot.gewonnen && prot.gewonnen !== ursprung, 'Gewinn gemeldet');
    wahr(prot.gewonnenOptionen?.weiterspielen === true, 'Option weiterspielen übergeben');
    prot.gewonnen = null; gemeldet = 0; optionen = null;
    wahr(typeof instanz.weiterspielen === 'function');
    instanz.weiterspielen();
    gleich(instanz.getStand().weiter, true);
    wahr(!container.querySelector('.pv-ziel'), 'Ziele ausgeblendet');
    wahr(/Ohne Ziel/.test(container.querySelector('.pv-level').textContent));
    // weiter ziehen: Felder 0..3 liegen nach dem Nachfüllen anders – Hinweis nutzen
    for (let i = 0; i < 5; i++) {
      instanz.hinweis();
      instanz.onTaste(t('Enter'));
    }
    gleich(prot.gewonnen, null, 'kein zweites meldeGewonnen');
    stand = instanz.getStand();
  });
  gleich(r.fehler.join('|'), '');
  wahr(stand.zuege > 1 && stand.weiter === true);
  const r2 = await starte(stand, 'leicht', (instanz, container, prot) => {
    gleich(instanz.getStand().weiter, true, 'nach Neuladen weiter im Endlos-Betrieb');
    wahr(!container.querySelector('.pv-ziel'));
    gleich(prot.gewonnen, undefined, 'beim Laden nicht erneut gemeldet');
  });
  gleich(r2.fehler.join('|'), '');
});
