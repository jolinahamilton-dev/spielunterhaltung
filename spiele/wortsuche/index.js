// Wortsuche: versteckte Wörter zu einem Thema im Buchstabengitter finden.
// Bedienung: Ziehen vom ersten zum letzten Buchstaben · erst Anfang, dann Ende antippen ·
// Tastatur: Pfeile bewegen den Cursor, Enter/Leertaste setzt Anfang und Ende, Esc bricht ab.
import { h, s, ladeStil } from '../../kern/dom.js';
import * as L from './logik.js';

let woerterLaden = null;
/** woerter.json einmal laden */
function ladeThemen() {
  woerterLaden ??= fetch(new URL('./woerter.json', import.meta.url))
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const t = Array.isArray(d?.themen) ? d.themen.filter((x) => typeof x?.name === 'string' && Array.isArray(x.woerter)) : [];
      if (!t.length) throw new Error('Wortliste fehlt');
      return t;
    })
    .catch((f) => { woerterLaden = null; throw f; });
  return woerterLaden;
}

const KAPSEL = 0.78;   // Breite der Markierung in Zellen

let instanzZaehler = 0;

export default {
  id: 'wortsuche',
  name: 'Wortsuche',
  beschreibung: 'Versteckte Wörter im Buchstabengitter finden.',
  variantenTitel: 'Schwierigkeit',
  varianten: [
    { id: 'leicht', name: 'Leicht – 9 × 9, waagerecht und senkrecht' },
    { id: 'mittel', name: 'Mittel – 12 × 12, auch schräg' },
    { id: 'schwer', name: 'Schwer – 15 × 15, alle Richtungen' },
  ],
  standVersion: 1,

  erstelle(container, ctx, gespeichert) {
    ladeStil('spiele/wortsuche/stil.css');

    let z = null;
    try { z = gespeichert ? L.ausSpeicher(gespeichert) : null; } catch { z = null; }
    if (z && L.gewonnen(z)) z = null;

    const praefix = `ws${++instanzZaehler}-`;
    let anker = -1;          // gesetzter Anfang (Antippen/Tastatur)
    let zug = null;          // laufendes Ziehen { a, b }
    let cursor = 0;
    let blinken = false;     // Hinweis frisch gegeben → kurz hervorheben
    let erzeugung = 0;
    let zerstoert = false;
    let gebautN = 0;
    let zellen = [];
    let listeZu = Boolean(ctx.einstellungen.spiel.wert('listeZu', false));

    // ---------- DOM ----------
    const titelEl = h('span', { class: 'ws-titel' });
    const standEl = h('span', { class: 'ws-stand leise', role: 'status', 'aria-live': 'polite' });
    const linienEl = s('svg', { class: 'ws-linien', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
    const feldEl = h('div', {
      class: 'ws-feld', role: 'grid', tabindex: '0',
      'aria-roledescription': 'Buchstabengitter',
    });
    const ladenEl = h('p', { class: 'ws-laden leise', hidden: true, text: 'Rätsel wird vorbereitet …' });
    const rahmen = h('div', { class: 'ws-rahmen' }, linienEl, feldEl);
    const listeKnopf = h('button', {
      type: 'button', class: 'knopf klein ws-liste-knopf',
      on: { click: () => { listeZu = !listeZu; ctx.einstellungen.spiel.setze('listeZu', listeZu); zeichneListe(); } },
    });
    const listeEl = h('ul', { class: 'ws-liste', 'aria-label': 'Gesuchte Wörter' });
    const listeBereich = h('div', { class: 'ws-liste-bereich' }, listeKnopf, listeEl);
    const wurzel = h('div', { class: 'ws' },
      h('div', { class: 'ws-info' }, titelEl, standEl),
      rahmen, ladenEl, listeBereich,
    );
    container.append(wurzel);

    // ---------- Gitter ----------
    function baue() {
      if (gebautN === z.n && zellen.length === z.n * z.n) return;
      gebautN = z.n;
      rahmen.style.setProperty('--n', String(z.n));
      linienEl.setAttribute('viewBox', `0 0 ${z.n} ${z.n}`);
      zellen = [];
      const reihen = [];
      for (let r = 0; r < z.n; r++) {
        const reihe = h('div', { class: 'ws-reihe', role: 'row' });
        for (let c = 0; c < z.n; c++) {
          const el = h('span', { class: 'ws-zelle', role: 'gridcell', id: `${praefix}${r * z.n + c}` });
          zellen.push(el);
          reihe.append(el);
        }
        reihen.push(reihe);
      }
      feldEl.replaceChildren(...reihen);
      cursor = Math.min(cursor, z.n * z.n - 1);
    }

    const zr = (i) => Math.floor(i / z.n);
    const zc = (i) => i % z.n;

    /** Kapsel (abgerundetes Band) von Zelle a bis b */
    function kapsel(a, b, klasse, extra = {}) {
      const x1 = zc(a) + 0.5, y1 = zr(a) + 0.5;
      const dx = zc(b) - zc(a), dy = zr(b) - zr(a);
      const laenge = Math.hypot(dx, dy);
      const winkel = (Math.atan2(dy, dx) * 180) / Math.PI;
      return s('rect', {
        class: klasse, x: -KAPSEL / 2, y: -KAPSEL / 2, width: laenge + KAPSEL, height: KAPSEL,
        rx: KAPSEL / 2, ry: KAPSEL / 2, transform: `translate(${x1} ${y1}) rotate(${winkel})`, ...extra,
      });
    }
    const endenVon = (i) => { const zs = L.zellenVon(z.n, z.woerter[i]); return [zs[0], zs[zs.length - 1]]; };

    function zeichneLinien() {
      const teile = [];
      const muster = ctx.farben.musterAn();
      const anzahl = ctx.farben.anzahl || 1;
      z.gefunden.forEach((i) => {
        const [a, b] = endenVon(i);
        const f = i % anzahl;
        teile.push(kapsel(a, b, 'ws-fund', { style: { fill: ctx.farben.css(f) } }));
        if (muster) {
          teile.push(s('path', {
            class: 'ws-fund-symbol', d: ctx.farben.symbolPfad(f), 'fill-rule': 'evenodd',
            transform: `translate(${zc(a) + 0.04} ${zr(a) + 0.04}) scale(0.032)`,
          }));
        }
      });
      const hw = z.hinweis;
      if (hw && !L.istGefunden(z, hw.i)) {
        const [a, b] = endenVon(hw.i);
        const kl = `ws-tipp${blinken && !ctx.bewegungReduziert() ? ' ws-blink' : ''}`;
        if (hw.s === 1) teile.push(s('circle', { class: kl, cx: zc(a) + 0.5, cy: zr(a) + 0.5, r: KAPSEL / 2 }));
        else teile.push(kapsel(a, b, kl));
      }
      const auswahl = aktuelleAuswahl();
      if (auswahl) teile.push(kapsel(auswahl[0], auswahl[1], 'ws-auswahl'));
      else if (anker >= 0) teile.push(s('circle', { class: 'ws-auswahl', cx: zc(anker) + 0.5, cy: zr(anker) + 0.5, r: KAPSEL / 2 }));
      linienEl.replaceChildren(...teile);
      blinken = false;
    }

    /** Laufende Auswahl (Ziehen oder Anfang + Cursor in Linie) → [a, b] oder null */
    function aktuelleAuswahl() {
      if (zug) return zug.b !== zug.a ? [zug.a, zug.b] : null;
      if (anker >= 0 && cursor !== anker && tastaturAuswahl && L.linie(z.n, anker, cursor)) return [anker, cursor];
      return null;
    }
    let tastaturAuswahl = false;

    function zeichneZellen() {
      const imWort = new Set();
      z.gefunden.forEach((i) => L.zellenVon(z.n, z.woerter[i]).forEach((k) => imWort.add(k)));
      for (let i = 0; i < zellen.length; i++) {
        const el = zellen[i];
        if (el.textContent !== z.gitter[i]) el.textContent = z.gitter[i];
        el.classList.toggle('gefunden', imWort.has(i));
        el.classList.toggle('cursor', i === cursor);
        el.classList.toggle('anker', i === anker);
      }
      feldEl.setAttribute('aria-activedescendant', `${praefix}${cursor}`);
      const r = zr(cursor) + 1, c = zc(cursor) + 1;
      feldEl.setAttribute('aria-label',
        `Buchstabengitter ${z.n} mal ${z.n}. Cursor Zeile ${r}, Spalte ${c}: ${z.gitter[cursor]}`
        + `${anker >= 0 ? `. Anfang gesetzt bei Zeile ${zr(anker) + 1}, Spalte ${zc(anker) + 1}` : ''}`
        + '. Pfeiltasten bewegen, Enter setzt Anfang und Ende.');
    }

    function zeichneListe() {
      const anzahl = ctx.farben.anzahl || 1;
      const muster = ctx.farben.musterAn();
      const hw = z.hinweis && !L.istGefunden(z, z.hinweis.i) ? z.hinweis.i : -1;
      listeEl.replaceChildren(...L.listenReihenfolge(z).map((i) => {
        const g = L.istGefunden(z, i);
        const f = i % anzahl;
        return h('li', {
          class: `ws-wort${g ? ' gefunden' : ''}${i === hw ? ' tipp' : ''}`,
          'aria-label': `${z.woerter[i].w}${g ? ' – gefunden' : ''}${i === hw ? ' – Hinweis' : ''}`,
        },
        h('span', { class: 'ws-punkt', 'aria-hidden': 'true', style: g ? { background: ctx.farben.css(f) } : {} },
          g && muster ? s('svg', { viewBox: '0 0 10 10', class: 'ws-punkt-symbol' },
            s('path', { d: ctx.farben.symbolPfad(f), 'fill-rule': 'evenodd' })) : null),
        h('span', { class: 'ws-wort-text', text: z.woerter[i].w }));
      }));
      const gef = z.gefunden.length, alle = z.woerter.length;
      listeKnopf.replaceChildren(h('span', { text: `Wörter ${gef}/${alle}` }), h('span', { class: 'ws-pfeil', 'aria-hidden': 'true', text: listeZu ? '▸' : '▾' }));
      listeKnopf.setAttribute('aria-expanded', String(!listeZu));
      listeBereich.classList.toggle('zu', listeZu);
    }

    function zeichneInfo() {
      titelEl.textContent = `Level ${z.level} · ${z.thema}`;
      standEl.textContent = `${z.gefunden.length} von ${z.woerter.length} gefunden`;
    }

    function zeichne() {
      ladenEl.hidden = Boolean(z);
      rahmen.hidden = !z;
      listeBereich.hidden = !z;
      if (!z) { titelEl.textContent = ''; standEl.textContent = ''; return; }
      baue();
      zeichneInfo();
      zeichneZellen();
      zeichneLinien();
      zeichneListe();
    }

    /** Nur die Auswahl neu zeichnen (beim Ziehen) */
    function zeichneAuswahl() {
      zeichneLinien();
      for (let i = 0; i < zellen.length; i++) {
        zellen[i].classList.toggle('cursor', i === cursor);
        zellen[i].classList.toggle('anker', i === anker);
      }
    }

    // ---------- Spielzüge ----------
    function merkeGeloest() {
      const g = ctx.speicher.lies('geloest', {});
      const d = g && typeof g === 'object' && !Array.isArray(g) ? { ...g } : {};
      const bisher = Number.isInteger(d[z.stufe]) ? d[z.stufe] : 0;
      d[z.stufe] = Math.max(bisher, z.level);
      ctx.speicher.schreibe('geloest', d);
    }

    /** Auswahl a → b prüfen; falsche Auswahl verschwindet ruhig */
    function versuche(a, b) {
      if (!z || L.gewonnen(z) || a === b || !L.linie(z.n, a, b)) return;
      const i = L.findeWort(z, a, b);
      if (i < 0 || L.istGefunden(z, i)) return;
      z = L.markiere(z, i);
      const gewinn = L.gewonnen(z);
      if (gewinn) merkeGeloest();
      ctx.meldeAenderung();
      zeichne();
      if (gewinn) ctx.meldeGewonnen(`Thema: ${z.thema} · ${L.STUFEN[z.stufe].name}`);
    }

    /** Zelle antippen / Enter: erst Anfang, dann Ende */
    function waehle(i) {
      if (!z || L.gewonnen(z)) return;
      cursor = i;
      if (anker < 0) anker = i;
      else if (anker === i) anker = -1;
      else if (L.linie(z.n, anker, i)) { const a = anker; anker = -1; versuche(a, i); }
      else anker = i;
      zeichne();
    }

    // ---------- Zeiger ----------
    function zelleAus(e) {
      const r = feldEl.getBoundingClientRect();
      if (!r.width) return -1;
      const c = Math.floor(((e.clientX - r.left) / r.width) * z.n);
      const zz = Math.floor(((e.clientY - r.top) / r.height) * z.n);
      if (c < 0 || c >= z.n || zz < 0 || zz >= z.n) return -1;
      return zz * z.n + c;
    }

    /** Endzelle beim Ziehen: auf die 8 Richtungen eingerastet, im Gitter begrenzt */
    function einrasten(a, e) {
      const rect = feldEl.getBoundingClientRect();
      const zelle = rect.width / z.n;
      const dx = (e.clientX - rect.left) / zelle - (zc(a) + 0.5);
      const dy = (e.clientY - rect.top) / zelle - (zr(a) + 0.5);
      if (Math.hypot(dx, dy) < 0.5) return a;
      const k = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
      const dc = [1, 1, 0, -1, -1, -1, 0, 1][k];
      const dr = [0, 1, 1, 1, 0, -1, -1, -1][k];
      let schritte = Math.max(0, Math.round((dx * dc + dy * dr) / (dr * dr + dc * dc)));
      const r0 = zr(a), c0 = zc(a);
      const grenze = (p, d) => (d > 0 ? z.n - 1 - p : d < 0 ? p : Infinity);
      schritte = Math.min(schritte, grenze(r0, dr), grenze(c0, dc));
      return (r0 + schritte * dr) * z.n + c0 + schritte * dc;
    }

    const signal = ctx.signal;
    ctx.eingabe.ziehen(feldEl, {
      schwelle: 6, signal,
      start(e) {
        if (!z || L.gewonnen(z)) return false;
        const a = zelleAus(e);
        if (a < 0) return false;
        anker = -1;
        tastaturAuswahl = false;
        return (zug = { a, b: a });
      },
      bewege(e, d) {
        const b = einrasten(d.a, e);
        if (b === d.b) return;
        d.b = b;
        cursor = b;
        zeichneAuswahl();
      },
      ablegen(e, d) {
        const b = einrasten(d.a, e);
        zug = null;
        cursor = b;
        versuche(d.a, b);
        zeichne();
      },
      abbrechen() { zug = null; zeichne(); },
    });
    ctx.eingabe.zeiger(feldEl, {
      signal,
      tippen(e) {
        if (!z) return;
        const i = zelleAus(e);
        if (i < 0) return;
        tastaturAuswahl = false;
        waehle(i);
      },
    });
    feldEl.addEventListener('pointerdown', () => { tastaturAuswahl = false; }, { signal });

    // ---------- Erzeugen ----------
    async function erzeuge(stufe) {
      const nr = ++erzeugung;
      z = null;
      anker = -1;
      zug = null;
      ladenEl.textContent = 'Rätsel wird vorbereitet …';
      zeichne();
      let themen;
      try { themen = await ladeThemen(); } catch {
        if (!zerstoert && nr === erzeugung) { ladenEl.hidden = false; ladenEl.textContent = 'Die Wortliste konnte nicht geladen werden.'; }
        return;
      }
      if (zerstoert || nr !== erzeugung) return;
      const sid = L.STUFEN[stufe] ? stufe : 'leicht';
      const g = ctx.speicher.lies('geloest', {});
      const geloest = g && Number.isInteger(g[sid]) && g[sid] >= 0 && g[sid] < 1e6 ? g[sid] : 0;
      let neu = null;
      for (let v = 0; v < 3 && !neu; v++) {
        try { neu = L.erzeugeRaetsel({ stufe: sid, level: geloest + 1, seed: ctx.neuerSeed(), themen }); } catch { neu = null; }
      }
      if (!neu) { ladenEl.hidden = false; ladenEl.textContent = 'Das Rätsel konnte nicht erzeugt werden.'; return; }
      z = L.ausSpeicher(neu);
      cursor = Math.floor((z.n * z.n) / 2);
      zeichne();
    }

    // ---------- Schnittstelle ----------
    const instanz = {
      getStand: () => (z ? L.zumSpeichern(z) : null),
      zusammenfassung: () => (z ? `${L.STUFEN[z.stufe].name} · ${z.thema} · ${z.gefunden.length}/${z.woerter.length} Wörter` : ''),
      kannRueckgaengig: () => Boolean(z) && L.kannRueckgaengig(z),
      kannWiederholen: () => Boolean(z) && L.kannWiederholen(z),
      rueckgaengig() {
        if (!z || !L.kannRueckgaengig(z)) return;
        z = L.rueckgaengig(z);
        anker = -1;
        zeichne();
        ctx.meldeAenderung();
      },
      wiederholen() {
        if (!z || !L.kannWiederholen(z)) return;
        z = L.wiederholen(z);
        anker = -1;
        const gewinn = L.gewonnen(z);
        if (gewinn) merkeGeloest();
        zeichne();
        ctx.meldeAenderung();
        if (gewinn) ctx.meldeGewonnen(`Thema: ${z.thema} · ${L.STUFEN[z.stufe].name}`);
      },
      hinweis() {
        if (!z || L.gewonnen(z)) return;
        z = L.hinweis(z);
        blinken = true;
        zeichne();
        ctx.meldeAenderung();
        const w = z.woerter[z.hinweis.i];
        ctx.meldung(z.hinweis.s === 1 ? `Tipp: Hier beginnt ${w.w}` : `Tipp: ${w.w} ist umrahmt`);
      },
      neustart() {
        if (!z) return;
        z = L.neustart(z);
        anker = -1;
        zug = null;
        zeichne();
        ctx.meldeAenderung();
      },
      neu(variante) {
        return erzeuge(variante ?? z?.stufe ?? ctx.variante);
      },
      onTaste(e) {
        if (e.ctrlKey || e.metaKey || e.altKey || !z || L.gewonnen(z)) return false;
        const k = e.key;
        const pfeil = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
        if (pfeil || k === 'Home' || k === 'End') {
          // Pfeile bewegen immer den Gitter-Cursor (Pos1/Ende: Zeilenanfang/-ende, mit Umschalt: Ecke)
          let r = zr(cursor), c = zc(cursor);
          if (pfeil) { r += pfeil[0]; c += pfeil[1]; }
          else if (k === 'Home') { c = 0; if (e.shiftKey) r = 0; }
          else { c = z.n - 1; if (e.shiftKey) r = z.n - 1; }
          r = Math.max(0, Math.min(z.n - 1, r));
          c = Math.max(0, Math.min(z.n - 1, c));
          cursor = r * z.n + c;
          tastaturAuswahl = true;
          if (document.activeElement !== feldEl) feldEl.focus({ preventScroll: true });
          zeichneZellen();
          zeichneLinien();
          return true;
        }
        if (k === 'Enter' || k === ' ') {
          if (e.target instanceof Element && e.target !== feldEl && e.target.closest('button, a, summary')) return false;
          tastaturAuswahl = true;
          if (document.activeElement !== feldEl) feldEl.focus({ preventScroll: true });
          waehle(cursor);
          return true;
        }
        if (k === 'Escape' && anker >= 0) {
          anker = -1;
          zeichne();
          return true;
        }
        return false;
      },
      zerstoere() {
        zerstoert = true;
        abmelden();
        container.replaceChildren();
      },
    };

    const abmelden = ctx.farben.beobachte(() => { if (z) zeichne(); });

    if (z) { cursor = Math.floor((z.n * z.n) / 2); zeichne(); }
    else erzeuge(ctx.variante);
    return instanz;
  },
};
