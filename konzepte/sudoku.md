# Konzept: Sudoku (`spiele/sudoku/`)

Ruhiges Zahlenrätsel ohne Druck: kein Fehlerlimit, kein Ton, keine Vibration, Timer ausblendbar.
Status: Planung. Kein Produktivcode, nur Pseudocode.

## 1. Spielidee & Regeln
- 9×9-Gitter, unterteilt in neun 3×3-Blöcke. Einige Zellen sind vorgegeben (fest).
- Ziel: Jede Zeile, jede Spalte und jeder Block enthält die Ziffern 1–9 genau einmal.
- Jedes Rätsel hat **genau eine** Lösung und ist **ohne Raten** lösbar (Garantie des Generators).
- Gewonnen, sobald alle Zellen der Lösung entsprechen → `ctx.meldeGewonnen()`, ruhige Abschlussanzeige (Zeit, Hinweise genutzt), keine Animation mit Konfetti-Pflicht.

## 2. Bedienung
### PC – Maus
- Linksklick: Zelle wählen. Klick auf gewählte Zelle mit Ziffer in der Ziffernleiste: eintragen.
- Rechtsklick auf Zelle: Notiz-Modus für diesen einen Eintrag umschalten (Kontextmenü unterdrückt).
- Ziffernleiste (1–9, Löschen, Notiz, Rückgängig, Hinweis) auch am PC sichtbar, per Maus nutzbar.

### PC – Tastatur (komplett)
| Taste | Wirkung |
|---|---|
| Pfeiltasten / WASD | Auswahl bewegen (am Rand umlaufend) |
| Strg + Pfeil | zur nächsten leeren Zelle in Richtung springen |
| Tab / Umschalt+Tab | nächste / vorige leere Zelle |
| 1–9 (auch Ziffernblock) | Ziffer eintragen (bzw. Notiz im Notizmodus) |
| Umschalt + 1–9 bzw. Alt + 1–9 | Notiz umschalten, unabhängig vom Modus |
| N | Notizmodus an/aus |
| 0, Entf, Rücktaste | Zelle leeren (Ziffer oder alle Notizen) |
| Strg+Z / Z | Rückgängig |
| Strg+Y / Strg+Umschalt+Z | Wiederholen |
| H | Hinweis |
| P / Leertaste | Pause (Gitter wird verdeckt) |
| T | Timer ein-/ausblenden |
| Esc | Auswahl aufheben / Pause schließen |

`onTaste(event)` wertet `event.key` aus; Kürzel nur ohne Fokus in Eingabefeldern.

### Handy – Touch
- Tippen: Zelle wählen. Ziffernleiste unten (große Tasten ≥ 44 px), einhändig erreichbar.
- Zwei Eingabearten (Einstellung): **Zelle zuerst** (Standard) oder **Ziffer zuerst** (Ziffer bleibt aktiv, Tippen auf Zellen trägt sie ein – schnell für Serien).
- Notiz-Schalter als Kippschalter in der Leiste; langes Drücken einer Ziffer = Notiz.
- Zähler an jeder Ziffertaste: wie oft die Ziffer noch fehlt; ausgegraut bei 9/9.

## 3. Modi & Schwierigkeitsstufen
| Stufe | Vorgaben (Richtwert) | erlaubte Techniken (max.) |
|---|---|---|
| Leicht | 38–45 | Naked Single, Hidden Single |
| Mittel | 30–36 | + Locked Candidates (Pointing/Claiming), Naked/Hidden Pair |
| Schwer | 26–31 | + Naked/Hidden Triple, X-Wing, Naked Quad |
| Experte | 22–27 | + Swordfish, XY-Wing, Simple Coloring (keine Ketten/Raten) |

Die Vorgaben-Anzahl ist nur Richtwert; maßgeblich ist die **schwerste benötigte Technik**.
- **Freies Spiel**: Stufe wählen, neues Rätsel.
- **Tagesrätsel**: Seed = `"sudoku-" + JJJJ-MM-TT` (lokales Datum), Stufe nach Wochentag (Mo leicht … So experte). Gleiches Datum → gleiches Rätsel auf allen Geräten.
- **Später**: 6×6 (Blöcke 2×3, Ziffern 1–6, für Handy/Kurzpausen), Killer-Sudoku (Käfige mit Summen, eigener Löser nötig), Diagonal-Sudoku.

