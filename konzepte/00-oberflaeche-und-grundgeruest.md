# Kopf aus – Oberfläche und Grundgerüst (Konzept v1)

## 1. Ziele und Grundsätze
- Sechs ruhige Spiele in einer App: Sudoku, Farben sortieren, Block-Puzzle, Stau auflösen, Minesweeper (inkl. „Unendlich“), Nonogramm.
- **PC zuerst** (Maus + Tastatur, installiert über Edge/Chrome), **Handy gleichwertig** (Touch, Android, hoch/quer).
- **Offline immer**, kein Konto, keine Cloud, keine Werbung, keine Leben/Energie, keine Zeitstrafen.
- **Still:** keine Töne, keine Vibration (`navigator.vibrate` wird nirgends aufgerufen – per Test geprüft).
- **Kein Frust:** Rückgängig unbegrenzt, Autospeichern nach jedem Zug, Pause jederzeit, Timer standardmäßig ausgeblendet.
- **Technik:** Vanilla JS (ES-Module), HTML, CSS. Kein Build, keine npm-Abhängigkeiten. PWA auf GitHub Pages.
- Eigenes, schlichtes Design; keine Namen, Grafiken oder Farbschemata bekannter Markenspiele.

## 2. Ordnerstruktur
```
kopfaus-spiele/
  index.html               App-Shell (eine Seite)
  manifest.webmanifest
  sw.js                    Service Worker (im Wurzelordner → Scope = ganze App)
  version.js               export const VERSION = "1.0.0"; + Dateiliste fürs Precache
  icons/                   icon-192.png, icon-512.png, icon-maskable-512.png, icon.svg
  css/                     basis.css (Variablen, Reset), shell.css, komponenten.css
  kern/                    gemeinsame Module
    app.js                 Start, Router, Spiel laden/entladen
    router.js  kopfleiste.js  startseite.js  dialog.js
    speicher.js  migration.js  rueckgaengig.js  statistik.js  einstellungen.js
    zufall.js  eingabe.js  worker-helfer.js  farben.js  sicherung.js  update.js
  spiele/
    registry.js            Liste der Spiel-IDs + Kachel-Metadaten (lädt Module lazy)
    sudoku/  farben-sortieren/  block-puzzle/  stau/  minesweeper/  nonogramm/
      index.js  logik.js (DOM-frei, testbar)  ansicht.js  stil.css  generator.worker.js
  tests/
    index.html             Test-Seite im Browser
    mini-test.js           ~60 Zeilen eigener Test-Runner
    kern/*.test.js  spiele/<id>/*.test.js
  werkzeuge/
    server.ps1             lokaler Testserver (PowerShell)
    server.mjs             Alternative über Electron als Node
    precache-liste.ps1     erzeugt/prüft Dateiliste in version.js
  konzepte/                Planungsdokumente (wird nicht gecacht)
```
Regel: `logik.js` jedes Spiels kennt kein DOM → im Browser-Test und im Worker nutzbar.

## 3. App-Shell
**Routing (Hash):** `#/` Startseite · `#/spiel/<id>` Spiel · `#/einstellungen` · `#/statistik` · `#/info` (Version, Sicherung). Hash-Routing funktioniert auf GitHub Pages ohne 404-Tricks. Browser-/Android-Zurück = `history.back()`; im Spiel führt Zurück zur Startseite (Stand ist bereits gespeichert).

**Startseite:** Raster aus 6 Kacheln (PC 3×2, Handy 2×3 bzw. 1 Spalte bei sehr schmal). Jede Kachel: eigenes Symbol (SVG, inline), Name, Kurzbeschreibung, darunter Status:
- „Fortsetzen · Mittel · 12 Züge“ wenn ein offener Stand existiert (Kachel hervorgehoben), sonst „Neues Spiel“.
- kleine Zeile „23 gelöst“ (aus Statistik). Kein Fortschrittsdruck, keine Abzeichen.
- Kacheln sind `<a href="#/spiel/id">` → per Tab/Enter erreichbar.

