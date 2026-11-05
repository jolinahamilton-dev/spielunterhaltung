// Malen nach Zahlen: Farbe wählen, passende Felder antippen oder übermalen.
// Bedienung: linke Maustaste/ein Finger malt (auch Ziehen) · Mausrad/Pinch/+− zoomt ·
// mittlere Taste, Leertaste + Ziehen oder zwei Finger verschieben · Tastatur: 1–9/0, Pfeile, Leertaste,
// Umschalt + Pfeile malt beim Bewegen, W = nächste offene Stelle.
import { h, s, ladeStil } from '../../kern/dom.js';
import * as L from './logik.js';

const ZAHL_AB = 13;        // ab dieser Zellgröße (CSS-px) werden Zahlen gezeigt
const ZELLE_MAX = 56;      // größte Zoomstufe
const ZELLE_ZEIGEN = 26;   // Zoom beim Springen zu einem Feld
const RAND = 6;            // Abstand des Bildes zum Rand der Bühne
const GEWINN_MS = 1400;    // so lange steht das fertige Bild allein da

let bilderLaden = null;
/** bilder.json einmal laden (bei Fehler: nur Mosaike) */
function ladeBilder() {
  bilderLaden ??= fetch(new URL('./bilder.json', import.meta.url))
    .then((r) => (r.ok ? r.json() : []))
    .then((m) => (Array.isArray(m) ? m : []))
    .catch(() => { bilderLaden = null; return []; });
  return bilderLaden;
}

/** Helligkeit einer #rrggbb-Farbe (0–1) */
function helligkeit(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const kanal = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * kanal(n >> 16 & 255) + 0.7152 * kanal(n >> 8 & 255) + 0.0722 * kanal(n & 255);
}