## 4. Erzeugung
Läuft im Web Worker (`ctx.worker('spiele/sudoku/generator.worker.js')`), Zufall nur über `ctx.zufall(seed)` (deterministisch, z. B. mulberry32/sfc32).

### 4.1 Vollständiges Gitter
Backtracking mit zufälliger Kandidatenreihenfolge, Zellenwahl nach MRV (wenigste Kandidaten). Kandidaten als 9-Bit-Masken pro Zeile/Spalte/Block.
```
fuelle(gitter):
  z = leere Zelle mit wenigsten Kandidaten; wenn keine: return true
  für ziffer in mische(kandidaten(z), rng):
    setze; wenn fuelle(gitter): return true; entferne
  return false
```
Dauer: < 1 ms.

### 4.2 Zahlen entfernen mit Eindeutigkeitsprüfung
```
loch(gitter, stufe):
  reihenfolge = mische(alle 81 Zellen, rng)   // optional punktsymmetrische Paare
  für zelle (bzw. Paar) in reihenfolge:
    sichere Wert; leere Zelle
    wenn zaehleLoesungen(gitter, limit=2) != 1: Wert zurück; weiter
    wenn bewerte(gitter).stufe > stufe:       Wert zurück; weiter
  return gitter
```
- `zaehleLoesungen`: Bitmasken-Backtracking (DLX unnötig), bricht bei 2 Lösungen ab. ~0,1–2 ms pro Aufruf.
- Symmetrie (180°) als Standard – sieht ruhiger aus.

### 4.3 Schwierigkeitsbewertung (menschlicher Löser)
Logischer Löser wendet Techniken in fester Reihenfolge an (einfachste zuerst), jeweils bis keine mehr greift, dann nächste Stufe:
1. Naked Single, 2. Hidden Single, 3. Locked Candidates, 4. Naked/Hidden Pair, 5. Naked/Hidden Triple, 6. X-Wing, 7. Naked/Hidden Quad, 8. Swordfish, 9. XY-Wing, 10. Simple Coloring.
- Ergebnis: `{ geloest, schwersteTechnik, schritte[] }`. Nicht vollständig lösbar → Rätsel für keine Stufe gültig.
- Ziel: Rätsel hat **mindestens** eine Technik der Zielstufe (sonst zu leicht) und **keine** darüber. Ist es zu leicht: weiter löchern; wenn nichts mehr geht: neues Gitter (max. N Versuche).
- Der gleiche Löser liefert die **Hinweise** (Abschnitt 5) – eine Implementierung, zwei Nutzungen.

### 4.4 Laufzeit im Browser (Schätzung, Mittelklasse-Handy)
- Leicht/Mittel: 20–100 ms. Schwer: 0,1–1 s. Experte: 0,5–5 s (viele Neuversuche, da „mind. eine Experte-Technik“ selten zufällig entsteht).
- Gegenmaßnahmen: Worker (UI bleibt flüssig), **Vorrat**: im Leerlauf je Stufe 3 Rätsel vorproduzieren und in `ctx.speicher` ablegen; Abbruch nach 10 s → beste bisher gefundene Variante (eine Stufe tiefer, Hinweis an Nutzer).
- Optional Fallback-Datei `spiele/sudoku/vorrat.json` mit ~50 vorgenerierten Experte-Rätseln (offline mitgeliefert).

