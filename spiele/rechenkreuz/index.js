// Rechenkreuz: Rechenaufgaben kreuz und quer – jede Zahl muss in beide Richtungen passen.
// Bedienung: Kärtchen antippen → Feld antippen (oder umgekehrt) oder Kärtchen aufs Feld ziehen ·
// Tastatur: Pfeile bewegen den Cursor, Ziffern (+ Enter) setzen ein Kärtchen, Entf/Rücktaste entfernt.
import { h, ladeStil } from '../../kern/dom.js';
import { erstelleWorker } from '../../kern/worker-helfer.js';
import * as L from './logik.js';

const SPALT = 3;            // px zwischen den Zellen
const OP_BREITE = 0.6;      // Zeichenspalten im Verhältnis zu Zahlenspalten

const zufallsLevelSeed = (ctx) => ctx.neuerSeed();

export default {
  id: 'rechenkreuz',
  name: 'Rechenkreuz',
  beschreibung: 'Rechenaufgaben kreuz und quer – jede Zahl muss in beide Richtungen passen.',
  variantenTitel: 'Schwierigkeit',
  varianten: [
    { id: 'leicht', name: 'Leicht – plus und minus, bis 20' },
    { id: 'mittel', name: 'Mittel – plus, minus, mal, bis 50' },
    { id: 'schwer', name: 'Schwer – alle Rechenarten, bis 100' },
  ],
  standVersion: 1,

  erstelle(container, ctx, gespeichert) {
    ladeStil('spiele/rechenkreuz/stil.css');

    let z = null;
    try { z = gespeichert ? L.ausSpeicher(gespeichert) : null; } catch { z = null; }
    if (z && L.gewonnen(z)) z = null;

    let worker = null;          // Vordergrund (Shell zeigt „wird vorbereitet …“)
    let hintergrund = null;     // Vorrat fürs nächste „Neu“, ohne Warteanzeige
    let erzeugung = 0;
    let zerstoert = false;

    let cursor = -1;            // Punkt mit Tastatur-Cursor
    let wahlFeld = -1;          // angetipptes leeres Feld (wartet auf ein Kärtchen)
    let wahlKarte = -1;         // angetipptes Kärtchen (wartet auf ein Feld)
    let puffer = '';            // getippte Ziffern
    let markiert = -1;          // Feld des letzten Hinweises
    let zieh = null;            // laufendes Ziehen { k, von, geist, ziel }
    let klickSperre = false;

    // ---------- DOM ----------
    const titelEl = h('span', { class: 'rk-titel' });
    const statusEl = h('span', { class: 'rk-status leise', 'aria-live': 'polite' });
    const rasterEl = h('div', { class: 'rk-raster', role: 'grid', 'aria-label': 'Rechenkreuz' });
    const ladenEl = h('p', { class: 'rk-laden leise', hidden: true, text: 'Rätsel wird vorbereitet …' });
    const vorratEl = h('div', { class: 'rk-vorrat', role: 'group', 'aria-label': 'Vorrat an Zahlenkärtchen' });
    const tippEl = h('p', { class: 'rk-tipp-text leise', text: 'Kärtchen antippen und dann ein freies Feld – oder einfach hinziehen.' });
    const wurzel = h('div', { class: 'rk' },
      h('div', { class: 'rk-info' }, titelEl, statusEl),
      h('div', { class: 'rk-raster-rahmen' }, rasterEl, ladenEl),
      vorratEl,
      tippEl,
    );
    container.append(wurzel);

    let zellen = [];            // je Punkt das Zahlen-Element (oder null)
    let zeichenZellen = [];     // [{ el, gl }]
    let gebaut = null;

    // ---------- Aufbau ----------
    function baue() {
      if (gebaut === z) return;
      gebaut = z;
      const { lb, lh, gl } = z;
      const spalten = [], zeilenT = [];
      for (let i = 0; i < 2 * lb - 1; i++) spalten.push(i % 2 ? 'var(--rk-op)' : 'var(--rk-zahl)');
      for (let i = 0; i < 2 * lh - 1; i++) zeilenT.push(i % 2 ? 'var(--rk-op)' : 'var(--rk-zahl)');
      rasterEl.style.gridTemplateColumns = spalten.join(' ');
      rasterEl.style.gridTemplateRows = zeilenT.join(' ');
      wurzel.style.setProperty('--rk-einheiten', String(lb + OP_BREITE * (lb - 1)));
      wurzel.style.setProperty('--rk-spalte-summe', `${SPALT * (2 * lb - 2)}px`);

      // Zeichen zwischen zwei Punkten: [zeichen, gleichung]
      const zwischen = new Map();
      gl.forEach((g, i) => {
        const p = L.punkte(g, lb);
        zwischen.set(`${p[0]}|${p[1]}`, [L.ZEICHEN[g[3]], i]);
        zwischen.set(`${p[1]}|${p[2]}`, ['=', i]);
      });
      const { benutzt } = L.struktur(gl, lb, lh);
      zellen = new Array(lb * lh).fill(null);
      zeichenZellen = [];
      const reihen = [];
      for (let R = 0; R < 2 * lh - 1; R++) {
        const reihe = [];
        for (let C = 0; C < 2 * lb - 1; C++) {
          let el;
          if (R % 2 === 0 && C % 2 === 0) {
            const p = (R / 2) * lb + C / 2;
            if (benutzt[p]) {
              const fest = Boolean(z.vorgabe[p]);
              el = h(fest ? 'div' : 'button', {
                class: `rk-zelle rk-zahl ${fest ? 'vorgabe' : 'feld'}`, role: 'gridcell', tabindex: '-1',
                type: fest ? null : 'button', dataset: { p },
              });
              if (fest) el.textContent = String(z.loesung[p]);
              zellen[p] = el;
            } else el = h('div', { class: 'rk-zelle rk-leer', role: 'gridcell' });
          } else if (R % 2 === 0 && C % 2 === 1) {
            const a = (R / 2) * lb + (C - 1) / 2;
            el = zeichenZelle(zwischen.get(`${a}|${a + 1}`));
          } else if (R % 2 === 1 && C % 2 === 0) {
            const a = ((R - 1) / 2) * lb + C / 2;
            el = zeichenZelle(zwischen.get(`${a}|${a + lb}`));
          } else el = h('div', { class: 'rk-zelle rk-leer', role: 'gridcell' });
          reihe.push(el);
        }
        reihen.push(h('div', { class: 'rk-reihe', role: 'row' }, reihe));
      }
      rasterEl.replaceChildren(...reihen);
      if (!benutzt[cursor]) cursor = benutzt.indexOf(true);
    }

    function zeichenZelle(eintrag) {
      if (!eintrag) return h('div', { class: 'rk-zelle rk-leer', role: 'gridcell' });
      const [text, gl] = eintrag;
      const el = h('div', { class: 'rk-zelle rk-op', role: 'gridcell', text });
      el.setAttribute('aria-label', text === '=' ? 'ist gleich' : L.zeichenName(z.gl[gl][3]));
      zeichenZellen.push({ el, gl, gleich: text === '=' });
      return el;
    }

    // ---------- Darstellung ----------
    function zeichne() {
      ladenEl.hidden = Boolean(z);
      rasterEl.hidden = !z;
      vorratEl.hidden = !z;
      tippEl.hidden = !z;
      if (!z) { titelEl.textContent = ''; statusEl.textContent = ''; return; }
      baue();
      const fehler = ctx.einstellungen.wert('fehlerMarkieren') !== false;
      const status = L.gleichungStatus(z);
      const { proPunkt } = L.struktur(z.gl, z.lb, z.lh);
      const werte = L.werteAus(z);
      const fertig = L.gewonnen(z);

      const muster = ctx.farben.musterAn();
      for (const { el, gl, gleich } of zeichenZellen) {
        const f = fehler && status[gl] === 'falsch';
        el.classList.toggle('richtig', status[gl] === 'richtig');
        el.classList.toggle('falsch', f);
        if (!gleich) continue;
        // ohne Farbe lesbar: „≠“ bei falscher Rechnung, mit Symbolen zusätzlich ein Haken
        el.textContent = f ? '≠' : '=';
        el.classList.toggle('haken', muster && status[gl] === 'richtig');
        el.setAttribute('aria-label', f ? 'ist nicht gleich' : status[gl] === 'richtig' ? 'ist gleich, stimmt' : 'ist gleich');
      }
      zellen.forEach((el, p) => {
        if (!el) return;
        const st = proPunkt[p].map((i) => status[i]);
        const richtig = st.every((s) => s === 'richtig');
        const falsch = fehler && st.includes('falsch');
        el.classList.toggle('richtig', richtig);
        el.classList.toggle('falsch', falsch && !richtig);
        el.classList.toggle('cursor', p === cursor);
        el.tabIndex = p === cursor ? 0 : -1;
        const r = Math.floor(p / z.lb) + 1, c = (p % z.lb) + 1;
        if (z.vorgabe[p]) {
          el.setAttribute('aria-label', `Zeile ${r}, Spalte ${c}: ${werte[p]}, vorgegeben`);
          return;
        }
        const tippt = p === cursor && puffer;
        el.textContent = tippt ? puffer : werte[p] ? String(werte[p]) : '';
        el.classList.toggle('gefuellt', werte[p] > 0);
        el.classList.toggle('tippt', Boolean(tippt));
        el.classList.toggle('gewaehlt', p === wahlFeld);
        el.classList.toggle('markiert', p === markiert);
        el.classList.toggle('ziel', zieh?.ziel === p);
        el.classList.toggle('waehlbar', wahlKarte >= 0);
        el.setAttribute('aria-label', `Zeile ${r}, Spalte ${c}: ${werte[p] || 'leer'}${falsch && !richtig ? ', passt nicht' : ''}${p === wahlFeld ? ', ausgewählt' : ''}`);
        el.setAttribute('aria-disabled', String(fertig));
      });

      zeichneVorrat(fertig);
      const offen = L.freieKarten(z).length;
      const ok = status.filter((s) => s === 'richtig').length;
      titelEl.textContent = `${L.STUFEN[z.stufe].name} · Level ${z.level}`;
      statusEl.textContent = `${ok} von ${status.length} Aufgaben stimmen${offen ? ` · ${offen} Kärtchen übrig` : ''}`;
    }

    function zeichneVorrat(fertig) {
      const frei = L.freieKarten(z).sort((a, b) => z.karten[a] - z.karten[b] || a - b);
      const fokusK = document.activeElement?.closest?.('.rk-karte')?.dataset.k;
      if (!frei.includes(wahlKarte)) wahlKarte = -1;
      const knoepfe = frei.map((k) => h('button', {
        type: 'button',
        class: `rk-karte${k === wahlKarte ? ' gewaehlt' : ''}${zieh?.k === k && zieh.von < 0 ? ' gezogen' : ''}`,
        dataset: { k },
        'aria-pressed': String(k === wahlKarte),
        'aria-label': `Kärtchen ${z.karten[k]}${k === wahlKarte ? ', ausgewählt' : ''}`,
        disabled: fertig,
        text: String(z.karten[k]),
      }));
      vorratEl.replaceChildren(...(knoepfe.length ? knoepfe : [h('span', { class: 'rk-vorrat-leer leise', text: 'Alle Kärtchen liegen im Raster.' })]));
      if (fokusK !== undefined) {
        const ziel = knoepfe.find((b) => b.dataset.k === fokusK) ?? knoepfe[0];
        if (ziel) ziel.focus({ preventScroll: true });
        else zellen[cursor]?.focus({ preventScroll: true });
      }
    }

    // ---------- Züge ----------
    function ziehe(aend, { tipp = -1 } = {}) {
      if (!aend || !z || L.gewonnen(z)) return false;
      L.fuehreAus(z, aend);
      markiert = tipp;
      puffer = '';
      nachZug();
      return true;
    }

    function nachZug() {
      zeichne();
      ctx.meldeAenderung();
      if (L.gewonnen(z)) {
        wahlFeld = -1; wahlKarte = -1; markiert = -1;
        zeichne();
        merkeGeloest();
        ctx.meldeGewonnen(`${L.STUFEN[z.stufe].name} · Level ${z.level}`);
      }
    }

    function merkeGeloest() {
      const g = ctx.speicher.lies('geloest', {});
      const daten = g && typeof g === 'object' && !Array.isArray(g) ? { ...g } : {};
      const bisher = Number.isInteger(daten[z.stufe]) ? daten[z.stufe] : 0;
      daten[z.stufe] = Math.max(bisher, z.level);
      ctx.speicher.schreibe('geloest', daten);
    }

    function setze(p, k) {
      const ok = ziehe(L.zugSetzen(z, p, k));
      wahlFeld = -1;
      wahlKarte = -1;
      if (ok) zeichne();
      return ok;
    }

    function entferne(p) {
      return ziehe(L.zugEntfernen(z, p));
    }

    function tippePunkt(p) {
      if (!z || L.gewonnen(z) || !zellen[p]) return;
      cursor = p;
      puffer = '';
      if (!L.istFeld(z, p)) {
        if (wahlKarte >= 0) ctx.meldung('Diese Zahl ist vorgegeben.');
        wahlFeld = -1;
        zeichne();
        return;
      }
      if (wahlKarte >= 0) { setze(p, wahlKarte); return; }
      if (z.belegt[p] >= 0) {
        // Zahl zurück in den Vorrat; das Feld bleibt gewählt für das nächste Kärtchen
        wahlFeld = p;
        if (!entferne(p)) zeichne();
        return;
      }
      wahlFeld = wahlFeld === p ? -1 : p;
      zeichne();
    }

    function tippeKarte(k) {
      if (!z || L.gewonnen(z)) return;
      puffer = '';
      if (wahlFeld >= 0 && L.istFeld(z, wahlFeld)) { const p = wahlFeld; setze(p, k); return; }
      wahlKarte = wahlKarte === k ? -1 : k;
      zeichne();
    }

    // ---------- Maus / Touch ----------
    rasterEl.addEventListener('click', (e) => {
      if (klickSperre) return;
      const el = e.target.closest?.('[data-p]');
      if (el && rasterEl.contains(el)) tippePunkt(Number(el.dataset.p));
    }, { signal: ctx.signal });

    vorratEl.addEventListener('click', (e) => {
      if (klickSperre) return;
      const el = e.target.closest?.('[data-k]');
      if (el && vorratEl.contains(el)) tippeKarte(Number(el.dataset.k));
    }, { signal: ctx.signal });

    const sperreKlick = () => { klickSperre = true; setTimeout(() => { klickSperre = false; }, 0); };

    function feldUnter(e) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const f = el?.closest?.('.rk-zahl.feld');
      return f && rasterEl.contains(f) ? Number(f.dataset.p) : -1;
    }
    function ueberVorrat(e) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      return Boolean(el && vorratEl.contains(el));
    }

    ctx.eingabe.ziehen(wurzel, {
      signal: ctx.signal,
      schwelle: 8,
      start(e) {
        if (!z || L.gewonnen(z)) return false;
        const karte = e.target.closest?.('.rk-karte');
        let k = -1, von = -1;
        if (karte && vorratEl.contains(karte)) k = Number(karte.dataset.k);
        else {
          const f = e.target.closest?.('.rk-zahl.feld');
          if (f && rasterEl.contains(f) && z.belegt[Number(f.dataset.p)] >= 0) { von = Number(f.dataset.p); k = z.belegt[von]; }
        }
        if (k < 0) return false;
        const geist = h('div', { class: 'rk-geist', 'aria-hidden': 'true', text: String(z.karten[k]) });
        wurzel.append(geist);
        zieh = { k, von, geist, ziel: -1 };
        puffer = '';
        zeichne();
        return zieh;
      },
      bewege(e, d) {
        d.geist.style.left = `${e.clientX}px`;
        d.geist.style.top = `${e.clientY}px`;
        const ziel = feldUnter(e);
        if (ziel !== d.ziel) { d.ziel = ziel; zeichne(); }
      },
      ablegen(e, d) {
        sperreKlick();
        d.geist.remove();
        zieh = null;
        const ziel = feldUnter(e);
        if (ziel >= 0) { cursor = ziel; if (!setze(ziel, d.k)) zeichne(); return; }
        if (d.von >= 0 && ueberVorrat(e)) { entferne(d.von); return; }
        zeichne();
      },
      abbrechen(d) {
        d.geist.remove();
        zieh = null;
        zeichne();
      },
    });

    // ---------- Tastatur ----------
    function bewegeCursor(dr, dc) {
      const { lb } = z;
      const r = Math.floor(cursor / lb), c = cursor % lb;
      let best = -1, bestWert = Infinity;
      zellen.forEach((el, q) => {
        if (!el) return;
        const qr = Math.floor(q / lb), qc = q % lb;
        const prim = dr ? (qr - r) * dr : (qc - c) * dc;
        const sek = dr ? Math.abs(qc - c) : Math.abs(qr - r);
        if (prim <= 0) return;
        const wert = prim + sek * 1.5 + sek * 0.01;
        if (wert < bestWert) { bestWert = wert; best = q; }
      });
      if (best >= 0) cursor = best;
      puffer = '';
      wahlFeld = -1;
      zeichne();
      zellen[cursor]?.focus({ preventScroll: true });
    }

    /** freie Kärtchen-Werte */
    const freieWerte = () => [...new Set(L.freieKarten(z).map((k) => z.karten[k]))];

    function uebernehme(text) {
      const v = Number(text);
      puffer = '';
      if (!L.istFeld(z, cursor)) { ctx.meldung('Hier ist die Zahl vorgegeben.'); zeichne(); return; }
      if (z.belegt[cursor] >= 0 && z.karten[z.belegt[cursor]] === v) { zeichne(); return; }
      const k = L.freieKarten(z).find((x) => z.karten[x] === v);
      if (k === undefined) { ctx.meldung(`Kein Kärtchen ${v} im Vorrat.`); zeichne(); return; }
      setze(cursor, k);
    }

    function ziffer(d) {
      if (!L.istFeld(z, cursor)) { ctx.meldung('Hier ist die Zahl vorgegeben.'); return; }
      const neu = (puffer + d).replace(/^0+/, '');
      if (!neu) return;
      const werte = freieWerte().map(String);
      const passend = werte.filter((w) => w.startsWith(neu));
      if (!passend.length) {
        ctx.meldung(`Kein Kärtchen ${neu} im Vorrat.`);
        puffer = '';
        zeichne();
        return;
      }
      // eindeutig (keine längere Zahl beginnt so) → sofort setzen
      if (passend.length === 1 && passend[0] === neu) { uebernehme(neu); return; }
      puffer = neu;
      zeichne();
    }

    function imRasterOderFrei(e) {
      const t = e.target;
      return !(t instanceof Element) || t === document.body || rasterEl.contains(t) || !t.closest('button, a, input, select, textarea');
    }

    function vorratTaste(e) {
      const knoepfe = [...vorratEl.querySelectorAll('.rk-karte')];
      const i = knoepfe.indexOf(document.activeElement);
      if (i < 0) return false;
      const schritt = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
      knoepfe[(i + schritt + knoepfe.length) % knoepfe.length].focus();
      return true;
    }

    // ---------- Erzeugen ----------
    function vorratLaden(stufe) {
      const v = ctx.speicher.lies('vorrat', {});
      if (!v || typeof v !== 'object' || Array.isArray(v) || !Object.hasOwn(v, stufe)) return null;
      const rest = { ...v };
      delete rest[stufe];
      ctx.speicher.schreibe('vorrat', rest);
      try { return L.ausSpeicher(v[stufe]); } catch { return null; }
    }

    async function fuelleVorrat(stufe) {
      const v = ctx.speicher.lies('vorrat', {});
      if (v && typeof v === 'object' && !Array.isArray(v) && Object.hasOwn(v, stufe)) return;
      try {
        hintergrund ??= erstelleWorker(new URL('./generator.worker.js', import.meta.url), { signal: ctx.signal });
        const r = await hintergrund.rufe('erzeuge', { stufe, level: 1, seed: zufallsLevelSeed(ctx) });
        if (zerstoert) return;
        const alt = ctx.speicher.lies('vorrat', {});
        const neu = alt && typeof alt === 'object' && !Array.isArray(alt) ? { ...alt } : {};
        neu[stufe] = r;
        ctx.speicher.schreibe('vorrat', neu);
      } catch { /* Vorrat ist nur Komfort */ }
    }

    function naechstesLevel(sid) {
      const g = ctx.speicher.lies('geloest', {});
      const n = g && Number.isInteger(g[sid]) && g[sid] >= 0 && g[sid] < 1e6 ? g[sid] : 0;
      return n + 1;
    }

    async function erzeuge(stufe) {
      const nr = ++erzeugung;
      const sid = L.STUFEN[stufe] ? stufe : 'leicht';
      z = null;
      gebaut = null;
      cursor = -1; wahlFeld = -1; wahlKarte = -1; puffer = ''; markiert = -1;
      zeichne();
      const level = naechstesLevel(sid);
      let neu = vorratLaden(sid);
      if (neu) neu = { ...L.neustart(neu), level };
      if (!neu) {
        const seed = zufallsLevelSeed(ctx);
        try {
          worker ??= ctx.worker('spiele/rechenkreuz/generator.worker.js');
          neu = await worker.rufe('erzeuge', { stufe: sid, level, seed });
          neu = L.ausSpeicher(neu);
        } catch (f) {
          if (f?.name === 'AbortError' || zerstoert) return;
          neu = null;
        }
        if (zerstoert || nr !== erzeugung) return;
        // Notfall: im Hauptthread erzeugen
        if (!neu) neu = L.erzeugeRaetsel({ stufe: sid, level, seed });
      }
      if (zerstoert || nr !== erzeugung) return;
      z = neu;
      zeichne();
      fuelleVorrat(sid);
    }

    // ---------- Schnittstelle ----------
    const instanz = {
      getStand: () => (z ? L.zumSpeichern(z) : null),
      zusammenfassung: () => {
        if (!z) return '';
        const offen = L.freieKarten(z).length;
        return `${L.STUFEN[z.stufe].name} · Level ${z.level} · ${offen} Kärtchen übrig`;
      },
      kannRueckgaengig: () => Boolean(z) && L.kannRueckgaengig(z),
      kannWiederholen: () => Boolean(z) && L.kannWiederholen(z),
      rueckgaengig() {
        if (!z) return;
        const aend = L.rueckgaengig(z);
        if (!aend) return;
        markiert = -1; puffer = ''; wahlFeld = -1; wahlKarte = -1;
        cursor = aend[aend.length - 1][0];
        zeichne();
        ctx.meldeAenderung();
      },
      wiederholen() {
        if (!z) return;
        const aend = L.wiederholen(z);
        if (!aend) return;
        markiert = -1; puffer = ''; wahlFeld = -1; wahlKarte = -1;
        cursor = aend[aend.length - 1][0];
        nachZug();
      },
      hinweis() {
        if (!z || L.gewonnen(z)) return;
        const wunsch = L.istFeld(z, wahlFeld) ? wahlFeld : cursor;
        const hw = L.hinweis(z, wunsch);
        if (!hw) return;
        wahlFeld = -1; wahlKarte = -1;
        cursor = hw.feld;
        const wert = hw.typ === 'entfernen' ? z.karten[z.belegt[hw.feld]] : z.karten[hw.karte];
        ctx.meldung(hw.typ === 'entfernen' ? `Die ${wert} passt hier nicht – zurück in den Vorrat.` : `Hier gehört die ${wert} hin.`);
        ziehe(hw.aend, { tipp: hw.feld });
      },
      neustart() {
        if (!z) return;
        L.neustart(z);
        markiert = -1; puffer = ''; wahlFeld = -1; wahlKarte = -1;
        zeichne();
        ctx.meldeAenderung();
      },
      neu(variante) {
        return erzeuge(variante ?? z?.stufe ?? ctx.variante);
      },
      onTaste(e) {
        if (e.ctrlKey || e.metaKey || e.altKey || !z || L.gewonnen(z)) return false;
        const k = e.key;
        if (k.startsWith('Arrow')) {
          if (vorratEl.contains(document.activeElement) && vorratTaste(e)) return true;
          const [dr, dc] = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k] ?? [0, 0];
          if (!dr && !dc) return false;
          if (!rasterEl.contains(document.activeElement)) {
            // erster Pfeil: nur den Cursor zeigen
            zellen[cursor]?.focus({ preventScroll: true });
            zeichne();
            return true;
          }
          bewegeCursor(dr, dc);
          return true;
        }
        if (/^[0-9]$/.test(k)) {
          if (!rasterEl.contains(document.activeElement)) zellen[cursor]?.focus({ preventScroll: true });
          ziffer(k);
          return true;
        }
        if (k === 'Enter' || k === ' ') {
          if (puffer) { uebernehme(puffer); return true; }
          if (!imRasterOderFrei(e)) return false;   // Knöpfe (Kärtchen …) lösen selbst aus
          tippePunkt(cursor);
          zellen[cursor]?.focus({ preventScroll: true });
          return true;
        }
        if (k === 'Backspace') {
          if (puffer) { puffer = puffer.slice(0, -1); zeichne(); return true; }
          if (L.istFeld(z, cursor) && z.belegt[cursor] >= 0) { entferne(cursor); return true; }
          return false;
        }
        if (k === 'Delete') {
          if (L.istFeld(z, cursor) && z.belegt[cursor] >= 0) entferne(cursor);
          puffer = '';
          zeichne();
          return true;
        }
        if (k === 'Escape') {
          if (!puffer && wahlFeld < 0 && wahlKarte < 0) return false;
          puffer = ''; wahlFeld = -1; wahlKarte = -1;
          zeichne();
          return true;
        }
        return false;
      },
      zerstoere() {
        zerstoert = true;
        zieh?.geist.remove();
        zieh = null;
        abmelden();
        worker?.beende();
        hintergrund?.beende();
        container.replaceChildren();
      },
    };

    const abmelden = ctx.farben.beobachte(() => { if (z) zeichne(); });

    if (z) { zeichne(); fuelleVorrat(z.stufe); } else erzeuge(ctx.variante);
    return instanz;
  },
};
