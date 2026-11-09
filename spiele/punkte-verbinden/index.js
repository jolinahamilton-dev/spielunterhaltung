// Punkte verbinden: gleichfarbige Nachbarpunkte zu Ketten verbinden, Schleifen räumen eine ganze Farbe.
// Bedienung: Ziehen mit Maus/Finger · Tastatur: Pfeile bewegen, Leertaste setzt/entfernt ein Glied, Enter bestätigt, Esc verwirft.
import { h, s, ladeStil } from '../../kern/dom.js';
import * as L from './logik.js';

const NS_LEVEL = 'level';
const ABTAST_SCHRITT = 0.2;       // in Zellenbreiten: Zeigerweg wird so fein abgetastet
const TREFFER_RADIUS = 0.46;      // Zellenbreiten vom Mittelpunkt – Ecken zählen nicht (kein Diagonal-Treffer)
const ANIMATION_MS = 230;
const zahl = (n) => n.toLocaleString('de-DE');
const STUFEN_NAME = { endlos: 'Endlos', leicht: 'Leicht', mittel: 'Mittel', schwer: 'Schwer' };

export default {
  id: 'punkte-verbinden',
  name: 'Punkte verbinden',
  beschreibung: 'Gleichfarbige Punkte zu Ketten verbinden und Ziele sammeln.',
  variantenTitel: 'Spielart',
  varianten: [
    { id: 'endlos', name: 'Entspannt – endlos, ohne Ziele' },
    { id: 'leicht', name: 'Leicht – 6 × 6, 4 Farben' },
    { id: 'mittel', name: 'Mittel – 6 × 7, 5 Farben' },
    { id: 'schwer', name: 'Schwer – 7 × 8, 5 Farben' },
  ],
  standVersion: 1,

  erstelle(container, ctx, gespeichert) {
    ladeStil('spiele/punkte-verbinden/stil.css');
    const { signal } = ctx;

    // ---------- Stufen-Zähler (Level je Stufe) und Rekord ----------
    function naechstesLevel(stufe) {
      const g = ctx.speicher.lies(NS_LEVEL, {});
      const n = g && typeof g === 'object' ? g[stufe] : 0;
      return Number.isInteger(n) && n >= 1 && n <= L.LEVEL_MAX ? n : 1;
    }
    function merkeLevel(stufe, level) {
      const g = ctx.speicher.lies(NS_LEVEL, {});
      const daten = g && typeof g === 'object' && !Array.isArray(g) ? { ...g } : {};
      daten[stufe] = Math.min(level, L.LEVEL_MAX);
      ctx.speicher.schreibe(NS_LEVEL, daten);
    }
    const rekordLesen = () => {
      const r = ctx.speicher.lies('rekord', 0);
      return Number.isInteger(r) && r >= 0 ? r : 0;
    };

    function frischesSpiel(variante, seed = ctx.neuerSeed(), level = null) {
      const v = L.VARIANTEN.includes(variante) ? variante : 'endlos';
      return L.neuesSpiel({ variante: v, seed, level: level ?? naechstesLevel(v) });
    }

    let z = L.ausSpeicher(gespeichert);
    if (!z) z = frischesSpiel(ctx.variante);

    let pfad = [];                 // Kette, die gerade gebildet wird
    let hinweisPfad = null;        // gezeigter Vorschlag
    let cursor = { x: z.b >> 1, y: z.hh >> 1 };
    let tastaturAn = false;
    let gemeldet = false;          // Gewinn schon gemeldet
    let steckt = false;            // Festgefahren-Meldung schon gezeigt
    let zieher = null;             // laufendes Ziehen
    let neuerRekord = false;
    const timer = new Set();
    const spaeter = (fn, ms) => { const t = setTimeout(() => { timer.delete(t); fn(); }, ms); timer.add(t); };

    // ---------- DOM ----------
    const feld = h('div', { class: 'pv-feld', role: 'grid', tabindex: '0', 'aria-label': 'Spielfeld' });
    const linien = s('svg', { class: 'pv-linien', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
    const geisterEl = h('div', { class: 'pv-geister', 'aria-hidden': 'true' });
    const rahmen = h('div', { class: 'pv-rahmen' }, feld, linien, geisterEl);
    const zieleEl = h('div', { class: 'pv-ziele', role: 'list', 'aria-label': 'Ziele' });
    const levelEl = h('span', { class: 'pv-level' });
    const vorschauEl = h('p', { class: 'pv-vorschau leise' });
    const statusEl = h('p', { class: 'pv-status', role: 'status', 'aria-live': 'polite' });
    const mischKnopf = h('button', { type: 'button', class: 'knopf klein pv-misch', on: { click: () => mische() } }, 'Neu mischen');
    const wurzel = h('div', { class: 'pv' },
      h('div', { class: 'pv-kopf' }, levelEl, zieleEl),
      rahmen,
      h('div', { class: 'pv-fuss' }, vorschauEl, statusEl, mischKnopf),
    );
    container.append(wurzel);

    let zellen = [];
    let gebaut = '';

    function baueFeld() {
      const schluessel = `${z.b}x${z.hh}`;
      if (schluessel === gebaut) return;
      gebaut = schluessel;
      wurzel.style.setProperty('--b', String(z.b));
      wurzel.style.setProperty('--hh', String(z.hh));
      feld.style.setProperty('--b', String(z.b));
      feld.style.setProperty('--hh', String(z.hh));
      linien.setAttribute('viewBox', `0 0 ${z.b} ${z.hh}`);
      feld.setAttribute('aria-label', `Spielfeld ${z.b} mal ${z.hh}`);
      zellen = Array.from({ length: z.b * z.hh }, (_, i) => h('div', {
        class: 'pv-zelle', role: 'gridcell',
      }, h('span', { class: 'pv-punkt' })));
      feld.replaceChildren(...zellen);
    }

    // ---------- Darstellung ----------
    const farbName = (id) => ctx.farben.liste[id]?.name ?? 'Farbe';
    const farbeRest = (id) => (z.rest ? z.rest[z.farben.indexOf(id)] : null);

    function symbolSvg(farbe) {
      return s('svg', { viewBox: '0 0 10 10', class: 'pv-symbol', 'aria-hidden': 'true' },
        s('path', { d: ctx.farben.symbolPfad(farbe), 'fill-rule': 'evenodd' }));
    }

    function zeichneFeld(fall = null) {
      baueFeld();
      const muster = ctx.farben.musterAn();
      const imPfad = new Set(pfad);
      const hinweisSet = new Set(hinweisPfad?.pfad ?? []);
      const cur = cursor.y * z.b + cursor.x;
      zellen.forEach((el, i) => {
        const f = z.brett[i];
        const x = i % z.b, y = Math.floor(i / z.b);
        el.className = 'pv-zelle'
          + (imPfad.has(i) ? ' im-pfad' : '')
          + (hinweisSet.has(i) ? ' hinweis' : '')
          + (tastaturAn && i === cur ? ' cursor' : '');
        el.setAttribute('aria-label', `${farbName(f)}, Zeile ${y + 1}, Spalte ${x + 1}${imPfad.has(i) ? ', in der Kette' : ''}`);
        const punkt = el.firstChild;
        punkt.style.background = ctx.farben.css(f);
        punkt.className = 'pv-punkt';
        punkt.style.removeProperty('--fall');
        if (fall && fall[i] > 0) {
          punkt.style.setProperty('--fall', String(fall[i]));
          punkt.classList.add('faellt');
        }
        punkt.replaceChildren(...(muster ? [symbolSvg(f)] : []));
      });
    }

    function zeichneLinie() {
      linien.replaceChildren();
      const zeige = (liste, klasse) => {
        if (liste.length < 2) return;
        const pkt = liste.map((i) => `${(i % z.b) + 0.5},${Math.floor(i / z.b) + 0.5}`).join(' ');
        const farbe = ctx.farben.css(z.brett[liste[0]]);
        linien.append(
          s('polyline', { points: pkt, class: `pv-unterlage ${klasse}` }),
          s('polyline', { points: pkt, class: `pv-linie ${klasse}`, style: { stroke: farbe } }),
        );
      };
      if (hinweisPfad && !pfad.length) zeige(hinweisPfad.pfad, 'hinweis');
      zeige(pfad, L.schliesst(pfad) ? 'schleife' : '');
      // Vorschau-Text
      if (pfad.length >= 2) {
        const f = z.brett[pfad[0]];
        vorschauEl.textContent = L.schliesst(pfad)
          ? `Schleife – alle Punkte in ${farbName(f)} (${zahl(L.betroffen(z.brett, z.b, z.hh, pfad).length)})`
          : `Kette aus ${zahl(new Set(pfad).size)} Punkten`;
      } else if (hinweisPfad) {
        vorschauEl.textContent = hinweisPfad.schleife
          ? `Vorschlag: Schleife, ${zahl(hinweisPfad.anzahl)} Punkte`
          : `Vorschlag: ${zahl(hinweisPfad.anzahl)} Punkte`;
      } else {
        vorschauEl.textContent = '';
      }
    }

    function zeichneKopf() {
      if (z.rest && !z.weiter) {
        levelEl.textContent = `Level ${zahl(z.level)}`;
        levelEl.hidden = false;
        zieleEl.replaceChildren(...z.farben.map((f, k) => {
          const rest = z.rest[k];
          const punkt = h('span', { class: 'pv-ziel-punkt', style: { background: ctx.farben.css(f) } },
            ctx.farben.musterAn() ? symbolSvg(f) : null);
          return h('div', {
            class: `pv-ziel${rest === 0 ? ' fertig' : ''}`, role: 'listitem',
            'aria-label': rest === 0 ? `${farbName(f)}: Ziel erreicht` : `${farbName(f)}: noch ${rest}`,
          }, punkt, h('span', { class: 'pv-ziel-zahl', text: rest === 0 ? '✓' : String(rest) }));
        }));
      } else {
        levelEl.textContent = z.weiter ? `Ohne Ziel · Level ${zahl(z.level)}` : '';
        levelEl.hidden = !z.weiter;
        const rekord = Math.max(rekordLesen(), z.weiter ? 0 : z.gesammelt);
        zieleEl.replaceChildren(
          h('div', { class: 'pv-zaehler', role: 'listitem' }, h('span', { class: 'pv-label', text: 'Gesammelt' }), h('span', { class: 'pv-wert', text: zahl(z.gesammelt) })),
          ...(z.weiter ? [] : [h('div', { class: 'pv-zaehler', role: 'listitem' }, h('span', { class: 'pv-label', text: 'Rekord' }), h('span', { class: 'pv-wert', text: zahl(rekord) }))]),
        );
      }
    }

    function zeichneStatus() {
      const stuck = L.festgefahren(z.brett, z.b, z.hh) && !gemeldet;
      statusEl.textContent = stuck ? 'Kein Zug mehr – Rückgängig oder Neu mischen' : '';
      statusEl.classList.toggle('warnung', stuck);
      mischKnopf.classList.toggle('primaer', stuck);
      mischKnopf.disabled = gemeldet;
      if (stuck && !steckt) ctx.meldung('Kein Zug mehr – Rückgängig oder Neu mischen');
      steckt = stuck;
    }

    function zeichne(fall = null) {
      zeichneFeld(fall);
      zeichneLinie();
      zeichneKopf();
      zeichneStatus();
    }

    // ---------- Aktionen ----------
    function leere() {
      pfad = [];
      hinweisPfad = null;
      zeichneFeld();
      zeichneLinie();
    }

    function zeigeGeister(entfernt, altesBrett) {
      if (ctx.bewegungReduziert() || !entfernt.length) return;
      for (const i of entfernt) {
        const x = i % z.b, y = Math.floor(i / z.b);
        const g = h('span', { class: 'pv-geist', style: {
          left: `${(x * 100) / z.b}%`, top: `${(y * 100) / z.hh}%`,
          width: `${100 / z.b}%`, height: `${100 / z.hh}%`,
        } }, h('span', { class: 'pv-punkt', style: { background: ctx.farben.css(altesBrett[i]) } },
          ctx.farben.musterAn() ? symbolSvg(altesBrett[i]) : null));
        geisterEl.append(g);
        spaeter(() => g.remove(), ANIMATION_MS);
      }
    }

    function bestaetige(liste) {
      if (gemeldet) return false;
      pfad = [];
      hinweisPfad = null;
      const r = L.zug(z, liste);
      if (!r) { zeichneFeld(); zeichneLinie(); return false; }
      z = r.zustand;
      if (r.schleife) ctx.meldung(`Schleife! Alle Punkte in ${farbName(r.farbe)} verschwinden (${zahl(r.entfernt.length)}).`);
      zeigeGeister(r.entfernt, r.altesBrett);
      zeichne(ctx.bewegungReduziert() ? null : r.fall);
      if (z.variante === 'endlos' && z.gesammelt > rekordLesen()) {
        ctx.speicher.schreibe('rekord', z.gesammelt);
        neuerRekord = true;
      }
      ctx.meldeAenderung();
      pruefeGewonnen();
      return true;
    }

    function pruefeGewonnen() {
      if (gemeldet || !L.gewonnen(z)) return;
      gemeldet = true;
      pfad = [];
      hinweisPfad = null;
      merkeLevel(z.variante, z.level + 1);
      zeichne();
      ctx.meldeGewonnen(`Level ${zahl(z.level)} geschafft – ${STUFEN_NAME[z.variante]}, ${zahl(z.zuege)} Züge. Weiter mit Level ${zahl(z.level + 1)}.`, { weiterspielen: true });
    }

    function mische() {
      if (gemeldet) return;
      pfad = [];
      hinweisPfad = null;
      z = L.umordnen(z);
      zeichne();
      if (!ctx.bewegungReduziert()) {
        feld.classList.remove('mischt');
        void feld.offsetWidth;
        feld.classList.add('mischt');
        spaeter(() => feld.classList.remove('mischt'), ANIMATION_MS);
      }
      ctx.meldeAenderung();
    }

    // ---------- Ziehen mit Maus/Finger ----------
    function zelleBei(clientX, clientY, streng) {
      const r = feld.getBoundingClientRect();
      if (!r.width || !r.height) return -1;
      const fx = ((clientX - r.left) / r.width) * z.b;
      const fy = ((clientY - r.top) / r.height) * z.hh;
      const sx = Math.floor(fx), sy = Math.floor(fy);
      if (sx < 0 || sy < 0 || sx >= z.b || sy >= z.hh) return -1;
      if (streng && Math.hypot(fx - sx - 0.5, fy - sy - 0.5) > TREFFER_RADIUS) return -1;
      return sy * z.b + sx;
    }

    function folge(clientX, clientY, von) {
      // Strecke vom letzten Zeigerpunkt zum aktuellen in kleinen Schritten abtasten
      const r = feld.getBoundingClientRect();
      const zb = r.width / z.b || 1;
      const dx = clientX - von.x, dy = clientY - von.y;
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (zb * ABTAST_SCHRITT)));
      let geaendert = false;
      for (let k = 1; k <= n; k++) {
        const i = zelleBei(von.x + (dx * k) / n, von.y + (dy * k) / n, true);
        if (i < 0 || !pfad.length) continue;
        const neu = L.pfadSchritt(z.brett, z.b, z.hh, pfad, i);
        if (neu) { pfad = neu; geaendert = true; }
      }
      if (geaendert) { zeichneFeld(); zeichneLinie(); }
    }

    ctx.eingabe.ziehen(feld, {
      signal,
      schwelle: 0,
      start(e) {
        if (gemeldet) return false;
        const i = zelleBei(e.clientX, e.clientY, false);
        if (i < 0) return false;
        tastaturAn = false;
        hinweisPfad = null;
        pfad = [i];
        zeichneFeld();
        zeichneLinie();
        zieher = { x: e.clientX, y: e.clientY };
        return zieher;
      },
      bewege(e, d) {
        folge(e.clientX, e.clientY, d);
        d.x = e.clientX; d.y = e.clientY;
      },
      ablegen(e, d) {
        folge(e.clientX, e.clientY, d);
        zieher = null;
        const liste = pfad;
        if (liste.length >= 2) bestaetige(liste);
        else leere();
      },
      abbrechen() {
        zieher = null;
        leere();
      },
    });

    feld.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    feld.addEventListener('focus', () => {
      try { if (feld.matches(':focus-visible')) { tastaturAn = true; zeichneFeld(); } } catch { /* egal */ }
    }, { signal });
    feld.addEventListener('blur', () => { if (tastaturAn) { tastaturAn = false; zeichneFeld(); } }, { signal });

    // ---------- Tastatur ----------
    function leertaste() {
      const i = cursor.y * z.b + cursor.x;
      hinweisPfad = null;
      if (!pfad.length) {
        pfad = [i];
      } else if (pfad[pfad.length - 1] === i) {
        pfad = pfad.length > 1 ? pfad.slice(0, -1) : [];
      } else {
        const neu = L.pfadSchritt(z.brett, z.b, z.hh, pfad, i);
        if (neu) pfad = neu;
        else ctx.meldung('Dieses Feld passt nicht an die Kette (anderer Nachbar, andere Farbe oder Kante schon benutzt).');
      }
      zeichneFeld();
      zeichneLinie();
    }

    function onTaste(e) {
      if (e.ctrlKey || e.metaKey || e.altKey || gemeldet) return false;
      const k = e.key;
      const aufKnopf = e.target instanceof HTMLElement && e.target.closest('button, a, input, select');
      if (k.startsWith('Arrow')) {
        tastaturAn = true;
        hinweisPfad = null;
        const dx = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0;
        const dy = k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0;
        cursor = { x: Math.max(0, Math.min(z.b - 1, cursor.x + dx)), y: Math.max(0, Math.min(z.hh - 1, cursor.y + dy)) };
        zeichneFeld();
        zeichneLinie();
        return true;
      }
      if (k === ' ' || k === 'Spacebar') {
        if (aufKnopf) return false;
        tastaturAn = true;
        leertaste();
        return true;
      }
      if (k === 'Enter') {
        if (aufKnopf) return false;
        if (pfad.length >= 2) { bestaetige(pfad); return true; }
        if (!pfad.length && hinweisPfad) { bestaetige(hinweisPfad.pfad); return true; }
        ctx.meldung('Mit der Leertaste mindestens zwei gleichfarbige Nachbarn verbinden, dann Enter.');
        return true;
      }
      if (k === 'Escape' && (pfad.length || hinweisPfad)) { leere(); return true; }
      return false;
    }

    zeichne();
    if (L.gewonnen(z)) spaeter(() => pruefeGewonnen(), 0);

    // ---------- Schnittstelle ----------
    const instanz = {
      getStand: () => L.zumSpeichern(z),
      zusammenfassung: () => (z.rest && z.weiter ? `${STUFEN_NAME[z.variante]} · ohne Ziel · ${zahl(z.gesammelt)} gesammelt` : z.rest
        ? `${STUFEN_NAME[z.variante]} · Level ${zahl(z.level)} · noch ${zahl(z.rest.reduce((a, r) => a + r, 0))} Punkte`
        : `Endlos · ${zahl(z.gesammelt)} gesammelt`),
      weiterspielen() {
        if (!z.rest) return;
        z = L.weiterspielen(z);
        gemeldet = false;
        steckt = false;
        pfad = [];
        hinweisPfad = null;
        zeichne();
        ctx.meldeAenderung();
      },
      kannRueckgaengig: () => !gemeldet && L.kannRueckgaengig(z),
      rueckgaengig() {
        if (gemeldet) return;
        const v = L.rueckgaengig(z);
        if (!v) return;
        z = v;
        pfad = [];
        hinweisPfad = null;
        zeichne();
        ctx.meldeAenderung();
      },
      hinweis() {
        if (gemeldet) return;
        const t = L.hinweis(z);
        pfad = [];
        hinweisPfad = t;
        zeichneFeld();
        zeichneLinie();
        ctx.meldung(t ? 'Vorschlag gezeigt – Enter legt ihn, Esc verwirft ihn.' : 'Kein Zug mehr – Rückgängig oder Neu mischen');
      },
      neustart() {
        z = L.neuesSpiel({ variante: z.variante, seed: z.seed, level: z.level });
        pfad = [];
        hinweisPfad = null;
        gemeldet = false;
        steckt = false;
        neuerRekord = false;
        zeichne();
        ctx.meldeAenderung();
      },
      neu(variante) {
        z = frischesSpiel(variante ?? z.variante);
        pfad = [];
        hinweisPfad = null;
        gemeldet = false;
        steckt = false;
        neuerRekord = false;
        cursor = { x: z.b >> 1, y: z.hh >> 1 };
        zeichne();
      },
      onTaste,
      zerstoere() {
        timer.forEach(clearTimeout);
        timer.clear();
        abmelden();
        container.replaceChildren();
      },
    };

    const abmelden = ctx.farben.beobachte(() => zeichne());
    return instanz;
  },
};
