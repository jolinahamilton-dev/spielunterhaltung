# Konzept: Nonogramm (`spiele/nonogramm/`)

Bilderrätsel mit Zahlenhinweisen. Ruhig, ohne Leben, ohne Töne/Vibration, Timer ausblendbar.
Status: Planung. Kein Produktivcode, nur Pseudocode.

## 1. Spielidee & Regeln
- Rechteckiges Gitter (5×5 bis 20×20). Zu jeder Zeile (links) und Spalte (oben) steht eine Zahlenfolge, z. B. `3 1 2`.
- Jede Zahl ist ein Block zusammenhängend gefüllter Zellen in genau dieser Reihenfolge; zwischen Blöcken mindestens eine leere Zelle. `0` = Zeile leer.
- Ziel: alle Zellen korrekt füllen → es entsteht ein Bild bzw. Muster.
- Jedes Rätsel ist **eindeutig und ohne Raten** allein durch Zeilen-/Spaltenlogik lösbar (Generator-Garantie).
- Gewonnen, sobald alle Hinweise erfüllt sind (Kreuze egal) → `ctx.meldeGewonnen()`, dann wird das Bild ohne Gitterlinien gezeigt (bei Motiven mit Titel).

## 2. Bedienung
### PC – Maus
- Linksklick: Zelle füllen / Füllung entfernen. Rechtsklick: Kreuz setzen / entfernen (Kontextmenü unterdrückt).
- **Ziehen**: Mit gedrückter Taste über Zellen fahren. Die Aktion der ersten Zelle bestimmt den Modus für den ganzen Zug (füllen, kreuzen oder leeren) – bereits passende Zellen bleiben unverändert. Zug wird auf eine Achse (Zeile oder Spalte) gesperrt, sobald er sich 1 Zelle bewegt hat.
- Ein ganzer Zug = **ein** Rückgängig-Eintrag.
- Mittelklick oder Umschalt+Klick: Zelle leeren.
- Klick auf Zahlenhinweis: einzelne Zahl manuell abhaken/ausgrauen (zusätzlich zur Automatik).

### PC – Tastatur (komplett)
| Taste | Wirkung |
|---|---|
| Pfeiltasten / WASD | Cursor bewegen |
| Strg + Pfeil | an den Rand bzw. zur nächsten unbestimmten Zelle springen |
| Leertaste / F | füllen umschalten |
| X / C | Kreuz umschalten |
| Entf / Rücktaste | Zelle leeren |
| Umschalt + Pfeil (gehalten mit Leertaste/X) | Ziehen per Tastatur: Aktion wird beim Bewegen fortgesetzt |
| M | Werkzeug wechseln (Füllen ↔ Kreuz) für Klick/Touch |
| Strg+Z / Z | Rückgängig |
| Strg+Y / Strg+Umschalt+Z | Wiederholen |
| H | Hinweis |
| L | Zeilen-/Spaltenhilfe der Cursorzeile ein/aus |
| + / − / 0 | Zoom rein / raus / Einpassen |
| P / Esc | Pause |
| T | Timer ein-/ausblenden |

### Handy – Touch
- Werkzeugleiste unten: **Füllen | Kreuz | Leeren**, Rückgängig, Hinweis. Aktives Werkzeug deutlich markiert.
- Tippen = Werkzeug anwenden. **Ziehen mit einem Finger** füllt mehrere Zellen (gleiche Regeln wie Maus, Achsensperre).
- **Zwei Finger** = Zoomen/Verschieben (Pinch/Pan), nie Malen. Erkennung: zweiter Finger innerhalb 80 ms → Geste, laufender Zug wird verworfen.
- Ab 15×15 optional **Cursor-Modus**: Fadenkreuz + großer Aktionsknopf, damit kleine Zellen präzise treffbar sind.
- Langes Drücken (400 ms) auf Zelle = Kreuz (Abkürzung ohne Werkzeugwechsel), abschaltbar.
- `touch-action: none` auf dem Gitter, damit die Seite nicht scrollt.

## 3. Modi & Schwierigkeitsstufen
| Größe | Einordnung |
|---|---|
| 5×5 | Einstieg, < 2 Min. |
| 10×10 | Standard |
| 15×15 | Mittel-lang |
| 20×20 | Lang (Handy: Zoom/Cursor-Modus) |
Zusätzlich 10×15 / 15×20 (Hochformat für Handy) möglich.
- Schwierigkeit innerhalb einer Größe über **Füllgrad** und **Löser-Tiefe** (Anzahl Durchläufe, Anteil Zellen, die erst durch Überlappungs-Kombination entstehen): Leicht / Normal / Knifflig.
- **Freies Spiel**: zufällige Muster (Generator) – Größe + Stufe wählen.
- **Motive**: mitgelieferte, selbst entworfene Bilder (Datei), in Sammlungen („Natur“, „Alltag“ …), Fortschritt je Motiv.
- **Tagesrätsel**: Seed = `"nono-" + JJJJ-MM-TT`; wählt deterministisch ein Motiv aus der Datei (falls vorhanden) oder erzeugt ein 10×10/15×15-Muster.
- **Später**: Farb-Nonogramm (Hinweise mit Farbe, Blöcke verschiedener Farbe ohne Pflichtlücke), Dreieck-/Mosaik-Varianten.