**Spielansicht:** einheitliche Kopfleiste (oben, auf Handy-Querformat optional seitlich):
`[← Zurück] Spielname · (Timer, falls aktiviert) … [Neu] [↶ Rückgängig] [? Hinweis] [⏸ Pause] [⚙]`
- Buttons sind `<button>` mit `aria-label` und Tooltip mit Tastenkürzel. Hinweis wird ausgeblendet, wenn die Instanz kein `hinweis()` hat. Rückgängig ist deaktiviert, wenn `kannRueckgaengig?.() === false`.
- „Neu“ öffnet kleinen Dialog: Schwierigkeit/Variante (vom Spiel geliefert über `varianten`, s. u.) + „Neu starten (gleiches Rätsel)“. Kein Bestätigungsstress: der alte Stand bleibt bis zum ersten Zug per „Rückgängig“ wiederherstellbar.
- Darunter der Spiel-Container (`<main id="spielflaeche">`), der den restlichen Platz füllt; Spiele skalieren selbst (CSS-Grid/`aspect-ratio`, kein festes Pixelmaß).

**Pausieren/Fortsetzen:** Pause-Button, Taste `P`/`Esc`, automatisch bei `visibilitychange` (hidden) und `blur` des Fensters. Pause-Overlay verdeckt das Spielfeld (Timer stoppt), zeigt „Weiter“ groß. Beim Verlassen/Ausblenden wird sofort gespeichert. Timer misst nur aktive Zeit.

**Gewonnen:** ruhige Einblendung im Spielfeld („Gelöst · 4:12“) mit „Neues Rätsel“ und „Zur Übersicht“; kein Konfetti, keine Wertung.

**Tastenkürzel global:** `Strg+Z`/`Z` Rückgängig, `Strg+Y` (sofern Spiel Wiederholen kann), `N` Neu, `H` Hinweis, `P` Pause, `Esc` Pause/Dialog schließen, `Alt+←` Zurück. Alles andere geht an `instanz.onTaste(event)`; gibt das Spiel `true` zurück, wird `preventDefault()` gesetzt.

## 4. Gemeinsame Module
### Speicher (`kern/speicher.js`)
- **localStorage** für alles in v1: Stände sind klein (Sudoku < 2 KB, Minesweeper-Unendlich mit Chunking ggf. 50–200 KB). Synchron → Speichern in `pagehide` zuverlässig. Grenze ~5 MB reicht.
- IndexedDB erst, falls ein Spiel > 500 KB braucht (dann nur hinter derselben Schnittstelle austauschen). `navigator.storage.persist()` beim ersten Start anfragen, damit der Browser nichts löscht.
- Schlüssel: `kopfaus:v1:<spielId>:<schluessel>`; globale: `kopfaus:v1:einstellungen`, `…:statistik`.
- `ctx.speicher` = `{ lies(k, standard), schreibe(k, wert), entferne(k), alle() }` – JSON, Fehler (Quota, kaputtes JSON) werden abgefangen und als Hinweis gemeldet, nie als Absturz.
- **Spielstand-Hülle:** die Shell speichert `{ format: 1, spielVersion: n, gespeichertAm, stand }` unter `<id>:stand`. Spiele exportieren optional `standVersion` (Zahl) und `migriere(stand, vonVersion)`; fehlt die Migration oder schlägt sie fehl, wird der alte Stand verworfen (Hinweis „Altes Spiel konnte nicht übernommen werden“) – Statistik bleibt erhalten.
- **Autospeichern:** Spiel ruft nach jedem Zug `ctx.meldeAenderung()`; Shell holt `getStand()` gedrosselt (max. alle 300 ms) plus sofort bei Pause, Routenwechsel, `pagehide`, `visibilitychange`.

### Rückgängig-Helfer (`kern/rueckgaengig.js`)
```js
const verlauf = erstelleVerlauf({ max: 500 });   // Ringpuffer
verlauf.merke(zug);          // Zug = kleiner Diff, z. B. {von, nach, n}
verlauf.zurueck() → zug|null; verlauf.vor() → zug|null; verlauf.kann(); verlauf.toJSON()/ladeAus()
```
Speichert Diffs statt Komplett-Snapshots; Verlauf ist Teil von `getStand()`, damit Rückgängig auch nach Neustart der App geht.

