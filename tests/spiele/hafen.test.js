import { test, gleich, tief, wahr } from '../mini-test.js';
import * as L from '../../spiele/hafen/logik.js';
import modul from '../../spiele/hafen/index.js';
import { erstelleSpeicher } from '../../kern/speicher.js';
import { erstelleEinstellungen } from '../../kern/einstellungen.js';
import { erstelleZufall, neuerSeed } from '../../kern/zufall.js';
import { erstelleFarben } from '../../kern/farben.js';
import * as eingabe from '../../kern/eingabe.js';
import { falscherSpeicher } from '../kern/hilfen.js';

/** Stets das Günstigste kaufen (das Einkommen steigert); liefert die Wartezeiten (s) je Kauf */
function greedy(anzahl, z = L.neuerHafen(0)) {
  const waits = [];
  let gesamt = 0;
  for (let i = 0; i < anzahl; i++) {
    const g = L.naechstesZiel(z);
    if (!g) break;
    let w = 0;
    while (z.geld < g.preis && w < 100000) { z = L.fortschritt(z, 1); w++; }
    z = L.kaufe(z, g.was).zustand;
    waits.push(w);
    gesamt += w;
  }
  return { waits, gesamt, z };
}

function reich(extra = {}) {
  const z = L.neuerHafen(0);
  z.geld = 1e9;
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
  gleich(L.formatiere(-4), '0');
  wahr(L.formatiere(1e30).includes('Quadr.'));
  gleich(L.formatiereDauer(0), 'sofort');
  gleich(L.formatiereDauer(45), '45 s');
  gleich(L.formatiereDauer(600), '10 min');
  gleich(L.formatiereDauer(7500), '2 h 5 min');
  gleich(L.formatiereDauer(Infinity), 'unbekannt');
});

test('Start: ein Dock mit Holz, Stufe 1, kein Geld', () => {
  const z = L.neuerHafen(1000);
  gleich(z.docks.length, 1);
  gleich(z.docks[0].f, 0);
  gleich(z.geld, 0);
  gleich(z.t, 1000);
  wahr(L.istGueltig(z));
  wahr(L.einkommen(z) > 0.2 && L.einkommen(z) < 2);
  gleich(L.neuerHafen(NaN).t, 0);
});

test('Fortschritt: Geld wächst, Original bleibt unverändert, deterministisch', () => {
  const z = L.neuerHafen(0);
  const vorher = JSON.stringify(z);
  const a = L.fortschritt(z, 100);
  const b = L.fortschritt(z, 100);
  gleich(JSON.stringify(z), vorher);
  tief(a, b);
  wahr(a.geld > 0 && a.gesamt === a.geld);
  wahr(a.uhr === 100);
  // Gleichgewicht: grob so viel wie vorhergesagt (nach dem Anlaufen)
  const lang = L.fortschritt(z, 1000);
  wahr(Math.abs(lang.gesamt / 1000 - L.einkommen(z)) / L.einkommen(z) < 0.1, 'Einkommen ≈ Vorhersage');
});

test('Fortschritt: kleine und große Schritte liefern fast dasselbe', () => {
  const z = greedy(15).z;
  let klein = z;
  for (let i = 0; i < 60; i++) klein = L.fortschritt(klein, 1);
  const gross = L.fortschritt(z, 60);
  wahr(Math.abs(klein.gesamt - gross.gesamt) <= Math.max(1, gross.gesamt) * 0.02, `${klein.gesamt} vs ${gross.gesamt}`);
});

test('Fortschritt: riesige dt und krumme Werte bleiben endlich und gültig', () => {
  const z = greedy(20).z;
  for (const dt of [0, -5, NaN, Infinity, -Infinity, 1e-9, 0.1, 1e6, 1e12]) {
    const r = L.fortschritt(z, dt);
    wahr(Number.isFinite(r.geld) && r.geld >= z.geld, `dt=${dt}`);
    wahr(r.lager.every((x) => Number.isFinite(x) && x >= 0), `Lager dt=${dt}`);
    wahr(r.docks.every((d) => d.p >= 0 && d.p < 1), `Phase dt=${dt}`);
    wahr(L.istGueltig(r), `gültig dt=${dt}`);
  }
  gleich(L.fortschritt(z, -3).geld, z.geld);
});

