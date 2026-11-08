# Konzept: Lichtstrahlen (`spiele/lichtstrahlen/`)

Eigenes Logikrätsel, keine Nachbildung eines Markenspiels. ID `lichtstrahlen` · Name „Lichtstrahlen“ · CSS-Präfix `ls-` ·
Beschreibung: „Spiegel drehen, bis jeder Lichtstrahl sein Ziel trifft.“

## Regeln
- Quadratisches Raster. Auf den Feldern stehen **Lichtquellen** (strahlen in eine feste Richtung, Farbe), **Ziele** (Farbe), **Hindernisse**,
  **drehbare Spiegel** (Schräge `/` oder `\`, Tippen schaltet um), **feste Spiegel** (nicht drehbar) und **Farbfilter**.
- Strahlen laufen gerade durch leere Felder, kreuzen einander ohne Wirkung, werden von Spiegeln (beidseitig) um 90° abgelenkt,
  vom Hindernis, von Quellen und Zielen verschluckt. Ein **Farbfilter** färbt den durchlaufenden Strahl in seine Farbe um.
- **Gelöst:** jedes Ziel wird von einem Strahl **seiner** Farbe getroffen. Ein Ziel, das nur eine falsche Farbe sieht, gilt nicht.
- Der Strahlverlauf wird nach jedem Zug live berechnet und als SVG-Linien gezeigt. Schleifen sind ausgeschlossen, weil die Bewegung
  umkehrbar ist und Quellen den Strahl verschlucken; zusätzlich schützen eine Besucht-Menge (Feld + Richtung) und eine Schrittgrenze.
- Kein Timer, kein Game-over, Rückgängig/Wiederholen unbegrenzt (praktisch bis 5000 Züge).

## Stufen
| Stufe | Raster | Quellen/Ziele | drehbare Spiegel | feste Spiegel | Filter | Hindernisse |
|---|---|---|---|---|---|---|
| Leicht | 5×5 | 1 | 2–3 | 0 | 0 | 2–3 |
| Mittel | 7×7 | 2–3 (verschiedene Farben) | 4–6 | 0–1 | 0 | 3–5 |
| Schwer | 9×9 | 3–4 | 7–9 | 1–2 | 1–2 | 5–8 |
Fortlaufender Level-Zähler je Stufe in `ctx.speicher` (`geloest`).

## Generator (garantiert lösbar, konstruktiv rückwärts)
1. Pro Quelle (am Rand, nach innen gerichtet) wird der **Lösungsweg** per Zufallsgang gebaut: gerade Strecke, dann an einem freien Feld
   ein Spiegel (Ausrichtung so gewählt, dass der Weg frei bleibt), ggf. Filter/fester Spiegel, am Ende ein Ziel. Eigene Wegfelder dürfen
   nur senkrecht gekreuzt werden, Elemente stehen nie auf fremden Wegfeldern, deshalb bleiben alle Wege unabhängig.
2. Hindernisse kommen nur auf Felder abseits aller Wege.
3. Der fertige Lösungsstand wird **nachgerechnet** (alle Ziele getroffen). Nur dann gilt das Level.
4. Dann werden mindestens `minFalsch` drehbare Spiegel verdreht (Seed-gesteuert) und geprüft, dass der Start **nicht** schon gelöst ist.
5. Schritt-Budget statt Zeit: bis 400 Versuche mit Teil-Seed `seed|stufe|versuch`, gleicher Seed → gleiches Level. Letzter Ausweg: festes,
   bewiesen lösbares Mini-Layout (zwei Spiegel).

## Hinweis
Der Lösungsstand (`l` je Spiegel) steckt im Spielstand. Der Hinweis markiert einen falsch stehenden Spiegel, bevorzugt am Weg einer noch
nicht getroffenen Quelle. Steht das Rätsel durch eine andere Lösung schon richtig, ist es ohnehin gelöst.

## Bedienung
Klick/Tippen auf einen Spiegel schaltet ihn um. Tastatur: Pfeile bewegen den Fokus im Raster, Enter/Leertaste schaltet. Sichtbarer Fokus,
`aria-label` je Feld („Zeile 2, Spalte 3: Spiegel …“). Farben aus `ctx.farben`; bei `musterAn()` zusätzlich Symbole in Quellen, Zielen und
Filtern sowie unterschiedliche Strichmuster der Strahlen. Layout ab 360 px (9×9 dort mit ca. 38 px Zellen). Keine Töne, keine Animationen.

## Datenmodell (`standVersion: 1`)
`{ v:1, stufe, level, seed, n, quellen:[{i,d,f}], ziele:[{i,f}], bloecke:[i], filter:[{i,f}], fest:[{i,o}], spiegel:[{i,o,o0,l,q}], zuege:[Spiegelindex…], vor:[…] }`
`i` = Zeile·n + Spalte, `d` 0 oben/1 rechts/2 unten/3 links, `o` 0 = `/`, 1 = `\`, `o0` Start-, `l` Lösungsstellung, `q` Quelle des Weges.
Ziel k gehört zu Quelle k. Laden prüft streng: Typen, Bereiche, eindeutige Felder, Zählgrenzen, `o` stimmt mit `o0` + Zügen überein,
und die Lösung `l` muss das Rätsel tatsächlich lösen. Ungültig → neues Level.

## Bewusst weggelassen
Prismen/Strahlteiler (nur Farbfilter), „teildrehbare“ Elemente, Strahlmischung.

## Tests
Reflexion, Strahlverlauf, Verschlucken, Filter, Ziel-Farbe, Gewinn, Spiegel umschalten + Rückgängig/Wiederholen, Neustart, Generator
(Seeds je Stufe: Invarianten, Lösung gewinnt, Start nicht gelöst, Determinismus), Hinweis, Spielstand-Validierung, Stille/CSP-Textprüfung,
Oberfläche (Klick, Tastatur, Gewinn, Symbole), Robustheit mit kaputten Ständen.
