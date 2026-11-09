import { test, gleich, tief, wahr } from '../mini-test.js';
import * as L from '../../spiele/ziegelbruch/logik.js';
import modul from '../../spiele/ziegelbruch/index.js';
import { erstelleSpeicher } from '../../kern/speicher.js';
import { erstelleEinstellungen } from '../../kern/einstellungen.js';
import { erstelleZufall, neuerSeed } from '../../kern/zufall.js';
import { erstelleFarben } from '../../kern/farben.js';
import * as eingabe from '../../kern/eingabe.js';
import { falscherSpeicher } from '../kern/hilfen.js';

const { B, Z } = L;
const ix = (r, c) => r * B + c;

/** Leeres Feld, Abschuss in der Mitte (x = 3,5), 1 Ball */
function leer(modus = 'endlos', extra = {}) {
  const z = L.neuesSpiel(modus, { level: 1, seed: 'testseed' });
  return { ...z, feld: new Array(B * Z).fill(0), nachschub: [], baelle: 1, startX: 3.5, winkel: 0, ...extra };
}
function mitBlock(z, r, c, v) { const f = z.feld.slice(); f[ix(r, c)] = v; return { ...z, feld: f }; }

test('Ziegelbruch: Metadaten', () => {
  gleich(modul.id, 'ziegelbruch');
  gleich(modul.name, 'Ziegelbruch');
  tief(modul.varianten, [{ id: 'level', name: 'Level – mit Ziel' }, { id: 'endlos', name: 'Endlos – ohne Ziel' }]);
  gleich(modul.standVersion, 1);
});

test('Physik: Ball von unten trifft Block, Zahl −1, Ball kehrt zurück', () => {
  const z = mitBlock(leer(), 3, 3, 3);
  const s = L.simuliereAlles(L.erstelleSchuss(z, 0));
  gleich(s.feld[ix(3, 3)], 2);
  gleich(s.treffer, 1);
  gleich(s.zurueck, 1);
  wahr(Math.abs(s.neueStartX - 3.5) < 0.3, `Landung bei ${s.neueStartX}`);
});

test('Physik: Reflexion an Wand und Decke (Vorschau-Linie)', () => {
  const v = L.vorschau(leer(), 60);
  wahr(v.punkte.length >= 3, 'mehrere Prallstellen');
  const p = v.punkte[1];
  wahr(Math.abs(p[0] - (B - L.R)) < 0.01 || Math.abs(p[1] - L.R) < 0.01, 'erste Prallstelle an Wand/Decke');
  gleich(v.block, false);
  // senkrecht auf einen Block: Prallstelle direkt darunter
  const vb = L.vorschau(mitBlock(leer(), 2, 3, 5), 0);
  gleich(vb.block, true);
  wahr(Math.abs(vb.punkte[vb.punkte.length - 1][1] - (3 + L.R)) < 0.2);
});

test('Physik: Ecken und schräge Treffer verlieren keine Treffer (kein Tunneln)', () => {
  let z = leer('endlos', { baelle: 12 });
  for (let r = 1; r <= 4; r++) for (let c = 0; c < B; c++) z = mitBlock(z, r, c, 50);
  for (const w of [-70, -33, -5, 0, 17, 45, 79]) {
    const s = L.simuliereAlles(L.erstelleSchuss(z, w));
    gleich(s.zurueck, 12, `Winkel ${w}: alle Bälle zurück`);
    const abgebaut = z.feld.reduce((a, v, i) => a + (v > 0 ? v - s.feld[i] : 0), 0);
    gleich(abgebaut, s.treffer, `Winkel ${w}: Trefferzahl = abgebaute Zahlen`);
    wahr(s.feld.every((v) => v >= 0), 'kein negativer Block');
  }
});

test('Determinismus: gleicher Schuss → gleiches Ergebnis', () => {
  let z = L.neuesSpiel('endlos', { seed: 'det' });
  z = { ...z, baelle: 9 };
  const a = L.schiesse(z, 23.5), b = L.schiesse(z, 23.5);
  tief(a.zustand, b.zustand);
  gleich(a.sim.schritt, b.sim.schritt);
  tief(L.neuesSpiel('level', { level: 7, seed: 'x' }), L.neuesSpiel('level', { level: 7, seed: 'x' }));
});

