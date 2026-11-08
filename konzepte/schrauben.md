# Konzept: Schrauben (`spiele/schrauben/`)

Eigenes Spiel im Genre „Schrauben lösen“. Eigene Optik, Texte und Level; keine Nachbildung eines Markenspiels.
ID `schrauben` · Name „Schrauben“ · CSS-Präfix `sr-` · Beschreibung: „Schrauben lösen, Bretter fallen lassen, Kisten füllen.“

## Regeln
- **Wand:** Raster b×h. Mehrere **Bretter** (Rechtecke oder L-Formen aus Rasterzellen) liegen in **Schichten** übereinander und hängen mit **farbigen Schrauben** an der Wand. Jede Schraube sitzt auf genau einer Zelle ihres Bretts, keine zwei Schrauben auf derselben Zelle. Jedes Brett hat mindestens 2 Schrauben.
- **Frei** (antippbar) ist eine Schraube, wenn kein noch hängendes Brett einer **höheren Schicht** ihre Zelle überdeckt. Verdeckte Schrauben sieht man blass durch das Brett.
- **Tippen** dreht die Schraube heraus. Sie wandert automatisch in eine **aktive Kiste** ihrer Farbe mit freiem Platz (Kiste fasst 3). Gibt es keine, geht sie auf einen **Parkplatz** (wenige, je Stufe 3–5).
- **Kistenschlange:** vorne stehen `aktiv` Kisten (2–3), dahinter warten weitere. Ist eine Kiste voll, verschwindet sie, die nächste rückt in die aktiven nach. Geparkte Schrauben springen automatisch in eine neu aktive passende Kiste (auch Kettenreaktion).
- **Brett fällt**, sobald alle seine Schrauben entfernt sind (dann deckt es nichts mehr ab). Hängt nur noch eine Schraube, schwingt das Brett leicht schief (nur optisch).
- **Gewonnen:** alle Bretter weg. **Verloren gibt es nicht:** sind alle Parkplätze voll und keine freie Schraube hat eine passende Kiste, erscheint „Festgefahren – Rückgängig“ (unbegrenztes Rückgängig/Wiederholen). Kein Timer.

## Stufen
| Stufe | Wand | Bretter | Farben | Schichten | Parkplätze | aktive Kisten |
|---|---|---|---|---|---|---|
| Leicht | 5×6 | 4 | 3 | 3 | 5 | 3 |
| Mittel | 6×7 | 8 | 4–5 | 4 | 4 | 2 |
| Schwer | 7×8 | 12 | 5–6 | 5 | 3 | 1 |
Fortlaufender Level-Zähler je Stufe in `ctx.speicher` (`geloest`).

## Generator (garantiert lösbar, konstruktiv)
1. Seeded Layout: Bretter schichtweise platzieren (gleiche Schicht überlappungsfrei, höhere Schichten bevorzugt über Tieferem), Schrauben auf eindeutige Zellen, bevorzugt zur Hälfte auf überdeckten Zellen; Gesamtzahl ein Vielfaches von 3.
2. **Entfernungsreihenfolge** (Lösung) durch zufälliges Abtragen freier Schrauben.
3. Kistenschlange vorab (jede Farbe mindestens eine Kiste, gemischt). Dann entlang der Lösungsreihenfolge **Farben vergeben**, während die echte Spiel-Engine mitläuft: meist eine Farbe einer aktiven Kiste mit Platz, mit Wahrscheinlichkeit `parken` eine Farbe einer wartenden Kiste (Parkplatz, wenn noch Platz). Endet die Simulation mit leerem Parkplatz, ist das Level bewiesen lösbar; sonst nächster Versuch (anderer Teil-Seed). Letzter Ausweg: ohne Parken.
- Schritt-Budget statt Zeit, gleicher Seed → gleiches Level. Das ganze Level samt Lösungsreihenfolge steckt im Spielstand.

## Hinweis
Löser (Tiefensuche mit Gedächtnis, Schritt-Budget): zuerst die Lösungsreihenfolge des Levels weiterverfolgen, sonst Suche mit „direkt in Kiste“ zuerst. Findet er keinen Weg (vollständig durchsucht): „Von hier aus geht es nicht mehr – n× Rückgängig“ (n aus dem Verlauf). Budget erschöpft: Vorschlag ohne Gewähr.

## Bedienung
Tippen/Klicken auf freie Schraube. Tastatur: Pfeile springen zur nächsten freien Schraube in der Richtung, Enter/Leertaste dreht. Sichtbarer Fokus. Schrauben in `ctx.farben`, bei `musterAn()` zusätzlich Symbol. Animation ≤ 250 ms (CSS-Übergänge, bei `bewegungReduziert()` aus). Layout ab 360 px, Zellen ≥ 40 px.

## Datenmodell
`{ v:1, stufe, level, seed, b, h, bretter:[{l, z:[Zellen]}], schrauben:[{i, f, br}], kisten:[Farbe…], aktiv, plaetze, loesung:[Schraubenindex…], zuege:[Schraubenindex…], vor:[…] }`
Der Rest (entfernt, Kistenfüllung, Parkplätze) wird aus `zuege` durch Wiederholen berechnet. Ladevalidierung streng: Typen, Bereiche, Schraube liegt im Brett, Farbmengen = Kistenkapazität, `loesung` muss das Level gewinnen, `zuege` müssen legal sein.

## Tests
Verdeckung, Kistenschlange/Nachrücken, Parken + automatisches Entparken, Brett fällt, Rückgängig/Wiederholen, Festgefahren, Generator 30 Seeds je Stufe (Invarianten + Lösung gewinnt + Determinismus), Löser/Hinweis, Spielstand-Validierung, kein Audio/eval/innerHTML, Robustheit mit kaputten Ständen.
