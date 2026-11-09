import { test, gleich, tief, wahr } from '../mini-test.js';
import * as L from '../../spiele/schachtbetrieb/logik.js';
import modul from '../../spiele/schachtbetrieb/index.js';
import { erstelleSpeicher } from '../../kern/speicher.js';
import { erstelleEinstellungen } from '../../kern/einstellungen.js';
import { erstelleZufall, neuerSeed } from '../../kern/zufall.js';
import { erstelleFarben } from '../../kern/farben.js';
import * as eingabe from '../../kern/eingabe.js';
import { falscherSpeicher } from '../kern/hilfen.js';

/** Stets das günstigste Upgrade kaufen; liefert die Wartezeiten (s) je Kauf */
function greedy(anzahl, z = L.neuesBergwerk(0)) {
  const waits = [];
  let gesamt = 0;
  for (let i = 0; i < anzahl; i++) {
    const g = L.naechstesZiel(z);
    let w = 0;
    while (z.geld < g.preis && w < 10000) { z = L.fortschritt(z, 1); w++; }
    z = L.kaufe(z, g.was).zustand;
    waits.push(w);
    gesamt += w;
  }
  return { waits, gesamt, z };
}

function reich(extra = {}) {
  const z = L.neuesBergwerk(0);
  z.geld = 1e6;
  return Object.assign(z, extra);
}

test('Zahlen: kompakt im deutschen Format', () => {
  gleich(L.formatiere(0), '0');
  gleich(L.formatiere(5), '5');
  gleich(L.formatiere(12.5), '12,5');
  gleich(L.formatiere(999), '999');
  gleich(L.formatiere(1234), '1.234');
  gleich(L.formatiere(999999), '999.999');
  gleich(L.formatiere(1.2e6), '1,2 Mio.');
  gleich(L.formatiere(3.45e9), '3,4 Mrd.');
  gleich(L.formatiere(2e12), '2 Bio.');
  gleich(L.formatiere(NaN), '0');
  gleich(L.formatiere(Infinity), '0');
  gleich(L.formatiere(1e30).includes('Quad.'), true);
  gleich(L.formatiereDauer(0), 'sofort');
  gleich(L.formatiereDauer(45), '45 s');
  gleich(L.formatiereDauer(600), '10 min');
  gleich(L.formatiereDauer(Infinity), 'unbekannt');
});

test('Start: ein Schacht, Stufe 1, kein Geld', () => {
  const z = L.neuesBergwerk(1000);
  gleich(z.schaechte.length, 1);
  gleich(z.geld, 0);
  wahr(L.istGueltig(z));
  wahr(L.einkommen(z) > 0 && L.einkommen(z) < 5);
});

test('Fortschritt: Geld wächst, Original bleibt unverändert, ohne Zufall deterministisch', () => {
  const z = reich();
  const vorher = JSON.stringify(z);
  const a = L.fortschritt(z, 123.4);
  const b = L.fortschritt(z, 123.4);
  gleich(JSON.stringify(z), vorher, 'unverändert');
  tief(a, b, 'gleich');
  wahr(a.geld > z.geld, 'Geld wächst');
  wahr(Math.abs(a.uhr - 123.4) < 1e-9);
  tief(L.fortschritt(z, 0), z);
});

test('Fortschritt: kleine und große Schritte liefern fast dasselbe', () => {
  let z = greedy(25).z;
  z.geld = 0;
  const gross = L.fortschritt(z, 1200).geld;
  let k = z;
  for (let i = 0; i < 120; i++) k = L.fortschritt(k, 10);
  wahr(Math.abs(gross - k.geld) / k.geld < 0.1, `${gross} vs ${k.geld}`);
});