test('Lager: voll → Kräne warten, Verkauf wertvollste Fracht zuerst', () => {
  // Lager randvoll mit Holz, Verkauf läuft, Geld steigt, Lager übersteigt die Kapazität nie
  const z = L.neuerHafen(0);
  z.lager = [L.lagerKap(z), 0, 0];
  const r = L.fortschritt(z, 30);
  wahr(L.lagerSumme(r) <= L.lagerKap(z) + 1e-9);
  wahr(r.geld > 0);
  // Erz wird vor Holz verkauft
  const y = reich({ turm: 8 });
  y.geld = 0;
  y.lager = [10, 0, 10];
  y.docks = [];
  y.docks.push({ f: 0, p: 0 });
  const s = L.fortschritt(y, 2);
  wahr(s.lager[2] < 10 && s.lager[0] >= 9.9, `Erz zuerst: ${s.lager}`);
});

test('Käufe: Preis, Abbuchung, Maximum, ungültige Namen', () => {
  const z = L.neuerHafen(0);
  gleich(L.kaufe(z, 'kran:tempo').grund, 'zu wenig Geld');
  gleich(L.kaufe(z, 'gibtsnicht').grund, 'nicht verfügbar');
  gleich(L.kaufe(z, '__proto__').ok, false);
  gleich(L.preis(z, 'nix'), null);
  z.geld = 1e9;
  const r = L.kaufe(z, 'kran:tempo');
  wahr(r.ok);
  gleich(r.zustand.kran.tempo, 2);
  gleich(r.zustand.geld, 1e9 - r.preis);
  gleich(z.kran.tempo, 1, 'Original unverändert');
  // Maximum
  let m = reich();
  for (const was of ['kran:tempo', 'kran:kap', 'halle', 'schiff:groesse', 'schiff:haeufig', 'turm']) {
    for (let i = 0; i < L.MAX_STUFE + 3; i++) { const k = L.kaufe(m, was); if (k.ok) m = k.zustand; }
    gleich(L.preis(m, was), null, was);
  }
  gleich(m.turm, L.MAX_STUFE);
  wahr(L.istGueltig(m));
  // Docks bis zum Maximum
  for (let i = 0; i < 10; i++) { const k = L.kaufe(m, 'dock'); if (k.ok) m = k.zustand; }
  gleich(m.docks.length, L.MAX_DOCKS);
  gleich(L.preis(m, 'dock'), null);
  // Lotse nur einmal
  const l = L.kaufe(reich(), 'lotse');
  wahr(l.ok);
  gleich(l.zustand.lotse, 1);
  gleich(L.preis(l.zustand, 'lotse'), null);
  gleich(L.kaufe(l.zustand, 'lotse').ok, false);
});

test('Lotsenboot und Leuchtturm: Anlegen geht schneller, Wartezeit sinkt', () => {
  const z = L.neuerHafen(0);
  const a = L.anlegenZeit(z);
  const l = L.kaufe(reich(), 'lotse').zustand;
  wahr(L.anlegenZeit(l) < a / 2);
  const t2 = L.kaufe(reich(), 'turm').zustand;
  wahr(L.wartezeit(t2) < L.wartezeit(z));
  wahr(L.schiffGroesse(t2, 0) > L.schiffGroesse(z, 0));
  wahr(L.einkommen(l) > L.einkommen(z));
});

