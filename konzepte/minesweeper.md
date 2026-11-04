# Konzept: Minesweeper („Minenfeld“)

Modul: `spiele/minesweeper/index.js` · ID `minesweeper` · Name „Minenfeld“
Beschreibung: „Felder aufdecken, Minen meiden – klassisch oder auf einem unendlichen Feld.“
Hilfsdateien: `logik.js` (Brett, Zahlen, Flutfüllung), `loeser.js` (Logik-Löser), `generator.worker.js` (ohne-Raten-Erzeugung), `unendlich.js`, `zeichner.js` (Canvas).

## 1. Spielidee & Regeln

- Rechteckiges Feld mit verdeckten Zellen, einige enthalten Minen. Aufgedeckte Zellen zeigen die Zahl der Minen unter den 8 Nachbarn.
- Ziel klassisch: alle minenfreien Zellen aufdecken. Flaggen sind nur Merkhilfe (kein Zwang zum Flaggen).
- **Erster Klick immer sicher und eine Null**: Minen werden erst nach dem ersten Klick verteilt, mit Ausschluss des 3×3-Bereichs
  um die Klickzelle. Passen dann nicht genug Plätze (dichte eigene Felder), wird nur die Klickzelle ausgeschlossen.
- Null-Zellen decken ihre Nachbarn automatisch auf (Flutfüllung).
- **Chording**: Klick auf eine aufgedeckte Zahl, deren Flaggenzahl stimmt → alle nicht geflaggten Nachbarn werden aufgedeckt.
  Stimmt die Flaggenzahl nicht, passiert nichts (nur kurzes, ruhiges Hervorheben der Nachbarn).
- Mine aufgedeckt: Hardcore → Spielende; Entspannt → siehe 3.

## 2. Bedienung

**PC (Maus)**: Linksklick = aufdecken · Rechtsklick = Flagge (→ Fragezeichen, falls aktiv) → leer · Linksklick oder Mittelklick
auf Zahl = Chording · gedrückt halten zeigt betroffene Nachbarn als Vorschau (Loslassen außerhalb = Abbruch). Kontextmenü auf dem Feld unterdrückt.

**Tastatur** (`onTaste`): Pfeiltasten/WASD bewegen den Feld-Cursor (sichtbarer Rahmen) · `Leertaste`/`Enter` aufdecken bzw. Chording auf Zahl ·
`F` Flagge · `?` Fragezeichen · `Z`/`Strg+Z` rückgängig (siehe 5) · `H` Hinweis · `N` neues Spiel · `P` Pause · `T` Timer ein/aus.
Unendlich zusätzlich: `Umschalt+Pfeile` Kamera verschieben, `+`/`-` Zoom, `Pos1` zurück zum Start, `C` Kamera auf Cursor.

**Handy (Touch)**
- Tippen = aufdecken, **lange drücken (≈ 400 ms) = Flagge**; während des Drückens wächst ein ruhiger Ring um die Zelle (kein Vibrieren).
- Umschalter unten: „Aufdecken | Flagge“ – im Flaggen-Modus tauscht Tippen und Langdrücken die Rollen.
- Tippen auf Zahl = Chording. Bewegung > 8 px vor dem Loslassen = Verschieben, nie ein Klick.
- Kleine Zellen: Zoom erlaubt (Pinch), Mindest-Trefferfläche 32 px; im klassischen Feld scrollt/zoomt man bei großen Feldern.

## 3. Modi & Optionen

**Klassisch**
| Stufe | Größe | Minen |
|---|---|---|
| Anfänger | 9×9 | 10 |
| Fortgeschritten | 16×16 | 40 |
| Experte | 30×16 (Hochformat: 16×30) | 99 |
| Eigene | 5–60 × 5–40 | 1 … (B·H − 9) |

**Unendlich**: endloses Feld, Dichte wählbar 10 / 14 / 18 / 22 % (Minimum 10 %, siehe 4.4). Feste Seed-Anzeige, „Seed teilen“ als Text.

**Ausgang bei Mine** (beide Modi wählbar):
- *Entspannt* (Standard): kein Spielende. Mine wird als „getroffen“ angezeigt und zählt als Treffer; im klassischen Modus gilt
  das Spiel dann als „gelöst mit n Treffern“ (eigene Bestenliste). Optional „Zurücknehmen“ (siehe 5).
- *Hardcore*: Spielende, alle Minen sichtbar. Unendlich: Endstand = aufgedeckte Felder.