test('Fortschritt: riesige dt und krumme Werte bleiben endlich', () => {
  const z = reich();
  const a = L.fortschritt(z, 1e9);
  wahr(Number.isFinite(a.geld) && a.geld > 0 && a.geld <= L.MAX_GELD);
  for (const dt of [NaN, -5, Infinity, -Infinity, 0, '3', null, undefined]) {
    const r = L.fortschritt(z, dt);
    gleich(r.geld, z.geld, `dt=${String(dt)}`);
    gleich(r.uhr, z.uhr);
  }
  // voll ausgebautes Bergwerk
  const voll = L.neuesBergwerk(0);
  voll.aufzug = { tempo: 40, ladung: 40 };
  voll.zentrum = { tempo: 40, ladung: 40, lager: 0 };
  voll.schaechte = Array.from({ length: L.MAX_SCHAECHTE }, () => ({ n: 20, tempo: 40, trag: 40, kiste: 0 }));
  const v = L.fortschritt(voll, 3600);
  wahr(Number.isFinite(v.geld) && v.geld <= L.MAX_GELD && L.istGueltig(v), 'voll');
});

test('Käufe: Preis, Abbuchung, Maximum, ungültige Namen', () => {
  let z = L.neuesBergwerk(0);
  const p = L.preis(z, 's0:n');
  wahr(p > 0);
  gleich(L.kaufe(z, 's0:n').ok, false, 'zu wenig Geld');
  gleich(L.kaufe(z, 's0:n').grund, 'zu wenig Geld');
  z.geld = p + 5;
  const r = L.kaufe(z, 's0:n');
  gleich(r.ok, true);
  gleich(r.zustand.schaechte[0].n, 2);
  gleich(r.zustand.geld, 5);
  gleich(z.schaechte[0].n, 1, 'Original unverändert');
  gleich(L.preis(r.zustand, 's0:n') > p, true, 'wird teurer');
  for (const w of ['', 'x', 's5:n', 's0:xyz', 'aufzug', 'aufzug:n', 'zentrum:trag', '__proto__', 's-1:n', 's99:n', null, undefined, 12]) {
    gleich(L.preis(z, w), null, String(w));
    gleich(L.kaufe(reich(), w).ok, false, String(w));
  }
  // Maximum
  z = reich();
  z.schaechte[0].n = L.MAX_BERGLEUTE;
  gleich(L.preis(z, 's0:n'), null);
  gleich(L.kaufe(z, 's0:n').grund, 'nicht verfügbar');
  z.schaechte[0].tempo = L.MAX_STUFE;
  gleich(L.preis(z, 's0:tempo'), null);
});

test('Käufe: neue Schächte bis zum Maximum', () => {
  let z = reich();
  z.geld = 1e30;
  for (let i = 1; i < L.MAX_SCHAECHTE; i++) {
    const r = L.kaufe(z, 'schacht');
    wahr(r.ok, `Schacht ${i + 1}`);
    z = r.zustand;
  }
  gleich(z.schaechte.length, L.MAX_SCHAECHTE);
  gleich(L.kaufe(z, 'schacht').ok, false);
  wahr(L.istGueltig(z));
  gleich(L.preis(z, `s${L.MAX_SCHAECHTE - 1}:n`) > 0, true);
});

test('Preise: wachsen mit der Stufe, nie explodierend (≤ ×1,8 je Stufe)', () => {
  const z = reich();
  for (const was of ['s0:n', 's0:tempo', 's0:trag', 'aufzug:tempo', 'aufzug:ladung', 'zentrum:tempo', 'zentrum:ladung']) {
    let letzterPreis = 0;
    let c = reich();
    c.geld = 1e30;
    for (let i = 0; i < 12; i++) {
      const p = L.preis(c, was);
      if (p === null) break;
      if (letzterPreis) wahr(p > letzterPreis && p / letzterPreis < 1.8, `${was} Stufe ${i}: ${letzterPreis} → ${p}`);
      letzterPreis = p;
      c = L.kaufe(c, was).zustand;
    }
  }
  void z;
});

test('Wachstumskurve: die ersten 30 Käufe (stets das Günstigste) liegen in den Zielgrenzen', () => {
  const { waits, gesamt } = greedy(30);
  for (let i = 0; i < waits.length; i++) {
    wahr(waits[i] >= 5 && waits[i] <= 180, `Kauf ${i + 1}: ${waits[i]} s`);
  }
  wahr(gesamt < 3600, `Gesamt ${gesamt} s`);
  wahr(gesamt > 300, `nicht zu schnell: ${gesamt} s`);
  const mittel = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  wahr(mittel(waits.slice(15)) >= mittel(waits.slice(0, 15)), 'Wartezeiten werden nicht kürzer');
});

