# Konzept: Block-Puzzle („Klötzchen“)

Modul: `spiele/block-puzzle/index.js` · ID `block-puzzle` · Name „Klötzchen“
Beschreibung: „Formen auf ein 8×8-Feld legen. Volle Reihen und Spalten verschwinden.“

## 1. Spielidee & Regeln

- Spielfeld 8×8, anfangs leer. Unter dem Feld liegen immer **drei Formen** („Angebot“).
- Eine Form wird auf freie Felder gelegt; sie darf nicht überlappen oder überstehen.
- Danach: jede **vollständig gefüllte Reihe und Spalte** verschwindet (gleichzeitig geprüft, Kreuzungen zählen einmal).
- Sind alle drei Formen gelegt, kommt ein neues Dreier-Angebot.
- **Ende** (nur im Modus Klassisch): keine der verbleibenden Formen passt irgendwo. Es gibt kein Zeitlimit.
- Formen werden **nicht gedreht** – jede Ausrichtung ist ein eigener Katalogeintrag. Das hält die Bedienung einfach
  (kein Drehknopf, keine Doppelbelegung von Gesten). Option „Drehen erlauben“ (Taste R / Doppeltipp) nur im Entspannt-Modus, standardmäßig aus.

### Formen-Katalog (eigene Benennung, 1–9 Zellen)

| Gruppe | Formen (Ausrichtungen) | Gewicht |
|---|---|---|
| Punkt | 1×1 | 2 |
| Stäbe | 1×2, 2×1, 1×3, 3×1 | je 3 |
| Lange Stäbe | 1×4, 4×1, 1×5, 5×1 | je 2 / 1 |
| Quadrate | 2×2 (4 Zellen) · 3×3 (9 Zellen) | 4 · 1 |
| Rechtecke | 2×3, 3×2 | je 1 |
| Kleiner Winkel | 3 Zellen in 2×2, 4 Ausrichtungen | je 2 |
| L / J | 4 Zellen, 8 Ausrichtungen | je 1 |
| T | 4 Zellen, 4 Ausrichtungen | je 1 |
| S / Z | 4 Zellen, 4 Ausrichtungen | je 1 |
| Großer Winkel | 5 Zellen in 3×3-Ecke, 4 Ausrichtungen | je 1 |

Katalog als Daten (`formen.js`): `{ id: 'L4-a', zellen: [[0,0],[1,0],[2,0],[2,1]], gewicht: 1, farbe: 3 }`.
Farben kommen aus `ctx.farben` (Palette nach Gruppe, nicht nach Markenvorbild).

## 2. Bedienung

**PC (Maus)**
- Form im Angebot greifen und ziehen; Form klebt am Mauszeiger mit dem gegriffenen Punkt.
- Alternativ: Form anklicken (wird ausgewählt), Vorschau folgt dann der Maus über dem Feld, Klick legt ab.
- Rechtsklick / Esc: Auswahl aufheben, Form springt zurück.

**Tastatur** (über `onTaste(event)`)
- `1`/`2`/`3`: Form wählen (erscheint mittig auf dem Feld als Vorschau), `Tab`: nächste Form.
- Pfeiltasten: Vorschau bewegen (am Rand blockiert), `Enter`/`Leertaste`: ablegen (nur wenn gültig).
- `Esc`: abbrechen · `Strg+Z`/`Z`: rückgängig · `J`: Neue-Formen-Joker · `P`: Pause · `R`: drehen (falls erlaubt).
- Sichtbarer Fokusrahmen; Startposition der Vorschau = erste gültige Position nahe der Mitte.

**Handy (Touch)**
- Form antippen und ziehen. Bei `pointerType === 'touch'` schwebt die Form **ca. 1,5 Zellen über dem Finger**
  und wird beim Greifen auf Feldgröße vergrößert (im Angebot ist sie verkleinert).
