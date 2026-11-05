// Sechseck-Stapel: Stapel auf die Wabe legen, gleiche Oberfarben wandern zusammen, ab 10 lösen sie sich auf.
// Bedienung: Ziehen (Maus/Finger) · Stapel antippen + Feld antippen · Tastatur 1–3, Pfeile, Tab, Enter, Esc.
import { h, s, ladeStil } from '../../kern/dom.js';
import * as L from './logik.js';

const S = 10;                        // Umkreisradius eines Feldes (SVG-Einheiten)
const W = Math.sqrt(3) * S;          // Breite eines spitz-oben stehenden Sechsecks
const RP = S * 0.84;                 // Radius eines Plättchens
const SCHRITT_MS = 210;              // ein Wander-/Auflöse-Schritt der Animation
const zahl = (n) => n.toLocaleString('de-DE');

const hub = (n) => Math.min(1.3, 11 / Math.max(1, n - 1));
function hexPunkte(cx, cy, r) {
  const p = [];
  for (let k = 0; k < 6; k++) {
    const w = (Math.PI / 180) * (60 * k - 90);
    p.push(`${(cx + r * Math.cos(w)).toFixed(2)},${(cy + r * Math.sin(w)).toFixed(2)}`);
  }
  return p.join(' ');
}

export default {
  id: 'sechseck-stapel',
  name: 'Sechseck-Stapel',
  beschreibung: 'Stapel ablegen, gleiche Farben wandern zusammen und lösen sich auf.',
  variantenTitel: 'Spielart',
  varianten: [
    { id: 'entspannt', name: 'Entspannt – endet nie' },
    { id: 'leicht', name: 'Leicht – 4 Farben, endet bei vollem Feld' },
    { id: 'mittel', name: 'Mittel – 5 Farben, endet bei vollem Feld' },
    { id: 'schwer', name: 'Schwer – 6 Farben, kleineres Feld' },
  ],
  standVersion: 1,

  erstelle(container, ctx, gespeichert) {
    ladeStil('spiele/sechseck-stapel/stil.css');
    const { signal } = ctx;

    let z = null;
    try { z = gespeichert ? L.ausSpeicher(gespeichert) : null; } catch { z = null; }
    if (!z) z = L.neuesSpiel(ctx.neuerSeed(), L.VARIANTEN_IDS.includes(ctx.variante) ? ctx.variante : 'leicht');

    let layout = L.layoutFuer(z.variante);
    let auswahl = null;          // gewählter Platz 0–2
    let cursor = mitte();        // Feld-Cursor (Vorschau-Ziel)
    let wunschX = layout.zellen[cursor].x;
    let tastatur = false;        // Cursor-Ring zeigen
    let hinweisAn = false;
    let zug = null;              // laufendes Ziehen
    let anim = null;             // { timer, schritte, i, start }
    let neuerRekord = false;

    const rekorde = () => ctx.speicher.lies('rekorde', {}) || {};

    // ---------- DOM ----------
    const svg = s('svg', {
      class: 'hs-feld', role: 'grid', tabindex: '0',
      'aria-label': 'Wabenfeld – Pfeiltasten bewegen den Cursor, Enter legt den gewählten Stapel ab',
    });
    const gFelder = s('g', { class: 'hs-felder' });
    const gMarken = s('g', { class: 'hs-marken', 'aria-hidden': 'true' });
    const gStapel = s('g', { class: 'hs-stapel', 'aria-hidden': 'true' });
    const gVorschau = s('g', { class: 'hs-vorschau', 'aria-hidden': 'true' });
    const gFlug = s('g', { class: 'hs-flug', 'aria-hidden': 'true' });
    svg.append(gFelder, gMarken, gStapel, gVorschau, gFlug);

    const punkteEl = h('span', { class: 'hs-wert' });
    const rekordEl = h('span', { class: 'hs-wert' });
    const status = h('p', { class: 'hs-status leise', 'aria-live': 'polite' });
    const ende = h('div', { class: 'hs-ende', hidden: true, role: 'status', 'aria-live': 'polite' });
    const plaetze = [0, 1, 2].map((p) => h('button', { type: 'button', class: 'hs-platz', dataset: { platz: p } }));

    const wurzel = h('div', { class: 'hs' },
      h('div', { class: 'hs-info' },
        h('div', { class: 'hs-zahl' }, h('span', { class: 'hs-label', text: 'Punkte' }), punkteEl),
        h('div', { class: 'hs-zahl' }, h('span', { class: 'hs-label', text: 'Rekord' }), rekordEl),
      ),
      h('div', { class: 'hs-feld-rahmen' }, svg, ende),
      h('div', { class: 'hs-seite' },
        h('div', { class: 'hs-angebot', role: 'group', 'aria-label': 'Stapel zum Legen (Tasten 1 bis 3)' }, plaetze),
        status,
      ),
    );
    container.append(wurzel);

    // ---------- Geometrie ----------
    function mitte() {
      const l = L.layoutFuer(z.variante);
      return l.zellen.findIndex((c) => c.q === 0 && c.r === 0);
    }
    const pos = (i) => ({ cx: layout.zellen[i].x * W, cy: layout.zellen[i].y * 1.5 * S });

    let gebautFuer = '';
    let felder = [];
    function baueFeld() {
      if (gebautFuer === z.variante) return;
      gebautFuer = z.variante;
      layout = L.layoutFuer(z.variante);
      const xs = layout.zellen.map((c) => c.x * W), ys = layout.zellen.map((c) => c.y * 1.5 * S);
      const x0 = Math.min(...xs) - W / 2 - 2, x1 = Math.max(...xs) + W / 2 + 2;
      const y0 = Math.min(...ys) - S - 13, y1 = Math.max(...ys) + S + 2;
      svg.setAttribute('viewBox', `${x0.toFixed(2)} ${y0.toFixed(2)} ${(x1 - x0).toFixed(2)} ${(y1 - y0).toFixed(2)}`);
      const reihen = new Map();
      felder = layout.zellen.map((c, i) => {
        const { cx, cy } = pos(i);
        const el = s('polygon', {
          class: 'hs-slot', id: `hs-zelle-${i}`, role: 'gridcell', points: hexPunkte(cx, cy, S * 0.96), dataset: { i },
        });
        if (!reihen.has(c.r)) reihen.set(c.r, s('g', { role: 'row' }));
        reihen.get(c.r).append(el);
        return el;
      });
      gFelder.replaceChildren(...reihen.values());
    }

    // ---------- Darstellung ----------
    const farbName = (f) => ctx.farben.liste[f]?.name ?? `Farbe ${f + 1}`;

    function stapelText(st) {
      if (!st.length) return 'frei';
      const sch = L.schichten(st).reverse();
      return `${st.length} Plättchen, oben ${sch.map((x) => `${x.anzahl} × ${farbName(x.farbe)}`).join(', darunter ')}`;
    }

    /** Plättchen eines Stapels als SVG-Gruppe (Mitte unten bei cx, cy) */
    function stapelGruppe(st, cx, cy, { zahlAn = true, klasse = 'hs-st' } = {}) {
      const g = s('g', { class: klasse });
      const d = hub(st.length);
      st.forEach((f, k) => {
        g.append(s('polygon', { class: 'hs-platte', points: hexPunkte(cx, cy - k * d, RP), style: { fill: ctx.farben.css(f) } }));
      });
      if (zahlAn && st.length) {
        const yo = cy - (st.length - 1) * d;
        const f = st[st.length - 1];
        const muster = ctx.farben.musterAn();
        if (muster) {
          g.append(s('path', {
            class: 'hs-symbol', d: ctx.farben.symbolPfad(f), 'fill-rule': 'evenodd',
            transform: `translate(${(cx - 2.3).toFixed(2)} ${(yo - 6.9).toFixed(2)}) scale(.46)`,
          }));
        }
        g.append(s('text', {
          class: 'hs-zahl-text', x: cx.toFixed(2), y: (yo + (muster ? 4.4 : 2.2)).toFixed(2),
          'text-anchor': 'middle', text: String(L.obenAnzahl(st)),
        }));
      }
      return g;
    }

    function anzeigeBrett() {
      return anim?.brett ?? z.brett;
    }

    function zeichneStapel() {
      const brett = anzeigeBrett();
      gStapel.replaceChildren(...brett.map((st, i) => {
        if (!st.length) return null;
        const { cx, cy } = pos(i);
        return stapelGruppe(st, cx, cy);
      }).filter(Boolean));
      felder.forEach((el, i) => {
        el.classList.toggle('belegt', brett[i].length > 0);
        el.setAttribute('aria-label', `Feld ${i + 1}: ${stapelText(z.brett[i])}`);
      });
    }

    /** Zielfeld der Vorschau (Ziehen, Cursor) – nur freie Felder */
    function zielFeld() {
      if (zug) return zug.ziel;
      if (auswahl === null || !z.angebot[auswahl]) return null;
      return z.brett[cursor]?.length === 0 ? cursor : null;
    }

    function zeichneVorschau() {
      const platz = zug ? zug.platz : auswahl;
      const ziel = anim ? null : zielFeld();
      const marken = [];
      const vorschau = [];
      if (ziel !== null && platz !== null && z.angebot[platz]) {
        const st = z.angebot[platz];
        for (const n of L.passendeNachbarn(z, st, ziel)) {
          const { cx, cy } = pos(n);
          marken.push(s('polygon', { class: 'hs-passt', points: hexPunkte(cx, cy, S * 0.96) }));
        }
        const { cx, cy } = pos(ziel);
        marken.push(s('polygon', { class: 'hs-ziel', points: hexPunkte(cx, cy, S * 0.96) }));
        vorschau.push(stapelGruppe(st, cx, cy, { klasse: 'hs-st hs-geist-feld' }));
      }
      const zeigeCursor = (tastatur || hinweisAn) && !zug && !anim && !z.beendet;
      if (zeigeCursor) {
        const { cx, cy } = pos(cursor);
        vorschau.push(s('polygon', { class: `hs-cursor${hinweisAn ? ' hinweis' : ''}`, points: hexPunkte(cx, cy, S * 0.98) }));
      }
      gMarken.replaceChildren(...marken);
      gVorschau.replaceChildren(...vorschau);
      svg.setAttribute('aria-activedescendant', `hs-zelle-${cursor}`);
    }

    function miniSvg(st, klasse) {
      const m = s('svg', { class: klasse, viewBox: '-10 -20 20 30', 'aria-hidden': 'true' });
      m.append(stapelGruppe(st, 0, 1));
      return m;
    }

    function zeichneAngebot() {
      plaetze.forEach((el, p) => {
        const st = z.angebot[p];
        el.replaceChildren(st ? miniSvg(st, 'hs-mini') : '', h('span', { class: 'hs-taste', 'aria-hidden': 'true', text: String(p + 1) }));
        el.disabled = !st || z.beendet;
        el.classList.toggle('gewaehlt', auswahl === p);
        el.classList.toggle('gezogen', zug?.platz === p);
        el.classList.toggle('hinweis', hinweisAn && auswahl === p);
        el.setAttribute('aria-label', st ? `Stapel ${p + 1}: ${stapelText(st)}` : `Platz ${p + 1}: leer`);
        el.setAttribute('aria-pressed', String(auswahl === p));
      });
    }

    function zeichneInfo() {
      const r = rekorde();
      if (z.punkte > (r[z.variante] || 0)) {
        r[z.variante] = z.punkte;
        ctx.speicher.schreibe('rekorde', r);
        neuerRekord = true;
      }
      punkteEl.textContent = zahl(z.punkte);
      rekordEl.textContent = zahl(rekorde()[z.variante] || 0);
      const name = L.VARIANTEN[z.variante].name;
      const frei = L.freieFelder(z.brett).length;
      const freiText = `${frei} ${frei === 1 ? 'Feld' : 'Felder'} frei`;
      status.textContent = L.modusVon(z) === 'klassisch'
        ? `${name} · ${freiText} · Rückgängig noch ${z.rueckgaengigRest}×`
        : `${name} · ${freiText}`;
    }

    function zeichneEnde() {
      if (!z.beendet || anim) { ende.hidden = true; return; }
      const knoepfe = [];
      if (L.kannRueckgaengig(z)) {
        knoepfe.push(h('button', { type: 'button', class: 'knopf', on: { click: () => instanz.rueckgaengig() } },
          `Letzten Zug zurück (${z.rueckgaengigRest}×)`));
      }
      knoepfe.push(h('button', { type: 'button', class: 'knopf primaer', on: { click: () => ctx.neuesSpiel() } }, 'Neues Spiel'));
      ende.replaceChildren(h('div', { class: 'hs-ende-karte' },
        h('p', { class: 'hs-ende-titel', text: 'Kein Feld mehr frei' }),
        h('p', { class: 'hs-ende-punkte', text: `${zahl(z.punkte)} Punkte` }),
        h('p', { class: 'leise', text: `${zahl(z.aufgeloest)} Plättchen aufgelöst · ${zahl(z.zuege)} Züge` }),
        neuerRekord && z.punkte > 0 ? h('p', { class: 'hs-ende-rekord', text: 'Neuer Rekord' }) : null,
        h('div', { class: 'hs-ende-knoepfe' }, knoepfe),
      ));
      const warSichtbar = !ende.hidden;
      ende.hidden = false;
      if (!warSichtbar) ende.querySelector('.primaer')?.focus({ preventScroll: true });
    }

    function zeichne() {
      baueFeld();
      zeichneStapel();
      zeichneVorschau();
      zeichneAngebot();
      zeichneInfo();
      zeichneEnde();
    }

    // ---------- Animation ----------
    function beendeAnimation() {
      if (!anim) return;
      clearTimeout(anim.timer);
      anim = null;
      gFlug.replaceChildren();
      zeichne();
    }

    function spieleAb(startBrett, schritte) {
      anim = { brett: startBrett, schritte, i: 0, timer: 0 };
      zeichne();
      const naechster = () => {
        if (!anim) return;
        if (anim.i >= anim.schritte.length) { beendeAnimation(); return; }
        const sch = anim.schritte[anim.i];
        const vorher = anim.brett;
        gFlug.replaceChildren();
        if (sch.typ === 'wandern') {
          // Quellen sofort ohne Oberschicht zeigen, Plättchen fliegen zum Ziel
          const zwischen = vorher.map((st) => st.slice());
          sch.von.forEach((v, k) => { zwischen[v].length -= sch.anzahl[k]; });
          anim.brett = zwischen;
          zeichneStapel();
          const ziel = pos(sch.nach);
          const zielHoehe = zwischen[sch.nach].length;
          const dz = hub(zielHoehe + sch.anzahl.reduce((a, b) => a + b, 0));
          sch.von.forEach((v, k) => {
            const q = pos(v);
            const dq = hub(vorher[v].length);
            const flug = stapelGruppe(new Array(sch.anzahl[k]).fill(sch.farbe), 0, 0, { zahlAn: false, klasse: 'hs-st hs-fliegt' });
            const sx = q.cx, sy = q.cy - zwischen[v].length * dq;
            flug.style.transform = `translate(${sx}px, ${sy}px)`;
            gFlug.append(flug);
            flug.getBoundingClientRect();
            requestAnimationFrame(() => {
              flug.style.transform = `translate(${ziel.cx}px, ${ziel.cy - zielHoehe * dz}px)`;
            });
          });
        } else {
          const { cx, cy } = pos(sch.zelle);
          const n = vorher[sch.zelle].length;
          const d = hub(n);
          const weg = stapelGruppe(new Array(Math.min(sch.anzahl, 12)).fill(sch.farbe), cx, cy - (n - sch.anzahl) * d, { zahlAn: false, klasse: 'hs-st hs-weg' });
          weg.style.transformOrigin = `${cx}px ${cy - (n - sch.anzahl) * d}px`;
          gFlug.append(weg);
          anim.brett = sch.brett;
          zeichneStapel();
        }
        anim.timer = setTimeout(() => {
          if (!anim) return;
          anim.brett = sch.brett;
          anim.i++;
          gFlug.replaceChildren();
          zeichneStapel();
          naechster();
        }, SCHRITT_MS);
      };
      anim.timer = setTimeout(naechster, 60);
    }

    // ---------- Aktionen ----------
    function waehle(platz) {
      beendeAnimation();
      if (z.beendet || !z.angebot[platz]) return;
      hinweisAn = false;
      auswahl = auswahl === platz ? null : platz;
      if (auswahl !== null && z.brett[cursor].length) setzeCursor(naechstesFreies(cursor, 1) ?? cursor);
      zeichne();
    }

    function lege(platz, zelle) {
      beendeAnimation();
      const vorher = z;
      const r = L.zug(z, platz, zelle);
      if (!r) return false;
      z = r.zustand;
      auswahl = null;
      hinweisAn = false;
      if (r.hinweis) ctx.meldung(r.hinweis);
      const ketten = r.schritte.filter((x) => x.typ === 'weg').length;
      if (ketten > 1) ctx.meldung(`Kette mit ${ketten} Auflösungen: +${zahl(r.punkte)}`);
      if (!ctx.bewegungReduziert() && r.schritte.length) {
        const start = vorher.brett.map((st) => st.slice());
        start[zelle] = vorher.angebot[platz].slice();
        spieleAb(start, r.schritte);
      } else {
        zeichne();
      }
      ctx.meldeAenderung();
      return true;
    }

    function setzeCursor(i) {
      cursor = i;
      wunschX = layout.zellen[i].x;
    }

    function naechstesFreies(von, richtung) {
      const n = layout.anzahl;
      for (let k = 1; k <= n; k++) {
        const i = (von + richtung * k + n * 2) % n;
        if (!z.brett[i].length) return i;
      }
      return null;
    }

    function bewegeCursor(taste) {
      const c = layout.zellen[cursor];
      if (taste === 'ArrowLeft' || taste === 'ArrowRight') {
        const dx = taste === 'ArrowLeft' ? -1 : 1;
        const ziel = layout.zellen.findIndex((x) => x.r === c.r && x.q === c.q + dx);
        if (ziel >= 0) setzeCursor(ziel);
        return;
      }
      const r = c.r + (taste === 'ArrowUp' ? -1 : 1);
      let bestes = -1;
      layout.zellen.forEach((x, i) => {
        if (x.r !== r) return;
        if (bestes < 0) { bestes = i; return; }
        const a = Math.abs(x.x - wunschX), b = Math.abs(layout.zellen[bestes].x - wunschX);
        if (a < b - 1e-9 || (Math.abs(a - b) < 1e-9 && Math.abs(x.x) < Math.abs(layout.zellen[bestes].x))) bestes = i;
      });
      if (bestes >= 0) cursor = bestes;     // wunschX bleibt → kein Zickzack
    }

    // ---------- Zeiger ----------
    function svgPunkt(e) {
      const m = svg.getScreenCTM();
      if (!m) return null;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      return { x: p.x, y: p.y };
    }
    function zelleBei(p, nurFrei = false) {
      if (!p) return null;
      let bestes = null, abst = Infinity;
      layout.zellen.forEach((_, i) => {
        if (nurFrei && z.brett[i].length) return;
        const { cx, cy } = pos(i);
        const d = Math.hypot(p.x - cx, p.y - cy);
        if (d < abst) { abst = d; bestes = i; }
      });
      return abst <= S * 0.95 ? bestes : null;
    }
    const zellPx = () => {
      const vb = svg.viewBox.baseVal;
      return vb && vb.width ? (svg.getBoundingClientRect().width / vb.width) * W : 40;
    };

    plaetze.forEach((el, platz) => {
      ctx.eingabe.ziehen(el, {
        signal,
        schwelle: 6,
        start(e) {
          if (!z.angebot[platz] || z.beendet) return false;
          beendeAnimation();
          const px = zellPx() * 1.1;
          const geist = h('div', { class: 'hs-geist', style: { width: `${px}px`, height: `${px * 1.5}px` } }, miniSvg(z.angebot[platz], 'hs-geist-svg'));
          wurzel.append(geist);
          auswahl = null;
          hinweisAn = false;
          tastatur = false;
          zug = { platz, geist, px, touch: e.pointerType !== 'mouse', ziel: null };
          zeichneAngebot();
          return zug;
        },
        bewege(e, d) {
          const hochX = e.clientX, hochY = e.clientY - (d.touch ? d.px * 1.1 : 0);
          d.geist.style.transform = `translate(${hochX - d.px / 2}px, ${hochY - d.px}px)`;
          const ziel = zelleBei(svgPunkt({ clientX: hochX, clientY: hochY }), true);
          if (ziel !== d.ziel) { d.ziel = ziel; zeichneVorschau(); }
        },
        ablegen(e, d) {
          d.geist.remove();
          const ziel = d.ziel;
          zug = null;
          if (ziel === null || !lege(platz, ziel)) zeichne();
        },
        abbrechen(d) {
          d.geist.remove();
          zug = null;
          zeichne();
        },
      });
      ctx.eingabe.zeiger(el, {
        signal,
        tippen: () => { tastatur = false; waehle(platz); },
        rechts: () => { auswahl = null; zeichne(); },
      });
    });

    svg.addEventListener('pointermove', (e) => {
      if (auswahl === null || zug || anim || e.pointerType !== 'mouse') return;
      const i = zelleBei(svgPunkt(e));
      if (i === null || i === cursor) return;
      setzeCursor(i);
      tastatur = false;
      hinweisAn = false;
      zeichneVorschau();
    }, { signal });

    ctx.eingabe.zeiger(svg, {
      signal,
      tippen(e) {
        const i = zelleBei(svgPunkt(e));
        if (i === null || z.beendet) return;
        tastatur = false;
        if (auswahl === null) {
          if (!z.brett[i].length) ctx.meldung('Erst unten einen Stapel wählen.');
          return;
        }
        if (z.brett[i].length) { ctx.meldung('Dieses Feld ist schon belegt.'); return; }
        if (e.pointerType === 'mouse' || i === cursor) { lege(auswahl, i); return; }
        setzeCursor(i);
        hinweisAn = false;
        zeichneVorschau();
      },
      rechts: () => { auswahl = null; hinweisAn = false; zeichne(); },
    });
    svg.addEventListener('focus', () => { tastatur = true; zeichneVorschau(); }, { signal });
    svg.addEventListener('blur', () => { if (!auswahl) { tastatur = false; zeichneVorschau(); } }, { signal });

    zeichne();

    function neuAufsetzen(neu) {
      beendeAnimation();
      z = neu;
      auswahl = null;
      hinweisAn = false;
      neuerRekord = false;
      gebautFuer = '';
      layout = L.layoutFuer(z.variante);
      setzeCursor(mitte());
      zeichne();
    }

    // ---------- Schnittstelle ----------
    const instanz = {
      getStand: () => L.zumSpeichern(z),
      zusammenfassung: () => `${L.VARIANTEN[z.variante].name} · ${zahl(z.punkte)} Punkte${z.beendet ? ' · beendet' : ''}`,
      kannRueckgaengig: () => L.kannRueckgaengig(z),
      rueckgaengig() {
        const vorher = L.rueckgaengig(z);
        if (!vorher) return;
        beendeAnimation();
        z = vorher;
        auswahl = null;
        hinweisAn = false;
        zeichne();
        ctx.meldeAenderung();
      },
      hinweis() {
        beendeAnimation();
        const t = L.hinweis(z);
        if (!t) return;
        auswahl = t.platz;
        setzeCursor(t.zelle);
        hinweisAn = true;
        zeichne();
        ctx.meldung('Vorschlag gezeigt – Enter oder Tippen auf das Feld legt den Stapel ab.');
      },
      neustart() { neuAufsetzen(L.neuesSpiel(z.seed, z.variante)); ctx.meldeAenderung(); },
      neu(variante) {
        neuAufsetzen(L.neuesSpiel(ctx.neuerSeed(), L.VARIANTEN_IDS.includes(variante) ? variante : z.variante));
      },
      onTaste(e) {
        if (e.ctrlKey || e.metaKey || e.altKey || z.beendet) return false;
        const k = e.key;
        if (['1', '2', '3'].includes(k)) { tastatur = true; waehle(Number(k) - 1); return true; }
        if (k === 'Escape' && auswahl !== null) { auswahl = null; hinweisAn = false; zeichne(); return true; }
        if (k.startsWith('Arrow')) {
          beendeAnimation();
          tastatur = true;
          hinweisAn = false;
          if (auswahl === null) {
            const p = z.angebot.findIndex(Boolean);
            if (p >= 0) auswahl = p;
          }
          bewegeCursor(k);
          zeichne();
          return true;
        }
        if (k === 'Tab' && auswahl !== null) {
          const i = naechstesFreies(cursor, e.shiftKey ? -1 : 1);
          if (i !== null) { tastatur = true; hinweisAn = false; setzeCursor(i); zeichneVorschau(); }
          return true;
        }
        const aufPlatz = e.target instanceof Element && e.target.closest('.hs-platz');
        if ((k === 'Enter' || k === ' ') && auswahl !== null && !aufPlatz) {
          if (z.brett[cursor].length) { ctx.meldung('Dieses Feld ist schon belegt.'); return true; }
          lege(auswahl, cursor);
          return true;
        }
        return false;
      },
      zerstoere() {
        if (anim) clearTimeout(anim.timer);
        anim = null;
        zug?.geist.remove();
        abmelden();
        container.replaceChildren();
      },
    };

    const abmelden = ctx.farben.beobachte(() => zeichne());
    return instanz;
  },
};
