// Sudoku: Ziffern 1–9 in jede Zeile, Spalte und jeden 3×3-Block.
// Bedienung: Zelle antippen/anklicken, dann Ziffer (Leiste oder Tastatur 1–9).
// Tastatur: Pfeile bewegen · 1–9 eintragen · Umschalt/Alt+Ziffer = Notiz · Leertaste oder . = Notizmodus
//           · Entf/Rücktaste/0 = leeren · Z/Y/H/N übernimmt die Shell.
import { h, ladeStil } from '../../kern/dom.js';
import { erstelleVerlauf, ladeVerlauf } from '../../kern/rueckgaengig.js';
import { erstelleWorker } from '../../kern/worker-helfer.js';
import * as L from './logik.js';

const VORRAT_AKTUELL = 2;      // Rätsel im Vorrat für die gerade gespielte Stufe
const VORRAT_ANDERE = 1;       // … und für die übrigen Stufen
const VORRAT_PAUSE_MS = 1500;
const neuerVerlauf = (daten) => (daten ? ladeVerlauf(daten, { max: Infinity }) : erstelleVerlauf({ max: Infinity }));

export default {
  id: 'sudoku',
  name: 'Sudoku',
  beschreibung: 'Ziffern 1–9 in jede Zeile, Spalte und jeden Block.',
  varianten: L.STUFEN.map((id) => ({ id, name: L.STUFEN_NAME[id] })),
  standVersion: 1,

  erstelle(container, ctx, gespeichert) {
    ladeStil('spiele/sudoku/stil.css');
    const { signal } = ctx;
    const worker = ctx.worker('spiele/sudoku/generator.worker.js');
    let hintergrund = null;            // eigener Worker für den Vorrat (ohne „wird vorbereitet“-Anzeige)
    const optionen = ctx.einstellungen.spiel;

    let s = null;                      // Spielzustand (siehe ausRaetsel)
    let vorgabe = [], loesung = [];
    let verlauf = neuerVerlauf();
    let hinweis = null;                // { art, i, d, text, zellen }
    let aktiv = true;
    let erzeugung = 0;
    let vorratTimer = 0;
    let vorratLaeuft = false;
    let autoNotizen = optionen.wert('autoNotizen', false) === true;
    // Eingabeart: 'ziffer' = erst Ziffer wählen, dann Felder antippen · 'feld' = erst Feld, dann Ziffer
    let eingabeArt = optionen.wert('eingabeArt', 'ziffer') === 'feld' ? 'feld' : 'ziffer';
    let aktiveZiffer = 0;              // gewählte Ziffer im Modus „Ziffer zuerst“ (0 = keine)

    // ---------- DOM ----------
    const zellen = [], wertEl = [], notizEl = [];
    const reihen = [];
    for (let r = 0; r < 9; r++) {
      const reihe = h('div', { class: 'sd-reihe', role: 'row' });
      for (let c = 0; c < 9; c++) {
        const i = r * 9 + c;
        const noten = Array.from({ length: 9 }, () => h('span'));
        const wert = h('span', { class: 'sd-wert', 'aria-hidden': 'true' });
        const el = h('button', {
          type: 'button', role: 'gridcell', tabindex: '-1', dataset: { i },
          class: `sd-zelle${c % 3 === 2 && c < 8 ? ' sd-rechts' : ''}${r % 3 === 2 && r < 8 ? ' sd-unten' : ''}${c === 8 ? ' sd-letzte-spalte' : ''}${r === 8 ? ' sd-letzte-zeile' : ''}`,
        }, wert, h('span', { class: 'sd-notizen', 'aria-hidden': 'true' }, noten));
        zellen.push(el); wertEl.push(wert); notizEl.push(noten);
        reihe.append(el);
      }
      reihen.push(reihe);
    }
    const feld = h('div', { class: 'sd-feld', role: 'grid', 'aria-label': 'Sudoku-Feld, 9 mal 9 Zellen' }, reihen);

    const ziffernKnoepfe = Array.from({ length: 9 }, (_, k) => h('button', {
      type: 'button', class: 'sd-ziffer', dataset: { d: k + 1 },
      on: { click: () => (eingabeArt === 'ziffer' ? waehleZiffer(k + 1) : eingabe(k + 1)) },
    }, h('span', { class: 'sd-ziffer-zahl', text: k + 1 }), h('span', { class: 'sd-ziffer-rest', 'aria-hidden': 'true' })));
    const artKnopf = h('button', {
      type: 'button', class: 'knopf klein sd-schalter sd-art',
      title: 'Eingabe umschalten: erst Ziffer wählen und dann Felder antippen – oder erst Feld, dann Ziffer',
      on: { click: () => schalteEingabeArt() },
    });
    const loeschKnopf = h('button', {
      type: 'button', class: 'sd-ziffer sd-loeschen', title: 'Zelle leeren (Entf)', 'aria-label': 'Zelle leeren',
      on: { click: () => loesche() },
    }, 'Leeren');
    const notizKnopf = h('button', {
      type: 'button', class: 'knopf klein sd-schalter', title: 'Notizmodus an/aus (Leertaste oder Punkt) – Umschalt+Ziffer setzt immer eine Notiz',
      on: { click: () => schalteNotizmodus() },
    }, 'Notizen');
    const autoKnopf = h('button', {
      type: 'button', class: 'knopf klein sd-schalter', title: 'Alle möglichen Ziffern automatisch als Notizen eintragen',
      on: { click: () => schalteAutoNotizen() },
    }, 'Auto-Notizen');
    const stufeEl = h('span', { class: 'sd-stufe-name' });
    const offenEl = h('span', { class: 'sd-offen' });
    const info = h('p', { class: 'sd-info', 'aria-live': 'polite' });

    const wurzel = h('div', { class: 'sd' },
      h('div', { class: 'sd-feld-rahmen' }, feld),
      h('div', { class: 'sd-seite' },
        h('div', { class: 'sd-kopf' }, stufeEl, offenEl),
        h('div', { class: 'sd-ziffern', role: 'group', 'aria-label': 'Ziffern' }, ziffernKnoepfe, loeschKnopf),
        h('div', { class: 'sd-aktionen' }, artKnopf, notizKnopf, autoKnopf),
        info,
      ),
    );
    container.append(wurzel);

    // ---------- Eingabe Maus/Touch ----------
    ctx.eingabe.zeiger(feld, {
      signal,
      tippen: (e) => {
        const z = e.startZiel?.closest?.('.sd-zelle');
        if (!z || !feld.contains(z)) return;
        if (eingabeArt === 'ziffer') tippeImZiffermodus(Number(z.dataset.i));
        else waehle(Number(z.dataset.i), true);
      },
      // Rechtsklick bzw. langes Drücken: im Modus „Ziffer zuerst“ Notiz der gewählten Ziffer,
      // sonst Zelle wählen und Notizmodus umschalten
      rechts: (e) => {
        const z = e.target?.closest?.('.sd-zelle');
        if (z && feld.contains(z)) waehle(Number(z.dataset.i), true);
        if (eingabeArt === 'ziffer' && aktiveZiffer) eingabe(aktiveZiffer, true);
        else schalteNotizmodus();
      },
    });
    feld.addEventListener('focusin', (e) => {
      const z = e.target.closest?.('.sd-zelle');
      if (z && s && Number(z.dataset.i) !== s.auswahl) waehle(Number(z.dataset.i), false);
    }, { signal });

    // ---------- Darstellung ----------
    const alleWerte = () => vorgabe.map((v, i) => v || s.werte[i]);

    function zeichne() {
      wurzel.classList.toggle('sd-wartet', !s);
      if (!s) {
        stufeEl.textContent = '';
        offenEl.textContent = '';
        return;
      }
      const alle = alleWerte();
      const sel = s.auswahl;
      const zifferModus = eingabeArt === 'ziffer';
      // Hervorgehoben wird im Modus „Ziffer zuerst“ die gewählte Ziffer, sonst die Ziffer der gewählten Zelle
      const selWert = zifferModus && aktiveZiffer ? aktiveZiffer : alle[sel];
      const rS = L.zeileVon(sel), cS = L.spalteVon(sel), bS = L.blockVon(sel);
      const konflikt = new Set(ctx.einstellungen.wert('fehlerMarkieren') ? L.konflikte(alle) : []);
      const bezug = new Set(hinweis?.zellen ?? []);
      const zaehler = new Array(10).fill(0);
      for (const w of alle) zaehler[w]++;

      for (let i = 0; i < 81; i++) {
        const el = zellen[i];
        const w = alle[i];
        const fest = Boolean(vorgabe[i]);
        el.classList.toggle('sd-fest', fest);
        // Im Modus „Ziffer zuerst“ zählt die gewählte Ziffer, nicht die Zelle (Tastatur-Cursor zeigt der Fokusrahmen)
        el.classList.toggle('sd-gewaehlt', !zifferModus && i === sel);
        el.classList.toggle('sd-bereich', !zifferModus && i !== sel && (L.zeileVon(i) === rS || L.spalteVon(i) === cS || L.blockVon(i) === bS));
        el.classList.toggle('sd-gleich', (zifferModus || i !== sel) && Boolean(selWert) && w === selWert);
        el.classList.toggle('sd-konflikt', konflikt.has(i));
        el.classList.toggle('sd-hinweis', hinweis?.i === i);
        el.classList.toggle('sd-bezug', bezug.has(i) && hinweis?.i !== i);
        el.tabIndex = i === sel ? 0 : -1;
        wertEl[i].textContent = w ? String(w) : '';
        const noten = w ? 0 : s.notizen[i];
        for (let d = 1; d <= 9; d++) {
          const n = notizEl[i][d - 1];
          const an = Boolean(noten & L.bit(d));
          n.textContent = an ? String(d) : '';
          n.className = an && d === selWert ? 'sd-treffer' : '';
        }
        let text = `Zeile ${L.zeileVon(i) + 1}, Spalte ${L.spalteVon(i) + 1}, `;
        if (w) text += fest ? `vorgegeben ${w}` : `${w}`;
        else text += noten ? `leer, Notizen ${L.ziffernAus(noten).join(' ')}` : 'leer';
        if (konflikt.has(i)) text += ', Konflikt';
        if (hinweis?.i === i) text += ', Hinweis';
        el.setAttribute('aria-label', text);
      }

      ziffernKnoepfe.forEach((k, idx) => {
        const d = idx + 1;
        const rest = 9 - zaehler[d];
        const fertig = rest <= 0;
        k.classList.toggle('sd-erledigt', fertig);
        k.classList.toggle('sd-aktuell', selWert === d);
        k.classList.toggle('sd-aktiv', zifferModus && aktiveZiffer === d);
        k.lastChild.textContent = fertig ? '✓' : String(rest);
        k.setAttribute('aria-label', `${s.notizmodus ? 'Notiz' : 'Ziffer'} ${d}, ${fertig ? 'alle gesetzt' : `noch ${rest}`}${zifferModus && aktiveZiffer === d ? ', gewählt' : ''}`);
        if (zifferModus) k.setAttribute('aria-pressed', String(aktiveZiffer === d)); else k.removeAttribute('aria-pressed');
      });
      wurzel.classList.toggle('sd-ziffermodus', zifferModus);
      artKnopf.textContent = zifferModus ? 'Eingabe: Ziffer zuerst' : 'Eingabe: Feld zuerst';
      artKnopf.setAttribute('aria-pressed', String(zifferModus));
      wurzel.classList.toggle('sd-notizmodus', s.notizmodus);
      notizKnopf.setAttribute('aria-pressed', String(s.notizmodus));
      notizKnopf.textContent = s.notizmodus ? 'Notizen: an' : 'Notizen: aus';
      autoKnopf.setAttribute('aria-pressed', String(autoNotizen));
      stufeEl.textContent = L.STUFEN_NAME[s.stufe];
      const offen = alle.filter((w) => !w).length;
      offenEl.textContent = offen ? `noch ${offen} ${offen === 1 ? 'Feld' : 'Felder'}` : 'alles ausgefüllt';
      info.textContent = hinweis?.text ?? '';
    }

    function fokussiere() {
      if (s) zellen[s.auswahl].focus({ preventScroll: true });
    }

    function waehle(i, fokus) {
      if (!s) return;
      s.auswahl = i;
      zeichne();
      if (fokus) fokussiere();
    }

    // ---------- Züge (Liste von Deltas [i, alterWert, neuerWert, alteNotiz, neueNotiz]) ----------
    function neuerZug() {
      const deltas = [];
      return {
        deltas,
        aendere(k, w, n) {
          const aw = s.werte[k], an = s.notizen[k];
          if (aw === w && an === n) return;
          deltas.push([k, aw, w, an, n]);
          s.werte[k] = w;
          s.notizen[k] = n;
        },
      };
    }

    function kandidatenVon(i) {
      return L.kandidaten(alleWerte())[i];
    }

    /** Ziffer d in Zelle i setzen und Notizen in Zeile/Spalte/Block aufräumen */
    function setzeWert(zug, i, d) {
      zug.aendere(i, d, 0);
      const b = L.bit(d);
      for (const p of L.NACHBARN[i]) if (!vorgabe[p] && (s.notizen[p] & b)) zug.aendere(p, s.werte[p], s.notizen[p] & ~b);
    }

    function leereWert(zug, i) {
      zug.aendere(i, 0, s.notizen[i]);
      if (autoNotizen) zug.aendere(i, 0, kandidatenVon(i));
    }

    function abschliessen(zug) {
      if (!zug.deltas.length) return false;
      verlauf.merke(zug.deltas);
      hinweis = null;
      zeichne();
      ctx.meldeAenderung();
      pruefeGewinn();
      return true;
    }

    function eingabe(d, alsNotiz = false) {
      if (!s || s.geloest) return;
      const i = s.auswahl;
      if (vorgabe[i]) { ctx.meldung('Diese Ziffer ist vorgegeben.'); return; }
      const zug = neuerZug();
      if (alsNotiz || s.notizmodus) {
        if (s.werte[i]) return;
        zug.aendere(i, 0, s.notizen[i] ^ L.bit(d));
      } else if (s.werte[i] === d) {
        leereWert(zug, i);
      } else {
        setzeWert(zug, i, d);
      }
      abschliessen(zug);
    }

    function loesche() {
      if (!s || s.geloest) return;
      const i = s.auswahl;
      if (vorgabe[i]) return;
      const zug = neuerZug();
      if (s.werte[i]) leereWert(zug, i);
      else zug.aendere(i, 0, 0);
      abschliessen(zug);
    }

    // ---------- Modus „Ziffer zuerst“ ----------
    function waehleZiffer(d) {
      if (!s || s.geloest) return;
      aktiveZiffer = aktiveZiffer === d ? 0 : d;
      zeichne();
    }

    /** Zelle angetippt, während eine Ziffer gewählt ist: eintragen bzw. (gleiche Ziffer) wieder entfernen */
    function tippeImZiffermodus(i) {
      if (!s || s.geloest) return;
      s.auswahl = i;
      const w = vorgabe[i] || s.werte[i];
      // Vorgegebene Zelle oder (ohne gewählte Ziffer) gefüllte Zelle: deren Ziffer wird die gewählte
      if (vorgabe[i] || (!aktiveZiffer && w)) {
        aktiveZiffer = w;
        zeichne();
        return;
      }
      if (!aktiveZiffer) {
        zeichne();
        ctx.meldung('Erst unten eine Ziffer wählen, dann die Felder antippen.');
        return;
      }
      eingabe(aktiveZiffer);
    }

    function schalteEingabeArt() {
      eingabeArt = eingabeArt === 'ziffer' ? 'feld' : 'ziffer';
      optionen.setze('eingabeArt', eingabeArt);
      if (eingabeArt === 'ziffer' && !aktiveZiffer && s) aktiveZiffer = alleWerte()[s.auswahl] || 0;
      zeichne();
      ctx.meldung(eingabeArt === 'ziffer'
        ? 'Erst Ziffer wählen, dann alle passenden Felder antippen.'
        : 'Erst Feld antippen, dann Ziffer wählen.');
    }

    function schalteNotizmodus() {
      if (!s) return;
      s.notizmodus = !s.notizmodus;
      zeichne();
    }

    function fuelleNotizen(zug) {
      const k = L.kandidaten(alleWerte());
      for (let i = 0; i < 81; i++) if (!vorgabe[i] && !s.werte[i]) zug.aendere(i, 0, k[i]);
    }

    function schalteAutoNotizen() {
      autoNotizen = !autoNotizen;
      optionen.setze('autoNotizen', autoNotizen);
      if (!s) return;
      if (autoNotizen && !s.geloest) {
        const zug = neuerZug();
        fuelleNotizen(zug);
        if (abschliessen(zug)) ctx.meldung('Alle möglichen Ziffern sind als Notizen eingetragen.');
        else zeichne();
      } else {
        zeichne();
      }
    }

    function wendeAn(deltas, rueckwaerts) {
      const liste = rueckwaerts ? deltas.slice().reverse() : deltas;
      for (const [k, aw, nw, an, nn] of liste) {
        s.werte[k] = rueckwaerts ? aw : nw;
        s.notizen[k] = rueckwaerts ? an : nn;
      }
    }

    function pruefeGewinn() {
      const alle = alleWerte();
      if (!alle.every((w, i) => w === loesung[i])) return;
      s.geloest = true;
      hinweis = null;
      zeichne();
      const n = s.hinweise;
      ctx.meldeGewonnen(`${L.STUFEN_NAME[s.stufe]}${n ? ` · ${n} ${n === 1 ? 'Hinweis' : 'Hinweise'}` : ' · ohne Hinweis'}`);
    }

    // ---------- Rätsel starten / erzeugen ----------
    function ausRaetsel(r) {
      const st = {
        version: 1, stufe: r.stufe, seed: String(r.seed), vorgabe: r.vorgabe, loesung: r.loesung,
        werte: new Array(81).fill(0), notizen: new Array(81).fill(0),
        auswahl: Math.max(0, Array.from(r.vorgabe).findIndex((c) => c === '0')),
        notizmodus: false, hinweise: 0,
      };
      return st;
    }

    function starte(st, vl) {
      s = { ...st, geloest: false };
      vorgabe = L.ausText(st.vorgabe);
      loesung = L.ausText(st.loesung);
      verlauf = vl;
      hinweis = null;
      zeichne();
    }

    function startNotizen() {
      if (!autoNotizen) return;
      const zug = neuerZug();
      fuelleNotizen(zug);       // Ausgangszustand, kein Rückgängig-Eintrag
    }

    const leseVorrat = () => {
      const v = ctx.speicher.lies('vorrat', {});
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    };

    function nimmAusVorrat(stufe) {
      const v = leseVorrat();
      const liste = Array.isArray(v[stufe]) ? v[stufe].slice() : [];
      let gefunden = null;
      while (liste.length && !gefunden) {
        const r = liste.shift();
        if (r?.stufe === stufe && L.pruefeRaetsel(r)) gefunden = r;
      }
      v[stufe] = liste;
      ctx.speicher.schreibe('vorrat', v);
      return gefunden;
    }

    async function fuelleVorrat() {
      if (vorratLaeuft || !aktiv) return;
      vorratLaeuft = true;
      try {
        hintergrund ??= erstelleWorker(new URL('spiele/sudoku/generator.worker.js', document.baseURI), { signal });
        const aktuell = s?.stufe ?? ctx.variante;
        for (const stufe of [...new Set([aktuell, ...L.STUFEN])]) {
          if (!L.STUFEN.includes(stufe)) continue;
          const soll = stufe === aktuell ? VORRAT_AKTUELL : VORRAT_ANDERE;
          while (aktiv && (leseVorrat()[stufe]?.length ?? 0) < soll) {
            const r = await hintergrund.rufe('erzeuge', { stufe, seed: ctx.neuerSeed() });
            if (!aktiv) return;
            const v = leseVorrat();
            v[stufe] = [...(Array.isArray(v[stufe]) ? v[stufe] : []), r].slice(-VORRAT_AKTUELL);
            ctx.speicher.schreibe('vorrat', v);
          }
        }
      } catch (f) {
        if (f?.name !== 'AbortError') console.error(f);
      } finally {
        vorratLaeuft = false;
      }
    }

    function fuelleVorratSpaeter() {
      clearTimeout(vorratTimer);
      vorratTimer = setTimeout(fuelleVorrat, VORRAT_PAUSE_MS);
    }

    async function neuesRaetsel(variante) {
      const nr = ++erzeugung;
      const stufe = L.STUFEN.includes(variante) ? variante : L.STUFEN[0];
      s = null;
      hinweis = null;
      verlauf = neuerVerlauf();
      zeichne();
      info.textContent = '';
      let r = nimmAusVorrat(stufe);
      if (!r) {
        try {
          r = await worker.rufe('erzeuge', { stufe, seed: ctx.neuerSeed() });
        } catch (f) {
          if (f?.name !== 'AbortError' && aktiv) { console.error(f); info.textContent = 'Das Rätsel konnte nicht erzeugt werden.'; }
          return;
        }
      }
      if (!aktiv || nr !== erzeugung) return;
      starte(ausRaetsel(r), neuerVerlauf());
      startNotizen();
      zeichne();
      fuelleVorratSpaeter();
    }

    // ---------- Start ----------
    const geladen = gespeichert ? L.pruefeStand(gespeichert) : null;
    if (geladen) {
      starte(geladen, neuerVerlauf(geladen.verlauf));
      fuelleVorratSpaeter();
    } else {
      if (gespeichert) ctx.meldung('Der gespeicherte Stand war fehlerhaft – es beginnt ein neues Rätsel.');
      neuesRaetsel(ctx.variante);
    }

    // ---------- Schnittstelle ----------
    return {
      getStand: () => (s ? {
        version: 1, stufe: s.stufe, seed: s.seed, vorgabe: s.vorgabe, loesung: s.loesung,
        werte: s.werte.join(''), notizen: s.notizen.slice(), auswahl: s.auswahl,
        notizmodus: s.notizmodus, hinweise: s.hinweise, verlauf: verlauf.toJSON(),
      } : null),
      zusammenfassung() {
        if (!s) return '';
        const offen = alleWerte().filter((w) => !w).length;
        return `${L.STUFEN_NAME[s.stufe]} · noch ${offen} ${offen === 1 ? 'Feld' : 'Felder'}`;
      },
      kannRueckgaengig: () => Boolean(s) && verlauf.kannZurueck(),
      kannWiederholen: () => Boolean(s) && verlauf.kannVor(),
      rueckgaengig() {
        if (!s) return;
        const zug = verlauf.zurueck();
        if (!zug) return;
        wendeAn(zug, true);
        hinweis = null;
        zeichne();
      },
      wiederholen() {
        if (!s) return;
        const zug = verlauf.vor();
        if (!zug) return;
        wendeAn(zug, false);
        hinweis = null;
        zeichne();
        pruefeGewinn();
      },
      hinweis() {
        if (!s || s.geloest) return;
        // Zweiter Druck auf denselben Hinweis: Ziffer eintragen
        if (hinweis) {
          const { i, d } = hinweis;
          s.auswahl = i;
          const zug = neuerZug();
          setzeWert(zug, i, d);
          abschliessen(zug);
          fokussiere();
          return;
        }
        const hw = L.naechsterHinweis(vorgabe, loesung, s.werte);
        if (!hw) return;
        s.hinweise++;
        hinweis = hw;
        s.auswahl = hw.i;
        zeichne();
        fokussiere();
        ctx.meldeAenderung();
      },
      neustart() {
        if (!s) return;
        s.werte.fill(0);
        s.notizen.fill(0);
        s.geloest = false;
        s.notizmodus = false;
        verlauf.leeren();
        hinweis = null;
        startNotizen();
        zeichne();
      },
      neu: (variante) => neuesRaetsel(variante),
      onTaste(e) {
        if (!s || s.geloest || e.ctrlKey || e.metaKey) return false;
        const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code || '');
        const d = m ? Number(m[1]) : /^[0-9]$/.test(e.key) ? Number(e.key) : -1;
        if (d >= 1) {
          // Tastatur trägt immer direkt in die Cursor-Zelle ein; im Ziffermodus wird die Ziffer zugleich gewählt
          if (eingabeArt === 'ziffer' && !(e.shiftKey || e.altKey)) aktiveZiffer = d;
          eingabe(d, e.shiftKey || e.altKey);
          zeichne();
          return true;
        }
        // Enter: gewählte Ziffer in die Cursor-Zelle (Modus „Ziffer zuerst“)
        if (e.key === 'Enter' && eingabeArt === 'ziffer' && aktiveZiffer && feld.contains(e.target instanceof Element ? e.target : null)) {
          tippeImZiffermodus(s.auswahl);
          return true;
        }
        if (d === 0 || e.key === 'Delete' || e.key === 'Backspace') { loesche(); return true; }
        if (e.altKey) return false;
        const fremderKnopf = e.target instanceof Element && e.target.closest('button, a') && !feld.contains(e.target);
        if (e.key === ' ' || e.key === '.' || e.key === ',' || e.code === 'NumpadDecimal') {
          if (fremderKnopf && e.key === ' ') return false;   // Leertaste bedient den Knopf mit Fokus
          schalteNotizmodus();
          return true;
        }
        const schritt = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
        if (schritt) {
          const r = (L.zeileVon(s.auswahl) + schritt[0] + 9) % 9;
          const c = (L.spalteVon(s.auswahl) + schritt[1] + 9) % 9;
          waehle(r * 9 + c, true);
          return true;
        }
        return false;
      },
      zerstoere() {
        aktiv = false;
        clearTimeout(vorratTimer);
        worker.beende();
        hintergrund?.beende();
        container.replaceChildren();
      },
    };
  },
};
