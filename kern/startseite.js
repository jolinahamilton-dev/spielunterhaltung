// Startseite: eine Kachel pro Spiel, mit „Fortsetzen“-Anzeige und Anzahl gelöster Spiele.
import { h, symbol } from './dom.js';
import { ICONS } from './symbole.js';
import { sichtbareSpiele } from '../spiele/registry.js';

export function zeigeStartseite(wurzel, app) {
  const kacheln = sichtbareSpiele().map((spiel) => {
    const huelle = app.speicher.bereich(`${spiel.id}:`).lies('stand');
    const offen = Boolean(huelle && huelle.begonnen && !huelle.geloest);
    const geloest = app.statistik.fuer(spiel.id).gesamt.geloest;
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
        geloest ? h('span', { class: 'kachel-zahl', text: `${geloest} gelöst` }) : null,
      ),
    ];

    return h('li', null, verfuegbar
      ? h('a', { class: `kachel${offen ? ' offen' : ''}`, href: `#/spiel/${spiel.id}` }, inhalt)
      : h('div', { class: 'kachel gesperrt', 'aria-disabled': 'true' }, inhalt));
  });

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
    h('main', { class: 'start' },
      h('ul', { class: 'kacheln', role: 'list' }, kacheln),
    ),
  );
  document.title = 'Spielunterhaltung';
  return { fokus: titel, verlasse() {} };
}
