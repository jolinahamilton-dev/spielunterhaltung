# Konzept: Ziegelbruch (`spiele/ziegelbruch/`)

ID `ziegelbruch` · Name „Ziegelbruch“ · CSS-Präfix `zb-` · `standVersion` 1. Eigenes Spiel nach dem Prinzip der Ball-Blöcke-Schießer (Bälle von unten schießen, Blöcke mit Trefferzahlen abbauen, nach jedem Schuss rückt das Feld nach). Eigene Optik, Texte und Level.

## Regeln
- Feld 7 Spalten × 10 Zeilen. Die unterste Zeile ist die **Fallzone** (immer leer beim Zielen), darüber 9 Zeilen mit Blöcken.
- Unten steht die Abschussstelle. Man zielt (Winkel −80° … +80° von senkrecht) und schießt einen Strom von Bällen (alle 7 Takte einer). Bälle prallen an Wänden/Decke/Blöcken; jeder Treffer nimmt einem Zahlblock 1 ab. Der erste zurückgekehrte Ball bestimmt die nächste Abschussstelle. Erst wenn alle Bälle zurück sind, ist der nächste Schuss möglich.
- Blöcke: **Zahlblock** (1–999, Zahl immer sichtbar; Helligkeit/Farbstufe nach Zahl, bei „Muster“ zusätzlich Symbol), **Extra-Ball** (wird durchflogen, +1 Ball nach dem Schuss), **Bombe** (ein Treffer, nimmt allen Zahlblöcken im 3×3-Umfeld 3 ab), **Reihenräumer** (ein Treffer, räumt alle Zahlblöcke seiner Zeile), **Wand** (unzerstörbar).
- Nach jedem Schuss rückt das Feld eine Zeile nach unten. Erreicht etwas die Fallzone, **fällt die Reihe weg** (ruhige Meldung „Reihe fällt weg“, kein Game-over, kein Leben, kein Timer). Die Fallzone ist danach wieder leer.
- „Beschleunigen“ ändert nur das Abspieltempo, nie das Ergebnis.

## Varianten
- `level` „Level – mit Ziel“: Ziel = alle zerstörbaren Blöcke weg und kein Nachschub mehr. Levelzähler in `ctx.speicher` (`level`). Jedes Level hat feste Ballzahl, Startfeld und Nachschub-Reihen (kommen eine pro Schuss von oben, solange welche übrig sind; danach steht das Feld still). Levelmuster: Parametertabelle + kleiner Muster-Generator (acht Grundmuster × Schwierigkeit, Spezialblöcke ab Level 4/6/10); Level 1–30 sind so fest entworfen, ab 31 aus der Levelnummer erzeugt (deterministisch). Gewonnen → `meldeGewonnen(text, { weiterspielen: true })`; `instanz.weiterspielen()` setzt `weiter`: dasselbe Feld läuft im Endlos-Betrieb weiter, nie ein zweites Mal gewonnen melden (`fertig`).
- `endlos` „Endlos – ohne Ziel“: nach jedem Schuss kommt oben eine neue Reihe (seeded, Zustand im Spielstand), Trefferzahlen wachsen langsam mit der Schusszahl, durchschnittlich ein Extra-Ball je Reihe. Zähler „Reihen“ + Rekord in `ctx.speicher`.

## Physik (`logik.js`, ohne DOM)
Feste Schrittweite (Geschwindigkeit 0,16 Zellen/Schritt, Ballradius 0,16 → Schritt ≤ Radius, kein Tunneln). Kreis gegen Rasterzellen: nächster Punkt, Ausrichten entlang der Normalen, Reflexion nur bei Anflug. Gleicher Schuss → gleiches Ergebnis. Schutz: Mindest-Steigung nach jedem Abprall; ab 2500 Schritten pro Ball leichter Abwärtsdrall; Gesamtbudget 250 000 Schritte (danach gelten alle Bälle als zurück). `erstelleSchuss` liefert ein Simulationsobjekt, das die Animation Schritt für Schritt (`schrittSim`) oder `simuliereAlles` am Stück abspielt; `beendeSchuss` erzeugt den neuen Zustand. Die Vorschau-Linie simuliert einen Ball bis zur ersten Prallstelle am Block. Der Hinweis simuliert 21 Kandidatenwinkel und nimmt den mit dem größten Schaden.

## Spielstand (JSON, streng validiert, standVersion 1)
`{ standVersion, modus, level, seed, rng[4], feld[70], nachschub[[7]…], baelle, schuesse, startX, winkel, weiter, fertig, reihen, gefallen, verlauf[≤100 Schnappschüsse] }`. Zellwerte: 0 leer, 1…999 Zahlblock, −1 Wand, −2 Extra, −3 Bombe, −4 Reihenräumer. Rückgängig = Zustand vor dem letzten Schuss (auch mitten im Schuss: Schuss abbrechen).

## Bedienung
Maus/Finger: auf dem Feld ziehen/bewegen zeigt Zielhilfe-Linie mit erster Prallstelle, Loslassen schießt (unterhalb der Abschussstelle loslassen bricht ab). Tastatur: Feld fokussieren, ←/→ 1° (Umschalt 5°), Enter/Leertaste schießt, B beschleunigt. Knöpfe „Schießen“ und „Beschleunigen“ (≥ 44 px). Layout ab 360 px, Farben nur CSS-Variablen, keine Töne.

## Tests
Reflexion an Wand/Decke/Block, Determinismus, Extra-Ball, Reihe fällt weg, Bombe/Reihenräumer/Wand, Level lösbar (einfache Strategie, erste Level), Level-Struktur 1–35, Spielstand-Validierung, Weiterspielen-Flag, Rückgängig-Verlauf, Oberflächen-Basics.
