// Hafen: ruhiges Idle-Spiel. Schiffe laufen ein, Kräne entladen, das Lager verkauft.
// Bedienung: Maus/Touch oder Tab + Enter auf den Knöpfen · Schiff antippen = leichter Schub · Taste K kauft das „Nächste Ziel“.
import { h, s, ladeStil } from '../../kern/dom.js';
import { zeigeDialog } from '../../kern/dialog.js';
import * as L from './logik.js';

const TICK_MS = 200;             // Rechen- und Anzeigetakt
const SPEICHER_S = 10;           // so oft wird zwischendurch gespeichert
const WEG_MELDUNG_S = 60;        // ab dieser Abwesenheit „Während du weg warst“
const FRACHT_FARBE = [1, 2, 4];  // Farbindex je Frachtart (nur für Chips und Ladebalken)

export default {
  id: 'hafen',
  name: 'Hafen',
  beschreibung: 'Schiffe laufen ein, Kräne laden aus, das Lager verkauft – baue deinen kleinen Hafen in Ruhe aus.',
  varianten: [{ id: 'standard', name: 'Standard' }],
  standVersion: 1,

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

    let letzt = start;            // Zeitpunkt des letzten Ticks
    let timer = 0;
    let sekundenSeitSpeichern = 0;
    let zerstoert = false;
    let dockZahl = -1;
    const docks = [];             // Oberflächen-Elemente je Dock

    const farbe = (f) => ctx.farben.css(FRACHT_FARBE[f] % ctx.farben.anzahl);

    // ---------- DOM ----------
    const geldEl = h('span', { class: 'ha-geld-wert' });
    const rateEl = h('span', { class: 'ha-rate leise' });
    const lagerFuell = h('span', { class: 'ha-fuell' });
    const lagerBalken = h('span', { class: 'ha-balken', 'aria-hidden': 'true' }, lagerFuell);
    const lagerTxt = h('span', { class: 'ha-lager-txt' });
    const zielText = h('span', { class: 'ha-ziel-text' });
    const zielKnopf = h('button', {
      type: 'button', class: 'knopf klein ha-ziel-knopf', text: 'Kaufen',
      on: { click: () => kaufeZiel() },
    });
    const wegText = h('span', { class: 'ha-weg-text' });
    const wegKnopf = h('button', {
      type: 'button', class: 'knopf klein', text: 'OK', 'aria-label': 'Hinweis schließen',
      on: { click: () => { weg = null; zeichneWeg(); } },
    });
    const wegEl = h('div', { class: 'ha-weg', role: 'status', hidden: true }, wegText, wegKnopf);
    const statusEl = h('p', { class: 'ha-status', role: 'status', 'aria-live': 'polite' });

    const kopf = h('div', { class: 'ha-kopf' },
      h('div', { class: 'ha-geld', 'aria-label': 'Geld in Münzen' }, geldEl, h('span', { class: 'ha-einheit', text: ' Münzen' })),
      rateEl,
    );
    const lagerZeile = h('div', { class: 'ha-lager', 'aria-label': 'Lager' }, lagerBalken, lagerTxt);
    const ziel = h('div', { class: 'ha-ziel' }, h('span', { class: 'ha-ziel-titel', text: 'Nächstes Ziel' }), zielText, zielKnopf);

    // Szene: Leuchtturm, Strahl, Wellen
    const turmInfo = h('span', { class: 'ha-turm-info' });
    const strahl = h('span', { class: 'ha-strahl', 'aria-hidden': 'true' });
    const turmSvg = s('svg', { viewBox: '0 0 40 90', class: 'ha-turm', 'aria-hidden': 'true' },
      s('path', { d: 'M12 86 L16 26 H24 L28 86 Z', class: 'ha-turm-leib' }),
      s('path', { d: 'M14.4 56 H25.6 L26.4 66 H13.6 Z', class: 'ha-turm-streifen' }),
      s('path', { d: 'M13.2 76 H26.8 L27.6 86 H12.4 Z', class: 'ha-turm-streifen' }),
      s('rect', { x: 14, y: 18, width: 12, height: 8, class: 'ha-turm-lampe' }),
      s('path', { d: 'M12 18 L20 8 L28 18 Z', class: 'ha-turm-dach' }),
      s('rect', { x: 8, y: 86, width: 24, height: 4, class: 'ha-turm-sockel' }));
    const szene = h('div', { class: 'ha-szene', role: 'img', 'aria-label': 'Hafen mit Leuchtturm und Meer' },
      h('span', { class: 'ha-welle ha-welle-1', 'aria-hidden': 'true' }),
      h('span', { class: 'ha-welle ha-welle-2', 'aria-hidden': 'true' }),
      strahl, turmSvg, turmInfo);

    const dockListe = h('div', { class: 'ha-docks', 'aria-label': 'Docks' });
    const neuesDockKnopf = h('button', {
      type: 'button', class: 'ha-kauf ha-neues-dock', dataset: { was: 'dock' },
      on: { click: () => kaufeWas('dock') },
    });
    const neuerHafen = h('button', {
      type: 'button', class: 'knopf klein ha-neu', text: 'Neuer Hafen',
      on: { click: () => neuMitFrage() },
    });

    // ---------- Kaufknöpfe ----------
    function kaufKnopf(was, name) {
      const stufeEl = h('span', { class: 'ha-kauf-stufe' });
      const preisEl = h('span', { class: 'ha-kauf-preis' });
      const el = h('button', {
        type: 'button', class: 'ha-kauf', dataset: { was },
        on: { click: () => kaufeWas(was) },
      }, h('span', { class: 'ha-kauf-name', text: name }), stufeEl, preisEl);
      return { el, stufeEl, preisEl, was, name, key: '' };
    }

    function aktualisiereKnopf(k, stufeText, naechsteText) {
      const p = L.preis(z, k.was);
      const bezahlbar = p !== null && z.geld >= p;
      const key = `${stufeText}|${p}|${bezahlbar}`;
      if (key === k.key) return;
      k.key = key;
      k.stufeEl.textContent = stufeText;
      k.preisEl.textContent = p === null ? 'Fertig' : L.formatiere(p);
      k.el.setAttribute('aria-disabled', String(!bezahlbar));
      k.el.classList.toggle('bereit', bezahlbar);
      k.el.setAttribute('aria-label', p === null
        ? `${k.name}: ${stufeText}, fertig ausgebaut`
        : `${k.name}: ${stufeText}, ${naechsteText}, ${L.formatiere(p)} Münzen${bezahlbar ? '' : ', noch zu teuer'}`);
    }

    const kn = {
      kranTempo: kaufKnopf('kran:tempo', 'Tempo'),
      kranKap: kaufKnopf('kran:kap', 'Kapazität'),
      groesse: kaufKnopf('schiff:groesse', 'Größe'),
      haeufig: kaufKnopf('schiff:haeufig', 'Häufigkeit'),
      halle: kaufKnopf('halle', 'Lagerhalle'),
      turm: kaufKnopf('turm', 'Leuchtturm'),
      lotse: kaufKnopf('lotse', 'Lotsenboot'),
    };
    const gruppe = (titel, knoepfe, klasse) => h('section', { class: 'ha-gruppe', 'aria-label': titel },
      h('h3', { class: 'ha-titel', text: titel }),
      h('div', { class: `ha-knoepfe ${klasse}` }, knoepfe.map((k) => k.el)));

    const upgrades = h('div', { class: 'ha-upgrades' },
      gruppe('Kräne', [kn.kranTempo, kn.kranKap], 'zwei'),
      gruppe('Schiffe', [kn.groesse, kn.haeufig], 'zwei'),
      gruppe('Hafenanlagen', [kn.halle, kn.turm, kn.lotse], 'drei'),
    );

    const wurzel = h('div', { class: 'ha' },
      kopf, lagerZeile, ziel, wegEl, statusEl, szene,
      dockListe, h('div', { class: 'ha-neues-dock-zeile' }, neuesDockKnopf),
      upgrades,
      h('div', { class: 'ha-fuss' }, neuerHafen),
    );
    container.append(wurzel);

    function symbolSvg(f) {
      return s('svg', { viewBox: '0 0 10 10', class: 'ha-symbol', 'aria-hidden': 'true' },
        s('path', { d: ctx.farben.symbolPfad(FRACHT_FARBE[f] % ctx.farben.anzahl), 'fill-rule': 'evenodd' }));
    }

    /** Karte für Dock k anlegen */
    function baueDock(k) {
      const titel = h('h3', { class: 'ha-titel', text: `Dock ${k + 1}` });
      const frachtKnopf = h('button', {
        type: 'button', class: 'ha-fracht',
        on: { click: () => wechsleFracht(k) },
      });
      const info = h('span', { class: 'ha-zeile-info' });
      const phaseTxt = h('span', { class: 'ha-zeile-info ha-phase' });
      const ladung = h('span', { class: 'ha-ladung' });
      const schiff = h('button', {
        type: 'button', class: 'ha-schiff',
        'aria-label': `Schiff an Dock ${k + 1} antippen: leichter Schub beim Entladen`,
        on: { click: () => schub(k) },
      }, h('span', { class: 'ha-rumpf' }, ladung), h('span', { class: 'ha-mast' }));
      const see = h('div', { class: 'ha-see' },
        h('span', { class: 'ha-kai', 'aria-hidden': 'true' }),
        h('span', { class: 'ha-kran', 'aria-hidden': 'true' }),
        schiff);
      const el = h('section', { class: 'ha-dock', 'aria-label': `Dock ${k + 1}` },
        h('div', { class: 'ha-dock-kopf' }, titel, frachtKnopf),
        see,
        h('div', { class: 'ha-dock-fuss' }, info, phaseTxt),
      );
      return { k, el, info, phaseTxt, ladung, schiff, frachtKnopf, frachtKey: '' };
    }

    function stelleDocksSicher() {
      if (dockZahl === z.docks.length) return;
      while (docks.length > z.docks.length) docks.pop().el.remove();
      while (docks.length < z.docks.length) {
        const d = baueDock(docks.length);
        docks.push(d);
        dockListe.append(d.el);
      }
      dockZahl = z.docks.length;
    }

    // ---------- Darstellung ----------
    function setzeText(el, text) { if (el.textContent !== text) el.textContent = text; }
    const ruhig = () => ctx.bewegungReduziert();
    const komma = (x, n = 1) => x.toFixed(n).replace('.', ',');

    function schiffPosition(dock) {
      const ph = L.phasen(z, dock.f);
      const p = dock.p;
      let x;           // 1 = rechts draußen, 0 = am Kai
      let lad;         // Ladungsanteil im Schiff
      let text;
      if (p < ph.von) { x = 1 - p / ph.von; lad = 1; text = 'läuft ein'; x = x * x; }
      else if (p < ph.bis) { x = 0; lad = 1 - (p - ph.von) / (ph.bis - ph.von); text = 'wird entladen'; }
      else { const q = (p - ph.bis) / (1 - ph.bis); x = q * q; lad = 0; text = 'legt ab'; }
      return { x, lad, text };
    }

    function zeichneDock(d, dock) {
      const { x, lad, text } = schiffPosition(dock);
      const fr = L.FRACHT[dock.f];
      const key = `${dock.f}|${ctx.farben.musterAn()}|${z.turm}`;
      if (d.frachtKey !== key) {
        d.frachtKey = key;
        d.frachtKnopf.replaceChildren(
          ...(ctx.farben.musterAn() ? [symbolSvg(dock.f)] : []),
          h('span', { class: 'ha-fracht-punkt', style: { background: farbe(dock.f) }, 'aria-hidden': 'true' }),
          h('span', { text: fr.name }),
        );
        const mehr = L.naechsteFracht(z, d.k) !== dock.f;
        d.frachtKnopf.setAttribute('aria-label', mehr
          ? `Fracht von Dock ${d.k + 1}: ${fr.name}. Ändern`
          : `Fracht von Dock ${d.k + 1}: ${fr.name}. Noch keine andere Fracht freigeschaltet`);
        d.frachtKnopf.setAttribute('aria-disabled', String(!mehr));
        d.ladung.style.background = farbe(dock.f);
      }
      const pos = ruhig() ? 0 : x;
      d.schiff.style.setProperty('--x', String(pos));
      d.ladung.style.height = `${Math.round(lad * 100)}%`;
      setzeText(d.info, `${L.formatiere(L.schiffGroesse(z, dock.f))} ${fr.name} je Schiff · +${L.formatiere(L.schiffGroesse(z, dock.f) / L.zyklusZeit(z, dock.f))}/s`);
      setzeText(d.phaseTxt, `Schiff ${text} · ${Math.round(lad * 100)} % an Bord`);
    }

    function zeichne() {
      stelleDocksSicher();
      wurzel.classList.toggle('ha-still', ruhig());
      setzeText(geldEl, L.formatiere(z.geld));
      const e = L.einkommen(z);
      setzeText(rateEl, `ca. +${L.formatiere(e)} pro Sekunde`);

      // Lager
      const kap = L.lagerKap(z);
      const voll = L.lagerSumme(z) >= kap * 0.98;
      lagerFuell.style.width = `${Math.min(100, (L.lagerSumme(z) / kap) * 100)}%`;
      lagerBalken.classList.toggle('voll', voll);
      setzeText(lagerTxt, `Lager ${L.formatiere(L.lagerSumme(z))} von ${L.formatiere(kap)} · verkauft ${L.formatiere(L.verkaufsRate(z))}/s${voll ? ' · voll, Kräne warten' : ''}`);

      // Nächstes Ziel
      const g = L.naechstesZiel(z);
      if (!g) {
        setzeText(zielText, 'Alles ausgebaut – dein Hafen ist fertig.');
        zielKnopf.hidden = true;
      } else {
        const wz = g.wartezeit <= 0 ? 'jetzt möglich' : `in ca. ${L.formatiereDauer(g.wartezeit)}`;
        setzeText(zielText, `${L.bezeichnung(g.was)} · ${L.formatiere(g.preis)} Münzen · ${wz}`);
        zielKnopf.hidden = false;
        zielKnopf.setAttribute('aria-disabled', String(z.geld < g.preis));
        zielKnopf.classList.toggle('bereit', z.geld >= g.preis);
        zielKnopf.setAttribute('aria-label', `Nächstes Ziel kaufen: ${L.bezeichnung(g.was)}, ${L.formatiere(g.preis)} Münzen`);
      }

      // Szene
      setzeText(turmInfo, `Leuchtturm Stufe ${z.turm}`);
      szene.style.setProperty('--reichweite', String(Math.min(1, 0.35 + z.turm * 0.03)));

      // Docks
      z.docks.forEach((dock, k) => zeichneDock(docks[k], dock));
      const pd = L.preis(z, 'dock');
      neuesDockKnopf.hidden = pd === null;
      if (pd !== null) {
        const ok = z.geld >= pd;
        const txt = `Neues Dock bauen (Dock ${z.docks.length + 1}) · ${L.formatiere(pd)} Münzen`;
        setzeText(neuesDockKnopf, txt);
        neuesDockKnopf.setAttribute('aria-disabled', String(!ok));
        neuesDockKnopf.setAttribute('aria-label', `${txt}${ok ? '' : ', noch zu teuer'}`);
        neuesDockKnopf.classList.toggle('bereit', ok);
      }

      // Upgrades
      const st = (was) => `Stufe ${L.stufe(z, was)}`;
      const nx = (was) => `Stufe ${L.stufe(z, was) + 1}`;
      aktualisiereKnopf(kn.kranTempo, st('kran:tempo'), nx('kran:tempo'));
      aktualisiereKnopf(kn.kranKap, st('kran:kap'), nx('kran:kap'));
      aktualisiereKnopf(kn.groesse, st('schiff:groesse'), nx('schiff:groesse'));
      aktualisiereKnopf(kn.haeufig, st('schiff:haeufig'), nx('schiff:haeufig'));
      aktualisiereKnopf(kn.halle, st('halle'), nx('halle'));
      const frachtHinweis = z.turm < L.FRACHT[1].turm - 1 ? `Fisch ab Stufe ${L.FRACHT[1].turm}`
        : z.turm < L.FRACHT[2].turm - 1 && z.turm >= L.FRACHT[1].turm - 1 ? `Erz ab Stufe ${L.FRACHT[2].turm}` : nx('turm');
      aktualisiereKnopf(kn.turm, st('turm'), frachtHinweis.startsWith('Stufe') ? frachtHinweis : `${nx('turm')}, ${frachtHinweis}`);
      aktualisiereKnopf(kn.lotse, z.lotse ? 'vorhanden' : 'Anlegen automatisch', 'Anlegen automatisch und schneller');
    }

    function zeichneWeg() {
      wegEl.hidden = !weg;
      if (weg) {
        setzeText(wegText, `Während du weg warst (${L.formatiereDauer(weg.dt)}): +${L.formatiere(weg.gewinn)} Münzen`);
      }
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
      if (!g) return false;
      return kaufeWas(g.was);
    }

    function wechsleFracht(k) {
      const f = L.naechsteFracht(z, k);
      const r = L.weise(z, k, f);
      if (!r.ok || f === z.docks[k].f) { ctx.meldung('Noch keine andere Fracht freigeschaltet (Leuchtturm ausbauen).'); return; }
      z = r.zustand;
      sage(`Dock ${k + 1} lädt jetzt ${L.FRACHT[f].name}.`);
      ctx.meldeAenderung();
      zeichne();
    }

    function schub(k) {
      const r = L.anschub(z, k);
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
      dockZahl = -1;
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
    const abmelden = ctx.farben.beobachte(() => { docks.forEach((d) => { d.frachtKey = ''; }); zeichne(); });

    zeichneWeg();
    zeichne();
    starteTakt();

    // ---------- Schnittstelle ----------
    return {
      getStand: () => L.zumSpeichern(z, Date.now()),
      zusammenfassung: () => `${L.formatiere(z.geld)} Münzen · ${z.docks.length} ${z.docks.length === 1 ? 'Dock' : 'Docks'}`,
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
