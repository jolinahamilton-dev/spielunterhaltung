# Plan – Spielunterhaltung

Stand: 04.11.2026 · Status: **alle sechs Spiele fertig, Phase 0–7 erledigt**, Version 0.4.0 · nächster Schritt: Veröffentlichung (auf Wunsch)

Eine eigene, ruhige Spiele-App mit sechs Spielen: **Sudoku, Farben sortieren, Block-Puzzle, Stau auflösen, Minesweeper (mit Unendlich-Modus), Nonogramm**.
Vor allem für den **PC**, aber auch fürs **Handy** gut spielbar. Läuft **komplett offline**.

Die Details stehen in den Konzepten unter [`konzepte/`](konzepte/):

| Datei | Inhalt |
|---|---|
| [00-oberflaeche-und-grundgeruest.md](konzepte/00-oberflaeche-und-grundgeruest.md) | App-Shell, gemeinsame Module, Offline/PWA, Design, Tests, Veröffentlichung |
| [sudoku.md](konzepte/sudoku.md) | Generator mit eindeutiger Lösung, 4 Stufen, Notizen, erklärende Hinweise |
| [farben-sortieren.md](konzepte/farben-sortieren.md) | Gießregeln, A*-Löser, garantiert lösbare Level |
| [block-puzzle.md](konzepte/block-puzzle.md) | 8×8-Feld, Formen-Katalog, Punkte, Modus „Entspannt“ |
| [stau-aufloesen.md](konzepte/stau-aufloesen.md) | Schiebe-Rätsel, Modi Klassisch und Ausparken, exakte Mindestzugzahl |
| [minesweeper.md](konzepte/minesweeper.md) | Klassisch und „ohne Raten“, Unendlich-Modus mit Chunks |
| [nonogramm.md](konzepte/nonogramm.md) | Zeilen-Löser, Zufallsbilder und eigene Motive, Handy-Bedienung bis 20×20 |

---

## 1. Grundsätze (gelten für alle Spiele)

- **Still:** keine Töne, kein Klick-Feedback, keine Vibration. Ein Test prüft, dass `vibrate`/`Audio` nirgends im Code vorkommt.
- **Offline immer:** alle Dateien liegen im Service-Worker-Cache. Rätsel und Level werden im Browser erzeugt oder liegen als Datei bei, nichts kommt aus dem Netz.
- **Kein Frust:** keine Werbung, keine Leben, keine Energie, kein Zeitdruck. Rückgängig und automatisches Speichern nach jedem Zug. **Kein Timer**, keine Bestzeiten.
- **Garantiert lösbar:** Sudoku und Nonogramm haben immer genau eine Lösung, die ohne Raten erreichbar ist. Farben- und Stau-Level sind immer lösbar.
- **PC zuerst:** jedes Spiel ist vollständig mit Maus *und* nur mit Tastatur spielbar. Am Handy gibt es Touch mit Trefferflächen ≥ 44 px, hoch und quer.
- **Barrierearm:** Hell-/Dunkelmodus, farbenblind-freundliche Palette, Farben zusätzlich mit Mustern/Symbolen, Animationen abschaltbar.
- **Eigenes Design**, keine Nachahmung bekannter Markenspiele.

## 2. Technik (Festlegungen)

| Thema | Entscheidung |
|---|---|
| Sprache | Vanilla JavaScript (ES-Module), HTML, CSS, **kein Build-Schritt, keine npm-Pakete** (auf dem Rechner gibt es weder Node noch Python) |
| App-Form | **PWA**: am PC über Edge/Chrome „App installieren“ (eigenes Fenster, Startmenü), am Handy „Zum Startbildschirm“ |
| Hosting | eigenes Repo `jolinahamilton-dev/spielunterhaltung` (lokaler Ordner heißt noch `kopfaus-spiele`), GitHub Pages direkt aus `main` |
| Speicher | localStorage mit Versions-Hülle und Migration; IndexedDB nur, falls Minesweeper-Unendlich zu groß wird |
| Zufall | Seeded RNG (sfc32): gleiches Rätsel neu starten, wiederholbare Tests |
| Rechenarbeit | Generatoren und Löser im **Web Worker**, dazu ein Vorrat fertiger Rätsel, damit „Neu“ sofort geht |
| Lokal testen | `werkzeuge/server.ps1` (Windows PowerShell, HttpListener auf localhost:8080) · Offline-Prüfung mit `werkzeuge/offline-pruefung.cjs` (Electron aus dem Anime Tracker als unsichtbarer Chromium – das Claude-Browserfenster kann keine Service Worker, Edge/Chrome sind nicht installiert) |
| Tests | eigene Test-Seite `tests/index.html` mit kleinem Test-Runner im Browser |
| Darstellung | DOM/CSS-Grid für Sudoku, Nonogramm und Block-Puzzle · SVG für Farben sortieren und Stau · Canvas für Minesweeper (wegen Unendlich) |

