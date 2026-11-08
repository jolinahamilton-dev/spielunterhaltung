// Schrauben: Schrauben aus Brettern drehen, Bretter fallen lassen, Kisten füllen.
// Bedienung: Klick/Tippen auf eine freie Schraube · Pfeiltasten springen zur nächsten freien Schraube,
// Enter/Leertaste dreht. Verdeckte Schrauben erscheinen blass durch das Brett davor.
import { h, s, ladeStil } from '../../kern/dom.js';
import * as L from './logik.js';

const SIEGER_VERZUG_MS = 300;   // Brett fällt noch, dann kommt „Gelöst“
const WARTENDE_ZEIGEN = 6;      // so viele wartende Kisten werden gezeigt (Rest als „+n“)

export default {
  id: 'schrauben',
  name: 'Schrauben',
  beschreibung: 'Schrauben lösen, Bretter fallen lassen, Kisten füllen.',
  variantenTitel: 'Schwierigkeit',
  varianten: [
    { id: 'leicht', name: 'Leicht – 4 Bretter, 3 Farben, 5 Parkplätze' },
    { id: 'mittel', name: 'Mittel – 8 Bretter, 4–5 Farben, 4 Parkplätze' },
    { id: 'schwer', name: 'Schwer – 12 Bretter, 5–6 Farben, 3 Parkplätze' },
  ],
  standVersion: 1,

  erstelle(container, ctx, gespeichert) {
    ladeStil('spiele/schrauben/stil.css');

    let z = null;
    try { z = gespeichert ? L.ausSpeicher(gespeichert) : null; } catch { z = null; }
    if (z && L.gewonnen(z)) z = null;

    let gemeldet = false;     // Gewinn dieses Levels schon gemeldet
    let tipp = -1;            // hervorgehobene Schraube (Hinweis)
    let kursor = -1;          // Schraube, die per Tab erreichbar ist (Tastatur-Cursor)
    let hinweisText = '';
    let winTimer = 0;
    let zerstoert = false;
    let gebaut = '';

    // ---------- DOM ----------
    const titelEl = h('span', { class: 'sr-titel' });
    const restEl = h('span', { class: 'sr-rest leise' });
    const kistenEl = h('div', { class: 'sr-kisten', role: 'list', 'aria-label': 'Aktive Kisten' });
    const wartenEl = h('div', { class: 'sr-warten', role: 'list', 'aria-label': 'Wartende Kisten' });
    const wandEl = h('div', { class: 'sr-wand', role: 'group', 'aria-label': 'Wand mit Brettern und Schrauben' });
    const wandRahmen = h('div', { class: 'sr-wand-rahmen' }, wandEl);
    const parkenEl = h('div', { class: 'sr-parken', role: 'list', 'aria-label': 'Parkplätze' });
    const statusEl = h('p', { class: 'sr-status leise', role: 'status', 'aria-live': 'polite' });
    const festEl = h('div', { class: 'sr-fest', hidden: true, role: 'status', 'aria-live': 'polite' });

    const wurzel = h('div', { class: 'sr' },
      h('div', { class: 'sr-info' }, titelEl, restEl),
      h('div', { class: 'sr-kisten-feld' },
        h('p', { class: 'sr-etikett leise', text: 'Kisten (3 Schrauben je Kiste)' }), kistenEl, wartenEl),
      wandRahmen,
      h('div', { class: 'sr-parken-feld' },
        h('p', { class: 'sr-etikett leise', text: 'Parkplätze' }), parkenEl),
      h('div', { class: 'sr-unten' }, statusEl, festEl),
    );
    container.append(wurzel);

    let brettEls = [];
    let schraubenEls = [];

    // ---------- Darstellung ----------
    const farbName = (f) => ctx.farben.liste[f]?.name ?? `Farbe ${f + 1}`;

    function symbolSvg(f, klasse) {
      return s('svg', { viewBox: '0 0 10 10', class: klasse, 'aria-hidden': 'true' },
        s('path', { d: ctx.farben.symbolPfad(f), 'fill-rule': 'evenodd' }));
    }

    /** Schraubenkopf (auch für Parkplätze und Kisten) */
    function kopfEl(f, winkel = 0) {
      return h('span', { class: `sr-kopf${ctx.farben.musterAn() ? ' mit-symbol' : ''}`, style: { background: ctx.farben.css(f), '--w': `${winkel}deg` } },
        h('span', { class: 'sr-schlitz' }),
        ctx.farben.musterAn() ? symbolSvg(f, 'sr-kopf-symbol') : null);
    }

    const prozent = (v) => `${(v * 100).toFixed(4)}%`;

    /** Wand mit Brettern und Schrauben neu aufbauen (nur bei neuem Level, Muster-/Palettenwechsel) */
    function baue() {
      const sig = `${z.seed}|${z.stufe}|${z.level}|${z.b}x${z.h}|${z.bretter.length}|${z.schrauben.length}|${ctx.farben.musterAn()}`;
      if (sig === gebaut) return;
      gebaut = sig;
      wandEl.style.setProperty('--b', String(z.b));
      wandEl.style.setProperty('--h', String(z.h));
      wandRahmen.style.setProperty('--b', String(z.b));
      wandRahmen.style.setProperty('--h', String(z.h));

      brettEls = z.bretter.map((br, bi) => {
        const xs = br.z.map((c) => c % z.b), ys = br.z.map((c) => Math.floor(c / z.b));
        const x0 = Math.min(...xs), y0 = Math.min(...ys);
        const bw = Math.max(...xs) - x0 + 1, bh = Math.max(...ys) - y0 + 1;
        const menge = new Set(br.z);
        const zellen = br.z.map((c) => {
          const x = c % z.b, y = Math.floor(c / z.b);
          const kante = [
            menge.has(c - z.b) ? '' : ' kt', menge.has(c + z.b) ? '' : ' kb',
            x > 0 && menge.has(c - 1) ? '' : ' kl', x < z.b - 1 && menge.has(c + 1) ? '' : ' kr',
          ].join('');
          return h('span', {
            class: `sr-k${kante}`,
            style: { left: prozent((x - x0) / bw), top: prozent((y - y0) / bh), width: prozent(1 / bw), height: prozent(1 / bh) },
          });
        });
        return h('div', {
          class: `sr-brett t${Math.min(br.l, 5)}`, 'aria-hidden': 'true',
          style: {
            left: prozent(x0 / z.b), top: prozent(y0 / z.h), width: prozent(bw / z.b), height: prozent(bh / z.h),
            zIndex: String(br.l + 1), '--neig': `${bi % 2 ? -4 : 4}deg`,
          },
        }, ...zellen);
      });

      schraubenEls = z.schrauben.map((sc, i) => {
        const x = sc.i % z.b, y = Math.floor(sc.i / z.b);
        return h('button', {
          type: 'button', class: 'sr-schraube', dataset: { s: i },
          style: { left: prozent(x / z.b), top: prozent(y / z.h), width: prozent(1 / z.b), height: prozent(1 / z.h) },
          on: {
            click: () => tippeSchraube(i),
            focus: () => { kursor = i; },
          },
        }, kopfEl(sc.f, (i * 47) % 180));
      });

      const schraubenSchicht = h('div', { class: 'sr-schrauben' }, ...schraubenEls);
      wandEl.replaceChildren(...brettEls, schraubenSchicht);
    }

    function zeichneWand() {
      z.bretter.forEach((br, bi) => {
        const el = brettEls[bi];
        const rest = z.rest[bi];
        el.classList.toggle('weg', rest === 0);
        const haengt = rest === 1;
        el.classList.toggle('haengt', haengt);
        if (haengt) {
          // Das Brett schwingt um seine letzte Schraube
          const letzte = z.schrauben.findIndex((sc, i) => sc.br === bi && !z.entfernt[i]);
          const sc = z.schrauben[letzte];
          const xs = br.z.map((c) => c % z.b), ys = br.z.map((c) => Math.floor(c / z.b));
          const x0 = Math.min(...xs), y0 = Math.min(...ys);
          const bw = Math.max(...xs) - x0 + 1, bh = Math.max(...ys) - y0 + 1;
          el.style.setProperty('--ox', prozent(((sc.i % z.b) - x0 + 0.5) / bw));
          el.style.setProperty('--oy', prozent((Math.floor(sc.i / z.b) - y0 + 0.5) / bh));
        }
      });
      z.schrauben.forEach((sc, i) => {
        const el = schraubenEls[i];
        const entfernt = Boolean(z.entfernt[i]);
        const verd = !entfernt && L.verdeckt(z, i);
        const frei = !entfernt && !verd;
        const geht = frei && L.kannTippen(z, i);
        el.classList.toggle('weg', entfernt);
        el.classList.toggle('verdeckt', verd);
        el.classList.toggle('blockiert', frei && !geht);
        el.classList.toggle('tipp', i === tipp && frei);
        const x = sc.i % z.b, y = Math.floor(sc.i / z.b);
        const status = entfernt ? 'entfernt' : verd ? 'verdeckt' : geht ? 'drehbar' : 'blockiert, kein Platz';
        el.setAttribute('aria-label', `Schraube ${farbName(sc.f)}, Spalte ${x + 1}, Zeile ${y + 1}, ${status}${i === tipp && frei ? ' – Tipp' : ''}`);
        el.setAttribute('aria-disabled', String(!geht));
        el.tabIndex = frei && i === kursor ? 0 : -1;
        el.hidden = false;
      });
    }

    function kisteEl(k, gross) {
      const f = z.kisten[k];
      const n = z.fuell[k];
      const slots = [];
      for (let i = 0; i < L.KISTE; i++) slots.push(i < n ? h('span', { class: 'sr-slot voll' }, kopfEl(f, (i * 61) % 180)) : h('span', { class: 'sr-slot' }));
      return h('div', {
        class: `sr-kiste ${gross ? 'gross' : 'klein'}`, role: 'listitem', style: { '--kf': ctx.farben.css(f) },
        'aria-label': `Kiste ${farbName(f)}${gross ? `, ${n} von ${L.KISTE}` : ', wartet'}`,
      },
      ctx.farben.musterAn() ? symbolSvg(f, 'sr-kiste-symbol') : null,
      gross ? h('span', { class: 'sr-slots' }, ...slots) : null);
    }

    function zeichneKisten() {
      kistenEl.replaceChildren(...L.aktiveKisten(z).map((k) => kisteEl(k, true)));
      const wart = L.wartendeKisten(z);
      const zeig = wart.slice(0, WARTENDE_ZEIGEN);
      wartenEl.replaceChildren(...[
        wart.length ? h('span', { class: 'sr-danach leise', text: 'danach:' }) : null,
        ...zeig.map((k) => kisteEl(k, false)),
        wart.length > zeig.length ? h('span', { class: 'sr-mehr leise', text: `+${wart.length - zeig.length}` }) : null,
      ].filter(Boolean));
      wartenEl.hidden = wart.length === 0;
    }

    function zeichneParken() {
      const plaetze = [];
      for (let p = 0; p < z.plaetze; p++) {
        const f = z.park[p];
        plaetze.push(f === undefined
          ? h('div', { class: 'sr-platz', role: 'listitem', 'aria-label': `Parkplatz ${p + 1}: frei` })
          : h('div', { class: 'sr-platz belegt', role: 'listitem', 'aria-label': `Parkplatz ${p + 1}: ${farbName(f)}` }, kopfEl(f, (p * 37) % 180)));
      }
      parkenEl.replaceChildren(...plaetze);
    }

    function zeichneFest() {
      const fest = L.festgefahren(z);
      festEl.hidden = !fest;
      if (!fest) return;
      festEl.replaceChildren(h('div', { class: 'sr-fest-karte' },
        h('p', { class: 'sr-fest-titel', text: 'Festgefahren – Rückgängig' }),
        h('p', { class: 'leise', text: 'Alle Parkplätze sind voll und keine Schraube hat eine freie Kiste.' }),
        h('div', { class: 'sr-fest-knoepfe' },
          h('button', { type: 'button', class: 'knopf primaer', on: { click: () => { instanz.rueckgaengig(); } } }, 'Rückgängig'),
          h('button', { type: 'button', class: 'knopf', on: { click: () => { instanz.neustart(); } } }, 'Neu starten'),
        ),
      ));
    }

    function zeichne() {
      wandRahmen.hidden = !z;
      if (!z) { titelEl.textContent = ''; restEl.textContent = ''; return; }
      wurzel.classList.toggle('ruhig', ctx.bewegungReduziert());
      baue();
      if (kursor < 0 || !L.istFrei(z, kursor)) kursor = L.naechsteFreie(z, kursor);
      zeichneWand();
      zeichneKisten();
      zeichneParken();
      zeichneFest();
      titelEl.textContent = `Level ${z.level} · ${L.STUFEN[z.stufe].name}`;
      const sr = L.restSchrauben(z), br = L.restBretter(z);
      restEl.textContent = L.gewonnen(z) ? 'Alle Bretter gefallen' : `${sr} Schrauben · ${br} Bretter`;
      statusEl.textContent = hinweisText;
    }

    // ---------- Aktionen ----------
    function fokusPflegen(vorher) {
      // Hatte eine Schraube den Fokus, soll er bei der nächsten freien weiterwandern
      if (vorher < 0 || kursor < 0) return;
      schraubenEls[kursor]?.focus({ preventScroll: true });
    }

    function aktiveSchraube() {
      return schraubenEls.indexOf(document.activeElement);
    }

    function uebernimm(neu) {
      const vorher = aktiveSchraube();
      z = neu;
      tipp = -1;
      hinweisText = '';
      if (!L.istFrei(z, kursor)) kursor = L.naechsteFreie(z, kursor);
      zeichne();
      fokusPflegen(vorher);
      ctx.meldeAenderung();
      pruefeSieg();
    }

    function pruefeSieg() {
      if (!z || !L.gewonnen(z) || gemeldet) return;
      gemeldet = true;
      merkeGeloest();
      clearTimeout(winTimer);
      winTimer = setTimeout(() => { if (!zerstoert) ctx.meldeGewonnen(`Level ${z.level} · ${L.STUFEN[z.stufe].name}`); },
        ctx.bewegungReduziert() ? 0 : SIEGER_VERZUG_MS);
    }

    function merkeGeloest() {
      const g = ctx.speicher.lies('geloest', {});
      const daten = g && typeof g === 'object' && !Array.isArray(g) ? { ...g } : {};
      const bisher = Number.isInteger(daten[z.stufe]) ? daten[z.stufe] : 0;
      daten[z.stufe] = Math.max(bisher, z.level);
      ctx.speicher.schreibe('geloest', daten);
    }

    function tippeSchraube(i) {
      if (!z || L.gewonnen(z) || zerstoert) return;
      if (z.entfernt[i]) return;
      if (L.verdeckt(z, i)) { ctx.meldung('Diese Schraube wird von einem Brett verdeckt.'); return; }
      const r = L.tippe(z, i);
      if (!r) { ctx.meldung('Alle Parkplätze sind belegt – für diese Farbe steht keine Kiste bereit.'); return; }
      uebernimm(r.zustand);
    }

    function erzeuge(stufe) {
      clearTimeout(winTimer);
      gemeldet = false;
      tipp = -1;
      kursor = -1;
      hinweisText = '';
      const sid = L.STUFEN[stufe] && Object.hasOwn(L.STUFEN, stufe) ? stufe : 'leicht';
      const g = ctx.speicher.lies('geloest', {});
      const geloest = g && Number.isInteger(g[sid]) && g[sid] >= 0 && g[sid] < 1e6 ? g[sid] : 0;
      z = L.erzeugeLevel({ stufe: sid, level: geloest + 1, seed: ctx.neuerSeed() });
      zeichne();
    }

    // ---------- Schnittstelle ----------
    const instanz = {
      getStand: () => (z ? L.zumSpeichern(z) : null),
      zusammenfassung: () => (z ? `${L.STUFEN[z.stufe].name} · Level ${z.level} · noch ${L.restSchrauben(z)} Schrauben` : ''),
      kannRueckgaengig: () => Boolean(z) && L.kannRueckgaengig(z),
      kannWiederholen: () => Boolean(z) && L.kannWiederholen(z),
      rueckgaengig() {
        if (!z || gemeldet) return;
        const v = L.rueckgaengig(z);
        if (v) uebernimm(v);
      },
      wiederholen() {
        if (!z || gemeldet) return;
        const r = L.setzeWieder(z);
        if (r) uebernimm(r.zustand);
      },
      hinweis() {
        if (!z || L.gewonnen(z)) return;
        const hw = L.hinweis(z);
        if (hw.typ === 'zug' || hw.typ === 'unsicher') {
          tipp = hw.schraube;
          kursor = tipp;
          const sc = z.schrauben[tipp];
          const ort = `Spalte ${(sc.i % z.b) + 1}, Zeile ${Math.floor(sc.i / z.b) + 1}`;
          hinweisText = hw.typ === 'zug' ? `Tipp: ${farbName(sc.f)}, ${ort}` : `Vorschlag: ${farbName(sc.f)}, ${ort} (ohne Gewähr)`;
          zeichne();
          schraubenEls[tipp]?.focus({ preventScroll: true });
          ctx.statistik.melde({ typ: 'hinweis' });
          ctx.meldung(hinweisText);
        } else if (hw.typ === 'zurueck') {
          tipp = -1;
          hinweisText = `Von hier aus geht es nicht mehr – ${hw.n}× Rückgängig`;
          zeichne();
          ctx.meldung(hinweisText);
        }
      },
      neustart() {
        if (!z) return;
        clearTimeout(winTimer);
        gemeldet = false;
        z = L.neustart(z);
        tipp = -1;
        kursor = -1;
        hinweisText = '';
        zeichne();
        ctx.meldeAenderung();
      },
      neu(variante) {
        erzeuge(variante ?? z?.stufe ?? ctx.variante);
      },
      onTaste(e) {
        if (e.ctrlKey || e.metaKey || e.altKey || !z || L.gewonnen(z)) return false;
        const richtung = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!richtung) return false;
        // nur reagieren, wenn der Fokus nicht in einem anderen Bedienelement liegt
        const aktiv = document.activeElement;
        if (aktiv instanceof Element && aktiv.closest('dialog, input, select, textarea')) return false;
        const von = aktiveSchraube() >= 0 ? aktiveSchraube() : kursor;
        let ziel = -1;
        if (von >= 0 && L.istFrei(z, von)) ziel = L.naechsteSchraube(z, von, richtung[0], richtung[1]);
        if (ziel < 0 && aktiveSchraube() < 0) ziel = von >= 0 && L.istFrei(z, von) ? von : L.naechsteFreie(z, von);
        if (ziel >= 0) {
          kursor = ziel;
          zeichneWand();
          schraubenEls[ziel]?.focus({ preventScroll: true });
        }
        return true;
      },
      zerstoere() {
        zerstoert = true;
        clearTimeout(winTimer);
        abmelden();
        container.replaceChildren();
      },
    };

    const abmelden = ctx.farben.beobachte(() => { gebaut = ''; if (z) zeichne(); });

    if (z) zeichne();
    else erzeuge(ctx.variante);
    return instanz;
  },
};