**Optionen**: Ohne Raten (nur klassisch, Standard an), Fragezeichen an/aus, Chording an/aus, Timer anzeigen an/aus (läuft intern weiter
für Statistik, Pause hält ihn an), Minenzähler an/aus, Animationen an/aus, Zahlenfarben „ruhig“/„kräftig“.

## 4. Algorithmen

### 4.1 Erzeugung (klassisch)
```
erzeuge(b, h, minen, start, rng): kandidaten = alle Zellen außer 3×3 um start; Fisher-Yates mit rng; erste `minen` = Mine
```

### 4.2 Ohne Raten (generate-and-test + Reparatur, im Web Worker)
Löser arbeitet nur mit sichtbarer Information, in Stufen (billig → teuer):
1. **Einfach**: Zahl − Flaggen = 0 → alle Nachbarn sicher; = verdeckte Nachbarn → alle Minen.
2. **Teilmengen**: für benachbarte Zahlen A, B mit U(A) ⊆ U(B): Differenz hat (r(B) − r(A)) Minen → sicher/Minen ableiten.
3. **Grenz-Aufzählung**: Randzellen in unabhängige Gruppen zerlegen, je Gruppe (≤ 24 Zellen) Backtracking über gültige Belegungen,
   plus globaler Minenzähler; Zelle in keiner Belegung Mine → sicher. Gruppen > 24 werden übersprungen.
```
istLoesbar(brett, start):
  oeffne(start)
  loop: schritte = stufe1() || stufe2() || stufe3(); if keine: break; wende an
  return alle sicheren Zellen offen
erzeugeOhneRaten(cfg, start):
  for versuch in 1..N:
    b = erzeuge(...); while not istLoesbar(b): if not repariere(b): break  // eine Mine aus der festhängenden Grenze
    if istLoesbar(b): return b                                            // in einen noch unberührten Bereich verschieben
  return bestes b (Hinweis: „ein Rateschritt möglich“)
```
Laufzeit (Schätzung, Worker, mittleres Notebook): Anfänger < 10 ms, Fortgeschritten < 100 ms, Experte meist 100–800 ms, Zeitlimit 3 s.
Da der Startklick bekannt sein muss: Worker erzeugt beim ersten Klick; Anzeige „Feld wird vorbereitet …“ erst nach 300 ms.
Ergebnis ist deterministisch aus Seed + Startzelle (reproduzierbar für Tests).

### 4.3 Flutfüllung (iterativ, für beide Modi)
```
flut(start): stapel=[start]
  while stapel: z=pop; if offen(z) or flagge(z): continue; oeffne(z); zaehler++
    if zahl(z)==0: for n in nachbarn(z): if !offen(n) push(n)
```
Keine Rekursion (kein Stack-Überlauf). Unendlich: Budget 20 000 Zellen pro Frame, Rest im nächsten `requestAnimationFrame`.

### 4.4 Unendlich: deterministische Minen pro Zelle
- Chunks 16×16; globale Zellkoordinate (x, y) als Ganzzahl (± 2³¹ reicht).
- Mine nur aus Seed und Koordinate, unabhängig von Spielverlauf und Ladereihenfolge:
```
istMine(x,y): if max(|x|,|y|) <= 2: return false          // sicherer Start, (0,0) ist eine Null
  h = mix32(seed ^ imul(x, 0x9E3779B1) ^ imul(y, 0x85EBCA77)); return h / 2^32 < dichte
chunkMinen(cx,cy): Uint16Array(16) Zeilen-Bitmasken, im LRU-Cache (≈ 2000 Chunks)
```
- Zahl einer Zelle braucht die Nachbar-Chunks → `chunkMinen` wird für 3×3 Chunks bei Bedarf berechnet (billig, nicht gespeichert).
- **Dichte ≥ 10 %**: Wahrscheinlichkeit einer Null ist (1−p)⁹. Für p < ≈ 9,5 % liegt sie über der Perkolationsschwelle (≈ 0,41 bei
  8er-Nachbarschaft) → eine Null-Fläche könnte unendlich wachsen. Ab 10 % sind Null-Flächen endlich; das Budget aus 4.3 sichert zusätzlich ab.

### 4.5 „Ohne Raten“ im Unendlich-Modus – Bewertung
Nicht sinnvoll garantierbar: Minen müssen ortsfest und reihenfolgeunabhängig sein, Lösbarkeit hängt aber vom Weg des Spielers ab;
nachträgliches Verschieben würde Determinismus und Speicherkonzept brechen. **Ersatz**: `hinweis()` mit Löser auf dem sichtbaren Rand –
gibt es keine logisch sichere Zelle, deckt „Gnaden-Hinweis“ eine echte sichere Randzelle auf (aus `istMine` bekannt). Wird in der
Statistik gezählt, aber nie bestraft.

