# Konzept: Solitär (`spiele/solitaer/`)

Klassische Patience nach den allgemein bekannten Klondike-Regeln. Eigene Kartengrafik (Herz, Karo, Pik, Kreuz als selbst gezeichnete SVG-Formen, keine fremden Assets).
ID `solitaer` · Name „Solitär“ · CSS-Präfix `so-` · Beschreibung: „Karten nach Farbe und Reihenfolge ordnen – klassische Patience.“

## Regeln
- 52 Karten. 7 Spalten (1 bis 7 Karten, nur die oberste liegt offen), Rest = Stapel (24). Vier Ablagen (je Kartenfarbe) von Ass bis König.
- Spalten: absteigend, Rot/Schwarz abwechselnd. Eine Folge offener Karten wandert gemeinsam. Auf freie Spalten darf nur ein König (mit Folge).
- Stapel: „Ziehen“ legt 1 (leicht) bzw. 3 (mittel, schwer) Karten auf den Ablagestapel, nur die oberste ist spielbar. Ist der Stapel leer, dreht ein Tipp den Ablagestapel um (unbegrenzt viele Durchgänge).
- Aus der Ablage zurück in eine Spalte ist erlaubt (oberste Karte einer Ablage).
- Gewonnen: alle vier Ablagen voll. Kein Game-over, kein Timer, keine Punkte; nur ein Zugzähler. Ist kein weiterführender Zug mehr möglich: Hinweis „Kein Zug mehr – Rückgängig oder Neustart“.

## Stufen
| Stufe | Ziehen | Garantie |
|---|---|---|
| Leicht | 1 | Löser-geprüft lösbar, und zwar mit kleiner Suchtiefe (Löser findet es mit ≤ 4000 Knoten) |
| Mittel | 3 | reine Zufallsmischung (seeded), keine Garantie |
| Schwer | 3 | Löser-geprüft lösbar, aber nicht „offensichtlich“ (der Löser braucht mehr als 250 Knoten) |

## Löser und Generator
- **Zug-Kodierung** (kleine Zahlenlisten, JSON-tauglich): `[0]` ziehen · `[1]` Ablagestapel umdrehen · `[2,c]` Ablage→Spalte · `[3]` Ablage→Ablagefeld · `[4,a,b,n]` n Karten Spalte a→b · `[5,a]` Spalte a→Ablagefeld · `[6,s,b]` Ablagefeld s→Spalte b · `[7]` „Automatisch auf Ablagen“ (alle möglichen Karten, ein Zug).
- **Zustand**: `{ sp:[{k:[Karten], zu:Anzahl verdeckter}], f:[Anzahl je Farbe], stapel, ablage, zieh }`. Karte = 0–51 (`Farbe = id div 13`, `Rang = id mod 13`).
- **Löser** (`loese`): Tiefensuche mit Gedächtnis (Spalten sortiert, bei Ziehen-1 ist der Stapel rotationsinvariant). Sichere Ablagezüge werden erzwungen. Stapel-Makrozüge: „n× ziehen, dann Karte spielen“. Zugreihenfolge nach Heuristik (aufdecken, leeren, Stapel zuletzt). **Schritt-Budget (Knoten), keine Zeit** → gleicher Seed, gleiches Ergebnis auf jedem Gerät.
- **Generator**: Versuch k mischt mit Seed `seed|stufe|k`, prüft mit dem Löser; der erste Treffer gewinnt. Letzter Ausweg (nach 150 Versuchen): deterministisch gesuchtes lösbares Deck (`rueckfallDeck`, im Test belegt).
- **Hinweis**: Löser vom aktuellen Stand (Worker); erster Zug der Lösung. Kein Weg gefunden: Hinweis auf Rückgängig, sonst heuristischer Zug.
- **Kein Zug mehr**: begrenzte Suche nach einem Zustand mit mehr Karten auf den Ablagen oder weniger verdeckten Karten.

## Bedienung
- Tippen/Klick auf eine Karte: Karte (samt Folge) geht automatisch auf das beste Ziel (Ablage vor Spalte). Tippen auf den Stapel zieht/dreht um. Tippen auf eine Ablage legt die oberste Karte in eine passende Spalte.
- Ziehen per `ctx.eingabe.ziehen`: Karten auf Spalte oder Ablage ablegen (gültige Ziele leuchten).
- Tastatur: Pfeile bewegen den Fokus (oben: Stapel, Ablagestapel, 4 Ablagen; unten: die Spalten, Hoch/Runter innerhalb der Karten), Enter bewegt automatisch, Leertaste zieht vom Stapel, `A` = „Automatisch auf Ablagen“. Z/Y/H/N wie überall.
- Knopf „Automatisch auf Ablagen“, Rückgängig/Wiederholen unbegrenzt (bis 6000 Züge), Hinweis.
- Layout ab 360 px (7 Spalten, Karten überlappen vertikal), hell/dunkel, Karten behalten ihre helle Fläche. Kartenfarben nie allein: vier verschiedene Formen plus Ziffern.

## Datenmodell (Spielstand)
`{ v:1, stufe, seed, deal:[52 Karten], zuege:[Züge], vor:[Züge] }` – der Zustand wird durch Wiederholen der Züge berechnet. Streng validiert: `deal` ist eine Permutation von 0–51, jeder Zug muss legal sein (auch `vor`, rückwärts angewendet), Länge ≤ 6000.

## Tests
Karten/Regeln (Folgen, Könige, Aufdecken), Stapel Ziehen-1/3/Umdrehen, Automatik, Rückgängig/Wiederholen, Spielstand-Validierung, Löser (Lösung spielt bis zum Sieg), Generator je Stufe (Lösbarkeit, Determinismus), festes Rückfall-Deck, Hinweis, Kein-Zug-Erkennung, kein Audio/eval/innerHTML.