- Loslassen über gültiger Position → ablegen, sonst Rücksprung (ruhig, 150 ms).
- Tippen statt Ziehen: Form antippen → Vorschau erscheint, Tippen aufs Feld verschiebt sie, zweites Tippen auf die Vorschau legt ab.
- `touch-action: none` auf Feld und Angebot, damit nichts scrollt.

**Vorschau (beide)**: Geisterform in Formfarbe (halbtransparent) an der eingerasteten Position; Reihen/Spalten, die
verschwinden würden, werden dezent hervorgehoben. Ungültig: Geister-Umriss grau, keine Hervorhebung.
Einrasten: nächste Zelle zum Formursprung (gerundet), Toleranz eine halbe Zelle.

## 3. Modi & Optionen

| | Klassisch | Entspannt |
|---|---|---|
| Ende | wenn nichts passt | nie |
| Formen-Garantie | ≥1 Form des Angebots passt beim Erzeugen (best effort) | alle drei in einer Reihenfolge legbar |
| Rückgängig | 3 pro Spiel | unbegrenzt |
| Neue-Formen-Joker | 1 zu Beginn, +1 alle 1500 Punkte (max. 3) | unbegrenzt |
| Highscore | eigene Liste | eigene Liste |

- Entspannt: Passt nichts mehr, wird automatisch (mit Hinweistext, ohne Strafe) ein neues, passendes Angebot ausgegeben.
- Optionen (in `ctx.einstellungen`): Animationen an/aus (Standard folgt `prefers-reduced-motion`), Vorschau der Reihen an/aus,
  Drehen erlauben (nur Entspannt), Punkte-Anzeige ausblenden („nur legen“), Gitterlinien stark/schwach.
- Kein Timer nötig; Pause jederzeit (Feld wird abgedunkelt, Zustand bleibt).

## 4. Algorithmen

**Brett als Bitboard**: 64 Bit als zwei `Uint32` (Zeilen 0–3 / 4–7) oder `BigInt`. Für Formen vorberechnete Masken je Position.
Farben getrennt in `Uint8Array(64)` (0 = leer).

```
passt(brett, form, x, y): (brett & maske[form][x][y]) == 0   // maske nur für gültige x,y
legeAb(brett, form, x, y):
  brett |= maske; volleZ = Zeilen mit (brett & zeilenMaske[z]) == zeilenMaske[z]; analog Spalten
  entferne = OR der vollen Masken; brett &= ~entferne
  return { brett, anzahlLinien: volleZ.len + volleS.len, entfernteZellen }
```

**Punkte**
- Ablegen: +1 pro Zelle der Form.
- Linien im selben Zug (n): `10 · n · (n+1) / 2` → 1: 10, 2: 30, 3: 60, 4: 100 …
- Serie: jeder Zug mit Abräumen erhöht `serie`; Faktor `1 + 0,5 · (serie − 1)`, max. ×4.
  Die Serie bricht erst nach **3 Zügen ohne Abräumen** (nachsichtig statt strafend).
- Feld komplett leer nach Abräumen: +300.
- Punkte werden gerundet ganzzahlig; Anzeige zählt kurz hoch (abschaltbar).

**Formen-Auswahl: fair gewichtet mit Seeded RNG** (statt rein zufällig)
- `rng = ctx.zufall(seed)`; RNG-Zustand gehört zum Spielstand → Rückgängig bringt kein „Neuwürfeln“.
- Ziehen nach Gewicht; innerhalb eines Angebots keine identische Form doppelt; 9-Zellen-Formen max. 1 pro Angebot.
- Leichte Anpassung an das Brett: ist das Brett > 60 % voll, werden kleine Formen (≤3 Zellen) doppelt gewichtet.
- Garantie Klassisch: bis zu 20 Versuche, bis mindestens eine Form passt; danach wird das Angebot trotzdem genommen (echtes Ende möglich).
- Garantie Entspannt: Suche, ob alle drei Formen in **einer** Reihenfolge legbar sind (inkl. Abräumen dazwischen):