**Beim Abgleich der Konzepte festgelegt** (gilt vor den Einzelkonzepten):
1. **Ordner = Spiel-ID:** `spiele/sudoku`, `spiele/farben-sortieren`, `spiele/block-puzzle`, `spiele/stau`, `spiele/minesweeper`, `spiele/nonogramm`.
2. **Jedes Spiel trennt** `logik.js` (ohne DOM, testbar, im Worker nutzbar) von `ansicht.js`. Dazu kommen `index.js` als Schnittstelle und ggf. `generator.worker.js`.
3. **Grenzen für Generatoren in Rechenschritten, nicht in Zeit.** Sonst ergibt derselbe Seed auf einem langsamen Handy ein anderes Rätsel. Zeitgrenzen sind nur als Notbremse im freien Spiel erlaubt.
4. **Das erzeugte Rätsel steckt im Spielstand**, nicht nur der Seed. Spätere Änderungen am Generator machen so keine laufenden Spiele kaputt.
5. **Rückgängig:** unbegrenzt in Sudoku, Nonogramm, Farben und Stau. Bewusste Ausnahmen: im Block-Puzzle „Klassisch“ 3× pro Spiel (unbegrenzt in „Entspannt“) und im Minesweeper nur „Fehlklick zurücknehmen“ im Modus Entspannt. Ein allgemeines Rückgängig würde dort das Spiel aushebeln.
6. **Minesweeper-Unendlich: Mindestdichte 15 %** statt der im Konzept genannten 10 %. Bei 10 % liegt der Anteil der Null-Felder knapp an der Schwelle, ab der Null-Flächen riesig werden. Bei 15 % bleiben sie sicher klein. Das Budget pro Frame bleibt trotzdem.

## 3. Spiel-Schnittstelle (Kurzfassung)

```js
// spiele/<id>/index.js
export default {
  id, name, beschreibung, symbol?, varianten?: [{ id, name }],
  standVersion?, migriere?(stand, von),
  erstelle(container, ctx, gespeicherterStand) → instanz
}
// instanz – Pflicht:   getStand(), rueckgaengig(), neustart(), zerstoere()
//         – optional:  hinweis(), onTaste(e) → bool, wiederholen(), kannRueckgaengig(),
//                      pausiere(), fortsetze(), neu(variante), zusammenfassung()
// ctx: speicher, einstellungen, statistik.melde(), zufall(seed), farben, eingabe,
//      worker(pfad), meldeAenderung(), meldeGewonnen(), variante, signal
```
Ausführlich in [00-oberflaeche-und-grundgeruest.md §4](konzepte/00-oberflaeche-und-grundgeruest.md).

## 4. Die Spiele auf einen Blick

| Spiel | Kern | Modi / Stufen | Größtes Risiko | Aufwand* |
|---|---|---|---|---|
| **Block-Puzzle** | Formen auf 8×8 ziehen, volle Reihen/Spalten verschwinden | Klassisch · Entspannt (endet nie, alle Formen legbar) | Ziehen am Handy (Form schwebt über dem Finger) | 4–6 T |
| **Sudoku** | Generator mit eindeutiger Lösung, Bewertung durch einen Löser mit menschlichen Techniken | Leicht · Mittel · Schwer · Experte; später 6×6, Killer | Experte braucht am Handy bis ~5 s → Vorrat und Ersatzdatei | 8–10 T |
| **Farben sortieren** | Umgießen, ganzer gleichfarbiger Block fließt; A*-Löser liefert Mindestzüge | Stufen nach Farben/Röhren, endlose Level, 1 Zusatzröhre als Hilfe | Löser stößt bei großen Leveln an die Grenze → „≤ X Züge“ | 7–8 T |
| **Stau auflösen** | Schiebe-Rätsel, exakte Mindestzugzahl über Rückwärts-Suche | Klassisch (Zielfahrzeug raus) · Ausparken (alle raus, ganz entspannt) | schwere Level selten → ggf. Level-Paket über eine Generator-Seite | 8–9 T |
| **Minesweeper** | Erster Klick immer auf einer Null, „ohne Raten“ optional; Unendlich über Seed+Koordinate in 16×16-Chunks | Anfänger · Fortgeschritten · Experte · eigene Größe · **Unendlich**; Entspannt/Hardcore | Leistung und Speicher bei riesigen aufgedeckten Flächen | 9–13 T |
| **Nonogramm** | Zeilen-Löser prüft, dass ohne Raten lösbar; Zufallsbilder + eigene Motive | 5×5 bis 20×20, eigene Motive; später Farb-Nonogramm | Touch-Bedienung bei 20×20, Aufwand für Motive | 9–11 T |
| **Grundgerüst** | Shell, Speicher, Eingabe, PWA, Design, Tests | – | Service-Worker-Updates, Löschung der Daten durch den Browser | ~7 T |