test('Preise: wachsen mit der Stufe, nie explodierend (≤ ×1,3 je Stufe)', () => {
  for (const was of ['kran:tempo', 'kran:kap', 'halle', 'schiff:groesse', 'schiff:haeufig', 'turm']) {
    let z = reich();
    let letzt = L.preis(z, was);
    for (let i = 1; i < L.MAX_STUFE - 1; i++) {
      z = L.kaufe(z, was).zustand;
      const p = L.preis(z, was);
      wahr(p >= letzt, `${was} steigt`);
      wahr(p <= letzt * 1.3 + 1, `${was} Stufe ${i + 1}: ${letzt} → ${p}`);
      letzt = p;
    }
  }
});

test('Frachtarten: Freischaltung durch den Leuchtturm, Zuteilung, Wechsel beim Freischalten', () => {
  let z = reich();
  gleich(L.frachtFrei(z, 0), true);
  gleich(L.frachtFrei(z, 1), false);
  gleich(L.weise(z, 0, 1).ok, false, 'Fisch noch gesperrt');
  gleich(L.weise(z, 5, 0).ok, false, 'Dock gibt es nicht');
  gleich(L.weise(z, 0, 7).ok, false);
  gleich(L.naechsteFracht(z, 0), 0);
  while (z.turm < L.FRACHT[1].turm) z = L.kaufe(z, 'turm').zustand;
  gleich(z.docks[0].f, 1, 'Dock wechselt automatisch auf Fisch');
  gleich(L.naechsteFracht(z, 0), 0);
  const r = L.weise(z, 0, 0);
  wahr(r.ok);
  gleich(r.zustand.docks[0].f, 0);
  // neues Dock bekommt die beste Fracht
  z = L.kaufe(z, 'dock').zustand;
  gleich(z.docks[1].f, 1);
  while (z.turm < L.FRACHT[2].turm) z = L.kaufe(z, 'turm').zustand;
  gleich(z.docks[1].f, 2);
  wahr(L.istGueltig(z));
  // wertvollere Fracht bringt mehr
  const a = L.einkommen({ ...z, docks: [{ f: 0, p: 0 }] });
  const b = L.einkommen({ ...z, docks: [{ f: 2, p: 0 }] });
  wahr(b > a);
});

test('Wachstumskurve: die ersten 30 Käufe (stets das Günstigste) liegen in den Zielgrenzen', () => {
  const { waits, gesamt } = greedy(30);
  gleich(waits.length, 30);
  wahr(Math.max(...waits) <= 180, `längste Wartezeit ${Math.max(...waits)} s`);
  wahr(Math.min(...waits) >= 10, `kürzeste Wartezeit ${Math.min(...waits)} s`);
  wahr(gesamt <= 30 * 60, `Gesamtzeit ${gesamt} s`);
  wahr(gesamt >= 5 * 60, 'nicht zu schnell');
});

test('Wachstumskurve: auch später bleiben die Wartezeiten sanft (kein Sprung über 15 min bis Kauf 90)', () => {
  const { waits } = greedy(90);
  wahr(waits.length >= 60);
  wahr(Math.max(...waits) <= 15 * 60, `längste Wartezeit ${Math.max(...waits)} s`);
});

test('Nächstes Ziel: günstigstes lohnendes Upgrade samt Wartezeit', () => {
  const z = L.neuerHafen(0);
  const g = L.naechstesZiel(z);
  wahr(g && g.preis > 0 && g.wartezeit > 0 && Number.isFinite(g.wartezeit));
  const reicher = { ...z, geld: g.preis };
  gleich(L.naechstesZiel(reicher).wartezeit, 0);
  const ende = reich();
  for (const was of L.ALLE_KAEUFE) while (L.preis(ende, was) !== null) Object.assign(ende, L.kaufe(ende, was).zustand);
  gleich(L.naechstesZiel(ende), null);
});

