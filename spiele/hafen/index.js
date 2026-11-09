// Hafen: ruhiges Idle-Spiel mit Ebenen. Jede Ebene hat eine eigene Ressource, ein Dock mit Schiffen, Kran und Lager.
// Bedienung: Maus/Touch oder Tab + Enter auf den Knöpfen · Schiff antippen = leichter Schub · Taste K kauft das „Nächste Ziel“.
// Wichtig: Knöpfe und Anzeigen werden nur einmal gebaut; pro Tick ändern sich nur Texte/Maße, und nur bei Änderung.
import { h, s, ladeStil } from '../../kern/dom.js';
import { zeigeDialog } from '../../kern/dialog.js';
import * as L from './logik.js';

const TICK_MS = 200;             // Rechen- und Anzeigetakt
const SPEICHER_S = 10;           // so oft wird zwischendurch gespeichert
const WEG_MELDUNG_S = 60;        // ab dieser Abwesenheit „Während du weg warst“

/** Einfache Symbole je Ressource (viewBox 0 0 24 24) */
const ICON = [
  'M4 6h16v5H4zM4 13h16v5H4z',
  'M2 12c4-7 12-7 16 0-4 7-12 7-16 0zM18 12l4-5v10z',
  'M12 3l8 6-3 11H7L4 9z',
  'M6 8l6-4 6 5-2 9-8 1z',
  'M4 6h13a3 3 0 010 6H4zM4 14h16v4H4z',
  'M12 3a5 5 0 015 5c0 4-5 8-5 13 0-5-5-9-5-13a5 5 0 015-5z',
  'M3 10h18a9 9 0 01-18 0zM8 21h8v-1H8z',
  'M3 15a4 4 0 108 0 4 4 0 10-8 0zM13 15a4 4 0 108 0 4 4 0 10-8 0zM8 8a4 4 0 108 0 4 4 0 10-8 0z',
];