```
legbar(brett, formen):
  if formen leer: return true
  for f in formen: for pos in positionen(f):        // max. 64, früher Abbruch
      if passt(brett, f, pos) and legbar(legeAb(brett,f,pos).brett, formen ohne f): return true
  return false
```
  Schlimmster Fall 6 Reihenfolgen × 64³ – praktisch durch frühen Erfolg und Bitmasken < 5 ms. Zeitbudget 30 ms,
  danach Rückfall „mindestens eine passt + kleinste Form ersetzt durch 1×1“. Kein Worker nötig.

**Ende-Prüfung**: nach jedem Zug `angebot.some(f => existiertPosition(brett, f))`.

## 5. Funktionen

- Ziehen/Ablegen mit Vorschau und Linien-Hervorhebung; Tastatur- und Tipp-Bedienung.
- `rueckgaengig()`: stellt Brett, Angebot, Punkte, Serie, RNG-Zustand des letzten Zugs wieder her (Stapel, max. 20).
- Joker „Neue Formen“: verwirft das aktuelle Restangebot und zieht ein neues (zählt als Zug, Serie bleibt).
- `hinweis()`: markiert eine gültige Position für eine Form (bevorzugt eine, die Linien räumt). Nur Anzeige, kein Zwang.
- `neustart()`: neues Spiel, neuer Seed; laufendes Spiel wird vorher als „abgebrochen“ gemeldet.
- Highscores lokal (Top 10 je Modus mit Datum), Statistik: `ctx.statistik.melde({typ:'zug'|'linien'|'ende', ...})`.
- Automatisches Speichern nach jedem Zug; Pause bei `visibilitychange`.

## 6. Datenmodell & Spielstand

```js
stand = {
  version: 1, modus: 'klassisch' | 'entspannt',
  brett: 'base64 von Uint8Array(64)',          // Farbindex je Zelle, 0 = leer
  angebot: ['L4-a', null, 'S2-h'],              // null = bereits gelegt
  rng: 12345678,                                // Zustand des Seeded RNG
  punkte: 0, serie: 0, zuegeOhneAbraeumen: 0, zuege: 0,
  rueckgaengigRest: 3, joker: 1, naechsterJokerBei: 1500,
  verlauf: [ /* max. 20 kompakte Vorzustände (gleiches Format ohne verlauf) */ ],
  beendet: false, drehen: false
}
```
- Highscores getrennt: `ctx.speicher` Schlüssel `block-puzzle/highscores` → `{ klassisch: [{punkte, datum}], entspannt: [...] }`.
- Größe pro Stand < 4 KB. Unbekannte `version` → Migration oder sauberer Neustart mit Hinweis.

## 7. Darstellung

- **DOM** statt Canvas: 64 Zellen in CSS-Grid, Angebot als drei kleine Grids, Zug-Geist als absolut positioniertes Element
  mit `transform: translate()` (GPU, kein Layout-Thrashing). Einfach, scharf auf allen Auflösungen, gut testbar.
- Größe: Feldkante = `min(90vw, 60vh, 560px)`; Querformat-PC: Angebot rechts neben dem Feld, Hochformat: darunter.
  Zellgröße als CSS-Variable `--zelle`, abgeleitet per `ResizeObserver`.
- Farben aus `ctx.farben` (helles/dunkles Thema), sanfte Rundung, dezente Innenschatten – ruhiger, eigener Stil.
- Animationen (alle abschaltbar, bei `prefers-reduced-motion` aus): Ablegen 80 ms Einrasten, Linien verblassen 200 ms,
  Rücksprung der Form 150 ms, Punkte-Hochzählen. Keine Töne, keine Vibration, kein Wackeln/Blitzen.
- Barrierearm: `aria-label` an Angebotsformen („Form 2: Winkel, 3 Zellen“), Kontrast ≥ 4,5:1, Linienvorschau zusätzlich per Muster.

## 8. Tests