test('Schrittbudget: Ball kehrt auch ohne Treffer zurück, Endlosschleifen werden beendet', () => {
  // fast waagerecht zwischen zwei Wänden
  const s = L.simuliereAlles(L.erstelleSchuss(leer(), 80));
  gleich(s.fertig, true);
  gleich(s.zurueck, 1);
  wahr(s.schritt < L.BUDGET);
  // Extrem-Eingabe wird geklemmt
  gleich(L.klemmeWinkel(1000), 80);
  gleich(L.klemmeWinkel(NaN), 0);
});

test('Extra-Ball: wird durchflogen und zählt nach dem Schuss', () => {
  const z = mitBlock(leer(), 5, 3, L.EXTRA);
  const r = L.schiesse(z, 0);
  gleich(r.ereignis.extras, 1);
  gleich(r.zustand.baelle, 2);
  gleich(r.zustand.feld[ix(5, 3)] === 0 || r.zustand.feld[ix(6, 3)] === 0, true);
  gleich(r.sim.treffer, 0, 'Extra-Ball ist kein Treffer');
});

test('Bombe nimmt dem 3×3-Umfeld 3 ab, Reihenräumer räumt die Zeile, Wand bleibt', () => {
  let z = leer();
  z = mitBlock(z, 3, 3, L.BOMBE);
  z = mitBlock(z, 3, 2, 2); z = mitBlock(z, 2, 4, 9); z = mitBlock(z, 3, 6, 4);
  let s = L.simuliereAlles(L.erstelleSchuss(z, 0));
  gleich(s.feld[ix(3, 3)], 0);
  gleich(s.feld[ix(3, 2)], 0);
  gleich(s.feld[ix(2, 4)], 6);
  gleich(s.feld[ix(3, 6)], 4, 'außerhalb 3×3');
  // Räumer
  z = mitBlock(leer(), 3, 3, L.RAEUMER);
  z = mitBlock(z, 3, 0, 8); z = mitBlock(z, 3, 6, 8); z = mitBlock(z, 4, 0, 8);
  s = L.simuliereAlles(L.erstelleSchuss(z, 0));
  gleich(s.feld[ix(3, 0)] + s.feld[ix(3, 6)], 0);
  gleich(s.feld[ix(4, 0)], 8);
  // Wand
  z = mitBlock(leer(), 3, 3, L.WAND);
  s = L.simuliereAlles(L.erstelleSchuss(z, 0));
  gleich(s.feld[ix(3, 3)], L.WAND);
  gleich(s.treffer, 0);
});

test('Reihe fällt weg: Block in der Fallzone wird entfernt, kein Game-over', () => {
  let z = mitBlock(leer('endlos'), Z - 2, 1, 5);
  const r = L.schiesse(z, 0);
  gleich(r.ereignis.gefallen, 1);
  gleich(r.zustand.gefallen, 1);
  for (let c = 0; c < B; c++) gleich(r.zustand.feld[ix(Z - 1, c)], 0, 'Fallzone leer');
  gleich(r.zustand.reihen, 1);
  // Level ohne Nachschub: Feld bleibt stehen
  z = mitBlock(leer('level'), Z - 2, 1, 5);
  const l = L.schiesse(z, 0);
  gleich(l.zustand.feld[ix(Z - 2, 1)], 5);
  gleich(l.ereignis.gefallen, 0);
});

