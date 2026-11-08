import { test, gleich, tief, wahr } from '../mini-test.js';
import {
  STUFEN, STUFEN_IDS, SPIEGEL, raster, strahl, berechne, gewonnen, dreh, rueckgaengig, wiederholen, neustart,
  kannRueckgaengig, kannWiederholen, hinweis, erzeugeLevel, zumSpeichern, ausSpeicher, istGueltig, MAX_ZUEGE,
} from '../../spiele/lichtstrahlen/logik.js';

/** Kleines Level von Hand (5 × 5, Feld = Zeile * 5 + Spalte) */
function level(teile = {}) {
  return {
    v: 1, stufe: 'leicht', level: 1, seed: 't', n: 5,
    quellen: [{ i: 0, d: 1, f: 0 }], ziele: [{ i: 14, f: 0 }],
    bloecke: [], filter: [], fest: [],
    spiegel: [{ i: 4, o: 1, o0: 1, l: 1, q: 0 }],
    zuege: [], vor: [],
    ...teile,
  };
}

test('Licht: Spiegel lenken um 90° ab, beidseitig', () => {
  // "/" : rechts → oben, oben → rechts, links → unten, unten → links
  tief(SPIEGEL[0], [1, 0, 3, 2]);
  // "\" : rechts → unten, unten → rechts, links → oben, oben → links
  tief(SPIEGEL[1], [3, 2, 1, 0]);
  for (const o of [0, 1]) for (let d = 0; d < 4; d++) gleich(SPIEGEL[o][SPIEGEL[o][d]], d, 'zweimal = Ausgang');
});

test('Licht: Strahl läuft gerade bis zum Rand', () => {
  const z = level({ spiegel: [], ziele: [{ i: 24, f: 0 }] });
  const s = strahl(5, raster(z), z.quellen[0]);
  gleich(s.ende, 'aus');
  tief(s.segs[0].pts[0], [0.5, 0.5]);
  tief(s.segs[0].pts.at(-1), [5, 0.5], 'endet am Feldrand');
});

test('Licht: Spiegel lenkt zum Ziel – falsche Stellung verfehlt', () => {
  const z = level();
  const b = berechne(z);
  gleich(b.gewonnen, true);
  tief(b.strahlen[0].segs[0].pts, [[0.5, 0.5], [1.5, 0.5], [2.5, 0.5], [3.5, 0.5], [4.5, 0.5], [4.5, 1.5], [4.5, 2.5]]);
  const falsch = berechne(level({ spiegel: [{ i: 4, o: 0, o0: 0, l: 1, q: 0 }] }));
  gleich(falsch.gewonnen, false);
  gleich(falsch.strahlen[0].ende, 'aus', '"/" lenkt nach oben hinaus');
});

test('Licht: Hindernis, Quelle und Ziel verschlucken den Strahl', () => {
  let z = level({ spiegel: [], bloecke: [2], ziele: [{ i: 24, f: 0 }] });
  gleich(berechne(z).strahlen[0].ende, 'block');
  z = level({ spiegel: [], quellen: [{ i: 0, d: 1, f: 0 }, { i: 3, d: 2, f: 1 }], ziele: [{ i: 24, f: 0 }, { i: 20, f: 1 }] });
  gleich(berechne(z).strahlen[0].ende, 'quelle');
  gleich(berechne(z).strahlen[1].ende, 'aus');
  z = level({ spiegel: [], ziele: [{ i: 2, f: 0 }] });
  const b = berechne(z);
  gleich(b.strahlen[0].ende, 'ziel');
  tief(b.strahlen[0].segs[0].pts.at(-1), [2.5, 0.5]);
});

test('Licht: Strahlen kreuzen sich ohne Wirkung', () => {
  const z = level({
    spiegel: [], quellen: [{ i: 10, d: 1, f: 0 }, { i: 2, d: 2, f: 1 }],
    ziele: [{ i: 14, f: 0 }, { i: 22, f: 1 }],
  });
  gleich(berechne(z).gewonnen, true);
});

