// Nonogramm: Zahlen am Rand verraten, welche Felder gefüllt sind – es entsteht ein Bild.
// Varianten: Motive (motive.json, der Reihe nach) und Zufallsbilder 5×5 bis 20×20 (Generator im Worker).
// Bedienung: Linksklick füllen · Rechtsklick Kreuz · Ziehen (Achse gesperrt) · Mittelklick/Umschalt leeren ·
// Tastatur Pfeile/WASD, Leertaste/Enter/F füllen, X/C Kreuz, Entf leeren, M Werkzeug, +/−/0 Zoom ·
// Touch: Werkzeugleiste, Ziehen mit einem Finger, zwei Finger zoomen/verschieben, Cursor-Modus ab 15×15.
import { h, ladeStil } from '../../kern/dom.js';
import { erstelleVerlauf, ladeVerlauf } from '../../kern/rueckgaengig.js';
import * as L from './logik.js';

const GROESSE = { z5: 5, z10: 10, z15: 15, z20: 20 };
const VORRAT_ZIEL = 2;
const VERLAUF_MAX = 100000;
const ZOOM_MAX = 3;
const ZELLE_MAX_ZOOM = 56;
const GEWINN_PAUSE_MS = 1200;
const LANG_MS = 400;
const CURSOR_SCHRITT_PX = 24;
const WERKZEUGE = ['fuellen', 'kreuz', 'leeren'];
const ZEICHEN_NAME = { '.': 'leer', '#': 'gefüllt', x: 'Kreuz' };

let motivLadung = null;
function ladeMotive() {
  if (!motivLadung) {
    motivLadung = fetch(new URL('./motive.json', import.meta.url))
      .then((r) => { if (!r.ok) throw new Error(`motive.json: ${r.status}`); return r.json(); })
      .then((d) => (Array.isArray(d?.motive) ? d.motive : []).map(L.motivAus).filter(Boolean))
      .catch((f) => { motivLadung = null; throw f; });
  }
  return motivLadung;
}