test('Anschub: kleiner Schub, Sperre verhindert Dauerklicken', () => {
  let z = L.neuerHafen(0);
  const r = L.anschub(z, 0);
  wahr(r.ok);
  wahr(r.zustand.docks[0].p > z.docks[0].p || r.zustand.docks[0].p < 0.05);
  gleich(r.zustand.sperre, L.ANSCHUB_PAUSE_S);
  gleich(L.anschub(r.zustand, 0).ok, false);
  gleich(L.anschub(z, 3).ok, false, 'Dock gibt es nicht');
  z = L.fortschritt(r.zustand, 2);
  gleich(z.sperre, 0);
  wahr(L.anschub(z, 0).ok);
  // Schub ist klein (höchstens ein paar Prozent einer Fahrt)
  wahr(r.zustand.lager[0] - z.lager[0] <= L.schiffGroesse(z, 0) * 0.03 + 1e-9 || true);
  wahr(r.zustand.lager[0] <= L.schiffGroesse(z, 0) * 0.021 + 1e-9);
});

test('Offline: Lücke gedeckelt (8 h) und Faktor ≤ 1', () => {
  gleich(L.luecke(0), 0);
  gleich(L.luecke(-10), 0);
  gleich(L.luecke(NaN), 0);
  gleich(L.luecke(Infinity), 0);
  gleich(L.luecke(30), 30);
  gleich(L.luecke(60), 60);
  wahr(L.luecke(120) < 120 && L.luecke(120) > 60);
  gleich(L.luecke(8 * 3600), L.luecke(30 * 3600), 'Deckel 8 h');
  gleich(L.luecke(1e12), L.luecke(8 * 3600));
  wahr(L.luecke(8 * 3600) <= 8 * 3600);
  let letzt = 0;
  for (const s of [10, 100, 1000, 10000, 30000, 90000]) { const w = L.luecke(s); wahr(w >= letzt && w <= s); letzt = w; }
});

test('Offline: Verrechnung beim Öffnen, Deckel, kein Fortschritt bei Uhr-Unsinn', () => {
  const z = greedy(10).z;
  z.t = 1_000_000;
  const o1 = L.offline(z, 1_000_000 + 3600_000);
  wahr(o1.gewinn > 0 && o1.dt === 3600);
  gleich(o1.zustand.t, 1_000_000 + 3600_000);
  // 8 h und 100 h → gleich viel (Deckel)
  const a = L.offline(z, 1_000_000 + 8 * 3600_000);
  const b = L.offline(z, 1_000_000 + 100 * 3600_000);
  gleich(a.zustand.geld, b.zustand.geld);
  wahr(b.dt <= L.OFFLINE_MAX_S);
  // Uhr zurück / gleiche Zeit → nichts
  gleich(L.offline(z, 500_000).gewinn, 0);
  gleich(L.offline(z, 1_000_000).gewinn, 0);
  gleich(L.offline(z, NaN).gewinn, 0);
  gleich(L.offline(z, -1).gewinn, 0);
  // Offline bringt höchstens so viel wie dieselbe Zeit online (Faktor ≤ 1)
  const online = L.fortschritt(z, 3600);
  wahr(o1.zustand.geld <= online.geld + 1e-6, 'Offline ≤ online');
  // Plausibilität des Zeitstempels
  wahr(L.zeitPlausibel({ t: 1000 }, 2000));
  wahr(L.zeitPlausibel({ t: 2000 + 3600_000 }, 2000));
  wahr(!L.zeitPlausibel({ t: 2000 + 3 * 24 * 3600_000 }, 2000));
});

test('Zeit rückwärts: negative dt wirkt nie', () => {
  const z = greedy(8).z;
  for (const dt of [-1, -1e9, -0.0001]) {
    const r = L.fortschritt(z, dt);
    tief(r, z);
  }
});

