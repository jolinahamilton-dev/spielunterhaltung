# Konzept: Stau auflösen (`spiele/stau/`)

Ruhiges Schiebe-Rätsel auf einem Raster. Kein Ton, keine Vibration, kein Zeitdruck, unbegrenztes Rückgängig.
Status: Planung. Kein Produktivcode, nur Pseudocode.

## 0. Entscheidung: welche Variante?
| | **Klassisch „Stau“** (ein Fahrzeug zum Ausgang) | **„Ausparken“** (alle fahren in Pfeilrichtung raus) |
|---|---|---|
| Denkanteil | echtes Rätsel, Vorausplanen | sehr gering, fast meditativ |
| Fehler möglich? | nein (nur Umwege) | nein, wenn Blockierte zurückfedern (s. u.) |
| „bestmöglich: X Züge“ | sinnvoll (BFS-Optimum) | trivial (= Anzahl Fahrzeuge) |
| Hinweis | nächster optimaler Zug | „dieses Fahrzeug ist frei“ |
| Generator | Zustands-BFS, etwas aufwendiger | konstruktiv, sehr einfach |

**Entscheidung: beide als Modi, Klassisch ist der Hauptmodus.** Klassisch trägt das Spiel langfristig (Schwierigkeit über Mindestzüge skalierbar, Hinweis/Optimum sinnvoll). „Ausparken“ ist der echte „Kopf aus“-Modus für müde Abende, teilt Raster, Fahrzeuge, Darstellung und Speichern und kostet daher wenig extra (eigener Meilenstein nach Klassisch).

## 1. Spielidee & Regeln
### Klassisch
- Raster `B × H` (Standard 6 × 6). Fahrzeuge der Länge 2 (Auto) oder 3 (Laster), waagerecht oder senkrecht; optional feste Blöcke (Poller), die sich nie bewegen.
- Ein **Zielfahrzeug** (Länge 2, waagerecht, eigene Farbe + Stern-Symbol) steht in der Ausgangszeile; der Ausgang ist eine Lücke im rechten Rand dieser Zeile.
- Fahrzeuge bewegen sich nur in ihrer Längsrichtung, beliebig weit über freie Felder, nie durcheinander hindurch, nie aus dem Raster (Ausnahme: Zielfahrzeug durch den Ausgang).
- **Zug** = ein Fahrzeug um beliebig viele Felder in eine Richtung verschieben (zählt 1, unabhängig von der Strecke). Aufeinanderfolgende Schritte desselben Fahrzeugs (z. B. per Pfeiltaste) werden zu einem Zug zusammengefasst, solange kein anderes Fahrzeug bewegt wird; Hin und zurück auf die Ausgangsposition = 0 Züge.
- **Ziel**: Zielfahrzeug erreicht den Rand am Ausgang → fährt ruhig hinaus → `ctx.meldeGewonnen()`.
- Sonderfall: Ein waagerechtes Fahrzeug rechts vom Zielfahrzeug in der Ausgangszeile macht das Level unlösbar → Generator schließt das aus.

### Ausparken
- Gleiches Raster, jedes Fahrzeug trägt einen Pfeil (vorwärts oder rückwärts entlang seiner Achse).
- Antippen → Fahrzeug fährt in Pfeilrichtung. Ist der Weg bis zum Rand frei, verlässt es das Feld. Ist er blockiert, fährt es bis kurz vor das Hindernis und **federt auf seine Startposition zurück** (Zustand unverändert, Blockierer kurz markiert).
- Begründung für das Zurückfedern: Bliebe das Fahrzeug vorne stehen, könnte es die Bahn eines anderen blockieren und gegenseitige Blockaden (Sackgassen) erzeugen. Mit Zurückfedern ist jede Reihenfolge fehlerfrei: Rausfahren macht nur Platz.
- Ziel: Parkplatz leer. Zähler: „Ausgeparkt 7/12“, Anstoßer werden nur still gezählt.

## 2. Bedienung
### PC – Maus
- **Ziehen** (Standard): Fahrzeug greifen, entlang seiner Achse ziehen; es folgt der Maus, bleibt an Hindernissen stehen, rastet beim Loslassen auf das nächste Feld ein.
- **Klick-Klick**: Fahrzeug anklicken (Rahmen), dann freies Feld in seiner Linie anklicken → fährt dorthin, wenn der Weg frei ist (sonst bis zum Hindernis). Mögliche Zielfelder werden dezent markiert (abschaltbar).
- Ausparken: einfacher Klick auf das Fahrzeug.

