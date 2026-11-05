# Konzept: Bild abtragen (`spiele/bild-abtragen/`)

Eigenes Spiel nach dem Spielprinzip „Pixelbild Farbe für Farbe abbauen“ (Genre wie u. a. bei Werbe-Puzzlespielen).
**Eigener Name, eigene Optik, eigene Bilder** – keine Ameisen, keine Grafiken oder Begriffe eines bestimmten Spiels.
ID `bild-abtragen` · Name „Bild abtragen“ · CSS-Präfix `ba-` · Beschreibung: „Farbige Sammler tragen ein Pixelbild Stück für Stück ab.“

## Regeln
- **Bild:** Raster B×H aus farbigen Pixeln (Farben = `ctx.farben`-IDs 0–9) und leeren Feldern (Luft).
- **Frei** ist ein Pixel, wenn es (4er-Nachbarschaft) am Bildrand liegt oder an ein leeres Feld grenzt. Leere Felder im Inneren zählen als Luft. Abgetragen wird also von außen nach innen.
- **Sammler** stehen in **Kolonnen** (3–4 Spalten) unter dem Bild. Jeder Sammler hat eine Farbe und eine **Ladung** (Anzahl Pixel, z. B. 3–12). Antippen kann man nur den **vordersten** Sammler jeder Kolonne.
- Ein angetippter Sammler zieht auf einen freien **Arbeitsplatz** (begrenzt: 4–6 Plätze, je nach Stufe). Dort holt er nacheinander **freie Pixel seiner Farbe** aus dem Bild, bis er voll ist; dann verlässt er den Platz. Findet er gerade kein freies Pixel seiner Farbe, **wartet** er auf seinem Platz (blockiert ihn), bis durch andere Sammler wieder eines frei wird.
- Mehrere Sammler arbeiten **gleichzeitig** (Reihenfolge: Platz 1 zuerst, jeweils ein Pixel pro Schritt, so lange, bis keiner mehr etwas holen kann). Welches Pixel genommen wird: deterministisch (z. B. das unterste, dann linkeste freie Pixel der Farbe).
- Die Ladungen einer Farbe ergeben zusammen **genau** die Anzahl Pixel dieser Farbe.
- **Gewonnen:** Bild leer → kurze Einblendung des ursprünglichen Bildes (klein) + `ctx.meldeGewonnen('Level 7 · Kirsche')`.
- **Festgefahren:** Alle Arbeitsplätze belegt und keiner kann etwas holen (oder keine Sammler mehr in den Kolonnen und keiner kommt weiter). **Kein Spielende**, sondern ruhiger Hinweis im Spiel: „Festgefahren – mit Rückgängig geht es weiter“ + Knöpfe „Rückgängig“ und „Neu starten“.

## Lösbarkeit (Generator)
Level werden so erzeugt, dass sie **garantiert lösbar** sind:
1. Bild wählen (siehe unten).
2. Simulieren: solange Pixel übrig: eine Farbe wählen, von der es freie Pixel gibt (zufällig, Seed); einen Sammler mit Zielladung c (Zufall im Stufenbereich) bilden, der nacheinander freie Pixel dieser Farbe nimmt (durch eigenes Abtragen frei gewordene zählen mit), bis c erreicht oder keins mehr frei ist; tatsächliche Anzahl = Ladung. Ergebnis: Lösungsreihenfolge der Sammler.
3. Sammler in Lösungsreihenfolge **zufällig auf die Kolonnen verteilen** (hinten anhängen) → die Lösungsreihenfolge ist immer antippbar.
4. Schwierigkeit über: Bildgröße, Anzahl Farben, Kolonnen, Arbeitsplätze, Ladungsbereich, „Verwirrung“ (wie stark Farben über die Kolonnen gemischt werden).
- Schritt-Budgets statt Zeit; gleicher Seed → gleiches Level. Das komplette Level (Bild + Kolonnen) steckt im Spielstand.

## Hinweis
Löser (Tiefensuche mit Gedächtnis über Zustände: Kolonnen-Positionen + Arbeitsplätze + entferntes Bild als Hash, Schritt-Budget) sucht einen Tipp, nach dem das Level noch lösbar ist → betreffenden Sammler hervorheben. Ist der aktuelle Stand nicht mehr lösbar: „Von hier aus geht es nicht mehr – n× Rückgängig“ (n = Züge bis zum letzten lösbaren Stand, aus dem Verlauf ermittelt).

## Stufen (Varianten, `variantenTitel` Standard = „Schwierigkeit“)
| Stufe | Bild | Farben | Kolonnen | Arbeitsplätze | Ladung |
|---|---|---|---|---|---|
| Leicht | 8–10 | 3 | 3 | 6 | 3–6 |
| Mittel | 12 | 4–5 | 4 | 5 | 4–9 |
| Schwer | 14–16 | 5–6 | 4 | 4 | 5–12 |
Fortlaufende Level-Nummer je Stufe in `ctx.speicher`; „Neues Spiel“ nach Gewinn = nächstes Level.

## Bilder
- `motive.json`: mindestens 16 **eigene** bunte Pixelmotive (z. B. Kirsche, Pilz, Blume, Haus, Fisch, Baum, Sonne, Tasse, Herz, Apfel, Boot, Schmetterling, Kaktus, Regenschirm, Rakete, Eis), Größen 8–16, Format z. B. `{ "titel": "Kirsche", "zeilen": ["..aa..", ...], "farben": { "a": 0, "b": 3 } }` (Buchstabe → Farb-ID, `.` = leer). Keine Marken/Figuren.
- Zusätzlich Generator für **symmetrische Mosaike** (gespiegeltes geglättetes Rauschen mit k Farben), damit es endlos weitergeht. Leicht/Mittel nutzen bevorzugt Motive passender Größe, danach Mosaike.

## Bedienung
- PC: Klick auf einen vordersten Sammler; Tastatur: 1–4 wählt die Kolonne, Pfeile ←/→ + Enter alternativ; Z/Strg+Z rückgängig (Shell), H Hinweis (Shell).
- Handy: Antippen. Alles ab 360 px Breite, Bild oben, Arbeitsplätze in einer Reihe darunter, Kolonnen unten.
- Darstellung DOM/CSS-Grid (Bild bis 16×16 = 256 Zellen ist unkritisch). Sammler: abgerundete Kästchen in Farbe mit Symbol (bei `musterAn()`) und Zahl (Restladung). Ruhige Animation: Pixel verblasst, Zahl zählt runter (≤ 200 ms je Schritt, abschaltbar → sofort).
- Rückgängig: unbegrenzt (ein Tipp = ein Eintrag), Wiederholen optional.

## Tests
Freiheit/Abtragen, Gleichzeitigkeit, Ladungssummen je Farbe = Pixelzahl, Generator (200 Seeds je Stufe): Lösungsreihenfolge löst das Level, Determinismus, alle Motive gültig, Hinweis führt bei Hinweis-Schleife zum Ziel, Festgefahren-Erkennung, Spielstand speichern/laden, kaputter Stand → neues Spiel.