## 4. Erzeugung
### 4.1 Problem
Zufällige Gitter sind häufig **mehrdeutig** (z. B. 2×2-Schachbrett-Muster) oder nur mit Raten lösbar. Daher prüft ein **Line-Solver** jedes Rätsel.

### 4.2 Line-Solver (Kernstück, auch für Hinweise)
Zelle: `UNBEKANNT | VOLL | LEER`. Für eine Zeile mit Hinweis `[b1..bk]` und aktuellem Teilwissen werden alle gültigen Platzierungen betrachtet; Zellen, die in **allen** Platzierungen gleich sind, werden festgelegt.
- Effizient per DP (links→rechts „passt Präfix“, rechts→links „passt Suffix“), O(n·k) je Zeile, statt Aufzählen.
```
loeseLogisch(raetsel):
  warteschlange = alle Zeilen + Spalten
  solange warteschlange nicht leer:
    linie = nimm(); neu = lineSolve(linie, hinweis, wissen)
    wenn Widerspruch: return {status:'widerspruch'}
    für jede neu festgelegte Zelle: andere Linie dieser Zelle einreihen
  return {status: alleBekannt ? 'geloest' : 'steckt', wissen, durchlaeufe}
```
Nur Linien-Logik (keine Verzweigung) = „ohne Raten“. Eindeutigkeit folgt automatisch: Wenn reine Logik vollständig löst, gibt es genau eine Lösung.

### 4.3 Variante A – Zufallsgitter + Reparatur
```
erzeuge(breite, hoehe, stufe, rng):
  bild = Rauschen(rng, fuellgrad 0,5–0,65) → 1–2× glätten (Mehrheitsfilter), damit Formen statt Pixelsalat
  wiederhole bis 200×:
    r = loeseLogisch(hinweise(bild))
    wenn r.status=='geloest': bewerte → wenn Stufe passt: return
    sonst: wähle eine Zelle aus dem unbestimmten Bereich (bevorzugt Rand eines Unbestimmt-Clusters),
           kippe sie (VOLL↔LEER) → neue Hinweise
  Neustart mit neuem Rauschen (rng läuft weiter → deterministisch)
```
- Höherer Füllgrad → leichter (große Blöcke). Kippen im Unbestimmt-Bereich bricht Mehrdeutigkeiten meist in 1–10 Schritten.
- Laufzeit (Schätzung): 10×10 < 20 ms, 15×15 ~ 50–200 ms, 20×20 ~ 0,2–2 s → im Web Worker (`ctx.worker('spiele/nonogramm/generator.worker.js')`).
- Vorteil: unbegrenzt viele Rätsel, offline, seed-reproduzierbar. Nachteil: Bilder sind abstrakte Muster, keine „Aha“-Motive.

### 4.4 Variante B – mitgelieferte Motive
- Datei `spiele/nonogramm/motive.json`: `{ id, titel, sammlung, b, h, zeilen: ["..##..", ...] }` – selbst gezeichnet (eigener kleiner Editor als Entwicklerseite, nicht Teil der App-UI).
- Beim Build-freien Workflow: Entwicklerseite `werkzeuge/motiv-pruefer.html` läuft den Line-Solver über alle Motive und markiert mehrdeutige → Motiv von Hand nachbessern.
- Vorteil: schöne, erkennbare Bilder, Belohnungsgefühl. Nachteil: Handarbeit, begrenzte Anzahl (Ziel: 60–100 zum Start).

### 4.5 Empfehlung
**Beides**, mit klaren Rollen: Motive (B) als Herzstück und fürs Tagesrätsel; Generator (A) für unbegrenztes freies Spiel. Gemeinsamer Line-Solver prüft beide. Start mit A (kein Content-Aufwand), Motive wachsen schrittweise.
Seeds: `ctx.zufall(seed)`; freies Spiel `seed = "nono-<b>x<h>-<stufe>-<zufallszahl>"`, wird im Stand gespeichert → „Rätsel neu starten“ und Teilen per Seed möglich.

