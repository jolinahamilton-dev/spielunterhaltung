# Sechseck-Stapel

Ruhiges Sortier-/Stapelspiel auf einer Wabe aus Sechseck-Feldern. Eigene Umsetzung, eigene Texte und Grafik.

## Regeln
- Spielfeld: Wabe aus spitz-oben stehenden Sechsecken (axiale Koordinaten q, r).
  Radius 3 = **37 Felder**; „Schwer“ ohne die sechs Ecken = **31 Felder**.
- Unten liegen immer **drei Stapel**. Ein Stapel besteht aus 2–6 Plättchen in 1–3 Farbschichten
  (unten → oben; zwei benachbarte Schichten haben nie dieselbe Farbe).
- Die Spielerin legt einen Stapel auf ein **freies** Feld. Sind alle drei gelegt, kommen drei neue.
- **Zusammenführen (deterministisch):** Nach dem Legen wird eine Warteschlange abgearbeitet, Start = gelegtes Feld.
  Für das vorderste Feld C mit oberster Farbe c bilden C und alle Nachbarn mit oberster Farbe c die Gruppe G.
  Ziel T ist der Stapel in G mit der **längsten gleichfarbigen Oberschicht**; Gleichstand → weniger Plättchen
  darunter (reinerer Stapel) → C selbst → kleinster Feldindex. Die Oberschichten aller anderen Stapel in G wandern
  auf T (ein Animationsschritt). Danach kommen T und alle Quellen, die nicht leer sind, wieder in die Warteschlange
  (Kettenreaktion). Jede Zusammenführung verringert die Gesamtzahl der Farbschichten auf dem Feld – das Verfahren endet
  immer (zusätzlich Schritt-Budget 2000).
- **Auflösen:** Hat T danach oben **≥ 10 gleichfarbige Plättchen**, verschwinden alle davon.
  Punkte: Anzahl × k, wobei k die laufende Nummer der Auflösung in diesem Zug ist (Kette 1, 2, 3 …).
- **Ende „Klassisch“:** kein Feld mehr frei → ruhige Ende-Karte im Spiel mit „Letzten Zug zurück“ (insgesamt 3× je Spiel)
  und „Neues Spiel“.
- **„Entspannt“:** Rückgängig unbegrenzt (Verlauf 60 Züge). Ist das Feld voll, werden automatisch die sechs kleinsten
  Stapel abgeräumt (ohne Punkte) – das Spiel endet nie.

## Varianten (`variantenTitel: 'Spielart'`)
| id | Name | Farben | Felder | Modus |
|---|---|---|---|---|
| entspannt | Entspannt – endet nie | 4 | 37 | entspannt |
| leicht | Leicht – 4 Farben, 37 Felder | 4 | 37 | klassisch |
| mittel | Mittel – 5 Farben, 37 Felder | 5 | 37 | klassisch |
| schwer | Schwer – 6 Farben, 31 Felder | 6 | 31 | klassisch |

Rekord je Variante in `ctx.speicher` (`rekorde`).

## Angebot (fair gewichtet, Seed)
- Seeded RNG (`kern/zufall.js`), RNG-Zustand im Spielstand → Rückgängig würfelt nicht neu.
- Plättchenzahl 2–6 (Gewichte 2:1, 3:3, 4:4, 5:3, 6:2). Schichten 1/2/3 je Variante:
  Entspannt 50/40/10 %, Leicht 45/40/15 %, Mittel 35/45/20 %, Schwer 25/45/30 %.
- Farbe je Schicht: Gewicht 1 + z × (Zahl der Feldstapel mit dieser obersten Farbe, max. 6) mit z = 0,6 / 0,4 / 0,2 / 0
  (Entspannt/Leicht/Mittel/Schwer); Farben, die im aktuellen Dreier schon oben liegen, zählen halb – so passen Angebote
  meistens irgendwo, ohne immer gleich zu sein.
- Hinweis: alle Stapel × freie Felder durchrechnen, Wert = 100 × aufgelöste + 10 × gewanderte Plättchen + 3 × freie Felder
  + 2 × passende Nachbarn + Randabstand (Einzelgänger lieber an den Rand).

## Bedienung
- Ziehen (Maus/Finger) aus dem Angebot aufs Feld; Vorschau: halbtransparenter Stapel im Zielfeld, Nachbarn mit gleicher
  Oberfarbe sind markiert. Am Finger schwebt der Stapel über dem Finger.
- Antippen eines Stapels → Feld antippen (Maus: legt sofort; Touch: erstes Tippen Vorschau, zweites legt).
- Tastatur: 1–3 wählt Stapel, Pfeile bewegen den Feld-Cursor (links/rechts in der Reihe, hoch/runter zur nächstgelegenen
  Wabe der Nachbarreihe), Tab/Umschalt+Tab springt bei gewähltem Stapel zum nächsten freien Feld, Enter/Leertaste legt ab,
  Esc hebt die Auswahl auf. H = Hinweis (Ablageort mit den meisten Auflösungen/Zusammenführungen).
- Wander-Animation je Schritt ≤ 220 ms, abschaltbar (`bewegungReduziert`). Symbole auf den Plättchen bei `musterAn()`.

## Datenmodell (Spielstand, `standVersion: 1`)
`{ version:1, variante, seed, rng:[4 Zahlen], brett:[[Farbe…]…] (je Feld unten→oben, leer = []), angebot:[Stapel|null ×3],
punkte, zuege, aufgeloest, rueckgaengigRest (null = unbegrenzt), verlauf:[Stände ohne verlauf], beendet }`
Das Feld-Layout folgt fest aus der Variante; beim Laden werden Länge, Typen, Farben (< Farbanzahl) und Stapelhöhe (≤ 80)
geprüft – sonst neues Spiel.

## Tests (`tests/spiele/sechseck-stapel.test.js`)
Layout/Nachbarn, Zusammenführen einfach + Ziel-Regel + Kette, Auflösen ≥ 10 inkl. Kettenpunkte, Terminierung bei vollem
Feld, Angebot (Seed gleich, Schichten, Farben im Bereich, Gewichtung), Rückgängig (Klassisch 3×, RNG bleibt), Ende Klassisch,
Entspannt endet nie (300 Züge), Hinweis, Speichern/Laden/Validierung.
