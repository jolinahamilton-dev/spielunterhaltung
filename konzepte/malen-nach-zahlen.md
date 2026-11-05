# Malen nach Zahlen

Ganz entspanntes Ausmalen eines Pixelbilds. Kein Fehler, kein Timer, kein Frust.

## Regeln
- Das Bild ist ein Raster (12 × 12 bis 32 × 32). Jedes Feld des Motivs zeigt eine **Zahl** (= Farbe), Felder ohne Zahl gehören zum Hintergrund und bleiben leer.
- Unten liegt die **Farbleiste**: Nummer, Farbfeld (bei „Symbole an“ mit Symbol), Fortschritt; fertige Farben bekommen ein ✓.
- Farbe wählen → Felder mit dieser Zahl antippen oder **übermalen per Ziehen**. Nur passende, noch offene Felder werden gefärbt – andere bleiben unberührt (kein Fehler).
- Felder der gewählten Farbe werden hervorgehoben (leicht eingefärbt, Zahl kräftig; bei kleinen Zellen ein Punkt statt Zahl).
- Ist eine Farbe fertig, wird automatisch die nächste offene Farbe gewählt.
- Alle Felder gefärbt → Zahlen und Gitter verschwinden, das fertige Bild steht kurz groß da, dann „Gelöst – Bild: …“.

## Stufen (`variantenTitel: 'Bildgröße'`)
| id | Name | Bilder | Mosaik |
|---|---|---|---|
| `klein` | Klein – bis 16 × 16 | Seite 12–16 | 12–16 |
| `mittel` | Mittel – bis 24 × 24 | Seite 17–24 | 18–24 |
| `gross` | Groß – bis 32 × 32 | Seite 25–32 | 26–32 |

Reihenfolge je Stufe: erst alle Bilder aus `bilder.json` (Datei-Reihenfolge), danach abwechselnd ein Mosaik und wieder ein Bild (endlos). Der Zähler „nächstes Bild“ je Stufe liegt in `ctx.speicher` (`naechstes: { klein, mittel, gross }`) und steigt beim Erzeugen – „Neu“ bringt also immer das nächste Bild.

## Bilder und Generator
- `spiele/malen-nach-zahlen/bilder.json`: `[{ titel, zeilen: ['..aab..', …], farben: { a: 3, b: 8 } }]` – `.` = leer, Buchstabe → Farb-ID 0–9 (`ctx.farben`). Höchstens 10 Farben, eigene Motive, keine Marken/Figuren.
- **Mosaik** (Seed, sfc32 über `ctx.zufall`): geglättetes Rauschen bzw. Ringe/Rauten, 4-fach gespiegelt, 4–8 Farben. Feste Schrittzahl, < 5 ms → kein Worker nötig.
- Das erzeugte Bild steckt komplett im Spielstand.

## Bedienung
- **Maus:** linke Taste tippt/malt (Ziehen), Mausrad zoomt um den Zeiger, mittlere Taste oder Leertaste + Ziehen verschiebt.
- **Touch:** ein Finger malt, zwei Finger zoomen (Pinch) und verschieben. Kommt der zweite Finger dazu, wird der angefangene Strich verworfen.
- Knöpfe: − / + (Zoom), „Ganzes Bild“, „Nächste Stelle“ (springt zum nächsten offenen Feld der gewählten Farbe).
- **Tastatur:** 1–9/0 wählen Farbe 1–10, Pfeile bewegen den Cursor, Leertaste/Enter malt, Umschalt + Pfeile malt beim Bewegen (ein Eintrag im Verlauf, solange Umschalt gehalten wird), +/− zoomen, W = nächste Stelle. Z/Y/H/N wie überall.
- Zahlen erscheinen erst ab ~13 px Zellgröße; darunter markiert ein Punkt die Felder der gewählten Farbe.
- **Hinweis:** wählt die gewählte Farbe (oder, wenn sie fertig ist, die mit den wenigsten offenen Feldern), setzt den Cursor auf das offene Feld, das der Bildmitte am nächsten liegt, rückt es ins Bild und markiert es.
- **Rückgängig/Wiederholen** unbegrenzt; ein Ziehzug = ein Eintrag.

## Darstellung
Canvas (scharf über `devicePixelRatio`), Farben aus den CSS-Variablen (`--spielfarbe-*`, `--flaeche`, `--text` …); bei Palette/Symbolen (`ctx.farben.beobachte`), Thema (`data-theme`, `prefers-color-scheme`) und Größe neu zeichnen. Ab 360 px ohne waagerechtes Scrollen, Malfläche `touch-action: none`.

## Datenmodell (`standVersion: 1`)
```
{ v: 1, stufe, nr, titel, b, h,
  farben: [Farb-ID …],          // Nummer n zeigt farben[n-1]
  bild:   [-1 | 0 … k-1],       // je Feld Farbindex (−1 = leer)
  verlauf: [[Feld …], …],        // gemalte Züge (daraus wird „gemalt“ berechnet)
  vor:     [[Feld …], …] }       // zurückgenommene Züge
```
Jedes Feld kommt höchstens einmal in `verlauf` + `vor` vor → der Stand bleibt klein (≤ 1024 Zahlen). Beim Laden wird alles geprüft; Ungültiges → neues Bild. Ein fertig gemaltes Bild wird nicht wieder geöffnet.

## Tests (`tests/spiele/malen-nach-zahlen.test.js`)
Bild-Prüfung (Größen, Farben, Zeichen), alle Bilder aus `bilder.json` gültig und jeder Stufe ≥ 6, Mosaik deterministisch/symmetrisch/Größen je Stufe, Malen nur passender Felder, Rückgängig/Wiederholen, Neustart, Gewinn, Hinweis/nächste Stelle, Reihenfolge der Bilder, Speichern/Laden und kaputte Stände.