\* Grobe Schätzung in Personentagen, wie ein Mensch sie bräuchte. Zusammen **ca. 52–64 T**. Mit Claude geht das deutlich schneller, das Verhältnis zwischen den Spielen stimmt aber.

## 5. Reihenfolge und Meilensteine

Jedes Spiel wird erst **ohne Oberfläche** gebaut und getestet (`logik.js` + Test-Seite), dann spielbar gemacht, dann bekommt es Komfort-Funktionen.

### Phase 0 – Grundgerüst · Ziel: leere App läuft offline
- [x] Ordner, `index.html`, `css/basis.css` (Variablen hell/dunkel)
- [x] `werkzeuge/server.ps1` (Windows PowerShell 5.1, Skripte als UTF-8 mit BOM)
- [x] Test-Seite `tests/index.html` + `mini-test.js`
- [x] Router, Startseite mit 6 Kacheln, `spiele/registry.js` (Spiele erst bei Bedarf laden)
- [x] Gemeinsame Module: `speicher`, `migration`, `rueckgaengig`, `zufall`, `einstellungen`, `statistik`, `eingabe`, `worker-helfer`, `farben`
- [x] Spielansicht: Kopfleiste, Tastenkürzel, Neu-Dialog mit „Vorheriges fortsetzen“, Autospeichern (auch beim Ausblenden), „Gelöst“-Einblendung
- [x] Beispielspiel „Lichter (Test)“ (nur auf localhost oder mit `?dev` sichtbar) zum Abnehmen der Schnittstelle
- [x] PWA: Manifest, Icons, `sw.js`, `version.js`, Band „Neue Version verfügbar“
- [x] Offline-Test: Service Worker cacht alle Dateien, App + Spiel + Worker starten ohne Netz (geprüft in Chromium/Electron). Installation am echten PC/Handy erst nach Veröffentlichung

### Phase 1 – Block-Puzzle · erstes echtes Spiel
Einfachstes Spiel. Es testet gleich das Ziehen mit Maus und Finger, das viele Spiele brauchen. → [block-puzzle.md §10](konzepte/block-puzzle.md)
- [x] Logik ohne DOM (`logik.js`, `formen.js`): 13 Formgruppen, Bit-Masken, Punkte mit Serie und Leer-Bonus, fair gewichtetes Angebot mit Seed, Entspannt-Garantie (`legbar`, Suchbudget in Schritten), Hinweis, Rückgängig
- [x] Modi Klassisch (endet, 3× Rückgängig, Joker +1 je 1500 Punkte, max. 3) und Entspannt (endet nie, alles unbegrenzt)
- [x] Bedienung: Ziehen mit Maus/Finger (Form schwebt am Handy 1,5 Zellen über dem Finger), Antippen + Klick/Tippen aufs Feld, Tastatur 1–3 · Pfeile · Enter · Esc · J · H
- [x] Vorschau mit Hervorhebung der Linien, die verschwinden; ruhiges Ausblenden (abschaltbar); Symbole auf Farben
- [x] Spielende mit „Joker einsetzen“, „Letzten Zug zurück“, „Neues Spiel“; Rekord je Modus, auf der Kachel angezeigt
- [x] 15 Logik-Tests, geprüft am PC (hell) und Handybreite (dunkel)
- Bewusst weggelassen: Pause (kein Timer), Drehen der Formen, Top-10-Liste (nur ein Rekord je Modus)

