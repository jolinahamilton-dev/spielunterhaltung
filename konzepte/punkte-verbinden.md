# Konzept: Punkte verbinden (`spiele/punkte-verbinden/`)

Eigenes Spiel nach dem Prinzip „gleichfarbige Nachbarpunkte zu einer Kette verbinden“.
ID `punkte-verbinden` · Name „Punkte verbinden“ · CSS-Präfix `pv-` · Beschreibung: „Gleichfarbige Punkte zu Ketten verbinden und Ziele sammeln.“
Eigene Optik (runde Punkte, farbige Kettenlinie, Ziele-Leiste mit Restzahlen), eigene Texte.

## Regeln
- Raster aus farbigen Punkten (Farben = `ctx.farben`-IDs, bei Mustern mit Symbol).
- Eine **Kette** läuft über waagerecht/senkrecht benachbarte Punkte **gleicher Farbe**, Mindestlänge 2. Zurückziehen auf das vorletzte Glied nimmt das letzte zurück. Eine Kante (Verbindung zweier Felder) darf nur einmal benutzt werden.
- Beim Loslassen (Maus/Finger) bzw. mit Enter (Tastatur) verschwinden alle Punkte der Kette. Darüber liegende Punkte fallen nach, neue kommen von oben (seeded Zufall, Zustand `rng` im Spielstand).
- **Schleife:** Führt die Kette zurück zu einem Punkt der eigenen Kette (Rechteck/Ring), verschwinden **zusätzlich alle** Punkte dieser Farbe im ganzen Feld.
- **Kein Timer, keine Zugbegrenzung, kein Game-over.**
- **Festgefahren** (kein gleichfarbiges Nachbarpaar): Meldung „Kein Zug mehr – Rückgängig oder Neu mischen“ + Knopf „Neu mischen“. Das Umordnen mischt die vorhandenen Punkte (seeded, garantiert danach mindestens ein Paar), zählt als Zug und ist rückgängig-fähig. Es wird nie heimlich gemischt.
- **Rückgängig** unbegrenzt (Verlauf im Spielstand, letzte 200 Einträge). Wiederholen gibt es nicht.
- **Hinweis:** zeigt gestrichelt eine mögliche Kette (längste gefundene; DFS mit Schritt-Budget je Startpunkt, Schleifen werden mitbewertet, Farben mit offenem Ziel bevorzugt).

## Varianten (`variantenTitel` = „Spielart“)
| id | Name | Raster | Farben | Ziele |
|---|---|---|---|---|
| `endlos` | Entspannt – endlos | 6×7 | 5 | keine; Zähler „Gesammelt“ + Rekord (`ctx.speicher` `rekord`) |
| `leicht` | Leicht – 6×6, 4 Farben | 6×6 | 4 | je Farbe 6–10 am Anfang, +1 je Level (max. +6) |
| `mittel` | Mittel – 6×7, 5 Farben | 6×7 | 5 | je Farbe 8–12, +1 je Level (max. +8) |
| `schwer` | Schwer – 7×8, 5 Farben | 7×8 | 5 | je Farbe 10–16, +1 je Level (max. +10) |

Level-Zähler je Stufe in `ctx.speicher` (`level` = `{leicht, mittel, schwer}`, nächstes zu spielendes Level). Nach Gewinn: `ctx.meldeGewonnen('Level n geschafft')`, Level-Zähler +1; „Neues Spiel“ der Shell startet das nächste Level (`neu(variante)`).

## Lösbarkeit
Nachfüllen ist zufällig; die Ziele sind moderat. Das Feld ist nie dauerhaft blockiert: ohne Paar bietet „Neu mischen“ (garantiert mit Paar) einen Ausweg. Das Startfeld enthält immer mindestens ein Paar. Jeder Zug sammelt ≥ 2 Punkte einer Farbe, Ziele sind also immer erreichbar.