### Statistik (`kern/statistik.js`)
`ctx.statistik.melde({ typ: "gestartet"|"geloest"|"aufgegeben"|"hinweis", variante, zeitMs })`. Gespeichert pro Spiel und Variante: gespielt, gelöst, aktuelle Serie, beste Serie, Bestzeit, Ø-Zeit (nur gelöste). `meldeGewonnen()` meldet `geloest` automatisch mit Zeit vom Shell-Timer. Ansicht `#/statistik` als schlichte Tabelle; „Statistik zurücksetzen“ pro Spiel.

### Einstellungen (`kern/einstellungen.js`)
Global: `theme` (system|hell|dunkel), `timerZeigen` (false), `palette` (standard|farbenblind), `muster` (Symbole/Muster zusätzlich zu Farben, Standard an bei farbenblind), `animationen` (system|reduziert|aus), `fehlerMarkieren` (Konflikte live zeigen, Standard an). Pro Spiel zusätzlich frei (z. B. Sudoku „Notizen automatisch entfernen“) über `ctx.einstellungen.spiel`. `ctx.einstellungen.beobachte(fn)` informiert Spiele bei Änderungen (z. B. Palette wechseln ohne Neuladen). Gesetzt als Attribute auf `<html data-theme data-palette data-bewegung>`.

### Seeded-RNG (`kern/zufall.js`)
`ctx.zufall(seed)` → Objekt mit `zahl()` [0,1), `ganz(min,max)`, `wahl(arr)`, `mische(arr)`, `seed`. Algorithmus: **sfc32** mit Seed-Hash aus String (cyrb128). Seed wird im Stand gespeichert → „gleiches Rätsel neu starten“ und reproduzierbare Tests. Ohne Seed: `crypto.getRandomValues`.

### Eingabe-Abstraktion (`kern/eingabe.js`)
- Nur **Pointer Events** (`pointerdown/move/up/cancel`), `touch-action: none` auf Spielflächen, `setPointerCapture` beim Ziehen.
- Helfer: `aufTippen(el, fn)` (unterscheidet Tippen/Ziehen über 6-px-Schwelle), `ziehen(el, { start, bewege, ablegen, abbrechen })` mit Geist-Element per `transform`, `langDruck(el, fn, 450ms)` (Handy-Ersatz für Rechtsklick, z. B. Flagge/Notiz), Rechtsklick über `contextmenu` (Standardmenü unterdrückt).
- **Tastatur:** `rasterFokus(container, {zeilen, spalten})` – Pfeiltasten bewegen sichtbaren Fokusrahmen, Enter/Leertaste = Aktion; Ziffern direkt. Jedes Spiel ist vollständig ohne Maus spielbar.
- Kein Hover-Zwang: alle Infos auch ohne Hover sichtbar.

### Web Worker (`kern/worker-helfer.js`)
`ctx.worker(pfad)` → `{ rufe(auftrag, daten) → Promise, beende() }`. Modul-Worker (`new Worker(url, {type:"module"})`), Nachrichten mit Auftrags-ID, Abbruch beim Spielwechsel. Shell zeigt nach 400 ms ein ruhiges „Rätsel wird vorbereitet…“. Spiele dürfen fertige Rätsel vorproduzieren (1–2 je Schwierigkeit im Speicher), damit „Neu“ sofort geht.

### Spiel-Schnittstelle (verfeinert, abwärtskompatibel)
```js
export default {                         // zusätzlich als benannter Export erlaubt
  id, name, beschreibung,                // wie vorgegeben
  symbol?,  varianten?: [{id, name}],    // NEU optional: Kachel-SVG, Schwierigkeiten
  standVersion?: 1, migriere?(stand, von),// NEU optional: Migration
  erstelle(container, ctx, gespeicherterStand) → instanz
}
instanz: getStand(), rueckgaengig(), neustart(), zerstoere(),       // Pflicht
  hinweis?(), onTaste?(e) → bool, wiederholen?(), kannRueckgaengig?(),
  pausiere?(), fortsetze?(), neu?(variantenId), zusammenfassung?() → "Mittel · 12 Züge"
ctx zusätzlich: meldeAenderung(), variante, signal (AbortSignal fürs Aufräumen),
  bewegungReduziert(), eingabe (Helfer s. o.)
```
`neustart()` = gleiches Rätsel von vorn; `neu(variante)` = neues Rätsel (fehlt es, zerstört die Shell die Instanz und ruft `erstelle(..., null)` mit `ctx.variante`).