test('Endlos: neue Reihe nach jedem Schuss, Trefferzahlen wachsen, Zufall im Spielstand', () => {
  let z = L.neuesSpiel('endlos', { seed: 'wachs' });
  const reihe0 = z.feld.slice(0, B);
  gleich(reihe0.length, B);
  const hoechste = (feld) => Math.max(0, ...feld.slice(0, B));
  const frueh = hoechste(z.feld);
  for (let k = 0; k < 40; k++) z = L.schiesse(z, (k * 13) % 100 - 50).zustand;
  gleich(z.reihen, 40);
  wahr(hoechste(z.feld) > frueh || z.feld.some((v) => v > 5), 'Zahlen wachsen');
  wahr(L.istGueltig(JSON.parse(JSON.stringify(z))), 'Stand bleibt gültig');
  // Fortsetzung aus dem Spielstand = Fortsetzung ohne Unterbrechung
  const a = L.schiesse(z, 10).zustand;
  const b = L.schiesse(L.ausSpeicher(JSON.parse(JSON.stringify(z))), 10).zustand;
  tief(a, b);
});

test('Level: Struktur Level 1–35 gültig, Ballzahl und Nachschub vorhanden', () => {
  for (let n = 1; n <= 35; n++) {
    const z = L.neuesSpiel('level', { level: n, seed: 's' });
    wahr(L.istGueltig(JSON.parse(JSON.stringify(z))), `Level ${n} gültig`);
    wahr(L.zaehleBloecke(z.feld) >= 5, `Level ${n} hat Blöcke`);
    wahr(z.baelle >= 3 && z.nachschub.length >= 1, `Level ${n} Bälle/Nachschub`);
    for (let c = 0; c < B; c++) gleich(z.feld[ix(Z - 1, c)], 0);
    tief(L.levelDaten(n), L.levelDaten(n), 'deterministisch');
  }
  wahr(L.levelDaten(30).baelle > L.levelDaten(1).baelle, 'Anspruch steigt');
  wahr(L.levelDaten(500).feld.length === B * Z, 'hohe Levelnummer erzeugbar');
});

test('Level lösbar: einfache Strategie (bester von 21 Winkeln) schafft die ersten Level', () => {
  for (const n of [1, 2, 3, 5, 8]) {
    let z = L.neuesSpiel('level', { level: n, seed: 'l' });
    let k = 0;
    while (!z.fertig && k < 300) {
      const r = L.schiesse(z, L.besterWinkel(z));
      z = r.zustand; k++;
    }
    wahr(z.fertig, `Level ${n} nach ${k} Schüssen nicht gelöst`);
  }
});

test('Hinweis: guter Winkel liegt im Bereich und trifft etwas', () => {
  let z = L.neuesSpiel('endlos', { seed: 'h' });
  z = { ...z, baelle: 4 };
  const w = L.besterWinkel(z);
  wahr(Math.abs(w) <= L.MAX_WINKEL);
  wahr(L.simuliereAlles(L.erstelleSchuss(z, w)).treffer > 0);
});

test('Rückgängig: stellt den Zustand vor dem Schuss her, Verlauf ist begrenzt', () => {
  const z = L.neuesSpiel('endlos', { seed: 'u' });
  const r = L.schiesse(z, 12).zustand;
  gleich(L.kannRueckgaengig(r), true);
  tief({ ...L.rueckgaengig(r), winkel: 0 }, { ...z, winkel: 0 }, 'Zustand vor dem Schuss');
  let x = L.neuesSpiel('endlos', { seed: 'v' });
  for (let k = 0; k < 130; k++) x = L.schiesse(x, 0).zustand;
  gleich(x.verlauf.length, L.MAX_VERLAUF);
  wahr(L.istGueltig(JSON.parse(JSON.stringify(x))));
  let y = x; for (let k = 0; k < 100; k++) y = L.rueckgaengig(y);
  gleich(L.kannRueckgaengig(y), false);
  gleich(L.rueckgaengig(y), null);
});