test('Wachstumskurve: auch mit weiteren Schächten bleiben die Wartezeiten sanft', () => {
  const { waits, gesamt } = greedy(70);
  wahr(Math.max(...waits) <= 240, `längste Wartezeit ${Math.max(...waits)} s`);
  wahr(Math.min(...waits.slice(1)) >= 5, `kürzeste Wartezeit ${Math.min(...waits.slice(1))} s`);
  wahr(gesamt < 7200, `Gesamt ${gesamt} s`);
});

test('Nächstes Ziel: günstigstes Upgrade samt Wartezeit', () => {
  const z = L.neuesBergwerk(0);
  const g = L.naechstesZiel(z);
  gleich(g.was, 's0:n');
  wahr(g.wartezeit > 10 && g.wartezeit < 60, `${g.wartezeit}`);
  z.geld = g.preis;
  gleich(L.naechstesZiel(z).wartezeit, 0);
  // alles am Maximum: kein Ziel
  const m = L.neuesBergwerk(0);
  m.schaechte = Array.from({ length: L.MAX_SCHAECHTE }, () => ({ n: 20, tempo: 40, trag: 40, kiste: 0 }));
  m.aufzug = { tempo: 40, ladung: 40 };
  m.zentrum = { tempo: 40, ladung: 40, lager: 0 };
  gleich(L.naechstesZiel(m), null);
  gleich(L.moeglicheKaeufe(m).length, 0);
});

test('Anschub: bringt Förderung, Sperre verhindert Dauerklicken', () => {
  const z = L.neuesBergwerk(0);
  const a = L.anschub(z, 0);
  gleich(a.ok, true);
  wahr(a.zustand.schaechte[0].kiste > 0);
  gleich(L.anschub(a.zustand, 0).ok, false, 'gesperrt');
  const spaeter = L.fortschritt(a.zustand, L.ANSCHUB_SPERRE_S + 0.1);
  gleich(L.anschub(spaeter, 0).ok, true, 'wieder frei');
  gleich(L.anschub(z, 5).ok, false);
  gleich(L.anschub(z, -1).ok, false);
  gleich(L.anschub(z, 0.5).ok, false);
});

test('Offline: Lücke gedeckelt (8 h) und Faktor ≤ 1', () => {
  gleich(L.luecke(0), 0);
  gleich(L.luecke(30), 30);
  gleich(L.luecke(60), 60);
  gleich(L.luecke(120), 90);
  const deckel = L.luecke(8 * 3600);
  wahr(deckel < 8 * 3600 && deckel > 4 * 3600, `${deckel}`);
  gleich(L.luecke(100 * 3600), deckel, 'über 8 h zählt nichts mehr');
  gleich(L.luecke(1e18), deckel);
  for (const dt of [1, 59, 61, 600, 3600, 30000, 1e9]) wahr(L.luecke(dt) <= dt, `Faktor bei ${dt}`);
  // monoton
  let letzter = 0;
  for (let dt = 0; dt <= 40000; dt += 137) { const l = L.luecke(dt); wahr(l >= letzter); letzter = l; }
});

test('Offline: Verrechnung beim Öffnen, Deckel, kein Fortschritt bei Uhr-Unsinn', () => {
  const z = greedy(15).z;
  z.t = 1_000_000_000_000;
  const stunde = L.offline(z, z.t + 3600_000);
  wahr(stunde.gewinn > 0 && stunde.zustand.geld > z.geld);
  gleich(stunde.dt, 3600);
  gleich(stunde.zustand.t, z.t + 3600_000, 'neuer Zeitstempel');
  const tag = L.offline(z, z.t + 24 * 3600_000);
  const acht = L.offline(z, z.t + 8 * 3600_000);
  gleich(tag.zustand.geld, acht.zustand.geld, 'Deckel 8 h');
  gleich(tag.dt, 8 * 3600);
  // Uhr zurück / Unsinn
  for (const jetzt of [z.t - 5000, z.t - 1e9, NaN, Infinity, -1, 'x', undefined, null]) {
    const r = L.offline(z, jetzt);
    gleich(r.zustand.geld, z.geld, `jetzt=${String(jetzt)}`);
    gleich(r.gewinn, 0);
    gleich(r.dt, 0);
  }
  // gleiche Eingabe → gleiches Ergebnis
  tief(L.offline(z, z.t + 7200_000).zustand, L.offline(z, z.t + 7200_000).zustand);
  // Gewinn wächst mit der Abwesenheit, aber unterproportional
  const h1 = L.offline(z, z.t + 3600_000).gewinn;
  const h2 = L.offline(z, z.t + 7200_000).gewinn;
  wahr(h2 > h1 && h2 < 2 * h1 * 1.01, `${h1} ${h2}`);
});