### PC – Tastatur
| Taste | Wirkung |
|---|---|
| Tab / Umschalt+Tab | nächstes / voriges Fahrzeug (Reihenfolge: zeilenweise links oben → rechts unten) |
| Z (bzw. Pos1) | Zielfahrzeug auswählen |
| Pfeile | gewähltes Fahrzeug 1 Feld in Pfeilrichtung (nur entlang seiner Achse, sonst nichts) |
| Umschalt + Pfeil | bis zum Anschlag |
| Enter / Leertaste | Ausparken: gewähltes Fahrzeug losfahren lassen |
| Strg+Z / Rücktaste | Rückgängig |
| H | Hinweis (wählt das Fahrzeug gleich aus) |
| N | Neustart (selbst rückgängig machbar) |
| Esc | Auswahl aufheben |

### Handy – Touch
- Ziehen mit dem Finger wie mit der Maus; **Wischen** (schnelle Geste auf einem Fahrzeug) = bis zum Anschlag in Wischrichtung.
- Ausparken: Antippen.
- Raster füllt die Breite (Feld ≥ 44 px bei 6 × 6 auf 360 px Breite knapp → Rand minimal, bei 8 × 8 Zoom auf Querformat empfehlen). `touch-action: none` auf dem Spielfeld, damit die Seite nicht scrollt.

## 3. Modi & Schwierigkeit
### Klassisch
| Stufe | Raster | Fahrzeuge | Mindestzüge |
|---|---|---|---|
| Sanft | 5 × 5 | 4–6 | 3–6 |
| Leicht | 6 × 6 | 7–9 | 7–12 |
| Mittel | 6 × 6 | 9–12 | 13–20 |
| Schwer | 6 × 6 | 11–14 | 21–32 |
| Knifflig | 7 × 7 (+ Poller) | 12–18 | 25+ |

- Schwierigkeit = **minimale Zugzahl** (BFS) als Hauptmaß, Nebenmaß: Anzahl unterschiedlicher Fahrzeuge im Optimalweg.
### Ausparken
- Stufen über Rastergröße (5 × 5 bis 9 × 9), Dichte (Anteil belegter Felder 55–80 %) und **Abhängigkeitstiefe** (längste Kette „A muss vor B raus“).
### Fortschritt (beide Modi getrennt)
- **Endlos** (Standard): fortlaufende Level-Nummern, Seed = `hash("stau-v1-" + modus + "-" + n)`, Stufe aus sanfter Kurve mit regelmäßigen „Durchatmen“-Leveln. Gespeichert wird nur die Nummer.
- **Freies Spiel**: Stufe wählen, zufälliger Seed.
- **Tageslevel**: Seed = `"stau-tag-" + JJJJ-MM-TT`, je Modus eins, Stufe Mittel.

## 4. Erzeugung mit Lösbarkeitsgarantie
Im Web Worker (`ctx.worker('spiele/stau/worker.js')`, Modul-Worker teilt `logik.js` mit der Oberfläche), Zufall nur über `ctx.zufall(seed)`, Budgets in Knoten statt Zeit (Determinismus über Geräte).

### 4.1 Klassisch: Cluster-BFS („schwerstes Startfeld eines Clusters“)
1. Zufällige Belegung: Zielfahrzeug in Ausgangszeile, dann zufällige Fahrzeuge (Länge, Ausrichtung, Position) ohne Überlappung, bis Ziel-Fahrzeuganzahl erreicht; keine waagerechten Fahrzeuge rechts vom Ziel in der Ausgangszeile.
2. **BFS über alle erreichbaren Zustände** dieser Belegung (der „Cluster“). Zustand = Positionsvektor (pro Fahrzeug nur ein Wert: Spalte bzw. Zeile, da Achse fest) → `Uint8Array`, Schlüssel als String.
3. Enthält der Cluster keinen Zielzustand → verwerfen.
4. **Mehrquellen-BFS rückwärts** von allen Zielzuständen (Züge sind umkehrbar!) → Abstand jedes Zustands zum Ziel = exakte Mindestzugzahl.
5. Startzustand = Zustand mit Abstand im Zielbereich der Stufe (bei Schwer: maximaler Abstand). Lösbarkeit + Optimum sind damit garantiert.
6. Aufräumen (optional): Fahrzeuge entfernen, deren Wegfall die Mindestzugzahl nicht ändert → klarere Level.

