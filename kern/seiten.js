// Einfache Seiten: Einstellungen, Statistik, Info.
import { h, symbol } from './dom.js';
import { ICONS } from './symbole.js';
import { zeigeDialog } from './dialog.js';
import { sichtbareSpiele } from '../spiele/registry.js';

function seitenKopf(text) {
  const titel = h('h1', { class: 'spiel-titel', tabindex: '-1', text });
  document.title = `${text} · Spielunterhaltung`;
  return {
    titel,
    kopf: h('header', { class: 'kopfleiste' },
      h('a', { class: 'knopf symbol-knopf', href: '#/', title: 'Zur Übersicht', 'aria-label': 'Zur Übersicht' }, symbol(ICONS.zurueck)),
      titel,
    ),
  };
}

function wahlGruppe(legende, name, optionen, aktuell, aendern) {
  return h('fieldset', { class: 'gruppe' },
    h('legend', { text: legende }),
    h('div', { class: 'segment' }, optionen.map(([wert, text]) => h('label', null,
      h('input', {
        type: 'radio', name, value: wert, checked: wert === aktuell,
        on: { change: () => aendern(wert) },
      }),
      h('span', { text }),
    ))),
  );
}

function schalter(text, beschreibung, aktuell, aendern) {
  return h('label', { class: 'schalter' },
    h('input', { type: 'checkbox', role: 'switch', checked: aktuell, on: { change: (e) => aendern(e.target.checked) } }),
    h('span', { class: 'schalter-text' },
      h('span', { text }),
      beschreibung ? h('span', { class: 'leise', text: beschreibung }) : null,
    ),
  );
}

export function zeigeEinstellungen(wurzel, app) {
  const e = app.einstellungen;
  const { titel, kopf } = seitenKopf('Einstellungen');
  const vorschau = h('div', { class: 'farb-vorschau', 'aria-hidden': 'true' });

  const zeichneVorschau = () => {
    const farben = app.farben;
    vorschau.replaceChildren(...farben.liste.map((f) => h('span', { class: 'farb-punkt', style: { background: farben.css(f.id) } },
      farben.musterAn() ? h('span', { class: 'farb-symbol', html: `<svg viewBox="0 0 10 10" width="14" height="14"><path d="${farben.symbolPfad(f.id)}" fill-rule="evenodd"/></svg>` }) : null,
    )));
  };
  zeichneVorschau();

  wurzel.replaceChildren(kopf, h('main', { class: 'seite' },
    wahlGruppe('Darstellung', 'theme', [['system', 'Wie System'], ['hell', 'Hell'], ['dunkel', 'Dunkel']], e.wert('theme'), (v) => e.setze('theme', v)),
    wahlGruppe('Spielfarben', 'palette', [['standard', 'Standard'], ['farbenblind', 'Farbenblind-freundlich']], e.wert('palette'), (v) => { e.setze('palette', v); zeichneVorschau(); }),
    vorschau,
    schalter('Symbole auf Farben', 'Jede Farbe bekommt zusätzlich ein eigenes Symbol (bei „farbenblind-freundlich“ immer an).',
      e.wert('muster'), (v) => { e.setze('muster', v); zeichneVorschau(); }),
    wahlGruppe('Animationen', 'animationen', [['system', 'Wie System'], ['reduziert', 'Reduziert'], ['aus', 'Aus']], e.wert('animationen'), (v) => e.setze('animationen', v)),
    schalter('Fehler sofort zeigen', 'Regelverstöße werden markiert, sobald sie entstehen.', e.wert('fehlerMarkieren'), (v) => e.setze('fehlerMarkieren', v)),
  ));
  return { fokus: titel, verlasse() {} };
}

export function zeigeStatistik(wurzel, app) {
  const { titel, kopf } = seitenKopf('Statistik');
  const main = h('main', { class: 'seite' });

  function zeichne() {
    const zeilen = sichtbareSpiele()
      .map((spiel) => ({ spiel, st: app.statistik.fuer(spiel.id).gesamt }))
      .filter(({ st }) => st.gespielt > 0 || st.geloest > 0);

    if (!zeilen.length) {
      main.replaceChildren(h('p', { class: 'leise', text: 'Noch keine Spiele gespielt.' }));
      return;
    }
    main.replaceChildren(h('table', { class: 'tabelle' },
      h('thead', null, h('tr', null,
        h('th', { scope: 'col', text: 'Spiel' }), h('th', { scope: 'col', text: 'Gespielt' }),
        h('th', { scope: 'col', text: 'Gelöst' }), h('th', { scope: 'col', text: 'Beste Serie' }), h('th', null),
      )),
      h('tbody', null, zeilen.map(({ spiel, st }) => h('tr', null,
        h('th', { scope: 'row', text: spiel.name }),
        h('td', { text: st.gespielt }), h('td', { text: st.geloest }), h('td', { text: st.besteSerie }),
        h('td', null, h('button', {
          type: 'button', class: 'knopf klein',
          on: {
            click: async () => {
              const ja = await zeigeDialog({
                titel: 'Statistik zurücksetzen?',
                inhalt: h('p', { text: `Die Statistik für „${spiel.name}“ wird gelöscht. Laufende Spiele bleiben erhalten.` }),
                knoepfe: [{ text: 'Zurücksetzen', wert: true, primaer: true }, { text: 'Abbrechen', wert: false }],
              });
              if (ja) { app.statistik.zuruecksetzen(spiel.id); zeichne(); }
            },
          },
        }, 'Zurücksetzen')),
      ))),
    ));
  }
  zeichne();
  wurzel.replaceChildren(kopf, main);
  return { fokus: titel, verlasse() {} };
}

export function zeigeInfo(wurzel, app) {
  const { titel, kopf } = seitenKopf('Info');
  const installKnopf = h('button', { type: 'button', class: 'knopf primaer', hidden: !app.installation.moeglich(),
    on: { click: async () => { await app.installation.starte(); installKnopf.hidden = true; } } }, 'App installieren');
  const speicherText = h('p', { class: 'leise', text: 'Speicher wird geprüft …' });

  navigator.storage?.persisted?.().then((dauerhaft) => {
    speicherText.textContent = dauerhaft
      ? 'Spielstände sind dauerhaft gespeichert.'
      : 'Der Browser darf Spielstände bei Platzmangel löschen. Installiert als App passiert das praktisch nie.';
  }).catch(() => { speicherText.textContent = ''; });

  wurzel.replaceChildren(kopf, h('main', { class: 'seite' },
    h('p', null, h('strong', { text: 'Spielunterhaltung' }), ` · Version ${self.SPIEL_VERSION || '?'}`),
    h('p', { text: 'Ruhige Spiele zum Abschalten. Ohne Werbung, ohne Töne, ohne Zeitdruck – und komplett offline nutzbar.' }),
    h('h2', { text: 'Als App installieren' }),
    h('p', { text: 'PC: In Edge oder Chrome in der Adressleiste auf „App installieren“ klicken. Danach startet die App im eigenen Fenster und aus dem Startmenü.' }),
    h('p', { text: 'Handy: Im Chrome-Menü „Zum Startbildschirm hinzufügen“ bzw. „App installieren“ wählen.' }),
    installKnopf,
    h('h2', { text: 'Speicher' }),
    speicherText,
  ));
  return { fokus: titel, verlasse() {} };
}