test('Zeit rückwärts: negative dt wirkt nie; Stand-Zeitstempel bleibt begrenzt', () => {
  const z = reich();
  gleich(L.fortschritt(z, -100).geld, z.geld);
  gleich(L.zumSpeichern(z, NaN).t, 0);
  gleich(L.zumSpeichern(z, -5).t, 0);
  gleich(L.zumSpeichern(z, 1e15).t, 0);
  gleich(L.zumSpeichern(z, 1234).t, 1234);
  gleich(L.neuesBergwerk(NaN).t, 0);
});

test('Spielstand: JSON-tauglich, streng validiert', () => {
  const z = greedy(20).z;
  const s = JSON.parse(JSON.stringify(L.zumSpeichern(z, 5000)));
  tief(L.ausSpeicher(s), s);
  gleich(s.v, 1);
  const kopie = () => JSON.parse(JSON.stringify(s));
  const falsch = [];
  const setze = (fn) => { const k = kopie(); fn(k); falsch.push(k); };
  setze((k) => { k.geld = NaN; });
  setze((k) => { k.geld = null; });
  setze((k) => { k.geld = '5'; });
  setze((k) => { k.geld = -1; });
  setze((k) => { k.geld = 1e31; });
  setze((k) => { k.gesamt = -1; });
  setze((k) => { k.t = -1; });
  setze((k) => { k.t = 5e12; });
  setze((k) => { k.uhr = -3; });
  setze((k) => { k.v = 2; });
  setze((k) => { delete k.v; });
  setze((k) => { k.schaechte = []; });
  setze((k) => { k.schaechte = 'x'; });
  setze((k) => { k.schaechte = Array.from({ length: L.MAX_SCHAECHTE + 1 }, () => k.schaechte[0]); });
  setze((k) => { k.schaechte = Array.from({ length: 31 }, () => k.schaechte[0]); });
  setze((k) => { k.schaechte[0] = null; });
  setze((k) => { k.schaechte[0].n = 0; });
  setze((k) => { k.schaechte[0].n = L.MAX_BERGLEUTE + 1; });
  setze((k) => { k.schaechte[0].n = 1.5; });
  setze((k) => { k.schaechte[0].tempo = L.MAX_STUFE + 1; });
  setze((k) => { k.schaechte[0].trag = 0; });
  setze((k) => { k.schaechte[0].kiste = -1; });
  setze((k) => { k.schaechte[0].kiste = NaN; });
  setze((k) => { k.aufzug.tempo = 41; });
  setze((k) => { k.aufzug = null; });
  setze((k) => { k.zentrum.ladung = 0.5; });
  setze((k) => { k.zentrum.lager = -2; });
  setze((k) => { k.zentrum = []; });
  for (const f of falsch) gleich(L.istGueltig(f), false, JSON.stringify(f).slice(0, 80));
  for (const f of [null, undefined, 0, 'x', [], {}, true, 12, () => 1]) gleich(L.istGueltig(f), false, String(f));
  // Zusatzfelder werden nicht übernommen
  const mit = kopie();
  mit.extra = '<b>x</b>';
  mit.schaechte[0].extra = 1;
  const sauber = L.ausSpeicher(mit);
  gleich('extra' in sauber, false);
  gleich('extra' in sauber.schaechte[0], false);
});

