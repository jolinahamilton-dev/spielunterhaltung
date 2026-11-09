// Blasenschuss: Blasen von unten abschießen, ab 3 gleichfarbigen platzen sie, lose Blasen fallen ab.
// Bedienung: Maus (zielen, Klick) · Finger (ziehen, loslassen) · Tastatur (←/→, Enter, T).
import { h, s, ladeStil } from '../../kern/dom.js';
import * as L from './logik.js';

const { BREITE, HOEHE, SX, SY, SQ3, BOMBE, REGENBOGEN, STEIN } = L;
const FARBE_ID = [0, 0, 5, 2, 3, 6, 1];            // Blasencode 1–6 → Palettenfarbe (gut unterscheidbar)
const NAECHSTE = [SX + 5.4, SY + 0.35];
const RAD = 0.94;
const zahl = (n) => n.toLocaleString('de-DE');

export default {
  id: 'blasenschuss',
  name: 'Blasenschuss',
  beschreibung: 'Blasen abschießen: drei gleiche platzen, lose Blasen fallen ab.',
  variantenTitel: 'Modus',
  varianten: [
    { id: 'level', name: 'Level – mit Ziel' },
    { id: 'endlos', name: 'Endlos – ohne Ziel' },
  ],
  standVersion: 1,

  erstelle(container, ctx, gespeichert) {
    ladeStil('spiele/blasenschuss/stil.css');
    const { signal } = ctx;

    const gespeicherterLevel = () => {
      const v = ctx.speicher.lies('level', 1);
      return Number.isInteger(v) && v >= 1 && v <= 1e6 ? v : 1;
    };
    const neuesSpiel = (variante, seed = ctx.neuerSeed()) => (variante === 'endlos'
      ? L.neuesEndlos(seed) : L.neuesLevel(gespeicherterLevel(), seed));

    let z = null;
    try { if (gespeichert && L.istGueltig(gespeichert)) z = L.ausSpeicher(gespeichert); } catch { z = null; }
    if (z && L.gewonnen(z)) z = null;                        // fertiges Level ohne Weiterspielen: neu beginnen
    if (!z) z = neuesSpiel(ctx.variante === 'endlos' ? 'endlos' : 'level');

    let beschaeftigt = false;       // Blase fliegt
    let hinweisAn = false;
    let anim = { raf: 0, timer: 0 };
    let zerstoert = false;
    let zielt = false;              // Zeiger gedrückt
    let abbruchZone = false;

    // ---------- DOM ----------
    const gFeld = s('g', { class: 'bs-blasen' });
    const gZiel = s('g', { class: 'bs-ziel', 'aria-hidden': 'true' });
    const gEffekt = s('g', { class: 'bs-effekt', 'aria-hidden': 'true' });
    const gSchuetze = s('g', { class: 'bs-schuetze' });
    const gFlug = s('g', { class: 'bs-flug', 'aria-hidden': 'true' });
    const tauschFlaeche = s('circle', { class: 'bs-tausch', cx: NAECHSTE[0], cy: NAECHSTE[1], r: 1.7 });
    const regen = s('linearGradient', { id: 'bs-regen', x1: 0, y1: 0, x2: 1, y2: 1 });
    [0, 1, 2, 3, 4, 5].forEach((k) => {
      const stop = s('stop', { offset: `${k * 20}%` });
      stop.style.stopColor = `var(--spielfarbe-${k === 4 ? 5 : k === 5 ? 6 : k})`;
      regen.append(stop);
    });
    const svg = s('svg', {
      class: 'bs-feld', viewBox: `0 0 ${BREITE} ${HOEHE}`, tabindex: 0, role: 'group',
      'aria-label': 'Blasenfeld',
    },
    s('defs', null, regen),
    s('rect', { class: 'bs-hg', x: 0, y: 0, width: BREITE, height: HOEHE, rx: 0.6 }),
    s('line', { class: 'bs-linie', x1: 0.5, x2: BREITE - 0.5, y1: 1 + SQ3 * L.LINIE - 1.15, y2: 1 + SQ3 * L.LINIE - 1.15 }),
    gFeld, gZiel, gEffekt, gSchuetze, gFlug, tauschFlaeche,
    s('text', { class: 'bs-beschriftung', x: NAECHSTE[0], y: NAECHSTE[1] - 1.45, 'text-anchor': 'middle' }, 'nächste'));

    const kopfLinks = h('span', { class: 'bs-titel' });
    const kopfMitte = h('span', { class: 'bs-wert' });
    const kopfRechts = h('span', { class: 'bs-rest leise' });
    const tauschKnopf = h('button', { type: 'button', class: 'knopf klein', on: { click: () => tauschen() } }, 'Blasen tauschen (T)');
    const status = h('p', { class: 'bs-status leise', role: 'status', 'aria-live': 'polite' });
    const wurzel = h('div', { class: 'bs' },
      h('div', { class: 'bs-info' }, kopfLinks, kopfMitte, kopfRechts),
      svg,
      h('div', { class: 'bs-aktionen' }, tauschKnopf, status));
    container.append(wurzel);

    // ---------- Zeichnen ----------
    function symbolPfad(farbe, x, y, groesse) {
      return s('path', {
        class: 'bs-symbol', d: ctx.farben.symbolPfad(farbe), 'fill-rule': 'evenodd',
        transform: `translate(${x - groesse / 2} ${y - groesse / 2}) scale(${groesse / 10})`,
      });
    }

    function blase(code, x, y, r = RAD) {
      const g = s('g', { class: 'bs-blase' });
      if (code === STEIN) {
        g.append(s('circle', { cx: x, cy: y, r, class: 'bs-stein' }),
          s('path', { d: `M${x - 0.5} ${y - 0.55}L${x + 0.5} ${y + 0.55}M${x + 0.5} ${y - 0.55}L${x - 0.5} ${y + 0.55}`, class: 'bs-riss' }));
      } else if (code === BOMBE) {
        g.append(s('circle', { cx: x, cy: y, r, class: 'bs-bombe' }),
          s('path', { d: `M${x} ${y - 0.62}V${y + 0.62}M${x - 0.62} ${y}H${x + 0.62}M${x - 0.44} ${y - 0.44}L${x + 0.44} ${y + 0.44}M${x + 0.44} ${y - 0.44}L${x - 0.44} ${y + 0.44}`, class: 'bs-funke' }));
      } else if (code === REGENBOGEN) {
        g.append(s('circle', { cx: x, cy: y, r, class: 'bs-regenbogen', fill: 'url(#bs-regen)' }),
          symbolPfad(4, x, y, 1.3));
        g.lastChild.setAttribute('class', 'bs-symbol hell');
      } else {
        const id = FARBE_ID[code];
        const c = s('circle', { cx: x, cy: y, r, class: 'bs-farbe' });
        c.style.fill = ctx.farben.css(id);
        g.append(c, s('circle', { cx: x - r * 0.32, cy: y - r * 0.34, r: r * 0.26, class: 'bs-glanz' }));
        if (ctx.farben.musterAn()) g.append(symbolPfad(id, x, y, r * 1.25));
      }
      return g;
    }

    const farbName = (code) => (code === STEIN ? 'Stein' : code === BOMBE ? 'Bombe' : code === REGENBOGEN ? 'Regenbogen'
      : ctx.farben.liste[FARBE_ID[code]].name);

    function zeichneFeld() {
      const teile = [];
      for (let i = 0; i < L.ANZAHL; i++) {
        const code = z.brett[i];
        if (!code) continue;
        const [x, y] = L.mitte(Math.floor(i / L.SPALTEN), i % L.SPALTEN, z.kopf);
        teile.push(blase(code, x, y));
      }
      gFeld.replaceChildren(...teile);
    }

    function zeichneSchuetze() {
      const w = (z.winkel * Math.PI) / 180;
      const teile = [
        s('circle', { cx: SX, cy: SY, r: 1.55, class: 'bs-sockel' }),
        s('path', { class: 'bs-pfeil', d: `M${SX} ${SY}L${SX + Math.sin(w) * 3.1} ${SY - Math.cos(w) * 3.1}` }),
        blase(z.aktuell, SX, SY),
        blase(z.naechste, NAECHSTE[0], NAECHSTE[1], RAD * 0.8),
      ];
      gSchuetze.replaceChildren(...teile);
      tauschFlaeche.setAttribute('aria-label', 'Nächste Blase antippen zum Tauschen');
    }

    function zeichneZiel() {
      if (beschaeftigt) { gZiel.replaceChildren(); return; }
      const flug = L.fliegen(z.brett, z.kopf, z.winkel);
      const d = flug.pfad.map((p, k) => `${k ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join('');
      const teile = [s('path', { class: `bs-zielpfad${hinweisAn ? ' hinweis' : ''}`, d })];
      if (flug.zelle) {
        const [x, y] = L.mitte(flug.zelle.r, flug.zelle.c, z.kopf);
        teile.push(s('circle', { class: `bs-zielfeld${hinweisAn ? ' hinweis' : ''}`, cx: x, cy: y, r: RAD }));
      }
      gZiel.replaceChildren(...teile);
    }

    function zeichneInfo() {
      const rekord = ctx.speicher.lies('rekord', 0) || 0;
      if (z.modus === 'level') {
        kopfLinks.textContent = z.weiter ? `Level ${z.level} · Endlos` : `Level ${z.level}`;
        kopfMitte.textContent = z.weiter ? `${zahl(z.blasen)} geplatzt` : `${L.anzahlFarbblasen(z.brett)} Blasen übrig`;
        kopfRechts.textContent = z.weiter ? `Reihe in ${L.FEHL_BIS_REIHE - z.fehl}` : '';
      } else {
        kopfLinks.textContent = 'Endlos';
        kopfMitte.textContent = `${zahl(z.blasen)} geplatzt`;
        kopfRechts.textContent = `Rekord ${zahl(rekord)} · Reihe in ${L.FEHL_BIS_REIHE - z.fehl}`;
      }
      kopfRechts.title = L.endlosBetrieb(z)
        ? `Nach ${L.FEHL_BIS_REIHE} Schüssen ohne Platzen rückt die Decke eine Reihe nach unten.` : '';
      svg.setAttribute('aria-label',
        `Blasenfeld, ${L.anzahlBlasen(z.brett)} Blasen. Zielwinkel ${Math.round(z.winkel)} Grad. Aktuelle Blase: ${farbName(z.aktuell)}, nächste: ${farbName(z.naechste)}. `
        + 'Pfeil links und rechts zielen, Enter schießt, T tauscht.');
    }

    function zeichne() {
      zeichneFeld();
      zeichneSchuetze();
      zeichneZiel();
      zeichneInfo();
    }

    // ---------- Aktionen ----------
    function stoppeAnimation() {
      cancelAnimationFrame(anim.raf);
      clearTimeout(anim.timer);
      anim = { raf: 0, timer: 0 };
      beschaeftigt = false;
      gFlug.replaceChildren();
      gEffekt.replaceChildren();
    }

    function setzeWinkel(w) {
      z = L.setzeWinkel(z, Math.round(w * 10) / 10);
      hinweisAn = false;
      zeichneSchuetze();
      zeichneZiel();
      zeichneInfo();
    }

    function tauschen() {
      if (beschaeftigt || zerstoert) return;
      z = L.tausche(z);
      hinweisAn = false;
      zeichneSchuetze();
      zeichneZiel();
      zeichneInfo();
      ctx.meldeAenderung();
    }

    const dauerFlug = (pfad) => {
      let len = 0;
      for (let k = 1; k < pfad.length; k++) len += Math.hypot(pfad[k][0] - pfad[k - 1][0], pfad[k][1] - pfad[k - 1][1]);
      return { len, ms: Math.max(110, Math.min(250, len * 9)) };
    };

    function punktAuf(pfad, t) {
      let rest = t;
      for (let k = 1; k < pfad.length; k++) {
        const a = pfad[k - 1], b = pfad[k];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (rest <= l || k === pfad.length - 1) {
          const f = l ? Math.min(1, rest / l) : 1;
          return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        }
        rest -= l;
      }
      return pfad[pfad.length - 1];
    }

    function effekte(vor, erg) {
      if (ctx.bewegungReduziert() || zerstoert) return;
      if (erg.neueReihe) {
        gFeld.animate?.([{ transform: `translate(0px, ${-SQ3}px)` }, { transform: 'translate(0px, 0px)' }], { duration: 200, easing: 'ease-out' });
        return;
      }
      const art = (i) => (i === erg.zelle.i ? erg.code : vor.brett[i]);
      const teile = [];
      const einzeln = (i, aktion) => {
        const [x, y] = L.mitte(Math.floor(i / L.SPALTEN), i % L.SPALTEN, vor.kopf);
        const b = blase(art(i), x, y);
        b.style.transformBox = 'fill-box';
        b.style.transformOrigin = 'center';
        teile.push([b, aktion]);
      };
      erg.platzte.forEach((i) => einzeln(i, 'platzt'));
      erg.fiel.forEach((i) => einzeln(i, 'faellt'));
      erg.gekappt.forEach((i) => einzeln(i, 'kappt'));
      if (!teile.length) return;
      gEffekt.replaceChildren(...teile.map(([b]) => b));
      for (const [b, aktion] of teile) {
        if (!b.animate) continue;
        if (aktion === 'platzt') b.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.35)', opacity: 0 }], { duration: 170, easing: 'ease-out', fill: 'forwards' });
        else if (aktion === 'faellt') b.animate([{ transform: 'translate(0px, 0px)', opacity: 1 }, { transform: 'translate(0px, 7px)', opacity: 0 }], { duration: 250, easing: 'ease-in', fill: 'forwards' });
        else b.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' });
      }
      anim.timer = setTimeout(() => gEffekt.replaceChildren(), 280);
    }

    function nachSchuss(vor, erg) {
      if (zerstoert) return;
      beschaeftigt = false;
      gFlug.replaceChildren();
      zeichne();
      effekte(vor, erg);
      const sage = [];
      if (erg.platzte.length) sage.push(`${erg.platzte.length} ${erg.platzte.length === 1 ? 'Blase' : 'Blasen'} geplatzt`);
      if (erg.fiel.length) sage.push(`${erg.fiel.length} abgefallen`);
      if (!sage.length) sage.push('Blase eingerastet');
      status.textContent = sage.join(', ');
      if (erg.gekappt.length) ctx.meldung('Unterste Reihe entfernt – es geht ruhig weiter.');
      else if (erg.neueReihe) ctx.meldung('Die Decke rückt eine Reihe nach unten.');
      if (z.modus === 'endlos') {
        const alt = ctx.speicher.lies('rekord', 0) || 0;
        if (z.blasen > alt) ctx.speicher.schreibe('rekord', z.blasen);
        zeichneInfo();
      }
      if (erg.gewonnen) {
        const n = z.level;
        const gespeichertes = gespeicherterLevel();
        if (n + 1 > gespeichertes) ctx.speicher.schreibe('level', n + 1);
        ctx.meldeGewonnen(`Level ${n} geschafft – alle Blasen entfernt. Weiter mit Level ${n + 1}.`, { weiterspielen: true });
      }
    }

    function schiessen() {
      if (beschaeftigt || zerstoert) return false;
      const vor = z;
      const r = L.schiesse(z, z.winkel);
      if (!r) return false;
      stoppeAnimation();
      z = r.zustand;
      hinweisAn = false;
      gZiel.replaceChildren();
      ctx.meldeAenderung();
      if (ctx.bewegungReduziert()) { nachSchuss(vor, r.ergebnis); return true; }
      beschaeftigt = true;
      gSchuetze.replaceChildren(s('circle', { cx: SX, cy: SY, r: 1.55, class: 'bs-sockel' }));
      const flug = blase(r.ergebnis.code === BOMBE || vor.aktuell === REGENBOGEN ? vor.aktuell : r.ergebnis.code, 0, 0);
      gFlug.replaceChildren(flug);
      const pfad = r.ergebnis.pfad;
      const { len, ms } = dauerFlug(pfad);
      const t0 = performance.now();
      const schritt = (jetzt) => {
        if (zerstoert) return;
        const f = Math.min(1, (jetzt - t0) / ms);
        const [x, y] = punktAuf(pfad, len * f);
        flug.setAttribute('transform', `translate(${x} ${y})`);
        if (f < 1) anim.raf = requestAnimationFrame(schritt);
        else nachSchuss(vor, r.ergebnis);
      };
      anim.raf = requestAnimationFrame(schritt);
      return true;
    }

    // ---------- Zeiger ----------
    function zeigerPunkt(e) {
      const r = svg.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * BREITE, ((e.clientY - r.top) / r.height) * HOEHE];
    }
    function ziele(e) {
      const [x, y] = zeigerPunkt(e);
      abbruchZone = y > SY - 1.4;
      if (abbruchZone) return;
      setzeWinkel(L.begrenzeWinkel((Math.atan2(x - SX, SY - y) * 180) / Math.PI));
    }

    ctx.eingabe.ziehen(svg, {
      signal,
      start(e) {
        if (beschaeftigt || e.target.closest?.('.bs-tausch')) return false;
        zielt = true;
        svg.focus({ preventScroll: true });
        ziele(e);
        return { n: 1 };
      },
      bewege: (e) => ziele(e),
      ablegen(e) {
        zielt = false;
        ziele(e);
        if (abbruchZone) { abbruchZone = false; ctx.meldung('Zielen abgebrochen.'); return; }
        schiessen();
      },
      abbrechen() { zielt = false; },
    });
    svg.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' && e.buttons === 0 && !beschaeftigt) ziele(e);
    }, { signal });
    ctx.eingabe.zeiger(tauschFlaeche, { signal, tippen: () => tauschen() });

    // ---------- Schnittstelle ----------
    zeichne();
    const abmelden = ctx.farben.beobachte(() => zeichne());

    return {
      getStand: () => L.zumSpeichern(z),
      zusammenfassung: () => (z.modus === 'level'
        ? (z.weiter ? `Level ${z.level} geschafft · Endlos` : `Level ${z.level} · ${L.anzahlFarbblasen(z.brett)} Blasen übrig`)
        : `Endlos · ${zahl(z.blasen)} geplatzt`),
      kannRueckgaengig: () => L.kannRueckgaengig(z),
      rueckgaengig() {
        const v = L.rueckgaengig(z);
        if (!v) return;
        stoppeAnimation();
        z = v;
        hinweisAn = false;
        zeichne();
        status.textContent = 'Letzten Schuss zurückgenommen';
        ctx.meldeAenderung();
      },
      hinweis() {
        if (beschaeftigt) return;
        const t = L.hinweis(z);
        if (!t) return;
        if (t.tausch) z = L.tausche(z);
        z = L.setzeWinkel(z, t.winkel);
        hinweisAn = true;
        zeichneSchuetze();
        zeichneZiel();
        zeichneInfo();
        ctx.meldung(t.tausch ? 'Besser die Blasen tauschen – so trifft der Schuss gut (Enter).' : 'Guter Schuss gezeigt – Enter oder Klick schießt.');
      },
      neustart() {
        stoppeAnimation();
        z = z.modus === 'endlos' ? L.neuesEndlos(z.seed) : L.neuesLevel(z.level, z.seed);
        zeichne();
        status.textContent = '';
        ctx.meldeAenderung();
      },
      neu(variante) {
        stoppeAnimation();
        z = neuesSpiel(variante ?? z.modus);
        zeichne();
        status.textContent = '';
      },
      weiterspielen() {
        stoppeAnimation();
        z = L.weiterspielen(z);
        zeichne();
        status.textContent = 'Es geht ohne Ziel weiter.';
      },
      onTaste(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return false;
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'ArrowRight') {
          if (beschaeftigt) return true;
          const d = (k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 5 : 1);
          setzeWinkel(z.winkel + d);
          return true;
        }
        if ((k === 'Enter' || k === ' ') && !(e.target instanceof HTMLElement && e.target.closest('button, a'))) {
          schiessen();
          return true;
        }
        if (k === 't' || k === 'T') { tauschen(); return true; }
        return false;
      },
      zerstoere() {
        zerstoert = true;
        stoppeAnimation();
        abmelden();
        container.replaceChildren();
      },
    };
  },
};