test('Spielstand: strenge Validierung', () => {
  const z = JSON.parse(JSON.stringify(L.neuesSpiel('level', { level: 3, seed: 'val' })));
  wahr(L.istGueltig(z));
  const kaputt = (f) => { const k = JSON.parse(JSON.stringify(z)); f(k); return L.istGueltig(k); };
  gleich(kaputt((k) => { k.standVersion = 2; }), false);
  gleich(kaputt((k) => { k.modus = 'x'; }), false);
  gleich(kaputt((k) => { k.feld.pop(); }), false);
  gleich(kaputt((k) => { k.feld[0] = 1000; }), false);
  gleich(kaputt((k) => { k.feld[0] = -5; }), false);
  gleich(kaputt((k) => { k.feld[0] = 1.5; }), false);
  gleich(kaputt((k) => { k.feld[0] = '3'; }), false);
  gleich(kaputt((k) => { k.baelle = 0; }), false);
  gleich(kaputt((k) => { k.baelle = 1e6; }), false);
  gleich(kaputt((k) => { k.startX = 99; }), false);
  gleich(kaputt((k) => { k.startX = null; }), false);
  gleich(kaputt((k) => { k.winkel = 200; }), false);
  gleich(kaputt((k) => { k.rng = [1, 2, 3]; }), false);
  gleich(kaputt((k) => { k.seed = ''; }), false);
  gleich(kaputt((k) => { k.nachschub = [[1, 2]]; }), false);
  gleich(kaputt((k) => { k.weiter = true; k.fertig = false; }), false);
  gleich(kaputt((k) => { k.verlauf = new Array(101).fill(0); }), false);
  gleich(kaputt((k) => { k.verlauf = [{ x: 1 }]; }), false);
  for (const v of [null, undefined, 5, 'x', [], {}]) gleich(L.istGueltig(v), false);
  gleich(L.ausSpeicher({ ...z, feld: [] }), null);
  const sauber = L.ausSpeicher({ ...z, fremd: 'x' });
  gleich('fremd' in sauber, false);
});

test('Weiterspielen: Flag, kein zweites Mal gewonnen, Endlos-Reihen danach', () => {
  let z = mitBlock(leer('level'), 2, 3, 1);
  const r = L.schiesse(z, 0);
  gleich(r.ereignis.fertig, true);
  gleich(r.zustand.fertig, true);
  gleich(r.zustand.weiter, false);
  const w = L.weiterspielen(r.zustand);
  gleich(w.weiter, true);
  wahr(L.istGueltig(JSON.parse(JSON.stringify(w))));
  const n = L.schiesse(w, 0);
  gleich(n.ereignis.fertig, false, 'nie ein zweites Mal gewonnen');
  gleich(n.ereignis.neueReihe, true);
  gleich(n.zustand.reihen, 1);
});

// ---------- Oberfläche ----------
function falscherKontext(signal, zaehler = {}) {
  const speicher = erstelleSpeicher({ backend: falscherSpeicher() });
  const einstellungen = erstelleEinstellungen(speicher);
  return {
    variante: zaehler.variante ?? 'level',
    speicher: (zaehler.speicher = speicher.bereich('ziegelbruch:daten:')),
    einstellungen: Object.assign(Object.create(einstellungen), { spiel: einstellungen.spiel('ziegelbruch') }),
    statistik: { melde() {} },
    zufall: (s, z) => erstelleZufall(s, z),
    neuerSeed,
    farben: erstelleFarben(einstellungen),
    eingabe,
    signal,
    bewegungReduziert: () => zaehler.still ?? true,
    worker: () => { throw new Error('kein Worker'); },
    meldung(t) { zaehler.letzte = t; },
    meldeAenderung() { zaehler.aenderungen = (zaehler.aenderungen || 0) + 1; },
    meldeGewonnen(text, opt) { (zaehler.gewonnen ??= []).push({ text, opt }); },
    neuesSpiel() {},
  };
}

async function mit(stand, fn, zaehler = {}) {
  const ac = new AbortController();
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;height:800px';
  document.body.append(container);
  const instanz = modul.erstelle(container, falscherKontext(ac.signal, zaehler), stand);
  try { return await fn(instanz, container); } finally {
    instanz.zerstoere();
    ac.abort();
    container.remove();
  }
}
const taste = (k, opt = {}) => ({ key: k, target: document.body, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...opt });