test('Licht: Farbfilter färbt um, falsche Farbe zählt nicht', () => {
  const z = level({ spiegel: [], filter: [{ i: 2, f: 3 }], ziele: [{ i: 4, f: 3 }] });
  const b = berechne(z);
  gleich(b.gewonnen, true);
  tief(b.strahlen[0].segs.map((s) => s.f), [0, 3]);
  const f = berechne(level({ spiegel: [], filter: [{ i: 2, f: 3 }], ziele: [{ i: 4, f: 0 }] }));
  gleich(f.gewonnen, false);
  gleich(f.treffer[0].falsch, true);
  gleich(f.treffer[0].richtig, false);
});

test('Licht: Schleifenschutz – Berechnung endet immer', () => {
  // Felder voller Spiegel: die Berechnung muss enden und darf nicht hängen
  for (let o = 0; o < 64; o++) {
    const sp = [];
    let k = 0;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const i = r * 5 + c;
      if (i === 0 || i === 24) continue;
      if ((i + o) % 2 === 0) { const w = (o >> (k++ % 6)) & 1; sp.push({ i, o: w, o0: w, l: w, q: 0 }); }
    }
    const b = berechne(level({ spiegel: sp, ziele: [{ i: 24, f: 0 }] }));
    wahr(['aus', 'block', 'quelle', 'ziel', 'schleife'].includes(b.strahlen[0].ende));
  }
});

test('Züge: Umschalten, Rückgängig, Wiederholen, Neustart', () => {
  const z0 = level({ spiegel: [{ i: 4, o: 0, o0: 0, l: 1, q: 0 }, { i: 12, o: 1, o0: 1, l: 1, q: 0 }] });
  gleich(gewonnen(z0), false);
  const z1 = dreh(z0, 0);
  gleich(z1.spiegel[0].o, 1);
  gleich(z0.spiegel[0].o, 0, 'alter Zustand bleibt unverändert');
  tief(z1.zuege, [0]);
  gleich(gewonnen(z1), true);
  const z2 = dreh(z1, 1);
  gleich(kannRueckgaengig(z2), true);
  const z3 = rueckgaengig(z2);
  tief(z3.spiegel.map((m) => m.o), [1, 1]);
  tief(z3.vor, [1]);
  gleich(kannWiederholen(z3), true);
  const z4 = wiederholen(z3);
  tief(z4.spiegel.map((m) => m.o), [1, 0]);
  gleich(dreh(z4, 0).vor.length, 0, 'neuer Zug leert Wiederholen');
  const n = neustart(z4);
  tief(n.spiegel.map((m) => m.o), [0, 1]);
  tief(n.zuege, []);
  gleich(rueckgaengig(n), null);
  gleich(dreh(z0, 5), null);
  gleich(dreh(z0, -1), null);
});

test('Züge: sehr lange Verläufe bleiben gültig', () => {
  let z = erzeugeLevel({ stufe: 'leicht', level: 1, seed: 'lang' });
  for (let i = 0; i < MAX_ZUEGE + 7; i++) z = dreh(z, i % z.spiegel.length);
  gleich(z.zuege.length, MAX_ZUEGE);
  wahr(istGueltig(zumSpeichern(z)), 'Stellung folgt weiter aus Start + Zügen');
});

test('Hinweis: zeigt einen Spiegel, der gegen die Lösung steht', () => {
  let st = erzeugeLevel({ stufe: 'mittel', level: 1, seed: 'hinweis' });
  let n = 0;
  while (!gewonnen(st) && n++ < 40) {
    const h = hinweis(st);
    wahr(h, 'Hinweis vorhanden, solange nicht gelöst');
    const k = st.spiegel.findIndex((m) => m.i === h.i);
    wahr(st.spiegel[k].o !== st.spiegel[k].l, 'der gezeigte Spiegel steht falsch');
    st = dreh(st, k);
  }
  gleich(gewonnen(st), true, 'Hinweise führen zur Lösung');
  gleich(hinweis(st), null);
});