### 4.6 Punkte / Zähler
Klassisch: Zeit (optional), Treffer, benutzte Hinweise. Unendlich: aufgedeckte Felder, Treffer, Flaggen, weiteste Entfernung vom Start;
Punktestand = aufgedeckt − 50 · Treffer (Anzeige ausblendbar).

## 5. Funktionen

- Aufdecken, Flagge, Fragezeichen, Chording, Flutfüllung, Minenzähler (Minen − Flaggen, im Unendlich-Modus nicht angezeigt).
- **Rückgängig**: kein allgemeines Zug-Undo (würde das Rätsel trivialisieren). Stattdessen:
  „Fehlklick zurücknehmen“ nur im Entspannt-Modus direkt nach einem Minentreffer – Mine wird wieder verdeckt und automatisch geflaggt,
  zählt als „Rücknahme“. Flaggen setzen/entfernen ist ohnehin frei umkehrbar. Hardcore: kein Rückgängig.
- `hinweis()`: markiert eine logisch sichere Zelle (Löser Stufe 1–3); sonst Gnaden-Hinweis.
- Pause (Feld wird verdeckt, Timer steht), automatisches Pausieren bei `visibilitychange`.
- Sieg klassisch → `ctx.meldeGewonnen()`, Bestzeiten je Stufe lokal (getrennt nach Entspannt/Hardcore, nur Standardstufen).
- Unendlich: Minimap, „Zum Start“, „Zur letzten Aktion“, Seed anzeigen/neu.
- Statistik: `ctx.statistik.melde({typ:'sieg'|'treffer'|'aufgedeckt'|'hinweis', modus, stufe})`.

## 6. Datenmodell & Spielstand

**Klassisch**
```js
{ version:1, modus:'klassisch', b:16, h:16, minen:40, seed, start:[x,y]|null, ohneRaten:true,
  minenBits:'base64',   // B·H Bits, erst nach erstem Klick
  offenBits:'base64', flaggeBits:'base64', frageBits:'base64',
  treffer:[[x,y]], ruecknahmen:0, hinweise:0, zeitMs:12345, status:'laeuft'|'gewonnen'|'verloren' }
```
**Unendlich** – Minen werden nie gespeichert (aus Seed rekonstruierbar):
```js
{ version:1, modus:'unendlich', seed, dichte:0.14, ausgang:'entspannt',
  chunks: { 'cx,cy': 'base64(96 Byte)' },  // offen 32 B | flagge 32 B | frage 32 B, je Uint16Array(16)
  treffer:[[x,y]], zaehler:{aufgedeckt, treffer, hinweise}, kamera:{x,y,zoom}, letzteAktion:[x,y] }
```
- Nur Chunks mit mindestens einem Zustand werden geschrieben; Frage-Teil entfällt, wenn leer (dann 64 Byte).
  10 000 Chunks ≈ 0,9 MB Base64 → in `ctx.speicher` (IndexedDB) unkritisch; optional `CompressionStream('gzip')`.
- Speichern entprellt (1,5 s nach letzter Aktion, sofort bei `pagehide`); nur geänderte Chunks markieren („dirty“).

## 7. Darstellung

- **Canvas** für beide Modi (ein Zeichner): klassisch bis 2400 Zellen, unendlich Millionen möglich; DOM wäre dort zu schwer.
  Zugänglichkeit: verstecktes `aria-live`-Feld meldet Cursorzelle („Zeile 4, Spalte 7: 2“).
- Pro Chunk ein Offscreen-Canvas (16 × Zellgröße) als Cache; bei Änderung nur dieser Chunk neu. Pro Frame nur sichtbare Chunks + Rand von 1.
- Bei Zoom < 8 px/Zelle vereinfachte Darstellung (Farbflächen statt Zahlen), Minimap: 1 Pixel pro Chunk (erkundet/Treffer).
- `devicePixelRatio` beachten, Neuzeichnen nur bei Bedarf (kein Dauer-Loop), Zoom 0,25×–3× um Mauszeiger/Pinch-Mitte.
- Klassisch: Feld passt sich an (Zellgröße = min(verfügbar / B, verfügbar / H, 40 px), mindestens 24 px, sonst Zoom/Scroll).
- Eigener ruhiger Stil: flache, leicht gerundete Zellen, gedeckte Zahlenfarben aus `ctx.farben` (unterscheidbar auch bei Farbschwäche,
  Zahlen immer als Ziffer), Flagge als schlichtes Symbol. Animationen (abschaltbar): sanftes Einblenden der Flutfüllung (max. 300 ms), keine Explosion.