export default {
  id: 'malen-nach-zahlen',
  name: 'Malen nach Zahlen',
  beschreibung: 'Feld für Feld ein Bild ausmalen – jede Zahl hat ihre Farbe.',
  variantenTitel: 'Bildgröße',
  varianten: [
    { id: 'klein', name: 'Klein – bis 16 × 16' },
    { id: 'mittel', name: 'Mittel – bis 24 × 24' },
    { id: 'gross', name: 'Groß – bis 32 × 32' },
  ],
  standVersion: 1,

  erstelle(container, ctx, gespeichert) {
    ladeStil('spiele/malen-nach-zahlen/stil.css');
    const ac = new AbortController();
    const signal = ac.signal;
    ctx.signal?.addEventListener('abort', () => ac.abort(), { once: true });

    let z = null;
    try { z = gespeichert ? L.ausSpeicher(gespeichert) : null; } catch { z = null; }
    if (z && L.fertig(z)) z = null;

    let gewaehlt = 0;              // Farbindex
    let cx = 0, cy = 0;            // Tastatur-Cursor
    let tastatur = false;          // Cursor sichtbar (Tastaturbedienung)
    let markiert = -1;             // Hinweis-/Sprungfeld
    let vorschau = null;           // laufender Strich: { id, felder: [], menge: Set, letztes }
    let tastenStrich = null;       // Umschalt + Pfeile: { felder: [], menge: Set }
    let ansicht = { s: 10, ox: 0, oy: 0 };
    let passt = true;              // Bild eingepasst → bei Größenänderung neu einpassen
    let breite = 0, hoehe = 0, dpr = 1;
    let fertigZeigen = false;
    let gewinnTimer = 0;
    let erzeugung = 0;
    let zerstoert = false;
    let geplant = 0;
    let farbWerte = [];            // CSS-Farben der Bildfarben
    let thema = {};
    let leertaste = false;

    // ---------- DOM ----------
    const titelEl = h('span', { class: 'mz-titel' });
    const restEl = h('span', { class: 'mz-rest leise' });
    const leinwand = h('canvas', {
      class: 'mz-leinwand', tabindex: '0', role: 'application', 'aria-roledescription': 'Malfläche',
    });
    const ladenEl = h('p', { class: 'mz-laden leise', hidden: true, text: 'Bild wird vorbereitet …' });
    const buehne = h('div', { class: 'mz-buehne' }, leinwand, ladenEl);
    const statusEl = h('p', { class: 'mz-vorlesen', role: 'status', 'aria-live': 'polite' });
    const kKleiner = h('button', { type: 'button', class: 'knopf mz-zoom', title: 'Verkleinern (−)', 'aria-label': 'Verkleinern', on: { click: () => zoomMitte(1 / 1.4) } }, '−');
    const kGroesser = h('button', { type: 'button', class: 'knopf mz-zoom', title: 'Vergrößern (+)', 'aria-label': 'Vergrößern', on: { click: () => zoomMitte(1.4) } }, '+');
    const kGanz = h('button', { type: 'button', class: 'knopf', title: 'Ganzes Bild zeigen', on: { click: () => { einpassen(); zeichne(); } } }, 'Ganzes Bild');
    const kSpringen = h('button', { type: 'button', class: 'knopf', title: 'Zur nächsten offenen Stelle der Farbe springen (W)', on: { click: () => springe() } }, 'Nächste Stelle');
    const werkzeugeEl = h('div', { class: 'mz-werkzeuge' }, kKleiner, kGroesser, kGanz, kSpringen);
    const leisteEl = h('div', { class: 'mz-leiste', role: 'toolbar', 'aria-label': 'Farben – Ziffern 1 bis 0 wählen' });

    const wurzel = h('div', { class: 'mz' },
      h('div', { class: 'mz-info' }, titelEl, restEl),
      buehne,
      werkzeugeEl,
      leisteEl,
      statusEl,
    );
    container.append(wurzel);
    const c2d = leinwand.getContext('2d');

    let farbKnoepfe = [];
    let gebaut = '';

    // ---------- Farben ----------
    function leseFarben() {
      const cs = getComputedStyle(wurzel);
      const v = (n, std) => cs.getPropertyValue(n).trim() || std;
      thema = {
        flaeche: v('--flaeche', '#fff'), flaeche2: v('--flaeche-2', '#ece7df'), text: v('--text', '#2b2f36'),
        leise: v('--text-leise', '#626a74'), rand: v('--rand', '#d9d2c7'), fokus: v('--fokus', '#1f6fb2'),
        akzent: v('--akzent', '#2f7a72'), schrift: v('--schrift', 'system-ui, sans-serif'),
      };
      const liste = ctx.farben.liste;
      farbWerte = z ? z.farben.map((id) => v(`--spielfarbe-${id}`, liste[id]?.wert ?? '#888')) : [];
    }
    const farbName = (k) => ctx.farben.liste[z.farben[k]]?.name ?? `Farbe ${k + 1}`;
    const nummer = (k) => String(k + 1);
    const hell = (k) => helligkeit(ctx.farben.liste[z.farben[k]]?.wert) > 0.4;
    const symbolPfade = new Map();
    const symbolPfad = (k) => {
      const id = z.farben[k];
      if (!symbolPfade.has(id)) symbolPfade.set(id, new Path2D(ctx.farben.symbolPfad(id)));
      return symbolPfade.get(id);
    };

    // ---------- Ansicht (Zoom/Verschieben) ----------
    const zelleFit = () => (z ? Math.max(1, Math.min((breite - 2 * RAND) / z.b, (hoehe - 2 * RAND) / z.h)) : 10);
    const zelleMax = () => Math.max(zelleFit(), ZELLE_MAX);

    function einpassen() {
      if (!z) return;
      const sz = zelleFit();
      ansicht = { s: sz, ox: (breite - z.b * sz) / 2, oy: (hoehe - z.h * sz) / 2 };
      passt = true;
      aktualisiereZoomKnoepfe();
    }

    function begrenze() {
      const { s: sz } = ansicht;
      const bw = z.b * sz, bh = z.h * sz;
      ansicht.ox = bw + 2 * RAND <= breite ? (breite - bw) / 2 : Math.min(RAND, Math.max(breite - bw - RAND, ansicht.ox));
      ansicht.oy = bh + 2 * RAND <= hoehe ? (hoehe - bh) / 2 : Math.min(RAND, Math.max(hoehe - bh - RAND, ansicht.oy));
    }

    function zoomUm(faktor, px, py) {
      if (!z) return;
      const alt = ansicht.s;
      const neu = Math.max(zelleFit(), Math.min(zelleMax(), alt * faktor));
      ansicht.ox = px - ((px - ansicht.ox) * neu) / alt;
      ansicht.oy = py - ((py - ansicht.oy) * neu) / alt;
      ansicht.s = neu;
      passt = neu <= zelleFit() + 0.01;
      begrenze();
      aktualisiereZoomKnoepfe();
      zeichne();
    }
    const zoomMitte = (f) => zoomUm(f, breite / 2, hoehe / 2);

    function aktualisiereZoomKnoepfe() {
      if (!z) return;
      kKleiner.disabled = ansicht.s <= zelleFit() + 0.01;
      kGroesser.disabled = ansicht.s >= zelleMax() - 0.01;
    }

    /** Feld i in die Mitte holen; bei kleinen Zellen dabei vergrößern */
    function zeigeFeld(i) {
      const x = i % z.b, y = Math.floor(i / z.b);
      if (ansicht.s < ZAHL_AB + 2) ansicht.s = Math.min(zelleMax(), Math.max(ansicht.s, ZELLE_ZEIGEN));
      ansicht.ox = breite / 2 - (x + 0.5) * ansicht.s;
      ansicht.oy = hoehe / 2 - (y + 0.5) * ansicht.s;
      passt = ansicht.s <= zelleFit() + 0.01;
      begrenze();
      aktualisiereZoomKnoepfe();
    }

    /** Cursor sichtbar halten (nur so weit verschieben wie nötig) */
    function cursorInSicht() {
      const sz = ansicht.s, m = Math.min(sz, 24);
      const x = ansicht.ox + cx * sz, y = ansicht.oy + cy * sz;
      if (x < m) ansicht.ox += m - x;
      if (x + sz > breite - m) ansicht.ox -= x + sz - (breite - m);
      if (y < m) ansicht.oy += m - y;
      if (y + sz > hoehe - m) ansicht.oy -= y + sz - (hoehe - m);
      begrenze();
    }

    function feldBei(clientX, clientY) {
      const r = leinwand.getBoundingClientRect();
      const x = Math.floor((clientX - r.left - ansicht.ox) / ansicht.s);
      const y = Math.floor((clientY - r.top - ansicht.oy) / ansicht.s);
      if (x < 0 || y < 0 || x >= z.b || y >= z.h) return -1;
      return y * z.b + x;
    }

    // ---------- Zeichnen ----------
    function zeichne() {
      if (geplant || zerstoert) return;
      geplant = requestAnimationFrame(() => { geplant = 0; male(); });
    }

    function male() {
      if (zerstoert) return;
      c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      c2d.clearRect(0, 0, breite, hoehe);
      if (!z || !breite || !hoehe) return;
      const { s: sz, ox, oy } = ansicht;
      const muster = ctx.farben.musterAn();
      const fertig = fertigZeigen;
      const spalt = !fertig && sz >= 7 ? Math.max(1, Math.round(sz * 0.07)) : 0;
      const zahlen = !fertig && sz >= ZAHL_AB;
      const x0 = Math.max(0, Math.floor(-ox / sz)), x1 = Math.min(z.b - 1, Math.ceil((breite - ox) / sz));
      const y0 = Math.max(0, Math.floor(-oy / sz)), y1 = Math.min(z.h - 1, Math.ceil((hoehe - oy) / sz));
      const menge = vorschau?.menge ?? tastenStrich?.menge ?? null;

      // Bildfläche
      c2d.fillStyle = thema.flaeche;
      c2d.fillRect(ox, oy, z.b * sz, z.h * sz);
      if (!fertig) {
        c2d.strokeStyle = thema.rand;
        c2d.lineWidth = 1;
        c2d.strokeRect(Math.round(ox) - 0.5, Math.round(oy) - 0.5, Math.round(z.b * sz) + 1, Math.round(z.h * sz) + 1);
      }
      c2d.textAlign = 'center';
      c2d.textBaseline = 'middle';
      const schrift = Math.max(8, Math.round(sz * (sz >= 22 ? 0.42 : 0.5)));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * z.b + x;
          const v = z.bild[i];
          if (v < 0) continue;
          const X = ox + x * sz, Y = oy + y * sz;
          const gemalt = fertig || z.gemalt[i] || (menge !== null && menge.has(i));
          if (gemalt) {
            c2d.fillStyle = farbWerte[v];
            // ganzzahlige Kanten, damit zwischen gemalten Feldern keine Haarlinien bleiben
            const ax = Math.floor(X), ay = Math.floor(Y);
            c2d.fillRect(ax, ay, Math.floor(X + sz) - ax, Math.floor(Y + sz) - ay);
            if (muster && sz >= 10 && !fertig) {
              c2d.save();
              c2d.translate(X + sz * 0.2, Y + sz * 0.2);
              c2d.scale((sz * 0.6) / 10, (sz * 0.6) / 10);
              c2d.fillStyle = hell(v) ? 'rgba(0,0,0,.32)' : 'rgba(255,255,255,.5)';
              c2d.fill(symbolPfad(v), 'evenodd');
              c2d.restore();
            }
            continue;
          }
          const aktiv = v === gewaehlt;
          c2d.fillStyle = thema.flaeche2;
          c2d.fillRect(X + spalt / 2, Y + spalt / 2, sz - spalt, sz - spalt);
          if (aktiv) {
            c2d.globalAlpha = 0.38;
            c2d.fillStyle = farbWerte[v];
            c2d.fillRect(X + spalt / 2, Y + spalt / 2, sz - spalt, sz - spalt);
            c2d.globalAlpha = 1;
          }
          if (zahlen) {
            c2d.fillStyle = aktiv ? thema.text : thema.leise;
            c2d.font = `${aktiv ? 700 : 500} ${schrift}px ${thema.schrift}`;
            c2d.fillText(nummer(v), X + sz / 2, Y + sz / 2 + 0.5);
          } else if (aktiv) {
            c2d.fillStyle = thema.text;
            c2d.beginPath();
            c2d.arc(X + sz / 2, Y + sz / 2, Math.max(1.2, sz * 0.16), 0, Math.PI * 2);
            c2d.fill();
          }
        }
      }

      if (fertig) return;
      // Hinweis-Markierung
      if (markiert >= 0) {
        const X = ox + (markiert % z.b) * sz, Y = oy + Math.floor(markiert / z.b) * sz;
        c2d.strokeStyle = thema.akzent;
        c2d.lineWidth = 3;
        c2d.beginPath();
        c2d.arc(X + sz / 2, Y + sz / 2, Math.max(sz * 0.9, 12), 0, Math.PI * 2);
        c2d.stroke();
      }
      // Tastatur-Cursor
      if (tastatur && document.activeElement === leinwand) {
        c2d.strokeStyle = thema.fokus;
        c2d.lineWidth = Math.max(2, Math.min(3, sz * 0.15));
        c2d.strokeRect(ox + cx * sz + 1, oy + cy * sz + 1, sz - 2, sz - 2);
      }
    }

    // ---------- Farbleiste und Info ----------
    function baueLeiste() {
      const sig = `${z.titel}|${z.farben.join(',')}|${ctx.farben.musterAn()}`;
      if (sig === gebaut) return;
      gebaut = sig;
      const muster = ctx.farben.musterAn();
      farbKnoepfe = z.farben.map((id, k) => h('button', {
        type: 'button', class: 'mz-farbe', on: { click: () => { waehle(k); } },
      },
      h('span', {
        class: `mz-farbe-feld${hell(k) ? ' hell' : ''}`, style: { background: ctx.farben.css(id) }, 'aria-hidden': 'true',
      },
      muster ? s('svg', { viewBox: '0 0 10 10', class: 'mz-farbe-symbol' }, s('path', { d: ctx.farben.symbolPfad(id), 'fill-rule': 'evenodd' })) : null,
      h('span', { class: 'mz-farbe-nr' })),
      h('span', { class: 'mz-farbe-balken', 'aria-hidden': 'true' }, h('span', { class: 'mz-farbe-fuell' }))));
      leisteEl.replaceChildren(...farbKnoepfe);
    }

    function aktualisiereLeiste() {
      const rest = L.restJeFarbe(z);
      const gesamt = L.anzahlJeFarbe(z);
      farbKnoepfe.forEach((kn, k) => {
        const fertig = rest[k] === 0;
        kn.classList.toggle('gewaehlt', k === gewaehlt);
        kn.classList.toggle('fertig', fertig);
        kn.setAttribute('aria-pressed', String(k === gewaehlt));
        kn.querySelector('.mz-farbe-nr').textContent = fertig ? '✓' : nummer(k);
        kn.querySelector('.mz-farbe-fuell').style.width = `${gesamt[k] ? Math.round(((gesamt[k] - rest[k]) / gesamt[k]) * 100) : 100}%`;
        kn.setAttribute('aria-label', `Zahl ${nummer(k)}: ${farbName(k)}, ${fertig ? 'fertig' : `noch ${rest[k]} von ${gesamt[k]} Feldern`}`);
        kn.title = `Zahl ${nummer(k)} · ${farbName(k)}${k < 10 ? ` (Taste ${k === 9 ? 0 : k + 1})` : ''}`;
      });
      const r = L.restGesamt(z);
      titelEl.textContent = z.titel;
      restEl.textContent = r ? `noch ${r} Felder` : 'fertig gemalt';
      leinwand.setAttribute('aria-label', `Malfläche ${z.titel}, ${z.b} × ${z.h} Felder, gewählt: Zahl ${nummer(gewaehlt)}, ${farbName(gewaehlt)}. `
        + 'Pfeiltasten bewegen, Leertaste malt, Umschalt und Pfeile malt beim Bewegen, Ziffern wählen die Farbe.');
    }

    function sageCursor() {
      const i = cy * z.b + cx;
      const v = z.bild[i];
      statusEl.textContent = `Zeile ${cy + 1}, Spalte ${cx + 1}: ${v < 0 ? 'leer' : `Zahl ${nummer(v)}, ${z.gemalt[i] ? 'gemalt' : 'offen'}`}`;
    }

    function zeigeAlles() {
      ladenEl.hidden = Boolean(z);
      leinwand.hidden = !z;
      werkzeugeEl.hidden = !z;
      leisteEl.hidden = !z;
      if (!z) { titelEl.textContent = ''; restEl.textContent = ''; return; }
      baueLeiste();
      aktualisiereLeiste();
      aktualisiereZoomKnoepfe();
      zeichne();
    }

    // ---------- Aktionen ----------
    function waehle(k) {
      if (!z || k < 0 || k >= z.farben.length) return;
      gewaehlt = k;
      aktualisiereLeiste();
      zeichne();
    }

    /** Nach jedem Zug: Farbe weiterschalten, anzeigen, speichern, ggf. fertig */
    function nachZug() {
      markiert = -1;
      if (L.restJeFarbe(z)[gewaehlt] === 0) {
        const n = L.naechsteOffeneFarbe(z, gewaehlt + 1);
        if (n >= 0) gewaehlt = n;
      }
      aktualisiereLeiste();
      zeichne();
      ctx.meldeAenderung();
      if (L.fertig(z)) starteGewinn();
    }

    function setzeZug(felder) {
      if (!z || fertigZeigen) return false;
      const neu = L.male(z, felder, gewaehlt);
      if (neu === z) return false;
      z = neu;
      nachZug();
      return true;
    }

    function starteGewinn() {
      vorschau = null;
      tastenStrich = null;
      fertigZeigen = true;
      einpassen();
      if (!ctx.bewegungReduziert()) {
        buehne.classList.remove('mz-fertig');
        void buehne.offsetWidth;
        buehne.classList.add('mz-fertig');
      }
      zeichne();
      clearTimeout(gewinnTimer);
      gewinnTimer = setTimeout(meldeGewinn, ctx.bewegungReduziert() ? GEWINN_MS / 2 : GEWINN_MS);
    }
    function meldeGewinn() {
      clearTimeout(gewinnTimer);
      gewinnTimer = 0;
      if (z && fertigZeigen) ctx.meldeGewonnen(`Bild: ${z.titel}`);
    }
    function brichGewinnAb() {
      clearTimeout(gewinnTimer);
      gewinnTimer = 0;
      fertigZeigen = false;
      buehne.classList.remove('mz-fertig');
    }

    function springe() {
      if (!z || fertigZeigen) return;
      let f = gewaehlt;
      if (L.restJeFarbe(z)[f] === 0) f = L.naechsteOffeneFarbe(z, f + 1);
      if (f < 0) return;
      if (f !== gewaehlt) waehle(f);
      const i = L.naechstesOffenes(z, f, cy * z.b + cx);
      if (i < 0) return;
      cx = i % z.b; cy = Math.floor(i / z.b);
      markiert = i;
      tastatur = true;
      leinwand.focus({ preventScroll: true });
      zeigeFeld(i);
      sageCursor();
      zeichne();
    }

    // ---------- Zeiger (Maus, Touch, Stift) ----------
    const zeiger = new Map();
    let modus = null;              // 'malen' | 'schieben' | 'pinch' | 'warten'
    let schieben = null;
    let pinch = null;

    const posVon = (e) => { const r = leinwand.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

    function starteStrich(e) {
      modus = 'malen';
      vorschau = { id: e.pointerId, felder: [], menge: new Set(), letztes: -1 };
      maleBis(e);
    }
    function maleBis(e) {
      const i = feldBei(e.clientX, e.clientY);
      if (i < 0) { vorschau.letztes = -1; return; }
      const strecke = vorschau.letztes >= 0 ? L.linie(z.b, vorschau.letztes, i) : [i];
      vorschau.letztes = i;
      let neu = false;
      for (const f of strecke) {
        if (!vorschau.menge.has(f) && L.malbar(z, f, gewaehlt)) { vorschau.menge.add(f); vorschau.felder.push(f); neu = true; }
      }
      if (neu) zeichne();
    }
    function beendeStrich() {
      const v = vorschau;
      vorschau = null;
      modus = null;
      if (v && v.felder.length) setzeZug(v.felder);
      else zeichne();
    }
    function verwerfeStrich() {
      if (vorschau) { vorschau = null; zeichne(); }
    }

    function startePinch() {
      const [a, b] = [...zeiger.values()];
      modus = 'pinch';
      pinch = { d: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
    function bewegePinch() {
      const [a, b] = [...zeiger.values()];
      const d = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      ansicht.ox += mx - pinch.mx;
      ansicht.oy += my - pinch.my;
      pinch.mx = mx; pinch.my = my;
      zoomUm(d / pinch.d, mx, my);
      pinch.d = d;
    }

    leinwand.addEventListener('pointerdown', (e) => {
      if (!z || fertigZeigen) return;
      leinwand.focus({ preventScroll: true });
      tastatur = false;
      markiert = -1;
      try { leinwand.setPointerCapture(e.pointerId); } catch { /* egal */ }
      zeiger.set(e.pointerId, posVon(e));
      if (e.pointerType === 'mouse') {
        if (e.button === 1 || (e.button === 0 && leertaste)) {
          e.preventDefault();
          modus = 'schieben';
          schieben = { ...posVon(e), id: e.pointerId };
        } else if (e.button === 0) {
          starteStrich(e);
        }
        return;
      }
      if (zeiger.size === 1) starteStrich(e);
      else if (zeiger.size === 2) { verwerfeStrich(); startePinch(); }
    }, { signal });

    leinwand.addEventListener('pointermove', (e) => {
      if (!zeiger.has(e.pointerId)) return;
      zeiger.set(e.pointerId, posVon(e));
      if (modus === 'malen' && vorschau?.id === e.pointerId) maleBis(e);
      else if (modus === 'schieben' && schieben?.id === e.pointerId) {
        const p = posVon(e);
        ansicht.ox += p.x - schieben.x;
        ansicht.oy += p.y - schieben.y;
        schieben.x = p.x; schieben.y = p.y;
        begrenze();
        zeichne();
      } else if (modus === 'pinch' && zeiger.size >= 2) bewegePinch();
    }, { signal });

    function zeigerEnde(e, abbruch) {
      if (!zeiger.has(e.pointerId)) return;
      zeiger.delete(e.pointerId);
      if (modus === 'malen' && vorschau?.id === e.pointerId) {
        if (abbruch) { verwerfeStrich(); modus = null; } else beendeStrich();
      } else if (modus === 'schieben' && schieben?.id === e.pointerId) {
        modus = null; schieben = null;
      } else if (modus === 'pinch' && zeiger.size < 2) {
        // restliche Finger malen nicht weiter, bis alle losgelassen sind
        modus = zeiger.size ? 'warten' : null;
        pinch = null;
      } else if (modus === 'warten' && !zeiger.size) modus = null;
    }
    leinwand.addEventListener('pointerup', (e) => zeigerEnde(e, false), { signal });
    leinwand.addEventListener('pointercancel', (e) => zeigerEnde(e, true), { signal });
    leinwand.addEventListener('lostpointercapture', (e) => zeigerEnde(e, false), { signal });
    leinwand.addEventListener('auxclick', (e) => e.preventDefault(), { signal });
    leinwand.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    leinwand.addEventListener('wheel', (e) => {
      if (!z || fertigZeigen) return;
      e.preventDefault();
      const p = posVon(e);
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomUm(Math.exp(Math.max(-1, Math.min(1, -d * 0.0018))), p.x, p.y);
    }, { signal, passive: false });
    leinwand.addEventListener('focus', () => zeichne(), { signal });
    leinwand.addEventListener('blur', () => { zeichne(); }, { signal });

    document.addEventListener('keyup', (e) => {
      if (e.key === ' ') leertaste = false;
      if (e.key === 'Shift' && tastenStrich) beendeTastenStrich();
    }, { signal });
    window.addEventListener('blur', () => { leertaste = false; if (tastenStrich) beendeTastenStrich(); }, { signal });

    // ---------- Tastatur ----------
    function beendeTastenStrich() {
      const t = tastenStrich;
      tastenStrich = null;
      if (t && t.felder.length) setzeZug(t.felder);
      else zeichne();
    }
    function nimmInTastenStrich(i) {
      if (L.malbar(z, i, gewaehlt) && !tastenStrich.menge.has(i)) { tastenStrich.menge.add(i); tastenStrich.felder.push(i); }
    }

    function bewegeCursor(e) {
      let x = cx, y = cy;
      if (e.key === 'ArrowLeft') x--;
      else if (e.key === 'ArrowRight') x++;
      else if (e.key === 'ArrowUp') y--;
      else y++;
      x = Math.max(0, Math.min(z.b - 1, x));
      y = Math.max(0, Math.min(z.h - 1, y));
      if (e.shiftKey) {
        if (!tastenStrich) tastenStrich = { felder: [], menge: new Set() };
        nimmInTastenStrich(cy * z.b + cx);
        nimmInTastenStrich(y * z.b + x);
      } else if (tastenStrich) beendeTastenStrich();
      cx = x; cy = y;
      cursorInSicht();
      sageCursor();
      zeichne();
    }

    // ---------- Erzeugen ----------
    function starteAnsicht() {
      vorschau = null;
      tastenStrich = null;
      markiert = -1;
      brichGewinnAb();
      gewaehlt = Math.max(0, L.naechsteOffeneFarbe(z, 0));
      const erstes = L.naechstesOffenes(z, gewaehlt, -1);
      cx = erstes >= 0 ? erstes % z.b : 0;
      cy = erstes >= 0 ? Math.floor(erstes / z.b) : 0;
      gebaut = '';
      leseFarben();
      zeigeAlles();
      passeGroesseAn();
      einpassen();
      zeigeAlles();
    }

    async function erzeuge(stufe) {
      const nr = ++erzeugung;
      z = null;
      brichGewinnAb();
      zeigeAlles();
      const bilder = await ladeBilder();
      if (zerstoert || nr !== erzeugung) return;
      const sid = L.STUFEN[stufe] ? stufe : 'klein';
      const gespeicherteNr = ctx.speicher.lies('naechstes', {});
      const daten = gespeicherteNr && typeof gespeicherteNr === 'object' && !Array.isArray(gespeicherteNr) ? { ...gespeicherteNr } : {};
      const n = Number.isInteger(daten[sid]) && daten[sid] >= 0 && daten[sid] < 1e7 ? daten[sid] : 0;
      daten[sid] = n + 1;
      ctx.speicher.schreibe('naechstes', daten);
      z = L.erzeugeSpiel({ stufe: sid, nr: n, seed: ctx.neuerSeed(), bilder });
      starteAnsicht();
    }

    // ---------- Größe, Thema, Palette ----------
    function passeGroesseAn() {
      const r = buehne.getBoundingClientRect();
      const w = Math.max(0, Math.floor(r.width)), hh = Math.max(0, Math.floor(r.height));
      const d = Math.min(3, window.devicePixelRatio || 1);
      if (w === breite && hh === hoehe && d === dpr) return;
      breite = w; hoehe = hh; dpr = d;
      leinwand.width = Math.max(1, Math.round(w * d));
      leinwand.height = Math.max(1, Math.round(hh * d));
      leinwand.style.width = `${w}px`;
      leinwand.style.height = `${hh}px`;
      if (z) {
        if (passt || fertigZeigen) einpassen();
        else { ansicht.s = Math.max(zelleFit(), Math.min(zelleMax(), ansicht.s)); begrenze(); aktualisiereZoomKnoepfe(); }
      }
      if (geplant) { cancelAnimationFrame(geplant); geplant = 0; }
      male();
    }
    const groesse = new ResizeObserver(() => passeGroesseAn());
    groesse.observe(buehne);
    const neuFaerben = () => { if (zerstoert) return; leseFarben(); if (z) zeigeAlles(); };
    const themaBeobachter = new MutationObserver(neuFaerben);
    themaBeobachter.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] });
    window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', neuFaerben, { signal });
    const abmelden = ctx.farben.beobachte(() => { gebaut = ''; neuFaerben(); });

    // ---------- Schnittstelle ----------
    const instanz = {
      getStand: () => (z ? L.zumSpeichern(z) : null),
      zusammenfassung: () => (z ? `${L.STUFEN[z.stufe].name} · ${z.titel} · noch ${L.restGesamt(z)} Felder` : ''),
      kannRueckgaengig: () => Boolean(z) && L.kannRueckgaengig(z),
      kannWiederholen: () => Boolean(z) && L.kannWiederholen(z),
      rueckgaengig() {
        if (!z) return;
        vorschau = null; tastenStrich = null; modus = modus === 'malen' ? null : modus;
        const v = L.rueckgaengig(z);
        if (!v) return;
        if (fertigZeigen) { brichGewinnAb(); }
        z = v;
        markiert = -1;
        aktualisiereLeiste();
        zeichne();
        ctx.meldeAenderung();
      },
      wiederholen() {
        if (!z || fertigZeigen) return;
        const v = L.wiederholen(z);
        if (!v) return;
        z = v;
        nachZug();
      },
      hinweis() {
        if (!z || fertigZeigen) return;
        const mx = (breite / 2 - ansicht.ox) / ansicht.s - 0.5, my = (hoehe / 2 - ansicht.oy) / ansicht.s - 0.5;
        const r = L.hinweis(z, gewaehlt, mx, my);
        if (!r || r.feld < 0) return;
        const wechsel = r.farbe !== gewaehlt;
        waehle(r.farbe);
        cx = r.feld % z.b; cy = Math.floor(r.feld / z.b);
        markiert = r.feld;
        tastatur = true;
        leinwand.focus({ preventScroll: true });
        zeigeFeld(r.feld);
        sageCursor();
        zeichne();
        if (wechsel) ctx.meldung(`Tipp: weiter mit Zahl ${nummer(r.farbe)}`);
      },
      neustart() {
        if (!z) return;
        z = L.neustart(z);
        starteAnsicht();
        ctx.meldeAenderung();
      },
      neu(variante) {
        brichGewinnAb();
        return erzeuge(variante ?? z?.stufe ?? ctx.variante);
      },
      onTaste(e) {
        if (e.ctrlKey || e.metaKey || e.altKey || !z || fertigZeigen) return false;
        const k = e.key;
        if (/^[0-9]$/.test(k)) {
          const idx = k === '0' ? 9 : Number(k) - 1;
          if (idx >= z.farben.length) return false;
          waehle(idx);
          return true;
        }
        if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
          // In der Farbleiste wandern die Pfeile nicht über das Bild
          if (!tastatur || document.activeElement !== leinwand) {
            tastatur = true;
            leinwand.focus({ preventScroll: true });
            cursorInSicht();
            sageCursor();
            zeichne();
            return true;
          }
          bewegeCursor(e);
          return true;
        }
        if (k === ' ' || k === 'Enter') {
          if (e.target instanceof Element && e.target.closest('button, a')) return false;
          if (k === ' ') { leertaste = true; if (e.repeat) return true; }
          if (document.activeElement === leinwand || tastatur) {
            tastatur = true;
            leinwand.focus({ preventScroll: true });
            setzeZug([cy * z.b + cx]);
            sageCursor();
            zeichne();
          }
          return true;
        }
        if (k === '+' || k === '=') { zoomMitte(1.4); return true; }
        if (k === '-') { zoomMitte(1 / 1.4); return true; }
        if (k === 'w' || k === 'W') { springe(); return true; }
        return false;
      },
      zerstoere() {
        if (gewinnTimer && fertigZeigen) meldeGewinn();
        zerstoert = true;
        clearTimeout(gewinnTimer);
        if (geplant) cancelAnimationFrame(geplant);
        groesse.disconnect();
        themaBeobachter.disconnect();
        abmelden();
        ac.abort();
        container.replaceChildren();
      },
    };

    passeGroesseAn();
    if (z) starteAnsicht();
    else erzeuge(ctx.variante);
    return instanz;
  },
};