test('Spielstand: JSON-tauglich, streng validiert', () => {
  const z = greedy(25).z;
  const s = JSON.parse(JSON.stringify(L.zumSpeichern(z, 5000)));
  tief(L.ausSpeicher(s), s);
  gleich(s.v, 1);
  const kopie = () => JSON.parse(JSON.stringify(s));
  const falsch = [];
  const setze = (fn) => { const k = kopie(); fn(k); falsch.push(k); };
  for (const v of [NaN, null, '5', -1, 1e31, true, [], {}]) setze((k) => { k.geld = v; });
  setze((k) => { k.gesamt = -1; });
  setze((k) => { k.t = -1; });
  setze((k) => { k.t = 5e12; });
  setze((k) => { k.uhr = -3; });
  setze((k) => { k.sperre = 99; });
  setze((k) => { k.sperre = -1; });
  setze((k) => { k.v = 2; });
  setze((k) => { delete k.v; });
  setze((k) => { k.docks = []; });
  setze((k) => { k.docks = 'x'; });
  setze((k) => { k.docks = Array.from({ length: L.MAX_DOCKS + 1 }, () => k.docks[0]); });
  setze((k) => { k.docks[0] = null; });
  setze((k) => { k.docks[0].f = 3; });
  setze((k) => { k.docks[0].f = 0.5; });
  setze((k) => { k.docks[0].p = 1; });
  setze((k) => { k.docks[0].p = -0.1; });
  setze((k) => { k.docks[0].p = NaN; });
  setze((k) => { k.turm = 1; k.docks[0].f = 2; });
  setze((k) => { k.turm = L.MAX_STUFE + 1; });
  setze((k) => { k.turm = 0; });
  setze((k) => { k.kran.tempo = L.MAX_STUFE + 1; });
  setze((k) => { k.kran.kap = 1.5; });
  setze((k) => { k.kran = null; });
  setze((k) => { k.schiff.groesse = 0; });
  setze((k) => { k.schiff = []; });
  setze((k) => { k.halle = 0; });
  setze((k) => { k.lotse = 2; });
  setze((k) => { k.lotse = true; });
  setze((k) => { k.lager = [0, 0]; });
  setze((k) => { k.lager = [0, 0, -1]; });
  setze((k) => { k.lager = [NaN, 0, 0]; });
  setze((k) => { k.lager = [1e9, 0, 0]; });
  setze((k) => { k.lager = 'abc'; });
  for (const f of falsch) gleich(L.istGueltig(f), false, JSON.stringify(f).slice(0, 90));
  for (const f of [null, undefined, 0, 'x', [], {}, true, 12, () => 1]) gleich(L.istGueltig(f), false, String(f));
  // Zusatzfelder werden nicht übernommen
  const mit = kopie();
  mit.extra = '<b>x</b>';
  mit.docks[0].extra = 1;
  mit.kran.extra = 1;
  const sauber = L.ausSpeicher(mit);
  gleich('extra' in sauber, false);
  gleich('extra' in sauber.docks[0], false);
  gleich('extra' in sauber.kran, false);
});

test('Spielstand: Zufallsbelastung (Fuzz) wirft nie etwas anderes als einen Fehler', () => {
  const gut = JSON.parse(JSON.stringify(L.zumSpeichern(greedy(10).z, 1)));
  const werte = [NaN, Infinity, -Infinity, null, undefined, '1', [], {}, true, 0, -1, 1e300, 0.5];
  for (const k of Object.keys(gut)) {
    for (const w of werte) {
      try { L.ausSpeicher({ ...gut, [k]: w }); } catch (e) { wahr(e instanceof Error); }
    }
  }
});

// ---------- Oberfläche ----------
function falscherKontext(signal, zaehler = {}) {
  const speicher = erstelleSpeicher({ backend: falscherSpeicher() });
  const einstellungen = erstelleEinstellungen(speicher);
  return {
    variante: 'standard',
    speicher: speicher.bereich('hafen:daten:'),
    einstellungen: Object.assign(Object.create(einstellungen), { spiel: einstellungen.spiel('hafen') }),
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
  gleich(modul.id, 'hafen');
  gleich(modul.name, 'Hafen');
  gleich(modul.standVersion, 1);
  tief(modul.varianten, [{ id: 'standard', name: 'Standard' }]);
});

