// Ziegelbruch: Bälle von unten schießen, Zahlblöcke abbauen, nach jedem Schuss rückt das Feld nach.
// Bedienung: Maus/Finger ziehen bzw. klicken · Tastatur ←/→ (Umschalt: grob), Enter/Leertaste schießt, B beschleunigt.
import { h, s, ladeStil } from '../../kern/dom.js';
import * as L from './logik.js';

const { B, Z, R } = L;
const TAKT = 180;          // Simulationsschritte je Sekunde (unabhängig von der Bildrate)
const SCHNELL = 4;         // Faktor bei „Beschleunigen“
const zahl = (n) => n.toLocaleString('de-DE');
const SPEICHER_REKORD = 'rekord-endlos';

/** Farbstufe nach Trefferzahl */
function stufe(hp) {
  if (hp <= 2) return 0;
  if (hp <= 5) return 1;
  if (hp <= 9) return 2;
  if (hp <= 15) return 3;
  if (hp <= 25) return 4;
  if (hp <= 50) return 5;
  if (hp <= 99) return 6;
  return 7;
}

export default {
  id: 'ziegelbruch',
  name: 'Ziegelbruch',
  beschreibung: 'Bälle schießen, Zahlblöcke abbauen – ruhig, ohne Zeitdruck.',
  variantenTitel: 'Spielart',
  varianten: [
    { id: 'level', name: 'Level – mit Ziel' },
    { id: 'endlos', name: 'Endlos – ohne Ziel' },
  ],
  standVersion: 1,

  erstelle(container, ctx, gespeichert) {
    ladeStil('spiele/ziegelbruch/stil.css');
    const { signal } = ctx;

    const startLevel = () => {
      const l = Number(ctx.speicher.lies('level', 1));
      return Number.isInteger(l) && l >= 1 && l <= 1e6 ? l : 1;
    };
    const neuesZ = (modus, level) => L.neuesSpiel(modus, { level: level ?? startLevel(), seed: ctx.neuerSeed() });

    let z = null;
    try { if (gespeichert && L.istGueltig(gespeichert)) z = L.ausSpeicher(gespeichert); } catch { z = null; }
    if (!z) z = neuesZ(ctx.variante === 'endlos' ? 'endlos' : 'level');

    let sim = null;          // laufender Schuss
    let schnell = false;
    let raf = 0;
    let acc = 0, letzte = 0;
    let zeigeZiel = true;
    let mausAktiv = false;   // Maus/Finger ist gedrückt
    let zerstoert = false;

    // ---------- DOM ----------
    const zellen = Array.from({ length: B * Z }, () => h('div', { class: 'zb-zelle', 'aria-hidden': 'true' }));
    const feld = h('div', { class: 'zb-feld' }, zellen);
    const zielLinie = s('polyline', { class: 'zb-ziellinie', points: '' });
    const zielPunkt = s('circle', { class: 'zb-zielpunkt', r: String(R * 0.9), cx: '-5', cy: '-5' });
    const ziel = s('svg', { class: 'zb-ziel', viewBox: `0 0 ${B} ${Z}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' }, zielLinie, zielPunkt);
    const baelleEbene = h('div', { class: 'zb-baelle', 'aria-hidden': 'true' });
    const werfer = h('div', { class: 'zb-werfer', 'aria-hidden': 'true' });
    const fallzone = h('div', { class: 'zb-fallzone', 'aria-hidden': 'true' }, h('span', { text: 'Fallzone' }));
    const rahmen = h('div', {
      class: 'zb-rahmen', tabindex: '0', role: 'group',
      'aria-label': 'Ziegelbruch-Feld',
    }, feld, fallzone, ziel, baelleEbene, werfer);

    const kopfEl = h('span', { class: 'zb-wert' });
    const infoEls = [h('span', { class: 'zb-chip' }), h('span', { class: 'zb-chip' }), h('span', { class: 'zb-chip' })];
    const status = h('p', { class: 'zb-status leise', role: 'status', 'aria-live': 'polite' });
    const knopfSchuss = h('button', { type: 'button', class: 'knopf primaer zb-knopf', on: { click: () => schiessen() } }, 'Schießen');
    const knopfSchnell = h('button', {
      type: 'button', class: 'knopf zb-knopf', 'aria-pressed': 'false',
      on: { click: () => setzeSchnell(!schnell) },
    }, 'Beschleunigen');
    const winkelEl = h('span', { class: 'zb-winkel leise' });

    const wurzel = h('div', { class: 'zb' },
      h('div', { class: 'zb-info' }, kopfEl, ...infoEls),
      rahmen,
      h('div', { class: 'zb-aktionen' }, knopfSchuss, knopfSchnell, winkelEl),
      status,
    );
    container.append(wurzel);

    // ---------- Darstellung ----------
    const cache = new Array(B * Z).fill(null);
    function symbolSvg(t) {
      return s('svg', { viewBox: '0 0 10 10', class: 'zb-symbol', 'aria-hidden': 'true' },
        s('path', { d: ctx.farben.symbolPfad(t), 'fill-rule': 'evenodd' }));
    }
    function zeichneZelle(i, v, muster) {
      const key = `${v}|${muster}`;
      if (cache[i] === key) return;
      cache[i] = key;
      const el = zellen[i];
      if (v === 0) { el.className = 'zb-zelle'; el.replaceChildren(); return; }
      if (v > 0) {
        const t = stufe(v);
        el.className = `zb-zelle zb-block zb-t${t}`;
        el.replaceChildren(...[h('span', { class: 'zb-zahl', text: String(v) }), muster ? symbolSvg(t) : null].filter(Boolean));
      } else if (v === L.WAND) {
        el.className = 'zb-zelle zb-wand'; el.replaceChildren();
      } else if (v === L.EXTRA) {
        el.className = 'zb-zelle zb-extra'; el.replaceChildren(h('span', { class: 'zb-zeichen', text: '+1' }));
      } else if (v === L.BOMBE) {
        el.className = 'zb-zelle zb-bombe'; el.replaceChildren(h('span', { class: 'zb-zeichen', text: '✸' }));
      } else {
        el.className = 'zb-zelle zb-raeumer'; el.replaceChildren(h('span', { class: 'zb-zeichen', text: '↔' }));
      }
    }
    function zeichneFeld(f = z.feld) {
      const muster = ctx.farben.musterAn();
      for (let i = 0; i < B * Z; i++) zeichneZelle(i, f[i], muster);
    }

    const pct = (x, y) => [`${(x / B) * 100}%`, `${(y / Z) * 100}%`];
    function setzeWerfer() {
      const [l, t] = pct(L.startXKlemme(z.startX), Z - R);
      werfer.style.left = l; werfer.style.top = t;
    }

    const ballEls = [];
    function zeichneBaelle() {
      if (!sim) { for (const e of ballEls) e.hidden = true; return; }
      sim.baelle.forEach((b, i) => {
        let e = ballEls[i];
        if (!e) { e = h('div', { class: 'zb-ball' }); baelleEbene.append(e); ballEls[i] = e; }
        e.hidden = !b.an;
        if (b.an) { const [l, t] = pct(b.x, b.y); e.style.left = l; e.style.top = t; }
      });
      for (let i = sim.baelle.length; i < ballEls.length; i++) ballEls[i].hidden = true;
    }

    function zeichneZiel() {
      if (sim || !zeigeZiel) { zielLinie.setAttribute('points', ''); zielPunkt.setAttribute('cx', '-5'); return; }
      const v = L.vorschau(z, z.winkel);
      zielLinie.setAttribute('points', v.punkte.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' '));
      const e = v.punkte[v.punkte.length - 1];
      zielPunkt.setAttribute('cx', e[0].toFixed(3)); zielPunkt.setAttribute('cy', e[1].toFixed(3));
    }

    function zeichneInfo() {
      const bloecke = L.zaehleBloecke(z.feld);
      const rek = Number(ctx.speicher.lies(SPEICHER_REKORD, 0)) || 0;
      if (L.istEndlos(z) && z.reihen > rek) ctx.speicher.schreibe(SPEICHER_REKORD, z.reihen);
      if (z.modus === 'level' && !z.weiter) {
        kopfEl.textContent = `Level ${z.level}`;
        infoEls[0].textContent = `Bälle ${z.baelle}`;
        infoEls[1].textContent = `Blöcke ${bloecke}`;
        infoEls[2].textContent = z.nachschub.length ? `Nachschub ${z.nachschub.length}` : 'Kein Nachschub';
      } else {
        kopfEl.textContent = `Reihen ${zahl(z.reihen)}`;
        infoEls[0].textContent = `Rekord ${zahl(Math.max(rek, z.reihen))}`;
        infoEls[1].textContent = `Bälle ${z.baelle}`;
        infoEls[2].textContent = `Schüsse ${zahl(z.schuesse)}`;
      }
      const w = Math.round(z.winkel);
      const richtung = w === 0 ? 'senkrecht' : w > 0 ? `${w}° rechts` : `${-w}° links`;
      winkelEl.textContent = `Richtung: ${richtung}`;
      rahmen.setAttribute('aria-label', `Ziegelbruch-Feld. ${bloecke} Blöcke, ${z.baelle} Bälle, Richtung ${richtung}. Pfeiltasten zielen, Enter schießt.`);
      knopfSchuss.disabled = Boolean(sim);
      knopfSchnell.setAttribute('aria-pressed', String(schnell));
      knopfSchnell.classList.toggle('an', schnell);
    }

    function zeichne() {
      zeichneFeld(sim ? sim.feld : z.feld);
      setzeWerfer();
      zeichneBaelle();
      zeichneZiel();
      zeichneInfo();
    }

    function setzeSchnell(an) { schnell = an; zeichneInfo(); }

    // ---------- Schuss ----------
    function schiessen() {
      if (sim || zerstoert) return;
      sim = L.erstelleSchuss(z, z.winkel);
      status.textContent = '';
      if (ctx.bewegungReduziert()) { L.simuliereAlles(sim); beende(); return; }
      acc = 0; letzte = 0;
      zeichne();
      raf = requestAnimationFrame(tick);
    }

    function tick(t) {
      if (!sim) return;
      const dt = letzte ? Math.min(100, t - letzte) : 16;
      letzte = t;
      acc += (dt / 1000) * TAKT * (schnell ? SCHNELL : 1);
      let k = 0;
      let version = sim.version;
      while (acc >= 1 && !sim.fertig && k < 800) { L.schrittSim(sim); acc -= 1; k++; }
      if (acc > 40) acc = 0;
      if (sim.version !== version) zeichneFeld(sim.feld);
      zeichneBaelle();
      if (sim.fertig) { beende(); return; }
      raf = requestAnimationFrame(tick);
    }

    function abbrechenSchuss() {
      cancelAnimationFrame(raf);
      sim = null;
    }

    function beende() {
      cancelAnimationFrame(raf);
      const fertigSim = sim;
      sim = null;
      const r = L.beendeSchuss(z, fertigSim);
      z = r.zustand;
      const e = r.ereignis;
      const teile = [`${e.treffer} Treffer`];
      if (e.extras) teile.push(`+${e.extras} ${e.extras === 1 ? 'Ball' : 'Bälle'}`);
      if (e.gefallen) teile.push('Reihe fällt weg');
      status.textContent = teile.join(' · ');
      if (e.gefallen) ctx.meldung('Reihe fällt weg');
      zeichne();
      ctx.meldeAenderung();
      if (e.fertig) {
        const naechstes = Math.max(startLevel(), z.level + 1);
        ctx.speicher.schreibe('level', naechstes);
        ctx.meldeGewonnen(`Level ${z.level} geschafft`, { weiterspielen: true });
      }
    }

    // ---------- Zielen mit Maus/Finger ----------
    function winkelAus(e) {
      const r = feld.getBoundingClientRect();
      if (!r.width) return null;
      const px = ((e.clientX - r.left) / r.width) * B;
      const py = ((e.clientY - r.top) / r.height) * Z;
      const dx = px - L.startXKlemme(z.startX), dy = (Z - R) - py;
      if (dy < 0.35) return null;
      return L.klemmeWinkel((Math.atan2(dx, dy) * 180) / Math.PI);
    }
    function ziele(grad) {
      z = { ...z, winkel: Math.round(grad * 10) / 10 };
      zeichneZiel(); zeichneInfo();
    }

    rahmen.addEventListener('pointermove', (e) => {
      if (sim || (e.pointerType !== 'mouse' && !mausAktiv)) return;
      const w = winkelAus(e);
      if (w !== null) ziele(w);
    }, { signal });
    rahmen.addEventListener('pointerdown', (e) => {
      if (sim || e.button > 0) return;
      mausAktiv = true;
      try { rahmen.setPointerCapture(e.pointerId); } catch { /* egal */ }
      const w = winkelAus(e);
      if (w !== null) ziele(w);
      rahmen.focus({ preventScroll: true });
    }, { signal });
    rahmen.addEventListener('pointerup', (e) => {
      if (!mausAktiv) return;
      mausAktiv = false;
      if (sim) return;
      const w = winkelAus(e);
      if (w === null) { ctx.meldung('Abgebrochen – zum Schießen oberhalb der Abschussstelle loslassen.'); return; }
      ziele(w);
      schiessen();
    }, { signal });
    rahmen.addEventListener('pointercancel', () => { mausAktiv = false; }, { signal });

    const abmelden = ctx.farben.beobachte(() => { cache.fill(null); zeichne(); });
    zeichne();

    // ---------- Schnittstelle ----------
    const instanz = {
      getStand: () => L.zumSpeichern(z),
      zusammenfassung: () => (z.modus === 'level' && !z.weiter
        ? `Level ${z.level} · ${L.zaehleBloecke(z.feld)} Blöcke`
        : `Endlos · ${zahl(z.reihen)} Reihen`),
      kannRueckgaengig: () => Boolean(sim) || L.kannRueckgaengig(z),
      rueckgaengig() {
        if (sim) { abbrechenSchuss(); status.textContent = 'Schuss abgebrochen'; zeichne(); return; }
        const vorher = L.rueckgaengig(z);
        if (!vorher) return;
        z = vorher;
        status.textContent = 'Letzten Schuss zurückgenommen';
        zeichne();
        ctx.meldeAenderung();
      },
      hinweis() {
        if (sim) return;
        z = { ...z, winkel: L.besterWinkel(z) };
        zeichne();
        ctx.meldung('Vorschlag: so trifft der Schuss viel – Enter oder „Schießen“ löst ihn aus.');
      },
      neustart() {
        abbrechenSchuss();
        z = L.neuesSpiel(z.modus, { level: z.level, seed: z.seed });
        status.textContent = '';
        zeichne();
        ctx.meldeAenderung();
      },
      neu(variante) {
        abbrechenSchuss();
        z = neuesZ(variante === 'endlos' ? 'endlos' : (variante === 'level' ? 'level' : z.modus));
        status.textContent = '';
        zeichne();
      },
      weiterspielen() {
        z = L.weiterspielen(z);
        status.textContent = 'Es geht ohne Ziel weiter – neue Reihen kommen nach jedem Schuss.';
        zeichne();
        ctx.meldeAenderung();
      },
      onTaste(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return false;
        const k = e.key;
        if (k === 'b' || k === 'B') { setzeSchnell(!schnell); return true; }
        if (k === 'ArrowLeft' || k === 'ArrowRight') {
          if (sim) return true;
          const d = (k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 5 : 1);
          ziele(L.klemmeWinkel(z.winkel + d));
          return true;
        }
        if (k === 'Enter' || k === ' ') {
          if (e.target?.closest?.('button, a, input, select, textarea, dialog')) return false;
          schiessen();
          return true;
        }
        return false;
      },
      zerstoere() {
        zerstoert = true;
        cancelAnimationFrame(raf);
        sim = null;
        abmelden();
        container.replaceChildren();
      },
    };
    return instanz;
  },
};