## 5. Funktionen
- **Notizen**: bis zu 9 Kleinziffern je Zelle (3×3-Anordnung). **Auto-Notizen** optional (Schalter/Taste): füllt alle Kandidaten; danach normal editierbar.
- **Notizen aufräumen**: Beim Eintragen einer Ziffer wird sie aus Notizen der Zeile/Spalte/Block entfernt (Einstellung, Standard an). Teil desselben Rückgängig-Eintrags.
- **Konflikt-Markierung** (immer an): doppelte Ziffer in Zeile/Spalte/Block → beide Zellen dezent markiert (Farbe + Unterstreichung, nicht nur Farbe).
- **Fehler anzeigen** (optional, Standard aus): vergleicht mit Lösung, falsche Ziffern rot-gepunktet.
- **Gleiche Ziffern hervorheben**: Auswahl einer Zelle mit Ziffer hebt alle gleichen Ziffern und passende Notizen hervor; dazu Zeile/Spalte/Block leicht getönt.
- **Hinweis** (`hinweis()`), dreistufig je Aufruf:
  1. „Schau dir Block 5 an.“ (Region hervorheben)
  2. Technik nennen + erklären: „Hidden Single: In Zeile 3 passt die 7 nur hier.“
  3. Ausführen (eintragen bzw. Notizen streichen), als Rückgängig-Eintrag.
  Vorher: Liegt ein Fehler vor, zeigt der Hinweis zuerst den Fehler („Diese Zelle passt nicht zur Lösung“). Hinweise werden gezählt, nie bestraft.
- **Pause**: Gitter verdeckt, Timer steht; automatisch bei `visibilitychange`.
- **Statistik**: `ctx.statistik.melde({ typ: 'gewonnen', stufe, sekunden, hinweise, tagesraetsel })`.

## 6. Datenmodell & Spielstand
```
stand = {
  version: 1,
  seed, stufe, modus: 'frei' | 'tag', datum?,
  vorgabe:  String(81),   // '0' = leer
  loesung:  String(81),
  werte:    String(81),   // Spielereinträge
  notizen:  Uint16[81] → als Base64 oder Zahlenarray (9-Bit-Masken),
  auswahl:  index,
  notizmodus: bool,
  sekunden, hinweiseGenutzt,
  verlauf:  [...], zukunft: [...]   // Rückgängig/Wiederholen
}
```
- Rückgängig-Eintrag = Liste von Zellen-Deltas: `{ i, alterWert, neuerWert, alteNotiz, neueNotiz }[]` – ein Eintrag pro Nutzeraktion (inkl. Notiz-Aufräumen, Auto-Notizen, Hinweis).
- **Unbegrenzt**: kein Limit; Deltas sind klein (Auto-Notizen ≈ 81 Deltas). Bei > 5000 Einträgen werden zum Speichern ältere zu einem Schnappschuss zusammengefasst (Rückgängig bleibt funktional unbegrenzt).
- `getStand()` liefert obiges Objekt; Oberfläche speichert automatisch (nach jeder Aktion, gedrosselt 500 ms, und bei `pagehide`).
- `neustart()`: werte/notizen leeren, Verlauf leeren (vorher Bestätigung durch Oberfläche).

## 7. Darstellung
- **DOM + CSS-Grid** (81 `<div>`s bzw. `<button>`s): 81 Zellen sind trivial, gut zugänglich (ARIA `grid`, `aria-label="Zeile 3, Spalte 5, leer, Notizen 2 4"`), scharfe Schrift, Fokus-Ring.
- Quadratisch: `width: min(92vw, 70vh, 600px)`; Schrift über `container`-Einheiten (`cqi`). Blockgrenzen per dickeren Rändern.
- Farben ausschließlich aus `ctx.farben` (heller/dunkler Modus, kontrastreich, farbenblind-tauglich).
- Handy hochkant: Gitter oben, Ziffernleiste unten; quer bzw. PC: Leiste rechts.
- Kein Zoom nötig (9×9 passt auch auf 320 px).
- Keine Töne, keine Vibration, Animationen nur kurz (≤ 150 ms) und bei `prefers-reduced-motion` aus.

## 8. Tests
Eigenes Mini-Testskript im Browser (`tests/sudoku.test.html`, kein npm), ggf. auch in Node (`node --test`) ausführbar, da Kernlogik DOM-frei ist.
- **Generator**: 200 Seeds je Stufe → `zaehleLoesungen == 1`, Lösung gültig, Vorgaben ⊆ Lösung.
- **Determinismus**: gleicher Seed + Stufe → identisches Rätsel (auch Tagesrätsel-Seed).
- **Bewertung**: bekannte Referenzrätsel mit bekannter schwerster Technik (je Technik 2–3 Beispiele) → korrekt erkannt.
- **Techniken einzeln**: konstruierte Positionen, in denen genau eine Technik eine bestimmte Eliminierung erlaubt.
- **Löser**: 17-Vorgaben-Rätsel, leeres Gitter (viele Lösungen → 2), widersprüchliches Gitter (0).
- **Spielstand**: Rückgängig/Wiederholen-Folgen ergeben Ausgangszustand; `getStand` → `erstelle(..., stand)` → identisch.
- **Laufzeit**: Benchmark-Seite misst Median/Max je Stufe.

