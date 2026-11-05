// Bild abtragen: farbige Sammler tragen ein Pixelbild Stück für Stück ab.
// Bedienung: Klick/Tippen auf den vordersten Sammler einer Kolonne · Tastatur 1–4, ←/→ + Enter.
import { h, s, ladeStil } from '../../kern/dom.js';
import * as L from './logik.js';

const SCHRITT_MS = 110;      // eine Arbeitsrunde in der Animation
const VORSCHAU = 3;          // so viele Sammler hinter dem vordersten werden gezeigt

let motiveLaden = null;
/** motive.json einmal laden (bei Fehler: nur Mosaike) */
function ladeMotive() {
  motiveLaden ??= fetch(new URL('./motive.json', import.meta.url))
    .then((r) => (r.ok ? r.json() : []))
    .then((m) => (Array.isArray(m) ? m : []))
    .catch(() => { motiveLaden = null; return []; });
  return motiveLaden;
}

export default {
  id: 'bild-abtragen',
  name: 'Bild abtragen',
  beschreibung: 'Farbige Sammler tragen ein Pixelbild Stück für Stück ab.',
  variantenTitel: 'Schwierigkeit',
  varianten: [
    { id: 'leicht', name: 'Leicht – 3 Farben, 6 Arbeitsplätze' },
    { id: 'mittel', name: 'Mittel – 4–5 Farben, 5 Arbeitsplätze' },
    { id: 'schwer', name: 'Schwer – 5–6 Farben, 4 Arbeitsplätze' },
  ],
  standVersion: 1,

  erstelle(container, ctx, gespeichert) {
    ladeStil('spiele/bild-abtragen/stil.css');

    let z = null;
    try { z = gespeichert ? L.ausSpeicher(gespeichert) : null; } catch { z = null; }
    if (z && L.gewonnen(z)) z = null;

    let anim = null;          // laufende Animation { view, runden, schritt, timer, gewinn }
    let tipp = null;          // hervorgehobene Kolonne (Hinweis)
    let bekannt = [];         // zuletzt gefundener Lösungsweg { zuege, weg }
    let hinweisText = '';
    let erzeugung = 0;
    let zerstoert = false;

    // ---------- DOM ----------
    const titelEl = h('span', { class: 'ba-titel' });
    const restEl = h('span', { class: 'ba-rest leise' });
    const bildEl = h('div', { class: 'ba-bild', role: 'img' });
    const festEl = h('div', { class: 'ba-fest', hidden: true, role: 'status', 'aria-live': 'polite' });
    const ladenEl = h('p', { class: 'ba-laden leise', hidden: true, text: 'Bild wird vorbereitet …' });
    const rahmen = h('div', { class: 'ba-bild-rahmen' }, bildEl, ladenEl, festEl);
    const plaetzeEl = h('div', { class: 'ba-plaetze', role: 'list', 'aria-label': 'Arbeitsplätze' });
    const kolonnenEl = h('div', { class: 'ba-kolonnen', role: 'group', 'aria-label': 'Kolonnen – vordersten Sammler antippen' });

    const wurzel = h('div', { class: 'ba' },
      h('div', { class: 'ba-info' }, titelEl, restEl),
      rahmen,
      plaetzeEl,
      kolonnenEl,
    );
    container.append(wurzel);

    let zellen = [];
    let zellKey = [];
    let kolKnoepfe = [];
    let gebaut = '';

    // ---------- Darstellung ----------
    const farbName = (f) => ctx.farben.liste[f]?.name ?? `Farbe ${f + 1}`;

    function symbolSvg(f, klasse) {
      return s('svg', { viewBox: '0 0 10 10', class: klasse, 'aria-hidden': 'true' },
        s('path', { d: ctx.farben.symbolPfad(f), 'fill-rule': 'evenodd' }));
    }

    function sammlerEl(f, zahl, klasse = '') {
      return h('span', { class: `ba-sammler ${klasse}`, style: { background: ctx.farben.css(f) } },
        ctx.farben.musterAn() ? symbolSvg(f, 'ba-sammler-symbol') : null,
        h('span', { class: 'ba-zahl', text: String(zahl) }));
    }

    /** Bildraster und Kolonnen-Knöpfe passend zum Level anlegen */
    function baue() {
      const sig = `${z.b}x${z.h}|${z.kolonnen.length}`;
      if (sig === gebaut) return;
      gebaut = sig;
      bildEl.style.setProperty('--b', String(z.b));
      bildEl.style.setProperty('--h', String(z.h));
      bildEl.style.setProperty('--n', String(Math.max(z.b, z.h)));
      zellen = Array.from({ length: z.b * z.h }, () => h('span', { class: 'ba-px' }));
      zellKey = zellen.map(() => '');
      bildEl.replaceChildren(...zellen);
      kolKnoepfe = z.kolonnen.map((_, k) => h('button', {
        type: 'button', class: 'ba-kolonne', dataset: { k },
        on: { click: () => tippeKolonne(k) },
      }));
      kolonnenEl.replaceChildren(...kolKnoepfe);
    }

    function zeichneBild(rest, weg = null, fertig = false) {
      const muster = ctx.farben.musterAn();
      for (let i = 0; i < zellen.length; i++) {
        const f = rest[i];
        let klasse, farbe = null;
        if (fertig) {
          farbe = z.bild[i] >= 0 ? z.bild[i] : null;
          klasse = farbe !== null ? 'ba-px frei' : 'ba-px luft';
        } else if (f >= 0) {
          farbe = f;
          klasse = L.istFrei(rest, z.b, z.h, i) ? 'ba-px frei' : 'ba-px';
        } else if (weg?.has(i)) {
          farbe = z.bild[i];
          klasse = 'ba-px weg';
        } else {
          klasse = z.bild[i] >= 0 ? 'ba-px leer' : 'ba-px luft';
        }
        const key = `${klasse}|${farbe}|${muster}`;
        if (zellKey[i] === key) continue;
        zellKey[i] = key;
        const el = zellen[i];
        el.className = klasse;
        el.style.background = farbe !== null ? ctx.farben.css(farbe) : '';
        el.replaceChildren(muster && farbe !== null ? symbolSvg(farbe, 'ba-px-symbol') : '');
      }
      rahmen.classList.toggle('fertig', fertig);
    }

    function zeichnePlaetze(plaetze, ruhig) {
      plaetzeEl.replaceChildren(...plaetze.map((sm, p) => {
        if (!sm) return h('div', { class: 'ba-platz leer', role: 'listitem', 'aria-label': `Platz ${p + 1}: frei` });
        const w = ruhig && L.freiesPixel(z.rest, z.b, z.h, sm[0]) < 0;
        return h('div', {
          class: `ba-platz${w ? ' wartet' : ''}`, role: 'listitem',
          title: w ? 'wartet auf ein freies Pixel seiner Farbe' : null,
          'aria-label': `Platz ${p + 1}: ${farbName(sm[0])}, noch ${sm[2]} von ${sm[1]}${w ? ', wartet' : ''}`,
        }, sammlerEl(sm[0], sm[2]));
      }));
    }

    function zeichneKolonnen() {
      const platzFrei = z.plaetze.includes(null) && !L.gewonnen(z);
      z.kolonnen.forEach((kol, k) => {
        const knopf = kolKnoepfe[k];
        const pos = z.pos[k];
        const vorne = kol[pos];
        const dahinter = kol.slice(pos + 1, pos + 1 + VORSCHAU);
        const mehr = kol.length - pos - 1 - dahinter.length;
        knopf.replaceChildren(
          h('span', { class: 'ba-kol-nr', 'aria-hidden': 'true', text: String(k + 1) }),
          vorne ? sammlerEl(vorne[0], vorne[1], `gross${tipp === k ? ' ba-tipp' : ''}`) : h('span', { class: 'ba-sammler gross leer' }),
          h('span', { class: 'ba-folge', 'aria-hidden': 'true' },
            dahinter.map(([f, n]) => sammlerEl(f, n, 'klein')),
            mehr > 0 ? h('span', { class: 'ba-mehr leise', text: `+${mehr}` }) : null),
        );
        const anzahl = kol.length - pos - 1;
        knopf.setAttribute('aria-label', vorne
          ? `Kolonne ${k + 1}: ${farbName(vorne[0])} mit ${vorne[1]}${anzahl > 0 ? `, dahinter ${anzahl} weitere` : ''}${tipp === k ? ' – Tipp' : ''}`
          : `Kolonne ${k + 1}: leer`);
        const aktiv = Boolean(vorne) && platzFrei;
        knopf.setAttribute('aria-disabled', String(!aktiv));
        knopf.classList.toggle('inaktiv', !aktiv);
        knopf.classList.toggle('leer', !vorne);
      });
    }

    function zeichneInfo() {
      const rest = L.restPixel(z);
      titelEl.textContent = `Level ${z.level} · ${z.titel}`;
      restEl.textContent = rest ? `${rest} Pixel übrig` : 'Bild abgetragen';
      bildEl.setAttribute('aria-label', `Bild ${z.titel}, ${z.b} mal ${z.h} Pixel, noch ${rest} übrig`);
    }

    function zeichneFest() {
      const fest = !anim && L.festgefahren(z);
      festEl.hidden = !fest;
      if (!fest) return;
      festEl.replaceChildren(h('div', { class: 'ba-fest-karte' },
        h('p', { class: 'ba-fest-titel', text: 'Festgefahren – mit Rückgängig geht es weiter' }),
        hinweisText ? h('p', { class: 'leise', text: hinweisText }) : null,
        h('div', { class: 'ba-fest-knoepfe' },
          h('button', { type: 'button', class: 'knopf primaer', on: { click: () => { instanz.rueckgaengig(); } } }, 'Rückgängig'),
          h('button', { type: 'button', class: 'knopf', on: { click: () => { instanz.neustart(); } } }, 'Neu starten'),
        ),
      ));
    }

    function zeichne() {
      ladenEl.hidden = Boolean(z);
      bildEl.hidden = !z;
      plaetzeEl.hidden = !z;
      kolonnenEl.hidden = !z;
      if (!z) { titelEl.textContent = ''; restEl.textContent = ''; festEl.hidden = true; return; }
      baue();
      zeichneInfo();
      zeichneKolonnen();
      if (anim) {
        zeichneBild(anim.view.rest, anim.weg);
        zeichnePlaetze(anim.view.plaetze, false);
      } else {
        zeichneBild(z.rest, null, L.gewonnen(z));
        zeichnePlaetze(z.plaetze, true);
      }
      zeichneFest();
    }

    // ---------- Animation ----------
    function starteAnimation(vorher, r, k, gewinn) {
      const plaetze = vorher.plaetze.map((sm) => (sm ? sm.slice() : null));
      const [f, n] = vorher.kolonnen[k][vorher.pos[k]];
      plaetze[r.platz] = [f, n, n];
      anim = { view: { rest: vorher.rest.slice(), plaetze }, runden: r.runden, schritt: 0, timer: 0, gewinn, weg: null };
      zeichne();
      anim.timer = setTimeout(schritt, SCHRITT_MS);
    }

    function schritt() {
      if (!anim) return;
      const runde = anim.runden[anim.schritt++];
      if (!runde) { beendeAnimation(); return; }
      const { view } = anim;
      anim.weg = new Set();
      for (const [p, i] of runde) {
        view.rest[i] = -1;
        anim.weg.add(i);
        if (view.plaetze[p]) view.plaetze[p][2]--;
      }
      for (let p = 0; p < view.plaetze.length; p++) if (view.plaetze[p] && view.plaetze[p][2] <= 0) view.plaetze[p] = null;
      zeichne();
      anim.timer = setTimeout(schritt, SCHRITT_MS);
    }

    /** Animation sofort beenden; ein gewonnenes Level wird dabei gemeldet */
    function beendeAnimation({ melden = true } = {}) {
      if (!anim) return;
      clearTimeout(anim.timer);
      const gewinn = anim.gewinn;
      anim = null;
      if (zerstoert) { if (gewinn && melden) meldeGewinn(); return; }
      zeichne();
      if (gewinn && melden) meldeGewinn();
    }

    function meldeGewinn() {
      ctx.meldeGewonnen(`Level ${z.level} · ${z.titel}`);
    }

    function merkeGeloest() {
      const g = ctx.speicher.lies('geloest', {});
      const daten = g && typeof g === 'object' && !Array.isArray(g) ? { ...g } : {};
      const bisher = Number.isInteger(daten[z.stufe]) ? daten[z.stufe] : 0;
      daten[z.stufe] = Math.max(bisher, z.level);
      ctx.speicher.schreibe('geloest', daten);
    }

    // ---------- Aktionen ----------
    function fuehreAus(vorher, r, k) {
      z = r.zustand;
      tipp = null;
      hinweisText = '';
      const gewinn = L.gewonnen(z);
      if (gewinn) merkeGeloest();
      ctx.meldeAenderung();
      if (ctx.bewegungReduziert() || !r.runden.length) {
        zeichne();
        if (gewinn) meldeGewinn();
      } else {
        starteAnimation(vorher, r, k, gewinn);
      }
    }

    function tippeKolonne(k) {
      if (!z || L.gewonnen(z)) return;
      beendeAnimation();
      if (L.gewonnen(z)) return;
      if (z.pos[k] >= z.kolonnen[k].length) return;
      if (!z.plaetze.includes(null)) { ctx.meldung('Alle Arbeitsplätze sind belegt.'); return; }
      const r = L.tippe(z, k);
      if (r) fuehreAus(z, r, k);
    }

    async function erzeuge(stufe) {
      const nr = ++erzeugung;
      z = null;
      tipp = null;
      bekannt = [];
      hinweisText = '';
      zeichne();
      const motive = await ladeMotive();
      if (zerstoert || nr !== erzeugung) return;
      const sid = L.STUFEN[stufe] ? stufe : 'leicht';
      const g = ctx.speicher.lies('geloest', {});
      const geloest = g && Number.isInteger(g[sid]) && g[sid] >= 0 && g[sid] < 1e6 ? g[sid] : 0;
      z = L.erzeugeLevel({ stufe: sid, level: geloest + 1, seed: ctx.neuerSeed(), motive });
      zeichne();
    }

    // ---------- Schnittstelle ----------
    const instanz = {
      getStand: () => (z ? L.zumSpeichern(z) : null),
      zusammenfassung: () => (z ? `${L.STUFEN[z.stufe].name} · Level ${z.level} · noch ${L.restPixel(z)} Pixel` : ''),
      kannRueckgaengig: () => Boolean(z) && L.kannRueckgaengig(z),
      kannWiederholen: () => Boolean(z) && L.kannWiederholen(z),
      rueckgaengig() {
        if (!z) return;
        if (anim?.gewinn) { beendeAnimation(); return; }
        beendeAnimation();
        const v = L.rueckgaengig(z);
        if (!v) return;
        z = v;
        tipp = null;
        hinweisText = '';
        zeichne();
        ctx.meldeAenderung();
      },
      wiederholen() {
        if (!z) return;
        if (anim?.gewinn) { beendeAnimation(); return; }
        beendeAnimation();
        const k = z.vor[z.vor.length - 1];
        const r = L.wiederholen(z);
        if (r) fuehreAus(z, r, k);
      },
      hinweis() {
        if (!z) return;
        beendeAnimation();
        if (L.gewonnen(z)) return;
        const hw = L.hinweis(z, { bekannt });
        if (hw.typ === 'zug' || hw.typ === 'unsicher') {
          if (hw.weg) bekannt = [{ zuege: hw.zuege, weg: hw.weg }];
          tipp = hw.kolonne;
          hinweisText = '';
          zeichne();
          kolKnoepfe[tipp]?.focus({ preventScroll: true });
          ctx.meldung(hw.typ === 'zug' ? `Tipp: Kolonne ${tipp + 1}` : `Vorschlag: Kolonne ${tipp + 1} (ohne Gewähr)`);
        } else if (hw.typ === 'zurueck') {
          tipp = null;
          hinweisText = `Von hier aus geht es nicht mehr – ${hw.n}× Rückgängig`;
          zeichne();
          ctx.meldung(hinweisText);
        }
      },
      neustart() {
        if (!z) return;
        beendeAnimation({ melden: false });
        z = L.neustart(z);
        tipp = null;
        hinweisText = '';
        zeichne();
        ctx.meldeAenderung();
      },
      neu(variante) {
        beendeAnimation({ melden: false });
        return erzeuge(variante ?? z?.stufe ?? ctx.variante);
      },
      onTaste(e) {
        if (e.ctrlKey || e.metaKey || e.altKey || !z) return false;
        const k = e.key;
        const K = z.kolonnen.length;
        if (/^[1-9]$/.test(k)) {
          const c = Number(k) - 1;
          if (c >= K) return false;
          tippeKolonne(c);
          return true;
        }
        if (k === 'ArrowLeft' || k === 'ArrowRight') {
          const akt = kolKnoepfe.indexOf(document.activeElement);
          const c = akt >= 0 ? (akt + (k === 'ArrowRight' ? 1 : -1) + K) % K : (tipp ?? 0);
          kolKnoepfe[c]?.focus();
          return true;
        }
        if (k === 'Enter' || k === ' ') {
          // Knöpfe (Kolonnen, „Rückgängig“ …) lösen selbst aus
          if (e.target instanceof Element && e.target.closest('button, a')) return false;
          if (tipp !== null) { tippeKolonne(tipp); return true; }
        }
        return false;
      },
      zerstoere() {
        zerstoert = true;
        beendeAnimation();
        abmelden();
        container.replaceChildren();
      },
    };

    const abmelden = ctx.farben.beobachte(() => { zellKey = zellen.map(() => ''); if (z) zeichne(); });

    if (z) zeichne();
    else erzeuge(ctx.variante);
    return instanz;
  },
};
