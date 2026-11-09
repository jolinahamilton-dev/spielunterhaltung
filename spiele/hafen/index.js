// Hafen: minimalistisches Idle-Spiel. Oben Verkauf mit Leuchtturm, links ein durchgehender Kran, rechts die Docks.
// Pro Station genau ein Upgrade-Knopf. Bedienung: Maus/Touch oder Tab + Enter · Schiff antippen = leichter Schub · Taste K kauft das Ziel.
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
  beschreibung: 'Docks, Kran und Verkauf ausbauen – ein ruhiger kleiner Hafen, der von selbst läuft.',
  variantenTitel: 'Modus',
  varianten: [
    { id: 'level', name: 'Level – mit Ziel' },
    { id: 'endlos', name: 'Endlos – ohne Ziel' },
  ],
  standVersion: L.STAND_VERSION,

  erstelle(container, ctx, gespeichert) {
    ladeStil('spiele/hafen/stil.css');

    let modus = ctx.variante === 'level' ? 'level' : 'endlos';
    /** Nächstes zu spielendes Level (aus dem eigenen Speicher des Spiels) */
    function spielLevel() {
      const v = ctx.speicher.lies('level', 1);
      return Number.isInteger(v) && v >= 1 && v <= L.LEVEL_MAX ? v : 1;
    }
    let z = null;
    let weg = null;               // { dt, gewinn } der letzten Abwesenheit
    let geloest = false;          // Level-Ziel gemeldet
    try { z = gespeichert ? L.ausSpeicher(gespeichert) : null; } catch { z = null; }
    const start = Date.now();
    if (z && (z.modus !== modus || !L.zeitPlausibel(z, start))) z = null;
    if (z) {
      const o = L.offline(z, start);
      z = o.zustand;
      if (o.dt >= WEG_MELDUNG_S && o.gewinn > 0) weg = { dt: o.dt, gewinn: o.gewinn };
    } else {
      z = L.neuerHafen(start, modus, modus === 'level' ? spielLevel() : 0);
    }

    let letzt = start;
    let timer = 0;
    let sekundenSeitSpeichern = 0;
    let zerstoert = false;
    const zeilen = [];            // Oberflächen-Elemente je Dock

    const farbe = (i) => ctx.farben.css(i % ctx.farben.anzahl);
    const setzeText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
    const setzeAttr = (el, name, wert) => { if (el.getAttribute(name) !== wert) el.setAttribute(name, wert); };
    const ruhig = () => ctx.bewegungReduziert();

    // ---------- Feste Geldleiste ----------
    const geldEl = h('span', { class: 'ha-geld-wert' });
    const rateEl = h('span', { class: 'ha-rate' });
    const zielText = h('span', { class: 'ha-ziel-text' });
    const zielBalken = (() => { const fuell = h('span', { class: 'ha-fuell' }); return { el: h('span', { class: 'ha-balken', 'aria-hidden': 'true' }, fuell), fuell, proz: -1 }; })();
    const zielZeile = h('div', { class: 'ha-ziel', hidden: true }, zielText, zielBalken.el);
    const leiste = h('div', { class: 'ha-leiste' },
      h('div', { class: 'ha-leiste-oben' },
        h('div', { class: 'ha-geld', 'aria-label': 'Geld in Münzen' }, geldEl, h('span', { class: 'ha-einheit', text: ' Münzen' })),
        rateEl),
      zielZeile);

    const wegText = h('span', { class: 'ha-weg-text' });
    const wegKnopf = h('button', {
      type: 'button', class: 'knopf klein', text: 'OK', 'aria-label': 'Hinweis schließen',
      on: { click: () => { weg = null; zeichneWeg(); } },
    });
    const wegEl = h('div', { class: 'ha-weg', role: 'status', hidden: true }, wegText, wegKnopf);
    const statusEl = h('p', { class: 'ha-status', role: 'status', 'aria-live': 'polite' });

    // ---------- Bausteine ----------
    /** Dünner Füllbalken */
    function balken() {
      const fuell = h('span', { class: 'ha-fuell' });
      return { el: h('span', { class: 'ha-balken', 'aria-hidden': 'true' }, fuell), fuell, proz: -1 };
    }
    function setzeBalken(b, menge, kap) {
      const p = kap > 0 ? Math.max(0, Math.min(100, Math.round((menge / kap) * 100))) : 0;
      if (p === b.proz) return;
      b.proz = p;
      b.fuell.style.width = `${p}%`;
      b.el.classList.toggle('voll', p >= 98);
    }

    /** Ein Upgrade-Knopf je Station: „▲ Preis“ mit Stufe als winzigem Abzeichen; Wirkung nur als title/aria-label */
    function upKnopf(was, name) {
      const preisEl = h('span', { class: 'ha-up-preis' });
      const abzeichen = h('span', { class: 'ha-abzeichen', 'aria-hidden': 'true' });
      const el = h('button', {
        type: 'button', class: 'ha-up', dataset: { was },
        on: { click: () => kaufeWas(was) },
      }, h('span', { class: 'ha-up-pfeil', 'aria-hidden': 'true', text: '▲' }), preisEl, abzeichen);
      return { el, preisEl, abzeichen, was, name, key: '' };
    }
    function aktualisiereKnopf(k) {
      const p = L.preis(z, k.was);
      const bezahlbar = p !== null && z.geld >= p;
      const st = L.stufe(z, k.was);
      const ef = p === null ? null : L.effekt(z, k.was);
      const key = `${st}|${p}|${bezahlbar}|${ef ? ef.text : ''}`;
      if (key === k.key) return;
      k.key = key;
      setzeText(k.preisEl, p === null ? 'max' : L.formatiere(p));
      setzeText(k.abzeichen, String(st));
      setzeAttr(k.el, 'aria-disabled', String(!bezahlbar));
      k.el.classList.toggle('bereit', bezahlbar);
      const text = p === null
        ? `${k.name}, Stufe ${st}, ausgebaut`
        : `${k.name}, Stufe ${st} auf ${st + 1}: ${ef.text}. Plus ${L.formatiere(ef.plus)} Münzen pro Sekunde. ${L.formatiere(p)} Münzen${bezahlbar ? '' : ', noch zu teuer'}`;
      setzeAttr(k.el, 'aria-label', text);
      setzeAttr(k.el, 'title', text);
    }

    function symbolSvg(i) {
      return s('svg', { viewBox: '0 0 10 10', class: 'ha-symbol', 'aria-hidden': 'true' },
        s('path', { d: ctx.farben.symbolPfad(i % ctx.farben.anzahl), 'fill-rule': 'evenodd' }));
    }

    // ---------- Verkauf mit Leuchtturm ----------
    const turmSvg = s('svg', { viewBox: '0 0 40 90', class: 'ha-turm', 'aria-hidden': 'true' },
      s('path', { d: 'M12 86 L16 26 H24 L28 86 Z', class: 'ha-turm-leib' }),
      s('path', { d: 'M14.4 56 H25.6 L26.4 66 H13.6 Z', class: 'ha-turm-streifen' }),
      s('rect', { x: 14, y: 18, width: 12, height: 8, class: 'ha-turm-lampe' }),
      s('path', { d: 'M12 18 L20 8 L28 18 Z', class: 'ha-turm-dach' }));
    const strahl = h('span', { class: 'ha-strahl', 'aria-hidden': 'true' });
    const hauptBalken = balken();
    const hauptZahl = h('span', { class: 'ha-zahl' });
    const verkaufInfo = h('span', { class: 'ha-klein' });
    const verkaufKnopf = upKnopf('verkauf', 'Verkauf und Leuchtturm');
    const verkauf = h('section', { class: 'ha-verkauf', 'aria-label': 'Verkauf und Leuchtturm' },
      h('span', { class: 'ha-turm-halter' }, strahl, turmSvg),
      h('div', { class: 'ha-verkauf-mitte' },
        h('div', { class: 'ha-verkauf-kopf' }, h('span', { class: 'ha-name', text: 'Verkauf' }), verkaufInfo),
        h('div', { class: 'ha-lagerzeile', 'aria-label': 'Hauptlager' }, hauptBalken.el, hauptZahl)),
      verkaufKnopf.el);

    // ---------- Kran-Streifen und Docks ----------
    const kranKnopf = upKnopf('kran', 'Kran');
    const kranInfo = h('span', { class: 'ha-klein ha-kran-info' });
    const wagen = h('span', { class: 'ha-wagen', 'aria-hidden': 'true' });
    const kranStreifen = h('aside', { class: 'ha-kran-streifen', 'aria-label': 'Kran' },
      kranKnopf.el, kranInfo,
      h('span', { class: 'ha-schiene', 'aria-hidden': 'true' }, wagen));
    const dockListe = h('div', { class: 'ha-docks', 'aria-label': 'Docks' });
    const neuKnopf = upKnopf('neu', 'Neues Dock');
    const neuText = h('span', { class: 'ha-neu-text' });
    const neuZeile = h('div', { class: 'ha-neu-zeile' }, h('span', { class: 'ha-neu-plus', 'aria-hidden': 'true', text: '+' }), neuText, neuKnopf.el);
    const neuerHafen = h('button', {
      type: 'button', class: 'knopf klein ha-neu', text: modus === 'level' ? 'Level neu starten' : 'Neuer Hafen',
      on: { click: () => neuMitFrage() },
    });

    function baueZeile(i) {
      const info = L.EBENEN[i];
      const badge = h('span', { class: 'ha-badge', style: { background: farbe(i) }, 'aria-hidden': 'true' },
        s('svg', { viewBox: '0 0 24 24', class: 'ha-icon' }, s('path', { d: ICON[i], 'fill-rule': 'evenodd' })));
      const symbolHalter = h('span', { class: 'ha-symbol-halter' });
      const ladung = h('span', { class: 'ha-ladung', style: { background: farbe(i) } });
      const schiff = h('button', {
        type: 'button', class: 'ha-schiff',
        'aria-label': `${info.name}-Schiff antippen: leichter Schub beim Entladen`,
        on: { click: () => schub(i) },
      }, h('span', { class: 'ha-rumpf' }, ladung), h('span', { class: 'ha-mast' }));
      const see = h('div', { class: 'ha-see' },
        h('span', { class: 'ha-name ha-see-name' }, symbolHalter, info.name),
        schiff);
      const lagerBalken = balken();
      lagerBalken.fuell.style.background = farbe(i);
      const lagerZahl = h('span', { class: 'ha-zahl' });
      const lager = h('div', { class: 'ha-lager', 'aria-label': `${info.name}-Dock-Lager` }, lagerZahl, lagerBalken.el);
      const knopf = upKnopf(`d${i}`, `${info.name}-Dock`);
      const el = h('section', { class: 'ha-dock', 'aria-label': `${info.name}-Dock`, style: { '--ha-farbe': farbe(i) } },
        badge, see, lager, knopf.el);
      return { i, el, ladung, schiff, lagerBalken, lagerZahl, knopf, symbolHalter, symbolKey: null, lad: -1, pos: '' };
    }

    function stelleZeilenSicher() {
      if (zeilen.length === z.docks.length) return;
      while (zeilen.length > z.docks.length) zeilen.pop().el.remove();
      while (zeilen.length < z.docks.length) {
        const k = baueZeile(zeilen.length);
        zeilen.push(k);
        dockListe.append(k.el);
      }
    }

    const wurzel = h('div', { class: 'ha' },
      leiste, wegEl, statusEl, verkauf,
      h('div', { class: 'ha-hafen' }, kranStreifen, dockListe),
      neuZeile,
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
    function schiffPhase(d) {
      const ph = L.phasen(d);
      let x; let lad;
      if (d.p < ph.von) { const q = 1 - d.p / ph.von; x = q * q; lad = 1; }
      else if (d.p < ph.bis) { x = 0; lad = 1 - (d.p - ph.von) / (ph.bis - ph.von); }
      else { const q = (d.p - ph.bis) / (1 - ph.bis); x = q * q; lad = 0; }
      return { x, lad };
    }

    function zeichneZeile(k) {
      const d = z.docks[k.i];
      const { x, lad } = schiffPhase(d);
      const pos = ruhig() ? '0' : x.toFixed(3);
      if (pos !== k.pos) { k.pos = pos; k.schiff.style.setProperty('--x', pos); }
      const ladP = Math.round(lad * 100);
      if (ladP !== k.lad) { k.lad = ladP; k.ladung.style.height = `${ladP}%`; }
      const kap = L.dockKap(d);
      setzeBalken(k.lagerBalken, d.puffer, kap);
      setzeText(k.lagerZahl, `${L.formatiere(d.puffer)} / ${L.formatiere(kap)}`);
      const mus = ctx.farben.musterAn();
      if (k.symbolKey !== mus) {
        k.symbolKey = mus;
        k.symbolHalter.replaceChildren(...(mus ? [symbolSvg(k.i)] : []));
      }
      aktualisiereKnopf(k.knopf);
    }

    let zielWas = '';
    function zeichne() {
      stelleZeilenSicher();
      wurzel.classList.toggle('ha-still', ruhig());
      setzeText(geldEl, L.formatiere(z.geld));
      setzeText(rateEl, `+${L.formatiere(L.einkommen(z))}/s`);

      // Level-Ziel mit schmalem Fortschrittsbalken (im Endlos-Modus ausgeblendet)
      const imLevel = z.modus === 'level';
      zielZeile.hidden = !imLevel;
      if (imLevel) {
        const def = L.levelVon(z);
        if (z.weiter) {
          setzeText(zielText, `Level ${z.level} geschafft · Endlos`);
          zielBalken.el.hidden = true;
          setzeAttr(zielZeile, 'aria-label', `Level ${z.level} geschafft, du spielst ohne Ziel weiter`);
        } else {
          const f = L.zielFortschritt(z);
          const p = Math.floor(f * 100);
          setzeText(zielText, `Level ${z.level} · Ziel: ${L.zielText(def)}`);
          zielBalken.el.hidden = false;
          if (p !== zielBalken.proz) { zielBalken.proz = p; zielBalken.fuell.style.width = `${p}%`; }
          setzeAttr(zielZeile, 'aria-label', `Level ${z.level}, Ziel: ${L.zielText(def)}, ${p} Prozent`);
        }
      }

      // Verkauf
      setzeBalken(hauptBalken, L.hauptSumme(z), L.hallenKap(z));
      setzeText(hauptZahl, `${L.formatiere(L.hauptSumme(z))} / ${L.formatiere(L.hallenKap(z))}`);
      setzeText(verkaufInfo, `${L.formatiere(L.verkaufsRate(z))}/s`);
      const reich = L.reichweite(z).toFixed(2);
      if (verkauf.style.getPropertyValue('--reichweite') !== reich) verkauf.style.setProperty('--reichweite', reich);
      aktualisiereKnopf(verkaufKnopf);

      // Kran
      setzeText(kranInfo, `${L.formatiere(L.transportRate(z))}/s`);
      aktualisiereKnopf(kranKnopf);
      const wd = Math.max(2.5, 8 / (1 + 0.1 * (z.kran - 1))).toFixed(1);
      if (wagen.style.getPropertyValue('--lauf') !== `${wd}s`) wagen.style.setProperty('--lauf', `${wd}s`);

      // Docks
      zeilen.forEach(zeichneZeile);

      // Neues Dock
      const pn = L.preis(z, 'neu');
      neuZeile.hidden = pn === null;
      if (pn !== null) {
        setzeText(neuText, `Neues Dock · ${L.EBENEN[z.docks.length].name}`);
        aktualisiereKnopf(neuKnopf);
      }

      // Empfehlung: das „Nächste Ziel“ bekommt einen dezenten Rahmen (Taste K kauft es)
      const g = L.naechstesZiel(z);
      const ziel = g ? g.was : '';
      if (ziel !== zielWas) {
        wurzel.querySelectorAll('.ha-up.ziel').forEach((e) => e.classList.remove('ziel'));
        zielWas = ziel;
        const el = ziel ? wurzel.querySelector(`[data-was="${ziel}"]`) : null;
        if (el) el.classList.add('ziel');
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
      zielWas = '\u0000';
      blitz(was);
      ctx.meldeAenderung();
      zeichne();
      pruefeZiel();
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
      const level = modus === 'level';
      const wahl = await zeigeDialog({
        titel: level ? 'Level neu starten' : 'Neuer Hafen',
        inhalt: h('p', { text: level ? 'Dieses Level beginnt wieder von vorn. Neu starten?' : 'Dein jetziger Hafen geht dabei verloren. Neu beginnen?' }),
        knoepfe: [{ text: level ? 'Neu starten' : 'Neuer Hafen', wert: true, primaer: true }, { text: 'Abbrechen', wert: null }],
      });
      if (wahl && !zerstoert) { neuStart(); ctx.meldeAenderung(); }
    }

    /** Frischer Hafen im aktuellen Modus (Level: das im Speicher vorgemerkte Level) */
    function neuStart() {
      z = L.neuerHafen(Date.now(), modus, modus === 'level' ? spielLevel() : 0);
      letzt = Date.now();
      weg = null;
      geloest = false;
      zielWas = '\u0000';
      setzeText(neuerHafen, modus === 'level' ? 'Level neu starten' : 'Neuer Hafen');
      sage(modus === 'level' ? `Level ${z.level} gestartet.` : 'Neuer Hafen gestartet.');
      zeichneWeg();
      zeichne();
      starteTakt();
    }

    /** Ziel erreicht? Dann merken wir das nächste Level vor, halten den Takt an und melden der Shell den Erfolg */
    function pruefeZiel() {
      if (geloest || zerstoert || !L.zielErreicht(z)) return;
      geloest = true;
      const geschafft = z.level;
      ctx.speicher.schreibe('level', Math.min(L.LEVEL_MAX, geschafft + 1));
      stoppeTakt();
      zeichne();
      sage(`Level ${geschafft} geschafft.`);
      ctx.meldeGewonnen(`Level ${geschafft} geschafft: ${L.zielText(L.levelVon(z))}.`, { weiterspielen: true });
    }

    /** Nach dem Ziel ohne Ziel weiterspielen: gleicher Hafen, freie Knöpfe, Ziel wird nicht noch einmal gemeldet */
    function weiterspielen() {
      if (zerstoert) return;
      z = L.weiterspielen(z);
      letzt = Date.now();
      geloest = true;
      zielWas = '\u0000';
      ctx.meldeAenderung();
      zeichne();
      starteTakt();
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
      pruefeZiel();
    }

    function starteTakt() {
      if (timer || zerstoert) return;
      timer = setInterval(tick, TICK_MS);
    }
    function stoppeTakt() { clearInterval(timer); timer = 0; }

    ctx.signal?.addEventListener('abort', stoppeTakt);
    const abmelden = ctx.farben.beobachte(() => { zeilen.forEach((k) => { k.symbolKey = null; }); zeichne(); });

    zeichneWeg();
    zeichne();
    geloest = Boolean(z.weiter);
    starteTakt();
    setTimeout(pruefeZiel, 0);   // Ziel schon in der Abwesenheit erreicht → jetzt melden

    // ---------- Schnittstelle ----------
    return {
      getStand: () => L.zumSpeichern(z, Date.now()),
      zusammenfassung: () => (z.modus === 'level'
        ? (z.weiter ? `Level ${z.level} geschafft · Endlos` : `Level ${z.level} · Ziel ${Math.floor(L.zielFortschritt(z) * 100)} %`)
        : `Endlos · ${L.formatiere(z.geld)} Münzen`),
      kannRueckgaengig: () => false,
      rueckgaengig() { return false; },
      neu(variante) { modus = variante === 'level' ? 'level' : 'endlos'; neuStart(); },
      weiterspielen,
      onTaste(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return false;
        if (e.key === 'k' || e.key === 'K') { kaufeZiel(); return true; }
        return false;
      },
      pausiere() { stoppeTakt(); },
      fortsetze() { if (zerstoert || (z.modus === 'level' && geloest && !z.weiter)) return; tick(); starteTakt(); },
      zerstoere() {
        zerstoert = true;
        stoppeTakt();
        abmelden();
        container.replaceChildren();
      },
    };
  },
};
