// Stau auflösen: Fahrzeuge verschieben, bis das Zielfahrzeug hinaus kann (Klassisch),
// oder alle Fahrzeuge in Pfeilrichtung ausparken (Ausparken).
// Bedienung: Ziehen/Wischen · Fahrzeug anklicken + Zielfeld anklicken · Tastatur Tab/Pfeile/Pos1/Ende/Enter/Esc.
import { h, s, ladeStil } from '../../kern/dom.js';
import { erstelleWorker } from '../../kern/worker-helfer.js';
import { SYMBOLE } from '../../kern/farben.js';
import * as L from './logik.js';

const Z = 100;          // Feldgröße in SVG-Einheiten
const RAND = 14;        // Rahmen um das Feld
const AUSGANG = 46;     // Platz rechts für den Ausgang (Klassisch)
const DAUER = 200;      // ms, Schieben/Ausfahren (≤ 250)
const PFEIL = 'M1 3.8h4.6V1.2L9.6 5 5.6 8.8V6.2H1Z';
const WORKER = 'spiele/stau/generator.worker.js';

const plural = (n, eins, mehr) => `${n} ${n === 1 ? eins : mehr}`;
const ganzZahl = (v) => Number.isInteger(v) && v >= 0 && v < 1e9;

export default {
  id: 'stau',
  name: 'Stau auflösen',
  beschreibung: 'Fahrzeuge verschieben, bis der Weg frei ist.',
  varianten: [
    { id: 'leicht', name: 'Leicht' },
    { id: 'mittel', name: 'Mittel' },
    { id: 'schwer', name: 'Schwer' },
    { id: 'ausparken', name: 'Ausparken – alle Fahrzeuge hinausfahren' },
  ],
  standVersion: 1,

  erstelle(container, ctx, gespeichert) {
    ladeStil('spiele/stau/stil.css');
    const { signal } = ctx;
    const worker = ctx.worker(WORKER);
    // Vorab-Erzeugung des nächsten Levels über einen eigenen Worker (ohne „wird vorbereitet“-Anzeige)
    let vorab = null;
    const vorabWorker = () => (vorab ||= erstelleWorker(new URL(WORKER, document.baseURI), { signal }));

    let z = null;            // Spielzustand aus logik.js
    let auswahl = -1;        // gewähltes Fahrzeug
    let vorherAuswahl = -1;  // Auswahl beim pointerdown (für Klick-Klick)
    let hinweisZug = null;   // { i, nach } bzw. Ausparken { i, nach: null }
    let zug = null;          // laufendes Ziehen
    let sperre = false;      // während Gewinn-Animation
    let aktiv = true;
    let auftrag = 0;         // zählt Neu-Anfragen (veraltete Antworten verwerfen)
    const timer = new Set();
    const spaeter = (fn, ms) => { const t = setTimeout(() => { timer.delete(t); if (aktiv) fn(); }, ms); timer.add(t); };
    const ruhig = () => ctx.bewegungReduziert();

    // ---------- DOM ----------
    const titelEl = h('span', { class: 'st-titel' });
    const zaehlerEl = h('span', { class: 'st-zaehler', 'aria-live': 'polite' });
    const svg = s('svg', { class: 'st-feld', role: 'group' });
    const statusEl = h('p', { class: 'st-status leise', 'aria-live': 'polite' });
    const wurzel = h('div', { class: 'st' },
      h('div', { class: 'st-info' }, titelEl, zaehlerEl),
      svg,
      statusEl,
    );
    container.append(wurzel);

    let marken = null;       // SVG-Gruppe für Zielfelder und Hinweis-Schatten
    let fzEls = [];          // je Fahrzeug { g, rahmen }

    // ---------- Fortschritt und Level ----------
    function naechsteNr(variante) {
      const f = ctx.speicher.lies('fortschritt', {}) || {};
      const nr = (ganzZahl(f[variante]) ? f[variante] : 0) + 1;
      ctx.speicher.schreibe('fortschritt', { ...f, [variante]: nr });
      return nr;
    }

    async function holeLevel(variante, nr) {
      const vorrat = ctx.speicher.lies('vorrat', {}) || {};
      const v = vorrat[variante];
      if (v && v.nr === nr) {
        const l = L.pruefeLevel(v);
        delete vorrat[variante];
        ctx.speicher.schreibe('vorrat', vorrat);
        if (l) return l;
      }
      return L.pruefeLevel(await worker.rufe('erzeuge', { variante, nr }));
    }

    function bereiteVor(variante, nr) {
      const vorrat = ctx.speicher.lies('vorrat', {}) || {};
      if (vorrat[variante]?.nr === nr) return;
      vorabWorker().rufe('erzeuge', { variante, nr }).then((l) => {
        if (!aktiv) return;
        const v = ctx.speicher.lies('vorrat', {}) || {};
        v[variante] = l;
        ctx.speicher.schreibe('vorrat', v);
      }).catch(() => {});
    }

    async function starteLevel(variante) {
      const v = L.VARIANTEN.includes(variante) ? variante : 'leicht';
      const meins = ++auftrag;
      z = null;
      auswahl = -1; hinweisZug = null; sperre = false;
      svg.replaceChildren();
      titelEl.textContent = L.VARIANTEN_NAME[v];
      zaehlerEl.textContent = '';
      statusEl.textContent = '';
      const nr = naechsteNr(v);
      try {
        const level = await holeLevel(v, nr);
        if (!aktiv || meins !== auftrag) return;
        if (!level) throw new Error('Ungültiges Level');
        z = L.neuesSpiel(level);
        aufbauen();
        bereiteVor(v, nr + 1);
      } catch (f) {
        if (f?.name !== 'AbortError' && aktiv) { console.error(f); statusEl.textContent = 'Das Level konnte nicht erzeugt werden.'; }
      }
    }

    // ---------- Darstellung ----------
    const ausparken = () => L.istAusparken(z);
    const breiteSvg = () => z.level.breite * Z + 2 * RAND + (ausparken() ? 0 : AUSGANG);
    const hoeheSvg = () => z.level.hoehe * Z + 2 * RAND;

    function symbol(pfad, x, y, groesse, klasse, drehung = 0) {
      const k = groesse / 10;
      return s('path', {
        d: pfad, class: klasse, 'fill-rule': 'evenodd',
        transform: `translate(${x} ${y}) rotate(${drehung}) scale(${k}) translate(-5 -5)`,
      });
    }

    function fahrzeugEl(f, i) {
      const w = (f.achse === 'h' ? f.laenge : 1) * Z;
      const hh = (f.achse === 'v' ? f.laenge : 1) * Z;
      const g = s('g', { class: `st-fz${f.ziel ? ' st-ziel' : ''}`, tabindex: '0', role: 'button', dataset: { i } });
      g.append(s('rect', { class: 'st-koerper', x: 6, y: 6, width: w - 12, height: hh - 12, rx: 20, fill: ctx.farben.css(f.farbe) }));
      // Dach / Ladefläche andeuten
      if (f.laenge === 3) {
        const kab = Z - 28;
        const vorne = f.achse === 'h' ? (f.pfeil === -1 ? 'links' : 'rechts') : (f.pfeil === -1 ? 'oben' : 'unten');
        const [kx, ky] = f.achse === 'h' ? [vorne === 'rechts' ? w - 14 - kab : 14, 18] : [18, vorne === 'unten' ? hh - 14 - kab : 14];
        const [kw, kh] = f.achse === 'h' ? [kab, hh - 36] : [w - 36, kab];
        g.append(s('rect', { class: 'st-dach', x: kx, y: ky, width: kw, height: kh, rx: 10 }));
        const [lx, ly, lw, lh] = f.achse === 'h'
          ? [vorne === 'rechts' ? 16 : 14 + kab + 10, 22, w - kab - 40, hh - 44]
          : [22, vorne === 'unten' ? 16 : 14 + kab + 10, w - 44, hh - kab - 40];
        g.append(s('rect', { class: 'st-ladung', x: lx, y: ly, width: lw, height: lh, rx: 6 }));
      } else {
        g.append(s('rect', { class: 'st-dach', x: f.achse === 'h' ? 30 : 20, y: f.achse === 'h' ? 20 : 30, width: f.achse === 'h' ? w - 60 : w - 40, height: f.achse === 'h' ? hh - 40 : hh - 60, rx: 12 }));
      }
      const cx = w / 2, cy = hh / 2;
      if (f.ziel) {
        g.append(symbol(SYMBOLE.stern, cx, cy, 58, 'st-stern'));
      } else if (f.pfeil) {
        const dreh = f.achse === 'h' ? (f.pfeil > 0 ? 0 : 180) : (f.pfeil > 0 ? 90 : 270);
        g.append(symbol(PFEIL, cx, cy, 56, 'st-pfeil', dreh));
        if (ctx.farben.musterAn()) {
          const [sx, sy] = f.achse === 'h' ? [f.pfeil > 0 ? 34 : w - 34, cy] : [cx, f.pfeil > 0 ? 34 : hh - 34];
          g.append(symbol(ctx.farben.symbolPfad(f.farbe), sx, sy, 26, 'st-symbol'));
        }
      } else if (ctx.farben.musterAn()) {
        g.append(symbol(ctx.farben.symbolPfad(f.farbe), cx, cy, 40, 'st-symbol'));
      }
      const rahmen = s('rect', { class: 'st-rahmen', x: 2, y: 2, width: w - 4, height: hh - 4, rx: 24 });
      g.append(rahmen);
      g.addEventListener('focus', () => { if (auswahl !== i) { auswahl = i; zeichne(); } }, { signal });
      return { g, rahmen };
    }

    function aufbauen() {
      const { breite: B, hoehe: H } = z.level;
      const bw = breiteSvg(), bh = hoeheSvg();
      svg.setAttribute('viewBox', `${-RAND} ${-RAND} ${bw} ${bh}`);
      svg.style.setProperty('--verh', String(bw / bh));
      svg.setAttribute('aria-label', ausparken()
        ? `Parkplatz ${B} mal ${H}. Fahrzeug wählen und mit Enter ausparken.`
        : `Parkplatz ${B} mal ${H}, Ausgang rechts in Zeile ${z.level.ausgangZeile + 1}. Fahrzeug wählen und mit den Pfeiltasten verschieben.`);
      const teile = [
        s('rect', { class: 'st-rand', x: -RAND, y: -RAND, width: B * Z + 2 * RAND, height: bh, rx: 22 }),
        s('rect', { class: 'st-boden', x: 0, y: 0, width: B * Z, height: H * Z, rx: 10 }),
      ];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < B; x++) teile.push(s('rect', { class: 'st-platz', x: x * Z + 5, y: y * Z + 5, width: Z - 10, height: Z - 10, rx: 12 }));
      }
      if (!ausparken()) {
        const ay = z.level.ausgangZeile * Z;
        teile.push(s('rect', { class: 'st-boden', x: B * Z - 10, y: ay + 4, width: RAND + 20, height: Z - 8 }));
        teile.push(s('rect', { class: 'st-ausgang', x: B * Z + RAND, y: ay + 4, width: AUSGANG - RAND, height: Z - 8, rx: 10 }));
        teile.push(symbol(PFEIL, B * Z + RAND + (AUSGANG - RAND) / 2, ay + Z / 2, 26, 'st-ausgang-pfeil'));
      }
      marken = s('g', { class: 'st-marken', 'aria-hidden': 'true' });
      fzEls = z.level.fahrzeuge.map(fahrzeugEl);
      svg.replaceChildren(...teile, marken, ...fzEls.map((e) => e.g));
      titelEl.textContent = `${L.VARIANTEN_NAME[z.level.variante]} · Level ${z.level.nr}`;
      zeichne();
    }

    function setzeLage(i, p) {
      const f = z.level.fahrzeuge[i];
      const x = f.achse === 'h' ? p : f.x, y = f.achse === 'h' ? f.y : p;
      fzEls[i].g.style.transform = `translate(${x * Z}px, ${y * Z}px)`;
    }

    function beschreibung(f, i) {
      const art = f.ziel ? 'Zielfahrzeug' : f.laenge === 3 ? 'Laster' : 'Auto';
      const p = z.pos[i];
      const x = f.achse === 'h' ? p : f.x, y = f.achse === 'h' ? f.y : p;
      let t = `${art} ${f.achse === 'h' ? 'waagerecht' : 'senkrecht'}, Zeile ${y + 1}, Spalte ${x + 1}`;
      if (f.pfeil) t += `, fährt nach ${f.achse === 'h' ? (f.pfeil > 0 ? 'rechts' : 'links') : (f.pfeil > 0 ? 'unten' : 'oben')}`;
      if (!ctx.farben.musterAn()) return t;
      return `${t}, ${ctx.farben.liste[f.farbe]?.name ?? ''}`;
    }

    function zeichne() {
      if (!z) return;
      z.level.fahrzeuge.forEach((f, i) => {
        const { g } = fzEls[i];
        if ((!zug || zug.i !== i) && !g.classList.contains('st-faehrt') && !g.classList.contains('st-federt')) setzeLage(i, z.pos[i]);
        const draussen = Boolean(z.draussen[i]);
        g.classList.toggle('st-draussen', draussen && !g.classList.contains('st-faehrt'));
        g.classList.toggle('st-gewaehlt', auswahl === i);
        g.classList.toggle('st-hinweis', hinweisZug?.i === i);
        g.setAttribute('tabindex', draussen ? '-1' : '0');
        g.setAttribute('aria-hidden', draussen ? 'true' : 'false');
        g.setAttribute('aria-label', beschreibung(f, i) + (auswahl === i ? ', gewählt' : ''));
      });
      zeichneMarken();
      if (ausparken()) {
        zaehlerEl.textContent = `Ausgeparkt ${L.ausgeparkt(z)}/${z.level.fahrzeuge.length}`;
        statusEl.textContent = 'Fahrzeug antippen – es fährt in Pfeilrichtung hinaus, wenn der Weg frei ist.';
      } else {
        zaehlerEl.textContent = `Züge: ${L.zugZahl(z)} · bestmöglich: ${z.level.optimum}`;
        statusEl.textContent = 'Den Stern-Wagen zum Ausgang rechts bringen.';
      }
    }

    function zeichneMarken() {
      const teile = [];
      if (hinweisZug && hinweisZug.nach !== null && !ausparken()) {
        const f = z.level.fahrzeuge[hinweisZug.i];
        const x = f.achse === 'h' ? hinweisZug.nach : f.x, y = f.achse === 'h' ? f.y : hinweisZug.nach;
        const w = (f.achse === 'h' ? f.laenge : 1) * Z, hh = (f.achse === 'v' ? f.laenge : 1) * Z;
        teile.push(s('rect', { class: 'st-schatten', x: x * Z + 8, y: y * Z + 8, width: w - 16, height: hh - 16, rx: 18 }));
      }
      if (auswahl >= 0 && !ausparken() && !zug && !z.gewonnen) {
        const f = z.level.fahrzeuge[auswahl];
        const { min, max } = L.spielraum(z.level, z.pos, auswahl);
        const p = z.pos[auswahl];
        for (let q = min; q <= max + f.laenge - 1; q++) {
          if (q >= p && q < p + f.laenge) continue;
          const x = f.achse === 'h' ? q : f.x, y = f.achse === 'h' ? f.y : q;
          teile.push(s('circle', { class: 'st-ziel-punkt', cx: x * Z + Z / 2, cy: y * Z + Z / 2, r: 9 }));
        }
      }
      marken.replaceChildren(...teile);
    }

    // ---------- Aktionen ----------
    function waehle(i, { fokus = true } = {}) {
      auswahl = i;
      if (i >= 0 && fokus) fzEls[i].g.focus({ preventScroll: true });
      zeichne();
    }

    function schiebe(i, nach) {
      if (!z || sperre || z.gewonnen) return false;
      const neu = L.schiebe(z, i, nach);
      if (!neu) { zeichne(); return false; }
      z = neu;
      hinweisZug = null;
      zeichne();
      ctx.meldeAenderung();
      if (z.gewonnen) gewinnKlassisch();
      return true;
    }

    function gewinnKlassisch() {
      sperre = true;
      auswahl = -1;
      const i = L.zielIndex(z.level);
      const text = `Level ${z.level.nr} · ${plural(L.zugZahl(z), 'Zug', 'Züge')} · bestmöglich: ${z.level.optimum}`
        + (L.zugZahl(z) <= z.level.optimum ? ' – optimal!' : '');
      const fertig = () => { sperre = false; ctx.meldeGewonnen(text); };
      if (ruhig()) { fertig(); return; }
      const g = fzEls[i].g;
      g.classList.add('st-faehrt');
      requestAnimationFrame(() => {
        g.style.transform = `translate(${(z.level.breite + 1.5) * Z}px, ${z.level.ausgangZeile * Z}px)`;
        spaeter(fertig, DAUER + 30);
      });
    }

    function parkeAus(i) {
      if (!z || sperre || z.gewonnen || z.draussen[i]) return;
      const r = L.fahreAus(z, i);
      if (!r) return;
      z = r.zustand;
      hinweisZug = null;
      const f = z.level.fahrzeuge[i];
      const { g } = fzEls[i];
      if (!r.frei) {
        // bis kurz vor das Hindernis und zurückfedern – Zustand bleibt
        const b = fzEls[r.blocker].g;
        b.classList.add('st-blockiert');
        spaeter(() => b.classList.remove('st-blockiert'), 700);
        if (!ruhig()) {
          g.classList.add('st-federt');
          setzeLage(i, r.stopp + (f.pfeil > 0 ? 0.12 : -0.12));
          spaeter(() => { g.classList.remove('st-federt'); setzeLage(i, z.pos[i]); }, DAUER / 2 + 30);
        }
        ctx.meldung('Der Weg ist versperrt.');
        zeichne();
        ctx.meldeAenderung();
        return;
      }
      if (auswahl === i) auswahl = -1;
      const naechstes = naechstesFahrzeug(i);
      if (!ruhig()) {
        g.classList.add('st-faehrt');
        const grenze = f.achse === 'h' ? z.level.breite : z.level.hoehe;
        setzeLage(i, f.pfeil > 0 ? grenze + 0.3 : -f.laenge - 0.3);
        spaeter(() => { g.classList.remove('st-faehrt'); zeichne(); }, DAUER + 30);
      }
      zeichne();
      if (!L.geloest(z) && naechstes >= 0 && document.activeElement === g) waehle(naechstes);
      ctx.meldeAenderung();
      if (z.gewonnen) {
        const text = `Level ${z.level.nr} · ${plural(z.level.fahrzeuge.length, 'Fahrzeug', 'Fahrzeuge')} ausgeparkt`;
        if (ruhig()) ctx.meldeGewonnen(text);
        else { sperre = true; spaeter(() => { sperre = false; ctx.meldeGewonnen(text); }, DAUER + 40); }
      }
    }

    // Nächstes Fahrzeug in Lesereihenfolge (für den Fokus nach dem Ausparken)
    function naechstesFahrzeug(i) {
      const n = z.level.fahrzeuge.length;
      for (let k = 1; k < n; k++) { const j = (i + k) % n; if (!z.draussen[j]) return j; }
      return -1;
    }

    function mitte(i) {
      const f = z.level.fahrzeuge[i];
      const p = z.pos[i];
      const x = f.achse === 'h' ? p + f.laenge / 2 : f.x + 0.5;
      const y = f.achse === 'h' ? f.y + 0.5 : p + f.laenge / 2;
      return [x, y];
    }

    /** Fahrzeug in Pfeilrichtung wechseln (dx, dy ∈ −1…1) */
    function wechsle(von, dx, dy) {
      const [ax, ay] = mitte(von);
      let best = -1, bestWert = Infinity;
      z.level.fahrzeuge.forEach((f, j) => {
        if (j === von || z.draussen[j]) return;
        const [bx, by] = mitte(j);
        const vorwaerts = (bx - ax) * dx + (by - ay) * dy;
        if (vorwaerts <= 0.25) return;
        const quer = Math.abs((bx - ax) * dy) + Math.abs((by - ay) * dx);
        const wert = vorwaerts + 2 * quer;
        if (wert < bestWert) { bestWert = wert; best = j; }
      });
      if (best >= 0) waehle(best);
    }

    function standardFahrzeug() {
      if (!ausparken()) return L.zielIndex(z.level);
      return z.draussen.findIndex((d) => !d);
    }

    // ---------- Zeiger: Ziehen, Wischen, Klick-Klick, Antippen ----------
    function svgPunkt(e) {
      const m = svg.getScreenCTM();
      if (!m) return { x: 0, y: 0 };
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      return { x: p.x / Z, y: p.y / Z };
    }
    const fahrzeugVon = (ziel) => {
      const g = ziel?.closest?.('.st-fz');
      return g && svg.contains(g) ? Number(g.dataset.i) : -1;
    };

    svg.addEventListener('pointerdown', () => { vorherAuswahl = auswahl; }, { signal, capture: true });

    ctx.eingabe.ziehen(svg, {
      signal,
      schwelle: 5,
      start(e) {
        if (!z || sperre || z.gewonnen || ausparken()) return false;
        const i = fahrzeugVon(e.target);
        if (i < 0) return false;
        const f = z.level.fahrzeuge[i];
        const p0 = svgPunkt(e);
        const raum = L.spielraum(z.level, z.pos, i);
        auswahl = i;
        hinweisZug = null;
        zug = { i, f, start: z.pos[i], p0, raum, wert: z.pos[i], proben: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }] };
        fzEls[i].g.classList.add('st-zieht');
        zeichne();
        return zug;
      },
      bewege(e, d) {
        const p = svgPunkt(e);
        const delta = d.f.achse === 'h' ? p.x - d.p0.x : p.y - d.p0.y;
        d.wert = Math.max(d.raum.min, Math.min(d.raum.max, d.start + delta));
        setzeLage(d.i, d.wert);
        d.proben.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
        if (d.proben.length > 6) d.proben.shift();
      },
      ablegen(e, d) {
        fzEls[d.i].g.classList.remove('st-zieht');
        zug = null;
        // Wischen: schnelle Bewegung zum Schluss → bis zum Anschlag
        const a = d.proben[0], b = { t: e.timeStamp, x: e.clientX, y: e.clientY };
        const dt = Math.max(1, b.t - a.t);
        const v = (d.f.achse === 'h' ? b.x - a.x : b.y - a.y) / dt;
        let nach = Math.round(d.wert);
        if (dt < 160 && Math.abs(v) > 0.6) nach = v > 0 ? d.raum.max : d.raum.min;
        if (!schiebe(d.i, nach)) zeichne();
      },
      abbrechen(d) {
        fzEls[d.i].g.classList.remove('st-zieht');
        zug = null;
        zeichne();
      },
    });

    ctx.eingabe.zeiger(svg, {
      signal,
      tippen(e) {
        if (!z || sperre || z.gewonnen) return;
        const i = fahrzeugVon(e.startZiel);
        if (ausparken()) {
          if (i >= 0) { waehle(i); parkeAus(i); }
          return;
        }
        if (i >= 0) {
          if (vorherAuswahl === i) { auswahl = -1; fzEls[i].g.blur(); zeichne(); } else waehle(i);
          return;
        }
        if (auswahl < 0) return;
        // Zielfeld in der Linie des gewählten Fahrzeugs
        const f = z.level.fahrzeuge[auswahl];
        const p = svgPunkt(e);
        const cx = Math.floor(p.x), cy = Math.floor(p.y);
        const inLinie = f.achse === 'h' ? cy === f.y : cx === f.x;
        if (!inLinie) { auswahl = -1; zeichne(); return; }
        const q = f.achse === 'h' ? cx : cy;
        const akt = z.pos[auswahl];
        const nach = q < akt ? q : q - f.laenge + 1;
        schiebe(auswahl, nach);
      },
      rechts: () => { auswahl = -1; zeichne(); },
    });

    // ---------- Start ----------
    try {
      const geladen = gespeichert ? L.ausSpeicher(gespeichert) : null;
      if (geladen && !geladen.gewonnen) { z = geladen; aufbauen(); }
      else starteLevel(ctx.variante);
    } catch (f) {
      console.error(f);
      starteLevel(ctx.variante);
    }

    const abmelden = ctx.farben.beobachte(() => { if (z) aufbauen(); });

    function nachVerlauf(neu) {
      if (!neu) return;
      z = neu;
      hinweisZug = null;
      // laufende Ausfahr-Animationen beenden
      fzEls.forEach(({ g }) => g.classList.remove('st-faehrt'));
      zeichne();
    }

    return {
      getStand: () => (z ? L.zumSpeichern(z) : null),
      zusammenfassung() {
        if (!z) return '';
        const name = `${L.VARIANTEN_NAME[z.level.variante]} · Level ${z.level.nr}`;
        return ausparken() ? `${name} · ${L.ausgeparkt(z)}/${z.level.fahrzeuge.length}` : `${name} · ${plural(L.zugZahl(z), 'Zug', 'Züge')}`;
      },
      kannRueckgaengig: () => Boolean(z && z.zurueck.length && !sperre),
      kannWiederholen: () => Boolean(z && z.vor.length && !sperre),
      rueckgaengig() { if (z && !sperre) nachVerlauf(L.rueckgaengig(z)); },
      wiederholen() {
        if (!z || sperre) return;
        nachVerlauf(L.wiederholen(z));
        if (z.gewonnen) { if (ausparken()) ctx.meldeGewonnen(`Level ${z.level.nr} · alle Fahrzeuge ausgeparkt`); else gewinnKlassisch(); }
      },
      neustart() {
        if (!z || sperre) return;
        nachVerlauf(L.neustart(z));
      },
      neu: (variante) => starteLevel(variante),
      hinweis() {
        if (!z || sperre || z.gewonnen) return;
        z = { ...z, hinweise: z.hinweise + 1 };
        if (ausparken()) {
          const i = L.freiesFahrzeug(z);
          if (i < 0) return;
          hinweisZug = { i, nach: null };
          waehle(i);
          ctx.meldung('Dieses Fahrzeug hat freie Bahn – Enter oder Antippen.');
          return;
        }
        const pos = z.pos.slice();
        const level = z.level;
        worker.rufe('hinweis', { level, pos }).then((t) => {
          if (!aktiv || !z || z.level !== level || z.pos.some((p, k) => p !== pos[k])) return;
          if (!t) return;
          hinweisZug = t;
          waehle(t.i);
          const f = level.fahrzeuge[t.i];
          const richtung = f.achse === 'h' ? (t.nach > pos[t.i] ? 'nach rechts' : 'nach links') : (t.nach > pos[t.i] ? 'nach unten' : 'nach oben');
          ctx.meldung(`Vorschlag: markiertes Fahrzeug ${richtung} schieben (Enter führt ihn aus).`);
        }).catch((f) => { if (f?.name !== 'AbortError') console.error(f); });
      },
      onTaste(e) {
        if (!z || sperre || z.gewonnen || e.ctrlKey || e.metaKey || e.altKey) return false;
        const k = e.key;
        const fokusIndex = fahrzeugVon(document.activeElement);
        const i = fokusIndex >= 0 ? fokusIndex : auswahl;
        const richtung = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
        if (richtung) {
          if (i < 0 || z.draussen[i]) { const j = standardFahrzeug(); if (j >= 0) waehle(j); return true; }
          if (fokusIndex < 0) waehle(i);
          const f = z.level.fahrzeuge[i];
          const [dx, dy] = richtung;
          const entlang = f.achse === 'h' ? dx : dy;
          if (ausparken() || e.shiftKey || !entlang) { wechsle(i, dx, dy); return true; }
          schiebe(i, z.pos[i] + entlang);
          return true;
        }
        if ((k === 'Home' || k === 'End') && i >= 0 && !ausparken()) {
          const { min, max } = L.spielraum(z.level, z.pos, i);
          schiebe(i, k === 'Home' ? min : max);
          return true;
        }
        if (k === 'Enter' || k === ' ') {
          if (i < 0) return false;
          if (ausparken()) { parkeAus(i); return true; }
          if (hinweisZug && hinweisZug.i === i) { schiebe(i, hinweisZug.nach); return true; }
          return true;
        }
        if (k === 'Escape' && auswahl >= 0) {
          const g = fzEls[auswahl]?.g;
          auswahl = -1;
          g?.blur();
          zeichne();
          return true;
        }
        return false;
      },
      zerstoere() {
        aktiv = false;
        timer.forEach(clearTimeout);
        abmelden();
        worker.beende();
        vorab?.beende();
        container.replaceChildren();
      },
    };
  },
};
