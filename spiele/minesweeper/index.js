// Minesweeper: klassisch (Anfänger/Fortgeschritten/Experte, wahlweise „ohne Raten“) und Unendlich.
// Bedienung: Maus (links aufdecken, rechts Flagge, ziehen = verschieben, Rad = Zoom),
// Touch (tippen, lange drücken = Flagge, Umschalter, Pinch), Tastatur (Pfeile, Enter/Leertaste, F, ?, Pos1, +/−).
import { h, ladeStil, symbol } from '../../kern/dom.js';
import { ICONS } from '../../kern/symbole.js';
import { zeigeDialog } from '../../kern/dialog.js';
import * as K from './logik.js';
import * as U from './unendlich.js';
import { analysiere } from './loeser.js';
import { erstelleZeichner, leseFarben, CODE } from './zeichner.js';

const LANG_MS = 400;
const SCHWELLE_PX = 8;
const ZOOM_UNENDLICH = [14, 64];
const MARKIERT_MS = 450;
const HINWEIS_FENSTER = 40;
const zahlText = (n) => n.toLocaleString('de-DE');
const mehrzahl = (n, eins, viele) => `${zahlText(n)} ${n === 1 ? eins : viele}`;

export default {
  id: 'minesweeper',
  name: 'Minesweeper',
  beschreibung: 'Felder aufdecken, Minen meiden – klassisch oder auf einem unendlichen Feld.',
  varianten: [
    { id: 'anfaenger', name: 'Anfänger – 9 × 9, 10 Minen' },
    { id: 'fortgeschritten', name: 'Fortgeschritten – 16 × 16, 40 Minen' },
    { id: 'experte', name: 'Experte – 30 × 16, 99 Minen' },
    { id: 'unendlich', name: 'Unendlich – endloses Feld' },
  ],
  standVersion: 1,

  erstelle(container, ctx, gespeichert) {
    ladeStil('spiele/minesweeper/stil.css');
    const { signal } = ctx;
    const opt = {
      get ohneRaten() { return ctx.einstellungen.spiel.wert('ohneRaten', true) !== false; },
      get ausgang() { const a = ctx.einstellungen.spiel.wert('ausgang', 'entspannt'); return K.AUSGAENGE.includes(a) ? a : 'entspannt'; },
      get fragezeichen() { return ctx.einstellungen.spiel.wert('fragezeichen', false) === true; },
      get dichte() { const d = ctx.einstellungen.spiel.wert('dichte', U.STANDARD_DICHTE); return U.DICHTEN.includes(d) ? d : U.STANDARD_DICHTE; },
    };
    const worker = ctx.worker('spiele/minesweeper/generator.worker.js');

    // ---------- Zustand ----------
    let art = 'klassisch';      // 'klassisch' | 'unendlich'
    let z = null;               // klassischer Zustand
    let w = null;               // unendliche Welt
    let nbListe = null;         // Nachbar-Listen für den Löser (klassisch)
    let erzeugt = false;        // Worker rechnet gerade
    let generation = 0;
    let cursor = { x: 0, y: 0 };  // Logik-Koordinaten
    let cursorSichtbar = false;
    let kamera = { x: 0, y: 0, zelle: 32 };
    let hochkant = false;
    let flaggenModus = false;
    let markiert = [];          // Logik-Koordinaten [{x,y}]
    let markiertTimer = 0;
    let gedrueckt = [];         // Vorschau beim Halten (Logik-Koordinaten)
    let ring = null;
    let flutFrame = 0;
    let zeichenFrame = 0;
    let zeichenTimer = 0;
    let aktiv = true;

    // ---------- DOM ----------
    const infoEl = h('p', { class: 'ms-info', 'aria-live': 'polite' });
    const startKnopf = h('button', {
      type: 'button', class: 'knopf klein', title: 'Zurück zum Start (Pos1)', on: { click: () => zumStart() },
    }, 'Zum Start');
    const optKnopf = h('button', {
      type: 'button', class: 'knopf symbol-knopf ms-opt', 'aria-label': 'Optionen', title: 'Optionen',
      on: { click: () => optionenDialog() },
    }, symbol(ICONS.einstellungen));
    const canvas = h('canvas', {
      class: 'ms-canvas', tabindex: '0', role: 'application', 'aria-roledescription': 'Minenfeld',
      'aria-label': 'Minenfeld. Pfeiltasten bewegen den Cursor, Enter oder Leertaste deckt auf, F setzt eine Flagge.',
    });
    const ansage = h('p', { class: 'ms-ansage', 'aria-live': 'polite', role: 'status' });
    canvas.setAttribute('aria-describedby', 'ms-ansage');
    ansage.id = 'ms-ansage';
    const ende = h('div', { class: 'ms-ende', hidden: true, role: 'status', 'aria-live': 'polite' });
    const buehne = h('div', { class: 'ms-buehne' }, canvas, ende);
    const knopfAuf = h('button', { type: 'button', class: 'knopf klein', 'aria-pressed': 'true', on: { click: () => setzeModus(false) } }, 'Aufdecken');
    const knopfFlagge = h('button', { type: 'button', class: 'knopf klein', 'aria-pressed': 'false', on: { click: () => setzeModus(true) } }, 'Flagge');
    const modusLeiste = h('div', { class: 'ms-modus', role: 'group', 'aria-label': 'Tippen bewirkt' }, knopfAuf, knopfFlagge);
    const wurzel = h('div', { class: 'ms' },
      h('div', { class: 'ms-leiste' }, infoEl, h('div', { class: 'ms-leiste-knoepfe' }, startKnopf, optKnopf)),
      buehne,
      h('div', { class: 'ms-fuss' }, modusLeiste),
      ansage,
    );
    container.append(wurzel);

    const zeichner = erstelleZeichner(canvas);
    const farbenNeu = () => { zeichner.setzeFarben(leseFarben(wurzel)); plane(); };
    // Stylesheet lädt asynchron → Farben erst lesen, wenn die Spiel-Variablen da sind
    const stilLink = [...document.querySelectorAll('link[data-stil]')].find((l) => l.href.endsWith('spiele/minesweeper/stil.css'));
    stilLink?.addEventListener('load', () => { if (aktiv) farbenNeu(); }, { signal });
    let farbVersuche = 0;
    const warteAufStil = () => {
      if (!aktiv) return;
      if (getComputedStyle(wurzel).getPropertyValue('--ms-z1').trim()) { farbenNeu(); return; }
      if (++farbVersuche < 120) requestAnimationFrame(warteAufStil);
    };

    // ---------- Koordinaten ----------
    const anzeigeGroesse = () => (art === 'klassisch' ? (hochkant ? { b: z.h, h: z.b } : { b: z.b, h: z.h }) : null);
    const zuAnzeige = (x, y) => (art === 'klassisch' && hochkant ? { dx: y, dy: x } : { dx: x, dy: y });
    const zuLogik = (dx, dy) => (art === 'klassisch' && hochkant ? { x: dy, y: dx } : { x: dx, y: dy });
    const imBrett = (x, y) => art === 'unendlich' ? U.imFeld(x, y) : x >= 0 && y >= 0 && x < z.b && y < z.h;

    function codeLogik(x, y) {
      if (art === 'unendlich') return U.zellCode(w, x, y);
      if (!imBrett(x, y)) return CODE.AUSSEN;
      const i = y * z.b + x;
      if (z.offen[i]) return z.zahlen[i];
      if (z.treffer[i]) return CODE.TREFFER;
      const m = z.marke[i];
      const verloren = z.status === 'verloren', gewonnen = z.status === 'gewonnen';
      if (m === K.FLAGGE) return verloren && !z.minen[i] ? CODE.FALSCH : CODE.FLAGGE;
      if (z.minen && z.minen[i]) { if (verloren) return CODE.MINE; if (gewonnen) return CODE.FLAGGE; }
      if (m === K.FRAGE) return CODE.FRAGE;
      return CODE.VERDECKT;
    }

    // ---------- Zeichnen ----------
    function plane() {
      if (zeichenFrame || !aktiv) return;
      zeichenFrame = requestAnimationFrame(zeichneJetzt);
      // Rückfall, falls der Browser keine Frames liefert (Hintergrund-Fenster)
      zeichenTimer = setTimeout(() => { if (zeichenFrame) zeichneJetzt(); }, 120);
    }
    function zeichneJetzt() {
      cancelAnimationFrame(zeichenFrame);
      clearTimeout(zeichenTimer);
      zeichenFrame = 0;
      if (!aktiv || (!z && !w)) return;
      zeichner.zeichne({
        kamera,
        code: (dx, dy) => { const p = zuLogik(dx, dy); return codeLogik(p.x, p.y); },
        grenzen: anzeigeGroesse(),
        cursor: cursorSichtbar ? zuAnzeige(cursor.x, cursor.y) : null,
        markiert: markiert.map((p) => zuAnzeige(p.x, p.y)),
        gedrueckt: gedrueckt.map((p) => zuAnzeige(p.x, p.y)),
        ring: ring ? { ...zuAnzeige(ring.x, ring.y), anteil: ring.anteil } : null,
      });
    }

    function aktualisiereInfo() {
      let text;
      if (art === 'klassisch') {
        const rest = z.anzahl - K.flaggenZahl(z) - K.trefferZahl(z);
        text = `${K.STUFEN[z.stufe].name} · Minen ${zahlText(z.anzahl)} · übrig ${zahlText(rest)}`;
        const t = K.trefferZahl(z);
        if (t) text += ` · ${mehrzahl(t, 'Treffer', 'Treffer')}`;
        if (z.ausgang === 'hardcore') text += ' · Hardcore';
      } else {
        text = `Aufgedeckt ${zahlText(w.zaehler.aufgedeckt)} · Treffer ${zahlText(w.zaehler.treffer)}`;
        if (w.ausgang === 'hardcore') text += ' · Hardcore';
      }
      infoEl.textContent = text;
      startKnopf.hidden = art !== 'unendlich';
      canvas.setAttribute('aria-label', art === 'klassisch'
        ? `Minenfeld ${anzeigeGroesse().b} mal ${anzeigeGroesse().h}. Pfeiltasten bewegen den Cursor, Enter oder Leertaste deckt auf, F setzt eine Flagge.`
        : 'Unendliches Minenfeld. Pfeiltasten bewegen den Cursor, Enter oder Leertaste deckt auf, F setzt eine Flagge, Pos1 springt zum Start.');
    }

    function zeigeEnde() {
      const verloren = art === 'klassisch' ? z.status === 'verloren' : w.status === 'verloren';
      if (!verloren) { ende.hidden = true; return; }
      const text = art === 'klassisch'
        ? `${zahlText(z.offenZahl)} von ${zahlText(K.sichereZellen(z))} sicheren Feldern aufgedeckt`
        : `${mehrzahl(w.zaehler.aufgedeckt, 'Feld', 'Felder')} aufgedeckt`;
      ende.replaceChildren(h('div', { class: 'ms-ende-karte' },
        h('p', { class: 'ms-ende-titel', text: 'Mine getroffen' }),
        h('p', { class: 'leise', text }),
        h('div', { class: 'ms-ende-knoepfe' },
          h('button', { type: 'button', class: 'knopf', on: { click: () => { instanz.neustart(); ctx.meldeAenderung(); } } },
            art === 'klassisch' ? 'Gleiches Feld von vorn' : 'Von vorn'),
          h('button', { type: 'button', class: 'knopf primaer', on: { click: () => ctx.neuesSpiel() } }, 'Neues Spiel'),
        ),
      ));
      ende.hidden = false;
    }

    function alles() {
      aktualisiereInfo();
      zeigeEnde();
      plane();
    }

    // ---------- Ansage (Screenreader) ----------
    function zellText(x, y) {
      const c = codeLogik(x, y);
      if (c === 0) return 'leer';
      if (c <= 8) return c === 1 ? '1 Mine in der Nähe' : `${c} Minen in der Nähe`;
      return { 9: 'verdeckt', 10: 'Flagge', 11: 'Fragezeichen', 12: 'Mine getroffen', 13: 'Mine', 14: 'falsche Flagge', 15: 'außerhalb' }[c];
    }
    function sage() {
      const { dx, dy } = zuAnzeige(cursor.x, cursor.y);
      ansage.textContent = art === 'klassisch'
        ? `Zeile ${dy + 1}, Spalte ${dx + 1}: ${zellText(cursor.x, cursor.y)}`
        : `Zeile ${cursor.y}, Spalte ${cursor.x}: ${zellText(cursor.x, cursor.y)}`;
    }

    // ---------- Kamera ----------
    function passeAn({ zentrieren = false } = {}) {
      const r = buehne.getBoundingClientRect();
      const bw = Math.max(1, Math.floor(r.width)), bh = Math.max(1, Math.floor(r.height));
      zeichner.groesse(bw, bh);
      if (art === 'klassisch') {
        const vorher = hochkant;
        hochkant = z.b > z.h && bh > bw * 1.15;
        if (vorher !== hochkant) zentrieren = true;
        const g = anzeigeGroesse();
        const passend = Math.max(8, Math.min(56, Math.floor(Math.min((bw - 8) / g.b, (bh - 8) / g.h))));
        kamera.min = passend;
        kamera.max = Math.max(passend, 44);
        if (zentrieren || kamera.zelle < kamera.min || kamera.zelle > kamera.max) {
          kamera.zelle = passend;
          kamera.x = g.b / 2; kamera.y = g.h / 2;
        }
      } else {
        kamera.min = ZOOM_UNENDLICH[0];
        kamera.max = ZOOM_UNENDLICH[1];
        kamera.zelle = Math.max(kamera.min, Math.min(kamera.max, kamera.zelle));
      }
      begrenze();
      plane();
    }

    function begrenze() {
      const zl = kamera.zelle, W = zeichner.breite, H = zeichner.hoehe;
      if (art === 'klassisch') {
        const g = anzeigeGroesse();
        const achse = (pos, n, px) => {
          const sicht = px / zl;
          if (sicht >= n) return n / 2;
          return Math.max(sicht / 2, Math.min(n - sicht / 2, pos));
        };
        kamera.x = achse(kamera.x, g.b, W);
        kamera.y = achse(kamera.y, g.h, H);
      } else {
        const m = U.GRENZE - 64;
        kamera.x = Math.max(-m, Math.min(m, kamera.x));
        kamera.y = Math.max(-m, Math.min(m, kamera.y));
      }
    }

    function zoome(faktor, px = zeichner.breite / 2, py = zeichner.hoehe / 2) {
      const alt = kamera.zelle;
      const neu = Math.max(kamera.min, Math.min(kamera.max, alt * faktor));
      if (neu === alt) return;
      const W = zeichner.breite, H = zeichner.hoehe;
      const wx = kamera.x + (px - W / 2) / alt, wy = kamera.y + (py - H / 2) / alt;
      kamera.zelle = neu;
      kamera.x = wx - (px - W / 2) / neu;
      kamera.y = wy - (py - H / 2) / neu;
      begrenze();
      plane();
    }

    /** Kamera so verschieben, dass die Cursorzelle sichtbar ist */
    function folgeCursor() {
      const { dx, dy } = zuAnzeige(cursor.x, cursor.y);
      const zl = kamera.zelle, W = zeichner.breite, H = zeichner.hoehe;
      const rand = Math.min(2, Math.floor(Math.min(W, H) / zl / 4));
      const halbB = W / 2 / zl, halbH = H / 2 / zl;
      if (dx < kamera.x - halbB + rand) kamera.x = dx + halbB - rand;
      if (dx + 1 > kamera.x + halbB - rand) kamera.x = dx + 1 - halbB + rand;
      if (dy < kamera.y - halbH + rand) kamera.y = dy + halbH - rand;
      if (dy + 1 > kamera.y + halbH - rand) kamera.y = dy + 1 - halbH + rand;
      begrenze();
    }

    function zentriereAuf(x, y) {
      const { dx, dy } = zuAnzeige(x, y);
      kamera.x = dx + 0.5; kamera.y = dy + 0.5;
      begrenze();
    }

    function zumStart() {
      if (art !== 'unendlich') return;
      cursor = { x: 0, y: 0 };
      zentriereAuf(0, 0);
      sage();
      plane();
    }

    function zelleBei(px, py) {
      const zl = kamera.zelle;
      const dx = Math.floor(kamera.x + (px - zeichner.breite / 2) / zl);
      const dy = Math.floor(kamera.y + (py - zeichner.hoehe / 2) / zl);
      const p = zuLogik(dx, dy);
      return imBrett(p.x, p.y) ? p : null;
    }

    // ---------- Spiel anlegen / laden ----------
    function neuesSpiel(variante, seed = ctx.neuerSeed()) {
      generation++;
      erzeugt = false;
      cancelAnimationFrame(flutFrame); flutFrame = 0;
      markiert = []; gedrueckt = []; ring = null;
      if (variante === 'unendlich') {
        art = 'unendlich';
        z = null;
        w = U.erstelleWelt({ seed, dichte: opt.dichte, ausgang: opt.ausgang });
        U.beginne(w);
        cursor = { x: 0, y: 0 };
        kamera = { x: 0.5, y: 0.5, zelle: matchMedia('(pointer: coarse)').matches ? 36 : 32 };
      } else {
        art = 'klassisch';
        w = null;
        z = K.neuesKlassisch({ stufe: K.STUFEN[variante] ? variante : 'anfaenger', seed, ausgang: opt.ausgang, ohneRaten: opt.ohneRaten });
        nbListe = K.nachbarListe(z.b, z.h);
        cursor = { x: Math.floor(z.b / 2), y: Math.floor(z.h / 2) };
        kamera = { x: 0, y: 0, zelle: 0 };
      }
      passeAn({ zentrieren: true });
      alles();
    }

    function lade(st) {
      if (!st || typeof st !== 'object') return false;
      if (st.modus === 'klassisch' && ctx.variante !== 'unendlich') {
        const zz = K.ausSpeicher(st);
        if (!zz || zz.stufe !== (K.STUFEN[ctx.variante] ? ctx.variante : zz.stufe)) return false;
        art = 'klassisch'; z = zz; w = null;
        nbListe = K.nachbarListe(z.b, z.h);
        cursor = { x: Math.floor(z.b / 2), y: Math.floor(z.h / 2) };
        kamera = { x: 0, y: 0, zelle: 0 };
      } else if (st.modus === 'unendlich' && ctx.variante === 'unendlich') {
        const ww = U.ausSpeicher(st);
        if (!ww) return false;
        art = 'unendlich'; w = ww; z = null;
        cursor = { x: 0, y: 0 };
        kamera = { x: 0.5, y: 0.5, zelle: 32 };
        const k = st.kamera;
        if (k && [k.x, k.y, k.zelle].every(Number.isFinite) && Math.abs(k.x) < U.GRENZE && Math.abs(k.y) < U.GRENZE) {
          kamera = { x: k.x, y: k.y, zelle: k.zelle };
        }
      } else return false;
      const c = st.cursor;
      if (Array.isArray(c) && c.length === 2 && c.every(Number.isInteger) && imBrett(c[0], c[1])) cursor = { x: c[0], y: c[1] };
      passeAn({ zentrieren: art === 'klassisch' });
      if (art === 'unendlich' && U.flutLaeuft(w)) setzeFlutFort();
      alles();
      return true;
    }

    // ---------- Aktionen ----------
    function markiere(liste) {
      clearTimeout(markiertTimer);
      markiert = liste;
      plane();
      if (liste.length) markiertTimer = setTimeout(() => { markiert = []; plane(); }, MARKIERT_MS);
    }

    function nachZug(treffer) {
      if (art === 'klassisch') {
        if (z.status === 'gewonnen') {
          const t = K.trefferZahl(z);
          const teile = [K.STUFEN[z.stufe].name, t ? mehrzahl(t, 'Treffer', 'Treffer') : 'ohne Treffer'];
          if (z.hinweise) teile.push(mehrzahl(z.hinweise, 'Hinweis', 'Hinweise'));
          alles();
          ctx.meldeAenderung();
          ctx.meldeGewonnen(teile.join(' · '));
          return;
        }
        if (treffer && z.status === 'laeuft') ctx.meldung('Mine getroffen – mit Rückgängig (Z) nimmst du den Fehlklick zurück.');
      } else if (treffer && w.status === 'laeuft') {
        ctx.meldung('Mine getroffen – mit Rückgängig (Z) nimmst du den Fehlklick zurück.');
      }
      alles();
      if (cursorSichtbar) sage();
      ctx.meldeAenderung();
    }

    function setzeFlutFort() {
      cancelAnimationFrame(flutFrame);
      const schritt = () => {
        flutFrame = 0;
        if (!aktiv || art !== 'unendlich') return;
        U.arbeite(w);
        alles();
        if (U.flutLaeuft(w)) flutFrame = requestAnimationFrame(schritt);
        else ctx.meldeAenderung();
      };
      flutFrame = requestAnimationFrame(schritt);
    }

    function laeuft() {
      if (erzeugt) return false;
      return art === 'klassisch' ? z.status === 'laeuft' : w.status === 'laeuft';
    }

    async function ersterKlick(i) {
      const gen = generation;
      const zz = z;
      const fertig = (liste, geraten) => {
        if (gen !== generation || !aktiv) return;
        erzeugt = false;
        K.setzeMinen(zz, i, K.minenAusListe(zz.b * zz.h, liste));
        zz.geraten = geraten;
        if (geraten) ctx.meldung('Kein Feld ganz ohne Raten gefunden – an einer Stelle kann Raten nötig sein.');
        const erg = K.primaer(zz, i);
        nachZug(erg.treffer.length);
      };
      const lokal = () => {
        const rng = ctx.zufall(`${zz.seed}|${i}`);
        const m = K.verteileMinen(zz.b, zz.h, zz.anzahl, i, rng);
        const liste = [];
        m.forEach((v, k) => { if (v) liste.push(k); });
        fertig(liste, false);
      };
      if (!zz.ohneRaten) { lokal(); return; }
      erzeugt = true;
      try {
        const r = await worker.rufe('erzeuge', { b: zz.b, h: zz.h, anzahl: zz.anzahl, seed: zz.seed, start: i });
        if (!Array.isArray(r?.minen) || r.minen.length !== zz.anzahl) throw new Error('Ungültiges Feld vom Worker');
        fertig(r.minen, Boolean(r.geraten));
      } catch (f) {
        if (f?.name === 'AbortError' || gen !== generation || !aktiv) return;
        console.error(f);
        ctx.meldung('„Ohne Raten“ war gerade nicht möglich – das Feld ist zufällig verteilt.');
        lokal();
      }
    }

    function primaer(x, y, { erzwingen = false } = {}) {
      if (!laeuft() || !imBrett(x, y)) return;
      if (art === 'klassisch') {
        const i = y * z.b + x;
        if (!z.minen) {
          if (z.marke[i] === K.FLAGGE && !erzwingen) return;
          z.marke[i] = K.LEER;
          ersterKlick(i);
          return;
        }
        const erg = K.primaer(z, i, { erzwingen });
        if (erg.fehlAkkord) { markiere(erg.fehlAkkord.map((n) => ({ x: n % z.b, y: Math.floor(n / z.b) }))); return; }
        if (!erg.geoeffnet.length && !erg.treffer.length) return;
        nachZug(erg.treffer.length);
      } else {
        const vorher = w.zaehler.aufgedeckt;
        const erg = U.primaer(w, x, y, { erzwingen });
        if (erg.fehlAkkord) { markiere(erg.fehlAkkord.map(([nx, ny]) => ({ x: nx, y: ny }))); return; }
        if (w.zaehler.aufgedeckt === vorher && !erg.treffer && !U.flutLaeuft(w)) return;
        if (U.flutLaeuft(w)) setzeFlutFort();
        nachZug(erg.treffer);
      }
    }

    function markeAktion(x, y, wie = 'wechsel') {
      if (!laeuft() || !imBrett(x, y)) return;
      let geaendert;
      if (art === 'klassisch') {
        const i = y * z.b + x;
        geaendert = wie === 'frage' ? K.schalteFrage(z, i) : wie === 'flagge' ? K.schalteFlagge(z, i) : K.wechsleMarke(z, i, opt.fragezeichen);
      } else {
        geaendert = wie === 'frage' ? U.schalteFrage(w, x, y) : wie === 'flagge' ? U.schalteFlagge(w, x, y) : U.wechsleMarke(w, x, y, opt.fragezeichen);
      }
      if (!geaendert) return;
      alles();
      if (cursorSichtbar) sage();
      ctx.meldeAenderung();
    }

    function setzeModus(flagge) {
      flaggenModus = flagge;
      knopfAuf.setAttribute('aria-pressed', String(!flagge));
      knopfFlagge.setAttribute('aria-pressed', String(flagge));
      knopfAuf.classList.toggle('aktiv', !flagge);
      knopfFlagge.classList.toggle('aktiv', flagge);
    }

    // ---------- Hinweis ----------
    /** Löser wiederholt anwenden, bis eine sichere Zelle gefunden ist */
    function findeSicher({ n, nb, offen, zahlen, mine, nutzbar = null, gesamt = null }) {
      const bekannt = mine.slice();
      const budget = { schritte: 0, max: 3_000_000 };
      for (let k = 0; k < 200; k++) {
        const r = analysiere({ n, nb, offen, zahlen, mine: bekannt, nutzbar, gesamt, budget });
        if (r.sicher.length) return r.sicher;
        if (!r.minen.length) return [];
        for (const m of r.minen) bekannt[m] = 1;
      }
      return [];
    }

    const abstand = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) + (Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) / 100;
    const naechste = (liste, ziel) => liste.reduce((best, p) => (!best || abstand(p, ziel) < abstand(best, ziel) ? p : best), null);

    function hinweisKlassisch() {
      if (!z.minen) {
        primaer(cursor.x, cursor.y, { erzwingen: true });
        ctx.meldung('Erster Zug: der erste Klick ist immer sicher.');
        return;
      }
      const n = z.b * z.h;
      const sicher = findeSicher({ n, nb: nbListe, offen: z.offen, zahlen: z.zahlen, mine: z.treffer, gesamt: z.anzahl })
        .map((i) => ({ x: i % z.b, y: Math.floor(i / z.b) }));
      let ziel = naechste(sicher, cursor);
      let gnade = false;
      if (!ziel) {
        const rand = [], rest = [];
        for (let i = 0; i < n; i++) {
          if (z.offen[i] || z.minen[i]) continue;
          const p = { x: i % z.b, y: Math.floor(i / z.b) };
          (nbListe[i].some((k) => z.offen[k]) ? rand : rest).push(p);
        }
        ziel = naechste(rand.length ? rand : rest, cursor);
        gnade = true;
      }
      if (!ziel) return;
      z.hinweise++;
      zeigeHinweis(ziel, gnade);
    }

    function hinweisUnendlich() {
      const W = zeichner.breite, H = zeichner.hoehe, zl = kamera.zelle;
      const sichtbar = Math.abs(cursor.x + 0.5 - kamera.x) <= W / 2 / zl && Math.abs(cursor.y + 0.5 - kamera.y) <= H / 2 / zl;
      const mitte = sichtbar ? cursor : { x: Math.floor(kamera.x), y: Math.floor(kamera.y) };
      const b = HINWEIS_FENSTER, x0 = mitte.x - b / 2, y0 = mitte.y - b / 2;
      const a = U.ausschnitt(w, x0, y0, b, b);
      const nb = K.nachbarListe(b, b);
      const sicher = findeSicher({ n: b * b, nb, offen: a.offen, zahlen: a.zahlen, mine: a.mine, nutzbar: a.nutzbar })
        .map((i) => ({ x: x0 + (i % b), y: y0 + Math.floor(i / b) }));
      let ziel = naechste(sicher, mitte);
      let gnade = false;
      if (!ziel) {
        gnade = true;
        const rand = [];
        for (let i = 0; i < b * b; i++) {
          if (a.offen[i] || a.mine[i] || !nb[i].some((k) => a.offen[k])) continue;
          const p = { x: x0 + (i % b), y: y0 + Math.floor(i / b) };
          if (!U.istMine(w, p.x, p.y) && U.marke(w, p.x, p.y) !== K.FLAGGE) rand.push(p);
        }
        ziel = naechste(rand, mitte);
        // nichts Offenes in der Nähe: nächste sichere Zelle um die Mitte suchen
        for (let r = 0; !ziel && r < 60; r++) {
          for (let dy = -r; dy <= r && !ziel; dy++) for (let dx = -r; dx <= r && !ziel; dx++) {
            const x = mitte.x + dx, y = mitte.y + dy;
            if (Math.max(Math.abs(dx), Math.abs(dy)) === r && !U.istOffen(w, x, y) && !U.istTreffer(w, x, y) && !U.istMine(w, x, y)) ziel = { x, y };
          }
        }
      }
      if (!ziel) return;
      w.zaehler.hinweise++;
      zeigeHinweis(ziel, gnade);
    }

    function zeigeHinweis(ziel, gnade) {
      cursor = { ...ziel };
      folgeCursor();
      primaer(ziel.x, ziel.y, { erzwingen: true });
      markiere([ziel]);
      ctx.meldung(gnade
        ? 'Hier hilft nur Raten – diese Zelle ist sicher und wurde aufgedeckt (Gnaden-Hinweis).'
        : 'Diese Zelle ist logisch sicher und wurde aufgedeckt.');
      sage();
    }

    // ---------- Optionen ----------
    async function optionenDialog() {
      const schalter = (text, leise, an, setze) => h('label', { class: 'schalter' },
        h('input', { type: 'checkbox', checked: an, on: { change: (e) => setze(e.target.checked) } }),
        h('span', { class: 'schalter-text' }, h('span', { text }), h('span', { class: 'leise', text: leise })));
      const segment = (titel, name, wahlen, aktuell, setze) => h('fieldset', { class: 'gruppe' },
        h('legend', { text: titel }),
        h('div', { class: 'segment' }, wahlen.map(([wert, text]) => h('label', {},
          h('input', { type: 'radio', name, value: String(wert), checked: wert === aktuell, on: { change: () => setze(wert) } }),
          h('span', { text }),
        ))));
      let spaeter = false;
      const setze = (k, v, sofort) => {
        ctx.einstellungen.spiel.setze(k, v);
        if (!sofort()) spaeter = true;
      };
      const vorErstemKlick = () => art === 'klassisch' && !z.minen && !erzeugt;
      const inhalt = [
        segment('Wenn eine Mine getroffen wird', 'ms-ausgang', [['entspannt', 'Entspannt – weiterspielen'], ['hardcore', 'Hardcore – Spielende']], opt.ausgang,
          (v) => setze('ausgang', v, () => { if (vorErstemKlick()) { z.ausgang = v; alles(); return true; } return false; })),
        schalter('Ohne Raten', 'Klassische Felder sind immer mit Logik lösbar.', opt.ohneRaten,
          (v) => setze('ohneRaten', v, () => { if (vorErstemKlick()) { z.ohneRaten = v; return true; } return art !== 'klassisch'; })),
        schalter('Fragezeichen', 'Rechtsklick bzw. lange drücken wechselt Flagge → ? → leer.', opt.fragezeichen,
          (v) => setze('fragezeichen', v, () => true)),
        segment('Minendichte (Unendlich)', 'ms-dichte', U.DICHTEN.map((d) => [d, `${Math.round(d * 100)} %`]), opt.dichte,
          (v) => setze('dichte', v, () => art !== 'unendlich')),
      ];
      await zeigeDialog({ titel: 'Optionen', inhalt, knoepfe: [{ text: 'Fertig', wert: true, primaer: true }] });
      if (!aktiv) return;
      if (spaeter) ctx.meldung('Die Änderung gilt ab dem nächsten Spiel.');
      optKnopf.focus();
    }

    // ---------- Zeiger (Maus, Touch, Stift) ----------
    const zeiger = new Map();
    let geste = null;
    let langTimer = 0, ringFrame = 0;

    const lokalPos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

    function stoppeLang() {
      clearTimeout(langTimer); langTimer = 0;
      cancelAnimationFrame(ringFrame); ringFrame = 0;
      if (ring) { ring = null; plane(); }
    }

    function vorschauFuer(p) {
      if (!p) return [];
      if (art === 'klassisch' && !z.minen) return [p];
      const c = codeLogik(p.x, p.y);
      if (c === CODE.VERDECKT) return [p];
      if (c >= 1 && c <= 8) {
        const l = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const q = { x: p.x + dx, y: p.y + dy };
          if ((dx || dy) && imBrett(q.x, q.y) && codeLogik(q.x, q.y) === CODE.VERDECKT) l.push(q);
        }
        return l;
      }
      return [];
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary && zeiger.size === 0) return;
      canvas.focus({ preventScroll: true });
      const pos = lokalPos(e);
      zeiger.set(e.pointerId, pos);
      try { canvas.setPointerCapture(e.pointerId); } catch { /* egal */ }
      if (cursorSichtbar) { cursorSichtbar = false; plane(); }
      if (e.pointerType === 'mouse' && e.button === 2) { const p = zelleBei(pos.x, pos.y); if (p) markeAktion(p.x, p.y); geste = null; return; }
      if (e.pointerType === 'mouse' && e.button === 1) {
        e.preventDefault();
        const p = zelleBei(pos.x, pos.y);
        if (p && codeLogik(p.x, p.y) <= 8) primaer(p.x, p.y);
        geste = null;
        return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (zeiger.size >= 2) {
        stoppeLang();
        gedrueckt = [];
        const [a, b] = [...zeiger.values()];
        geste = { art: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: kamera.zelle, mitte: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
        plane();
        return;
      }
      const zelle = zelleBei(pos.x, pos.y);
      geste = { art: 'tipp', id: e.pointerId, start: pos, typ: e.pointerType, zelle, lang: false, kam0: { x: kamera.x, y: kamera.y } };
      if (e.pointerType === 'mouse') { gedrueckt = laeuft() && !flaggenModus ? vorschauFuer(zelle) : []; plane(); return; }
      if (zelle && laeuft()) {
        const t0 = performance.now();
        ring = { ...zelle, anteil: 0 };
        const tick = () => {
          if (!ring) return;
          ring.anteil = ctx.bewegungReduziert() ? 1 : (performance.now() - t0) / LANG_MS;
          plane();
          if (ring.anteil < 1) ringFrame = requestAnimationFrame(tick);
        };
        ringFrame = requestAnimationFrame(tick);
        langTimer = setTimeout(() => {
          if (geste?.art !== 'tipp') return;
          geste.lang = true;
          stoppeLang();
          if (flaggenModus) primaer(zelle.x, zelle.y);
          else markeAktion(zelle.x, zelle.y);
        }, LANG_MS);
      }
    }, { signal });

    canvas.addEventListener('pointermove', (e) => {
      if (!zeiger.has(e.pointerId)) return;
      const pos = lokalPos(e);
      zeiger.set(e.pointerId, pos);
      if (!geste) return;
      if (geste.art === 'pinch') {
        if (zeiger.size < 2) return;
        const [a, b] = [...zeiger.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mitte = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        // verschieben mit der Mitte, zoomen um die Mitte
        kamera.x -= (mitte.x - geste.mitte.x) / kamera.zelle;
        kamera.y -= (mitte.y - geste.mitte.y) / kamera.zelle;
        geste.mitte = mitte;
        zoome((geste.z0 * d / geste.d0) / kamera.zelle, mitte.x, mitte.y);
        begrenze();
        plane();
        return;
      }
      if (e.pointerId !== geste.id) return;
      if (geste.art === 'tipp') {
        if (Math.hypot(pos.x - geste.start.x, pos.y - geste.start.y) > SCHWELLE_PX && !geste.lang) {
          stoppeLang();
          gedrueckt = [];
          geste.art = 'ziehen';
          canvas.classList.add('ms-zieht');
        } else if (geste.typ === 'mouse') {
          const p = zelleBei(pos.x, pos.y);
          const neu = laeuft() && !flaggenModus && p && geste.zelle && p.x === geste.zelle.x && p.y === geste.zelle.y ? vorschauFuer(p) : [];
          if (neu.length !== gedrueckt.length) { gedrueckt = neu; plane(); }
          return;
        }
      }
      if (geste.art === 'ziehen') {
        kamera.x = geste.kam0.x - (pos.x - geste.start.x) / kamera.zelle;
        kamera.y = geste.kam0.y - (pos.y - geste.start.y) / kamera.zelle;
        begrenze();
        plane();
      }
    }, { signal });

    function loslassen(e, abbruch) {
      if (!zeiger.has(e.pointerId)) return;
      zeiger.delete(e.pointerId);
      const g = geste;
      if (g?.art === 'pinch') {
        if (zeiger.size === 1) {
          const [[id, pos]] = [...zeiger.entries()];
          geste = { art: 'ziehen', id, start: pos, typ: e.pointerType, zelle: null, lang: false, kam0: { x: kamera.x, y: kamera.y } };
        } else geste = null;
        return;
      }
      if (!g || e.pointerId !== g.id) return;
      stoppeLang();
      geste = null;
      canvas.classList.remove('ms-zieht');
      const warGedrueckt = gedrueckt.length;
      gedrueckt = [];
      if (warGedrueckt) plane();
      if (abbruch || g.art !== 'tipp' || g.lang || !g.zelle) return;
      const p = g.typ === 'mouse' ? zelleBei(lokalPos(e).x, lokalPos(e).y) : g.zelle;
      if (!p || p.x !== g.zelle.x || p.y !== g.zelle.y) return;   // außerhalb losgelassen = Abbruch
      cursor = { ...p };
      if (flaggenModus) markeAktion(p.x, p.y);
      else primaer(p.x, p.y);
    }
    canvas.addEventListener('pointerup', (e) => loslassen(e, false), { signal });
    canvas.addEventListener('pointercancel', (e) => loslassen(e, true), { signal });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const pos = lokalPos(e);
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoome(Math.exp(-d * (e.ctrlKey ? 0.01 : 0.0015)), pos.x, pos.y);
    }, { signal, passive: false });

    // ---------- Größe & Farben ----------
    const ro = new ResizeObserver(() => passeAn());
    ro.observe(buehne);
    const dunkel = matchMedia('(prefers-color-scheme: dark)');
    dunkel.addEventListener('change', farbenNeu, { signal });
    const mo = new MutationObserver(farbenNeu);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette', 'data-muster'] });
    const farbenAbmelden = ctx.farben.beobachte(farbenNeu);

    // ---------- Start ----------
    let geladen = false;
    try { geladen = lade(gespeichert); } catch (f) { console.error(f); geladen = false; }
    if (!geladen) {
      if (gespeichert) ctx.meldung('Der gespeicherte Stand passte nicht – es beginnt ein neues Spiel.');
      neuesSpiel(ctx.variante ?? 'anfaenger');
    }
    setzeModus(false);
    farbenNeu();
    warteAufStil();

    // ---------- Schnittstelle ----------
    const instanz = {
      getStand() {
        const basis = art === 'klassisch' ? K.zumSpeichern(z) : { ...U.zumSpeichern(w), kamera: { x: kamera.x, y: kamera.y, zelle: kamera.zelle } };
        return { ...basis, cursor: [cursor.x, cursor.y] };
      },
      zusammenfassung() {
        if (art === 'unendlich') return `Unendlich · ${zahlText(w.zaehler.aufgedeckt)} aufgedeckt`;
        const pct = Math.floor((100 * z.offenZahl) / K.sichereZellen(z));
        return `${K.STUFEN[z.stufe].name} · ${pct} % aufgedeckt`;
      },
      kannRueckgaengig: () => (art === 'klassisch' ? K.kannZuruecknehmen(z) : U.kannZuruecknehmen(w)),
      rueckgaengig() {
        const ok = art === 'klassisch' ? K.nimmZurueck(z) : U.nimmZurueck(w);
        if (!ok) return;
        ctx.meldung('Fehlklick zurückgenommen – die Mine ist jetzt mit einer Flagge markiert.');
        alles();
        ctx.meldeAenderung();
      },
      hinweis() {
        if (!laeuft() && !(art === 'klassisch' && !z.minen && !erzeugt)) return;
        if (art === 'klassisch') hinweisKlassisch();
        else hinweisUnendlich();
      },
      neustart() {
        cancelAnimationFrame(flutFrame); flutFrame = 0;
        if (art === 'klassisch') {
          if (erzeugt) return;
          K.vonVorn(z);
        } else {
          w = U.erstelleWelt({ seed: w.seed, dichte: w.dichte, ausgang: w.ausgang });
          U.beginne(w);
          cursor = { x: 0, y: 0 };
          zentriereAuf(0, 0);
        }
        markiert = [];
        alles();
      },
      neu(variante) {
        neuesSpiel(variante ?? (art === 'unendlich' ? 'unendlich' : z.stufe));
      },
      onTaste(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return false;
        const ziel = e.target;
        const aufKnopf = ziel instanceof HTMLElement && ziel !== canvas && ziel.closest('button, a, input, select, textarea, label');
        const k = e.key;
        const richtung = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0] }[k];
        if (richtung && (k.startsWith('Arrow') || !aufKnopf)) {
          const [ddx, ddy] = richtung;
          if (e.shiftKey && k.startsWith('Arrow')) {
            kamera.x += ddx * 4; kamera.y += ddy * 4;
            begrenze();
            plane();
            return true;
          }
          const a = zuAnzeige(cursor.x, cursor.y);
          const p = zuLogik(a.dx + ddx, a.dy + ddy);
          if (imBrett(p.x, p.y)) cursor = p;
          zeigeCursor();
          return true;
        }
        if (aufKnopf) return false;
        if (k === 'Enter' || k === ' ') { zeigeCursor(); primaer(cursor.x, cursor.y); sage(); return true; }
        if (k === 'f' || k === 'F') { zeigeCursor(); markeAktion(cursor.x, cursor.y, 'flagge'); sage(); return true; }
        if (k === '?' || k === 'ß') {
          if (!opt.fragezeichen) { ctx.meldung('Fragezeichen lassen sich in den Optionen einschalten.'); return true; }
          zeigeCursor(); markeAktion(cursor.x, cursor.y, 'frage'); sage(); return true;
        }
        if (k === 'Home') {
          if (art === 'unendlich') { cursorSichtbar = true; zumStart(); }
          else { const a = zuAnzeige(cursor.x, cursor.y); cursor = zuLogik(0, a.dy); zeigeCursor(); }
          return true;
        }
        if (k === 'End' && art === 'klassisch') {
          const a = zuAnzeige(cursor.x, cursor.y);
          cursor = zuLogik(anzeigeGroesse().b - 1, a.dy);
          zeigeCursor();
          return true;
        }
        if (k === '+' || k === '=') { zoome(1.2); return true; }
        if (k === '-' || k === '_') { zoome(1 / 1.2); return true; }
        if ((k === 'c' || k === 'C') && art === 'unendlich') { zentriereAuf(cursor.x, cursor.y); cursorSichtbar = true; plane(); return true; }
        return false;
      },
      zerstoere() {
        aktiv = false;
        generation++;
        clearTimeout(markiertTimer);
        stoppeLang();
        cancelAnimationFrame(flutFrame);
        cancelAnimationFrame(zeichenFrame);
        clearTimeout(zeichenTimer);
        ro.disconnect();
        mo.disconnect();
        farbenAbmelden();
        worker.beende();
        container.replaceChildren();
      },
    };

    function zeigeCursor() {
      cursorSichtbar = true;
      if (document.activeElement !== canvas) canvas.focus({ preventScroll: true });
      folgeCursor();
      sage();
      plane();
    }

    return instanz;
  },
};
