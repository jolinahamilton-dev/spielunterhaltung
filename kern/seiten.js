// Einfache Seiten: Einstellungen, Statistik, Info.
import { h, symbol } from './dom.js';
import { ICONS } from './symbole.js';
import { zeigeDialog } from './dialog.js';
import { istDesktopApp } from './update.js';
import { sichtbareSpiele, findeSpiel } from '../spiele/registry.js';
import {
  erstelleSicherung, pruefeSicherung, spieleEin, dateiName, hatBackup, stelleBackupWiederHer, MAX_DATEI_BYTES,
} from './sicherung.js';

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
    ...(istDesktopApp() ? [
      h('h2', { text: 'Windows-App' }),
      h('p', { text: 'Du nutzt die Windows-App. Neue Versionen zeigt UniGetUI unter „Updates“ an.' }),
    ] : [
      h('h2', { text: 'Als App installieren' }),
      h('p', { text: 'PC: Am besten die Windows-App über UniGetUI installieren (Anleitung im Repository unter docs/PC-APP.md). Alternativ in Edge oder Chrome in der Adressleiste auf „App installieren“ klicken.' }),
      h('p', { text: 'Handy: Im Chrome-Menü „Zum Startbildschirm hinzufügen“ bzw. „App installieren“ wählen.' }),
      installKnopf,
    ]),
    h('h2', { text: 'Speicher' }),
    speicherText,
    sicherungsBereich(app),
  ));
  return { fokus: titel, verlasse() {} };
}

function lokalerSpeicher() {
  try { return globalThis.localStorage; } catch { return null; }
}

function sicherungsBereich(app) {
  const backend = lokalerSpeicher();
  if (!backend) return h('p', { class: 'leise', text: 'Sicherungen sind in diesem Fenster nicht möglich (kein dauerhafter Speicher).' });

  const datei = h('input', { type: 'file', accept: '.json,application/json', hidden: true });

  function speichern() {
    const s = erstelleSicherung(backend, self.SPIEL_VERSION || '?');
    const blob = new Blob([JSON.stringify(s, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: dateiName() });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  datei.addEventListener('change', async () => {
    const f = datei.files?.[0];
    datei.value = '';
    if (!f) return;
    if (f.size > MAX_DATEI_BYTES) { app.meldung('Die Datei ist zu groß für eine Sicherung.'); return; }
    const p = pruefeSicherung(await f.text());
    if (!p.ok) { app.meldung(p.fehler); return; }
    const namen = p.spiele.map((id) => findeSpiel(id)?.name).filter(Boolean);
    const datum = p.datum ? new Date(p.datum).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'unbekannt';
    const ja = await zeigeDialog({
      titel: 'Sicherung laden?',
      inhalt: [
        h('p', { text: `Sicherung vom ${datum}${namen.length ? ` mit Spielständen von: ${namen.join(', ')}` : ''}.` }),
        h('p', { text: 'Alle aktuellen Spielstände, Einstellungen und Statistiken werden dadurch ersetzt. Der jetzige Stand lässt sich danach hier einmal wiederherstellen.' }),
      ],
      knoepfe: [{ text: 'Laden', wert: true, primaer: true }, { text: 'Abbrechen', wert: false }],
    });
    if (!ja) return;
    const r = spieleEin(backend, p.sicherung);
    if (!r.ok) { app.meldung(r.fehler); return; }
    location.reload();
  });

  async function wiederherstellen() {
    const ja = await zeigeDialog({
      titel: 'Früheren Stand wiederherstellen?',
      inhalt: h('p', { text: 'Der Stand von vor dem letzten Laden einer Sicherung ersetzt die jetzigen Daten.' }),
      knoepfe: [{ text: 'Wiederherstellen', wert: true, primaer: true }, { text: 'Abbrechen', wert: false }],
    });
    if (!ja) return;
    const r = stelleBackupWiederHer(backend);
    if (!r.ok) { app.meldung(r.fehler); return; }
    location.reload();
  }

  return h('section', { class: 'gruppe', 'aria-labelledby': 'sicherung-titel' },
    h('h2', { id: 'sicherung-titel', text: 'Sicherung' }),
    h('p', { class: 'leise', text: 'Spielstände, Rekorde, Statistik und Einstellungen als Datei speichern – z. B. zum Umziehen auf ein anderes Gerät.' }),
    h('div', { class: 'segment' },
      h('button', { type: 'button', class: 'knopf', on: { click: speichern } }, 'Sicherung speichern'),
      h('button', { type: 'button', class: 'knopf', on: { click: () => datei.click() } }, 'Sicherung laden'),
      hatBackup(backend) ? h('button', { type: 'button', class: 'knopf', on: { click: wiederherstellen } }, 'Stand vor dem Laden zurückholen') : null,
    ),
    datei,
  );
}