## 5. Offline / PWA
- **Manifest:** `name: "Kopf aus"`, `short_name`, `start_url: "./#/"`, `scope: "./"`, `display: "standalone"`, `background_color`/`theme_color` (hell; dunkel per `<meta name="theme-color" media=…>`), Icons 192/512 + maskable, `orientation: "any"`, `lang: "de"`. Relative Pfade, weil Pages unter `/kopfaus-spiele/` läuft.
- **Service Worker:** Cache-Name `kopfaus-<VERSION>`. `install`: alle Dateien aus `version.js`-Liste precachen (ca. 60–80 Dateien, < 1 MB). `fetch`: **Cache zuerst**, Fallback Netz; Navigationsanfragen → `index.html`. `activate`: alte Caches löschen. Kein Netz-Zugriff zur Laufzeit nötig.
- **Update-Hinweis:** neuer SW wartet (`skipWaiting` nicht automatisch). `update.js` erkennt `registration.waiting` → dezentes Band „Neue Version verfügbar · [Jetzt laden]“. Klick → `postMessage("skipWaiting")`, nach `controllerchange` Reload (Stand ist gespeichert). Prüfung bei Start und alle 6 h via `registration.update()`.
- **Precache-Liste:** `werkzeuge/precache-liste.ps1` listet alle Dateien (ohne `tests/`, `werkzeuge/`, `konzepte/`) und schreibt sie in `version.js`; Test-Seite prüft, dass jede gelistete Datei erreichbar ist.
- **Installation PC:** Edge/Chrome → Adressleiste „App installieren“ → eigenes Fenster, Startmenü-Eintrag. **Handy:** Chrome Android → „Zum Startbildschirm hinzufügen/Installieren“. In `#/info` kurze Anleitung; optional eigener „Installieren“-Knopf über `beforeinstallprompt`.

## 6. Design-System
- **CSS-Variablen** in `basis.css`: `--hg`, `--flaeche`, `--flaeche-2`, `--text`, `--text-leise`, `--akzent`, `--rand`, `--fokus`, `--fehler` (sanftes Rot), `--erfolg`; Abstände `--a1..--a6` (4/8/12/16/24/32 px), `--radius: 10px`, `--dauer: 180ms`.
- **Farben ruhig:** gedämpfte Töne (z. B. Salbei, Sand, Schiefer), Akzent ein gedecktes Blaugrün. Hell: warmes Off-White, Dunkel: tiefes Blaugrau (kein reines Schwarz). Spielfarben (Röhren, Blöcke, Autos) aus `kern/farben.js`: 10 Standardfarben + Okabe-Ito-basierte farbenblind-Palette; jede Farbe hat ein festes **Symbol/Muster** (●▲■◆★ Streifen, Punkte …) als SVG-Pattern – sichtbar, wenn `muster` an.
- `ctx.farben` = `{ liste: [{id, wert, symbol, name}], css(id), beobachte(fn) }`.
- **Dunkelmodus:** `prefers-color-scheme` + manuelle Übersteuerung über `data-theme`.
- **Typografie:** Systemschrift (`system-ui, "Segoe UI", Roboto, sans-serif`), keine Webfonts (offline, schnell). Ziffern `font-variant-numeric: tabular-nums`. Basisgröße 16 px, `clamp()` für Überschriften.
- **Responsive:** PC: Spielfeld mittig, max. ~min(80vh, 720px); Seitenleiste nur wenn Platz (Statistik/Steuerung). Handy hoch: Kopfleiste oben kompakt (Symbole ohne Text), Bedienelemente (z. B. Ziffernblock) unten im Daumenbereich. Handy quer: Kopfleiste als schmale Spalte links. Einheiten `dvh`, `env(safe-area-inset-*)`. Trefferflächen ≥ 44 px.
- **Animationen:** nur `transform`/`opacity`, 120–250 ms, `ease-out`; Umgießen/Verschwinden von Reihen sanft. `prefers-reduced-motion` oder Einstellung → Dauer 0, Ergebnis sofort.
- **Barrierefreiheit:** sichtbarer Fokusrahmen (`:focus-visible`, 3 px), Kontrast ≥ 4,5:1 Text, ≥ 3:1 Spielelemente; Spielfelder als `role="grid"` mit `aria-label` je Zelle wo sinnvoll; `aria-live="polite"` für „Gelöst“; Information nie nur über Farbe (Fehler zusätzlich unterstrichen/markiert).