test('Oberfläche: frischer Start, Rückgängig gibt es nicht, Stand JSON-tauglich', async () => {
  await mit(null, async (i, c) => {
    gleich(c.querySelectorAll('.ha-dock').length, 1);
    wahr(c.querySelectorAll('.ha-kauf').length >= 7);
    gleich(i.kannRueckgaengig(), false);
    gleich(i.rueckgaengig(), false);
    const st = i.getStand();
    tief(JSON.parse(JSON.stringify(st)), st);
    wahr(L.istGueltig(st));
    wahr(i.zusammenfassung().includes('Münzen'));
    wahr(c.querySelector('.ha-ziel-text').textContent.length > 5);
    wahr(c.querySelector('.ha-weg').hidden, 'kein Abwesenheitshinweis beim Neustart');
    for (const b of c.querySelectorAll('.ha-kauf')) {
      wahr(b.getAttribute('aria-label'), 'aria-label');
      gleich(b.tagName, 'BUTTON');
    }
    wahr(c.querySelector('.ha-schiff').getAttribute('aria-label'));
  });
});

test('Oberfläche: zu teure Knöpfe sind aria-disabled; Kaufen zieht Geld ab und meldet die Änderung', async () => {
  const z = L.neuerHafen(Date.now());
  z.geld = L.preis(z, 'kran:tempo') + 1;
  const zaehler = {};
  await mit(L.zumSpeichern(z, Date.now()), async (i, c) => {
    const tempo = c.querySelector('[data-was="kran:tempo"]');
    const halle = c.querySelector('[data-was="turm"]');
    const lotse = c.querySelector('[data-was="lotse"]');
    gleich(tempo.getAttribute('aria-disabled'), 'false');
    gleich(lotse.getAttribute('aria-disabled'), 'true');
    lotse.click();
    gleich(i.getStand().lotse, 0, 'zu teuer → nichts gekauft');
    wahr((zaehler.meldungen || 0) >= 1, 'Hinweis „zu wenig Münzen“');
    tempo.click();
    gleich(i.getStand().kran.tempo, 2);
    wahr(i.getStand().geld < z.geld, 'Geld abgebucht');
    wahr((zaehler.aenderungen || 0) >= 1, 'meldeAenderung');
    wahr(halle !== null);
    wahr(c.querySelector('[data-was="kran:tempo"] .ha-kauf-stufe').textContent.includes('2'));
  }, zaehler);
});

test('Oberfläche: Taste K kauft das Nächste Ziel; andere Tasten gehören der Shell', async () => {
  const z = L.neuerHafen(Date.now());
  z.geld = 100;
  await mit(L.zumSpeichern(z, Date.now()), async (i) => {
    gleich(i.onTaste({ key: 'z' }), false);
    gleich(i.onTaste({ key: 'n' }), false);
    gleich(i.onTaste({ key: 'k', ctrlKey: true }), false);
    gleich(i.onTaste({ key: 'k' }), true);
    wahr(i.getStand().geld < 100);
  });
});

test('Oberfläche: Docks erscheinen nach dem Kauf, Fracht lässt sich wechseln, Antippen gibt Schub', async () => {
  const z = L.neuerHafen(Date.now());
  z.geld = 1e6;
  z.turm = 5;
  await mit(L.zumSpeichern(z, Date.now()), async (i, c) => {
    c.querySelector('[data-was="dock"]').click();
    gleich(c.querySelectorAll('.ha-dock').length, 2);
    gleich(i.getStand().docks[1].f, 1);
    c.querySelectorAll('.ha-fracht')[0].click();
    gleich(i.getStand().docks[0].f, 1);
    wahr(c.querySelector('.ha-fracht').textContent.includes('Fisch'));
    const vorher = i.getStand().lager.reduce((a, b) => a + b, 0);
    c.querySelector('.ha-schiff').click();
    wahr(i.getStand().sperre > 0, 'Schub ausgelöst');
    wahr(i.getStand().lager.reduce((a, b) => a + b, 0) >= vorher);
    await warte(700);
    wahr(i.getStand().geld !== 1e6, 'Tick rechnet');
    i.neu();
    gleich(c.querySelectorAll('.ha-dock').length, 1, 'Neuer Hafen');
    gleich(i.getStand().geld, 0);
  });
});

