# Briefing für Spiel-Agents (Spielunterhaltung)

Du baust **ein** Spiel der App „Spielunterhaltung“ (ruhige Spiele zum Abschalten, Web-App/PWA, offline).
Projektordner: das Repo-Wurzelverzeichnis (Git-Repo – **nicht committen**, das macht die Hauptsitzung).
Sprache in Code, Kommentaren und Oberfläche: **Deutsch**.

## Was du anfassen darfst
- **Nur** `spiele/<id>/…` (beliebige Dateien darin, auch `.json`-Daten) und `tests/spiele/<id>.test.js`.
- **Nicht** ändern: `kern/`, `css/`, `index.html`, `sw.js`, `version.js`, `spiele/registry.js`, `tests/index.html`, `plan.md`, Konzepte anderer Spiele, andere Spiele-Ordner.
  Brauchst du eine Änderung dort, beschreibe sie in deinem Abschlussbericht (die Hauptsitzung baut sie ein).
- Die Registry ist schon verdrahtet: `#/spiel/<id>` lädt `spiele/<id>/index.js`.

## Zuerst lesen
1. `plan.md` (Abschnitte 1–3 und 7 „Entscheidungen“)
2. dein Konzept `konzepte/<datei>.md` – setze es um, **mit diesen Abweichungen (gelten vorrangig):**
   - **kein Timer, keine Pause, keine Bestzeiten, keine Tagesrätsel/Tageslevel**
   - keine Töne, kein Klick-Feedback, keine Vibration (`vibrate`, `Audio`, `AudioContext`, `.play()` kommen nirgends vor – ein Test prüft das)
   - Generatoren/Löser begrenzen mit **Schritt-Budgets, nicht mit Zeit** (gleicher Seed → gleiches Ergebnis auf jedem Gerät). Zeit nur als Notbremse.
   - Das erzeugte Rätsel/Level steckt **komplett im Spielstand** (nicht nur der Seed).
   - Spielstand muss JSON-tauglich sein (kein `Infinity`, keine `Map`/`Set`, keine Typed Arrays ohne Umwandlung), `standVersion: 1`.
3. **Referenz-Umsetzung** zum Abschauen: `spiele/block-puzzle/` (`index.js`, `logik.js`, `stil.css`), Worker-Beispiel `spiele/test-raster/` (`generator.worker.js`, `index.js`), Tests `tests/spiele/block-puzzle.test.js`.
4. Kern-APIs: `kern/spielansicht.js` (baut `ctx`), `kern/eingabe.js`, `kern/dom.js`, `kern/zufall.js`, `kern/rueckgaengig.js`, `kern/farben.js`, `kern/worker-helfer.js`, `kern/worker-dienst.js`, `css/basis.css` (CSS-Variablen).

## Aufbau deines Spiels
- `spiele/<id>/logik.js` – **ohne DOM**, rein, testbar, auch im Worker nutzbar
- `spiele/<id>/index.js` – `export default { id, name, beschreibung, varianten?: [{id, name}], standVersion: 1, erstelle(container, ctx, gespeicherterStand) }`
- `spiele/<id>/stil.css` – per `ladeStil('spiele/<id>/stil.css')` aus `kern/dom.js`; Klassen mit eigenem Präfix (z. B. `sd-`, `fs-`, `st-`, `ms-`, `ng-`)
- optional `spiele/<id>/generator.worker.js` (Modul-Worker, importiert `../../kern/worker-dienst.js` → `bedieneAuftraege({...})`)
- Alle Dateien werden statisch ausgeliefert und offline gecacht – keine Abhängigkeiten von außen, keine Fonts aus dem Netz.

### ctx (von der Shell)
`variante` · `speicher` (`lies(k, std)`, `schreibe(k, v)`, `entferne(k)` – eigener Bereich des Spiels) ·
`einstellungen.wert('fehlerMarkieren'|'palette'|'muster'|'animationen'|'theme')`, `einstellungen.spiel.wert(k, std)` / `.setze(k, v)` (spieleigene Optionen) ·
`statistik.melde({ typ: 'hinweis' })` (gestartet/gelöst meldet die Shell selbst) · `zufall(seed, zustand?)` → `{ seed, zahl(), ganz(a,b), wahl(arr), mische(arr), zustand() }` · `neuerSeed()` ·
`farben` → `{ liste, anzahl, css(id) → 'var(--spielfarbe-id)', symbolPfad(id) (SVG-Pfad, viewBox 0 0 10 10, fill-rule evenodd), musterAn(), beobachte(fn) → abmelden }` ·
`eingabe` → `{ zeiger(el, {tippen, rechts, lang, signal}), ziehen(el, {start, bewege, ablegen, abbrechen, schwelle, signal}), erstelleRasterFokus({...}) }` ·
`signal` (AbortSignal – allen Listenern mitgeben) · `bewegungReduziert()` · `worker(pfadAbAppWurzel)` → `{ rufe(auftrag, daten) → Promise, beende() }` ·
`meldung(text)` (kurzer Hinweis oben) · `meldeAenderung()` (nach **jedem** Zug → Autospeichern) · `meldeGewonnen(text)` (Shell zeigt „Gelöst“ + Text, sperrt danach Rückgängig/Hinweis) · `neuesSpiel()`.

