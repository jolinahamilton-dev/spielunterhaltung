// Block-Puzzle: Formen auf ein 8×8-Feld legen, volle Reihen und Spalten verschwinden.
// Bedienung: Ziehen (Maus/Finger) · Antippen + Tippen aufs Feld · Tastatur 1–3, Pfeile, Enter, Esc, J.
import { h, s, ladeStil } from '../../kern/dom.js';
import { FORM } from './formen.js';
import * as L from './logik.js';

const { N } = L;
const MODUS_NAME = { klassisch: 'Klassisch', entspannt: 'Entspannt' };
const zahl = (n) => n.toLocaleString('de-DE');

export default {
  id: 'block-puzzle',
  name: 'Block-Puzzle',
  beschreibung: 'Formen auf das Feld legen, volle Reihen und Spalten verschwinden.',
  variantenTitel: 'Modus',
  varianten: [
    { id: 'klassisch', name: 'Klassisch – endet, wenn nichts mehr passt' },
    { id: 'entspannt', name: 'Entspannt – endet nie' },
  ],
  standVersion: 1,

  erstelle(container, ctx, gespeichert) {
    ladeStil('spiele/block-puzzle/stil.css');
    const { signal } = ctx;

    let z = null;
    try { if (gespeichert && L.istGueltig(gespeichert)) z = L.ausSpeicher(gespeichert); } catch { z = null; }
    if (!z) z = L.neuesSpiel(ctx.neuerSeed(), ctx.variante ?? 'klassisch');

    let auswahl = null;      // { platz, x, y } – gewählte Form mit Vorschau-Position
    let hinweisAn = false;
    let zug = null;          // laufendes Ziehen
    let animation = 0;

    const rekorde = () => ctx.speicher.lies('rekorde', {}) || {};
    let neuerRekord = false;

    // ---------- DOM ----------
    const zellen = Array.from({ length: N * N }, (_, i) => h('div', { class: 'bp-zelle', dataset: { i } }));
    const feld = h('div', { class: 'bp-feld', role: 'grid', 'aria-label': 'Spielfeld 8 mal 8' }, zellen);
    const punkteEl = h('span', { class: 'bp-wert' });
    const rekordEl = h('span', { class: 'bp-wert' });
    const serieEl = h('span', { class: 'bp-serie' });
    const plaetze = [0, 1, 2].map((p) => h('button', {
      type: 'button', class: 'bp-platz', dataset: { platz: p },
    }));
    const jokerKnopf = h('button', { type: 'button', class: 'knopf klein bp-joker', on: { click: () => setzeJoker() } });
    const ende = h('div', { class: 'bp-ende', hidden: true, role: 'status', 'aria-live': 'polite' });
    const status = h('p', { class: 'bp-status leise', 'aria-live': 'polite' });

    const wurzel = h('div', { class: 'bp' },
      h('div', { class: 'bp-info' },
        h('div', { class: 'bp-zahl' }, h('span', { class: 'bp-label', text: 'Punkte' }), punkteEl),
        h('div', { class: 'bp-zahl' }, h('span', { class: 'bp-label', text: 'Rekord' }), rekordEl),
        serieEl,
      ),
      h('div', { class: 'bp-feld-rahmen' }, feld, ende),
      h('div', { class: 'bp-seite' },
        h('div', { class: 'bp-angebot', 'aria-label': 'Formen zum Legen' }, plaetze),
        h('div', { class: 'bp-aktionen' }, jokerKnopf, status),
      ),
    );
    container.append(wurzel);

    // ---------- Darstellung ----------
    function symbolSvg(farbe) {
      return s('svg', { viewBox: '0 0 10 10', class: 'bp-symbol', 'aria-hidden': 'true' },
        s('path', { d: ctx.farben.symbolPfad(farbe), 'fill-rule': 'evenodd' }));
    }

    function formGitter(formId, klasse) {
      const f = FORM[formId];
      const g = h('div', { class: klasse, style: { '--b': f.b, '--h': f.h } });
      for (const [x, y] of f.zellen) {
        g.append(h('span', {
          class: 'bp-stein', style: { gridColumn: x + 1, gridRow: y + 1, background: ctx.farben.css(f.farbe) },
        }, ctx.farben.musterAn() ? symbolSvg(f.farbe) : null));
      }
      return g;
    }

    function vorschauDaten() {
      const quelle = zug?.ziel ?? auswahl;
      if (!quelle || quelle.x === null || quelle.x === undefined) return null;
      const formId = z.angebot[quelle.platz];
      if (!formId) return null;
      return { ...L.vorschau(z.brett, formId, quelle.x, quelle.y), formId, ...quelle };
    }

    function zeichneFeld() {
      const v = vorschauDaten();
      const vorschauZellen = new Set(v?.gueltig ? v.zellen : []);
      const raeumt = new Set(v?.gueltig ? v.geraeumt : []);
      // ungültige Position: Umriss der Form trotzdem zeigen (grau)
      const ungueltig = new Set();
      if (v && !v.gueltig) {
        const f = FORM[v.formId];
        for (const [dx, dy] of f.zellen) {
          const x = v.x + dx, y = v.y + dy;
          if (x >= 0 && y >= 0 && x < N && y < N) ungueltig.add(y * N + x);
        }
      }
      const muster = ctx.farben.musterAn();
      zellen.forEach((el, i) => {
        const farbe = z.brett[i] ? z.brett[i] - 1 : null;
        const vorschau = vorschauZellen.has(i);
        const anzeigeFarbe = farbe ?? (vorschau ? FORM[v.formId].farbe : null);
        el.className = 'bp-zelle'
          + (farbe !== null ? ' belegt' : '')
          + (vorschau ? ' vorschau' : '')
          + (raeumt.has(i) ? ' raeumt' : '')
          + (ungueltig.has(i) ? ' ungueltig' : '');
        el.style.background = anzeigeFarbe !== null ? ctx.farben.css(anzeigeFarbe) : '';
        el.replaceChildren(muster && anzeigeFarbe !== null ? symbolSvg(anzeigeFarbe) : '');
      });
    }

    function zeichneAngebot() {
      plaetze.forEach((el, p) => {
        const formId = z.angebot[p];
        el.replaceChildren(formId ? formGitter(formId, 'bp-form') : '');
        el.disabled = !formId;
        const passt = formId ? L.passtIrgendwo(z.brett, formId) : true;
        el.classList.toggle('gewaehlt', auswahl?.platz === p);
        el.classList.toggle('gezogen', zug?.platz === p);
        el.classList.toggle('passt-nicht', Boolean(formId) && !passt);
        el.classList.toggle('hinweis', hinweisAn && auswahl?.platz === p);
        el.setAttribute('aria-label', formId
          ? `Form ${p + 1}: ${FORM[formId].name}, ${FORM[formId].zellen.length} ${FORM[formId].zellen.length === 1 ? 'Feld' : 'Felder'}${passt ? '' : ', passt nirgends'}`
          : `Platz ${p + 1}: leer`);
        el.setAttribute('aria-pressed', String(auswahl?.platz === p));
      });
    }

    function zeichneInfo() {
      const r = rekorde();
      if (z.punkte > (r[z.modus] || 0)) {
        r[z.modus] = z.punkte;
        ctx.speicher.schreibe('rekorde', r);
        neuerRekord = z.punkte > 0;
      }
      punkteEl.textContent = zahl(z.punkte);
      rekordEl.textContent = zahl(rekorde()[z.modus] || 0);
      serieEl.textContent = z.serie > 1 ? `Serie ×${L.serienFaktor(z.serie).toLocaleString('de-DE')}` : '';
      const unbegrenzt = z.joker === Infinity;
      jokerKnopf.textContent = unbegrenzt ? 'Neue Formen' : `Neue Formen (${z.joker})`;
      jokerKnopf.disabled = !(z.joker > 0);
      jokerKnopf.title = 'Joker: aktuelle Formen gegen neue tauschen (J)';
      status.textContent = z.modus === 'klassisch'
        ? `${MODUS_NAME[z.modus]} · Rückgängig noch ${z.rueckgaengigRest}×`
        : MODUS_NAME[z.modus];
    }

    function zeichneEnde() {
      if (!z.beendet) { ende.hidden = true; return; }
      const knoepfe = [];
      if (z.joker > 0) knoepfe.push(h('button', { type: 'button', class: 'knopf', on: { click: setzeJoker } }, `Joker einsetzen (${z.joker})`));
      if (L.kannRueckgaengig(z)) knoepfe.push(h('button', { type: 'button', class: 'knopf', on: { click: () => instanz.rueckgaengig() } }, 'Letzten Zug zurück'));
      knoepfe.push(h('button', { type: 'button', class: 'knopf primaer', on: { click: () => ctx.neuesSpiel() } }, 'Neues Spiel'));
      ende.replaceChildren(h('div', { class: 'bp-ende-karte' },
        h('p', { class: 'bp-ende-titel', text: 'Keine Form passt mehr' }),
        h('p', { class: 'bp-ende-punkte', text: `${zahl(z.punkte)} Punkte` }),
        neuerRekord ? h('p', { class: 'bp-ende-rekord', text: 'Neuer Rekord' }) : null,
        h('div', { class: 'bp-ende-knoepfe' }, knoepfe),
      ));
      ende.hidden = false;
    }

    function zeichne() {
      zeichneFeld();
      zeichneAngebot();
      zeichneInfo();
      zeichneEnde();
    }

    // ---------- Aktionen ----------
    function waehle(platz, { position = true } = {}) {
      if (z.beendet || !z.angebot[platz]) return;
      hinweisAn = false;
      if (auswahl?.platz === platz && !position) { auswahl = null; zeichne(); return; }
      const start = position ? L.startPosition(z.brett, z.angebot[platz]) : { x: null, y: null };
      auswahl = { platz, ...start };
      zeichne();
    }

    function lege(platz, x, y) {
      const vorherBrett = z.brett.slice();
      const formId = z.angebot[platz];
      const r = L.zug(z, platz, x, y);
      if (!r) return false;
      z = r.zustand;
      auswahl = null;
      hinweisAn = false;
      if (r.hinweis) ctx.meldung(r.hinweis);
      if (r.ergebnis.leer) ctx.meldung('Feld leer geräumt: +300');
      zeigeRaeumen(r.ergebnis.geraeumt, vorherBrett, formId);
      zeichne();
      ctx.meldeAenderung();
      return true;
    }

    // Abgeräumte Zellen kurz ausblenden (nur mit Animationen)
    function zeigeRaeumen(geraeumt, vorherBrett, formId) {
      clearTimeout(animation);
      if (!geraeumt.length || ctx.bewegungReduziert()) return;
      const farbeForm = FORM[formId].farbe;
      requestAnimationFrame(() => {
        for (const i of geraeumt) {
          const el = zellen[i];
          const farbe = vorherBrett[i] ? vorherBrett[i] - 1 : farbeForm;
          el.style.background = ctx.farben.css(farbe);
          el.classList.add('weg');
        }
        animation = setTimeout(() => zeichneFeld(), 260);
      });
    }

    function setzeJoker() {
      const r = L.joker(z);
      if (!r) return;
      z = r.zustand;
      auswahl = null;
      hinweisAn = false;
      if (r.hinweis) ctx.meldung(r.hinweis);
      zeichne();
      ctx.meldeAenderung();
    }

    // ---------- Ziehen mit Maus/Finger ----------
    function feldMasse() {
      const r = feld.getBoundingClientRect();
      return { links: r.left, oben: r.top, zelle: r.width / N };
    }

    function zielAusGeist(m, geistLinks, geistOben, formId) {
      const f = FORM[formId];
      const x = Math.round((geistLinks - m.links) / m.zelle);
      const y = Math.round((geistOben - m.oben) / m.zelle);
      // halbe Zelle Toleranz außerhalb, dann an den Rand schieben
      if (x < -0.5 * f.b || y < -0.5 * f.h || x > N - f.b / 2 || y > N - f.h / 2) return { x: null, y: null };
      return { x: Math.max(0, Math.min(N - f.b, x)), y: Math.max(0, Math.min(N - f.h, y)) };
    }

    plaetze.forEach((el, platz) => {
      ctx.eingabe.ziehen(el, {
        signal,
        schwelle: 6,
        start(e) {
          const formId = z.angebot[platz];
          if (!formId || z.beendet) return false;
          const m = feldMasse();
          const mini = el.querySelector('.bp-form').getBoundingClientRect();
          const f = FORM[formId];
          const miniZelle = mini.width / f.b;
          const fx = (e.clientX - mini.left) / miniZelle;
          const fy = (e.clientY - mini.top) / miniZelle;
          const touch = e.pointerType !== 'mouse';
          const geist = formGitter(formId, 'bp-geist');
          geist.style.setProperty('--zelle', `${m.zelle}px`);
          wurzel.append(geist);
          auswahl = null;
          hinweisAn = false;
          zug = { platz, formId, geist, fx, fy, touch, m, ziel: null };
          zeichneAngebot();
          return zug;
        },
        bewege(e, d) {
          const links = e.clientX - d.fx * d.m.zelle;
          const oben = e.clientY - d.fy * d.m.zelle - (d.touch ? 1.5 * d.m.zelle : 0);
          d.geist.style.transform = `translate(${links}px, ${oben}px)`;
          const ziel = zielAusGeist(d.m, links, oben, d.formId);
          d.ziel = ziel.x === null ? null : { platz: d.platz, ...ziel };
          zeichneFeld();
        },
        ablegen(e, d) {
          const ziel = d.ziel;
          d.geist.remove();
          zug = null;
          if (!ziel || !lege(ziel.platz, ziel.x, ziel.y)) zeichne();
        },
        abbrechen(d) {
          d.geist.remove();
          zug = null;
          zeichne();
        },
      });
      // Antippen ohne Ziehen: Form wählen (Vorschau folgt Maus bzw. Tippen aufs Feld)
      ctx.eingabe.zeiger(el, {
        signal,
        tippen: (e) => waehle(platz, { position: e.pointerType !== 'mouse' }),
        rechts: () => { auswahl = null; zeichne(); },
      });
    });

    function zelleUnter(e) {
      const m = feldMasse();
      const sx = Math.floor((e.clientX - m.links) / m.zelle);
      const sy = Math.floor((e.clientY - m.oben) / m.zelle);
      if (sx < 0 || sy < 0 || sx >= N || sy >= N) return null;
      return { sx, sy };
    }
    function zentriert(formId, { sx, sy }) {
      const f = FORM[formId];
      return {
        x: Math.max(0, Math.min(N - f.b, sx - Math.floor((f.b - 1) / 2))),
        y: Math.max(0, Math.min(N - f.h, sy - Math.floor((f.h - 1) / 2))),
      };
    }

    // Maus: Vorschau folgt dem Zeiger, solange eine Form gewählt ist
    feld.addEventListener('pointermove', (e) => {
      if (!auswahl || zug || e.pointerType !== 'mouse') return;
      const c = zelleUnter(e);
      if (!c) return;
      const p = zentriert(z.angebot[auswahl.platz], c);
      if (p.x !== auswahl.x || p.y !== auswahl.y) { auswahl = { ...auswahl, ...p }; hinweisAn = false; zeichneFeld(); }
    }, { signal });

    // Tippen aufs Feld: Vorschau dorthin – zweites Tippen auf dieselbe Stelle legt ab
    ctx.eingabe.zeiger(feld, {
      signal,
      tippen(e) {
        if (!auswahl) return;
        const c = zelleUnter(e);
        if (!c) return;
        const p = zentriert(z.angebot[auswahl.platz], c);
        const gleich = p.x === auswahl.x && p.y === auswahl.y;
        if (gleich || e.pointerType === 'mouse') {
          if (!lege(auswahl.platz, p.x, p.y)) { auswahl = { ...auswahl, ...p }; zeichne(); }
        } else {
          auswahl = { ...auswahl, ...p };
          hinweisAn = false;
          zeichne();
        }
      },
      rechts: () => { auswahl = null; zeichne(); },
    });

    zeichne();

    // ---------- Schnittstelle ----------
    const instanz = {
      getStand: () => L.zumSpeichern(z),
      zusammenfassung: () => `${MODUS_NAME[z.modus]} · ${zahl(z.punkte)} Punkte${z.beendet ? ' · beendet' : ''}`,
      kannRueckgaengig: () => L.kannRueckgaengig(z),
      rueckgaengig() {
        const vorher = L.rueckgaengig(z);
        if (!vorher) return;
        z = vorher;
        auswahl = null;
        hinweisAn = false;
        zeichne();
        ctx.meldeAenderung();
      },
      hinweis() {
        if (z.beendet) return;
        const t = L.hinweis(z);
        if (!t) return;
        auswahl = { platz: t.platz, x: t.x, y: t.y };
        hinweisAn = true;
        zeichne();
        ctx.meldung('Vorschlag gezeigt – Enter oder Tippen legt die Form ab.');
      },
      neustart() {
        z = L.neuesSpiel(z.seed, z.modus);
        auswahl = null;
        neuerRekord = false;
        zeichne();
        ctx.meldeAenderung();
      },
      neu(variante) {
        z = L.neuesSpiel(ctx.neuerSeed(), variante ?? z.modus);
        auswahl = null;
        neuerRekord = false;
        zeichne();
      },
      onTaste(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return false;
        const k = e.key;
        if (['1', '2', '3'].includes(k)) {
          const p = Number(k) - 1;
          if (auswahl?.platz === p) { auswahl = null; zeichne(); } else waehle(p);
          return true;
        }
        if (k === 'j' || k === 'J') { setzeJoker(); return true; }
        if (k === 'Escape' && auswahl) { auswahl = null; zeichne(); return true; }
        if (k.startsWith('Arrow')) {
          if (!auswahl || auswahl.x === null) {
            const p = z.angebot.findIndex(Boolean);
            if (p >= 0) waehle(auswahl?.platz ?? p);
            return true;
          }
          const f = FORM[z.angebot[auswahl.platz]];
          const dx = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0;
          const dy = k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0;
          auswahl = {
            ...auswahl,
            x: Math.max(0, Math.min(N - f.b, auswahl.x + dx)),
            y: Math.max(0, Math.min(N - f.h, auswahl.y + dy)),
          };
          hinweisAn = false;
          zeichne();
          return true;
        }
        if ((k === 'Enter' || k === ' ') && auswahl && auswahl.x !== null) {
          if (!lege(auswahl.platz, auswahl.x, auswahl.y)) ctx.meldung('Hier passt die Form nicht.');
          return true;
        }
        return false;
      },
      zerstoere() {
        clearTimeout(animation);
        zug?.geist.remove();
        abmelden();
        container.replaceChildren();
      },
    };

    const abmelden = ctx.farben.beobachte(() => zeichne());
    return instanz;
  },
};
