// Schachtbetrieb: ruhiges, minimalistisches Idle-Spiel. Oben das Verkaufszentrum, links der Aufzug,
// rechts daneben die Schächte. Je Station genau ein Upgrade-Knopf.
// Bedienung: Maus/Touch oder Tab + Enter auf den Knöpfen · Taste K kauft das „Nächste Ziel“.
import { h, s, ladeStil } from '../../kern/dom.js';
import { zeigeDialog } from '../../kern/dialog.js';
import * as L from './logik.js';

const TICK_MS = 200;             // Rechen- und Anzeigetakt
const SPEICHER_S = 10;           // so oft wird zwischendurch gespeichert
const MAX_PUNKTE = 6;            // so viele Bergleute werden gezeichnet
const WEG_MELDUNG_S = 60;        // ab dieser Abwesenheit „Während du weg warst“

export default {
  id: 'schachtbetrieb',
  name: 'Schachtbetrieb',
  beschreibung: 'Bergleute fördern, der Aufzug liefert, das Zentrum verkauft – baue dein Bergwerk in Ruhe aus.',
  variantenTitel: 'Spielart',
  varianten: [
    { id: 'level', name: 'Level – mit Ziel' },
    { id: 'endlos', name: 'Endlos – ohne Ziel' },
  ],
  standVersion: L.STAND_VERSION,

  erstelle(container, ctx, gespeichert) {
    ladeStil('spiele/schachtbetrieb/stil.css');

    let z = null;
    let weg = null;               // { dt, gewinn } der letzten Abwesenheit
    const start = Date.now();
    /** Zahl der geschafften Level (pro Spiel in ctx.speicher, streng geprüft) */
    const geschafft = () => {
      const g = ctx.speicher.lies('geloest', 0);
      return Number.isInteger(g) && g >= 0 && g < L.MAX_LEVEL ? g : 0;
    };
    const frisch = (variante) => (variante === 'endlos' ? L.neuesBergwerk(Date.now(), 0) : L.neuesBergwerk(Date.now(), geschafft() + 1));
    try { z = gespeichert ? L.ausSpeicher(gespeichert) : null; } catch { z = null; }
    // ein Stand mit erreichtem Ziel, der nicht weiterspielt, gehört in den Gelöst-Dialog, nicht zurück ins Spiel
    if (z && z.fertig && !z.weiter) z = null;
    let altMeldung = false;
    let sofortGeschafft = false;
    if (z) {
      const o = L.offline(z, start);
      z = o.zustand;
      if (o.dt >= WEG_MELDUNG_S && o.gewinn > 0) weg = { dt: o.dt, gewinn: o.gewinn };
    } else {
      altMeldung = Boolean(gespeichert) && !(gespeichert && gespeichert.fertig === true);
      z = frisch(ctx.variante);
    }
    if (z.level > 0 && !z.fertig && L.zielStand(z).erreicht) sofortGeschafft = true;

    let letzt = start;            // Zeitpunkt des letzten Ticks
    let timer = 0;
    let sekundenSeitSpeichern = 0;
    let zerstoert = false;
    let kabineZiel = 0;           // Schacht, zu dem die Kabine (nur optisch) fährt
    let kabinePhase = -1;
    let schachtZahl = -1;
    const zeilen = [];            // Oberflächen-Elemente je Schacht

    // ---------- Hilfen ----------
    /** Text nur ändern, wenn er sich unterscheidet; den Textknoten wiederverwenden */
    function setzeText(el, text) {
      const n = el.firstChild;
      if (n && n.nodeType === 3 && el.childNodes.length === 1) { if (n.nodeValue !== text) n.nodeValue = text; }
      else if (el.textContent !== text) el.textContent = text;
    }
    function setzeAttr(el, name, wert) { if (el.getAttribute(name) !== wert) el.setAttribute(name, wert); }
    const ruhig = () => ctx.bewegungReduziert();
    const PFADE = {
      zentrum: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6',
      aufzug: 'M6 3h12v18H6zM12 3v18M9 9l3-3 3 3M9 15l3 3 3-3',
    };
    const ikone = (art) => s('svg', { viewBox: '0 0 24 24', class: 'sb-ikone', 'aria-hidden': 'true' }, s('path', { d: PFADE[art] }));

    // ---------- DOM: feste Leiste oben ----------
    const geldEl = h('span', { class: 'sb-geld-wert' });
    const rateEl = h('span', { class: 'sb-rate' });
    const hinweisEl = h('span', { class: 'sb-hinweis' });
    const zielFuell = h('span', { class: 'sb-fuell' });
    const zielBalken = h('span', {
      class: 'sb-balken sb-ziel-balken', role: 'progressbar', 'aria-label': 'Fortschritt zum Ziel', hidden: true,
      'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0',
    }, zielFuell);
    let zielKey = '';
    const leiste = h('div', { class: 'sb-leiste' },
      h('div', { class: 'sb-leiste-zeile' },
        h('div', { class: 'sb-geld', role: 'status', 'aria-label': 'Geld in Talern' }, geldEl, h('span', { class: 'sb-einheit', text: 'Taler' })),
        rateEl),
      hinweisEl,
      zielBalken,
    );

    const wegText = h('span', { class: 'sb-weg-text' });
    const wegKnopf = h('button', {
      type: 'button', class: 'knopf klein', text: 'OK', 'aria-label': 'Hinweis schließen',
      on: { click: () => { weg = null; zeichneWeg(); } },
    });
    const wegEl = h('div', { class: 'sb-weg', role: 'status', hidden: true }, wegText, wegKnopf);
    const statusEl = h('p', { class: 'sb-status', role: 'status', 'aria-live': 'polite' });

    /** Dünne Mengenanzeige: „x / y“ und Füllbalken */
    function menge(titel) {
      const wert = h('span', { class: 'sb-menge-wert' });
      const fuell = h('span', { class: 'sb-fuell' });
      const balken = h('span', {
        class: 'sb-balken', role: 'progressbar', 'aria-label': titel, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0',
      }, fuell);
      const el = h('div', { class: 'sb-menge' }, wert, balken);
      return { el, wert, fuell, balken, key: '' };
    }
    function setzeMenge(m, ist, kap) {
      const proz = kap > 0 ? Math.min(100, (ist / kap) * 100) : 0;
      const key = `${L.formatiere(ist)}|${L.formatiere(kap)}|${Math.round(proz)}`;
      if (key === m.key) return;
      m.key = key;
      setzeText(m.wert, `${L.formatiere(ist)} / ${L.formatiere(kap)}`);
      m.fuell.style.width = `${proz.toFixed(1)}%`;
      m.balken.setAttribute('aria-valuenow', String(Math.round(proz)));
      m.balken.setAttribute('aria-valuetext', `${L.formatiere(ist)} von ${L.formatiere(kap)} Erz`);
      m.balken.classList.toggle('voll', proz >= 99);
    }

    /** Der eine Upgrade-Knopf einer Station: „▲ Preis“ mit Stufe als Abzeichen. Knoten bleiben bestehen. */
    function upKnopf(was, name) {
      const preisEl = h('span', { class: 'sb-up-preis' });
      const stufeEl = h('span', { class: 'sb-up-stufe', 'aria-hidden': 'true' });
      const el = h('button', {
        type: 'button', class: 'sb-up', dataset: { was },
        on: { click: () => kaufeWas(was) },
      }, h('span', { class: 'sb-up-pfeil', text: '▲', 'aria-hidden': 'true' }), preisEl, stufeEl);
      return { el, preisEl, stufeEl, was, name, key: '' };
    }
    function aktualisiereUp(k, stufe) {
      const p = L.preis(z, k.was);
      const bezahlbar = p !== null && z.geld >= p;
      const effekt = p === null ? '' : L.effektText(z, k.was);
      const key = `${stufe}|${p}|${bezahlbar}|${effekt}`;
      if (key === k.key) return;
      k.key = key;
      setzeText(k.preisEl, p === null ? 'Max' : L.formatiere(p));
      setzeText(k.stufeEl, String(stufe));
      setzeAttr(k.el, 'aria-disabled', String(!bezahlbar));
      k.el.classList.toggle('bereit', bezahlbar);
      setzeAttr(k.el, 'title', p === null ? 'Höchste Stufe' : effekt);
      setzeAttr(k.el, 'aria-label', p === null
        ? `${k.name}, Stufe ${stufe}, höchste Stufe erreicht`
        : `${k.name}, Stufe ${stufe}, verbessern: ${effekt}, ${L.formatiere(p)} Taler${bezahlbar ? '' : ', noch zu teuer'}`);
    }

    // Verkaufszentrum: Symbol, Eingangslager, Upgrade
    const lagerMenge = menge('Eingangslager des Verkaufszentrums');
    const zentrumUp = upKnopf('zentrum', 'Verkaufszentrum');
    const verkaeufer = h('span', { class: 'sb-arbeiter' });
    const zentrumEl = h('section', { class: 'sb-reihe sb-zentrum', 'aria-label': 'Verkaufszentrum', title: 'Verkaufszentrum' },
      ikone('zentrum'),
      h('div', { class: 'sb-mitte' }, lagerMenge.el, h('span', { class: 'sb-arbeiter-bahn', 'aria-hidden': 'true' }, verkaeufer)),
      zentrumUp.el);

    // Aufzug: Schacht links mit Kopf (Upgrade) und fahrender Kabine
    const ladeMenge = menge('Ladung des Aufzugs');
    const aufzugUp = upKnopf('aufzug', 'Aufzug');
    const kabine = h('div', { class: 'sb-kabine', 'aria-hidden': 'true' }, h('span', { class: 'sb-kabine-last' }));
    const schiene = h('div', { class: 'sb-schiene', 'aria-hidden': 'true' }, kabine);
    const aufzugEl = h('section', { class: 'sb-aufzug', 'aria-label': 'Aufzug', title: 'Aufzug' },
      h('div', { class: 'sb-aufzug-kopf' }, ikone('aufzug'), aufzugUp.el, ladeMenge.el),
      schiene);

    const schachtListe = h('div', { class: 'sb-schaechte' });
    const neuerPreis = h('span', { class: 'sb-neuer-preis' });
    const neuerSchachtKnopf = h('button', {
      type: 'button', class: 'sb-neuer', dataset: { was: 'schacht' },
      on: { click: () => kaufeWas('schacht') },
    }, h('span', { class: 'sb-neuer-text', text: '+ Neuer Schacht' }), neuerPreis);
    const neuerZeile = h('div', { class: 'sb-neuer-zeile' }, neuerSchachtKnopf);
    const neuBergwerk = h('button', {
      type: 'button', class: 'knopf klein sb-neu', text: 'Neues Bergwerk',
      on: { click: () => neuMitFrage() },
    });

    const mine = h('div', { class: 'sb-mine' }, aufzugEl, zentrumEl, schachtListe, neuerZeile);
    const wurzel = h('div', { class: 'sb' }, leiste, wegEl, statusEl, mine, h('div', { class: 'sb-fuss' }, neuBergwerk));
    container.append(wurzel);

    function symbolSvg(f) {
      return s('svg', { viewBox: '0 0 10 10', class: 'sb-symbol', 'aria-hidden': 'true' },
        s('path', { d: ctx.farben.symbolPfad(f), 'fill-rule': 'evenodd' }));
    }

    /** Schacht-Zeile k: Schachtlager (am Aufzug), Bergleute, ein Upgrade-Knopf */
    function baueSchacht(k) {
      const farbe = ctx.farben.css(k % ctx.farben.anzahl);
      const name = `Schacht ${k + 1} (${L.SCHACHT_NAMEN[k] ?? 'Stollen'})`;
      const lager = menge(`Schachtlager ${k + 1}`);
      lager.el.classList.add('sb-lager');
      const symbolHalter = h('span', { class: 'sb-symbol-halter' });
      const nummer = h('span', { class: 'sb-nummer', 'aria-hidden': 'true' }, String(k + 1), symbolHalter);
      const punkte = h('span', { class: 'sb-punkte', 'aria-hidden': 'true' }, nummer);
      const anschub = h('button', {
        type: 'button', class: 'sb-anschub', 'aria-label': `${name} antreiben (kleiner Anschub)`, title: 'Antreiben',
        on: { click: () => antreiben(k) },
      });
      const up = upKnopf(`s${k}`, name);
      const el = h('section', { class: 'sb-reihe sb-schacht', 'aria-label': name, title: name, style: { '--sb-farbe': farbe } },
        lager.el, h('div', { class: 'sb-gang' }, punkte, anschub), up.el);
      return { k, el, lager, punkte, up, symbolHalter, punktKey: '', symbolKey: null };
    }

    function stelleSchaechteSicher() {
      if (schachtZahl === z.schaechte.length) return;
      while (zeilen.length > z.schaechte.length) zeilen.pop().el.remove();
      while (zeilen.length < z.schaechte.length) {
        const zl = baueSchacht(zeilen.length);
        zeilen.push(zl);
        schachtListe.append(zl.el);
      }
      schachtZahl = z.schaechte.length;
    }

    // ---------- Darstellung ----------
    function zeichnePunkte(zl, sh) {
      const anz = Math.min(L.bergleute(sh), MAX_PUNKTE);
      const zeit = L.minerZeit(sh);
      const key = `${anz}|${zeit.toFixed(2)}`;
      if (key === zl.punktKey) return;
      zl.punktKey = key;
      zl.punkte.style.setProperty('--lauf', `${zeit.toFixed(2)}s`);
      zl.punkte.querySelectorAll('.sb-bergmann').forEach((e) => e.remove());
      zl.punkte.append(...Array.from({ length: anz }, (_, i) => h('span', {
        class: 'sb-bergmann', style: { '--vers': `${(-(i / anz) * zeit).toFixed(2)}s`, '--reihe': i % 2 },
      })));
    }

    function zeichne() {
      stelleSchaechteSicher();
      wurzel.classList.toggle('sb-still', ruhig());
      setzeText(geldEl, L.formatiere(z.geld));
      setzeText(rateEl, `+${L.formatiere(L.einkommen(z))}/s`);

      // Ziel (Level) bzw. winziger Hinweis (Endlos)
      const zs = z.level > 0 && !z.weiter ? L.zielStand(z) : null;
      if (zs) {
        const def = L.levelDef(z.level);
        const pr = Math.floor(zs.anteil * 100);
        const key = `${z.level}|${pr}`;
        if (key !== zielKey) {
          zielKey = key;
          const text = `Level ${z.level} · Ziel: ${L.zielText(def)} · ${pr} %`;
          setzeText(hinweisEl, text);
          setzeAttr(hinweisEl, 'title', text);
          zielFuell.style.width = `${pr}%`;
          zielBalken.setAttribute('aria-valuenow', String(pr));
          zielBalken.setAttribute('aria-valuetext', `${pr} Prozent`);
        }
        zielBalken.hidden = false;
      } else {
        zielKey = '';
        zielBalken.hidden = true;
        const g = L.naechstesZiel(z);
        setzeText(hinweisEl, z.level > 0 ? 'Endlos – ohne Ziel' : g
          ? `Endlos · Nächstes: ${L.bezeichnung(g.was)} · ${L.formatiere(g.preis)} · ${g.wartezeit <= 0 ? 'jetzt' : `ca. ${L.formatiereDauer(g.wartezeit)}`}`
          : 'Endlos · Alles ausgebaut.');
        setzeAttr(hinweisEl, 'title', hinweisEl.textContent);
      }

      // Zentrum und Aufzug
      setzeMenge(lagerMenge, z.zentrum.lager, L.eingangKap(z));
      verkaeufer.style.setProperty('--lauf', `${L.zentrumZeit(z).toFixed(2)}s`);
      aktualisiereUp(zentrumUp, z.zentrum.stufe);
      setzeMenge(ladeMenge, L.aufzugLast(z), L.aufzugLadung(z));
      aktualisiereUp(aufzugUp, z.aufzug.stufe);

      // Schächte
      z.schaechte.forEach((sh, k) => {
        const zl = zeilen[k];
        zeichnePunkte(zl, sh);
        setzeMenge(zl.lager, sh.kiste, L.lagerKap(sh, k));
        aktualisiereUp(zl.up, sh.stufe);
        const mus = ctx.farben.musterAn();
        if (zl.symbolKey !== mus) {
          zl.symbolKey = mus;
          zl.symbolHalter.replaceChildren(...(mus ? [symbolSvg(k % ctx.farben.anzahl)] : []));
        }
      });

      // Neuer Schacht
      const pn = L.preis(z, 'schacht');
      neuerZeile.hidden = pn === null;
      if (pn !== null) {
        const ok = z.geld >= pn;
        setzeText(neuerPreis, L.formatiere(pn));
        setzeAttr(neuerSchachtKnopf, 'aria-disabled', String(!ok));
        neuerSchachtKnopf.classList.toggle('bereit', ok);
        setzeAttr(neuerSchachtKnopf, 'title', L.effektText(z, 'schacht'));
        setzeAttr(neuerSchachtKnopf, 'aria-label', `Neuen Schacht öffnen (Schacht ${z.schaechte.length + 1}), ${L.effektText(z, 'schacht')}, ${L.formatiere(pn)} Taler${ok ? '' : ', noch zu teuer'}`);
      }
      zeichneKabine();
    }

    function zeichneWeg() {
      wegEl.hidden = !weg;
      if (weg) setzeText(wegText, `Während du weg warst (${L.formatiereDauer(weg.dt)}): +${L.formatiere(weg.gewinn)} Taler`);
    }

    /** Kabine fährt nur zur Zierde im Aufzugsschacht auf und ab, Richtung vollstes Schachtlager */
    function zeichneKabine() {
      const sr = schiene.getBoundingClientRect();
      const kh = 26;
      let y = 4;
      if (!ruhig() && sr.height > kh + 8) {
        const dauer = Math.max(3, Math.min(14, L.fahrtZeit(z, kabineZiel)));
        const jetzt = Date.now() / 1000 / dauer;
        const p = jetzt % 1;
        if (Math.floor(jetzt) !== kabinePhase) {
          kabinePhase = Math.floor(jetzt);
          let best = 0;
          z.schaechte.forEach((sh, k) => { if (sh.kiste > z.schaechte[best].kiste) best = k; });
          kabineZiel = best;
        }
        const zl = zeilen[kabineZiel];
        let ziel = sr.height - kh - 4;
        if (zl) {
          const r = zl.el.getBoundingClientRect();
          ziel = Math.max(4, Math.min(sr.height - kh - 4, r.top + r.height / 2 - sr.top - kh / 2));
        }
        y = 4 + (ziel - 4) * (p < 0.5 ? p * 2 : 2 - p * 2);
      }
      kabine.style.transform = `translateY(${Math.round(y)}px)`;
    }

    // ---------- Aktionen ----------
    function sage(text) { statusEl.textContent = text; }

    function kaufeWas(was) {
      const r = L.kaufe(z, was);
      if (!r.ok) {
        if (r.grund === 'zu wenig Geld') { ctx.meldung('Noch zu wenig Taler.'); sage('Noch zu wenig Taler.'); }
        return false;
      }
      z = r.zustand;
      sage(`Gekauft: ${L.bezeichnung(was)} für ${L.formatiere(r.preis)} Taler.`);
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
      if (!g) return false;
      return kaufeWas(g.was);
    }

    function antreiben(k) {
      const r = L.anschub(z, k);
      if (r.ok) { z = r.zustand; zeichne(); }
    }

    async function neuMitFrage() {
      const wahl = await zeigeDialog({
        titel: 'Neues Bergwerk',
        inhalt: h('p', { text: 'Dein jetziges Bergwerk geht dabei verloren. Neu beginnen?' }),
        knoepfe: [{ text: 'Neues Bergwerk', wert: true, primaer: true }, { text: 'Abbrechen', wert: null }],
      });
      if (wahl && !zerstoert) { neuesBergwerk(z.level > 0 ? L.neuesBergwerk(Date.now(), z.level) : L.neuesBergwerk(Date.now(), 0)); ctx.meldeAenderung(); }
    }

    /** Zustand ersetzen (neues Level oder neues Endlos-Bergwerk) und den Takt wieder starten */
    function neuesBergwerk(neu) {
      z = neu;
      letzt = Date.now();
      zielKey = '';
      weg = null;
      kabinePhase = -1;
      schachtZahl = -1;
      sage(z.level > 0 ? `Level ${z.level} gestartet.` : 'Neues Bergwerk gestartet.');
      zeichneWeg();
      zeichne();
      starteTakt();
    }

    /** Ziel des Levels erreicht: einmalig melden (auch wenn es offline erreicht wurde) */
    function pruefeZiel() {
      if (z.level === 0 || z.fertig || z.weiter || zerstoert) return false;
      if (!L.zielStand(z).erreicht) return false;
      z.fertig = true;
      stoppeTakt();
      ctx.speicher.schreibe('geloest', Math.max(geschafft(), z.level));
      zeichne();
      ctx.meldeAenderung();
      ctx.meldeGewonnen(`Level ${z.level} geschafft: ${L.zielText(L.levelDef(z.level))}.`, { weiterspielen: true });
      return true;
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
      if (pruefeZiel()) return;
      if (sekundenSeitSpeichern >= SPEICHER_S) { sekundenSeitSpeichern = 0; ctx.meldeAenderung(); }
      zeichne();
    }

    function starteTakt() {
      if (timer || zerstoert) return;
      timer = setInterval(tick, TICK_MS);
    }
    function stoppeTakt() { clearInterval(timer); timer = 0; }

    ctx.signal?.addEventListener('abort', stoppeTakt);
    const abmelden = ctx.farben.beobachte(() => { zeilen.forEach((zl) => { zl.symbolKey = null; }); zeichne(); });

    zeichneWeg();
    zeichne();
    if (sofortGeschafft) {
      // Ziel wurde schon beim Öffnen (offline) erreicht: erst nach dem Aufbau melden
      setTimeout(() => { if (!zerstoert) pruefeZiel(); }, 0);
    } else if (!z.fertig || z.weiter) starteTakt();
    if (altMeldung) ctx.meldung('Der alte Spielstand passt nicht mehr – ein neues Bergwerk wurde begonnen.');

    // ---------- Schnittstelle ----------
    return {
      getStand: () => L.zumSpeichern(z, Date.now()),
      zusammenfassung: () => {
        if (z.level === 0 || z.weiter) return `Endlos · ${L.formatiere(z.geld)} Taler`;
        if (z.fertig) return `Level ${z.level} geschafft`;
        return `Level ${z.level} · Ziel ${Math.floor(L.zielStand(z).anteil * 100)} %`;
      },
      kannRueckgaengig: () => false,
      rueckgaengig() { return false; },
      neu(variante) { neuesBergwerk(frisch(variante ?? ctx.variante)); },
      /** „Weiterspielen ohne Ziel“ aus dem Gelöst-Dialog: dasselbe Bergwerk, ab jetzt Endlos */
      weiterspielen() {
        if (!z.fertig || z.weiter) return;
        z.weiter = true;
        letzt = Date.now();
        zielKey = '';
        zeichne();
        starteTakt();
        ctx.meldeAenderung();
      },
      onTaste(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return false;
        if (e.key === 'k' || e.key === 'K') { kaufeZiel(); return true; }
        return false;
      },
      pausiere() { stoppeTakt(); },
      fortsetze() { if (zerstoert || (z.fertig && !z.weiter)) return; tick(); starteTakt(); },
      zerstoere() {
        zerstoert = true;
        stoppeTakt();
        abmelden();
        container.replaceChildren();
      },
    };
  },
};