test('Oberfläche: Aufbau, Zahlen sichtbar, Knöpfe, Tastatur zielt und schießt', async () => {
  const z = { ...L.neuesSpiel('level', { level: 1, seed: 'ui' }) };
  await mit(JSON.parse(JSON.stringify(z)), async (i, c) => {
    gleich(c.querySelectorAll('.zb-zelle').length, B * Z);
    const bloecke = c.querySelectorAll('.zb-block');
    gleich(bloecke.length, L.zaehleBloecke(z.feld));
    wahr([...bloecke].every((b) => /^\d+$/.test(b.querySelector('.zb-zahl').textContent)), 'Zahl in jedem Block');
    gleich(c.querySelectorAll('button').length, 2);
    gleich(c.querySelector('.zb-rahmen').getAttribute('tabindex'), '0');
    wahr(c.querySelector('.zb-rahmen').getAttribute('aria-label').length > 10);
    wahr(c.querySelector('.zb-ziellinie').getAttribute('points').length > 0, 'Zielhilfe sichtbar');
    gleich(i.onTaste(taste('ArrowRight')), true);
    gleich(i.getStand().winkel, 1);
    i.onTaste(taste('ArrowLeft', { shiftKey: true }));
    gleich(i.getStand().winkel, -4);
    gleich(i.onTaste(taste('Enter', { target: document.createElement('button') })), false, 'Knopf behält Enter');
    const vorher = i.getStand();
    gleich(i.onTaste(taste('Enter')), true);
    gleich(i.getStand().schuesse, 1);
    gleich(i.kannRueckgaengig(), true);
    i.rueckgaengig();
    tief(i.getStand().feld, vorher.feld);
    gleich(i.getStand().schuesse, 0);
    c.querySelector('.zb-knopf').click();
    gleich(i.getStand().schuesse, 1, 'Schießen-Knopf');
    wahr(L.istGueltig(i.getStand()));
  });
});

test('Oberfläche: Gewinnen meldet einmal mit weiterspielen-Option, danach Endlos', async () => {
  const z = mitBlock(leer('level'), 2, 3, 1);
  const zaehler = {};
  await mit(JSON.parse(JSON.stringify(z)), async (i, c) => {
    gleich(c.querySelector('.zb-rahmen') !== null, true);
    i.onTaste(taste('Enter'));
    gleich(zaehler.gewonnen.length, 1);
    gleich(zaehler.gewonnen[0].opt.weiterspielen, true);
    gleich(typeof i.weiterspielen, 'function');
    i.weiterspielen();
    gleich(i.getStand().weiter, true);
    i.onTaste(taste('Enter'));
    gleich(zaehler.gewonnen.length, 1, 'kein zweites Mal');
    gleich(i.getStand().reihen, 1);
    gleich(zaehler.speicher.lies('level', 1), 2, 'Levelzähler');
  }, zaehler);
});

test('Oberfläche: kaputte Spielstände führen zu einem neuen Spiel', async () => {
  for (const kaputt of [{ standVersion: 1 }, 'x', 42, { ...L.neuesSpiel('level'), feld: [1, 2] }]) {
    await mit(kaputt, async (i, c) => {
      wahr(L.istGueltig(i.getStand()));
      gleich(c.querySelectorAll('.zb-zelle').length, B * Z);
    });
  }
  await mit(null, async (i) => { gleich(i.getStand().modus, 'endlos'); }, { variante: 'endlos' });
});

test('Oberfläche: Animation läuft und endet im selben Ergebnis wie die direkte Simulation', async () => {
  const z = JSON.parse(JSON.stringify(L.neuesSpiel('endlos', { seed: 'anim' })));
  const soll = L.schiesse(z, 0).zustand;
  await mit(z, async (i) => {
    i.onTaste(taste('b'));
    i.onTaste(taste('Enter'));
    for (let k = 0; k < 400 && i.getStand().schuesse === 0; k++) await new Promise((r) => setTimeout(r, 50));
    gleich(i.getStand().schuesse, 1, 'Animation fertig');
    tief(i.getStand().feld, soll.feld);
  }, { still: false });
});