### Instanz (Rückgabe von erstelle)
Pflicht: `getStand()` (darf `null` liefern, solange noch erzeugt wird), `rueckgaengig()`, `neustart()` (gleiches Rätsel von vorn), `zerstoere()`.
Optional: `kannRueckgaengig()`, `wiederholen()` + `kannWiederholen()`, `hinweis()`, `neu(variante)` (darf async sein), `onTaste(e) → true` wenn verarbeitet, `zusammenfassung()` (kurzer Text für die Kachel, z. B. „Mittel · 34 Züge“).
Die Shell ruft `onTaste` **zuerst**; liefert es `false`, wertet die Shell Z/Strg+Z (rückgängig), Y/Strg+Y (wiederholen), N (neu), H (hinweis) aus. Diese Buchstaben also nur belegen, wenn nötig.
Die Shell speichert `getStand()` nach `meldeAenderung()` und beim Verlassen; ein ungültiger gespeicherter Stand muss sauber zu einem neuen Spiel führen (kein Absturz).

## Qualität
- PC zuerst: **komplett mit Maus und komplett nur mit Tastatur** spielbar (sichtbarer Fokus). Handy: Touch, Trefferflächen möglichst ≥ 40 px, Layout ab **360 px Breite** ohne waagerechtes Scrollen; Spielfläche `touch-action: none` wo gezogen/gemalt wird.
- Hell **und** dunkel (nur CSS-Variablen aus `css/basis.css` bzw. `ctx.farben` verwenden, keine festen Farben außer innerhalb von Spielsteinen).
- Farben nie als einzige Information: bei `ctx.farben.musterAn()` Symbole zeigen.
- Ruhig: Animationen kurz (≤ 250 ms), bei `ctx.bewegungReduziert()` aus.
- `aria-label`s an Spielelementen, `role="grid"` wo passend.
- Sicherheit: keine `eval`/`new Function`, kein `innerHTML` mit Daten aus dem Spielstand (Spielstand gilt als nicht vertrauenswürdig – Länge/Typen beim Laden prüfen).
- Rechenintensives (Generator/Löser > ~50 ms) in den Worker; währenddessen zeigt die Shell „Rätsel wird vorbereitet …“. Gern einen kleinen Vorrat fertiger Rätsel in `ctx.speicher` halten, damit „Neu“ sofort geht.

## Testen (Testserver läuft bereits auf http://localhost:8080)
Falls nicht: `powershell -NoProfile -ExecutionPolicy Bypass -File werkzeuge\server.ps1` im Hintergrund starten.
Unsichtbarer Chromium per PowerShell (im Projektordner, **direkt im PowerShell-Tool**, nicht über `powershell -File`):
```powershell
# Logik-Tests (deine Datei tests/spiele/<id>.test.js, Aufbau wie tests/spiele/block-puzzle.test.js)
& .\werkzeuge\test-lauf.ps1 -Url "http://localhost:8080/tests/einzel.html?datei=spiele/<id>.test.js"
# Spiel ansehen + bedienen + Screenshot (PNG mit dem Read-Tool anschauen)
& .\werkzeuge\test-lauf.ps1 -Url "http://localhost:8080/#/spiel/<id>" -Warte "document.querySelector('.xx-feld')" `
   -Js "document.querySelectorAll('.xx-zelle').length", "return document.title" -Bild "<scratchpad>\<id>-pc.png"
# Handy + dunkel
& .\werkzeuge\test-lauf.ps1 -Url "http://localhost:8080/#/spiel/<id>" -Breite 375 -Hoehe 812 -Dunkel -Bild "<scratchpad>\<id>-handy.png"
```
Jeder Lauf startet mit leerem Speicher. Mit `-Js` kannst du Klicks/Tasten/Pointer-Ereignisse auslösen (`new PointerEvent(...)`, `new KeyboardEvent('keydown', {key, bubbles:true, cancelable:true})` an `document.activeElement` oder `document`).
Ausgabezeilen `KONSOLE-ERROR`/`HAUPTPROZESS-FEHLER` sind Fehler, die du beheben musst. Prüfe: PC hell, Handy dunkel, Symbole an (`localStorage.setItem('spielunterhaltung:v1:einstellungen', JSON.stringify({muster:true}))` + Neuladen), Gewinnen (z. B. per Hinweis-Schleife oder Löser), Rückgängig, Neu-Dialog (Taste N), Spielstand nach Neuladen wieder da.
Das Browser-Fenster der Hauptsitzung bitte **nicht** benutzen.

## Abschlussbericht (deine letzte Antwort, max. ~25 Zeilen)
Angelegte Dateien · was umgesetzt ist · was bewusst weggelassen/vereinfacht wurde · Testergebnis (Anzahl) · Screenshots geprüft (welche) · bekannte Probleme · **gewünschte Änderungen außerhalb deines Ordners** (konkret, mit Datei).