## 9. Aufwand & Risiken
| Paket | Aufwand |
|---|---|
| Kernlogik (Gitter, Backtracking, Zähler) | 0,5 Tag |
| Logischer Löser mit 10 Techniken + Erklärtexte | 2–3 Tage |
| Generator + Stufen-Kalibrierung | 1–1,5 Tage |
| UI (Gitter, Leiste, Tastatur, Touch, Notizen) | 2 Tage |
| Spielstand, Rückgängig, Hinweis, Optionen | 1 Tag |
| Tests, Feinschliff, Barrierefreiheit | 1–1,5 Tage |
| **Summe** | **ca. 8–10 Personentage** |

Risiken:
- Experte-Generierung langsam auf alten Handys → Vorrat + Worker + Fallback-Datei.
- Stufen fühlen sich falsch an (Technik ≠ gefühlte Schwierigkeit) → zusätzlich Schrittzahl/Anzahl schwerer Schritte gewichten, mit Testspielern nachkalibrieren.
- Technik-Implementierungen fehlerhaft (falsche Eliminierung = falscher Hinweis) → jede Technik einzeln testen; Hinweis prüft Ergebnis gegen bekannte Lösung.
- Tagesrätsel muss auf allen Geräten gleich sein → Generator darf nur `ctx.zufall` nutzen, keine Zeitlimits, die das Ergebnis beeinflussen (Zeitabbruch nur im freien Spiel).

## 10. Aufgabenliste
### M1 – Kern (ohne UI)
- [ ] Datenstrukturen (Strings/Bitmasken), Hilfsfunktionen Zeile/Spalte/Block
- [ ] Gitter-Füller mit Seed
- [ ] Lösungszähler (Abbruch bei 2)
- [ ] Testseite mit ersten Tests

### M2 – Logischer Löser & Generator
- [ ] Techniken 1–4 (Singles, Locked Candidates, Pairs) mit Erklärtext
- [ ] Techniken 5–10 (Triples, X-Wing, Quads, Swordfish, XY-Wing, Coloring)
- [ ] Bewertung `schwersteTechnik`
- [ ] Löcher-Algorithmus mit Symmetrie und Stufenziel
- [ ] Web Worker + Vorratslogik + Zeitabbruch
- [ ] Generator-/Determinismus-/Laufzeittests

### M3 – Spielbares Sudoku
- [ ] Modul `index.js` gemäß Schnittstelle
- [ ] CSS-Grid-Darstellung, Hell/Dunkel über `ctx.farben`
- [ ] Maus + komplette Tastaturbelegung (`onTaste`)
- [ ] Touch + Ziffernleiste (Zelle-zuerst / Ziffer-zuerst)
- [ ] Gewinnprüfung, `meldeGewonnen`, Statistik

### M4 – Komfort
- [ ] Notizen, Auto-Notizen, Notizen aufräumen
- [ ] Konflikte, gleiche Ziffern, optional Fehler anzeigen
- [ ] Unbegrenztes Rückgängig/Wiederholen, Speichern/Laden
- [ ] Hinweis dreistufig
- [ ] Pause, Timer ausblendbar, Auto-Pause

### M5 – Feinschliff
- [ ] Tagesrätsel per Datum-Seed
- [ ] Barrierefreiheit (ARIA, Fokus, Kontrast), reduced motion
- [ ] Stufen mit Testspielern kalibrieren
- [ ] Fallback-Datei `vorrat.json`

### Später
- [ ] 6×6-Variante
- [ ] Killer-Sudoku (Käfige, Summenlogik)
- [ ] Diagonal-Sudoku