```
funktion erzeuge(seed, stufe):
  für versuch = 0 .. MAX:
    z0 = zufallsBelegung(zufall(seed, versuch), stufe)
    cluster = bfsAlle(z0, BUDGET)            // Map zustand → nachbarn
    wenn cluster == ZU_GROSS: weiter
    ziele = cluster.filter(zielfahrzeugAmAusgang)
    wenn ziele leer: weiter
    abstand = bfsMehrquellen(ziele)          // exakt, da Züge umkehrbar
    kandidaten = zustände mit abstand ∈ stufe.bereich
    wenn kandidaten: return { start: wähle(kandidaten), optimum: abstand[start] }
```
- **Zustandsraum**: Nachbarn je Zustand ≈ Σ freie Strecken (typ. 5–20). 6 × 6-Cluster haben meist 10²–10⁵ Zustände (ms bis ~0,5 s); Budget 500 000 Zustände. Speicher: Schlüssel ~12 Byte + Map-Overhead → < 50 MB im Worst Case, typ. wenige MB.
- Schwer/Knifflig brauchen mehr Versuche (hohe Mindestzüge sind selten): Erfahrung erwartet 50–500 Versuche → 1–5 s. Deshalb nächstes Level **im Hintergrund vorab erzeugen**.

### 4.2 Ausparken: konstruktiv
- Fahrzeuge nacheinander einsetzen; ein neues Fahrzeug darf nur so stehen, dass seine Bahn in Pfeilrichtung **zum Zeitpunkt des Einsetzens frei** ist. Dann ist die umgekehrte Einsetz-Reihenfolge eine gültige Lösung (das zuletzt eingesetzte hat freie Bahn trotz aller anderen usw.) → Lösbarkeit per Konstruktion.
- Prüfung zusätzlich: Abhängigkeitsgraph (A blockiert B, wenn A auf B's Bahn liegt) ist kreisfrei; längster Pfad = Abhängigkeitstiefe = Schwierigkeit. Laufzeit: Millisekunden.

### 4.3 Laufzeit oder Level-Datei?
**Empfehlung: zur Laufzeit erzeugen** (Endlos-Level, kein Node/Python, Worker + Vorab-Erzeugung verdeckt die Wartezeit). Falls Knifflig-Level auf schwachen Handys > 5 s brauchen: optionale Generator-Seite im Browser (`werkzeuge/stau-generator.html`) erzeugt ein Paket `level/stau-knifflig.json` (z. B. 500 Level mit Optimum), das in der App ausgeliefert wird. Das komplette Level wird immer im Spielstand gespeichert → Generator-Änderungen (`v2`) brechen nichts.

## 5. Funktionen
- **Rückgängig** unbegrenzt (Verlauf `[fahrzeug, von, nach]`), Wiederholen optional.
- **Neustart** als eigener Verlaufseintrag → direkt danach rückgängig machbar.
- **Hinweis**: Klassisch – BFS vom aktuellen Zustand (Cluster ist meist gecacht, sonst neu; wenige ms) → nächster Zug des Optimalwegs, Fahrzeug + Zielposition als Schatten. Ausparken – ein gerade freies Fahrzeug wird markiert.
- **Zugzähler**: „Züge: 17 · bestmöglich: 14“ (Klassisch); „Ausgeparkt 7/12“ (Ausparken).
- **Sterne (optional, abschaltbar)**: 3 = Optimum, 2 = ≤ Optimum + 50 %, sonst 1; Hinweise nur vermerkt.
- **Statistik**: `ctx.statistik.melde({typ:'gewonnen', modus, level, zuege, optimum, hinweise})`.

## 6. Datenmodell & Spielstand
```
Fahrzeug = { id, x, y, laenge:2|3, achse:'h'|'v', ziel?:true, pfeil?:+1|-1 }   // x,y = linkes/oberes Feld
Level    = { version:1, modus:'klassisch'|'ausparken', seed, stufe, breite:6, hoehe:6,
             ausgang:{ seite:'rechts', zeile:2 }, poller:[[x,y]], fahrzeuge:[...], optimum }
Zustand  = Uint8Array(pos je Fahrzeug)  // Ausparken: zusätzlich Bitmaske „draußen“
Stand    = { version:1, modus, levelNr, datum?, level, verlauf:[[i,von,nach] | {neustart:[...]}],
             hinweise:0, anstosser:0, gewonnen:false }
```
- Belegungsraster (`Int8Array(B·H)`, −1 = frei) wird aus dem Zustand abgeleitet, nicht gespeichert.
- Autospeichern nach jedem Zug über `ctx.speicher`; Fortschritt je Modus unter `stau.fortschritt`.

## 7. Darstellung
- **SVG**: Raster als Hintergrund, Fahrzeuge als `<g>` mit abgerundetem Rechteck, Fenster-/Ladeflächen-Andeutung, Farbe aus `ctx.farben` **plus Muster/Symbol** (Streifen, Punkte, Karo …); Zielfahrzeug mit eigener Signalfarbe + Stern, Ausparken-Pfeile als großes Symbol auf dem Fahrzeug. Eigene Optik: Draufsicht, flach, sanfte Schatten – keine Nachahmung bekannter Spiele.
- Bewegung per `transform: translate()` → flüssiges Ziehen ohne Neuaufbau. Fokus/Barrierefreiheit über `tabindex` und `aria-label` („Laster senkrecht, Spalte 4“).
- **Animationen** (ruhig): Schieben 150–200 ms ease-out, Ausfahren 400 ms, Zurückfedern 250 ms. Abschaltbar über `ctx.einstellungen.animationen` und bei `prefers-reduced-motion` (dann Sprung, Blockierer nur farblich markiert).

## 8. Tests
Testseite `tests/stau.html` (ES-Module im Browser, kein Node).
- **Regeln**: Bewegung nur entlang der Achse, Stopp an Fahrzeug/Poller/Rand, Zielfahrzeug durch Ausgang, Zusammenfassen von Schritten zu einem Zug, Hin-und-zurück = 0 Züge.
- **Löser**: handgebaute Level mit bekanntem Optimum (1, 3, 8 Züge); unlösbare Belegung → erkannt.
- **Generator Klassisch**: 200 Seeds je Stufe → Optimalweg per Regel-Engine nachspielen endet im Ziel, Länge = gemeldetes Optimum, unabhängige Vorwärts-BFS bestätigt Optimum.
- **Generator Ausparken**: 500 Seeds → gierige Strategie („irgendein freies Fahrzeug raus“) leert immer das Feld; Abhängigkeitsgraph kreisfrei.
- **Determinismus**: gleicher Seed → gleiches Level; **Rückgängig**: Zufallszüge vor und zurück → Start.

## 9. Aufwand & Risiken
- Aufwand: Regel-Engine 0,5 T · Klassisch-Generator + Löser + Worker 2 T · SVG + Ziehen/Klick/Tastatur/Touch 2,5 T · Ausparken-Modus 1,5 T · Tests 1 T · Animation/Feinschliff 1 T → **ca. 8–9 Personentage** (ohne Ausparken ≈ 7).
- Risiken:
  - Hohe Mindestzüge sind selten → Generierung schwerer Level dauert; Abhilfe Vorab-Erzeugung, notfalls Level-Paket über Generator-Seite.
  - Ziehen mit Einrasten und Kollision fühlt sich schnell „hakelig“ an → früh am Handy testen, Ziehen und Wischen sauber trennen (Schwellwert Geschwindigkeit).
  - Kleine Felder bei 7 × 7+ am Handy → Mindestfeldgröße, ggf. Stufe am Handy begrenzen.
  - Determinismus: nur Knotenbudgets, stabile Iterationsreihenfolge (keine Abhängigkeit von `Map`-Hash-Reihenfolge außer Einfügereihenfolge).

## 10. Aufgabenliste
### M1 – Regel-Kern
- [ ] `logik.js`: Level → Zustand, Belegungsraster, `zuege()`, `verschiebe()`, `gelöst()`
- [ ] Testseite mit Regel- und Rückgängig-Tests
### M2 – Löser & Generator Klassisch
- [ ] BFS-Löser (Optimalweg) und Cluster-BFS mit Mehrquellen-Abständen
- [ ] Zufallsbelegung je Stufe, Ausschlussregeln, Aufräumen überflüssiger Fahrzeuge
- [ ] Worker-Anbindung über `ctx.worker`, Vorab-Erzeugung des nächsten Levels
- [ ] Generator-Tests (200 Seeds/Stufe), Determinismus, Laufzeit am Handy messen
### M3 – Spielbare Oberfläche Klassisch
- [ ] `index.js` mit Schnittstelle (`erstelle`, `getStand`, `rueckgaengig`, `neustart`, `zerstoere`, `hinweis`, `onTaste`)
- [ ] SVG-Raster, Fahrzeuge mit Farbe + Muster, Zielfahrzeug, Ausgang
- [ ] Ziehen mit Kollision/Einrasten, Klick-Klick, Tastatur (Tab, Pfeile, Umschalt), Touch inkl. Wischen
- [ ] Zugzähler, „bestmöglich“, Ausfahr-Animation, `meldeGewonnen()`
### M4 – Komfort
- [ ] Hinweis, Neustart rückgängig machbar, Autospeichern
- [ ] Endlos-Fortschritt, freies Spiel, Tageslevel, Statistik, optionale Sterne
### M5 – Modus Ausparken
- [ ] Konstruktiver Generator mit Abhängigkeitstiefe, Tests
- [ ] Antippen/Enter, Ausfahren und Zurückfedern, Blockierer-Markierung, Zähler
### M6 – Feinschliff
- [ ] Animationen abschaltbar, `prefers-reduced-motion`, aria-labels, Fokusrahmen
- [ ] Handy-Test (Feldgrößen, Querformat), Budget-Kalibrierung, ggf. Generator-Seite für Knifflig-Paket