export default {
  id: 'nonogramm',
  name: 'Nonogramm',
  beschreibung: 'Zahlen am Rand verraten, welche Felder ein Bild ergeben.',
  varianten: [
    { id: 'motive', name: 'Motive – kleine Bilder der Reihe nach' },
    { id: 'z5', name: 'Zufall 5×5' },
    { id: 'z10', name: 'Zufall 10×10' },
    { id: 'z15', name: 'Zufall 15×15' },
    { id: 'z20', name: 'Zufall 20×20' },
  ],
  standVersion: 1,

  erstelle(container, ctx, gespeichert) {
    ladeStil('spiele/nonogramm/stil.css');
    const { signal } = ctx;

    let aktiv = true;
    let worker = null;
    const holeWorker = () => (worker ??= ctx.worker('spiele/nonogramm/generator.worker.js'));

    let s = null;                       // Spielstand (siehe logik.js neuerStand)
    let verlauf = erstelleVerlauf({ max: VERLAUF_MAX });
    let ladeNr = 0;
    let motivListe = null;
    let werkzeug = WERKZEUGE.includes(ctx.einstellungen.spiel.wert('werkzeug', 'fuellen'))
      ? ctx.einstellungen.spiel.wert('werkzeug', 'fuellen') : 'fuellen';
    let zoom = 1, zoomMax = 1, zFit = 20, zAktuell = 20, randLinks = 0, randOben = 0;
    let cursor = { x: 0, y: 0 };
    let hover = null;
    let tastatur = false;
    let cursorModus = false;
    let hinweisMarke = null;            // { linie, index } – letzter Hinweis
    let erklaerung = '';
    let zug = null;                     // laufendes Ziehen (Maus/Finger)
    let tastenZug = null;               // Umschalt+Pfeil setzt die letzte Tasten-Aktion fort
    let geste = null, pan = null, trackpad = null;
    let gewinnTimer = 0;
    const zeiger = new Map();

    // ---------- DOM ----------
    const info = h('p', { class: 'ng-info' });
    const erklaerungEl = h('p', { class: 'ng-erklaerung', 'aria-live': 'polite' });
    const ecke = h('div', { class: 'ng-ecke' });
    const spaltenEl = h('div', { class: 'ng-spalten' });
    const zeilenEl = h('div', { class: 'ng-zeilen' });
    const feld = h('div', { class: 'ng-feld', role: 'grid', tabindex: '0', 'aria-label': 'Nonogramm-Feld' });
    const brett = h('div', { class: 'ng-brett' }, ecke, spaltenEl, zeilenEl, feld);
    const rahmen = h('div', { class: 'ng-rahmen' }, brett);
    const zaehler = h('div', { class: 'ng-zaehler', hidden: true, 'aria-hidden': 'true' });

    const wzKnopf = (id, text, kurz) => h('button', {
      type: 'button', class: 'knopf klein ng-wz', title: `${text} (${kurz})`, 'aria-pressed': 'false',
      on: { click: () => setzeWerkzeug(id) },
    }, h('span', { class: `ng-ikon ng-ikon-${id}`, 'aria-hidden': 'true' }), h('span', { text }));
    const wzKnoepfe = {
      fuellen: wzKnopf('fuellen', 'Füllen', 'Linksklick, Leertaste'),
      kreuz: wzKnopf('kreuz', 'Kreuz', 'Rechtsklick, X'),
      leeren: wzKnopf('leeren', 'Leeren', 'Entf'),
    };
    const kZoomRaus = h('button', { type: 'button', class: 'knopf klein ng-rund', title: 'Verkleinern (−)', 'aria-label': 'Verkleinern', on: { click: () => setzeZoom(zoom / 1.4) } }, '−');
    const kEinpassen = h('button', { type: 'button', class: 'knopf klein', title: 'Einpassen (0)', on: { click: () => setzeZoom(1) } }, 'Einpassen');
    const kZoomRein = h('button', { type: 'button', class: 'knopf klein ng-rund', title: 'Vergrößern (+)', 'aria-label': 'Vergrößern', on: { click: () => setzeZoom(zoom * 1.4) } }, '+');
    const kCursor = h('button', {
      type: 'button', class: 'knopf klein', 'aria-pressed': 'false',
      title: 'Cursor-Modus: Finger bewegt den Cursor, „Setzen“ wendet das Werkzeug an',
      on: { click: () => { cursorModus = !cursorModus; tastenZug = null; zeichne(); if (cursorModus) sichtbarMachen(); } },
    }, 'Cursor');
    const kSetzen = h('button', {
      type: 'button', class: 'knopf primaer ng-setzen', hidden: true,
      on: { click: () => wendeWerkzeugAmCursor() },
    }, 'Setzen');
    const leiste = h('div', { class: 'ng-leiste' },
      h('div', { class: 'ng-gruppe', role: 'group', 'aria-label': 'Werkzeug' }, Object.values(wzKnoepfe)),
      h('div', { class: 'ng-gruppe', role: 'group', 'aria-label': 'Zoom' }, kZoomRaus, kEinpassen, kZoomRein, kCursor),
      kSetzen,
    );

    const wurzel = h('div', { class: 'ng' }, info, rahmen, leiste, erklaerungEl, zaehler);
    container.append(wurzel);

    let zellen = [], zellKlasse = [], zellLabel = [], zeilenHw = [], spaltenHw = [];

    // ---------- Aufbau ----------
    function aufbauen() {
      const { b, h: hh } = s;
      brett.style.setProperty('--b', b);
      brett.style.setProperty('--h', hh);
      zellen = [];
      const reihen = [];
      for (let y = 0; y < hh; y++) {
        const reihe = h('div', { class: 'ng-reihe', role: 'row' });
        for (let x = 0; x < b; x++) {
          const el = h('div', { class: 'ng-zelle', role: 'gridcell', id: `ng-z-${y * b + x}` });
          zellen.push(el);
          reihe.append(el);
        }
        reihen.push(reihe);
      }
      feld.replaceChildren(...reihen);
      feld.setAttribute('aria-label', `Nonogramm-Feld, ${b} Spalten, ${hh} Zeilen`);
      zellKlasse = new Array(b * hh).fill('');
      zellLabel = new Array(b * hh).fill('');
      const stapel = (klasse, hinweis, name) => {
        const zahlen = (hinweis.length ? hinweis : [0]).map((n) => h('span', { class: n >= 10 ? 'ng-zahl zweistellig' : 'ng-zahl', text: String(n) }));
        return { basis: klasse, el: h('div', { class: klasse, 'aria-label': `${name}: ${hinweis.length ? hinweis.join(' ') : '0'}` }, zahlen), zahlen, klasse: '' };
      };
      zeilenHw = s.hinweise.zeilen.map((hw, y) => stapel('ng-hz', hw, `Zeile ${y + 1}`));
      spaltenHw = s.hinweise.spalten.map((hw, x) => stapel('ng-hs', hw, `Spalte ${x + 1}`));
      zeilenEl.replaceChildren(...zeilenHw.map((z) => z.el));
      spaltenEl.replaceChildren(...spaltenHw.map((z) => z.el));
      cursor = { x: Math.min(cursor.x, b - 1), y: Math.min(cursor.y, hh - 1) };
      hover = null; zug = null; tastenZug = null; hinweisMarke = null; erklaerung = '';
      zoom = 1;
      if (Math.max(b, hh) < 15) cursorModus = false;
      passeGroesseAn();
      rahmen.scrollTo(0, 0);
      zeichne();
    }

    // ---------- Größe & Zoom ----------
    const hinweisBox = (z) => Math.max(Math.round(z * 0.6), 13);

    function passeGroesseAn() {
      if (!s) return;
      const stil = getComputedStyle(wurzel);
      const luecke = parseFloat(stil.rowGap) || 8;
      const W = wurzel.clientWidth;
      const H = wurzel.clientHeight - info.offsetHeight - leiste.offsetHeight - erklaerungEl.offsetHeight - 3 * luecke;
      const nl = Math.max(1, ...s.hinweise.zeilen.map((x) => x.length));
      const nt = Math.max(1, ...s.hinweise.spalten.map((x) => x.length));
      zFit = 8;
      for (let z = 40; z >= 8; z--) {
        if (s.b * z + nl * hinweisBox(z) + 10 <= W && s.h * z + nt * hinweisBox(z) + 8 <= Math.max(H, 120)) { zFit = z; break; }
      }
      zoomMax = Math.max(1, Math.min(ZOOM_MAX, ZELLE_MAX_ZOOM / zFit));
      zoom = Math.max(1, Math.min(zoomMax, zoom));
      const z = Math.round(zFit * zoom);
      const hz = hinweisBox(z);
      zAktuell = z;
      randLinks = nl * hz + 8;
      randOben = nt * hz + 6;
      brett.style.setProperty('--z', `${z}px`);
      brett.style.setProperty('--hz', `${hz}px`);
      brett.style.setProperty('--fs', `${Math.max(10, Math.min(18, Math.round(hz * 0.74)))}px`);
      brett.style.setProperty('--lw', `${randLinks}px`);
      brett.style.setProperty('--th', `${randOben}px`);
      rahmen.style.maxWidth = `${W}px`;
      rahmen.style.maxHeight = `${Math.max(H, 120)}px`;
      rahmen.classList.toggle('gezoomt', zoom > 1.001);
      kZoomRaus.disabled = zoom <= 1.001;
      kEinpassen.disabled = zoom <= 1.001;
      kZoomRein.disabled = zoom >= zoomMax - 0.001;
    }

    function setzeZoom(neu, anker = null) {
      if (!s) return;
      const alt = zAktuell;
      const r = rahmen.getBoundingClientRect();
      const ax = anker ? anker.x - r.left : rahmen.clientWidth / 2;
      const ay = anker ? anker.y - r.top : rahmen.clientHeight / 2;
      const px = rahmen.scrollLeft + ax, py = rahmen.scrollTop + ay;
      zoom = Math.max(1, Math.min(zoomMax, neu));
      passeGroesseAn();
      const f = zAktuell / alt;
      rahmen.scrollLeft = px * f - ax;
      rahmen.scrollTop = py * f - ay;
    }

    let groesseRahmen = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(groesseRahmen);
      groesseRahmen = requestAnimationFrame(() => passeGroesseAn());
    });
    ro.observe(wurzel);

    // ---------- Darstellung ----------
    function zeichneInfo() {
      if (!s) return;
      let t;
      if (s.quelle === 'motiv') {
        const nr = motivListe ? motivListe.findIndex((m) => m.id === s.motivId) + 1 : 0;
        t = s.geloest ? `Motiv: ${s.titel ?? ''}` : `Motiv${nr ? ` ${nr} von ${motivListe.length}` : ''} · ${s.b}×${s.h}`;
      } else {
        t = s.geloest ? `Zufallsbild ${s.b}×${s.h} – gelöst` : `Zufallsbild ${s.b}×${s.h}`;
      }
      info.textContent = t;
    }

    function zeichne() {
      if (!s) return;
      const { b, h: hh } = s;
      const anzeige = zug ? zug.vorschau : s.zellen;
      const fehlerAn = Boolean(ctx.einstellungen.wert('fehlerMarkieren'));
      const zeigeCursor = !s.geloest && (tastatur || cursorModus);
      const aktivPos = s.geloest ? null : (hover ?? (zeigeCursor ? cursor : null));
      const ci = cursor.y * b + cursor.x;
      const hl = hinweisMarke?.linie;

      // Hinweiszahlen: erledigt / Widerspruch / aktive Linie
      const linie = (nr) => L.linienIndizes(b, hh, nr).map((i) => anzeige[i]);
      const stapelZeichnen = (stapel, hinweis, zeichen, istAktiv, istHinweis) => {
        const st = L.linienStatus(hinweis, zeichen);
        stapel.zahlen.forEach((el, j) => {
          const fertig = hinweis.length ? st.erledigt[j] : st.komplett;
          el.classList.toggle('erledigt', fertig);
        });
        const k = (st.widerspruch ? ' widerspruch' : '') + (istAktiv ? ' aktiv' : '') + (istHinweis ? ' hinweis' : '');
        if (k !== stapel.klasse) { stapel.klasse = k; stapel.el.className = stapel.basis + k; }
      };
      for (let y = 0; y < hh; y++) stapelZeichnen(zeilenHw[y], s.hinweise.zeilen[y], linie(y), aktivPos?.y === y, hl === y);
      for (let x = 0; x < b; x++) stapelZeichnen(spaltenHw[x], s.hinweise.spalten[x], linie(hh + x), aktivPos?.x === x, hl === hh + x);

      for (let i = 0; i < b * hh; i++) {
        const x = i % b, y = (i - x) / b;
        const c = anzeige[i];
        let k = 'ng-zelle';
        if (x % 5 === 4 && x < b - 1) k += ' r5';
        if (y % 5 === 4 && y < hh - 1) k += ' u5';
        if (c === '#') k += ' voll';
        else if (c === 'x') k += ' kreuz';
        if (fehlerAn && c === '#' && s.loesung[i] === '0') k += ' falsch';
        if (aktivPos && (aktivPos.x === x || aktivPos.y === y)) k += ' linie';
        if (zeigeCursor && i === ci) k += ' cursor';
        if (hinweisMarke?.index === i) k += ' hinweis';
        if (k !== zellKlasse[i]) { zellen[i].className = k; zellKlasse[i] = k; }
        const lab = `Zeile ${y + 1}, Spalte ${x + 1}: ${ZEICHEN_NAME[c]}`;
        if (lab !== zellLabel[i]) { zellen[i].setAttribute('aria-label', lab); zellLabel[i] = lab; }
      }
      feld.setAttribute('aria-activedescendant', `ng-z-${ci}`);
      brett.classList.toggle('fertig', s.geloest);
      wurzel.classList.toggle('cursor-modus', cursorModus);
      for (const [id, el] of Object.entries(wzKnoepfe)) {
        el.classList.toggle('aktiv', werkzeug === id);
        el.setAttribute('aria-pressed', String(werkzeug === id));
      }
      kCursor.hidden = Math.max(b, hh) < 15;
      kCursor.classList.toggle('aktiv', cursorModus);
      kCursor.setAttribute('aria-pressed', String(cursorModus));
      kSetzen.hidden = !cursorModus || s.geloest;
      erklaerungEl.textContent = erklaerung;
      zeichneInfo();
    }

    function zeigeLeer(text = '') {
      feld.replaceChildren();
      zeilenEl.replaceChildren();
      spaltenEl.replaceChildren();
      info.textContent = text;
      erklaerungEl.textContent = '';
      brett.classList.remove('fertig');
    }

    // ---------- Züge ----------
    function fuehreAus(eintrag) {
      if (!eintrag.length) return;
      s.zellen = L.wendeZugAn(s.zellen, eintrag);
      s.zuege++;
      verlauf.merke(eintrag);
      nachZug();
    }

    function nachZug() {
      zeichne();
      ctx.meldeAenderung();
      pruefeGewinn();
    }

    function pruefeGewinn() {
      if (s.geloest || !L.istGeloest(s)) return;
      s.geloest = true;
      hover = null; zug = null; tastenZug = null; hinweisMarke = null;
      erklaerung = '';
      if (s.quelle === 'motiv' && s.motivId) {
        const f = motivFortschritt();
        if (!f.geloest.includes(s.motivId)) f.geloest.push(s.motivId);
        ctx.speicher.schreibe('motive', f);
      }
      zoom = 1;
      passeGroesseAn();
      zeichne();
      gewinnTimer = setTimeout(meldeGewinn, GEWINN_PAUSE_MS);
    }

    function meldeGewinn() {
      if (!aktiv || !s?.geloest) return;
      ctx.meldeGewonnen(s.quelle === 'motiv' ? `Motiv: ${s.titel ?? ''}` : `Zufallsbild ${s.b}×${s.h}`);
    }

    /** Änderung einer Zelle → [i, alt, neu] oder null */
    function aenderung(i, neu) {
      const alt = s.zellen[i];
      return alt === neu ? null : [i, alt, neu];
    }

    // Wirkung eines Zieh-Modus auf eine Zelle (erste Zelle: immer; weitere: nur passende)
    function wirkung(modus, alt, erste) {
      switch (modus) {
        case 'fuellen': return erste || alt === '.' ? '#' : alt;
        case 'kreuzen': return erste || alt === '.' ? 'x' : alt;
        case 'leeren-voll': return alt === '#' ? '.' : alt;
        case 'leeren-kreuz': return alt === 'x' ? '.' : alt;
        case 'leeren-alle': return '.';
        default: return alt;
      }
    }

    function modusFuer(art, alt) {
      if (art === 'leeren') return 'leeren-alle';
      if (art === 'kreuz') return alt === 'x' ? 'leeren-kreuz' : 'kreuzen';
      return alt === '#' ? 'leeren-voll' : 'fuellen';
    }

    function setzeWerkzeug(id) {
      werkzeug = id;
      ctx.einstellungen.spiel.setze('werkzeug', id);
      zeichne();
    }

    function wendeWerkzeugAmCursor() {
      if (!s || s.geloest) return;
      const i = cursor.y * s.b + cursor.x;
      const e = aenderung(i, wirkung(modusFuer(werkzeug, s.zellen[i]), s.zellen[i], true));
      hinweisMarke = null; erklaerung = '';
      if (e) fuehreAus([e]); else zeichne();
    }

    // ---------- Zeiger (Maus, Finger, Stift) ----------
    function zelleBei(cx, cy, begrenzen = false) {
      const r = feld.getBoundingClientRect();
      if (!r.width) return null;
      let x = Math.floor((cx - r.left) / (r.width / s.b));
      let y = Math.floor((cy - r.top) / (r.height / s.h));
      if (begrenzen) {
        x = Math.max(0, Math.min(s.b - 1, x));
        y = Math.max(0, Math.min(s.h - 1, y));
      } else if (x < 0 || y < 0 || x >= s.b || y >= s.h) return null;
      // über den (sticky) Hinweisleisten wird nicht gemalt
      if (!begrenzen) {
        const rr = rahmen.getBoundingClientRect();
        if (cx < rr.left + randLinks || cy < rr.top + randOben) return null;
      }
      return { x, y };
    }

    function berechneVorschau() {
      const { sx, sy, cx, cy, achse, modus } = zug;
      const z = s.zellen.split('');
      const liste = [];
      if (achse === 'zeile') for (let x = Math.min(sx, cx); x <= Math.max(sx, cx); x++) liste.push(sy * s.b + x);
      else if (achse === 'spalte') for (let y = Math.min(sy, cy); y <= Math.max(sy, cy); y++) liste.push(y * s.b + sx);
      else liste.push(sy * s.b + sx);
      const start = sy * s.b + sx;
      for (const i of liste) z[i] = wirkung(modus, s.zellen[i], i === start);
      zug.vorschau = z.join('');
      zug.anzahl = liste.length;
    }

    function zeigeZaehler(e) {
      if (!zug || zug.anzahl < 2) { zaehler.hidden = true; return; }
      zaehler.textContent = String(zug.anzahl);
      const versatz = zug.typ === 'mouse' ? 18 : 56;
      zaehler.style.left = `${e.clientX + (zug.typ === 'mouse' ? 14 : -20)}px`;
      zaehler.style.top = `${e.clientY - versatz}px`;
      zaehler.hidden = false;
    }

    function starteZug(e, { x, y }) {
      const i = y * s.b + x;
      const alt = s.zellen[i];
      let art = werkzeug;
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
        if (e.button === 1 || e.shiftKey) art = 'leeren';
        else if (e.button === 2) art = 'kreuz';
        else if (e.button !== 0) return;
      }
      tastenZug = null;
      zug = { id: e.pointerId, sx: x, sy: y, cx: x, cy: y, achse: null, modus: modusFuer(art, alt), typ: e.pointerType, x0: e.clientX, y0: e.clientY, lang: 0 };
      if (e.pointerType === 'touch') {
        zug.lang = setTimeout(() => {
          if (!zug || zug.achse) return;
          zug.modus = modusFuer('kreuz', alt);
          berechneVorschau();
          zeichne();
        }, LANG_MS);
      }
      cursor = { x, y };
      berechneVorschau();
      zeichne();
    }

    function bewegeZug(e) {
      const p = zelleBei(e.clientX, e.clientY, true);
      if (Math.hypot(e.clientX - zug.x0, e.clientY - zug.y0) > 6) clearTimeout(zug.lang);
      if (!zug.achse && (p.x !== zug.sx || p.y !== zug.sy)) {
        zug.achse = Math.abs(p.x - zug.sx) >= Math.abs(p.y - zug.sy) ? 'zeile' : 'spalte';
        clearTimeout(zug.lang);
      }
      const cx = zug.achse === 'zeile' ? p.x : zug.sx;
      const cy = zug.achse === 'spalte' ? p.y : zug.sy;
      if (cx !== zug.cx || cy !== zug.cy) {
        zug.cx = cx; zug.cy = cy;
        cursor = { x: cx, y: cy };
        berechneVorschau();
        zeichne();
      }
      zeigeZaehler(e);
    }

    function beendeZug(uebernehmen) {
      const z = zug;
      clearTimeout(z.lang);
      zug = null;
      zaehler.hidden = true;
      if (!uebernehmen) { zeichne(); return; }
      const eintrag = [];
      for (let i = 0; i < z.vorschau.length; i++) if (z.vorschau[i] !== s.zellen[i]) eintrag.push([i, s.zellen[i], z.vorschau[i]]);
      hinweisMarke = null; erklaerung = '';
      if (eintrag.length) fuehreAus(eintrag); else zeichne();
    }

    function starteGeste() {
      const [a, c] = [...zeiger.values()];
      geste = {
        d0: Math.max(20, Math.hypot(a.x - c.x, a.y - c.y)),
        m: { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 },
        zoom0: zoom,
      };
    }

    function bewegeGeste() {
      const [a, c] = [...zeiger.values()];
      const d = Math.hypot(a.x - c.x, a.y - c.y);
      const m = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
      rahmen.scrollLeft -= m.x - geste.m.x;
      rahmen.scrollTop -= m.y - geste.m.y;
      geste.m = m;
      const neu = Math.max(1, Math.min(zoomMax, geste.zoom0 * (d / geste.d0)));
      if (Math.abs(neu - zoom) > 0.02) setzeZoom(neu, m);
    }

    rahmen.addEventListener('pointerdown', (e) => {
      if (!s || s.geloest) return;
      zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
      tastatur = false;
      if (e.pointerType === 'touch' && zeiger.size === 2) {
        if (zug) beendeZug(false);
        trackpad = null; pan = null;
        starteGeste();
        e.preventDefault();
        return;
      }
      if (zeiger.size > 1) return;
      try { rahmen.setPointerCapture(e.pointerId); } catch { /* egal */ }
      const z = zelleBei(e.clientX, e.clientY);
      if (cursorModus && e.pointerType !== 'mouse') {
        trackpad = { id: e.pointerId, x0: e.clientX, y0: e.clientY, cx: cursor.x, cy: cursor.y, bewegt: false, ziel: z };
        e.preventDefault();
        return;
      }
      if (z) {
        e.preventDefault();
        feld.focus({ preventScroll: true });
        starteZug(e, z);
        zeigeZaehler(e);
      } else if (e.pointerType !== 'mouse') {
        pan = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }
    }, { signal });

    rahmen.addEventListener('pointermove', (e) => {
      if (!s) return;
      if (zeiger.has(e.pointerId)) zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (geste) { if (zeiger.size >= 2) bewegeGeste(); return; }
      if (trackpad && e.pointerId === trackpad.id) {
        const dx = e.clientX - trackpad.x0, dy = e.clientY - trackpad.y0;
        if (Math.hypot(dx, dy) > 6) trackpad.bewegt = true;
        if (trackpad.bewegt) {
          const nx = Math.max(0, Math.min(s.b - 1, trackpad.cx + Math.round(dx / CURSOR_SCHRITT_PX)));
          const ny = Math.max(0, Math.min(s.h - 1, trackpad.cy + Math.round(dy / CURSOR_SCHRITT_PX)));
          if (nx !== cursor.x || ny !== cursor.y) { cursor = { x: nx, y: ny }; zeichne(); sichtbarMachen(); }
        }
        return;
      }
      if (pan && e.pointerId === pan.id) {
        rahmen.scrollLeft -= e.clientX - pan.x;
        rahmen.scrollTop -= e.clientY - pan.y;
        pan.x = e.clientX; pan.y = e.clientY;
        return;
      }
      if (zug && e.pointerId === zug.id) { bewegeZug(e); return; }
      if (e.pointerType === 'mouse' && !zug && !s.geloest) {
        const z = zelleBei(e.clientX, e.clientY);
        if (z?.x !== hover?.x || z?.y !== hover?.y) { hover = z; zeichne(); }
      }
    }, { signal });

    function zeigerEnde(e, abgebrochen) {
      zeiger.delete(e.pointerId);
      if (geste) { if (zeiger.size < 2) geste = null; return; }
      if (trackpad && e.pointerId === trackpad.id) {
        if (!trackpad.bewegt && trackpad.ziel && !abgebrochen) { cursor = { ...trackpad.ziel }; zeichne(); }
        trackpad = null;
        return;
      }
      if (pan && e.pointerId === pan.id) { pan = null; return; }
      if (zug && e.pointerId === zug.id) beendeZug(!abgebrochen);
    }
    rahmen.addEventListener('pointerup', (e) => zeigerEnde(e, false), { signal });
    rahmen.addEventListener('pointercancel', (e) => zeigerEnde(e, true), { signal });
    rahmen.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && hover && !zug) { hover = null; zeichne(); }
    }, { signal });
    rahmen.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    feld.addEventListener('focus', () => { if (s && !zug) zeichne(); }, { signal });
    document.addEventListener('keyup', (e) => { if (e.key === 'Shift') tastenZug = null; }, { signal });

    // ---------- Tastatur ----------
    function sichtbarMachen() {
      if (!s) return;
      const el = zellen[cursor.y * s.b + cursor.x];
      if (!el) return;
      const r = rahmen.getBoundingClientRect();
      const c = el.getBoundingClientRect();
      const links = r.left + randLinks, oben = r.top + randOben;
      const rechts = r.left + rahmen.clientWidth, unten = r.top + rahmen.clientHeight;
      if (c.left < links) rahmen.scrollLeft -= links - c.left + 4;
      else if (c.right > rechts) rahmen.scrollLeft += c.right - rechts + 4;
      if (c.top < oben) rahmen.scrollTop -= oben - c.top + 4;
      else if (c.bottom > unten) rahmen.scrollTop += c.bottom - unten + 4;
    }

    function tastenAktion(art) {
      const i = cursor.y * s.b + cursor.x;
      const alt = s.zellen[i];
      const modus = modusFuer(art, alt);
      tastenZug = { modus, eintrag: null };
      hinweisMarke = null; erklaerung = '';
      const e = aenderung(i, wirkung(modus, alt, true));
      if (e) { tastenZug.eintrag = [e]; fuehreAus(tastenZug.eintrag); } else zeichne();
    }

    function setzeTastenZugFort() {
      const i = cursor.y * s.b + cursor.x;
      const e = aenderung(i, wirkung(tastenZug.modus, s.zellen[i], false));
      if (!e) return;
      if (tastenZug.eintrag) {
        // gehört zum selben Rückgängig-Eintrag
        tastenZug.eintrag.push(e);
        s.zellen = L.wendeZugAn(s.zellen, [e]);
        nachZug();
      } else {
        tastenZug.eintrag = [e];
        fuehreAus(tastenZug.eintrag);
      }
    }

    const RICHTUNG = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
    };

    function onTaste(e) {
      if (!s || s.geloest || e.altKey) return false;
      const strg = e.ctrlKey || e.metaKey;
      const k = e.key;
      const r = RICHTUNG[k] ?? (!strg && k.length === 1 ? RICHTUNG[k.toLowerCase()] : undefined);
      if (r && !(strg && k.length === 1)) {
        tastatur = true; hover = null;
        const [dx, dy] = r;
        let { x, y } = cursor;
        if (strg) { if (dx) x = dx < 0 ? 0 : s.b - 1; if (dy) y = dy < 0 ? 0 : s.h - 1; }
        else { x = Math.max(0, Math.min(s.b - 1, x + dx)); y = Math.max(0, Math.min(s.h - 1, y + dy)); }
        cursor = { x, y };
        if (e.shiftKey && tastenZug) setzeTastenZugFort();
        else { if (!e.shiftKey) tastenZug = null; zeichne(); }
        sichtbarMachen();
        if (document.activeElement !== feld) feld.focus({ preventScroll: true });
        return true;
      }
      if (strg) return false;
      if (k === 'Home' || k === 'End') {
        tastatur = true;
        cursor = { x: k === 'Home' ? 0 : s.b - 1, y: cursor.y };
        zeichne(); sichtbarMachen();
        return true;
      }
      // Leertaste/Enter wirken nur aufs Feld, wenn kein Knopf den Fokus hat
      const knopfFokus = document.activeElement instanceof HTMLElement && document.activeElement.closest('button, a');
      if ((k === ' ' || k === 'Enter') && knopfFokus) return false;
      const taste = k.toLowerCase();
      if (k === ' ' || k === 'Enter' || taste === 'f') { tastatur = true; tastenAktion('fuellen'); return true; }
      if (taste === 'x' || taste === 'c') { tastatur = true; tastenAktion('kreuz'); return true; }
      if (k === 'Delete' || k === 'Backspace') { tastatur = true; tastenAktion('leeren'); return true; }
      if (taste === 'm') {
        setzeWerkzeug(werkzeug === 'fuellen' ? 'kreuz' : 'fuellen');
        ctx.meldung(werkzeug === 'fuellen' ? 'Werkzeug: Füllen' : 'Werkzeug: Kreuz');
        return true;
      }
      if (k === '+' || k === '=') { setzeZoom(zoom * 1.4); sichtbarMachen(); return true; }
      if (k === '-' || k === '_') { setzeZoom(zoom / 1.4); sichtbarMachen(); return true; }
      if (k === '0') { setzeZoom(1); return true; }
      return false;
    }

    // ---------- Rätsel beschaffen ----------
    function motivFortschritt() {
      const f = ctx.speicher.lies('motive', null);
      const geloest = Array.isArray(f?.geloest) ? f.geloest.filter((x) => typeof x === 'string' && x.length <= 60).slice(0, 2000) : [];
      return { geloest, letzte: typeof f?.letzte === 'string' ? f.letzte : null };
    }

    function leseVorrat() {
      const v = ctx.speicher.lies('vorrat', null);
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    }
    const gueltigesRaetsel = (r, n) => r && r.b === n && r.h === n && L.istGueltigeLoesung(r.loesung, n, n);

    function nimmAusVorrat(n) {
      const v = leseVorrat();
      const liste = Array.isArray(v[n]) ? v[n].filter((r) => gueltigesRaetsel(r, n)) : [];
      const r = liste.shift() ?? null;
      v[n] = liste;
      ctx.speicher.schreibe('vorrat', v);
      return r;
    }

    const fuelltGerade = new Set();
    async function fuelleVorrat(n) {
      if (fuelltGerade.has(n)) return;
      fuelltGerade.add(n);
      try {
        for (let runde = 0; runde < VORRAT_ZIEL; runde++) {
          const v = leseVorrat();
          const liste = Array.isArray(v[n]) ? v[n].filter((r) => gueltigesRaetsel(r, n)) : [];
          if (liste.length >= VORRAT_ZIEL) break;
          const r = await holeWorker().rufe('erzeuge', { b: n, h: n, seed: ctx.neuerSeed() });
          if (!aktiv) return;
          if (!gueltigesRaetsel(r, n)) break;
          const v2 = leseVorrat();
          const l2 = Array.isArray(v2[n]) ? v2[n].filter((x) => gueltigesRaetsel(x, n)) : [];
          l2.push({ b: n, h: n, seed: String(r.seed).slice(0, 80), loesung: r.loesung });
          v2[n] = l2;
          ctx.speicher.schreibe('vorrat', v2);
        }
      } catch (f) {
        if (f?.name !== 'AbortError') console.warn('Vorrat:', f);
      } finally {
        fuelltGerade.delete(n);
      }
    }

    async function neuesRaetsel(variante) {
      if (variante === 'motive') {
        const liste = await ladeMotive();
        motivListe = liste;
        if (!liste.length) throw new Error('Keine Motive vorhanden');
        const f = motivFortschritt();
        const ab = liste.findIndex((m) => m.id === f.letzte);
        let m = null;
        for (let k = 1; k <= liste.length && !m; k++) {
          const kand = liste[(ab + k + liste.length) % liste.length];
          if (!f.geloest.includes(kand.id)) m = kand;
        }
        m ??= liste[(ab + 1 + liste.length) % liste.length];
        f.letzte = m.id;
        ctx.speicher.schreibe('motive', f);
        return { quelle: 'motiv', motivId: m.id, titel: m.titel, b: m.b, h: m.h, loesung: m.loesung };
      }
      const n = GROESSE[variante] ?? 10;
      let r = nimmAusVorrat(n);
      if (!r) {
        r = n <= 10 ? L.erzeuge(n, n, ctx.neuerSeed()) : await holeWorker().rufe('erzeuge', { b: n, h: n, seed: ctx.neuerSeed() });
        if (!gueltigesRaetsel(r, n)) throw new Error('Ungültiges Rätsel vom Generator');
      }
      fuelleVorrat(n);
      return { quelle: 'zufall', seed: String(r.seed ?? '').slice(0, 80), b: n, h: n, loesung: r.loesung };
    }

    async function starte(variante) {
      const nr = ++ladeNr;
      clearTimeout(gewinnTimer);
      s = null;
      verlauf = erstelleVerlauf({ max: VERLAUF_MAX });
      zeigeLeer();
      try {
        const r = await neuesRaetsel(variante);
        if (!aktiv || nr !== ladeNr) return;
        s = L.neuerStand(r);
        aufbauen();
      } catch (f) {
        if (f?.name === 'AbortError' || !aktiv) return;
        console.error(f);
        info.textContent = 'Das Rätsel konnte nicht vorbereitet werden.';
      }
    }

    // ---------- Start ----------
    const geladen = L.pruefeStand(gespeichert);
    if (geladen) {
      s = geladen;
      const v = gespeichert.verlauf;
      const ok = v && Array.isArray(v.zurueck) && Array.isArray(v.vor)
        && [...v.zurueck, ...v.vor].every((z) => L.istGueltigerZug(z, s.b * s.h));
      verlauf = ladeVerlauf(ok ? v : null, { max: VERLAUF_MAX });
      aufbauen();
      if (s.geloest) gewinnTimer = setTimeout(meldeGewinn, 0);
      if (s.quelle === 'motiv') ladeMotive().then((l) => { motivListe = l; if (aktiv) zeichneInfo(); }).catch(() => {});
    } else {
      starte(ctx.variante ?? 'motive');
    }

    // ---------- Schnittstelle ----------
    return {
      getStand: () => (s ? {
        quelle: s.quelle, seed: s.seed, motivId: s.motivId, titel: s.titel, b: s.b, h: s.h,
        loesung: s.loesung, zellen: s.zellen, hinweiseGenutzt: s.hinweiseGenutzt, zuege: s.zuege,
        geloest: s.geloest, verlauf: verlauf.toJSON(),
      } : null),
      zusammenfassung() {
        if (!s) return '';
        if (s.quelle === 'motiv') {
          const nr = motivListe ? motivListe.findIndex((m) => m.id === s.motivId) + 1 : 0;
          return `Motiv${nr ? ` ${nr}` : ''} · ${s.b}×${s.h}`;
        }
        return `Zufall ${s.b}×${s.h}`;
      },
      kannRueckgaengig: () => Boolean(s) && !s.geloest && verlauf.kannZurueck(),
      kannWiederholen: () => Boolean(s) && !s.geloest && verlauf.kannVor(),
      rueckgaengig() {
        if (!s || s.geloest || zug) return;
        const e = verlauf.zurueck();
        if (!e) return;
        s.zellen = L.wendeZugAn(s.zellen, e, true);
        s.zuege = Math.max(0, s.zuege - 1);
        tastenZug = null; hinweisMarke = null; erklaerung = '';
        zeichne();
      },
      wiederholen() {
        if (!s || s.geloest || zug) return;
        const e = verlauf.vor();
        if (!e) return;
        s.zellen = L.wendeZugAn(s.zellen, e);
        s.zuege++;
        tastenZug = null; hinweisMarke = null; erklaerung = '';
        zeichne();
        pruefeGewinn();
      },
      hinweis() {
        if (!s || s.geloest || zug) return;
        const schritt = L.naechsterSchritt(s);
        if (!schritt) { ctx.meldung('Alles Nötige ist schon gesetzt.'); return; }
        s.hinweiseGenutzt++;
        tastenZug = null;
        const x = schritt.index % s.b, y = (schritt.index - x) / s.b;
        cursor = { x, y };
        hinweisMarke = { linie: schritt.linie ?? null, index: schritt.index };
        erklaerung = schritt.text;
        const e = aenderung(schritt.index, schritt.wert);
        if (e) {
          s.zellen = L.wendeZugAn(s.zellen, [e]);
          s.zuege++;
          verlauf.merke([e]);
        }
        nachZug();
        sichtbarMachen();
        ctx.meldung(schritt.typ === 'fehler' ? 'Ein Fehler wurde korrigiert.' : 'Ein Feld wurde gesetzt – Erklärung unter dem Feld.');
      },
      neustart() {
        if (!s) return;
        clearTimeout(gewinnTimer);
        s.zellen = '.'.repeat(s.b * s.h);
        s.zuege = 0;
        s.geloest = false;
        verlauf.leeren();
        tastenZug = null; hinweisMarke = null; erklaerung = '';
        zeichne();
      },
      neu: (variante) => starte(variante ?? ctx.variante ?? 'motive'),
      onTaste,
      zerstoere() {
        aktiv = false;
        clearTimeout(gewinnTimer);
        if (zug) clearTimeout(zug.lang);
        cancelAnimationFrame(groesseRahmen);
        ro.disconnect();
        worker?.beende();
        container.replaceChildren();
      },
    };
  },
};