export default {
  id: 'hafen',
  name: 'Hafen',
  beschreibung: 'Ebene für Ebene einen kleinen Hafen ausbauen: Schiffe, Kräne, Lager und Verkauf – in Ruhe.',
  varianten: [{ id: 'standard', name: 'Standard' }],
  standVersion: L.STAND_VERSION,

  erstelle(container, ctx, gespeichert) {
    ladeStil('spiele/hafen/stil.css');

    let z = null;
    let weg = null;               // { dt, gewinn } der letzten Abwesenheit
    try { z = gespeichert ? L.ausSpeicher(gespeichert) : null; } catch { z = null; }
    const start = Date.now();
    if (z && !L.zeitPlausibel(z, start)) z = null;
    if (z) {
      const o = L.offline(z, start);
      z = o.zustand;
      if (o.dt >= WEG_MELDUNG_S && o.gewinn > 0) weg = { dt: o.dt, gewinn: o.gewinn };
    } else {
      z = L.neuerHafen(start);
    }

    let letzt = start;
    let timer = 0;
    let sekundenSeitSpeichern = 0;
    let zerstoert = false;
    const karten = [];            // Oberflächen-Elemente je Ebene

    const farbe = (i) => ctx.farben.css(i % ctx.farben.anzahl);
    const setzeText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
    const setzeAttr = (el, name, wert) => { if (el.getAttribute(name) !== wert) el.setAttribute(name, wert); };
    const ruhig = () => ctx.bewegungReduziert();

    // ---------- Feste Geldleiste ----------
    const geldEl = h('span', { class: 'ha-geld-wert' });
    const rateEl = h('span', { class: 'ha-rate' });
    const zielText = h('span', { class: 'ha-ziel-text' });
    const zielKnopf = h('button', {
      type: 'button', class: 'knopf klein ha-ziel-knopf', text: 'Kaufen',
      on: { click: () => kaufeZiel() },
    });
    const leiste = h('div', { class: 'ha-leiste' },
      h('div', { class: 'ha-leiste-oben' },
        h('div', { class: 'ha-geld', 'aria-label': 'Geld in Münzen' }, geldEl, h('span', { class: 'ha-einheit', text: ' Münzen' })),
        rateEl),
      h('div', { class: 'ha-leiste-ziel' }, h('span', { class: 'ha-ziel-titel', text: 'Ziel' }), zielText, zielKnopf));

    const wegText = h('span', { class: 'ha-weg-text' });
    const wegKnopf = h('button', {
      type: 'button', class: 'knopf klein', text: 'OK', 'aria-label': 'Hinweis schließen',
      on: { click: () => { weg = null; zeichneWeg(); } },
    });
    const wegEl = h('div', { class: 'ha-weg', role: 'status', hidden: true }, wegText, wegKnopf);
    const statusEl = h('p', { class: 'ha-status', role: 'status', 'aria-live': 'polite' });

    // ---------- Bausteine ----------
    /** Mengenzeile: Beschriftung, Balken, „Menge / Kapazität“ */
    function messer(name) {
      const fuell = h('span', { class: 'ha-fuell' });
      const zahl = h('span', { class: 'ha-zahl' });
      const el = h('div', { class: 'ha-messer' },
        h('span', { class: 'ha-messer-name', text: name }),
        h('span', { class: 'ha-balken', 'aria-hidden': 'true' }, fuell),
        zahl);
      return { el, fuell, zahl, proz: -1 };
    }
    function setzeMesser(m, menge, kap, zusatz = '') {
      const p = kap > 0 ? Math.max(0, Math.min(100, Math.round((menge / kap) * 100))) : 0;
      if (p !== m.proz) { m.proz = p; m.fuell.style.width = `${p}%`; m.el.classList.toggle('voll', p >= 98); }
      setzeText(m.zahl, `${L.formatiere(menge)} / ${L.formatiere(kap)}${zusatz}`);
    }

    /** Kaufknopf: Name, Wirkung, Stufe, Preis; Inhalte werden nur bei Änderung gesetzt */
    function kaufKnopf(was, name, klasse = '') {
      const wirkEl = h('span', { class: 'ha-kauf-wirkung' });
      const stufeEl = h('span', { class: 'ha-kauf-stufe' });
      const preisEl = h('span', { class: 'ha-kauf-preis' });
      const el = h('button', {
        type: 'button', class: `ha-kauf ${klasse}`.trim(), dataset: { was },
        on: { click: () => kaufeWas(was) },
      }, h('span', { class: 'ha-kauf-name', text: name }), wirkEl, h('span', { class: 'ha-kauf-zeile' }, stufeEl, preisEl));
      return { el, wirkEl, stufeEl, preisEl, was, name, key: '' };
    }

    function aktualisiereKnopf(k) {
      const p = L.preis(z, k.was);
      const bezahlbar = p !== null && z.geld >= p;
      const ef = p === null ? null : L.effekt(z, k.was);
      const stufeText = k.was === 'ebene' ? '' : (k.was.endsWith(':lotse') ? (z.ebenen[Number(k.was[1])].lotse ? '' : 'fehlt') : `Stufe ${L.stufe(z, k.was)}`);
      const key = `${stufeText}|${p}|${bezahlbar}|${ef ? ef.text : ''}`;
      if (key === k.key) return;
      k.key = key;
      setzeText(k.wirkEl, p === null ? 'ausgebaut' : ef.text);
      setzeText(k.stufeEl, stufeText);
      setzeText(k.preisEl, p === null ? 'Fertig' : L.formatiere(p));
      setzeAttr(k.el, 'aria-disabled', String(!bezahlbar));
      k.el.classList.toggle('bereit', bezahlbar);
      setzeAttr(k.el, 'aria-label', p === null
        ? `${k.name}: ${stufeText}, fertig ausgebaut`
        : `${k.name}: ${stufeText}, ${ef.text}, plus ${L.formatiere(ef.plus)} Münzen pro Sekunde, ${L.formatiere(p)} Münzen${bezahlbar ? '' : ', noch zu teuer'}`);
    }

    function symbolSvg(i) {
      return s('svg', { viewBox: '0 0 10 10', class: 'ha-symbol', 'aria-hidden': 'true' },
        s('path', { d: ctx.farben.symbolPfad(i % ctx.farben.anzahl), 'fill-rule': 'evenodd' }));
    }

    // ---------- Szene mit Leuchtturm ----------
    const turmInfo = h('span', { class: 'ha-turm-info' });
    const strahl = h('span', { class: 'ha-strahl', 'aria-hidden': 'true' });
    const turmSvg = s('svg', { viewBox: '0 0 40 90', class: 'ha-turm', 'aria-hidden': 'true' },
      s('path', { d: 'M12 86 L16 26 H24 L28 86 Z', class: 'ha-turm-leib' }),
      s('path', { d: 'M14.4 56 H25.6 L26.4 66 H13.6 Z', class: 'ha-turm-streifen' }),
      s('path', { d: 'M13.2 76 H26.8 L27.6 86 H12.4 Z', class: 'ha-turm-streifen' }),
      s('rect', { x: 14, y: 18, width: 12, height: 8, class: 'ha-turm-lampe' }),
      s('path', { d: 'M12 18 L20 8 L28 18 Z', class: 'ha-turm-dach' }),
      s('rect', { x: 8, y: 86, width: 24, height: 4, class: 'ha-turm-sockel' }));

    // ---------- Karte „Hafenanlagen“ (global) ----------
    const hauptMesser = messer('Hauptlager');
    const verkaufEl = h('span', { class: 'ha-zeile-info' });
    const turmKnopf = kaufKnopf('turm', 'Leuchtturm');
    const halleKnopf = kaufKnopf('halle', 'Verkaufshalle');
    const anlagen = h('section', { class: 'ha-karte ha-anlagen', 'aria-label': 'Hafenanlagen' },
      h('div', { class: 'ha-szene', role: 'img', 'aria-label': 'Hafen mit Leuchtturm' },
        h('span', { class: 'ha-welle ha-welle-1', 'aria-hidden': 'true' }),
        h('span', { class: 'ha-welle ha-welle-2', 'aria-hidden': 'true' }),
        strahl, turmSvg, turmInfo),
      h('h3', { class: 'ha-titel', text: 'Hafenanlagen' }),
      hauptMesser.el, verkaufEl,
      h('div', { class: 'ha-knoepfe zwei' }, turmKnopf.el, halleKnopf.el));

    // ---------- Ebenen ----------
    const ebenenListe = h('div', { class: 'ha-ebenen', 'aria-label': 'Ebenen' });
    const neueEbeneKnopf = kaufKnopf('ebene', 'Nächste Ebene freischalten', 'ha-neue-ebene');
    const neuerHafen = h('button', {
      type: 'button', class: 'knopf klein ha-neu', text: 'Neuer Hafen',
      on: { click: () => neuMitFrage() },
    });

    function baueKarte(i) {
      const info = L.EBENEN[i];
      const badge = h('span', { class: 'ha-badge', style: { background: farbe(i) }, 'aria-hidden': 'true' },
        s('svg', { viewBox: '0 0 24 24', class: 'ha-icon' }, s('path', { d: ICON[i], 'fill-rule': 'evenodd' })));
      const symbolHalter = h('span', { class: 'ha-symbol-halter' });
      const ertrag = h('span', { class: 'ha-ertrag' });
      const wertEl = h('span', { class: 'ha-zeile-info', text: `${L.formatiere(info.wert)} ${info.wert === 1 ? 'Münze' : 'Münzen'} je Einheit` });
      const phaseTxt = h('span', { class: 'ha-zeile-info ha-phase' });
      const ladung = h('span', { class: 'ha-ladung', style: { background: farbe(i) } });
      const schiff = h('button', {
        type: 'button', class: 'ha-schiff',
        'aria-label': `Schiff ${info.name} antippen: leichter Schub beim Entladen`,
        on: { click: () => schub(i) },
      }, h('span', { class: 'ha-rumpf' }, ladung), h('span', { class: 'ha-mast' }));
      const see = h('div', { class: 'ha-see' },
        h('span', { class: 'ha-kai', 'aria-hidden': 'true' }),
        h('span', { class: 'ha-kran', 'aria-hidden': 'true' }),
        schiff);
      const mSchiff = messer('Schiff');
      const mLager = messer('Dock-Lager');
      const mHaupt = messer('Im Verkauf');
      const knoepfe = ['kran', 'schiff', 'lager', 'lotse'].map((art) => kaufKnopf(`e${i}:${art}`, {
        kran: 'Kran', schiff: 'Schiffe', lager: 'Dock-Lager', lotse: 'Lotsenboot',
      }[art]));
      const el = h('section', { class: 'ha-karte ha-ebene', 'aria-label': `Ebene ${i + 1}: ${info.name}`, style: { '--ha-farbe': farbe(i) } },
        h('div', { class: 'ha-ebene-kopf' },
          badge,
          h('div', { class: 'ha-ebene-titel' },
            h('h3', { class: 'ha-titel' }, symbolHalter, `Ebene ${i + 1} · ${info.name}`),
            wertEl),
          ertrag),
        see,
        phaseTxt,
        h('div', { class: 'ha-messer-liste' }, mSchiff.el, mLager.el, mHaupt.el),
        h('div', { class: 'ha-knoepfe zwei' }, knoepfe.map((k) => k.el)));
      return { i, el, ertrag, phaseTxt, ladung, schiff, mSchiff, mLager, mHaupt, knoepfe, symbolHalter, symbolKey: null, lad: -1, pos: '' };
    }

    function stelleKartenSicher() {
      if (karten.length === z.ebenen.length) return;
      while (karten.length > z.ebenen.length) karten.pop().el.remove();
      while (karten.length < z.ebenen.length) {
        const k = baueKarte(karten.length);
        karten.push(k);
        ebenenListe.append(k.el);
      }
    }

    const wurzel = h('div', { class: 'ha' },
      leiste, wegEl, statusEl, anlagen, ebenenListe,
      h('div', { class: 'ha-neue-ebene-zeile' }, neueEbeneKnopf.el),
      h('div', { class: 'ha-fuss' }, neuerHafen));
    container.append(wurzel);

    // Die feste Leiste sitzt unter der Kopfleiste der Shell
    function setzeOben() {
      const kopf = document.querySelector('.kopfleiste');
      const px = kopf ? Math.round(kopf.getBoundingClientRect().height) : 0;
      wurzel.style.setProperty('--ha-oben', `${px}px`);
    }
    setzeOben();
    window.addEventListener('resize', setzeOben, { signal: ctx.signal });

    // ---------- Darstellung ----------
    function schiffPhase(i) {
      const e = z.ebenen[i];
      const ph = L.phasen(z, i);
      let x; let lad; let text;
      if (e.p < ph.von) { const q = 1 - e.p / ph.von; x = q * q; lad = 1; text = 'läuft ein'; }
      else if (e.p < ph.bis) { x = 0; lad = 1 - (e.p - ph.von) / (ph.bis - ph.von); text = 'wird entladen'; }
      else { const q = (e.p - ph.bis) / (1 - ph.bis); x = q * q; lad = 0; text = 'legt ab'; }
      return { x, lad, text };
    }

    function zeichneKarte(k, detail) {
      const e = z.ebenen[k.i];
      const { x, lad, text } = schiffPhase(k.i);
      const pos = ruhig() ? '0' : x.toFixed(3);
      if (pos !== k.pos) { k.pos = pos; k.schiff.style.setProperty('--x', pos); }
      const ladP = Math.round(lad * 100);
      if (ladP !== k.lad) { k.lad = ladP; k.ladung.style.height = `${ladP}%`; }
      const S = L.schiffGroesse(z, k.i);
      setzeText(k.ertrag, `+${L.formatiere(detail.je[k.i])}/s`);
      setzeText(k.phaseTxt, `Schiff ${text}`);
      setzeMesser(k.mSchiff, S * lad, S);
      setzeMesser(k.mLager, e.puffer, L.ebenenKap(e));
      setzeMesser(k.mHaupt, z.haupt[k.i], L.hallenKap(z));
      const mus = ctx.farben.musterAn();
      if (k.symbolKey !== mus) {
        k.symbolKey = mus;
        k.symbolHalter.replaceChildren(...(mus ? [symbolSvg(k.i)] : []));
      }
      k.knoepfe.forEach(aktualisiereKnopf);
    }

    function zeichne() {
      stelleKartenSicher();
      wurzel.classList.toggle('ha-still', ruhig());
      setzeText(geldEl, L.formatiere(z.geld));
      const detail = L.einkommenDetail(z);
      setzeText(rateEl, `+${L.formatiere(detail.gesamt)}/s`);

      // Ziel (knapp)
      const g = L.naechstesZiel(z);
      if (!g) {
        setzeText(zielText, 'Alles ausgebaut');
        zielKnopf.hidden = true;
      } else {
        const wz = g.wartezeit <= 0 ? 'jetzt' : `in ${L.formatiereDauer(g.wartezeit)}`;
        setzeText(zielText, `${L.bezeichnung(g.was)} · ${L.formatiere(g.preis)} · ${wz}`);
        zielKnopf.hidden = false;
        setzeAttr(zielKnopf, 'aria-disabled', String(z.geld < g.preis));
        zielKnopf.classList.toggle('bereit', z.geld >= g.preis);
        setzeAttr(zielKnopf, 'aria-label', `Nächstes Ziel kaufen: ${L.bezeichnung(g.was)}, ${L.formatiere(g.preis)} Münzen`);
      }

      // Anlagen
      setzeMesser(hauptMesser, L.hauptSumme(z), L.hallenKap(z));
      setzeText(verkaufEl, `Verkauf ${L.formatiere(L.verkaufsRate(z))} Einheiten/s · teuerste Ware zuerst`);
      setzeText(turmInfo, `Leuchtturm Stufe ${z.turm}`);
      const reich = String(Math.min(1, 0.35 + z.turm * 0.03));
      if (anlagen.style.getPropertyValue('--reichweite') !== reich) anlagen.style.setProperty('--reichweite', reich);
      aktualisiereKnopf(turmKnopf);
      aktualisiereKnopf(halleKnopf);

      // Ebenen
      karten.forEach((k) => zeichneKarte(k, detail));

      // nächste Ebene
      const pe = L.preis(z, 'ebene');
      neueEbeneKnopf.el.hidden = pe === null;
      if (pe !== null) {
        const name = L.EBENEN[z.ebenen.length].name;
        setzeText(neueEbeneKnopf.el.querySelector('.ha-kauf-name'), `Ebene ${z.ebenen.length + 1} freischalten: ${name}`);
        aktualisiereKnopf(neueEbeneKnopf);
      }
    }

    function zeichneWeg() {
      wegEl.hidden = !weg;
      if (weg) setzeText(wegText, `Während du weg warst (${L.formatiereDauer(weg.dt)}): +${L.formatiere(weg.gewinn)} Münzen`);
    }

    // ---------- Aktionen ----------
    function sage(text) { statusEl.textContent = text; }

    function kaufeWas(was) {
      const r = L.kaufe(z, was);
      if (!r.ok) {
        if (r.grund === 'zu wenig Geld') { ctx.meldung('Noch zu wenig Münzen.'); sage('Noch zu wenig Münzen.'); }
        return false;
      }
      z = r.zustand;
      sage(`Gekauft: ${L.bezeichnung(was)} für ${L.formatiere(r.preis)} Münzen.`);
      blitz(was);
      ctx.meldeAenderung();
      zeichne();
      return true;
    }

    function blitz(was) {
      if (ruhig()) return;
      const el = wurzel.querySelector(`[data-was="${was}"]`);
      if (!el) return;
      el.classList.add('blitz');
      setTimeout(() => el.classList.remove('blitz'), 220);
    }

    function kaufeZiel() {
      const g = L.naechstesZiel(z);
      return g ? kaufeWas(g.was) : false;
    }

    function schub(i) {
      const r = L.anschub(z, i);
      if (r.ok) { z = r.zustand; zeichne(); }
    }

    async function neuMitFrage() {
      const wahl = await zeigeDialog({
        titel: 'Neuer Hafen',
        inhalt: h('p', { text: 'Dein jetziger Hafen geht dabei verloren. Neu beginnen?' }),
        knoepfe: [{ text: 'Neuer Hafen', wert: true, primaer: true }, { text: 'Abbrechen', wert: null }],
      });
      if (wahl && !zerstoert) { neuStart(); ctx.meldeAenderung(); }
    }

    function neuStart() {
      z = L.neuerHafen(Date.now());
      letzt = Date.now();
      weg = null;
      sage('Neuer Hafen gestartet.');
      zeichneWeg();
      zeichne();
    }

    // ---------- Takt ----------
    function tick() {
      if (zerstoert) return;
      const jetzt = Date.now();
      const roh = (jetzt - letzt) / 1000;
      letzt = jetzt;
      // Uhr zurückgestellt oder Unsinn → keine Wirkung; lange Lücke → gedeckelt und halbiert
      const dt = L.luecke(roh);
      if (dt > 0) {
        const vorher = z.geld;
        z = L.fortschritt(z, dt);
        if (roh >= WEG_MELDUNG_S && z.geld > vorher) {
          weg = { dt: Math.min(roh, L.OFFLINE_MAX_S), gewinn: z.geld - vorher };
          zeichneWeg();
        }
        sekundenSeitSpeichern += Math.min(roh, 5);
      }
      z.t = jetzt;
      if (sekundenSeitSpeichern >= SPEICHER_S) { sekundenSeitSpeichern = 0; ctx.meldeAenderung(); }
      zeichne();
    }

    function starteTakt() {
      if (timer || zerstoert) return;
      timer = setInterval(tick, TICK_MS);
    }
    function stoppeTakt() { clearInterval(timer); timer = 0; }

    ctx.signal?.addEventListener('abort', stoppeTakt);
    const abmelden = ctx.farben.beobachte(() => { karten.forEach((k) => { k.symbolKey = null; }); zeichne(); });

    zeichneWeg();
    zeichne();
    starteTakt();

    // ---------- Schnittstelle ----------
    return {
      getStand: () => L.zumSpeichern(z, Date.now()),
      zusammenfassung: () => `${L.formatiere(z.geld)} Münzen · ${z.ebenen.length} ${z.ebenen.length === 1 ? 'Ebene' : 'Ebenen'}`,
      kannRueckgaengig: () => false,
      rueckgaengig() { return false; },
      neu() { neuStart(); },
      onTaste(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return false;
        if (e.key === 'k' || e.key === 'K') { kaufeZiel(); return true; }
        return false;
      },
      pausiere() { stoppeTakt(); },
      fortsetze() { if (zerstoert) return; tick(); starteTakt(); },
      zerstoere() {
        zerstoert = true;
        stoppeTakt();
        abmelden();
        container.replaceChildren();
      },
    };
  },
};