## 8. Tests

Testseite `tests/minesweeper.test.html` ohne npm, Logik DOM-frei.
- Zahlen/Nachbarn an Ecken und Rändern; erster Klick nie Mine, 3×3 frei, Rückfall bei dichten Feldern.
- Chording mit richtiger/falscher Flaggenzahl; Fragezeichen blockiert Chording nicht.
- Löser: handgebaute Muster (1-2-1, 1-2-2-1, Teilmenge), Feld mit erzwungenem Raten wird als unlösbar erkannt.
- Ohne-Raten-Generator: 100 Experte-Felder → alle lösbar, Laufzeit-Protokoll, gleicher Seed → gleiches Feld.
- Unendlich: `istMine` deterministisch und unabhängig von Cache/Reihenfolge; Startbereich frei; Flutfüllung über Chunk-Grenzen
  identisch zu Referenz auf großem Array; Budget-Abbruch und Fortsetzung korrekt; Dichte-Verteilung ± 1 %.
- Spielstand: Speichern/Laden (beide Modi), Bitmasken-Rundlauf, kaputter Stand → Neustart.
- Leistung: 1 Mio. aufgedeckte Zellen → Laden < 1 s, 60 fps beim Verschieben auf Mittelklasse-Handy.

## 9. Aufwand & Risiken

Aufwand: **ca. 9–13 Arbeitstage** – Klassisch inkl. Bedienung 3, Löser + ohne Raten 3–4, Unendlich (Chunks, Kamera, Speicher, Minimap) 3–4, Tests/Feinschliff 1–2.

| Risiko | Gegenmaßnahme |
|---|---|
| Ohne-Raten bei Experte langsam/fehlschlagend | Worker, Reparaturschritt, Zeitlimit, Rückfall mit ehrlichem Hinweis |
| Touch: Verwechslung Tippen/Ziehen/Langdrücken | klare Schwellen (8 px, 400 ms), Umschalter, früh am Gerät testen |
| Riesige Null-Flächen frieren ein | Dichte ≥ 10 %, Frame-Budget, Chunk-Cache |
| Speicher wächst im Unendlich-Modus | Bitmasken, nur geänderte Chunks, Kompression |
| Gleitkomma/Hash-Unterschiede zwischen Browsern | nur `Math.imul`/Ganzzahl-Hash, Test mit festen Erwartungswerten |
| Ähnlichkeit zum Original | eigener Name, eigenes Farb- und Symbolset |

## 10. Aufgabenliste

**M1 – Klassisch Kern**
- [ ] `logik.js`: Brett, Zahlen, sicherer erster Klick, iterative Flutfüllung, Chording, Sieg/Treffer
- [ ] Canvas-Zeichner mit Skalierung und Feld-Cursor
- [ ] Maus + Tastatur, Stufen + eigene Größe, Timer optional
- [ ] Logik-Tests

**M2 – Komfort**
- [ ] Touch: Tippen, Langdrücken mit Ring, Umschalter, Pinch-Zoom
- [ ] Entspannt/Hardcore, Fehlklick zurücknehmen, Fragezeichen-Option
- [ ] Speichern/Laden (Bitmasken), Pause, Bestzeiten, Statistik

**M3 – Ohne Raten**
- [ ] `loeser.js` Stufen 1–3 mit Tests
- [ ] `generator.worker.js` über `ctx.worker`, Reparatur, Zeitlimit, Rückfall
- [ ] `hinweis()` mit Löser

**M4 – Unendlich**
- [ ] `istMine`-Hash, Chunk-Bitmasken, LRU-Cache, sicherer Start
- [ ] Flutfüllung über Chunks mit Frame-Budget
- [ ] Kamera: Ziehen, Mausrad, Pinch, Pfeiltasten, Pos1; Chunk-Bild-Cache
- [ ] Minimap, Zähler, Gnaden-Hinweis, sparsamer Spielstand

**M5 – Feinschliff**
- [ ] Leistungstests (1 Mio. Zellen), ruhige abschaltbare Animationen
- [ ] Themen hell/dunkel, Farbschwäche-Check, `aria-live`
- [ ] Gerätetests PC/Android/iOS, Offline als PWA