Reine Logik (`logik.js`) ohne DOM → eigene Testseite `tests/block-puzzle.test.html` mit Mini-Testläufer (kein npm).
- `passt`/`legeAb`: Rand, Überlappung, Reihe + Spalte gleichzeitig (Kreuzung einmal), Doppellinien.
- Punkte: Tabelle n = 1…6, Serienfaktor, Serienbruch nach 3 Zügen, Leer-Bonus.
- Generator: gleicher Seed → gleiche Angebote; Gewichtsverteilung über 10 000 Ziehungen ± 3 %; keine Dubletten.
- `legbar`: bekannte Gegenbeispiele (unmöglich) und Fälle, die nur in bestimmter Reihenfolge gehen; Laufzeit < 30 ms auf 1000 Zufallsbrettern.
- Rückgängig: Zug → Rückgängig → identischer Stand (inkl. RNG), Limit im Klassisch-Modus.
- Spielstand: `getStand()` → `erstelle(..., stand)` → gleicher Zustand; kaputter Stand → Neustart ohne Absturz.
- Manuell: Maus, Touch (echtes Handy), Tastatur ohne Maus, kleine Fenster, Drehen des Handys während des Ziehens.

## 9. Aufwand & Risiken

Aufwand gesamt: **ca. 4–6 Arbeitstage** (Logik 1, Bedienung Ziehen/Touch/Tastatur 2, Darstellung 1, Tests/Feinschliff 1–2).

| Risiko | Gegenmaßnahme |
|---|---|
| Touch-Ziehen fühlt sich ungenau an (Finger verdeckt) | Versatz über dem Finger, großzügiges Einrasten, früh am echten Gerät testen |
| Entspannt-Garantie macht das Spiel langweilig | Garantie nur „legbar“, nicht „räumt Linien“; Gewichtung unverändert |
| Rückgängig entwertet Highscore | begrenzt im Klassisch-Modus, RNG im Stand (kein Neuwürfeln) |
| Ähnlichkeit zu bekannten Spielen | eigener Name, Farben, Punkte- und Jokerlogik; keine fremden Grafiken |
| Pointer-Events-Unterschiede (Safari) | nur Pointer Events + `setPointerCapture`, Fallback-Tests |

## 10. Aufgabenliste

**M1 – Logik**
- [ ] Formen-Katalog als Daten inkl. Gewichte und Farbgruppen
- [ ] Bitboard, Masken-Vorberechnung, `passt`, `legeAb`, Linienerkennung
- [ ] Punktesystem mit Serie und Leer-Bonus
- [ ] Gewichteter Seeded-Generator, Klassisch-Garantie, `legbar()` für Entspannt
- [ ] Testseite mit Logik-Tests

**M2 – Grundspiel spielbar**
- [ ] Modul-Schnittstelle (`erstelle`, `getStand`, `neustart`, `zerstoere`)
- [ ] DOM-Feld, Angebot, responsive Größe
- [ ] Ziehen mit Maus, Vorschau + Linien-Hervorhebung, Ende-Erkennung und Ende-Dialog

**M3 – Bedienung komplett**
- [ ] Touch: Versatz über dem Finger, Vergrößern, Tipp-Bedienung
- [ ] Tastatur (`onTaste`): 1–3, Tab, Pfeile, Enter, Esc, Z, J, P
- [ ] Pause und `visibilitychange`

**M4 – Komfort & Modi**
- [ ] Rückgängig-Stapel mit Modus-Limit
- [ ] Joker, `hinweis()`, Entspannt-Modus mit Auto-Neuangebot
- [ ] Automatisches Speichern, Laden, Versionierung
- [ ] Highscores je Modus, Statistik-Meldungen, Optionen in Einstellungen

**M5 – Feinschliff**
- [ ] Ruhige Animationen, abschaltbar, `prefers-reduced-motion`
- [ ] Helles/dunkles Thema, Barrierearmut, Kontrast
- [ ] Gerätetests (PC, Android, iOS), Offline-Test als PWA