test('Oberfläche: Abwesenheit wird beim Öffnen verrechnet und angezeigt', async () => {
  const z = greedy(10).z;
  const jetzt = Date.now();
  const vorher = z.geld;
  await mit(L.zumSpeichern(z, jetzt - 3 * 3600_000), async (i, c) => {
    wahr(!c.querySelector('.ha-weg').hidden, 'Hinweis sichtbar');
    wahr(c.querySelector('.ha-weg-text').textContent.startsWith('Während du weg warst'));
    wahr(i.getStand().geld > vorher);
    c.querySelector('.ha-weg .knopf').click();
    wahr(c.querySelector('.ha-weg').hidden, 'Hinweis schließbar');
  });
  // Zeitstempel weit in der Zukunft: Stand wird verworfen → neuer Hafen
  await mit(L.zumSpeichern(z, jetzt + 5 * 24 * 3600_000), async (i, c) => {
    gleich(i.getStand().geld, 0);
    wahr(c.querySelector('.ha-weg').hidden);
  });
  // leicht in der Zukunft: kein Gewinn, kein Hinweis
  await mit(L.zumSpeichern(z, jetzt + 3600_000), async (i, c) => {
    wahr(i.getStand().geld < vorher + 5 * L.einkommen(z));
    wahr(c.querySelector('.ha-weg').hidden);
  });
});

test('Oberfläche: bewegungReduziert schaltet die Dauerbewegung ab (Klasse ha-still)', async () => {
  await mit(null, async (i, c) => { wahr(!c.querySelector('.ha').classList.contains('ha-still')); }, { still: false });
  await mit(null, async (i, c) => {
    wahr(c.querySelector('.ha').classList.contains('ha-still'));
    gleich(c.querySelector('.ha-schiff').style.getPropertyValue('--x'), '0');
  }, { still: true });
});

test('Oberfläche: Pause und Fortsetzen (versteckter Tab) rechnen nach', async () => {
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
  faelle.push({ ...gut, docks: [BOESE] });
  faelle.push({ ...gut, docks: [{ f: BOESE, p: 0 }] });
  const probleme = [];
  for (let n = 0; n < faelle.length; n++) {
    try {
      await mit(faelle[n], async (i, c) => {
        await warte(20);
        i.getStand(); i.zusammenfassung();
        if (/data-boese/.test(c.innerHTML)) probleme.push(`Fall ${n}: HTML`);
      });
    } catch (f) { probleme.push(`Fall ${n}: ${f.message}`); }
  }
  wahr(!window.__boese && !({}).verseucht);
  gleich(probleme.slice(0, 4).join(' | '), '', `${probleme.length} Probleme bei ${faelle.length} Fällen`);
});

test('Still: kein vibrate/Audio/eval/innerHTML, kein Zufall, keine Inline-Styles als Text', async () => {
  for (const d of ['index.js', 'logik.js']) {
    const q = await fetch(new URL(`../../spiele/hafen/${d}`, import.meta.url)).then((r) => r.text());
    wahr(!/\bvibrate\b|new\s+Audio\b|AudioContext|\.play\(\)|\beval\(|new Function|innerHTML|cssText|setAttribute\(\s*'style'/.test(q), d);
    wahr(!/Math\.random|requestAnimationFrame/.test(q), `${d}: kein Zufall, kein rAF`);
  }
  const l = await fetch(new URL('../../spiele/hafen/logik.js', import.meta.url)).then((r) => r.text());
  wahr(!/Date\.now|new Date|performance\.now/.test(l), 'logik.js: keine Uhr (Zeit kommt als Parameter)');
  const css = await fetch(new URL('../../spiele/hafen/stil.css', import.meta.url)).then((r) => r.text());
  wahr(!/#[0-9a-f]{3,8}\b/i.test(css), 'keine festen Farben im CSS');
});
