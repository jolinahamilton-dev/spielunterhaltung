// Startseite: eine Kachel pro Spiel, mit „Fortsetzen“-Anzeige und Anzahl gelöster Spiele.
// Reihenfolge wählbar: Standard · Zuletzt benutzt · Eigene (mit „Anordnen“).
import { h, symbol } from './dom.js';
import { ICONS } from './symbole.js';
import { sichtbareSpiele } from '../spiele/registry.js';
import { ordne, verschiebe } from './uebersicht.js';

const MODUS_NAMEN = [['standard', 'Standard'], ['zuletzt', 'Zuletzt benutzt'], ['eigene', 'Eigene']];

export function zeigeStartseite(wurzel, app) {
  const spiele = sichtbareSpiele();
  const ids = spiele.map((s) => s.id);
  let bearbeiten = false;
  let fokusId = null; // Nach dem Verschieben bekommt der Knopf des verschobenen Spiels den Fokus zurück
  let fokusRichtung = 0;

  const listeEl = h('ul', { class: 'kacheln', role: 'list' });
  const leisteEl = h('div', { class: 'start-leiste' });

  function kachel(spiel, nr, anzahl) {
    const huelle = app.speicher.bereich(`${spiel.id}:`).lies('stand');
    const offen = Boolean(huelle && huelle.begonnen && !huelle.geloest);
    const geloest = app.statistik.fuer(spiel.id).gesamt.geloest;
    let extra = geloest ? `${geloest} gelöst` : '';
    try { extra = spiel.kachelText?.(app.speicher.bereich(`${spiel.id}:daten:`)) || extra; } catch { /* egal */ }
    const verfuegbar = typeof spiel.laden === 'function';

    const status = !verfuegbar ? 'Kommt bald'
      : offen ? ['Fortsetzen', huelle.zusammenfassung].filter(Boolean).join(' · ')
      : 'Neues Spiel';

    const inhalt = [
      symbol(spiel.symbol, 'kachel-symbol'),
      h('span', { class: 'kachel-name', text: spiel.name }),
      h('span', { class: 'kachel-text', text: spiel.beschreibung }),
      h('span', { class: 'kachel-status' },
        h('span', { text: status }),
        extra ? h('span', { class: 'kachel-zahl', text: extra }) : null,
      ),
    ];

    if (bearbeiten) {
      const schiebe = (richtung) => () => {
        const neu = verschiebe(aktuelleIds(), spiel.id, richtung);
        app.uebersicht.setzeReihenfolge(neu);
        fokusId = spiel.id;
        fokusRichtung = richtung;
        zeichne();
      };
      return h('li', null, h('div', { class: 'kachel anordnen' }, inhalt,
        h('span', { class: 'kachel-schieber' },
          h('button', {
            type: 'button', class: 'knopf symbol-knopf', dataset: { schiebe: 'vor' }, title: 'Nach vorn', 'aria-label': `${spiel.name} nach vorn (Platz ${nr + 1} von ${anzahl})`,
            disabled: nr === 0, on: { click: schiebe(-1) }, text: '↑',
          }),
          h('button', {
            type: 'button', class: 'knopf symbol-knopf', dataset: { schiebe: 'zurueck' }, title: 'Nach hinten', 'aria-label': `${spiel.name} nach hinten (Platz ${nr + 1} von ${anzahl})`,
            disabled: nr === anzahl - 1, on: { click: schiebe(1) }, text: '↓',
          }),
        )));
    }

    return h('li', null, verfuegbar
      ? h('a', { class: `kachel${offen ? ' offen' : ''}`, href: `#/spiel/${spiel.id}` }, inhalt)
      : h('div', { class: 'kachel gesperrt', 'aria-disabled': 'true' }, inhalt));
  }

  const sortiert = () => ordne(spiele, app.uebersicht.daten());
  const aktuelleIds = () => sortiert().map((s) => s.id);

  function zeichneLeiste() {
    const modus = app.uebersicht.daten().modus;
    leisteEl.replaceChildren(
      h('div', { class: 'start-modi', role: 'group', 'aria-label': 'Reihenfolge der Spiele' },
        MODUS_NAMEN.map(([id, name]) => h('button', {
          type: 'button', class: `knopf${modus === id ? ' aktiv' : ''}`, 'aria-pressed': String(modus === id),
          on: { click: () => { bearbeiten = false; app.uebersicht.setzeModus(id, aktuelleIds()); zeichne(); } },
          text: name,
        }))),
      h('button', {
        type: 'button', class: `knopf${bearbeiten ? ' aktiv' : ''}`, 'aria-pressed': String(bearbeiten),
        on: {
          click: () => {
            if (!bearbeiten && app.uebersicht.daten().modus !== 'eigene') app.uebersicht.setzeModus('eigene', aktuelleIds());
            bearbeiten = !bearbeiten;
            zeichne();
          },
        },
        text: bearbeiten ? 'Fertig' : 'Anordnen',
      }),
    );
  }

  function zeichne() {
    const liste = sortiert();
    listeEl.replaceChildren(...liste.map((s, i) => kachel(s, i, liste.length)));
    listeEl.classList.toggle('anordnen', bearbeiten);
    zeichneLeiste();
    if (bearbeiten && fokusId) {
      const nr = liste.findIndex((s) => s.id === fokusId);
      const knoepfe = listeEl.children[nr]?.querySelectorAll('button');
      // Steht das Spiel am Rand, ist sein Knopf gesperrt: dann der andere
      let ziel = knoepfe?.[fokusRichtung < 0 ? 0 : 1];
      if (ziel?.disabled) ziel = knoepfe?.[fokusRichtung < 0 ? 1 : 0];
      ziel?.focus({ preventScroll: false });
    }
    fokusId = null;
  }

  const titel = h('h1', { class: 'start-titel', tabindex: '-1', text: 'Spielunterhaltung' });
  wurzel.replaceChildren(
    h('header', { class: 'start-kopf' },
      titel,
      h('nav', { class: 'start-nav', 'aria-label': 'Weitere Seiten' },
        h('a', { class: 'knopf symbol-knopf', href: '#/statistik', title: 'Statistik', 'aria-label': 'Statistik' }, symbol(ICONS.statistik)),
        h('a', { class: 'knopf symbol-knopf', href: '#/einstellungen', title: 'Einstellungen', 'aria-label': 'Einstellungen' }, symbol(ICONS.einstellungen)),
        h('a', { class: 'knopf symbol-knopf', href: '#/info', title: 'Info', 'aria-label': 'Info' }, symbol(ICONS.info)),
      ),
    ),
    h('main', { class: 'start' }, leisteEl, listeEl),
  );
  zeichne();
  document.title = 'Spielunterhaltung';
  return { fokus: titel, verlasse() {} };
}