## 7. Sicherung (Export/Import)
- `#/info` → „Sicherung speichern“: alle `kopfaus:*`-Schlüssel als JSON `{ app: "kopfaus", format: 1, version, datum, daten }` → Download `kopfaus-sicherung-JJJJ-MM-TT.json` (Blob + `<a download>`).
- „Sicherung laden“: `<input type="file">`, Prüfung von `app`/`format`, Vorschau („6 Spiele, Statistik vom …“), dann ersetzen. Vorher automatische Kopie des aktuellen Stands in `kopfaus:backup-vor-import`.
- Kein Cloud-Sync in v1 (später denkbar wie beim Anime Tracker über Google Drive).

## 8. Lokal testen ohne Node/Python
ES-Module und Service Worker brauchen `http://localhost` (gilt als sicherer Kontext).

**Variante A – PowerShell (Standard):** `werkzeuge/server.ps1`, ca. 40 Zeilen, ohne Adminrechte:
```powershell
$l = [System.Net.HttpListener]::new(); $l.Prefixes.Add("http://localhost:8080/"); $l.Start()
$mime = @{ ".html"="text/html; charset=utf-8"; ".js"="text/javascript; charset=utf-8"; ".mjs"="text/javascript";
  ".css"="text/css"; ".json"="application/json"; ".webmanifest"="application/manifest+json";
  ".svg"="image/svg+xml"; ".png"="image/png" }
while ($l.IsListening) { $c = $l.GetContext(); $p = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath)
  if ($p.EndsWith("/")) { $p += "index.html" }   # + Pfad-Prüfung gegen "..", 404, Cache-Control: no-store
  ... }
```
Start: `pwsh -File werkzeuge\server.ps1` → `http://localhost:8080/` (Präfix `/kopfaus-spiele/` optional nachbilden, um Pages-Pfade zu testen). Wichtig: korrekter MIME-Typ für `.js`, sonst laden Module nicht.

**Variante B – Electron als Node:** `server.mjs` mit `node:http` + `node:fs`:
`$env:ELECTRON_RUN_AS_NODE=1; & "..\anime-tracker\node_modules\electron\dist\electron.exe" werkzeuge\server.mjs` (Pfad geprüft, vorhanden). Nur Fallback, da an das Nachbarprojekt gekoppelt.

**Tests:** `tests/index.html` lädt `mini-test.js` (`test(name, fn)`, `gleich`, `tief`, `wirft`, async-fähig) und alle `*.test.js`; Ergebnis als Liste grün/rot + Summe im Titel. Getestet werden: `logik.js` jedes Spiels (Regeln, Gewinn-Erkennung, Generator mit festem Seed → eindeutige Lösung), Zufall (Reproduzierbarkeit), Rückgängig-Verlauf, Migration, Speicher (mit Fake-Storage), Precache-Liste vollständig, „kein `vibrate`/`Audio` im Code“ (per `fetch` der Quelltexte). Optional headless: `msedge --headless --dump-dom http://localhost:8080/tests/` und Ergebniszeile prüfen.

## 9. Veröffentlichung
- Eigenes öffentliches Repo `jolinahamilton-dev/kopfaus-spiele`: `gh repo create kopfaus-spiele --public --source . --push`.
- GitHub Pages aus Branch `main`, Ordner `/` (kein Actions-Build nötig): `gh api repos/jolinahamilton-dev/kopfaus-spiele/pages -X POST -f "source[branch]=main" -f "source[path]=/"`. URL: `https://jolinahamilton-dev.github.io/kopfaus-spiele/`. `.nojekyll` anlegen.
- **Versionierung:** SemVer in `version.js`; jede Veröffentlichung = Version erhöhen (sonst kein SW-Update!) + Git-Tag `v1.2.0` + kurzer Eintrag in `CHANGELOG.md`. Wie beim Anime Tracker: lokal committen, Push/Tag nur auf ausdrücklichen Wunsch.
- Prüfliste vor Push: Tests grün, Precache-Liste aktuell, Version erhöht, offline getestet (DevTools → Offline).

