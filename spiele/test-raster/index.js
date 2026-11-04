// „Lichter (Test)“ – nutzt jede Funktion der Spiel-Schnittstelle einmal:
// Varianten, Worker, Seed, Rückgängig/Wiederholen, Hinweis, Tastatur, Touch, Farben, Gewinnmeldung.
import { h, ladeStil } from '../../kern/dom.js';
import { erstelleVerlauf, ladeVerlauf } from '../../kern/rueckgaengig.js';
import { druecke, geloest } from './logik.js';

const GROESSEN = { klein: 4, mittel: 5 };

export default {
  id: 'test-raster',
  name: 'Lichter (Test)',
  beschreibung: 'Prüfspiel für das Grundgerüst',
  varianten: [{ id: 'klein', name: 'Klein (4×4)' }, { id: 'mittel', name: 'Mittel (5×5)' }],
  standVersion: 1,

  erstelle(container, ctx, gespeichert) {
    ladeStil('spiele/test-raster/stil.css');
    const worker = ctx.worker('spiele/test-raster/generator.worker.js');

    let s = null;                  // { n, seed, start, startNoetig, feld, noetig, zuege, hinweis }
    let verlauf = erstelleVerlauf();
    let zellen = [];
    let fokus = null;
    let aktiv = true;

    const raster = h('div', { class: 'lichter', role: 'grid', 'aria-label': 'Lichter-Feld' });
    const info = h('p', { class: 'lichter-info leise', 'aria-live': 'polite' });
    container.append(h('div', { class: 'lichter-rahmen' }, raster, info));

    ctx.eingabe.zeiger(raster, {
      signal: ctx.signal,
      tippen: (e) => {
        const z = e.startZiel?.closest?.('.licht');
        if (z && raster.contains(z)) drueckeFeld(Number(z.dataset.i));
      },
    });

    function aufbauen() {
      const n = s.n;
      raster.style.setProperty('--n', n);
      zellen = Array.from({ length: n * n }, (_, i) => h('button', {
        type: 'button', class: 'licht', role: 'gridcell', tabindex: '-1', dataset: { i },
      }));
      raster.replaceChildren(...zellen);
      fokus = ctx.eingabe.erstelleRasterFokus({ zeilen: n, spalten: n, beiBewegung: zeigeFokus });
      zeichne();
    }

    function zeichne() {
      s.feld.forEach((an, i) => {
        const z = zellen[i];
        z.classList.toggle('an', an === 1);
        z.classList.toggle('hinweis', s.hinweis === i);
        z.setAttribute('aria-label', `Zeile ${Math.floor(i / s.n) + 1}, Spalte ${i % s.n + 1}, ${an ? 'an' : 'aus'}`);
      });
      const an = s.feld.filter(Boolean).length;
      info.textContent = `${an} ${an === 1 ? 'Licht' : 'Lichter'} an · ${s.zuege} ${s.zuege === 1 ? 'Zug' : 'Züge'}`;
    }

    function zeigeFokus(z, sp) {
      const ziel = zellen[z * s.n + sp];
      zellen.forEach((el) => { el.tabIndex = -1; });
      ziel.tabIndex = 0;
      ziel.focus({ preventScroll: true });
    }

    function anwenden(i) {
      s.feld = druecke(s.feld, s.n, i);
      s.noetig[i] ^= 1;
    }

    function drueckeFeld(i) {
      if (!s || !aktiv || geloest(s.feld)) return;
      anwenden(i);
      s.zuege++;
      s.hinweis = null;
      verlauf.merke(i);
      zeichne();
      ctx.meldeAenderung();
      if (geloest(s.feld)) ctx.meldeGewonnen(`${s.zuege} ${s.zuege === 1 ? 'Zug' : 'Züge'}`);
    }

    async function neuesRaetsel(variante) {
      s = null;
      verlauf = erstelleVerlauf();
      raster.replaceChildren();
      info.textContent = '';
      const n = GROESSEN[variante] ?? GROESSEN.klein;
      try {
        const r = await worker.rufe('erzeuge', { n, seed: ctx.neuerSeed() });
        if (!aktiv) return;
        s = { n: r.n, seed: r.seed, start: r.feld, startNoetig: r.noetig, feld: r.feld.slice(), noetig: r.noetig.slice(), zuege: 0, hinweis: null };
        aufbauen();
      } catch (f) {
        if (f?.name !== 'AbortError') { console.error(f); info.textContent = 'Rätsel konnte nicht erzeugt werden.'; }
      }
    }

    // Start: gespeicherten Stand übernehmen oder neu erzeugen
    if (gespeichert?.feld) {
      s = { ...gespeichert, hinweis: null };
      verlauf = ladeVerlauf(gespeichert.verlauf);
      aufbauen();
    } else {
      neuesRaetsel(ctx.variante);
    }

    // Palette/Symbole wechseln: hier nur neu zeichnen (Lichter nutzen die Akzentfarbe)
    const abmelden = ctx.farben.beobachte(() => s && zeichne());

    return {
      getStand: () => (s ? { ...s, hinweis: undefined, verlauf: verlauf.toJSON() } : null),
      zusammenfassung: () => (s ? `${s.n}×${s.n} · ${s.zuege} ${s.zuege === 1 ? 'Zug' : 'Züge'}` : ''),
      kannRueckgaengig: () => verlauf.kannZurueck(),
      kannWiederholen: () => verlauf.kannVor(),
      rueckgaengig() {
        const i = verlauf.zurueck();
        if (i === null) return;
        anwenden(i);          // Drücken ist sein eigenes Gegenteil
        s.zuege--;
        s.hinweis = null;
        zeichne();
      },
      wiederholen() {
        const i = verlauf.vor();
        if (i === null) return;
        anwenden(i);
        s.zuege++;
        s.hinweis = null;
        zeichne();
      },
      hinweis() {
        if (!s) return;
        const i = s.noetig.indexOf(1);
        if (i < 0) return;
        s.hinweis = i;
        zeichne();
        fokus.setze(Math.floor(i / s.n), i % s.n);
        ctx.meldung('Dieses Feld gehört zur Lösung.');
      },
      neustart() {
        if (!s) return;
        s.feld = s.start.slice();
        s.noetig = s.startNoetig.slice();
        s.zuege = 0;
        s.hinweis = null;
        verlauf.leeren();
        zeichne();
      },
      neu: (variante) => neuesRaetsel(variante),
      onTaste(e) {
        if (!s || !fokus) return false;
        if (fokus.taste(e)) return true;
        if (e.key === 'Enter' || e.key === ' ') {
          drueckeFeld(fokus.zeile * s.n + fokus.spalte);
          return true;
        }
        return false;
      },
      zerstoere() {
        aktiv = false;
        abmelden();
        worker.beende();
        container.replaceChildren();
      },
    };
  },
};
