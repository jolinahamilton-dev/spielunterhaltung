// Lichtstrahlen: Spiegel umschalten, bis jeder Strahl sein Ziel in der passenden Farbe trifft.
// Bedienung: Klick/Tippen auf einen Spiegel · Tastatur: Pfeile bewegen den Fokus, Enter/Leertaste schaltet um.
import { h, s, ladeStil } from '../../kern/dom.js';
import * as L from './logik.js';

const U = 10;                                   // Kantenlänge einer Zelle im SVG
const RICHTUNG = ['nach oben', 'nach rechts', 'nach unten', 'nach links'];
const STRICH = ['', '3 1.4', '1 1.5', '4.5 1.4 1 1.4', '2 2.6'];   // Strichmuster der Strahlen bei „Muster an“

export default {
  id: 'lichtstrahlen',
  name: 'Lichtstrahlen',
  beschreibung: 'Spiegel drehen, bis jeder Lichtstrahl sein Ziel trifft.',
  variantenTitel: 'Schwierigkeit',
  varianten: [
    { id: 'leicht', name: 'Leicht – 5 × 5, wenige Spiegel' },
    { id: 'mittel', name: 'Mittel – 7 × 7, mehrere Farben' },
    { id: 'schwer', name: 'Schwer – 9 × 9, Farbfilter' },
  ],
  standVersion: 1,

  erstelle(container, ctx, gespeichert) {
    ladeStil('spiele/lichtstrahlen/stil.css');

    let z = null;
    try { z = gespeichert ? L.ausSpeicher(gespeichert) : null; } catch { z = null; }
    if (z && L.gewonnen(z)) z = null;

    let gemeldet = false;
    let tipp = -1;                 // Feld des Hinweises
    let zerstoert = false;

    // ---------- DOM ----------
    const titelEl = h('span', { class: 'ls-titel' });
    const zaehlerEl = h('span', { class: 'ls-zaehler leise', role: 'status', 'aria-live': 'polite' });
    const svg = s('svg', { class: 'ls-svg', viewBox: '0 0 10 10', 'aria-hidden': 'true', focusable: 'false' });
    const ebeneHg = s('g');
    const ebeneStrahl = s('g');
    const ebeneElem = s('g');
    svg.append(ebeneHg, ebeneStrahl, ebeneElem);
    const gitter = h('div', { class: 'ls-gitter', role: 'group', 'aria-label': 'Spielfeld – Spiegel antippen zum Umschalten' });
    const feld = h('div', { class: 'ls-feld' }, svg, gitter);
    const wurzel = h('div', { class: 'ls' },
      h('div', { class: 'ls-info' }, titelEl, zaehlerEl),
      feld,
      h('p', { class: 'ls-hilfe leise', text: 'Tippe auf einen Spiegel, um ihn umzuschalten. Jedes Ziel braucht einen Strahl seiner Farbe.' }),
    );
    container.append(wurzel);

    let knoepfe = [];
    let gebaut = 0;
    let fokus = null;

    const farbName = (f) => ctx.farben.liste[f]?.name ?? `Farbe ${f + 1}`;

    // ---------- Aufbau ----------
    function baue() {
      if (gebaut === z.n) return;
      gebaut = z.n;
      const n = z.n;
      feld.style.setProperty('--n', String(n));
      svg.setAttribute('viewBox', `0 0 ${n * U} ${n * U}`);
      const linien = [];
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        linien.push(s('rect', { x: c * U + 0.35, y: r * U + 0.35, width: U - 0.7, height: U - 0.7, rx: 1.4, class: 'ls-boden' }));
      }
      ebeneHg.replaceChildren(...linien);
      fokus = ctx.eingabe.erstelleRasterFokus({
        zeilen: n, spalten: n, zeile: 0, spalte: 0,
        beiBewegung: (zr, sp) => setzeFokus(zr, sp, true),
      });
      knoepfe = Array.from({ length: n * n }, (_, i) => h('button', {
        type: 'button', class: 'ls-zelle', tabindex: i === 0 ? '0' : '-1',
        on: {
          click: () => { fokus.setze(Math.floor(i / n), i % n); tippe(i); },
          focus: () => { if (fokus && (fokus.zeile * n + fokus.spalte) !== i) { fokus.zeile = Math.floor(i / n); fokus.spalte = i % n; } rove(); },
        },
      }));
      gitter.replaceChildren(...knoepfe);
    }

    function rove() {
      if (!fokus) return;
      const aktiv = fokus.zeile * z.n + fokus.spalte;
      knoepfe.forEach((k, i) => k.setAttribute('tabindex', i === aktiv ? '0' : '-1'));
    }

    function setzeFokus(zr, sp, fokussieren) {
      rove();
      if (fokussieren) knoepfe[zr * z.n + sp]?.focus({ preventScroll: true });
    }

    // ---------- Zeichnen ----------
    const sym = (f, x, y, groesse, klasse) => s('path', {
      d: ctx.farben.symbolPfad(f), 'fill-rule': 'evenodd', class: klasse,
      transform: `translate(${(x - groesse / 2).toFixed(2)} ${(y - groesse / 2).toFixed(2)}) scale(${(groesse / 10).toFixed(3)})`,
    });

    function zeichneElement(i, b, g) {
      const n = z.n;
      const x = (i % n) * U, y = Math.floor(i / n) * U;
      const cx = x + 5, cy = y + 5;
      const muster = ctx.farben.musterAn();
      const zelle = g[i];
      if (!zelle) return null;
      if (zelle.t === 'b') {
        return s('g', { class: 'ls-block' },
          s('rect', { x: x + 1, y: y + 1, width: 8, height: 8, rx: 1.4, class: 'ls-block-flaeche' }),
          s('rect', { x: x + 2.6, y: y + 2.6, width: 4.8, height: 4.8, rx: 0.9, class: 'ls-block-kern' }));
      }
      if (zelle.t === 'q') {
        const q = z.quellen[zelle.k];
        return s('g', { class: 'ls-quelle' },
          s('rect', { x: x + 0.9, y: y + 0.9, width: 8.2, height: 8.2, rx: 2, class: 'ls-quelle-flaeche' }),
          s('polygon', { points: `${cx} ${y + 1.3} ${cx + 1.9} ${y + 3.4} ${cx - 1.9} ${y + 3.4}`, class: 'ls-pfeil', transform: `rotate(${90 * q.d} ${cx} ${cy})` }),
          s('circle', { cx, cy, r: 2.7, fill: ctx.farben.css(q.f), class: 'ls-quelle-kern' }),
          muster ? sym(q.f, cx, cy, 3.6, 'ls-sym') : null);
      }
      if (zelle.t === 'z') {
        const t = b.treffer[zelle.k];
        const klasse = t.richtig ? 'ls-ziel getroffen' : t.falsch ? 'ls-ziel falsch' : 'ls-ziel';
        return s('g', { class: klasse },
          s('circle', { cx, cy, r: 3.9, class: 'ls-ziel-ring', stroke: ctx.farben.css(zelle.f) }),
          s('circle', { cx, cy, r: 2.5, class: 'ls-ziel-kern', fill: t.richtig ? ctx.farben.css(zelle.f) : 'none', stroke: ctx.farben.css(zelle.f) }),
          muster ? sym(zelle.f, cx, cy, 3.4, t.richtig ? 'ls-sym' : 'ls-sym-hohl') : null);
      }
      if (zelle.t === 'f') {
        return s('g', { class: 'ls-filter' },
          s('rect', { x: x + 1.2, y: y + 1.2, width: 7.6, height: 7.6, rx: 1.6, fill: ctx.farben.css(zelle.f), class: 'ls-filter-flaeche' }),
          s('rect', { x: x + 1.2, y: y + 1.2, width: 7.6, height: 7.6, rx: 1.6, stroke: ctx.farben.css(zelle.f), class: 'ls-filter-rand' }),
          s('path', { d: `M${x + 3.2} ${y + 1.6}V${y + 8.4}M${x + 6.8} ${y + 1.6}V${y + 8.4}`, class: 'ls-filter-strich' }),
          muster ? sym(zelle.f, cx, cy, 3.4, 'ls-sym') : null);
      }
      // Spiegel
      const fest = Boolean(zelle.fest);
      const [x1, y1, x2, y2] = zelle.o === 0
        ? [x + 1.9, y + 8.1, x + 8.1, y + 1.9] : [x + 1.9, y + 1.9, x + 8.1, y + 8.1];
      return s('g', { class: fest ? 'ls-spiegel fest' : 'ls-spiegel dreh' },
        s('rect', { x: x + 0.9, y: y + 0.9, width: 8.2, height: 8.2, rx: 1.8, class: 'ls-fliese' }),
        s('line', { x1, y1, x2, y2, class: 'ls-glas' }),
        s('line', { x1, y1, x2, y2, class: 'ls-glanz' }),
        fest
          ? [s('circle', { cx: x1, cy: y1, r: 0.6, class: 'ls-niete' }), s('circle', { cx: x2, cy: y2, r: 0.6, class: 'ls-niete' })]
          : s('circle', { cx, cy, r: 1, class: 'ls-griff' }));
    }

    function zeichneStrahlen(b) {
      const muster = ctx.farben.musterAn();
      const teile = [];
      for (const st of b.strahlen) {
        for (const seg of st.segs) {
          const pts = seg.pts.map(([px, py]) => `${(px * U).toFixed(2)},${(py * U).toFixed(2)}`).join(' ');
          teile.push(s('polyline', { points: pts, class: 'ls-halo' }));
        }
      }
      for (const st of b.strahlen) {
        for (const seg of st.segs) {
          const pts = seg.pts.map(([px, py]) => `${(px * U).toFixed(2)},${(py * U).toFixed(2)}`).join(' ');
          const strich = muster ? STRICH[seg.f % STRICH.length] : '';
          teile.push(s('polyline', {
            points: pts, class: strich ? 'ls-strahl gestrichelt' : 'ls-strahl',
            stroke: ctx.farben.css(seg.f), 'stroke-dasharray': strich || null,
          }));
        }
      }
      ebeneStrahl.replaceChildren(...teile);
    }

    function beschreibe(i, b, g) {
      const n = z.n;
      const ort = `Zeile ${Math.floor(i / n) + 1}, Spalte ${(i % n) + 1}`;
      const zelle = g[i];
      if (!zelle) return `${ort}: leer`;
      if (zelle.t === 'b') return `${ort}: Hindernis`;
      if (zelle.t === 'q') { const q = z.quellen[zelle.k]; return `${ort}: Lichtquelle ${farbName(q.f)}, strahlt ${RICHTUNG[q.d]}`; }
      if (zelle.t === 'z') {
        const t = b.treffer[zelle.k];
        return `${ort}: Ziel ${farbName(zelle.f)}, ${t.richtig ? 'getroffen' : t.falsch ? 'falsche Farbe' : 'noch nicht getroffen'}`;
      }
      if (zelle.t === 'f') return `${ort}: Farbfilter ${farbName(zelle.f)}`;
      const lage = zelle.o === 0 ? 'steigt nach rechts' : 'fällt nach rechts';
      return zelle.fest
        ? `${ort}: fester Spiegel, ${lage}`
        : `${ort}: Spiegel, ${lage} – antippen zum Umschalten${i === tipp ? ' – Tipp: dieser Spiegel steht falsch' : ''}`;
    }

    function zeichne() {
      const aktiv = Boolean(z);
      wurzel.hidden = !aktiv;
      if (!z) return;
      baue();
      const b = L.berechne(z);
      const g = L.raster(z);
      const elem = [];
      for (let i = 0; i < g.length; i++) {
        const e = zeichneElement(i, b, g);
        if (e) elem.push(e);
      }
      if (tipp >= 0) {
        const n = z.n;
        elem.push(s('rect', { x: (tipp % n) * U + 0.5, y: Math.floor(tipp / n) * U + 0.5, width: U - 1, height: U - 1, rx: 1.8, class: 'ls-tipp' }));
      }
      ebeneElem.replaceChildren(...elem);
      zeichneStrahlen(b);
      knoepfe.forEach((k, i) => {
        k.setAttribute('aria-label', beschreibe(i, b, g));
        k.classList.toggle('dreh', g[i]?.t === 'm' && !g[i].fest);
        k.classList.toggle('ls-tipp-knopf', i === tipp);
      });
      rove();
      titelEl.textContent = `Level ${z.level} · ${L.STUFEN[z.stufe].name}`;
      zaehlerEl.textContent = b.gewonnen ? 'Alle Ziele getroffen' : `${b.erfuellt} von ${z.ziele.length} Zielen getroffen`;
      wurzel.classList.toggle('ls-fertig', b.gewonnen);
      feld.setAttribute('aria-label', `Lichtstrahlen, ${z.n} mal ${z.n} Felder, ${b.erfuellt} von ${z.ziele.length} Zielen getroffen`);
    }

    // ---------- Aktionen ----------
    function pruefeGewinn() {
      if (!z || gemeldet || !L.gewonnen(z)) return;
      gemeldet = true;
      const g = ctx.speicher.lies('geloest', {});
      const daten = g && typeof g === 'object' && !Array.isArray(g) ? { ...g } : {};
      const bisher = Number.isInteger(daten[z.stufe]) ? daten[z.stufe] : 0;
      daten[z.stufe] = Math.max(bisher, z.level);
      ctx.speicher.schreibe('geloest', daten);
      ctx.meldeGewonnen(`Level ${z.level} · ${L.STUFEN[z.stufe].name}`);
    }

    function uebernimm(neu) {
      z = neu;
      tipp = -1;
      zeichne();
      ctx.meldeAenderung();
      pruefeGewinn();
    }

    function tippe(i) {
      if (!z || gemeldet) return;
      const k = z.spiegel.findIndex((m) => m.i === i);
      if (k < 0) return;
      const neu = L.dreh(z, k);
      if (neu) uebernimm(neu);
    }

    function erzeuge(stufe) {
      const sid = L.STUFEN[stufe] ? stufe : 'leicht';
      const g = ctx.speicher.lies('geloest', {});
      const geloest = g && Number.isInteger(g[sid]) && g[sid] >= 0 && g[sid] < 1e6 ? g[sid] : 0;
      gemeldet = false;
      tipp = -1;
      z = L.erzeugeLevel({ stufe: sid, level: geloest + 1, seed: ctx.neuerSeed() });
      zeichne();
    }

    // ---------- Schnittstelle ----------
    const instanz = {
      getStand: () => (z ? L.zumSpeichern(z) : null),
      zusammenfassung: () => (z ? `${L.STUFEN[z.stufe].name} · Level ${z.level} · ${L.berechne(z).erfuellt}/${z.ziele.length} Ziele` : ''),
      kannRueckgaengig: () => Boolean(z) && !gemeldet && L.kannRueckgaengig(z),
      kannWiederholen: () => Boolean(z) && !gemeldet && L.kannWiederholen(z),
      rueckgaengig() {
        if (!z || gemeldet) return;
        const v = L.rueckgaengig(z);
        if (v) uebernimm(v);
      },
      wiederholen() {
        if (!z || gemeldet) return;
        const v = L.wiederholen(z);
        if (v) uebernimm(v);
      },
      hinweis() {
        if (!z || gemeldet) return;
        const hw = L.hinweis(z);
        if (!hw) { ctx.meldung('Kein falscher Spiegel gefunden.'); return; }
        tipp = hw.i;
        zeichne();
        const zr = Math.floor(hw.i / z.n), sp = hw.i % z.n;
        fokus?.setze(zr, sp);
        knoepfe[hw.i]?.focus({ preventScroll: true });
        ctx.meldung(`Tipp: Der Spiegel in Zeile ${zr + 1}, Spalte ${sp + 1} steht falsch.`);
      },
      neustart() {
        if (!z) return;
        gemeldet = false;
        z = L.neustart(z);
        tipp = -1;
        zeichne();
        ctx.meldeAenderung();
      },
      neu(variante) {
        erzeuge(variante ?? z?.stufe ?? ctx.variante);
      },
      onTaste(e) {
        if (e.ctrlKey || e.metaKey || e.altKey || !z) return false;
        const ziel = e.target instanceof Element ? e.target : null;
        const imFeld = !ziel || ziel === document.body || ziel === document.documentElement || wurzel.contains(ziel);
        if (!imFeld) return false;
        if (e.key.startsWith('Arrow') && fokus) {
          if (!wurzel.contains(ziel)) { knoepfe[fokus.zeile * z.n + fokus.spalte]?.focus({ preventScroll: true }); }
          return fokus.taste(e);
        }
        if ((e.key === 'Enter' || e.key === ' ') && !(ziel && ziel.closest('button'))) {
          if (fokus) { tippe(fokus.zeile * z.n + fokus.spalte); return true; }
        }
        return false;
      },
      zerstoere() {
        zerstoert = true;
        abmelden();
        container.replaceChildren();
      },
    };

    const abmelden = ctx.farben.beobachte(() => { if (z && !zerstoert) zeichne(); });

    if (z) zeichne();
    else erzeuge(ctx.variante);
    return instanz;
  },
};
