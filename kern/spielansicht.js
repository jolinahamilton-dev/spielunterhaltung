// Spielansicht: Kopfleiste, Spiel laden, Autospeichern, „Gelöst“-Einblendung, Tastenkürzel.
// Bewusst ohne Timer und ohne Pause-Overlay: gespeichert wird nach jedem Zug.
import { h, symbol } from './dom.js';
import { ICONS } from './symbole.js';
import { zeigeDialog, schliesseMit } from './dialog.js';
import { packeStand, entpackeStand } from './speicher.js';
import { erstelleZufall, neuerSeed } from './zufall.js';
import { erstelleFarben } from './farben.js';
import { erstelleWorker } from './worker-helfer.js';
import * as eingabe from './eingabe.js';

const SPEICHER_PAUSE_MS = 300;
const WARTE_ANZEIGE_MS = 400;

function knopf(icon, text, kurz, onclick) {
  return h('button', {
    type: 'button', class: 'knopf symbol-knopf', 'aria-label': text,
    title: kurz ? `${text} (${kurz})` : text, on: { click: onclick },
  }, symbol(icon));
}

/**
 * @param {HTMLElement} wurzel
 * @param {object} eintrag   Eintrag aus spiele/registry.js
 * @param {object} app       { speicher, einstellungen, statistik, meldung }
 */