for (const id of STUFEN_IDS) {
  test(`Generator ${id}: 25 Seeds – Invarianten, Lösung gewinnt, Start offen`, () => {
    const S = STUFEN[id];
    for (let t = 0; t < 25; t++) {
      const z = erzeugeLevel({ stufe: id, level: t + 1, seed: `seed-${id}-${t}` });
      const ctx = `${id}/${t}`;
      gleich(z.n, S.n, ctx);
      gleich(z.ziele.length, z.quellen.length, ctx);
      wahr(z.spiegel.length >= 2, `${ctx}: Spiegel`);
      const alle = [...z.quellen, ...z.ziele, ...z.filter, ...z.fest, ...z.spiegel].map((e) => e.i).concat(z.bloecke);
      gleich(new Set(alle).size, alle.length, `${ctx}: Felder eindeutig`);
      wahr(alle.every((i) => i >= 0 && i < z.n * z.n), ctx);
      gleich(berechne(z, z.spiegel.map((m) => m.l)).gewonnen, true, `${ctx}: Lösung gewinnt`);
      gleich(gewonnen(z), false, `${ctx}: Start nicht gelöst`);
      wahr(z.spiegel.filter((m) => m.o !== m.l).length >= 1, ctx);
      wahr(istGueltig(zumSpeichern(z)), `${ctx}: Spielstand gültig`);
    }
  });
}

test('Generator: Stufen-Umfang (Spiegel, Quellen, Filter) und kein Notlevel', () => {
  for (const id of STUFEN_IDS) {
    const S = STUFEN[id];
    for (let t = 0; t < 25; t++) {
      const z = erzeugeLevel({ stufe: id, level: 1, seed: `umfang-${t}` });
      wahr(z.spiegel.length >= S.spiegel[0] && z.spiegel.length <= S.spiegel[1], `${id}/${t}: Spiegel ${z.spiegel.length}`);
      wahr(z.quellen.length >= S.quellen[0] && z.quellen.length <= S.quellen[1], `${id}/${t}: Quellen ${z.quellen.length}`);
      wahr(z.filter.length >= S.filter[0] && z.filter.length <= S.filter[1], `${id}/${t}: Filter`);
      wahr(z.fest.length >= S.fest[0] && z.fest.length <= S.fest[1], `${id}/${t}: fest`);
      wahr(z.spiegel.filter((m) => m.o !== m.l).length >= Math.min(S.minFalsch, z.spiegel.length) || id === 'leicht' && z.spiegel.length >= 2, `${id}/${t}: verdreht`);
    }
  }
});

test('Generator: gleicher Seed → gleiches Level, anderer Seed → anderes', () => {
  for (const id of STUFEN_IDS) {
    const a = erzeugeLevel({ stufe: id, level: 3, seed: 'abc' });
    const b = erzeugeLevel({ stufe: id, level: 3, seed: 'abc' });
    gleich(JSON.stringify(a), JSON.stringify(b), id);
    const c = erzeugeLevel({ stufe: id, level: 3, seed: 'abd' });
    wahr(JSON.stringify(a) !== JSON.stringify(c), id);
  }
  gleich(erzeugeLevel({ stufe: 'unbekannt', seed: 'x' }).stufe, 'leicht');
});

test('Spielstand: gültig wird übernommen, Mängel werden erkannt', () => {
  const z = erzeugeLevel({ stufe: 'mittel', level: 7, seed: 'sp' });
  const gut = zumSpeichern(dreh(z, 0));
  tief(ausSpeicher(gut), gut);
  gleich(ausSpeicher(null), null);
  gleich(ausSpeicher('x'), null);
  gleich(ausSpeicher([]), null);
  gleich(ausSpeicher({ ...gut, v: 2 }), null);
  gleich(ausSpeicher({ ...gut, stufe: 'toString' }), null);
  gleich(ausSpeicher({ ...gut, stufe: 'schwer' }), null, 'Rastergröße passt nicht zur Stufe');
  gleich(ausSpeicher({ ...gut, n: 6 }), null);
  gleich(ausSpeicher({ ...gut, level: 0 }), null);
  gleich(ausSpeicher({ ...gut, seed: 5 }), null);
  gleich(ausSpeicher({ ...gut, quellen: [] }), null);
  gleich(ausSpeicher({ ...gut, ziele: gut.ziele.slice(1) }), null);
  gleich(ausSpeicher({ ...gut, bloecke: [gut.quellen[0].i] }), null, 'doppeltes Feld');
  gleich(ausSpeicher({ ...gut, bloecke: [999] }), null);
  gleich(ausSpeicher({ ...gut, bloecke: ['1'] }), null);
  gleich(ausSpeicher({ ...gut, quellen: [{ ...gut.quellen[0], d: 4 }, ...gut.quellen.slice(1)] }), null);
  gleich(ausSpeicher({ ...gut, quellen: [{ ...gut.quellen[0], f: 99 }, ...gut.quellen.slice(1)] }), null);
  gleich(ausSpeicher({ ...gut, spiegel: [{ ...gut.spiegel[0], o: 2 }, ...gut.spiegel.slice(1)] }), null);
  gleich(ausSpeicher({ ...gut, spiegel: [{ ...gut.spiegel[0], l: 1 - gut.spiegel[0].l }, ...gut.spiegel.slice(1)] }), null, 'Lösung gewinnt nicht');
  gleich(ausSpeicher({ ...gut, spiegel: [{ ...gut.spiegel[0], o: 1 - gut.spiegel[0].o }, ...gut.spiegel.slice(1)] }), null, 'Stellung passt nicht zu den Zügen');
  gleich(ausSpeicher({ ...gut, zuege: [99] }), null);
  gleich(ausSpeicher({ ...gut, zuege: new Array(MAX_ZUEGE + 1).fill(0) }), null);
  gleich(ausSpeicher({ ...gut, vor: 'x' }), null);
  gleich('extra' in ausSpeicher({ ...gut, extra: '<img>' }), false, 'fremde Felder werden verworfen');
  gleich(ausSpeicher(JSON.parse('{"__proto__":{"x":1},"v":1}')), null);
  gleich(({}).x, undefined);
});