test('Spielstand: Zufallsbelastung (Fuzz) wirft nie etwas anderes als einen Fehler', () => {
  const gut = JSON.parse(JSON.stringify(L.zumSpeichern(greedy(10).z, 1)));
  const werte = [NaN, Infinity, -Infinity, null, undefined, '1', [], {}, true, 0, -1, 1e300, 0.5];
  let n = 0;
  for (const k of ['geld', 'gesamt', 't', 'uhr', 'sperre', 'aufzug', 'zentrum', 'schaechte', 'v']) {
    for (const w of werte) {
      const f = { ...gut, [k]: w };
      try { L.ausSpeicher(f); n++; } catch (e) { wahr(e instanceof Error); }
    }
  }
  wahr(n >= 0);
});

// ---------- Oberfläche ----------
function falscherKontext(signal, zaehler = {}) {
  const speicher = erstelleSpeicher({ backend: falscherSpeicher() });
  const einstellungen = erstelleEinstellungen(speicher);
  return {
    variante: 'standard',
    speicher: speicher.bereich('schachtbetrieb:daten:'),
    einstellungen: Object.assign(Object.create(einstellungen), { spiel: einstellungen.spiel('schachtbetrieb') }),
    statistik: { melde() {} },
    zufall: (s, z) => erstelleZufall(s, z),
    neuerSeed,
    farben: erstelleFarben(einstellungen),
    eingabe,
    signal,
    bewegungReduziert: () => zaehler.still ?? false,
    worker: () => { throw new Error('kein Worker'); },
    meldung(t) { zaehler.meldungen = (zaehler.meldungen || 0) + 1; zaehler.letzte = t; },
    meldeAenderung() { zaehler.aenderungen = (zaehler.aenderungen || 0) + 1; },
    meldeGewonnen() {},
    neuesSpiel() {},
  };
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function mit(stand, fn, zaehler = {}) {
  const ac = new AbortController();
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;height:700px';
  document.body.append(container);
  const instanz = modul.erstelle(container, falscherKontext(ac.signal, zaehler), stand);
  try { return await fn(instanz, container); } finally {
    instanz.zerstoere();
    ac.abort();
    container.remove();
  }
}

test('Modul: Metadaten', () => {
  gleich(modul.id, 'schachtbetrieb');
  gleich(modul.name, 'Schachtbetrieb');
  gleich(modul.standVersion, 1);
  tief(modul.varianten, [{ id: 'standard', name: 'Standard' }]);
});

test('Oberfläche: frischer Start, Rückgängig gibt es nicht, Stand JSON-tauglich', async () => {
  await mit(null, async (i, c) => {
    gleich(c.querySelectorAll('.sb-schacht').length, 1);
    wahr(c.querySelectorAll('.sb-kauf').length >= 7);
    gleich(i.kannRueckgaengig(), false);
    gleich(i.rueckgaengig(), false);
    const st = i.getStand();
    tief(JSON.parse(JSON.stringify(st)), st);
    wahr(L.istGueltig(st));
    wahr(typeof i.zusammenfassung() === 'string' && i.zusammenfassung().includes('Taler'));
    wahr(c.querySelector('.sb-ziel-text').textContent.includes('Bergleute'));
    wahr(c.querySelector('.sb-weg').hidden, 'kein Abwesenheitshinweis beim Neustart');
    for (const b of c.querySelectorAll('.sb-kauf')) {
      wahr(b.getAttribute('aria-label'), 'aria-label');
      gleich(b.tagName, 'BUTTON');
    }
  });
});

test('Oberfläche: zu teure Knöpfe sind aria-disabled; Kaufen zieht Geld ab und meldet die Änderung', async () => {
  const z = L.neuesBergwerk(Date.now());
  z.geld = L.preis(z, 's0:n') + 1;
  const zaehler = {};
  await mit(L.zumSpeichern(z, Date.now()), async (i, c) => {
    const n = c.querySelector('[data-was="s0:n"]');
    const tempo = c.querySelector('[data-was="s0:tempo"]');
    gleich(n.getAttribute('aria-disabled'), 'false');
    gleich(tempo.getAttribute('aria-disabled'), 'true');
    tempo.click();
    gleich(i.getStand().schaechte[0].tempo, 1, 'zu teuer → nichts gekauft');
    wahr((zaehler.meldungen || 0) >= 1, 'Hinweis „zu wenig Taler“');
    n.click();
    gleich(i.getStand().schaechte[0].n, 2);
    wahr(i.getStand().geld < z.geld, 'Geld abgebucht');
    wahr((zaehler.aenderungen || 0) >= 1, 'meldeAenderung');
    gleich(c.querySelector('[data-was="s0:n"] .sb-kauf-stufe').textContent.startsWith('2'), true);
  }, zaehler);
});

test('Oberfläche: Taste K kauft das Nächste Ziel; andere Tasten gehören der Shell', async () => {
  const z = L.neuesBergwerk(Date.now());
  z.geld = 100;
  await mit(L.zumSpeichern(z, Date.now()), async (i) => {
    gleich(i.onTaste({ key: 'z' }), false);
    gleich(i.onTaste({ key: 'n' }), false);
    gleich(i.onTaste({ key: 'k', ctrlKey: true }), false);
    gleich(i.onTaste({ key: 'k' }), true);
    gleich(i.getStand().schaechte[0].n, 2);
  });
});

test('Oberfläche: Abwesenheit wird beim Öffnen verrechnet und angezeigt', async () => {
  const z = greedy(10).z;
  const jetzt = Date.now();
  const vorher = z.geld;
  await mit(L.zumSpeichern(z, jetzt - 3 * 3600_000), async (i, c) => {
    wahr(!c.querySelector('.sb-weg').hidden, 'Hinweis sichtbar');
    wahr(c.querySelector('.sb-weg-text').textContent.startsWith('Während du weg warst'));
    wahr(i.getStand().geld > vorher);
    c.querySelector('.sb-weg .knopf').click();
    wahr(c.querySelector('.sb-weg').hidden, 'Hinweis schließbar');
  });
  // Zeitstempel in der Zukunft: kein Gewinn, kein Hinweis
  await mit(L.zumSpeichern(z, jetzt + 3600_000), async (i, c) => {
    gleich(i.getStand().geld < vorher + 5 * L.einkommen(z), true);
    wahr(c.querySelector('.sb-weg').hidden);
  });
});

test('Oberfläche: Tick rechnet weiter, Schächte erscheinen nach dem Kauf', async () => {
  const z = L.neuesBergwerk(Date.now());
  z.geld = 1e6;
  await mit(L.zumSpeichern(z, Date.now()), async (i, c) => {
    c.querySelector('[data-was="schacht"]').click();
    gleich(c.querySelectorAll('.sb-schacht').length, 2);
    await warte(700);
    wahr(i.getStand().geld !== 1e6 - L.preis(z, 'schacht'), 'Geld hat sich bewegt');
    wahr(i.getStand().schaechte[1].kiste >= 0);
    i.neu();
    gleich(c.querySelectorAll('.sb-schacht').length, 1, 'Neues Bergwerk');
    gleich(i.getStand().geld, 0);
    gleich(i.getStand().schaechte.length, 1);
  });
});

test('Oberfläche: bewegungReduziert schaltet die Dauerbewegung ab (Klasse sb-still)', async () => {
  await mit(null, async (i, c) => {
    wahr(!c.querySelector('.sb').classList.contains('sb-still'));
  }, { still: false });
  await mit(null, async (i, c) => {
    wahr(c.querySelector('.sb').classList.contains('sb-still'));
  }, { still: true });
});

test('Oberfläche: Pause und Fortsetzen (versteckter Tab) rechnen nach dem Zeitstempel nach', async () => {
  const z = greedy(10).z;
  await mit(L.zumSpeichern(z, Date.now()), async (i) => {
    i.pausiere();
    const g = i.getStand().geld;
    i.fortsetze();
    wahr(i.getStand().geld >= g);
    i.zerstoere();
    i.fortsetze();   // nach dem Zerstören nichts mehr tun
  });
});

// Kaputte/manipulierte Spielstände (wie kern/robustheit.test.js, hier direkt für dieses Spiel)
const BOESE = '<img src=x data-boese="1"><script data-boese="1">window.__boese=1</script>';
test('Robustheit: kaputte und manipulierte Spielstände', async () => {
  const gut = JSON.parse(JSON.stringify(L.zumSpeichern(greedy(12).z, Date.now())));
  const faelle = [null, 0, 'x', [], {}, { version: 1 }, { __proto__: null }, JSON.parse('{"__proto__":{"verseucht":1}}')];
  const werte = [BOESE, -1, 1e12, null, [], {}, [BOESE], { a: BOESE }, true, 'NaN'];
  for (const k of Object.keys(gut)) for (const w of werte) faelle.push({ ...gut, [k]: w });
  faelle.push({ ...gut, schaechte: [BOESE, ...gut.schaechte.slice(1)] });
  faelle.push({ ...gut, schaechte: gut.schaechte.slice(0, 1) });
  const probleme = [];
  for (let n = 0; n < faelle.length; n++) {
    try {
      await mit(faelle[n], async (i, c) => {
        await warte(30);
        i.getStand(); i.zusammenfassung();
        if (/data-boese/.test(c.innerHTML)) probleme.push(`Fall ${n}: HTML`);
      });
    } catch (f) { probleme.push(`Fall ${n}: ${f.message}`); }
  }
  wahr(!window.__boese && !({}).verseucht);
  gleich(probleme.slice(0, 4).join(' | '), '', `${probleme.length} Probleme bei ${faelle.length} Fällen`);
});

test('Still: kein vibrate/Audio/eval/innerHTML, keine Inline-Styles als Text', async () => {
  for (const d of ['index.js', 'logik.js']) {
    const q = await fetch(new URL(`../../spiele/schachtbetrieb/${d}`, import.meta.url)).then((r) => r.text());
    wahr(!/\bvibrate\b|new\s+Audio\b|AudioContext|\.play\(\)|\beval\(|new Function|innerHTML|cssText|setAttribute\(\s*'style'/.test(q), d);
    wahr(!/Math\.random|requestAnimationFrame/.test(q), `${d}: kein Zufall, kein rAF`);
  }
  const css = await fetch(new URL('../../spiele/schachtbetrieb/stil.css', import.meta.url)).then((r) => r.text());
  wahr(!/#[0-9a-f]{3,8}\b/i.test(css), 'keine festen Farben im CSS');
});

// ---------- Puffer (Schachtlager, Aufzug, Eingangslager) ----------
test('Puffer: Schachtlager und Eingangslager überschreiten nie ihre Kapazität', () => {
  let z = greedy(40).z;
  for (let i = 0; i < 300; i++) {
    z = L.fortschritt(z, 7);
    z.schaechte.forEach((s, k) => wahr(s.kiste <= L.lagerKap(s, k) + 1e-6, `Schacht ${k} voll ${s.kiste} > ${L.lagerKap(s, k)}`));
    wahr(z.zentrum.lager <= L.eingangKap(z) + 1e-6, 'Eingangslager');
  }
  const gross = L.fortschritt(z, 14430);
  gross.schaechte.forEach((s, k) => wahr(s.kiste <= L.lagerKap(s, k) + 1e-6));
  wahr(gross.zentrum.lager <= L.eingangKap(gross) + 1e-6);
});

test('Puffer: langsamer Aufzug lässt das Schachtlager volllaufen, Förderung stoppt dort', () => {
  const z = L.neuesBergwerk(0);
  z.schaechte[0] = { n: 20, tempo: 20, trag: 20, kiste: 0 };   // Förderung weit über dem Aufzug
  const a = L.fortschritt(z, 600);
  gleich(Math.abs(a.schaechte[0].kiste - L.lagerKap(a.schaechte[0], 0)) < L.lagerKap(a.schaechte[0], 0) * 0.5, true, 'Lager (fast) voll');
  const einnahme = a.geld / 600;
  wahr(einnahme <= L.einkommen(z) * 1.05, `Einnahme ${einnahme} ≤ Schätzung ${L.einkommen(z)}`);
});

test('Puffer: Aufzug-Ladung ist durch die Kapazität begrenzt; Erz geht nicht verloren', () => {
  const z = greedy(20).z;
  wahr(L.aufzugLast(z) > 0 && L.aufzugLast(z) <= L.aufzugLadung(z));
  // Bilanz: Lager + Kisten + Geld gewinnen genau so viel, wie die Bergleute gefördert haben (hier ohne Deckel)
  const a = L.neuesBergwerk(0);
  const b = L.fortschritt(a, 30);
  const foerder = L.foerderung(a.schaechte[0], 0) * 30;
  wahr(Math.abs(b.geld + b.zentrum.lager + b.schaechte[0].kiste - foerder) < 1e-6, 'Erz bleibt erhalten');
});

test('Puffer: Offline-Rechnung bleibt gedeckelt und konsistent', () => {
  const z = greedy(25).z;
  z.t = 1_000_000_000_000;
  const o = L.offline(z, z.t + 24 * 3600_000).zustand;
  wahr(Number.isFinite(o.geld) && L.istGueltig(o));
  o.schaechte.forEach((s, k) => wahr(s.kiste <= L.lagerKap(s, k) + 1e-6));
  // Mehr als der Deckel bringt nichts mehr
  tief(L.offline(z, z.t + 100 * 3600_000).zustand.geld, o.geld);
  // Nie mehr als Einkommen · wirksame Zeit
  wahr(o.geld - z.geld <= L.einkommen(z) * L.luecke(8 * 3600) * 1.05 + z.zentrum.lager + 1, 'nicht über dem Dauereinkommen');
});

test('Alte Stände werden übernommen: Puffer über der Kapazität werden gekappt', () => {
  const z = greedy(8).z;
  const s = JSON.parse(JSON.stringify(L.zumSpeichern(z, 1)));
  s.schaechte[0].kiste = 1e9;
  s.zentrum.lager = 1e9;
  const n = L.ausSpeicher(s);
  gleich(n.schaechte[0].kiste, L.lagerKap(n.schaechte[0], 0));
  gleich(n.zentrum.lager, L.eingangKap(n));
});

test('Wirkungs-Vorschau: kurzer Text je Kauf', () => {
  const z = L.neuesBergwerk(0);
  gleich(L.effektText(z, 's0:tempo'), '+10 % Tempo');
  gleich(L.effektText(z, 's0:trag'), '+10 % Tragkraft');
  gleich(L.effektText(z, 's0:n'), '+1 Bergmann (+100 %)');
  gleich(L.effektText(z, 'aufzug:tempo'), '+20 % Tempo');
  gleich(L.effektText(z, 'aufzug:ladung'), '+50 % Ladung');
  gleich(L.effektText(z, 'zentrum:tempo'), '+20 % Verkaufstempo');
  wahr(L.effektText(z, 'schacht').includes('Erz/s'));
  gleich(L.effektText(z, 's9:n'), '');
  gleich(L.effektText(z, 'xyz'), '');
});

test('Oberfläche: Kaufknöpfe behalten ihren Knoten über viele Ticks (Klicks gehen nicht verloren)', async () => {
  const z = L.neuesBergwerk(Date.now());
  z.geld = 5;
  await mit(L.zumSpeichern(z, Date.now()), async (i, c) => {
    const vorher = [...c.querySelectorAll('.sb-kauf')];
    await warte(900);
    const nachher = [...c.querySelectorAll('.sb-kauf')];
    gleich(nachher.length, vorher.length);
    vorher.forEach((b, n) => wahr(b === nachher[n] && b.isConnected, `Knopf ${n} neu aufgebaut`));
    const stufe = c.querySelector('[data-was="s0:n"] .sb-kauf-stufe').firstChild;
    await warte(500);
    wahr(c.querySelector('[data-was="s0:n"] .sb-kauf-stufe').firstChild === stufe, 'Textknoten bleibt');
    wahr(c.querySelector('.sb-leiste'), 'feste Leiste vorhanden');
    wahr(c.querySelector('.sb-schacht .sb-lager .sb-kiste'), 'Schachtlager');
    wahr(c.querySelector('.sb-schacht .sb-kauf-effekt').textContent.includes('%'), 'Wirkung im Knopf');
    wahr(c.querySelector('.sb-zentrum .sb-menge-wert').textContent.includes('Erz'), 'Menge Zentrum');
    wahr(c.querySelector('.sb-aufzug .sb-menge-wert').textContent.includes('Erz'), 'Menge Aufzug');
  });
});
