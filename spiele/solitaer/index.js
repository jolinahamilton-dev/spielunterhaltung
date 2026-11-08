// Solitär (Klondike-Regeln). Bedienung: Tippen/Klick = Karte automatisch aufs beste Ziel · Ziehen (Maus/Finger) ·
// Tastatur: Pfeile, Enter, Leertaste (Stapel), A (automatisch auf die Ablagen).
import { h, s, ladeStil } from '../../kern/dom.js';
import * as L from './logik.js';

// Selbst gezeichnete Kartenfarben (viewBox 0 0 10 10): Herz, Karo, Pik, Kreuz
const FORMEN = [
  'M5 9.3C1.6 6.6.6 5 .6 3.4A2.5 2.5 0 0 1 5 2.2 2.5 2.5 0 0 1 9.4 3.4C9.4 5 8.4 6.6 5 9.3Z',
  'M5 .5 8.7 5 5 9.5 1.3 5Z',
  'M5 .6C8.6 3.3 9.4 4.6 9.4 5.9A2.1 2.1 0 0 1 5.6 7.1C5.7 8.2 6.1 8.8 7 9.4H3C3.9 8.8 4.3 8.2 4.4 7.1A2.1 2.1 0 0 1 .6 5.9C.6 4.6 1.4 3.3 5 .6Z',
  'M5 .7a2 2 0 0 1 1.3 3.5A2.1 2.1 0 1 1 7.5 8 2 2 0 0 1 5.7 7C5.8 8.2 6.2 8.9 7 9.4H3C3.8 8.9 4.2 8.2 4.3 7A2 2 0 0 1 2.5 8 2.1 2.1 0 1 1 3.7 4.2 2 2 0 0 1 5 .7Z',
];
const symbolSvg = (farbe, klasse) => s('svg', { viewBox: '0 0 10 10', class: klasse, 'aria-hidden': 'true' }, s('path', { d: FORMEN[farbe] }));
const wiederSvg = () => s('svg', { viewBox: '0 0 24 24', class: 'so-wieder', 'aria-hidden': 'true' },
  s('path', { d: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));

const SCHRITT_ZU = 0.17;      // Versatz verdeckter Karten (in Kartenhöhen)
const SCHRITT_OFFEN = 0.36;   // Versatz offener Karten
const OBEN = [['stapel', 0], ['ablage', 0], ['fundament', 0], ['fundament', 1], ['fundament', 2], ['fundament', 3]];
const begrenze = (n, a, b) => Math.max(a, Math.min(b, n));
const zuegeText = (n) => `${n} ${n === 1 ? 'Zug' : 'Züge'}`;

export default {
  id: 'solitaer',
  name: 'Solitär',
  beschreibung: 'Karten nach Farbe und Reihenfolge ordnen – klassische Patience.',
  variantenTitel: 'Schwierigkeit',
  varianten: [
    { id: 'leicht', name: 'Leicht – 1 Karte ziehen, immer lösbar' },
    { id: 'mittel', name: 'Mittel – 3 Karten ziehen' },
    { id: 'schwer', name: 'Schwer – 3 Karten, lösbar, aber knifflig' },
  ],
  standVersion: 1,

  erstelle(container, ctx, gespeichert) {
    ladeStil('spiele/solitaer/stil.css');
    const { signal } = ctx;
    let aktiv = true;

    let sp = null;                // Spiel (logik.js) oder null, solange gemischt wird
    let cursor = null;            // Tastatur-/Fokusposition { ort, s, i }
    let hinweisInfo = null;       // { quelle, ziel }
    let status = '';
    let drag = null;
    let hinweisNr = 0, genNr = 0, pruefNr = 0;
    let fokusAnfordern = false;
    let hatteFokus = false;
    let cw = 0;

    let worker = null;
    try { worker = ctx.worker('spiele/solitaer/generator.worker.js'); } catch { worker = null; }

    // ---------- DOM ----------
    const kopfZeile = h('div', { class: 'so-oben' });
    const brett = h('div', { class: 'so-brett' });
    const infoEl = h('span', { class: 'so-info' });
    const autoKnopf = h('button', { type: 'button', class: 'knopf klein so-auto', on: { click: () => auto() } }, 'Automatisch auf Ablagen');
    const statusEl = h('p', { class: 'so-status', role: 'status', 'aria-live': 'polite' });
    const wurzel = h('div', { class: 'so' }, kopfZeile, brett, h('div', { class: 'so-leiste' }, infoEl, autoKnopf), statusEl);
    container.append(wurzel);

    // ---------- Karten ----------
    function karteEl(id, opt = {}) {
      const f = L.farbeVon(id);
      const interaktiv = opt.ort !== undefined;
      const el = h('div', {
        class: `so-karte offen ${L.istRot(id) ? 'rot' : 'schwarz'}`,
        role: interaktiv ? 'button' : undefined,
        tabindex: interaktiv ? (opt.cursor ? '0' : '-1') : undefined,
        'aria-label': opt.label,
        'aria-hidden': interaktiv ? undefined : 'true',
        dataset: interaktiv ? { ort: opt.ort, s: opt.s, i: opt.i } : undefined,
        style: { '--y': opt.y ?? 0, '--x': opt.x ?? 0 },
      },
      h('span', { class: 'so-ecke' }, h('span', { class: 'so-rang', text: L.RANG_KURZ[L.rangVon(id)] }), symbolSvg(f, 'so-sym')),
      symbolSvg(f, 'so-gross'));
      if (opt.klassen) el.classList.add(...opt.klassen);
      return el;
    }
    const rueckseite = (y) => h('div', { class: 'so-karte verdeckt', 'aria-hidden': 'true', style: { '--y': y } });

    const istCursor = (ort, sIdx, i) => cursor && cursor.ort === ort && cursor.s === sIdx && cursor.i === i;
    const hQ = () => hinweisInfo?.quelle;
    const hZ = () => hinweisInfo?.ziel;

    function slot(ort, sIdx, label, kinder, extra = []) {
      const el = h('div', {
        class: ['so-slot', ...extra].join(' '), role: 'button',
        tabindex: istCursor(ort, sIdx, 0) || (!cursor && ort === 'stapel') ? '0' : '-1',
        'aria-label': label, dataset: { ort, s: sIdx, i: 0 },
      }, kinder);
      return el;
    }

    // ---------- Zeichnen ----------
    function maase() {
      const erste = brett.firstElementChild;
      if (erste?.classList.contains('so-spalte')) cw = erste.getBoundingClientRect().width;
      else {
        const breite = brett.clientWidth || wurzel.clientWidth || 328;
        cw = (breite - 6 * (parseFloat(getComputedStyle(brett).columnGap) || 6)) / 7;
      }
      if (!(cw > 10)) cw = 44;
      wurzel.style.setProperty('--cw', `${cw}px`);
      wurzel.style.setProperty('--ch', `${cw * 1.4}px`);
    }

    function zeichne() {
      if (!aktiv) return;
      hatteFokus = wurzel.contains(document.activeElement);
      if (!sp) {
        kopfZeile.replaceChildren();
        brett.replaceChildren(h('p', { class: 'so-warte leise', text: 'Spiel wird gemischt …' }));
        infoEl.textContent = '';
        autoKnopf.disabled = true;
        statusEl.textContent = '';
        return;
      }
      const z = sp.z;
      repariereCursor();
      const ch = (cw || 44) * 1.4;
      const tippeHoehe = Math.max(5, ((typeof window !== 'undefined' ? window.innerHeight : 800) - 320) / ch);
      let hoechste = 1;
      const einheiten = z.sp.map((c) => (c.k.length === 0 ? 1 : 1 + c.zu * SCHRITT_ZU + Math.max(0, c.k.length - c.zu - 1) * SCHRITT_OFFEN));
      for (const e of einheiten) hoechste = Math.max(hoechste, e);
      const faktor = hoechste > tippeHoehe ? begrenze(tippeHoehe / hoechste, 0.62, 1) : 1;
      const sz = SCHRITT_ZU * faktor, so = SCHRITT_OFFEN * faktor;

      // Kopfzeile: Stapel, Ablagestapel, 4 Ablagefelder
      const stapelEl = slot('stapel', 0,
        z.stapel.length ? `Stapel, ${z.stapel.length} ${z.stapel.length === 1 ? 'Karte' : 'Karten'}, ziehen`
          : z.ablage.length ? 'Stapel leer, Ablagestapel wieder umdrehen' : 'Stapel leer',
        z.stapel.length ? rueckseite(0) : h('div', { class: 'so-leer' }, z.ablage.length ? wiederSvg() : null),
        [hQ()?.ort === 'stapel' ? 'hinweis' : '']);
      stapelEl.style.gridColumn = '1';

      const sichtbar = Math.min(z.zieh === 3 ? 3 : 1, z.ablage.length);
      const faecher = [];
      for (let j = 0; j < sichtbar; j++) {
        faecher.push(karteEl(z.ablage[z.ablage.length - sichtbar + j], { x: j * 0.27, y: 0 }));
      }
      const top = z.ablage[z.ablage.length - 1];
      const ablageEl = slot('ablage', 0,
        top === undefined ? 'Ablagestapel leer' : `Ablagestapel, oberste Karte ${L.kartenName(top)}`,
        sichtbar ? faecher : h('div', { class: 'so-leer' }),
        [hQ()?.ort === 'ablage' ? 'hinweis' : '', 'so-ablage']);
      ablageEl.style.gridColumn = '2 / span 2';

      const fundamente = [0, 1, 2, 3].map((f) => {
        const n = z.f[f];
        const el = slot('fundament', f,
          n ? `Ablage ${L.FARBEN[f]}, oberste Karte ${L.kartenName(f * 13 + n - 1)}` : `Ablage ${L.FARBEN[f]}, leer`,
          n ? karteEl(f * 13 + n - 1, {}) : h('div', { class: 'so-leer so-mark' }, symbolSvg(f, 'so-gross')),
          [(hQ()?.ort === 'fundament' && hQ().s === f) ? 'hinweis' : '', (hZ()?.ort === 'fundament' && hZ().s === f) ? 'hinweis-ziel' : '', 'so-fundament']);
        el.style.gridColumn = String(4 + f);
        return el;
      });
      kopfZeile.replaceChildren(stapelEl, ablageEl, ...fundamente);

      // Spalten
      const spalten = z.sp.map((c, ci) => {
        const spEl = h('div', {
          class: `so-spalte${hZ()?.ort === 'spalte' && hZ().s === ci ? ' hinweis-ziel' : ''}`,
          dataset: { ort: 'spalte', s: ci }, role: 'group', 'aria-label': `Spalte ${ci + 1}`,
          style: { height: `calc(var(--ch) * ${(hoechste * faktor).toFixed(3)})` },
        });
        if (c.k.length === 0) {
          spEl.append(h('div', {
            class: `so-leer so-spalte-leer${hQ()?.ort === 'spalte' ? '' : ''}`, role: 'button', tabindex: istCursor('spalte', ci, -1) ? '0' : '-1',
            'aria-label': `Spalte ${ci + 1} leer`, dataset: { ort: 'spalte', s: ci, i: -1 },
          }));
        }
        let y = 0;
        c.k.forEach((id, i) => {
          if (i < c.zu) { spEl.append(rueckseite(y.toFixed(3))); y += sz; return; }
          const rest = c.k.length - 1 - i;
          const mark = hQ()?.ort === 'spalte' && hQ().s === ci && i >= hQ().i;
          spEl.append(karteEl(id, {
            ort: 'spalte', s: ci, i, y: y.toFixed(3), cursor: istCursor('spalte', ci, i),
            label: `${L.kartenName(id)}, Spalte ${ci + 1}${rest > 0 ? `, mit ${rest} ${rest === 1 ? 'Karte' : 'Karten'} darauf` : ''}`,
            klassen: mark ? ['hinweis'] : null,
          }));
          y += so;
        });
        return spEl;
      });
      brett.replaceChildren(...spalten);

      infoEl.textContent = `${zuegeText(sp.zuege.length)} · Stapel ${z.stapel.length}`;
      const gew = L.gewonnen(z);
      autoKnopf.disabled = gew;
      const alleOffen = L.anzahlVerdeckt(z) === 0 && z.stapel.length === 0 && z.ablage.length === 0 && !gew;
      autoKnopf.classList.toggle('primaer', alleOffen);
      statusEl.textContent = status || (alleOffen ? 'Alles aufgedeckt – „Automatisch auf Ablagen“ erledigt den Rest.' : '');

      if (hatteFokus || fokusAnfordern) {
        fokusAnfordern = false;
        const el = cursorElement();
        el?.focus({ preventScroll: true });
      }
    }

    function cursorElement() {
      if (!cursor) return null;
      return wurzel.querySelector(`[data-ort="${cursor.ort}"][data-s="${cursor.s}"][data-i="${cursor.i}"]`);
    }

    function repariereCursor() {
      if (!cursor || !sp) return;
      if (cursor.ort === 'spalte') {
        const c = sp.z.sp[cursor.s];
        if (!c) { cursor = null; return; }
        const letzte = c.k.length - 1;
        cursor = { ort: 'spalte', s: cursor.s, i: letzte < 0 ? -1 : begrenze(cursor.i, c.zu, letzte) };
      }
    }

    // ---------- Züge ----------
    function setzeStatus(text) { status = text; statusEl.textContent = text; }

    function fuehreAus(zug) {
      if (!sp) return false;
      const n = L.zieheZug(sp, zug);
      if (!n) { setzeStatus(sp.zuege.length >= L.ZUEGE_MAX ? 'Sehr lange Partie – bitte Rückgängig oder ein neues Spiel.' : 'Dieser Zug geht nicht.'); return false; }
      sp = n;
      hinweisInfo = null; hinweisNr++;
      status = '';
      zeichne();
      ctx.meldeAenderung();
      pruefeEnde();
      return true;
    }

    function pruefeEnde() {
      if (!sp) return;
      if (L.gewonnen(sp.z)) { ctx.meldeGewonnen(`Geschafft in ${zuegeText(sp.zuege.length)}.`); return; }
      const nr = ++pruefNr;
      const z = sp.z;
      // Suche nach weiterführenden Zügen kurz verzögern, damit die Anzeige zuerst erscheint
      setTimeout(() => {
        if (!aktiv || nr !== pruefNr || sp?.z !== z) return;
        let f = null;
        try { f = L.gibtFortschritt(z, 800); } catch { f = null; }
        if (f === false && !L.gewonnen(z)) { setzeStatus('Kein Zug mehr, der weiterhilft – Rückgängig oder Neustart (Taste N).'); }
      }, 30);
    }

    function ziehe() {
      if (!sp) return;
      const z = sp.z;
      if (z.stapel.length) fuehreAus([0]);
      else if (z.ablage.length) fuehreAus([1]);
      else setzeStatus('Stapel und Ablagestapel sind leer.');
    }

    function auto() {
      if (!sp || L.gewonnen(sp.z)) return;
      if (!L.wende(sp.z, [7])) { setzeStatus('Gerade kann keine Karte auf die Ablagen.'); return; }
      fuehreAus([7]);
    }

    function autoBewegen(q) {
      if (!sp) return;
      const zug = L.autoZug(sp.z, q);
      if (!zug) { setzeStatus('Für diese Karte gibt es gerade keinen Platz.'); return; }
      fuehreAus(zug);
    }

    function quelleVon(el) {
      const ort = el?.dataset?.ort;
      if (!ort || !sp) return null;
      const z = sp.z;
      const sIdx = Number(el.dataset.s), i = Number(el.dataset.i);
      if (ort === 'ablage') return z.ablage.length ? { ort } : null;
      if (ort === 'fundament') return z.f[sIdx] > 0 ? { ort, s: sIdx } : null;
      if (ort === 'spalte') {
        const c = z.sp[sIdx];
        if (!c || !Number.isInteger(i) || i < c.zu || i >= c.k.length || el.dataset.i === undefined) return null;
        return { ort, s: sIdx, i };
      }
      return null;
    }

    function tippe(el) {
      if (!sp || !el) return;
      const ort = el.dataset.ort;
      if (el.dataset.i !== undefined) cursor = { ort, s: Number(el.dataset.s), i: Number(el.dataset.i) };
      setzeStatus('');
      if (ort === 'stapel') { ziehe(); return; }
      const q = quelleVon(el);
      if (q) autoBewegen(q);
      else zeichne();
    }

    // ---------- Zeiger: Tippen ----------
    ctx.eingabe.zeiger(wurzel, {
      signal,
      tippen: (e) => {
        if (drag) return;
        const el = e.startZiel?.closest?.('[data-ort]');
        if (el && wurzel.contains(el)) tippe(el);
      },
    });

    // ---------- Zeiger: Ziehen ----------
    function ziele(q) {
      const res = { spalten: new Set(), fundament: false };
      const z = sp.z;
      for (let c = 0; c < L.SPALTEN; c++) if (L.zugFuer(z, q, { ort: 'spalte', s: c })) res.spalten.add(c);
      res.fundament = Boolean(L.zugFuer(z, q, { ort: 'fundament' }));
      return res;
    }

    function zielAn(x, y) {
      for (const el of document.elementsFromPoint(x, y)) {
        const sEl = el.closest?.('.so-spalte');
        if (sEl && brett.contains(sEl)) return { ort: 'spalte', s: Number(sEl.dataset.s) };
        const fEl = el.closest?.('.so-fundament');
        if (fEl && wurzel.contains(fEl)) return { ort: 'fundament' };
      }
      const r = brett.getBoundingClientRect();
      if (y >= r.top - 10 && y <= r.bottom + 10 && x >= r.left && x <= r.right) {
        return { ort: 'spalte', s: begrenze(Math.floor(((x - r.left) / r.width) * 7), 0, 6) };
      }
      return null;
    }

    function ende() {
      drag?.geist?.remove();
      wurzel.querySelectorAll('.gezogen, .ziel-moeglich, .ziel-aktiv').forEach((el) => el.classList.remove('gezogen', 'ziel-moeglich', 'ziel-aktiv'));
      drag = null;
    }

    ctx.eingabe.ziehen(wurzel, {
      signal,
      schwelle: 8,
      start(e) {
        if (!sp || L.gewonnen(sp.z)) return false;
        const el = e.target?.closest?.('[data-ort]');
        if (!el || !wurzel.contains(el)) return false;
        const q = quelleVon(el);
        if (!q) return false;
        const r = el.getBoundingClientRect();
        drag = { q, el, dx: e.clientX - r.left, dy: e.clientY - r.top, geist: null, ziele: ziele(q), aktiv: null };
        return drag;
      },
      bewege(e, d) {
        if (!d.geist) {
          d.geist = h('div', { class: 'so-geist', style: { '--cw': `${cw}px`, '--ch': `${cw * 1.4}px` } });
          const z = sp.z;
          let ids = [], quellKarten = [];
          if (d.q.ort === 'ablage') { ids = [z.ablage[z.ablage.length - 1]]; quellKarten = [d.el.querySelector('.so-karte:last-child')]; }
          else if (d.q.ort === 'fundament') { ids = [d.q.s * 13 + z.f[d.q.s] - 1]; quellKarten = [d.el.querySelector('.so-karte')]; }
          else {
            ids = z.sp[d.q.s].k.slice(d.q.i);
            quellKarten = [...d.el.parentElement.querySelectorAll('.so-karte.offen')].filter((k) => Number(k.dataset.i) >= d.q.i);
          }
          ids.forEach((id, j) => d.geist.append(karteEl(id, { y: j * SCHRITT_OFFEN })));
          document.body.append(d.geist);
          quellKarten.forEach((k) => k?.classList.add('gezogen'));
          if (d.q.ort === 'ablage' || d.q.ort === 'fundament') d.el.classList.add('gezogen');
          d.ziele.spalten.forEach((c) => brett.children[c]?.classList.add('ziel-moeglich'));
          if (d.ziele.fundament) kopfZeile.querySelectorAll('.so-fundament').forEach((f) => f.classList.add('ziel-moeglich'));
        }
        d.geist.style.transform = `translate(${e.clientX - d.dx}px, ${e.clientY - d.dy}px)`;
        const ziel = zielAn(e.clientX, e.clientY);
        const key = ziel ? `${ziel.ort}${ziel.s ?? ''}` : '';
        if (key !== d.aktiv) {
          wurzel.querySelectorAll('.ziel-aktiv').forEach((el) => el.classList.remove('ziel-aktiv'));
          d.aktiv = key;
          if (ziel?.ort === 'spalte' && d.ziele.spalten.has(ziel.s)) brett.children[ziel.s]?.classList.add('ziel-aktiv');
          if (ziel?.ort === 'fundament' && d.ziele.fundament) kopfZeile.querySelectorAll('.so-fundament').forEach((f) => f.classList.add('ziel-aktiv'));
        }
      },
      ablegen(e, d) {
        const ziel = d.geist ? zielAn(e.clientX, e.clientY) : null;
        const q = d.q;
        ende();
        if (!ziel || !sp) { zeichne(); return; }
        if (ziel.ort === 'spalte' && q.ort === 'spalte' && ziel.s === q.s) { zeichne(); return; }
        const zug = L.zugFuer(sp.z, q, ziel);
        if (!zug) { setzeStatus('Hier passt die Karte nicht.'); zeichne(); return; }
        if (q.ort === 'spalte') cursor = { ort: 'spalte', s: ziel.ort === 'spalte' ? ziel.s : q.s, i: 9999 };
        fuehreAus(zug);
      },
      abbrechen() { ende(); zeichne(); },
    });

    // Fokus per Tab/Maus übernehmen
    wurzel.addEventListener('focusin', (e) => {
      const el = e.target?.closest?.('[data-ort]');
      if (el && el.dataset.i !== undefined && el.getAttribute('role') === 'button') {
        cursor = { ort: el.dataset.ort, s: Number(el.dataset.s), i: Number(el.dataset.i) };
      }
    }, { signal });

    // ---------- Tastatur ----------
    function navigiere(taste) {
      const z = sp.z;
      if (!cursor) { cursor = { ort: 'stapel', s: 0, i: 0 }; return; }
      const obenReihe = cursor.ort !== 'spalte';
      const topIdx = obenReihe ? OBEN.findIndex(([o, sIdx]) => o === cursor.ort && (o !== 'fundament' || sIdx === cursor.s)) : -1;
      const letzte = (c) => z.sp[c].k.length - 1;
      if (taste === 'ArrowLeft' || taste === 'ArrowRight') {
        const d = taste === 'ArrowLeft' ? -1 : 1;
        if (obenReihe) { const n = begrenze(topIdx + d, 0, 5); cursor = { ort: OBEN[n][0], s: OBEN[n][1], i: 0 }; }
        else { const c = begrenze(cursor.s + d, 0, 6); cursor = { ort: 'spalte', s: c, i: letzte(c) }; }
      } else if (taste === 'ArrowDown') {
        if (obenReihe) { const c = topIdx <= 1 ? topIdx : topIdx + 1; cursor = { ort: 'spalte', s: c, i: letzte(c) }; }
        else if (cursor.i < letzte(cursor.s)) cursor = { ...cursor, i: cursor.i + 1 };
      } else if (taste === 'ArrowUp') {
        if (!obenReihe) {
          if (cursor.i > z.sp[cursor.s].zu) cursor = { ...cursor, i: cursor.i - 1 };
          else { const c = cursor.s; const t = c === 0 ? 0 : c <= 2 ? 1 : c - 1; cursor = { ort: OBEN[t][0], s: OBEN[t][1], i: 0 }; }
        }
      } else if (taste === 'Home' || taste === 'End') {
        cursor = taste === 'Home' ? { ort: 'stapel', s: 0, i: 0 } : { ort: 'spalte', s: 6, i: letzte(6) };
      }
    }

    // ---------- Schnittstelle ----------
    async function neuesRaetsel(stufe) {
      const nr = ++genNr;
      sp = null; cursor = null; hinweisInfo = null; status = '';
      pruefNr++; hinweisNr++;
      zeichne();
      const seed = ctx.neuerSeed();
      let erg = null;
      try {
        erg = worker ? await worker.rufe('erzeuge', { stufe, seed }) : L.erzeuge(stufe, seed);
      } catch (f) {
        if (f?.name === 'AbortError') return;
        try { erg = L.erzeuge(stufe, seed); } catch { erg = null; }
      }
      if (!aktiv || nr !== genNr) return;
      let neu = null;
      try { neu = L.neuesSpiel(erg.deck, stufe, seed); if (!L.istGueltig(L.zumSpeichern(neu))) neu = null; } catch { neu = null; }
      if (!neu) { try { neu = L.neuesSpiel(L.erzeuge('mittel', seed).deck, stufe, seed); } catch { return; } }
      sp = neu;
      zeichne();
    }

    let stufeStart = ctx.variante && Object.hasOwn(L.STUFEN, ctx.variante) ? ctx.variante : 'leicht';
    let geladen = null;
    try { if (gespeichert) geladen = L.ausSpeicher(gespeichert); } catch { geladen = null; }
    if (geladen && !L.gewonnen(geladen.z)) { sp = geladen; zeichne(); pruefeEnde(); } else neuesRaetsel(stufeStart);

    // Größe und Farbwechsel
    let ro = null;
    try {
      let roPlan = 0;
      ro = new ResizeObserver(() => {
        cancelAnimationFrame(roPlan);
        roPlan = requestAnimationFrame(() => { if (!aktiv) return; const alt = cw; maase(); if (Math.abs(cw - alt) > 0.5 && !drag) zeichne(); });
      });
      ro.observe(wurzel);
      ro.observe(brett);
    } catch { /* ohne ResizeObserver bleibt es bei der Grundgröße */ }
    maase();
    if (sp) zeichne();

    const instanz = {
      getStand: () => (sp ? L.zumSpeichern(sp) : null),
      zusammenfassung: () => (sp ? `${L.STUFEN[sp.stufe].name} · ${zuegeText(sp.zuege.length)}` : ''),
      kannRueckgaengig: () => Boolean(sp) && L.kannRueckgaengig(sp),
      kannWiederholen: () => Boolean(sp) && L.kannWiederholen(sp),
      rueckgaengig() {
        const n = sp && L.rueckgaengig(sp);
        if (!n) return;
        sp = n; hinweisInfo = null; hinweisNr++; status = '';
        zeichne(); ctx.meldeAenderung(); pruefeEnde();
      },
      wiederholen() {
        const n = sp && L.wiederholen(sp);
        if (!n) return;
        sp = n; hinweisInfo = null; hinweisNr++; status = '';
        zeichne(); ctx.meldeAenderung(); pruefeEnde();
      },
      async hinweis() {
        if (!sp || L.gewonnen(sp.z)) return;
        const nr = ++hinweisNr;
        const z = sp.z;
        let r = null;
        try {
          r = worker ? await worker.rufe('hinweis', { z }) : L.hinweisFuer(z, 8000);
        } catch (f) {
          if (f?.name === 'AbortError') return;
          try { r = L.hinweisFuer(z, 6000); } catch { r = null; }
        }
        if (!aktiv || nr !== hinweisNr || !sp || sp.z !== z || drag) return;
        const zug = r?.zug;
        if (!zug || !L.wende(z, zug)) { setzeStatus('Kein Zug mehr gefunden – Rückgängig oder Neustart (Taste N).'); return; }
        hinweisInfo = infoFuer(z, zug);
        const text = L.zugText(z, zug);
        status = r.gewinnWeg === false
          ? `Von hier aus finde ich keinen Weg zum Sieg mehr – Rückgängig kann helfen. Sonst: ${text}.`
          : `Tipp: ${text}.`;
        zeichne();
      },
      neustart() {
        if (!sp) return;
        sp = L.neustart(sp); cursor = null; hinweisInfo = null; hinweisNr++; status = '';
        zeichne(); ctx.meldeAenderung(); pruefeEnde();
      },
      neu(variante) {
        const st = variante && Object.hasOwn(L.STUFEN, variante) ? variante : (sp?.stufe ?? stufeStart);
        return neuesRaetsel(st);
      },
      onTaste(e) {
        if (!sp || drag || e.ctrlKey || e.metaKey || e.altKey) return false;
        const a = document.activeElement;
        const fremd = a && a !== document.body && a !== document.documentElement && !wurzel.contains(a);
        if (fremd) return false;
        const k = e.key;
        if (k.startsWith('Arrow') || k === 'Home' || k === 'End') {
          navigiere(k); fokusAnfordern = true; zeichne(); return true;
        }
        if (k === 'Enter') {
          if (!cursor) { cursor = { ort: 'stapel', s: 0, i: 0 }; fokusAnfordern = true; zeichne(); return true; }
          fokusAnfordern = true;
          const el = cursorElement();
          if (el) tippe(el);
          return true;
        }
        if (k === ' ') { fokusAnfordern = Boolean(cursor); ziehe(); return true; }
        if (k === 'a' || k === 'A') { auto(); return true; }
        if (k === 'Escape' && hinweisInfo) { hinweisInfo = null; zeichne(); return true; }
        return false;
      },
      zerstoere() {
        aktiv = false;
        ende();
        ro?.disconnect();
        worker?.beende();
        container.replaceChildren();
      },
    };
    return instanz;
  },
};

/** Welche Karte/Stelle ein Hinweis-Zug betrifft (nur Anzeige) */
function infoFuer(z, zug) {
  const oben = (l) => l[l.length - 1];
  switch (zug[0]) {
    case 0: case 1: return { quelle: { ort: 'stapel' }, ziel: null };
    case 2: return { quelle: { ort: 'ablage' }, ziel: { ort: 'spalte', s: zug[1] } };
    case 3: return { quelle: { ort: 'ablage' }, ziel: { ort: 'fundament', s: L.farbeVon(oben(z.ablage)) } };
    case 4: return { quelle: { ort: 'spalte', s: zug[1], i: z.sp[zug[1]].k.length - zug[3] }, ziel: { ort: 'spalte', s: zug[2] } };
    case 5: return { quelle: { ort: 'spalte', s: zug[1], i: z.sp[zug[1]].k.length - 1 }, ziel: { ort: 'fundament', s: L.farbeVon(oben(z.sp[zug[1]].k)) } };
    case 6: return { quelle: { ort: 'fundament', s: zug[1] }, ziel: { ort: 'spalte', s: zug[2] } };
    default: return { quelle: null, ziel: null };
  }
}
