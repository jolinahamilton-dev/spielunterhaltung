// Schachtbetrieb: ruhiges Idle-Spiel. Oben das Verkaufszentrum, daneben der Aufzug, darunter die Schächte.
// Bedienung: Maus/Touch oder Tab + Enter auf den Kaufknöpfen · Taste K kauft das „Nächste Ziel“.
import { h, s, ladeStil } from '../../kern/dom.js';
import { zeigeDialog } from '../../kern/dialog.js';
import * as L from './logik.js';

const TICK_MS = 200;             // Rechen- und Anzeigetakt
const SPEICHER_S = 10;           // so oft wird zwischendurch gespeichert
const MAX_PUNKTE = 8;            // so viele Bergleute werden gezeichnet
const WEG_MELDUNG_S = 60;        // ab dieser Abwesenheit „Während du weg warst“

export default {
  id: 'schachtbetrieb',
  name: 'Schachtbetrieb',
  beschreibung: 'Bergleute fördern, der Aufzug liefert, das Zentrum verkauft – baue dein Bergwerk in Ruhe aus.',
  varianten: [{ id: 'standard', name: 'Standard' }],
  standVersion: 1,

  erstelle(container, ctx, gespeichert) {
    ladeStil('spiele/schachtbetrieb/stil.css');

    let z = null;
    let weg = null;               // { dt, gewinn } der letzten Abwesenheit
    try { z = gespeichert ? L.ausSpeicher(gespeichert) : null; } catch { z = null; }
    const start = Date.now();
    if (z) {
      const o = L.offline(z, start);
      z = o.zustand;
      if (o.dt >= WEG_MELDUNG_S && o.gewinn > 0) weg = { dt: o.dt, gewinn: o.gewinn };
    } else {
      z = L.neuesBergwerk(start);
    }

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
    const ruhig = () => ctx.bewegungReduziert();
    const PFADE = {
      zentrum: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6',
      aufzug: 'M6 3h12v18H6zM12 3v18M9 9l3-3 3 3M9 15l3 3 3-3',
      schacht: 'M4 20L13 11M8 5c4-2 9 0 12 5M8 5c-2 4 0 9 5 12',
    };
    const ikone = (art) => s('svg', { viewBox: '0 0 24 24', class: 'sb-ikone', 'aria-hidden': 'true' }, s('path', { d: PFADE[art] }));

    // ---------- DOM: feste Leiste oben ----------
    const geldEl = h('span', { class: 'sb-geld-wert' });
    const rateEl = h('span', { class: 'sb-rate' });
    const zielText = h('span', { class: 'sb-ziel-text' });
    const zielKnopf = h('button', {
      type: 'button', class: 'knopf klein sb-ziel-knopf', text: 'Kaufen',
      on: { click: () => kaufeZiel() },
    });
    const leiste = h('div', { class: 'sb-leiste' },
      h('div', { class: 'sb-leiste-zeile' },
        h('div', { class: 'sb-geld', role: 'status', 'aria-label': 'Geld in Talern' }, geldEl, h('span', { class: 'sb-einheit', text: 'Taler' })),
        rateEl),
      h('div', { class: 'sb-leiste-zeile sb-ziel' },
        h('div', { class: 'sb-ziel-box' }, h('span', { class: 'sb-ziel-titel', text: 'Nächstes Ziel' }), zielText),
        zielKnopf),
    );

    const wegText = h('span', { class: 'sb-weg-text' });
    const wegKnopf = h('button', {
      type: 'button', class: 'knopf klein', text: 'OK', 'aria-label': 'Hinweis schließen',
      on: { click: () => { weg = null; zeichneWeg(); } },
    });
    const wegEl = h('div', { class: 'sb-weg', role: 'status', hidden: true }, wegText, wegKnopf);
    const statusEl = h('p', { class: 'sb-status', role: 'status', 'aria-live': 'polite' });

    const mine = h('div', { class: 'sb-mine' });
    const kabine = h('div', { class: 'sb-kabine', 'aria-hidden': 'true' }, h('span', { class: 'sb-kabine-last' }));
    const schiene = h('div', { class: 'sb-schiene', 'aria-hidden': 'true' }, kabine);

    /** Mengenzeile: Beschriftung, „x / Kapazität Erz“ und Füllbalken (feste Breiten, keine Sprünge) */
    function mengeZeile(titel) {
      const wert = h('span', { class: 'sb-menge-wert' });
      const fuell = h('span', { class: 'sb-fuell' });
      const balken = h('span', {
        class: 'sb-balken', role: 'progressbar', 'aria-label': titel, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0',
      }, fuell);
      const el = h('div', { class: 'sb-menge' },
        h('div', { class: 'sb-menge-kopf' }, h('span', { class: 'sb-menge-titel', text: titel }), wert), balken);
      return { el, wert, fuell, balken, key: '' };
    }
    function setzeMenge(m, ist, kap) {
      const proz = kap > 0 ? Math.min(100, (ist / kap) * 100) : 0;
      const key = `${L.formatiere(ist)}|${L.formatiere(kap)}|${Math.round(proz)}`;
      if (key === m.key) return;
      m.key = key;
      setzeText(m.wert, `${L.formatiere(ist)} / ${L.formatiere(kap)} Erz`);
      m.fuell.style.width = `${proz.toFixed(1)}%`;
      m.balken.setAttribute('aria-valuenow', String(Math.round(proz)));
      m.balken.setAttribute('aria-valuetext', `${L.formatiere(ist)} von ${L.formatiere(kap)} Erz`);
    }

    // Verkaufszentrum
    const lagerMenge = mengeZeile('Wartet auf Verkauf');
    const zentrumInfo = h('span', { class: 'sb-zeile-info' });
    const verkaeufer = h('span', { class: 'sb-arbeiter' });
    const zentrumEl = h('section', { class: 'sb-zeile sb-zentrum', 'aria-label': 'Verkaufszentrum' },
      h('div', { class: 'sb-zeile-kopf' },
        h('div', { class: 'sb-titelzeile' }, ikone('zentrum'), h('h3', { class: 'sb-titel', text: 'Verkaufszentrum' })),
        h('span', { class: 'sb-arbeiter-bahn', 'aria-hidden': 'true' }, verkaeufer)),
      lagerMenge.el, zentrumInfo);
    // Aufzug
    const ladeMenge = mengeZeile('Ladung je Fahrt');
    const aufzugInfo = h('span', { class: 'sb-zeile-info' });
    const aufzugEl = h('section', { class: 'sb-zeile sb-aufzug', 'aria-label': 'Aufzug' },
      h('div', { class: 'sb-zeile-kopf' }, h('div', { class: 'sb-titelzeile' }, ikone('aufzug'), h('h3', { class: 'sb-titel', text: 'Aufzug' }))),
      ladeMenge.el, aufzugInfo);
    const schachtListe = h('div', { class: 'sb-schaechte' });
    const neuerText = h('span', { class: 'sb-neuer-text' });
    const neuerEffekt = h('span', { class: 'sb-neuer-effekt' });
    const neuerSchachtKnopf = h('button', {
      type: 'button', class: 'sb-kauf sb-neuer', dataset: { was: 'schacht' },
      on: { click: () => kaufeWas('schacht') },
    }, neuerText, neuerEffekt);
    const neuBergwerk = h('button', {
      type: 'button', class: 'knopf klein sb-neu', text: 'Neues Bergwerk',
      on: { click: () => neuMitFrage() },
    });

    const wurzel = h('div', { class: 'sb' },
      leiste, wegEl, statusEl, mine,
      h('div', { class: 'sb-fuss' }, neuBergwerk),
    );
    mine.append(schiene, zentrumEl, aufzugEl, schachtListe, h('div', { class: 'sb-neuer-zeile' }, neuerSchachtKnopf));
    container.append(wurzel);

    // ---------- Kaufknöpfe (Knoten bleiben bestehen, nur Texte ändern sich) ----------
    function kaufKnopf(was, name) {
      const stufeEl = h('span', { class: 'sb-kauf-stufe' });
      const effektEl = h('span', { class: 'sb-kauf-effekt' });
      const preisEl = h('span', { class: 'sb-kauf-preis' });
      const el = h('button', {
        type: 'button', class: 'sb-kauf', dataset: { was },
        on: { click: () => kaufeWas(was) },
      }, h('span', { class: 'sb-kauf-name', text: name }), stufeEl, effektEl, preisEl);
      return { el, stufeEl, effektEl, preisEl, was, name, key: '' };
    }

    function aktualisiereKnopf(k, stufeText) {
      const p = L.preis(z, k.was);
      const bezahlbar = p !== null && z.geld >= p;
      const effekt = p === null ? '' : L.effektText(z, k.was);
      const key = `${stufeText}|${p}|${bezahlbar}|${effekt}`;
      if (key === k.key) return;
      k.key = key;
      setzeText(k.stufeEl, stufeText);
      setzeText(k.effektEl, p === null ? 'voll ausgebaut' : effekt);
      setzeText(k.preisEl, p === null ? 'Maximum' : L.formatiere(p));
      k.el.setAttribute('aria-disabled', String(!bezahlbar));
      k.el.classList.toggle('bereit', bezahlbar);
      k.el.setAttribute('aria-label', p === null
        ? `${k.name}, ${stufeText}, Maximum erreicht`
        : `${k.name}, ${stufeText}, ${effekt}, ${L.formatiere(p)} Taler${bezahlbar ? '' : ', noch zu teuer'}`);
    }

    const aufzugKnoepfe = [kaufKnopf('aufzug:tempo', 'Tempo'), kaufKnopf('aufzug:ladung', 'Ladung')];
    aufzugEl.append(h('div', { class: 'sb-knoepfe zwei' }, aufzugKnoepfe.map((k) => k.el)));
    const zentrumKnoepfe = [kaufKnopf('zentrum:tempo', 'Verkaufstempo'), kaufKnopf('zentrum:ladung', 'Ladung')];
    zentrumEl.append(h('div', { class: 'sb-knoepfe zwei' }, zentrumKnoepfe.map((k) => k.el)));

    function symbolSvg(f) {
      return s('svg', { viewBox: '0 0 10 10', class: 'sb-symbol', 'aria-hidden': 'true' },
        s('path', { d: ctx.farben.symbolPfad(f), 'fill-rule': 'evenodd' }));
    }

    /** Schacht-Karte k anlegen: links das Schachtlager (Aufzugsseite), rechts die Bergleute */
    function baueSchacht(k) {
      const farbe = ctx.farben.css(k % ctx.farben.anzahl);
      const symbolHalter = h('span', { class: 'sb-symbol-halter' });
      const info = h('span', { class: 'sb-zeile-info' });
      const anschub = h('button', {
        type: 'button', class: 'knopf klein sb-anschub', text: 'Antreiben',
        'aria-label': `Schacht ${k + 1} antreiben (kleiner Anschub)`,
        on: { click: () => antreiben(k) },
      });
      const punkte = h('span', { class: 'sb-punkte', 'aria-hidden': 'true' });
      const kisteFuell = h('span', { class: 'sb-fuell' });
      const kiste = h('span', {
        class: 'sb-kiste', role: 'progressbar', 'aria-label': `Schachtlager ${k + 1}`,
        'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0',
      }, kisteFuell);
      const kisteWert = h('span', { class: 'sb-kiste-wert' });
      const lager = h('div', { class: 'sb-lager' },
        h('span', { class: 'sb-lager-titel', text: 'Lager (Erz)' }), kiste, kisteWert);
      const gang = h('div', { class: 'sb-gang' }, info, punkte);
      const knoepfe = [kaufKnopf(`s${k}:n`, 'Bergleute'), kaufKnopf(`s${k}:tempo`, 'Tempo'), kaufKnopf(`s${k}:trag`, 'Tragkraft')];
      const el = h('section', { class: 'sb-zeile sb-schacht', 'aria-label': `Schacht ${k + 1}`, style: { '--sb-farbe': farbe } },
        h('div', { class: 'sb-zeile-kopf' },
          h('div', { class: 'sb-titelzeile' }, ikone('schacht'), symbolHalter,
            h('h3', { class: 'sb-titel', text: `Schacht ${k + 1} · ${L.SCHACHT_NAMEN[k] ?? 'Stollen'}` })),
          anschub),
        h('div', { class: 'sb-schacht-mitte' }, lager, gang),
        h('div', { class: 'sb-knoepfe drei' }, knoepfe.map((x) => x.el)),
      );
      return { k, el, info, punkte, kiste, kisteFuell, kisteWert, kisteKey: '', knoepfe, symbolHalter, punktKey: '', symbolKey: null };
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
      const anz = Math.min(sh.n, MAX_PUNKTE);
      const zeit = L.minerZeit(sh);
      const key = `${anz}|${zeit.toFixed(2)}`;
      if (key === zl.punktKey) return;
      zl.punktKey = key;
      zl.punkte.style.setProperty('--lauf', `${zeit.toFixed(2)}s`);
      zl.punkte.replaceChildren(...Array.from({ length: anz }, (_, i) => h('span', {
        class: 'sb-bergmann', style: { '--vers': `${(-(i / anz) * zeit).toFixed(2)}s`, '--reihe': i % 2 },
      })));
    }

    function zeichne() {
      stelleSchaechteSicher();
      wurzel.classList.toggle('sb-still', ruhig());
      setzeText(geldEl, L.formatiere(z.geld));
      const e = L.einkommen(z);
      setzeText(rateEl, `+${L.formatiere(e)} Taler/s`);

      // Nächstes Ziel
      const g = L.naechstesZiel(z);
      if (!g) {
        setzeText(zielText, 'Alles ausgebaut.');
        zielKnopf.hidden = true;
      } else {
        const wz = g.wartezeit <= 0 ? 'jetzt möglich' : `ca. ${L.formatiereDauer(g.wartezeit)}`;
        setzeText(zielText, `${L.bezeichnung(g.was)} · ${L.formatiere(g.preis)} · ${wz}`);
        zielKnopf.hidden = false;
        zielKnopf.setAttribute('aria-disabled', String(z.geld < g.preis));
        zielKnopf.classList.toggle('bereit', z.geld >= g.preis);
        zielKnopf.setAttribute('aria-label', `Nächstes Ziel kaufen: ${L.bezeichnung(g.was)}, ${L.formatiere(g.preis)} Taler`);
      }

      // Zentrum
      setzeMenge(lagerMenge, z.zentrum.lager, L.eingangKap(z));
      setzeText(zentrumInfo, `Verkauf bis zu ${L.formatiere(L.verkaufsRate(z))} Erz/s`);
      verkaeufer.style.setProperty('--lauf', `${L.zentrumZeit(z).toFixed(2)}s`);
      aktualisiereKnopf(zentrumKnoepfe[0], `Stufe ${z.zentrum.tempo}`);
      aktualisiereKnopf(zentrumKnoepfe[1], `Stufe ${z.zentrum.ladung}`);
      // Aufzug
      setzeMenge(ladeMenge, L.aufzugLast(z), L.aufzugLadung(z));
      setzeText(aufzugInfo, `Fahrt zu Schacht 1: ${L.fahrtZeit(z, 0).toFixed(1).replace('.', ',')} s`);
      aktualisiereKnopf(aufzugKnoepfe[0], `Stufe ${z.aufzug.tempo}`);
      aktualisiereKnopf(aufzugKnoepfe[1], `Stufe ${z.aufzug.ladung}`);

      // Schächte
      z.schaechte.forEach((sh, k) => {
        const zl = zeilen[k];
        zeichnePunkte(zl, sh);
        setzeText(zl.info, `${sh.n} Bergleute · +${L.formatiere(L.foerderung(sh, k))} Erz/s`);
        const kap = L.lagerKap(sh, k);
        const proz = kap > 0 ? Math.min(100, (sh.kiste / kap) * 100) : 0;
        const key = `${L.formatiere(sh.kiste)}|${L.formatiere(kap)}|${Math.round(proz)}`;
        if (key !== zl.kisteKey) {
          zl.kisteKey = key;
          setzeText(zl.kisteWert, `${L.formatiere(sh.kiste)} / ${L.formatiere(kap)}`);
          zl.kisteFuell.style.height = `${proz.toFixed(1)}%`;
          zl.kiste.setAttribute('aria-valuenow', String(Math.round(proz)));
          zl.kiste.setAttribute('aria-valuetext', `${L.formatiere(sh.kiste)} von ${L.formatiere(kap)} Erz`);
          zl.kiste.classList.toggle('voll', proz >= 99);
        }
        aktualisiereKnopf(zl.knoepfe[0], `${sh.n} von ${L.MAX_BERGLEUTE}`);
        aktualisiereKnopf(zl.knoepfe[1], `Stufe ${sh.tempo}`);
        aktualisiereKnopf(zl.knoepfe[2], `Stufe ${sh.trag}`);
        const mus = ctx.farben.musterAn();
        if (zl.symbolKey !== mus) {
          zl.symbolKey = mus;
          zl.symbolHalter.replaceChildren(...(mus ? [symbolSvg(k % ctx.farben.anzahl)] : []));
        }
      });

      // Neuer Schacht
      const pn = L.preis(z, 'schacht');
      neuerSchachtKnopf.hidden = pn === null;
      if (pn !== null) {
        const ok = z.geld >= pn;
        const txt = `Neuen Schacht öffnen (Schacht ${z.schaechte.length + 1}) · ${L.formatiere(pn)} Taler`;
        setzeText(neuerText, txt);
        setzeText(neuerEffekt, L.effektText(z, 'schacht'));
        neuerSchachtKnopf.setAttribute('aria-disabled', String(!ok));
        neuerSchachtKnopf.classList.toggle('bereit', ok);
        neuerSchachtKnopf.setAttribute('aria-label', `${txt}, ${L.effektText(z, 'schacht')}${ok ? '' : ', noch zu teuer'}`);
      }
      zeichneKabine();
    }

    function zeichneWeg() {
      wegEl.hidden = !weg;
      if (weg) {
        setzeText(wegText, `Während du weg warst (${L.formatiereDauer(weg.dt)}): +${L.formatiere(weg.gewinn)} Taler`);
      }
    }

    /** Kabine fährt nur zur Zierde zwischen Zentrum und dem vollsten Schachtlager */
    function zeichneKabine() {
      const zt = zentrumEl.offsetTop + zentrumEl.offsetHeight / 2;
      let y = zt;
      if (!ruhig()) {
        const dauer = Math.max(3, Math.min(14, L.fahrtZeit(z, kabineZiel)));
        const p = (Date.now() / 1000 / dauer) % 1;
        if (Math.floor(Date.now() / 1000 / dauer) !== kabinePhase) {
          kabinePhase = Math.floor(Date.now() / 1000 / dauer);
          let best = 0;
          z.schaechte.forEach((sh, k) => { if (sh.kiste > z.schaechte[best].kiste) best = k; });
          kabineZiel = best;
        }
        const zl = zeilen[kabineZiel];
        if (zl) {
          const ziel2 = zl.el.offsetTop + zl.el.offsetHeight / 2;
          const f = p < 0.5 ? p * 2 : 2 - p * 2;
          y = zt + (ziel2 - zt) * f;
        }
      }
      kabine.style.transform = `translateY(${Math.round(y - 14)}px)`;
      const bis = zeilen.length ? zeilen[zeilen.length - 1].el.offsetTop + zeilen[zeilen.length - 1].el.offsetHeight : 0;
      const hoehe = `${Math.max(0, bis)}px`;
      if (schiene.style.height !== hoehe) schiene.style.height = hoehe;
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
      if (wahl && !zerstoert) { neuesBergwerk(); ctx.meldeAenderung(); }
    }

    function neuesBergwerk() {
      z = L.neuesBergwerk(Date.now());
      letzt = Date.now();
      weg = null;
      kabinePhase = -1;
      schachtZahl = -1;
      sage('Neues Bergwerk gestartet.');
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
    const abmelden = ctx.farben.beobachte(() => { zeilen.forEach((zl) => { zl.symbolKey = null; }); zeichne(); });

    zeichneWeg();
    zeichne();
    starteTakt();

    // ---------- Schnittstelle ----------
    return {
      getStand: () => L.zumSpeichern(z, Date.now()),
      zusammenfassung: () => `${L.formatiere(z.geld)} Taler · ${z.schaechte.length} ${z.schaechte.length === 1 ? 'Schacht' : 'Schächte'}`,
      kannRueckgaengig: () => false,
      rueckgaengig() { return false; },
      neu() { neuesBergwerk(); },
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