## 5. Funktionen
- **Kreuz-Markierung**: Zellen als sicher leer markieren (gleichwertiges Werkzeug).
- **Erledigte Zahlen ausgrauen**: Pro Linie wird die Belegung analysiert: Ist die Linie vollständig korrekt nach Hinweis → alle Zahlen grau. Teilweise: Blöcke, die eindeutig einer Zahl zuordenbar sind (vom Rand her abgeschlossene Blöcke mit Kreuz/Rand davor und danach), werden einzeln ausgegraut. Keine Lösungs-Spoiler (Abgleich nur mit Hinweisen, nicht mit Lösung).
- **Zeilen-/Spaltenhilfe**: Cursor-Zeile/-Spalte hervorgehoben, Hinweis-Zahlen groß; beim Ziehen Live-Zähler „4“ neben dem Finger (Länge des aktuellen Zuges).
- **Fehler anzeigen** (optional, Standard aus): gefüllte Zelle, die in der Lösung leer ist, wird markiert. Zusätzlich immer: Linie mit **Widerspruch zu ihrem Hinweis** (z. B. zu viele gefüllte) → Zahlen in Warnfarbe.
- **Hinweis** (`hinweis()`): Line-Solver auf aktuellem Stand (Kreuze als LEER, Füllungen als VOLL) – zuerst Fehler prüfen gegen Lösung; sonst Linie mit dem einfachsten Fortschritt wählen:
  1. „Schau dir Zeile 7 an.“
  2. Erklärung: „Der Block 6 in 10 Feldern überlappt in der Mitte: Zellen 5–6 müssen voll sein.“ (Muster: Überlappung, Rand-Anschluss, Lücke zu klein, Zeile vollständig → Rest leer)
  3. Ausführen als Rückgängig-Eintrag.
- **Pause**: Gitter verdeckt; Auto-Pause bei `visibilitychange`.
- **Statistik**: `ctx.statistik.melde({ typ:'gewonnen', groesse, stufe, motivId?, sekunden, hinweise })`.

## 6. Datenmodell & Spielstand
```
stand = {
  version: 1,
  quelle: 'generator' | 'motiv' | 'tag', seed?, motivId?, datum?,
  b, h, stufe,
  loesung: String(b*h)  ('1'/'0'),          // bei Motiv: aus Datei, trotzdem gespeichert
  hinweise: { zeilen: [[..]], spalten: [[..]] },
  zellen:  String(b*h)  ('.' leer, '#' voll, 'x' Kreuz),
  abgehakt: { z: {...}, s: {...} },         // manuell ausgegraute Zahlen
  werkzeug, zoom, scroll,
  sekunden, hinweiseGenutzt,
  verlauf: [...], zukunft: [...]
}
```
- Rückgängig-Eintrag = ein Zug: `{ zellen: [[index, alt, neu], ...] }` – ein Ziehen über 20 Zellen ist ein Eintrag.
- Unbegrenzt; Größe unkritisch (20×20 = 400 Zellen). Bei sehr vielen Einträgen Kompaktierung wie beim Sudoku.
- Speichern automatisch nach jedem Zug (gedrosselt 500 ms) und bei `pagehide`. `neustart()` leert `zellen` + Verlauf.

## 7. Darstellung
- **Entscheidung: DOM + CSS-Grid** für das Spielfeld (max. 400 Zellen + ~80 Hinweisfelder – für den Browser unkritisch), Hinweise als eigene Grid-Bereiche (oben/links, `position: sticky`, bleiben beim Verschieben sichtbar).
  - Vorteile: scharfe Darstellung, ARIA, Fokus, CSS-Themen über `ctx.farben`, einfache Trefferbestimmung.
  - Treffer beim Ziehen per `pointermove` + Rechnung aus Koordinaten (nicht `elementFromPoint` je Event) – schnell und robust.
  - Canvas wäre erst bei > 30×30 oder Farbvarianten mit Animation nötig → nicht geplant.
- Zellgröße: `min(Bildschirm / (Spalten + Hinweisbreite), 40 px)`. 5er-Hilfslinien (dickere Linie alle 5 Zellen).
- **Handy 20×20**: 20 Zellen + Hinweise auf 360 px → ca. 13 px/Zelle – lesbar, aber schwer zu treffen. Lösung:
  - Zoom 1×–3× per Pinch/Knöpfe (`transform: scale` auf Spielfläche, Hinweisleisten skalieren mit und bleiben sticky).
  - Cursor-Modus (siehe 2) und Ziehen mit Achsensperre.
  - Querformat-Empfehlung ab 15×15 (dezenter Hinweis, kein Zwang).
- Kreuze als dünnes „×“ in gedämpfter Farbe; gefüllte Zellen vollflächig. Gewonnen: Gitterlinien ausblenden, Bild zeigen (kurze Überblendung, bei reduced motion ohne).
- Keine Töne, keine Vibration.

