// Einstieg: Module zusammenstecken, Routen anzeigen, Service Worker starten.
import { h } from './dom.js';
import { erstelleSpeicher } from './speicher.js';
import { erstelleEinstellungen, wendeAufDokumentAn } from './einstellungen.js';
import { erstelleStatistik } from './statistik.js';
import { erstelleFarben, wendeFarbenAn } from './farben.js';
import { beobachteRoute } from './router.js';
import { zeigeStartseite } from './startseite.js';
import { zeigeSpiel } from './spielansicht.js';
import { zeigeEinstellungen, zeigeStatistik, zeigeInfo } from './seiten.js';
import { starteServiceWorker, erstelleInstallation } from './update.js';
import { findeSpiel, SPIELE } from '../spiele/registry.js';
import { erstelleUebersicht } from './uebersicht.js';

const meldungen = h('div', { class: 'meldungen', 'aria-live': 'polite' });
document.body.append(meldungen);

let letzteMeldung = '';
function meldung(text) {
  if (text === letzteMeldung) return;          // gleiche Meldung nicht stapeln
  letzteMeldung = text;
  const el = h('div', { class: 'meldung', text });
  meldungen.append(el);
  setTimeout(() => { el.remove(); if (letzteMeldung === text) letzteMeldung = ''; }, 4500);
}

const speicher = erstelleSpeicher({ beiFehler: (text, f) => { console.warn(text, f); meldung(text); } });
const einstellungen = erstelleEinstellungen(speicher);
const statistik = erstelleStatistik(speicher);

function wendeAn() {
  wendeAufDokumentAn(einstellungen);
  wendeFarbenAn(einstellungen.wert('palette'));
}
wendeAn();
einstellungen.beobachte(wendeAn);

const app = {
  speicher, einstellungen, statistik, meldung,
  farben: erstelleFarben(einstellungen),
  installation: erstelleInstallation(),
  uebersicht: erstelleUebersicht(speicher, SPIELE.map((s) => s.id)),
};

// Browser bitten, die Spielstände nicht bei Platzmangel zu löschen
navigator.storage?.persist?.().catch(() => {});

const wurzel = document.getElementById('app');
let ansicht = null;
let routenZaehler = 0;
// Bildlaufposition der Übersicht merken: Wer aus einem Spiel zurückkommt, steht wieder an derselben Stelle
let letzteRoute = null;
let startScroll = 0;
try { startScroll = Math.max(0, Number(sessionStorage.getItem('spielunterhaltung:startScroll')) || 0); } catch { /* egal */ }

beobachteRoute(async (route) => {
  const nummer = ++routenZaehler;
  if (letzteRoute === 'start') {
    startScroll = Math.round(window.scrollY);
    try { sessionStorage.setItem('spielunterhaltung:startScroll', String(startScroll)); } catch { /* egal */ }
  }
  try { ansicht?.verlasse(); } catch (f) { console.error(f); }
  ansicht = null;

  let neu;
  try {
    if (route.name === 'spiel') {
      const eintrag = findeSpiel(route.id);
      if (!eintrag || typeof eintrag.laden !== 'function') { location.replace('#/'); return; }
      app.uebersicht.benutzt(eintrag.id);
      neu = await zeigeSpiel(wurzel, eintrag, app);
    } else if (route.name === 'einstellungen') neu = zeigeEinstellungen(wurzel, app);
    else if (route.name === 'statistik') neu = zeigeStatistik(wurzel, app);
    else if (route.name === 'info') neu = zeigeInfo(wurzel, app);
    else neu = zeigeStartseite(wurzel, app);
  } catch (f) {
    console.error(f);
    meldung('Da ist etwas schiefgelaufen.');
    neu = zeigeStartseite(wurzel, app);
  }

  // Wurde inzwischen schon weiternavigiert, die veraltete Ansicht gleich wieder verlassen
  if (nummer !== routenZaehler) { neu?.verlasse(); return; }
  ansicht = neu;
  letzteRoute = route.name;
  window.scrollTo(0, route.name === 'start' ? startScroll : 0);
  ansicht?.fokus?.focus({ preventScroll: true });
});

starteServiceWorker({ vorNeuladen: () => { try { ansicht?.verlasse(); } catch { /* egal */ } } });
