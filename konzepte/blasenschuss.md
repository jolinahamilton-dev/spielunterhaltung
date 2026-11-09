# Konzept: Blasenschuss (`spiele/blasenschuss/`)

Eigenes Spiel nach dem allgemeinen Prinzip der „Bubble-Shooter“ (Recherche: Blasen von unten abschießen, ab 3 gleichfarbigen platzen sie, Blasen ohne Verbindung zur Decke fallen ab; Flood-Fill von der Decke). ID `blasenschuss` · Name „Blasenschuss“ · Präfix `bs-` · `standVersion` 1. Eigene Optik, Texte und Level, kein Nachbau.

## Regeln
- **Hexfeld:** 9 Spalten, 12 Zeilen; Zeilen wechseln zwischen 9 und 8 Blasen (halber Versatz). Geometrie in Blasen-Radien: Durchmesser 2, Zeilenabstand √3, Feldbreite 18, Schusspunkt (9 | 23,6). Die Versatz-Parität der Decke steht als `kopf` im Stand (wichtig, wenn oben Reihen dazukommen).
- **Schuss:** Winkel −80° … +80° (0 = senkrecht). Die Blase fliegt in festen Schritten (0,2), prallt an den Seitenwänden, stoppt an der Decke oder bei Berührung (Abstand < 1,75) und rastet auf dem **nächsten freien Hexfeld** ein, das an der Decke oder an einer Blase liegt. Schrittbudget 3000 als Schutz. Winkel-Sinus/Kosinus werden auf 6 Stellen gerundet → gleiches Ergebnis auf jedem Gerät.
- **Platzen:** ≥ 3 gleichfarbige verbundene Blasen (Flood-Fill) platzen. Danach fallen alle Blasen ab, die über Nachbarn keinen Weg zur Decke (Zeile 0) haben.
- **Spezialblasen:** *Regenbogen* (Schuss) nimmt beim Einrasten die Farbe, die die größte Gruppe ergibt (sonst häufigste Farbe im Feld). *Bombe* (Schuss) sprengt sich und alle Nachbarn außer Steinen. *Stein* (nur im Feld, Level): nie zerstörbar, fällt aber, wenn er lose ist. Schuss-Spezialblasen kommen in Level ab 8 und im Endlos-Betrieb (≈ 5 % Bombe, 4 % Regenbogen).
- **Kein Game-over, kein Timer:** Erreicht eine Blase die unterste Linie (Zeile 11), wird diese Reihe ruhig entfernt (Meldung „Unterste Reihe entfernt“) und es geht weiter.
- **Schussfolge:** aktuelle + nächste Blase; Tausch per Tippen auf die nächste Blase, Knopf oder Taste T. Gezogen werden nur Farben, die noch im Feld vorkommen; nach jedem Schuss werden Blasen mit verschwundener Farbe ersetzt (sonst unlösbar). Seeded (sfc32), Zustand im Spielstand.

## Varianten (`ctx.variante`)
- **`level` – Level – mit Ziel:** Ziel: alle Blasen entfernen. 30 musterbasierte Level (Streifen, Zufall mit Gruppen, Diagonale, Spalten, Pyramide, Schach, Ringe; Farben 3 → 6, Reihen 4 → 8, Steine 0 → 10), danach erzeugt aus der Levelnummer (Seed `bs-level-n`). Nächstes Level in `ctx.speicher('level')`. Nach dem Ziel `ctx.meldeGewonnen(text, { weiterspielen: true })`; `instanz.weiterspielen()` setzt `weiter` im Stand und fügt 3 frische Reihen ein (das leere Feld wird wie Endlos weitergespielt, nie ein zweites Mal gewonnen). Restliche Steine fallen beim Ziel mit ab.
- **`endlos` – Endlos – ohne Ziel:** Startfeld 5 Reihen (4 Farben, +1 je 10 Reihen bis 6). Nach **6 Fehlschüssen** (Schüsse ohne Platzen, kumuliert) rückt die Decke nach unten: oben kommt eine neue Reihe, die unterste wird bei Bedarf entfernt. Leeres Feld → 3 neue Reihen. Zähler „geplatzte Blasen“ + Rekord (`ctx.speicher('rekord')`).

## Bedienung
Maus: Zeiger bewegen zielt, Klick schießt; Ziehen/Finger: aufsetzen und ziehen zielt (gestrichelte Hilfe mit Wandprall + Zielfeld), Loslassen schießt, Loslassen im Bereich unter dem Schusspunkt bricht ab. Tastatur: ←/→ ±1° (Umschalt ±5°), Enter/Leertaste schießt, T tauscht. Shell: Z Rückgängig (unbegrenzt, 100 Zustände), H Hinweis (simuliert Kandidatenwinkel für aktuelle und nächste Blase; zeigt Zielhilfe und ggf. „besser tauschen“). Muster an → Symbol in jeder Blase.

## Technik
`logik.js` ohne DOM: `fliegen` (Simulation), `schiesse` (Platzen, Abfallen, Kappen, Endlos-Reihe, Folge), `lose` (Flood-Fill), `hinweis`, `rueckgaengig`, `tausche`, Level-Generator, strenge Validierung (`istGueltig`/`ausSpeicher`). Die Animation spielt den Pfad ab (≤ 250 ms je Phase); bei `bewegungReduziert()` direkt Ergebnis.

## Datenmodell (standVersion 1)
`{ modus, seed, rng[4], level, farben, spezial, brett[108], kopf, aktuell, naechste, fehl, schuesse, blasen, reihen, weiter, winkel, verlauf[≤100 Schnappschüsse] }`; Brett-Codes 0 leer · 1–6 Farben · 9 Stein; Schuss-Codes 1–6, 7 Bombe, 8 Regenbogen.

## Tests (`tests/spiele/blasenschuss.test.js`)
Einrasten (Decke, Wandprall, Nachbar), Gruppen-Platzen, Abfallen (Flood-Fill), Determinismus, Farbfolge nur vorhandene Farben, Spezialblasen, Endlos-Reihe, Linie, Level lösbar (einfache Strategie), Weiterspielen-Flag, Rückgängig, Validierung/Fuzz, Oberflächen-Basics.