export async function zeigeSpiel(wurzel, eintrag, app) {
  const ac = new AbortController();
  const { signal } = ac;
  const titel = h('h1', { class: 'spiel-titel', tabindex: '-1', text: eintrag.name });
  document.title = `${eintrag.name} · Spielunterhaltung`;

  const flaeche = h('div', { class: 'spielflaeche', id: 'spielflaeche' });
  const band = h('div', { class: 'band', hidden: true, role: 'status' });
  const warten = h('div', { class: 'warten', hidden: true, role: 'status', text: 'Rätsel wird vorbereitet …' });
  const gewonnen = h('div', { class: 'gewonnen', hidden: true, role: 'status', 'aria-live': 'polite' });

  const kRueck = knopf(ICONS.rueckgaengig, 'Rückgängig', 'Strg+Z', () => rueckgaengig());
  const kVor = knopf(ICONS.wiederholen, 'Wiederholen', 'Strg+Y', () => wiederholen());
  const kHinweis = knopf(ICONS.hinweis, 'Hinweis', 'H', () => hinweis());
  const kNeu = knopf(ICONS.neu, 'Neues Spiel', 'N', () => neuDialog());

  wurzel.replaceChildren(
    h('header', { class: 'kopfleiste' },
      h('a', { class: 'knopf symbol-knopf', href: '#/', title: 'Zur Übersicht', 'aria-label': 'Zur Übersicht' }, symbol(ICONS.zurueck)),
      titel,
      h('div', { class: 'kopf-knoepfe' }, kNeu, kRueck, kVor, kHinweis),
    ),
    h('main', { class: 'spiel' }, band, h('div', { class: 'spielbereich' }, flaeche, warten, gewonnen)),
  );

  // ---------- Modul laden ----------
  let modul;
  try {
    modul = (await eintrag.laden()).default;
  } catch (f) {
    console.error(f);
    flaeche.replaceChildren(h('p', { class: 'fehler-text', text: 'Das Spiel konnte nicht geladen werden.' }));
    [kNeu, kRueck, kVor, kHinweis].forEach((k) => { k.hidden = true; });
    return { fokus: titel, verlasse() { ac.abort(); } };
  }
  if (signal.aborted) return { fokus: titel, verlasse() {} };

  const spielSpeicher = app.speicher.bereich(`${modul.id}:`);
  const { huelle, hinweis: migrationsHinweis } = entpackeStand(modul, spielSpeicher.lies('stand'));
  if (migrationsHinweis) app.meldung(migrationsHinweis);

  const varianten = modul.varianten || [];
  const standardVariante = () => {
    const letzte = spielSpeicher.lies('letzteVariante');
    return varianten.some((v) => v.id === letzte) ? letzte : varianten[0]?.id ?? null;
  };

  // Ein gelöstes Spiel wird nicht wieder geöffnet – dann gleich ein neues
  const fortsetzen = huelle && !huelle.geloest ? huelle : null;
  let zustand = {
    variante: fortsetzen?.variante ?? standardVariante(),
    geloest: false,
    begonnen: fortsetzen?.begonnen ?? false,   // erster Zug gemacht → zählt als „gespielt“
  };
  let vorher = null;              // ersetztes Spiel, solange es wiederherstellbar ist
  let aufgegebenOffen = false;    // „aufgegeben“ wird erst gezählt, wenn nicht wiederhergestellt

  // ---------- Kontext für das Spiel ----------
  let warteTimer = 0;
  const ctx = {
    get variante() { return zustand.variante; },
    speicher: spielSpeicher.bereich('daten:'),
    einstellungen: Object.assign(Object.create(app.einstellungen), { spiel: app.einstellungen.spiel(modul.id) }),
    statistik: { melde: (e) => app.statistik.melde(modul.id, { variante: zustand.variante ?? 'standard', ...e }) },
    zufall: (seed, zustandRng) => erstelleZufall(seed, zustandRng),
    neuerSeed,
    farben: erstelleFarben(app.einstellungen),
    eingabe,
    signal,
    bewegungReduziert: () => app.einstellungen.bewegungReduziert(),
    worker: (pfad) => erstelleWorker(new URL(pfad, document.baseURI), {
      signal,
      beiWarten(aktiv) {
        clearTimeout(warteTimer);
        if (aktiv) warteTimer = setTimeout(() => { warten.hidden = false; }, WARTE_ANZEIGE_MS);
        else warten.hidden = true;
      },
    }),
    meldung: (text) => app.meldung(text),
    meldeAenderung,
    meldeGewonnen,
  };

  let instanz = null;
  function erstelle(stand) {
    flaeche.replaceChildren();
    instanz = modul.erstelle(flaeche, ctx, stand ?? null);
  }

  // ---------- Speichern ----------
  let speicherTimer = 0;
  function speichereJetzt() {
    clearTimeout(speicherTimer);
    speicherTimer = 0;
    if (!instanz) return;
    let stand;
    try { stand = instanz.getStand(); } catch (f) { console.error(f); return; }
    const neu = packeStand(modul, {
      stand, variante: zustand.variante, geloest: zustand.geloest,
      zusammenfassung: instanz.zusammenfassung?.() ?? '',
    });
    neu.begonnen = zustand.begonnen;
    spielSpeicher.schreibe('stand', neu);
  }
  function planeSpeichern() {
    if (!speicherTimer) speicherTimer = setTimeout(speichereJetzt, SPEICHER_PAUSE_MS);
  }

  function zaehleAufgegeben() {
    if (!aufgegebenOffen) return;
    aufgegebenOffen = false;
    app.statistik.melde(modul.id, { typ: 'aufgegeben', variante: vorher?.variante ?? 'standard' });
  }

  function meldeAenderung() {
    if (!zustand.begonnen) {
      zustand.begonnen = true;
      ctx.statistik.melde({ typ: 'gestartet' });
    }
    if (vorher) { zaehleAufgegeben(); vorher = null; band.hidden = true; }
    aktualisiereKnoepfe();
    planeSpeichern();
  }

  function meldeGewonnen(text = '') {
    if (zustand.geloest) return;
    if (!zustand.begonnen) meldeAenderung();
    zustand.geloest = true;
    ctx.statistik.melde({ typ: 'geloest' });
    speichereJetzt();
    gewonnen.replaceChildren(
      h('div', { class: 'gewonnen-karte' },
        h('p', { class: 'gewonnen-titel', text: 'Gelöst' }),
        text ? h('p', { class: 'gewonnen-text', text }) : null,
        h('div', { class: 'gewonnen-knoepfe' },
          h('button', { type: 'button', class: 'knopf primaer', on: { click: () => starteNeu(zustand.variante) } }, 'Neues Spiel'),
          h('a', { class: 'knopf', href: '#/' }, 'Zur Übersicht'),
        ),
      ),
    );
    gewonnen.hidden = false;
    gewonnen.querySelector('button')?.focus();
    aktualisiereKnoepfe();
  }

  // ---------- Aktionen ----------
  function aktualisiereKnoepfe() {
    if (!instanz) return;
    kRueck.disabled = zustand.geloest || (instanz.kannRueckgaengig ? !instanz.kannRueckgaengig() : false);
    kVor.hidden = typeof instanz.wiederholen !== 'function';
    kVor.disabled = zustand.geloest || (instanz.kannWiederholen ? !instanz.kannWiederholen() : false);
    kHinweis.hidden = typeof instanz.hinweis !== 'function';
    kHinweis.disabled = zustand.geloest;
  }

  function rueckgaengig() {
    if (zustand.geloest || kRueck.disabled) return;
    instanz.rueckgaengig();
    aktualisiereKnoepfe();
    planeSpeichern();
  }
  function wiederholen() {
    if (zustand.geloest || !instanz.wiederholen || kVor.disabled) return;
    instanz.wiederholen();
    aktualisiereKnoepfe();
    planeSpeichern();
  }
  function hinweis() {
    if (zustand.geloest || !instanz.hinweis) return;
    instanz.hinweis();
    ctx.statistik.melde({ typ: 'hinweis' });
    aktualisiereKnoepfe();
    planeSpeichern();
  }

  function starteNeu(variante) {
    const ersetzt = zustand.begonnen && !zustand.geloest;
    if (ersetzt) {
      zaehleAufgegeben();
      vorher = { stand: instanz.getStand(), variante: zustand.variante, begonnen: true };
      aufgegebenOffen = true;
    } else {
      vorher = null;
    }
    zustand = { variante, geloest: false, begonnen: false };
    if (variante !== null) spielSpeicher.schreibe('letzteVariante', variante);
    gewonnen.hidden = true;
    if (typeof instanz.neu === 'function') instanz.neu(variante);
    else { instanz.zerstoere(); erstelle(null); }
    speichereJetzt();
    aktualisiereKnoepfe();
    zeigeWiederherstellen();
  }

  function zeigeWiederherstellen() {
    if (!vorher) { band.hidden = true; return; }
    band.replaceChildren(
      h('span', { text: 'Neues Spiel gestartet.' }),
      h('button', { type: 'button', class: 'knopf klein', on: { click: wiederherstellen } }, 'Vorheriges fortsetzen'),
    );
    band.hidden = false;
  }

  function wiederherstellen() {
    if (!vorher) return;
    const v = vorher;
    vorher = null;
    aufgegebenOffen = false;
    band.hidden = true;
    instanz.zerstoere();
    zustand = { variante: v.variante, geloest: false, begonnen: v.begonnen };
    erstelle(v.stand);
    speichereJetzt();
    aktualisiereKnoepfe();
  }

  async function neuDialog() {
    const inhalt = [];
    if (varianten.length) {
      inhalt.push(h('div', { class: 'auswahl-liste' }, varianten.map((v) => h('button', {
        type: 'button', class: `knopf breit${v.id === zustand.variante ? ' aktiv' : ''}`,
        on: { click: (e) => schliesseMit(e.currentTarget, { neu: v.id }) },
      }, v.name))));
    }
    const knoepfe = [];
    if (!varianten.length) knoepfe.push({ text: 'Neues Spiel', wert: { neu: null }, primaer: true });
    if (typeof instanz.neustart === 'function' && !zustand.geloest) {
      knoepfe.push({ text: 'Gleiches Spiel von vorn', wert: { neustart: true } });
    }
    knoepfe.push({ text: 'Abbrechen', wert: null });

    const wahl = await zeigeDialog({ titel: 'Neues Spiel', inhalt, knoepfe });
    if (!wahl || signal.aborted) return;
    if (wahl.neustart) {
      instanz.neustart();
      aktualisiereKnoepfe();
      planeSpeichern();
    } else {
      starteNeu(wahl.neu ?? zustand.variante);
    }
  }

  // ---------- Tastatur ----------
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || document.querySelector('dialog[open]')) return;
    const ziel = e.target;
    if (ziel instanceof HTMLElement && ziel.closest('input, select, textarea')) return;

    if (!zustand.geloest && instanz?.onTaste?.(e) === true) { e.preventDefault(); return; }

    const taste = e.key.toLowerCase();
    const strg = e.ctrlKey || e.metaKey;
    if (e.altKey) return;
    if ((strg && taste === 'z' && !e.shiftKey) || (!strg && taste === 'z')) { e.preventDefault(); rueckgaengig(); }
    else if ((strg && (taste === 'y' || (taste === 'z' && e.shiftKey))) || (!strg && taste === 'y')) { e.preventDefault(); wiederholen(); }
    else if (!strg && taste === 'n') { e.preventDefault(); neuDialog(); }
    else if (!strg && taste === 'h') { e.preventDefault(); hinweis(); }
  }, { signal });

  // ---------- Speichern beim Verlassen / Ausblenden ----------
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { speichereJetzt(); instanz?.pausiere?.(); }
    else instanz?.fortsetze?.();
  }, { signal });
  window.addEventListener('pagehide', speichereJetzt, { signal });

  // ---------- Start ----------
  try {
    erstelle(fortsetzen?.stand ?? null);
  } catch (f) {
    console.error(f);
    if (fortsetzen) {
      app.meldung('Der gespeicherte Stand war fehlerhaft – es beginnt ein neues Spiel.');
      zustand = { variante: standardVariante(), geloest: false, begonnen: false };
      erstelle(null);
    } else {
      throw f;
    }
  }
  if (!fortsetzen) speichereJetzt();
  aktualisiereKnoepfe();

  return {
    fokus: titel,
    verlasse() {
      speichereJetzt();
      zaehleAufgegeben();
      try { instanz?.zerstoere(); } catch (f) { console.error(f); }
      ac.abort();
      clearTimeout(warteTimer);
    },
  };
}
