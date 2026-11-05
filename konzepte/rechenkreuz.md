# Rechenkreuz

Rechenaufgaben der Form `A ○ B = C` (○ ∈ + − × ÷) liegen waagerecht und senkrecht in einem Raster
wie ein Kreuzworträtsel und teilen sich Zahlenfelder. Einige Zahlen sind vorgegeben; die fehlenden
liegen als Kärtchen im Vorrat unter dem Raster. Ziel: alle Kärtchen so einsetzen, dass jede
Gleichung stimmt. Kein Timer, keine Töne, unbegrenztes Rückgängig/Wiederholen.

## Raster
- Zahlen liegen auf einem **Gitter** `lb × lh` (Gitterpunkte); dazwischen Rechenzeichen bzw. „=“.
  Darstellung: `(2·lb−1) × (2·lh−1)` Zellen, Zahlenspalten breit, Zeichenspalten schmal.
- Eine Gleichung belegt drei Gitterpunkte in einer Zeile (waagerecht) oder Spalte (senkrecht).
- Regeln fürs Layout: zwei parallele Gleichungen auf derselben Linie überlappen nicht;
  zwei benachbarte Gitterpunkte einer Zeile (Spalte) gehören immer zur selben waagerechten
  (senkrechten) Gleichung – so liest sich jede Zeile eindeutig. Alles hängt zusammen.
- Layouts: das klassische 3 × 3-Muster (6 Gleichungen) und zufällig gewachsene, unregelmäßige Muster.

## Stufen
| Stufe | Zeichen | Zahlen | Gitter | Gleichungen | Lücken |
|---|---|---|---|---|---|
| Leicht | + − | 1–20 | 3 × 3 | 4–6 | ≈ 40 % |
| Mittel | + − × | 1–50 | 4 × 4 | 5–7 | ≈ 55 % |
| Schwer | + − × ÷ | 1–100 | 5 × 5 | 7–10 | ≈ 70 % |

Alle Zahlen sind ganze Zahlen ≥ 1, Division ohne Rest, bei × und ÷ keine 1 als Faktor/Teiler/Ergebnis.
Fortlaufende Level je Stufe (`ctx.speicher` → `geloest[stufe]`).

## Generator (Seed + Schritt-Budget, im Worker)
1. Layout wachsen lassen (zufällige Kandidaten, die ein vorhandenes Feld kreuzen und die Regeln einhalten).
2. Rechenzeichen wählen (Mittel/Schwer: möglichst jedes Zeichen einmal), Werte per Backtracking
   mit Propagation (zwei bekannte Zahlen einer Gleichung erzwingen die dritte).
3. Felder in Zufallsreihenfolge leeren, solange der **Löser** (Propagation + Backtracking über den
   Kärtchen-Vorrat, Abbruch bei 2 Lösungen, Schritt-Budget) genau eine Lösung findet.
   Budget überschritten → Feld bleibt vorgegeben.
Rein über Schrittzahlen begrenzt: gleicher Seed → gleiches Rätsel.

## Bedienung
- Kärtchen antippen → leeres Feld antippen · Feld antippen → Kärtchen antippen · Kärtchen aufs Feld ziehen
  (auch gesetzte Zahl auf ein anderes Feld oder zurück in den Vorrat ziehen).
- Gesetzte Zahl antippen → zurück in den Vorrat. Feld mit Zahl + Kärtchen → tauschen.
- Tastatur: Pfeile bewegen den Feld-Cursor, Ziffern sammeln (eindeutig → sofort setzen, sonst Enter),
  Rücktaste löscht Ziffer bzw. Zahl, Entf entfernt, Esc bricht ab, Enter/Leertaste wählt das Feld.
- Volle Gleichungen: grün (richtig) bzw. dezent rot (falsch, nur mit „Fehler markieren“).
- Hinweis: nimmt zuerst eine falsche Zahl heraus, sonst setzt er eine richtige (bevorzugt am Cursor); markiert das Feld.

## Datenmodell (Spielstand, `standVersion: 1`)
`{ v, stufe, level, seed, lb, lh, gl: [[richtung, zeile, spalte, zeichen]], loesung: [Zahl|0],
vorgabe: [0|1], karten: [Zahl], belegt: [Kartenindex|-1], verlauf: [[[feld, alt, neu], …]], vor: […] }`
Ein Zug ist eine Liste von Feldänderungen (Kartenindex vorher/nachher); Rückgängig kehrt sie um.
Beim Laden wird alles geprüft (Typen, Grenzen, Gleichungen stimmen mit der Lösung, Kärtchen = fehlende Zahlen).

## Tests
Gleichungsprüfung, Layout-Regeln, Generator (alle Stufen, viele Seeds: Werte gültig, eindeutig,
Vorrat = fehlende Zahlen, deterministisch), Löser (eindeutig/mehrdeutig/Budget), Züge/Rückgängig,
Hinweis bis zum Gewinn, Speichern/Laden inkl. kaputter Stände.