## Bedienung
- **Maus/Finger:** Drücken auf einen Punkt, über Nachbarn ziehen (Treffer nur im mittleren Bereich eines Punktes, damit diagonales Wischen nicht versehentlich Felder trifft; schnelle Bewegungen werden entlang der Strecke abgetastet), loslassen. Zurückziehen nimmt Glieder zurück. Loslassen auf nur einem Punkt = nichts passiert.
- **Tastatur:** Pfeile bewegen den Cursor; Leertaste setzt ein Glied (startet die Kette, verlängert sie auf einen angrenzenden gleichfarbigen Punkt, oder nimmt das letzte Glied zurück, wenn der Cursor darauf steht); Enter bestätigt; Esc verwirft die Kette. Z/H/N über die Shell.
- Optik: Punkte als Kreise; Kette als Linie in der Farbe der Kette (SVG über dem Feld); Ketten-Glieder leicht vergrößert; Cursor als Ring. Verschwinden/Fallen ≤ 250 ms, bei `bewegungReduziert()` aus.
- Ziele-Leiste oben mit Punkt (Farbe/Symbol) und Restzahl je Farbe; erledigt = Häkchen.
- Layout ab 360 px, Felder ≥ 40 px, `touch-action: none` auf dem Feld, hell/dunkel über CSS-Variablen.

## Datenmodell (Spielstand, `standVersion: 1`, `version: 1`)
`{ version, variante, seed, rng:[4×uint32], b, hh, farben:[IDs], brett:[b·hh IDs] (Zeile für Zeile, 0 = oben), level, ziele:null|[…], rest:null|[…], gesammelt, zuege, verlauf:[{brett, rng, rest, gesammelt, zuege}] (≤ 200) }`
`ausSpeicher` prüft streng (Raster, Farben und Ziele müssen exakt zur Variante/zum Level passen; Typen, Längen, Wertebereiche; baut ein neues, bereinigtes Objekt) und liefert bei Fehler `null` → neues Spiel.

## Logik (`logik.js`, ohne DOM)
`stufenDaten`, `neuesSpiel`, `pfadSchritt` (Verlängern/Zurücknehmen), `pfadPruefen`, `schliesst`, `zug` (Entfernen, Schleife, Schwerkraft, Nachfüllen, Ziele, Verlauf), `festgefahren`, `umordnen`, `hinweis`, `rueckgaengig`, `gewonnen`, `ausSpeicher`/`zumSpeichern`.

## Tests (`tests/spiele/punkte-verbinden.test.js`)
Pfadgültigkeit (Nachbarschaft, Farbe, Kanten, Zurücknehmen), Schleifen, Schwerkraft/Nachfüllen deterministisch, Ziele/Gewinn, Festgefahren-Erkennung, Umordnen (Paar garantiert, deterministisch, Farbanzahl bleibt), Rückgängig, Hinweis, Validierung (strikt) inkl. Rundlauf, kein Audio/Vibration im Quelltext, Robustheit von `erstelle` mit manipulierten Ständen.

## Weiterspielen nach dem Ziel
Nach einem Gewinn meldet das Spiel `ctx.meldeGewonnen(text, { weiterspielen: true })`. Der Knopf „Weiterspielen ohne Ziel“ ruft `instanz.weiterspielen()` auf: Im Spielstand wird `weiter: true` gesetzt (Feld bleibt, Ziele werden ausgeblendet, Anzeige „Ohne Ziel · Level n“ + Zähler „Gesammelt“). Das Ziel wird nie ein zweites Mal gemeldet (`gewonnen(z)` ist bei `weiter` immer false). Das Flag überlebt Neuladen; alte Stände ohne Flag gelten als `false`; `weiter: true` ist nur bei Zielstufen gültig, sonst wird der Stand verworfen (streng, Typ boolean). Der Level-Zähler wurde schon beim Gewinn erhöht. Gesammelte Punkte zählen **nicht** für den Endlos-Rekord (er gehört der Variante `endlos`; hier wurde ein Feld mit Zielen gespielt, das wäre nicht vergleichbar), und es gibt keinen Rekord-Zähler im Weiterspielen.
