// Farben sortieren: Farbschichten umgießen, bis jede Röhre einfarbig ist.
// Bedienung: Klick Quelle → Klick Ziel, oder Ziehen · Tastatur 1–9, 0, Q, W, E bzw. Pfeile + Enter, Esc
// · + = Zusatzröhre. Level n einer Stufe ist überall gleich (Seed aus Stufe + n).
import { h, s as svg, ladeStil } from '../../kern/dom.js';
import * as L from './logik.js';

const TASTEN = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Q', 'W', 'E', 'R', 'T'];
const WORKER = 'spiele/farben-sortieren/generator.worker.js';
const zuegeText = (n) => `${n} ${n === 1 ? 'Zug' : 'Züge'}`;

export default {
  id: 'farben-sortieren',
  name: 'Farben sortieren',
  beschreibung: 'Farbschichten umgießen, bis jede Röhre einfarbig ist.',
  varianten: L.STUFEN_IDS.map((id) => {
    const st = L.STUFEN[id];
    const f = st.farben[0] === st.farben[1] ? st.farben[0] : `${st.farben[0]}–${st.farben[1]}`;
    return { id, name: `${st.name} – ${f} Farben${st.kapazitaet !== 4 ? `, ${st.kapazitaet} Schichten` : ''}` };
  }),
  standVersion: 1,

  erstelle(container, ctx, gespeichert) {
    ladeStil('spiele/farben-sortieren/stil.css');
    const { signal } = ctx;
    const worker = ctx.worker(WORKER);

    let s = null;            // aktueller Spielstand (siehe getStand)
    let wartet = null;       // { stufe, nr } solange ein Level erzeugt wird
    let auswahl = -1;        // gewählte Quelle
    let fokus = 0;           // Röhre mit Tastaturfokus (roving tabindex)
    let hinweisZug = null;   // [quelle, ziel]
    let ueber = -1;          // Ziel beim Ziehen
    let neuIn = null;        // { roehre, anzahl } – frisch eingegossene Schichten (Animation)
    let fehlZiel = -1, fehlTimer = 0;
    let anfrage = 0;         // Zähler gegen veraltete Worker-Antworten
    let aktiv = true;
    let roehrenEls = [];

    // ---------- DOM ----------
    const stufeEl = h('span', { class: 'fs-stufe' });
    const zaehlerEl = h('span', { class: 'fs-zaehler' });
    const feld = h('div', { class: 'fs-feld', role: 'group', 'aria-label': 'Röhren' });
    const zusatzKnopf = h('button', {
      type: 'button', class: 'knopf klein', title: 'Eine leere Röhre dazu – einmal pro Level (+)',
      on: { click: () => zusatzRoehre() },
    }, '+ Röhre');
    const vonVornKnopf = h('button', {
      type: 'button', class: 'knopf klein', title: 'Level von vorn (lässt sich rückgängig machen)',
      on: { click: () => instanz.neustart() },
    }, 'Von vorn');
    const status = h('p', { class: 'fs-status leise', 'aria-live': 'polite' });
    const wurzel = h('div', { class: 'fs' },
      h('div', { class: 'fs-info' }, stufeEl, zaehlerEl),
      feld,
      h('div', { class: 'fs-leiste' }, zusatzKnopf, vonVornKnopf),
      status,
    );
    container.append(wurzel);

    // ---------- Hilfen ----------
    const kap = () => s.level.kapazitaet;
    const startRoehren = () => s.level.roehren.map((r) => r.slice());
    const farbName = (f) => ctx.farben.liste[f]?.name ?? `Farbe ${f + 1}`;
    const tasteVon = (i) => TASTEN[i] ?? '';
    const spalten = () => {
      const n = s.roehren.length;
      return n <= 7 ? n : Math.ceil(n / 2);
    };

    function symbolSvg(farbe) {
      return svg('svg', { viewBox: '0 0 10 10', class: 'fs-symbol', 'aria-hidden': 'true' },
        svg('path', { d: ctx.farben.symbolPfad(farbe), 'fill-rule': 'evenodd' }));
    }

    // ---------- Darstellung ----------
    function baueRoehren() {
      const n = s.roehren.length;
      if (roehrenEls.length !== n) {
        roehrenEls = Array.from({ length: n }, (_, i) => h('div', {
          class: 'fs-roehre', role: 'button', tabindex: '-1', dataset: { i },
        }, h('div', { class: 'fs-glas' }), h('span', { class: 'fs-nr', 'aria-hidden': 'true', text: tasteVon(i) })));
        feld.replaceChildren(...roehrenEls);
      }
      feld.style.setProperty('--spalten', spalten());
      feld.style.setProperty('--k', kap());
      if (fokus >= n) fokus = n - 1;
    }

    function zeichne() {
      if (!s) return;
      baueRoehren();
      const muster = ctx.farben.musterAn();
      const k = kap();
      const ziele = new Set();
      if (auswahl >= 0) s.roehren.forEach((_, j) => { if (L.menge(s.roehren, k, auswahl, j)) ziele.add(j); });
      s.roehren.forEach((r, i) => {
        const el = roehrenEls[i];
        const glas = el.firstChild;
        const fertig = L.istFertig(r, k);
        const frisch = neuIn && neuIn.roehre === i ? r.length - neuIn.anzahl : Infinity;
        glas.replaceChildren(...r.map((f, j) => h('div', {
          class: `fs-schicht${j >= frisch ? ' fs-neu' : ''}`, style: { background: ctx.farben.css(f) },
        }, muster ? symbolSvg(f) : null)));
        el.className = 'fs-roehre'
          + (fertig ? ' fs-fertig' : '')
          + (i === auswahl ? ' fs-gewaehlt' : '')
          + (ziele.has(i) ? ' fs-ziel-ok' : '')
          + (i === ueber && i !== auswahl ? ' fs-ueber' : '')
          + (i === fehlZiel ? ' fs-fehl' : '')
          + (hinweisZug && hinweisZug[0] === i ? ' fs-hinweis-quelle' : '')
          + (hinweisZug && hinweisZug[1] === i ? ' fs-hinweis-ziel' : '');
        el.tabIndex = i === fokus ? 0 : -1;
        const inhalt = r.length ? r.map(farbName).join(', ') : 'leer';
        el.setAttribute('aria-label', `Röhre ${i + 1} (Taste ${tasteVon(i)}): ${inhalt}`
          + `${r.length ? ', unten nach oben' : ''}${fertig ? ', fertig' : ''}${i === auswahl ? ', gewählt' : ''}`);
        el.setAttribute('aria-pressed', String(i === auswahl));
      });
      neuIn = null;
      zeichneInfo();
    }

    function zeichneInfo() {
      stufeEl.textContent = `${L.STUFEN[s.stufe].name} · Level ${s.nr}`;
      const best = s.level.optimal ? `bestmöglich: ${s.level.optimum}` : `lösbar in ≤ ${s.level.optimum}`;
      zaehlerEl.textContent = `Züge: ${s.zuege} · ${best}`;
      const zusatzDa = s.roehren.length > s.level.roehren.length;
      zusatzKnopf.disabled = s.gewonnen || zusatzDa;
      zusatzKnopf.textContent = zusatzDa ? 'Röhre dazu ✓' : '+ Röhre';
      vonVornKnopf.disabled = s.gewonnen || !s.verlauf.length;
    }

    function setzeStatus(text) { status.textContent = text; }

    function standardStatus() {
      if (!s || s.gewonnen) return setzeStatus('');
      if (!L.hatSinnvollenZug(s.roehren, kap())) {
        setzeStatus('Hier geht kein sinnvoller Zug mehr – Rückgängig oder Hinweis hilft weiter.');
      } else setzeStatus('');
    }

    // ---------- Aktionen ----------
    function waehle(i) {
      auswahl = i;
      hinweisZug = null;
      zeichne();
      if (i >= 0) setzeStatus(`Röhre ${i + 1} gewählt – jetzt das Ziel wählen (Esc bricht ab).`);
      else standardStatus();
    }

    function zeigeFehl(i) {
      clearTimeout(fehlTimer);
      fehlZiel = i;
      zeichne();
      fehlTimer = setTimeout(() => { fehlZiel = -1; if (s) zeichne(); }, 320);
    }

    function merke(eintrag, neu) {
      s.verlauf.push(eintrag);
      s.wieder = [];
      s.roehren = neu.roehren;
      s.zuege = neu.zuege;
    }

    function giesse(a, b) {
      const k = kap();
      const r = L.giesse(s.roehren, k, a, b);
      if (!r) return false;
      merke(['g', a, b, r.zug[2]], { roehren: r.roehren, zuege: s.zuege + 1 });
      auswahl = -1;
      hinweisZug = null;
      anfrage++;
      if (!ctx.bewegungReduziert()) neuIn = { roehre: b, anzahl: r.zug[2] };
      zeichne();
      standardStatus();
      ctx.meldeAenderung();
      if (L.geloest(s.roehren, k)) gewinne();
      return true;
    }

    function gewinne() {
      s.gewonnen = true;
      zeichneInfo();
      const best = s.level.optimal ? `bestmöglich ${s.level.optimum}` : `Lösung in ≤ ${s.level.optimum}`;
      const extra = [s.zusatz ? 'mit Zusatzröhre' : '', s.hinweise ? `${s.hinweise} ${s.hinweise === 1 ? 'Hinweis' : 'Hinweise'}` : '']
        .filter(Boolean).join(', ');
      ctx.meldeGewonnen(`Level ${s.nr} · ${zuegeText(s.zuege)} (${best})${extra ? ` · ${extra}` : ''}`);
    }

    /** Klick, Tippen, Enter oder Taste auf Röhre i */
    function aktiviere(i) {
      if (!s || s.gewonnen || i < 0 || i >= s.roehren.length) return;
      fokus = i;
      if (auswahl < 0) {
        if (!s.roehren[i].length) { zeigeFehl(i); setzeStatus('Diese Röhre ist leer – erst eine Röhre mit Farbe wählen.'); return; }
        waehle(i);
        return;
      }
      if (auswahl === i) { waehle(-1); return; }
      if (!giesse(auswahl, i)) {
        zeigeFehl(i);
        setzeStatus(`Von Röhre ${auswahl + 1} passt nichts in Röhre ${i + 1}.`);
      }
    }

    function zusatzRoehre() {
      if (!s || s.gewonnen || s.roehren.length > s.level.roehren.length) return;
      merke(['r'], { roehren: s.roehren.concat([[]]), zuege: s.zuege });
      s.zusatz = true;
      hinweisZug = null;
      anfrage++;
      zeichne();
      ctx.meldung('Zusätzliche Röhre steht bereit.');
      ctx.meldeAenderung();
    }

    async function hinweisHolen() {
      if (!s || s.gewonnen) return;
      s.hinweise++;
      auswahl = -1;
      hinweisZug = null;
      zeichne();
      // aktueller Zustand und die Zustände nach 1, 2, … Rückgängig
      const zustaende = [s.roehren];
      let z = { roehren: s.roehren, zuege: s.zuege };
      for (let i = s.verlauf.length - 1; i >= 0 && zustaende.length < 60; i--) {
        z = L.rueckwaerts(z, s.verlauf[i], kap());
        if (!z) break;
        zustaende.push(z.roehren);
      }
      const meine = ++anfrage;
      setzeStatus('Hinweis wird gesucht …');
      let r;
      try {
        r = await worker.rufe('hinweis', { kapazitaet: kap(), zustaende });
      } catch (f) {
        if (f?.name !== 'AbortError') { console.error(f); setzeStatus('Hinweis konnte nicht berechnet werden.'); }
        return;
      }
      if (!aktiv || meine !== anfrage || !s) return;
      if (r.schritte === 0 && r.zug) {
        hinweisZug = r.zug;
        fokus = r.zug[0];
        zeichne();
        const rest = r.optimal ? `noch ${zuegeText(r.laenge)} bis zur Lösung` : `Lösung in höchstens ${zuegeText(r.laenge)}`;
        setzeStatus(`Hinweis: Röhre ${r.zug[0] + 1} in Röhre ${r.zug[1] + 1} gießen – ${rest}.`);
      } else if (r.schritte > 0) {
        const n = r.schritte;
        setzeStatus(`Hier geht es nicht weiter – ${n}× Rückgängig führt wieder zu einer Lösung.`);
        ctx.meldung(`Sackgasse: ${n} ${n === 1 ? 'Schritt' : 'Schritte'} zurück`);
      } else {
        setzeStatus('Keine Lösung von hier gefunden – „Von vorn“ oder mehrmals Rückgängig hilft.');
      }
    }

    // ---------- Zeiger: Klick/Tippen und Ziehen ----------
    const roehreVon = (ziel) => {
      const el = ziel?.closest?.('.fs-roehre');
      return el && feld.contains(el) ? Number(el.dataset.i) : -1;
    };

    ctx.eingabe.zeiger(feld, {
      signal,
      tippen: (e) => {
        const i = roehreVon(e.startZiel);
        if (i < 0) { if (auswahl >= 0) waehle(-1); return; }
        aktiviere(i);
      },
      rechts: () => { if (s) waehle(-1); },
    });

    ctx.eingabe.ziehen(feld, {
      signal,
      schwelle: 8,
      start(e) {
        if (!s || s.gewonnen) return false;
        const i = roehreVon(e.target);
        if (i < 0 || !s.roehren[i].length) return false;
        fokus = i;
        auswahl = i;
        hinweisZug = null;
        ueber = -1;
        zeichne();
        return { quelle: i };
      },
      bewege(e) {
        const j = roehreVon(document.elementFromPoint(e.clientX, e.clientY));
        if (j !== ueber) { ueber = j; zeichne(); }
      },
      ablegen(e, d) {
        const j = ueber;
        ueber = -1;
        if (j >= 0 && j !== d.quelle) {
          if (!giesse(d.quelle, j)) { auswahl = -1; zeigeFehl(j); setzeStatus(`Von Röhre ${d.quelle + 1} passt nichts in Röhre ${j + 1}.`); }
        } else waehle(-1);
      },
      abbrechen() { ueber = -1; waehle(-1); },
    });

    // ---------- Level laden / erzeugen ----------
    const levelZaehler = () => ctx.speicher.lies('level', {}) || {};

    function starteMit(stufe, nr, level) {
      const { loesung, ...ohneLoesung } = level;   // Lösungsweg nicht im Spielstand
      s = {
        stufe, nr, level: ohneLoesung, roehren: level.roehren.map((r) => r.slice()),
        zuege: 0, hinweise: 0, zusatz: false, verlauf: [], wieder: [], gewonnen: false,
      };
      wartet = null;
      auswahl = -1; hinweisZug = null; fokus = 0; roehrenEls = [];
      feld.replaceChildren();
      zeichne();
      standardStatus();
      vorratFuellen(stufe, nr + 1);
    }

    function levelPasst(level, stufe, nr) {
      return level && level.stufe === stufe && level.nr === nr && L.standGueltig({
        stufe, nr, level, roehren: level.roehren, zuege: 0, hinweise: 0, zusatz: false, verlauf: [], wieder: [],
      });
    }

    async function ladeLevel(stufe, nr) {
      s = null;
      wartet = { stufe, nr };
      roehrenEls = [];
      feld.replaceChildren();
      stufeEl.textContent = `${L.STUFEN[stufe].name} · Level ${nr}`;
      zaehlerEl.textContent = '';
      setzeStatus('');
      const vorrat = ctx.speicher.lies('vorrat', {}) || {};
      if (levelPasst(vorrat[stufe], stufe, nr)) { starteMit(stufe, nr, vorrat[stufe]); return; }
      const meine = ++anfrage;
      try {
        const level = await worker.rufe('erzeuge', { stufe, nr });
        if (!aktiv || meine !== anfrage) return;
        starteMit(stufe, nr, level);
      } catch (f) {
        if (f?.name !== 'AbortError') { console.error(f); setzeStatus('Das Level konnte nicht erzeugt werden.'); }
      }
    }

    /** Nächstes Level schon im Hintergrund erzeugen, damit „Neues Spiel“ sofort geht */
    async function vorratFuellen(stufe, nr) {
      const vorrat = ctx.speicher.lies('vorrat', {}) || {};
      if (vorrat[stufe]?.nr === nr) return;
      try {
        const level = await worker.rufe('erzeuge', { stufe, nr });
        if (!aktiv) return;
        const v = ctx.speicher.lies('vorrat', {}) || {};
        v[stufe] = level;
        ctx.speicher.schreibe('vorrat', v);
      } catch { /* egal – wird dann bei Bedarf erzeugt */ }
    }

    function naechstesLevel(stufe) {
      const id = L.STUFEN[stufe] ? stufe : 'leicht';
      const z = levelZaehler();
      const nr = (Number.isInteger(z[id]) && z[id] > 0 ? z[id] : 0) + 1;
      z[id] = nr;
      ctx.speicher.schreibe('level', z);
      return ladeLevel(id, nr);
    }

    // Start: gespeicherten Stand prüfen, sonst nächstes Level der Stufe
    let geladen = false;
    try {
      if (gespeichert && L.standGueltig(gespeichert)) {
        if (gespeichert.level === null) { ladeLevel(gespeichert.stufe, gespeichert.nr); geladen = true; }
        else if (!gespeichert.gewonnen) {
          const g = gespeichert;
          s = {
            stufe: g.stufe, nr: g.nr, level: g.level, roehren: g.roehren, zuege: g.zuege, hinweise: g.hinweise,
            zusatz: g.zusatz, verlauf: g.verlauf, wieder: g.wieder, gewonnen: false,
          };
          zeichne();
          standardStatus();
          vorratFuellen(s.stufe, s.nr + 1);
          geladen = true;
        }
      }
    } catch (f) { console.error(f); s = null; }
    if (!geladen) naechstesLevel(ctx.variante);

    const abmelden = ctx.farben.beobachte(() => zeichne());

    // ---------- Schnittstelle ----------
    const instanz = {
      getStand() {
        if (s) {
          return {
            stufe: s.stufe, nr: s.nr, level: s.level, roehren: s.roehren, zuege: s.zuege, hinweise: s.hinweise,
            zusatz: s.zusatz, verlauf: s.verlauf, wieder: s.wieder, gewonnen: s.gewonnen,
          };
        }
        return wartet ? { stufe: wartet.stufe, nr: wartet.nr, level: null } : null;
      },
      zusammenfassung() {
        const t = s ?? wartet;
        return t ? `${L.STUFEN[t.stufe].name} · Level ${t.nr}` : '';
      },
      kannRueckgaengig: () => Boolean(s && !s.gewonnen && s.verlauf.length),
      kannWiederholen: () => Boolean(s && !s.gewonnen && s.wieder.length),
      rueckgaengig() {
        if (!s || s.gewonnen || !s.verlauf.length) return;
        const e = s.verlauf[s.verlauf.length - 1];
        const z = L.rueckwaerts({ roehren: s.roehren, zuege: s.zuege }, e, kap());
        if (!z) return;
        s.verlauf.pop();
        s.wieder.push(e);
        s.roehren = z.roehren; s.zuege = z.zuege;
        auswahl = -1; hinweisZug = null; anfrage++;
        zeichne();
        standardStatus();
      },
      wiederholen() {
        if (!s || s.gewonnen || !s.wieder.length) return;
        const e = s.wieder[s.wieder.length - 1];
        const z = L.vorwaerts({ roehren: s.roehren, zuege: s.zuege }, e, s.level.roehren, kap());
        if (!z) { s.wieder = []; return; }
        s.wieder.pop();
        s.verlauf.push(e);
        s.roehren = z.roehren; s.zuege = z.zuege;
        auswahl = -1; hinweisZug = null; anfrage++;
        zeichne();
        standardStatus();
        if (L.geloest(s.roehren, kap())) gewinne();
      },
      hinweis: () => { hinweisHolen(); },
      neustart() {
        if (!s || s.gewonnen || !s.verlauf.length) return;
        merke(['n', s.roehren.map((r) => r.slice()), s.zuege], { roehren: startRoehren(), zuege: 0 });
        auswahl = -1; hinweisZug = null; anfrage++;
        zeichne();
        setzeStatus('Level von vorn – Rückgängig holt den alten Stand zurück.');
        ctx.meldeAenderung();
      },
      neu(variante) {
        return naechstesLevel(variante ?? s?.stufe ?? wartet?.stufe);
      },
      onTaste(e) {
        if (!s || e.ctrlKey || e.metaKey || e.altKey) return false;
        const k = e.key;
        const n = s.roehren.length;
        const t = TASTEN.indexOf(k.length === 1 ? k.toUpperCase() : k);
        if (t >= 0 && t < n) { aktiviere(t); fokusSetzen(t); return true; }
        if (k === '+') { zusatzRoehre(); return true; }
        if (k === 'Escape') {
          if (auswahl >= 0 || hinweisZug) { hinweisZug = null; waehle(-1); return true; }
          return false;
        }
        const sp = spalten();
        const schritt = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -sp, ArrowDown: sp }[k];
        if (schritt !== undefined) {
          const imFeld = feld.contains(document.activeElement);
          let ziel = imFeld ? fokus + schritt : fokus;
          if (ziel < 0 || ziel >= n) ziel = k === 'ArrowLeft' || k === 'ArrowRight' ? (ziel + n) % n : fokus;
          fokusSetzen(ziel);
          return true;
        }
        if (k === 'Enter' || k === ' ') {
          if (!feld.contains(document.activeElement)) return false;
          aktiviere(fokus);
          return true;
        }
        return false;
      },
      zerstoere() {
        aktiv = false;
        clearTimeout(fehlTimer);
        abmelden();
        worker.beende();
        container.replaceChildren();
      },
    };

    function fokusSetzen(i) {
      fokus = i;
      roehrenEls.forEach((el, j) => { el.tabIndex = j === i ? 0 : -1; });
      roehrenEls[i]?.focus({ preventScroll: true });
    }

    return instanz;
  },
};