### Phase 2–6 – die übrigen fünf Spiele ✅ (parallel von je einem Agent gebaut, Briefing: [konzepte/AGENT-BRIEFING.md](konzepte/AGENT-BRIEFING.md))
- [x] **Sudoku**: 4 Stufen, Generator mit eindeutiger Lösung + menschlichem Löser (Singles bis Swordfish/Coloring), Vorrat im Hintergrund + `vorrat.json`, Notizen/Auto-Notizen, Konflikte, erklärender Hinweis, Rückgängig/Wiederholen – 14 Tests
- [x] **Farben sortieren**: 5 Stufen mit fortlaufenden Leveln, A*-Löser (Mindestzüge), Hinweis = optimaler Zug inkl. Sackgassen-Erkennung, Zusatzröhre 1× je Level – 10 Tests
- [x] **Stau auflösen**: Leicht/Mittel/Schwer mit exakter Mindestzugzahl + entspannter Modus „Ausparken“, Ziehen/Klick/Tastatur, Hinweis – 14 Tests. Schwere Level brauchen beim ersten Mal bis ~9 s (danach vorab erzeugt)
- [x] **Minesweeper**: Anfänger/Fortgeschritten/Experte/Unendlich, erster Klick immer Null, „Ohne Raten“, Entspannt/Hardcore, Canvas, Unendlich mit Chunks (Dichte ≥ 15 %) – 23 Tests
- [x] **Nonogramm**: 27 eigene Motive + Zufall 5–20, Zeilen-Löser (ohne Raten eindeutig), Ziehen/Kreuze, Zoom + Cursor-Modus am Handy, erklärender Hinweis – 12 Tests

### Phase 7 – Feinschliff ✅
- [x] Sicherung speichern/laden (Info-Seite) mit strenger Prüfung + „Stand vor dem Laden zurückholen“ – 5 Tests
- [x] Content-Security-Policy ohne `unsafe-inline`, `no-referrer`; Testserver mit exaktem Pfadschutz, liefert keine versteckten Ordner
- [x] Robustheitstest: jedes Spiel mit ~100 manipulierten Spielständen (`tests/einzel.html?datei=kern/robustheit.test.js`, ca. 1 Min.)
- [x] Prüfung aller Spiele am PC (hell) und bei 360 px (dunkel): keine Konsolenfehler, kein waagerechtes Scrollen; alle sechs Spiele starten offline
- [ ] Gerätetests auf echtem Handy und mit echter Maus (erst nach Veröffentlichung möglich)

### 🚩 Version 1.0 – Veröffentlichung (wartet auf „Update“)
Neues GitHub-Repo, GitHub Pages, Installation am PC und Handy.

### Später (nicht in v1)
Sudoku 6×6 / Killer / Diagonal · Farb-Nonogramm · weitere Motive · Abgleich zwischen PC und Handy (wie beim Anime Tracker über Google Drive) · weitere Spiele (z. B. Solitär, 2048-artig)

## 6. Veröffentlichung

- Lokal committen. **Push und Tag nur auf ausdrücklichen Wunsch** (wie beim Anime Tracker).
- Jede Veröffentlichung erhöht die Version in `version.js`, sonst holt sich der Service Worker kein Update. Dazu ein Git-Tag `vX.Y.Z` und ein Eintrag in `CHANGELOG.md`.
- Prüfliste vor dem Push: Tests grün · Precache-Liste aktuell · Version erhöht · offline getestet.

## 7. Entscheidungen (04.11.2026)

- **Name:** „Spielunterhaltung“. Die Spiele heißen in der App vorerst schlicht Sudoku, Farben sortieren, Block-Puzzle, Stau auflösen, Minesweeper, Nonogramm.
- **Kein Timer**, auch nicht in der Statistik. Damit gibt es auch keine Pause-Ansicht und keine Bestzeiten. Die Einzelkonzepte erwähnen Timer und Pause noch, das gilt nicht mehr.
- **Keine Tagesrätsel.** Sie sind in den Einzelkonzepten noch beschrieben, werden aber nicht gebaut.

## 8. Lokal starten und prüfen

```powershell
# Testserver (läuft bis Strg+C)
powershell -NoProfile -ExecutionPolicy Bypass -File werkzeuge\server.ps1
# → App: http://localhost:8080/   Tests: http://localhost:8080/tests/

# Nach neuen/entfernten Dateien die Cache-Liste aktualisieren (bei Veröffentlichung mit -Version x.y.z)
powershell -NoProfile -ExecutionPolicy Bypass -File werkzeuge\precache-liste.ps1

# Tests + Service Worker + Offline-Start in unsichtbarem Chromium (Server muss laufen)
& "..\anime-tracker\node_modules\electron\dist\electron.exe" werkzeuge\offline-pruefung.cjs
```
Einzelne Seiten, Tests oder Screenshots im unsichtbaren Chromium (Optionen im Kopf der Datei):
```powershell
& .\werkzeuge\test-lauf.ps1 -Url "http://localhost:8080/tests/einzel.html?datei=kern/robustheit.test.js" -Zeit 300000
```
Auf localhost holt der Service Worker Dateien zuerst aus dem Netz, damit Änderungen sofort sichtbar sind. Den Cache nimmt er nur, wenn kein Netz da ist.

