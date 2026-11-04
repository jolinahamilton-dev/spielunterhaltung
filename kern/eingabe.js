// Eingabe-Helfer für Maus, Touch und Stift (nur Pointer Events) sowie Tastatur-Rasterfokus.
// Alle Helfer nehmen ein AbortSignal, damit beim Verlassen des Spiels alles abgemeldet wird.

const SCHWELLE_PX = 6;
const LANGDRUCK_MS = 450;

const abstand = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

/**
 * Tippen / Rechtsklick / langes Drücken auf einem Element unterscheiden.
 * Lang drücken (Touch) gilt wie Rechtsklick, wenn kein eigenes `lang` angegeben ist.
 * @param {HTMLElement|SVGElement} el
 * @param {{ tippen?: (e:PointerEvent)=>void, rechts?: (e:MouseEvent|PointerEvent)=>void,
 *           lang?: (e:PointerEvent)=>void, signal?: AbortSignal, langMs?: number }} h
 */
export function zeiger(el, { tippen, rechts, lang = rechts, signal, langMs = LANGDRUCK_MS } = {}) {
  let start = null;
  let timer = 0;
  let langAusgeloest = false;

  const ende = () => { clearTimeout(timer); start = null; };

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !e.isPrimary) return;
    start = e;
    langAusgeloest = false;
    if (lang && e.pointerType !== 'mouse') {
      timer = setTimeout(() => { langAusgeloest = true; lang(start); }, langMs);
    }
  }, { signal });

  el.addEventListener('pointermove', (e) => {
    if (start && e.pointerId === start.pointerId && abstand(e, start) > SCHWELLE_PX) ende();
  }, { signal });

  el.addEventListener('pointerup', (e) => {
    if (!start || e.pointerId !== start.pointerId) return;
    const war = start;
    ende();
    if (!langAusgeloest && tippen) tippen(Object.assign(e, { startZiel: war.target }));
  }, { signal });

  el.addEventListener('pointercancel', ende, { signal });

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    // Bei Touch löst das System contextmenu nach langem Druck aus – schon über `lang` behandelt
    if (rechts && !langAusgeloest && (e.pointerType === 'mouse' || e.button === 2)) rechts(e);
  }, { signal });
}

/**
 * Ziehen mit Pointer Capture.
 * start(e) gibt Daten zurück (oder false = nicht ziehen). Mit `schwelle` beginnt das Ziehen erst
 * nach einer Mindestbewegung (dann bleibt ein einfaches Tippen ein Tippen).
 * @param {HTMLElement|SVGElement} el
 * @param {{ start:(e:PointerEvent)=>any, bewege?:(e:PointerEvent, d:any)=>void,
 *           ablegen?:(e:PointerEvent, d:any)=>void, abbrechen?:(d:any)=>void,
 *           schwelle?: number, signal?: AbortSignal }} h
 */
export function ziehen(el, { start, bewege, ablegen, abbrechen, schwelle = 0, signal }) {
  let unten = null;   // pointerdown-Ereignis
  let daten = null;   // Rückgabe von start
  let aktiv = false;

  const zuruecksetzen = () => { unten = null; daten = null; aktiv = false; };

  el.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    unten = e;
    if (schwelle <= 0) beginne(e);
  }, { signal });

  function beginne(e) {
    const d = start(unten);
    if (d === false || d === undefined || d === null) { zuruecksetzen(); return; }
    daten = d;
    aktiv = true;
    try { el.setPointerCapture(unten.pointerId); } catch { /* egal */ }
    if (e !== unten) bewege?.(e, daten);
  }

  el.addEventListener('pointermove', (e) => {
    if (!unten || e.pointerId !== unten.pointerId) return;
    if (!aktiv) {
      if (abstand(e, unten) > schwelle) beginne(e);
      return;
    }
    bewege?.(e, daten);
  }, { signal });

  el.addEventListener('pointerup', (e) => {
    if (!unten || e.pointerId !== unten.pointerId) return;
    if (aktiv) ablegen?.(e, daten);
    zuruecksetzen();
  }, { signal });

  el.addEventListener('pointercancel', (e) => {
    if (!unten || e.pointerId !== unten.pointerId) return;
    if (aktiv) abbrechen?.(daten);
    zuruecksetzen();
  }, { signal });
}

/**
 * Tastatur-Fokus in einem Raster (Pfeiltasten, Pos1/Ende).
 * Die Darstellung übernimmt das Spiel (über beiBewegung).
 */
export function erstelleRasterFokus({ zeilen, spalten, zeile = 0, spalte = 0, umlaufen = false, beiBewegung = () => {} }) {
  const fokus = {
    zeile, spalte,
    get zeilen() { return zeilen; },
    get spalten() { return spalten; },
    groesse(z, s) { zeilen = z; spalten = s; fokus.setze(fokus.zeile, fokus.spalte); },
    setze(z, s) {
      const nz = Math.max(0, Math.min(zeilen - 1, z));
      const ns = Math.max(0, Math.min(spalten - 1, s));
      const geaendert = nz !== fokus.zeile || ns !== fokus.spalte;
      fokus.zeile = nz; fokus.spalte = ns;
      if (geaendert) beiBewegung(nz, ns);
    },
    /** Verarbeitet Pfeiltasten usw. → true, wenn die Taste benutzt wurde */
    taste(e) {
      let z = fokus.zeile, s = fokus.spalte;
      switch (e.key) {
        case 'ArrowUp': z--; break;
        case 'ArrowDown': z++; break;
        case 'ArrowLeft': s--; break;
        case 'ArrowRight': s++; break;
        case 'Home': s = 0; if (e.ctrlKey) z = 0; break;
        case 'End': s = spalten - 1; if (e.ctrlKey) z = zeilen - 1; break;
        default: return false;
      }
      if (umlaufen) { z = (z + zeilen) % zeilen; s = (s + spalten) % spalten; }
      fokus.setze(z, s);
      return true;
    },
  };
  return fokus;
}
