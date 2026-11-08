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

    // ---------- DOM ----------
    const geldEl = h('span', { class: 'sb-geld-wert' });
    const rateEl = h('span', { class: 'sb-rate leise' });
    const zielText = h('span', { class: 'sb-ziel-text' });
    const zielKnopf = h('button', {
      type: 'button', class: 'knopf klein sb-ziel-knopf', text: 'Kaufen',
      on: { click: () => kaufeZiel() },
    });
    const wegText = h('span', { class: 'sb-weg-text' });
    const wegKnopf = h('button', {
      type: 'button', class: 'knopf klein', text: 'OK', 'aria-label': 'Hinweis schließen',
      on: { click: () => { weg = null; zeichneWeg(); } },
    });
    const wegEl = h('div', { class: 'sb-weg', role: 'status', hidden: true }, wegText, wegKnopf);
    const statusEl = h('p', { class: 'sb-status', role: 'status', 'aria-live': 'polite' });

    const kopf = h('div', { class: 'sb-kopf' },
      h('div', { class: 'sb-geld', 'aria-label': 'Geld in Talern' }, geldEl, h('span', { class: 'sb-einheit', text: ' Taler' })),
      rateEl,
    );
    const ziel = h('div', { class: 'sb-ziel' }, h('span', { class: 'sb-ziel-titel', text: 'Nächstes Ziel' }), zielText, zielKnopf);

    const mine = h('div', { class: 'sb-mine' });
    const kabine = h('div', { class: 'sb-kabine', 'aria-hidden': 'true' }, h('span', { class: 'sb-kabine-last' }));
    const schiene = h('div', { class: 'sb-schiene', 'aria-hidden': 'true' }, kabine);

    // Verkaufszentrum
    const lagerFuell = h('span', { class: 'sb-fuell' });
    const lagerTxt = h('span', { class: 'sb-zeile-info' });
    const verkaeufer = h('span', { class: 'sb-arbeiter sb-verkaeufer' });
    const zentrumEl = h('section', { class: 'sb-zeile sb-zentrum', 'aria-label': 'Verkaufszentrum' },
      h('div', { class: 'sb-zeile-kopf' },
        h('h3', { class: 'sb-titel', text: 'Verkaufszentrum' }), lagerTxt),
      h('div', { class: 'sb-bild' },
        h('span', { class: 'sb-balken', role: 'img', 'aria-hidden': 'true' }, lagerFuell), verkaeufer),
    );
    // Aufzug
    const aufzugTxt = h('span', { class: 'sb-zeile-info' });
    const aufzugEl = h('section', { class: 'sb-zeile sb-aufzug', 'aria-label': 'Aufzug' },
      h('div', { class: 'sb-zeile-kopf' }, h('h3', { class: 'sb-titel', text: 'Aufzug' }), aufzugTxt));
    const schachtListe = h('div', { class: 'sb-schaechte' });
    const neuerSchachtKnopf = h('button', {
      type: 'button', class: 'sb-kauf sb-neuer', dataset: { was: 'schacht' },
      on: { click: () => kaufeWas('schacht') },
    });
    const neuBergwerk = h('button', {
      type: 'button', class: 'knopf klein sb-neu', text: 'Neues Bergwerk',
      on: { click: () => neuMitFrage() },
    });

    const wurzel = h('div', { class: 'sb' },
      kopf, ziel, wegEl, statusEl, mine,
      h('div', { class: 'sb-fuss' }, neuBergwerk),
    );
    mine.append(schiene, zentrumEl, aufzugEl, schachtListe, h('div', { class: 'sb-neuer-zeile' }, neuerSchachtKnopf));
    container.append(wurzel);

    // ---------- Kaufknöpfe ----------
    /** Knopf mit Name, Stufe und Preis; Inhalt wird später nur noch aktualisiert */
    function kaufKnopf(was, name) {
      const stufeEl = h('span', { class: 'sb-kauf-stufe' });
      const preisEl = h('span', { class: 'sb-kauf-preis' });
      const el = h('button', {
        type: 'button', class: 'sb-kauf', dataset: { was },
        on: { click: () => kaufeWas(was) },
      }, h('span', { class: 'sb-kauf-name', text: name }), stufeEl, preisEl);
      return { el, stufeEl, preisEl, was, name, key: '' };
    }

    function aktualisiereKnopf(k, stufeText, naechsteText) {
      const p = L.preis(z, k.was);
      const bezahlbar = p !== null && z.geld >= p;
      const key = `${stufeText}|${p}|${bezahlbar}`;
      if (key === k.key) return;
      k.key = key;
      k.stufeEl.textContent = stufeText;
      k.preisEl.textContent = p === null ? 'Maximum' : L.formatiere(p);
      k.el.setAttribute('aria-disabled', String(!bezahlbar));
      k.el.classList.toggle('bereit', bezahlbar);
      k.el.setAttribute('aria-label', p === null
        ? `${k.name}: ${stufeText}, Maximum erreicht`
        : `${k.name}: ${stufeText}, ${naechsteText}, ${L.formatiere(p)} Taler${bezahlbar ? '' : ', noch zu teuer'}`);
    }

    const aufzugKnoepfe = [kaufKnopf('aufzug:tempo', 'Tempo'), kaufKnopf('aufzug:ladung', 'Ladung')];
    aufzugEl.append(h('div', { class: 'sb-knoepfe zwei' }, aufzugKnoepfe.map((k) => k.el)));
    const zentrumKnoepfe = [kaufKnopf('zentrum:tempo', 'Tempo'), kaufKnopf('zentrum:ladung', 'Ladung')];
    zentrumEl.append(h('div', { class: 'sb-knoepfe zwei' }, zentrumKnoepfe.map((k) => k.el)));

    function symbolSvg(f) {
      return s('svg', { viewBox: '0 0 10 10', class: 'sb-symbol', 'aria-hidden': 'true' },
        s('path', { d: ctx.farben.symbolPfad(f), 'fill-rule': 'evenodd' }));
    }

    /** Zeile für Schacht k anlegen */
    function baueSchacht(k) {
      const farbe = ctx.farben.css(k % ctx.farben.anzahl);
      const titel = h('h3', { class: 'sb-titel', text: `Schacht ${k + 1} · ${L.SCHACHT_NAMEN[k] ?? 'Stollen'}` });
      const symbolHalter = h('span', { class: 'sb-symbol-halter' });
      const info = h('span', { class: 'sb-zeile-info' });
      const anschub = h('button', {
        type: 'button', class: 'knopf klein sb-anschub', text: 'Antreiben',
        'aria-label': `Schacht ${k + 1} antreiben (kleiner Anschub)`,
        on: { click: () => antreiben(k) },
      });
      const punkte = h('span', { class: 'sb-punkte', 'aria-hidden': 'true' });
      const kisteFuell = h('span', { class: 'sb-fuell' });
      const kiste = h('span', { class: 'sb-kiste', 'aria-hidden': 'true' }, kisteFuell);
      const kisteTxt = h('span', { class: 'sb-kiste-txt leise' });
      const gang = h('div', { class: 'sb-gang' }, punkte, kiste);
      const knoepfe = [kaufKnopf(`s${k}:n`, 'Bergleute'), kaufKnopf(`s${k}:tempo`, 'Tempo'), kaufKnopf(`s${k}:trag`, 'Tragkraft')];
      const el = h('section', { class: 'sb-zeile sb-schacht', 'aria-label': `Schacht ${k + 1}`, style: { '--sb-farbe': farbe } },
        h('div', { class: 'sb-zeile-kopf' }, h('div', { class: 'sb-titelzeile' }, symbolHalter, titel), anschub),
        h('div', { class: 'sb-zeile-kopf zweit' }, info, kisteTxt),
        gang,
        h('div', { class: 'sb-knoepfe drei' }, knoepfe.map((x) => x.el)),
      );
      return { k, el, info, punkte, kisteFuell, kisteTxt, knoepfe, symbolHalter, punktKey: '', symbolKey: null };
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
    function setzeText(el, text) { if (el.textContent !== text) el.textContent = text; }
    const ruhig = () => ctx.bewegungReduziert();

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
      setzeText(rateEl, `ca. +${L.formatiere(e)} pro Sekunde`);

      // Nächstes Ziel
      const g = L.naechstesZiel(z);
      if (!g) {
        setzeText(zielText, 'Alles ausgebaut – dein Bergwerk ist fertig.');
        zielKnopf.hidden = true;
      } else {
        const wz = g.wartezeit <= 0 ? 'jetzt möglich' : `in ca. ${L.formatiereDauer(g.wartezeit)}`;
        setzeText(zielText, `${L.bezeichnung(g.was)} · ${L.formatiere(g.preis)} Taler · ${wz}`);
        zielKnopf.hidden = false;
        zielKnopf.setAttribute('aria-disabled', String(z.geld < g.preis));
        zielKnopf.classList.toggle('bereit', z.geld >= g.preis);
        zielKnopf.setAttribute('aria-label', `Nächstes Ziel kaufen: ${L.bezeichnung(g.was)}, ${L.formatiere(g.preis)} Taler`);
      }

      // Zentrum und Aufzug
      const lad = L.aufzugLadung(z);
      setzeText(lagerTxt, `Lager ${L.formatiere(z.zentrum.lager)} · schafft ${L.formatiere(L.verkaufsRate(z))}/s`);
      lagerFuell.style.width = `${Math.min(100, (z.zentrum.lager / (L.zentrumLadung(z) * 3)) * 100)}%`;
      verkaeufer.style.setProperty('--lauf', `${L.zentrumZeit(z).toFixed(2)}s`);
      setzeText(aufzugTxt, `trägt ${L.formatiere(lad)} je Fahrt · Fahrt zu Schacht 1: ${L.fahrtZeit(z, 0).toFixed(1).replace('.', ',')} s`);
      aktualisiereKnopf(zentrumKnoepfe[0], `Stufe ${z.zentrum.tempo}`, `Stufe ${z.zentrum.tempo + 1}`);
      aktualisiereKnopf(zentrumKnoepfe[1], `Stufe ${z.zentrum.ladung}`, `Stufe ${z.zentrum.ladung + 1}`);
      aktualisiereKnopf(aufzugKnoepfe[0], `Stufe ${z.aufzug.tempo}`, `Stufe ${z.aufzug.tempo + 1}`);
      aktualisiereKnopf(aufzugKnoepfe[1], `Stufe ${z.aufzug.ladung}`, `Stufe ${z.aufzug.ladung + 1}`);

      // Schächte
      z.schaechte.forEach((sh, k) => {
        const zl = zeilen[k];
        zeichnePunkte(zl, sh);
        setzeText(zl.info, `${sh.n} Bergleute · +${L.formatiere(L.foerderung(sh, k))}/s`);
        setzeText(zl.kisteTxt, `Kiste ${L.formatiere(sh.kiste)}`);
        zl.kisteFuell.style.height = `${Math.min(100, (sh.kiste / (lad * 2)) * 100)}%`;
        aktualisiereKnopf(zl.knoepfe[0], `${sh.n} von ${L.MAX_BERGLEUTE}`, `${sh.n + 1} Bergleute`);
        aktualisiereKnopf(zl.knoepfe[1], `Stufe ${sh.tempo}`, `Stufe ${sh.tempo + 1}`);
        aktualisiereKnopf(zl.knoepfe[2], `Stufe ${sh.trag}`, `Stufe ${sh.trag + 1}`);
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
        setzeText(neuerSchachtKnopf, txt);
        neuerSchachtKnopf.setAttribute('aria-disabled', String(!ok));
        neuerSchachtKnopf.setAttribute('aria-label', `${txt}${ok ? '' : ', noch zu teuer'}`);
        neuerSchachtKnopf.classList.toggle('bereit', ok);
      }
      zeichneKabine();
    }

    function zeichneWeg() {
      wegEl.hidden = !weg;
      if (weg) {
        setzeText(wegText, `Während du weg warst (${L.formatiereDauer(weg.dt)}): +${L.formatiere(weg.gewinn)} Taler`);
      }
    }

    /** Kabine fährt nur zur Zierde zwischen Zentrum und dem vollsten Schacht */
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
      schiene.style.height = `${Math.max(0, bis)}px`;
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
