# Wortsuche – Konzept

Ruhiges Suchspiel: In einem Buchstabengitter stecken deutsche Wörter zu einem Thema. Die Liste der gesuchten
Wörter steht neben (PC) bzw. unter (Handy) dem Gitter. Gefundene Wörter werden im Gitter farbig hinterlegt
und in der Liste durchgestrichen. Kein Timer, keine Punkte, keine Töne.

## Regeln
- Ein Wort gilt als gefunden, wenn genau die Strecke vom ersten bis zum letzten Buchstaben ausgewählt wird
  (auch rückwärts ausgewählt, also vom letzten zum ersten Buchstaben).
- Jedes gesuchte Wort steht **genau einmal** im Gitter (in keiner der 8 Richtungen ein zweites Mal).
- Gewonnen, wenn alle Wörter gefunden sind → `meldeGewonnen('Thema: Tiere · Mittel')`.

## Stufen (Varianten)
| Stufe  | Gitter | Richtungen                  | Wörter |
|--------|--------|-----------------------------|--------|
| Leicht | 9×9    | → ↓                         | 8      |
| Mittel | 12×12  | → ↓ ↘ ↗                     | 12     |
| Schwer | 15×15  | alle 8 (auch rückwärts)     | 16     |

Fortlaufende Level je Stufe (gelöste Level in `ctx.speicher` → `geloest[stufe]`). Das Thema wechselt mit dem
Level: feste, gemischte Themenreihenfolge je Stufe, Level L nimmt Thema `(L-1) mod Anzahl`.

## Wörter (`woerter.json`)
24 Themen mit je 15–30 gebräuchlichen, familienfreundlichen Wörtern (selbst zusammengestellt).
Normalisierung: `toUpperCase('de')` – Ä Ö Ü bleiben eigene Buchstaben, ß → SS. Länge nach Normalisierung 3–12.
Für ein Gitter werden nur Wörter genommen, die hineinpassen, keine Palindrome und keine Paare, bei denen ein
Wort (vorwärts oder rückwärts) im anderen steckt (z. B. nicht BLAU und HIMMELBLAU zusammen).

## Generator (`logik.js`, ohne DOM, Seed + Schritt-Budget)
1. Wörter wählen (gemischt mit Seed), längste zuerst platzieren. Für jedes Wort alle möglichen Lagen
   (Start, Richtung) aufzählen; Lagen mit Überkreuzung (passender Buchstabe) werden bevorzugt.
2. Leere Felder mit Buchstaben füllen, gewichtet nach der Buchstabenhäufigkeit im Deutschen (inkl. Ä Ö Ü selten).
3. Prüfen: jedes Wort kommt in allen 8 Richtungen zusammen genau einmal vor. Zufällige Zweitvorkommen werden
   repariert, indem ein Füllbuchstabe darin neu gezogen wird; besteht ein Zweitvorkommen nur aus Wortbuchstaben,
   wird der Versuch verworfen.
4. Alles zählt Schritte; das Budget ist großzügig (Generator braucht wenige ms, daher kein Worker).

## Bedienung
- **Ziehen** (Maus/Finger) vom ersten zum letzten Buchstaben; die Auswahl rastet auf die 8 Richtungen ein,
  eine Linie zeigt sie an.
- **Antippen**: ersten Buchstaben antippen (markiert), dann letzten. Gleicher Buchstabe nochmal = abbrechen;
  ein nicht in Linie liegender Buchstabe wird neuer Anfang.
- **Tastatur**: Pfeile bewegen den Cursor (Pos1/Ende), Enter/Leertaste setzt Anfang, zweites Enter/Leertaste
  setzt Ende, Esc bricht ab. Während ein Anfang gesetzt ist, zeigt eine Linie die Auswahl bis zum Cursor.
- Falsche Auswahl verschwindet ruhig (keine Meldung, kein Wackeln).
- **Hinweis** (H): markiert den Anfangsbuchstaben eines noch nicht gefundenen Wortes; zweiter Hinweis
  umrahmt das ganze Wort.
- **Rückgängig/Wiederholen** unbegrenzt: ein gefundenes Wort = ein Eintrag.
- Handy: Gitter füllt die Breite, Wortliste darunter als kompakte Liste, einklappbar.

## Datenmodell (Spielstand, `standVersion: 1`)
```js
{ v: 1, stufe: 'mittel', level: 3, thema: 'Tiere', seed: 'abc', n: 12,
  gitter: ['H','U',…],                       // n*n Buchstaben (A–Z, Ä, Ö, Ü)
  woerter: [{ w: 'HUND', r: 0, c: 0, dr: 0, dc: 1 }, …], // Lage jedes Wortes
  gefunden: [3, 0, …],                        // Indizes in Fund-Reihenfolge (= Rückgängig-Verlauf)
  vor: [],                                    // Wiederholen-Stapel
  hinweis: null | { i: 2, s: 1|2 } }          // aktiver Hinweis (1 = Anfang, 2 = ganzes Wort)
```
Beim Laden wird alles streng geprüft (Typen, Längen, Buchstaben, Lagen passen zum Gitter, Richtungen zur
Stufe, Indizes eindeutig). Ungültig → neues Spiel.

## Tests (`tests/spiele/wortsuche.test.js`)
Wortliste (Anzahl, Schreibweise, Längen, keine Dubletten), Normalisierung (ß → SS), Generator für alle Stufen
und viele Seeds (Größe, Richtungen, Wörter passen, jedes Wort genau einmal), Determinismus, Auswahl/Linie,
Finden + Rückgängig/Wiederholen, Hinweis, Gewinn, Speichern/Laden, kaputte Stände, „still“-Prüfung.