test('Still: kein vibrate/Audio/eval/Roh-HTML im Spiel', async () => {
  for (const d of ['index.js', 'logik.js']) {
    const q = await fetch(new URL(`../../spiele/lichtstrahlen/${d}`, import.meta.url)).then((r) => r.text());
    wahr(!/\bvibrate\b|new\s+Audio\b|AudioContext|\.play\(\)|\beval\(|new Function|innerHTML|setTimeout|setInterval|Date\.now/.test(q), d);
  }
  const css = await fetch(new URL('../../spiele/lichtstrahlen/stil.css', import.meta.url)).then((r) => r.text());
  wahr(css.length > 200);
});

// ---------------------------------------------------------------------------------------------
// Oberfläche (mit Ersatz-Kontext)
import modul from '../../spiele/lichtstrahlen/index.js';
import { erstelleSpeicher } from '../../kern/speicher.js';
import { erstelleEinstellungen } from '../../kern/einstellungen.js';
import { erstelleZufall, neuerSeed } from '../../kern/zufall.js';
import { erstelleFarben } from '../../kern/farben.js';
import * as eingabe from '../../kern/eingabe.js';
import { falscherSpeicher } from '../kern/hilfen.js';

function kontext(signal, { muster = false, variante = 'leicht' } = {}) {
  const speicher = erstelleSpeicher({ backend: falscherSpeicher() });
  const einstellungen = erstelleEinstellungen(speicher);
  if (muster) einstellungen.setze('muster', true);
  const log = { meldungen: [], aenderungen: 0, gewonnen: [] };
  return {
    log, variante,
    speicher: speicher.bereich('lichtstrahlen:daten:'),
    einstellungen: Object.assign(Object.create(einstellungen), { spiel: einstellungen.spiel('lichtstrahlen') }),
    statistik: { melde() {} },
    zufall: (s, z) => erstelleZufall(s, z),
    neuerSeed,
    farben: erstelleFarben(einstellungen),
    eingabe, signal,
    bewegungReduziert: () => true,
    worker: () => { throw new Error('kein Worker nötig'); },
    meldung: (t) => log.meldungen.push(t),
    meldeAenderung: () => { log.aenderungen++; },
    meldeGewonnen: (t) => log.gewonnen.push(t),
    neuesSpiel() {},
  };
}

function mounte(stand = null, optionen) {
  const ac = new AbortController();
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:700px';
  document.body.append(container);
  const ctx = kontext(ac.signal, optionen);
  const inst = modul.erstelle(container, ctx, stand);
  const weg = () => { try { inst.zerstoere(); } catch { /* egal */ } ac.abort(); container.remove(); };
  return { container, ctx, inst, weg };
}

test('Oberfläche: Aufbau, Klick schaltet Spiegel, Gewinn sperrt', () => {
  const start = level({ spiegel: [{ i: 4, o: 0, o0: 0, l: 1, q: 0 }] });
  const m = mounte(zumSpeichern(start));
  try {
    gleich(m.container.querySelectorAll('.ls-zelle').length, 25);
    wahr(m.container.querySelector('.ls-strahl'), 'Strahl gezeichnet');
    const knopf = m.container.querySelectorAll('.ls-zelle')[4];
    wahr(/Spiegel/.test(knopf.getAttribute('aria-label')), knopf.getAttribute('aria-label'));
    gleich(m.container.querySelector('.ls-zaehler').textContent, '0 von 1 Zielen getroffen');
    m.container.querySelectorAll('.ls-zelle')[7].click();      // Nicht-Spiegel: nichts passiert
    gleich(m.inst.getStand().zuege.length, 0);
    gleich(m.inst.kannRueckgaengig(), false);
    knopf.click();
    gleich(m.inst.getStand().spiegel[0].o, 1);
    gleich(m.ctx.log.gewonnen.length, 1, 'Gewinn gemeldet');
    gleich(m.container.querySelector('.ls-zaehler').textContent, 'Alle Ziele getroffen');
    knopf.click();
    gleich(m.inst.getStand().zuege.length, 1, 'nach dem Gewinn gesperrt');
  } finally { m.weg(); }
});

test('Oberfläche: Rückgängig, Wiederholen, Neustart', () => {
  const m = mounte(zumSpeichern(level({
    spiegel: [{ i: 4, o: 0, o0: 0, l: 1, q: 0 }, { i: 12, o: 0, o0: 0, l: 0, q: 0 }],
  })));
  try {
    const z = m.container.querySelectorAll('.ls-zelle');
    z[12].click();
    z[12].click();
    gleich(m.inst.getStand().zuege.length, 2);
    m.inst.rueckgaengig();
    gleich(m.inst.getStand().zuege.length, 1);
    gleich(m.inst.kannWiederholen(), true);
    m.inst.wiederholen();
    gleich(m.inst.getStand().zuege.length, 2);
    gleich(m.ctx.log.aenderungen >= 4, true, 'jede Änderung gemeldet');
    m.inst.neustart();
    gleich(m.inst.getStand().zuege.length, 0);
  } finally { m.weg(); }
});

test('Oberfläche: Tastatur – Pfeile, Enter, Leertaste', () => {
  const m = mounte(zumSpeichern(level({ spiegel: [{ i: 4, o: 0, o0: 0, l: 1, q: 0 }, { i: 12, o: 0, o0: 0, l: 0, q: 0 }] })));
  try {
    const zellen = m.container.querySelectorAll('.ls-zelle');
    zellen[0].focus();
    const ev = (key, ziel) => {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      Object.defineProperty(e, 'target', { value: ziel });
      return m.inst.onTaste(e);
    };
    gleich(ev('ArrowRight', zellen[0]), true);
    gleich(document.activeElement, zellen[1]);
    for (let i = 0; i < 3; i++) ev('ArrowRight', document.activeElement);
    gleich(document.activeElement, zellen[4]);
    gleich(zellen[4].getAttribute('tabindex'), '0', 'Roving tabindex');
    gleich(zellen[0].getAttribute('tabindex'), '-1');
    gleich(ev('ArrowRight', zellen[4]), true, 'Rand: Taste verbraucht, bleibt stehen');
    gleich(document.activeElement, zellen[4]);
    gleich(ev('ArrowDown', zellen[4]), true);
    gleich(document.activeElement, zellen[9]);
    gleich(ev('x', zellen[9]), false);
    gleich(ev('Enter', zellen[9]), false, 'Knopf löst selbst aus');
    zellen[4].click();                       // wie Enter auf dem Knopf
    gleich(m.inst.getStand().spiegel[0].o, 1);
    // Enter/Leertaste ohne Knopf-Fokus schaltet das Feld mit dem Fokus (hier Zeile 2, Spalte 5 = kein Spiegel)
    gleich(ev(' ', m.container.querySelector('.ls')), true);
  } finally { m.weg(); }
});

test('Oberfläche: Hinweis markiert falschen Spiegel, Hinweise lösen das Level', () => {
  const m = mounte(null, { variante: 'mittel' });
  try {
    let n = 0;
    while (m.ctx.log.gewonnen.length === 0 && n++ < 40) {
      m.inst.hinweis();
      const knopf = m.container.querySelector('.ls-tipp-knopf');
      wahr(knopf, 'markierter Knopf');
      wahr(/Tipp/.test(knopf.getAttribute('aria-label')));
      wahr(m.container.querySelector('.ls-tipp'), 'Rahmen im SVG');
      knopf.click();
    }
    gleich(m.ctx.log.gewonnen.length, 1);
    wahr(/Level 1 · Mittel/.test(m.ctx.log.gewonnen[0]), m.ctx.log.gewonnen[0]);
    gleich(m.ctx.speicher.lies('geloest', {}).mittel, 1, 'Level-Zähler gespeichert');
    const seed = m.inst.getStand().seed;
    m.inst.neu('mittel');
    gleich(m.inst.getStand().level, 2, 'nächstes Level');
    wahr(m.inst.getStand().seed !== seed);
  } finally { m.weg(); }
});

test('Oberfläche: Stufen, Spielstand laden, Symbole bei Muster', () => {
  for (const id of STUFEN_IDS) {
    const m = mounte(null, { variante: id });
    try {
      gleich(m.container.querySelectorAll('.ls-zelle').length, STUFEN[id].n ** 2, id);
      gleich(m.inst.getStand().stufe, id);
      wahr(/Ziele/.test(m.inst.zusammenfassung()));
    } finally { m.weg(); }
  }
  const stand = zumSpeichern(erzeugeLevel({ stufe: 'schwer', level: 4, seed: 'laden' }));
  const m = mounte(stand, { muster: true });
  try {
    tief(m.inst.getStand(), stand);
    wahr(m.container.querySelectorAll('.ls-sym, .ls-sym-hohl').length >= 2, 'Symbole in Quellen/Zielen');
    wahr(m.container.querySelectorAll('.ls-strahl').length > 0);
  } finally { m.weg(); }
  const o = mounte(stand);
  try { gleich(o.container.querySelectorAll('.ls-sym, .ls-sym-hohl').length, 0, 'ohne Muster keine Symbole'); } finally { o.weg(); }
  // gespeicherter, schon gelöster Stand → neues Level statt Endlos-Gelöst
  const geloest = { ...stand, spiegel: stand.spiegel.map((q) => ({ ...q, o: q.l, o0: q.l })), zuege: [] };
  const g = mounte(geloest);
  try { wahr(!gewonnen(g.inst.getStand()), 'neues Level'); } finally { g.weg(); }
});

// Kaputte Spielstände dürfen nichts kaputt machen (wie kern/robustheit.test.js, hier gezielt für dieses Spiel)
test('Robustheit: kaputte und manipulierte Spielstände', () => {
  const BOESE = '<img src=x data-boese="1"><script data-boese="1">window.__boese=1</script>';
  const gut = zumSpeichern(dreh(erzeugeLevel({ stufe: 'mittel', level: 1, seed: 'rob' }), 0));
  const faelle = [null, 0, 'x', [], {}, { v: 1 }, JSON.parse('{"__proto__":{"verseucht":1}}')];
  const werte = [BOESE, -1, 1e12, null, [], {}, [BOESE], { a: BOESE }, true, 'NaN'];
  for (const k of Object.keys(gut)) {
    for (const w of werte) faelle.push({ ...gut, [k]: w });
    if (Array.isArray(gut[k]) && gut[k].length) {
      faelle.push({ ...gut, [k]: [BOESE, ...gut[k].slice(1)] });
      faelle.push({ ...gut, [k]: gut[k].slice(0, 1) });
    }
  }
  const fehler = [];
  const beiFehler = (e) => { fehler.push(String(e.message || e.reason)); e.preventDefault?.(); };
  window.addEventListener('error', beiFehler);
  try {
    for (let i = 0; i < faelle.length; i++) {
      const m = mounte(faelle[i]);
      try {
        m.inst.getStand(); m.inst.zusammenfassung?.();
        wahr(m.container.querySelectorAll('.ls-zelle').length > 0, `Fall ${i}: Spielfeld da`);
        wahr(!/data-boese/.test(m.container.innerHTML), `Fall ${i}: HTML eingeschleust`);
      } finally { m.weg(); }
    }
  } finally { window.removeEventListener('error', beiFehler); }
  gleich(fehler.join(' | '), '');
  gleich(window.__boese, undefined);
  gleich(({}).verseucht, undefined);
});