## 10. Risiken / offene Fragen
- **Speicher-Löschung:** Browser kann Daten von nicht installierten Seiten löschen → `storage.persist()`, Installation empfehlen, Sicherung anbieten.
- **SW-Cache veraltet** bei vergessener Versionserhöhung → Prüfung in der Test-Seite (Hash der Dateiliste vs. Version) / Prüfliste.
- **Generator-Laufzeit** (Nonogramm/Sudoku eindeutig lösbar, Stau mit Mindestzügen) am Handy → Worker + Vorrat; ggf. vorgerechnete Rätselpakete als JSON.
- **Minesweeper „Unendlich“:** Speichergröße wächst → Chunks, nur aufgedeckte Bereiche speichern; ggf. IndexedDB.
- **Erster Zug Minesweeper** nie Mine, kein Raten nötig? (offen: „ohne Raten“-Generator als Option).
- **Drag & Drop am Handy** vs. Scrollen der Seite → Spielfläche nie scrollbar, `touch-action: none`.
- Offen: Name „Kopf aus“ final? Timer ganz weglassen oder nur in Statistik? Tägliches Rätsel (Seed = Datum) in v1 oder später? Sprache nur Deutsch (Annahme: ja).

## 11. Aufgabenliste
**M0 – Grundgerüst**
- [ ] Repo-Ordner, `index.html`, `css/basis.css` mit Variablen hell/dunkel
- [ ] `werkzeuge/server.ps1` (MIME, no-store, Pfadschutz) + Test mit Edge
- [ ] `tests/index.html` + `mini-test.js`
- [ ] `kern/router.js`, `app.js`, Startseite mit 6 Platzhalter-Kacheln
- [ ] `spiele/registry.js` mit Lazy-Import und Fehleranzeige bei kaputtem Modul

**M1 – Gemeinsame Module**
- [ ] `speicher.js` + Stand-Hülle + `migration.js` (mit Tests)
- [ ] `rueckgaengig.js`, `zufall.js` (sfc32, Tests auf Reproduzierbarkeit)
- [ ] `einstellungen.js` + Einstellungsseite (Theme, Timer, Palette, Muster, Animationen)
- [ ] `statistik.js` + Statistikseite
- [ ] `eingabe.js` (Tippen, Ziehen, Langdruck, Rasterfokus), `worker-helfer.js`
- [ ] `farben.js` mit Standard- und farbenblind-Palette + Symbol-Patterns

**M2 – Spielansicht**
- [ ] Kopfleiste, Tastenkürzel, Neu-Dialog mit Varianten
- [ ] Pause-Overlay inkl. Auto-Pause, Timer (nur aktive Zeit)
- [ ] Autospeichern (gedrosselt + `pagehide`), Fortsetzen-Anzeige auf Kacheln
- [ ] Gewonnen-Einblendung, `aria-live`
- [ ] Beispielspiel „Test-Raster“ zur Abnahme der Schnittstelle

**M3 – PWA**
- [ ] Manifest, Icons (SVG → PNG einmalig im Browser per Canvas exportieren)
- [ ] `sw.js` mit Precache, `version.js`, `precache-liste.ps1`
- [ ] Update-Band „Neue Version verfügbar“
- [ ] Offline-Test PC (installiert) und Android

**M4 – Spiele einbinden** (Details in eigenen Konzepten)
- [ ] Sudoku · [ ] Farben sortieren · [ ] Block-Puzzle · [ ] Stau auflösen · [ ] Minesweeper (+ Unendlich) · [ ] Nonogramm

**M5 – Feinschliff & Veröffentlichung**
- [ ] Sicherung Export/Import
- [ ] Barrierefreiheits-Durchgang (nur Tastatur, Kontrast, farbenblind-Ansicht)
- [ ] Handy hoch/quer, kleine Bildschirme (360 px)
- [ ] GitHub-Repo, Pages, `.nojekyll`, Tag `v1.0.0`