## 8. Tests
Browser-Testseite `tests/nonogramm.test.html` (ohne npm), Kernlogik DOM-frei, optional `node --test`.
- **Line-Solver**: Tabellen-Tests je Linie (Hinweis, Teilwissen → erwartetes Ergebnis), u. a. Überlappung, leere Zeile `[0]`, volle Zeile, Widerspruch erkannt.
- **Vergleich mit Brute-Force**: für Linien bis Länge 12 alle Teilwissen-Kombinationen zufällig → DP-Ergebnis == Aufzählungs-Ergebnis.
- **Generator**: 200 Seeds je Größe → `loeseLogisch == 'geloest'` und Ergebnis == Lösung; zusätzlich Backtracking-Zähler (Limit 2) bestätigt Eindeutigkeit für 5×5/10×10.
- **Determinismus**: gleicher Seed → gleiches Rätsel.
- **Motive**: alle Einträge in `motive.json` logisch lösbar, Maße korrekt, Titel vorhanden.
- **Ausgrauen**: Fälle, in denen Zuordnung eindeutig/nicht eindeutig ist.
- **Spielstand/Rückgängig**: Ziehen = 1 Eintrag; Speichern → Laden identisch.
- **Laufzeit**: 20×20-Generator Median/Max auf Handy messen.

## 9. Aufwand & Risiken
| Paket | Aufwand |
|---|---|
| Line-Solver (DP) + Propagation + Tests | 1,5 Tage |
| Generator (Rauschen, Reparatur, Stufen) + Worker | 1,5 Tage |
| UI-Gitter, Hinweisleisten, Maus/Tastatur | 2 Tage |
| Touch: Ziehen, Pinch-Zoom, Cursor-Modus | 1,5–2 Tage |
| Ausgrauen, Hinweis mit Erklärung, Fehler | 1–1,5 Tage |
| Spielstand, Rückgängig, Tagesrätsel | 0,5–1 Tag |
| Motiv-Prüfer + erste 30 Motive | 1,5–2 Tage |
| **Summe** | **ca. 9–11 Personentage** |

Risiken:
- Touch auf 20×20 (Treffgenauigkeit, Konflikt Malen ↔ Zoomen) – größtes UX-Risiko → früh auf echtem Handy testen, Cursor-Modus als Rückfallebene.
- Generator-Muster wirken „rauschig“ → Glättung, Symmetrie-Option, Motive als Hauptinhalt.
- 20×20-Reparaturschleife konvergiert selten nicht → Neustart-Limit, Fallback auf Motiv.
- Teil-Ausgrauen kann falsch zuordnen → nur bei eindeutiger Zuordnung ausgrauen, sonst nur bei kompletter Linie.
- Motiv-Erstellung kostet Zeit → schrittweise ausliefern.

## 10. Aufgabenliste
### M1 – Kern (ohne UI)
- [ ] Datenmodell, Hinweis-Berechnung aus Bild
- [ ] Line-Solver (DP) mit Widerspruchserkennung
- [ ] Propagation `loeseLogisch`
- [ ] Brute-Force-Vergleichstests

### M2 – Generator
- [ ] Rauschen + Glättung mit Seed
- [ ] Reparaturschleife bis logisch lösbar
- [ ] Stufenbewertung (Füllgrad, Durchläufe)
- [ ] Web Worker, Vorrat je Größe, Laufzeittests

### M3 – Spielbar am PC
- [ ] Modul `index.js` gemäß Schnittstelle
- [ ] CSS-Grid-Feld + sticky Hinweisleisten, 5er-Linien
- [ ] Maus: Klick, Rechtsklick, Ziehen mit Achsensperre
- [ ] Tastatur komplett (`onTaste`)
- [ ] Gewinnprüfung, Bildanzeige, Statistik

### M4 – Handy
- [ ] Werkzeugleiste, Ziehen per Finger
- [ ] Pinch-Zoom/Pan, Gestenerkennung
- [ ] Cursor-Modus ab 15×15
- [ ] Test auf echten Geräten (klein/groß)

### M5 – Komfort
- [ ] Kreuze, automatisches + manuelles Ausgrauen
- [ ] Zeilen-/Spaltenhilfe, Live-Längenzähler
- [ ] Fehler optional, Widerspruchsanzeige
- [ ] Hinweis dreistufig mit Erklärung
- [ ] Unbegrenztes Rückgängig, Autospeichern, Pause, Timer ausblendbar

### M6 – Motive & Tagesrätsel
- [ ] `motive.json`-Format + Motiv-Prüfer-Seite
- [ ] Erste 30 eigene Motive, Sammlungsansicht
- [ ] Tagesrätsel per Datum-Seed

### Später
- [ ] Farb-Nonogramm (eigener Line-Solver für Farben)
- [ ] Weitere Motivsammlungen
