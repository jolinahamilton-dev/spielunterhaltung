# Konzept: Farben sortieren (`spiele/farben-sortieren/`)

Ruhiges Umgieß-Rätsel: Farbschichten in Röhren sortieren. Kein Ton, keine Vibration, kein Zeitdruck, unbegrenztes Rückgängig.
Status: Planung. Kein Produktivcode, nur Pseudocode.

## 1. Spielidee & Regeln
- Es gibt `R` Röhren mit fester Kapazität `K` (Standard 4 Schichten). `F` Farben, jede Farbe kommt genau `K`-mal vor. Start: `F` volle, gemischte Röhren + `L` leere Röhren (Standard `L = 2`).
- **Zug** = Röhre A (Quelle) auf Röhre B (Ziel) gießen. Erlaubt, wenn A nicht leer, B nicht voll, A ≠ B und (B leer **oder** oberste Farbe von B = oberste Farbe von A).
- **Menge**: Es wird der ganze zusammenhängende gleichfarbige obere Block von A gegossen, **so viel wie in B passt** (`min(Blocklänge, freier Platz)`). Rest bleibt in A. Ein Gießvorgang = **1 Zug**, egal wie viele Schichten. (Entscheidung: entspricht der Erwartung „alles Passende fließt rüber“, spart Klicks, und der Zustandsraum des Lösers wird kleiner.)
- **Ziel**: Jede Röhre ist leer oder voll mit genau einer Farbe (`K` Schichten). Dann `ctx.meldeGewonnen()`, ruhige Abschlussanzeige (Züge, bestmöglich, Hinweise).
- **Sonderfälle**
  - Volle einfarbige Röhre bekommt einen dezenten Abschluss (Deckel-Symbol), bleibt aber bedienbar (man darf sie wieder ausgießen – keine Sonderregel, Löser schneidet solche Züge nur ab).
  - Ungültiger Zug: nichts passiert, Quelle bleibt gewählt, Ziel blinkt einmal kurz in Grau (abschaltbar). Kein Ton.
  - **Sackgasse** (kein gültiger Zug außer sinnlosen Hin-und-her-Zügen bzw. Löser findet keine Lösung): Hinweisleiste „Hier geht es nicht weiter – Rückgängig bis Zug X führt wieder zu einer Lösung.“ Kein Verlieren.
  - **Zusatzröhre** (Hilfe, Einstellung „erlaubt“ an): Knopf „+ Röhre“ fügt einmal pro Level eine leere Röhre hinzu. Jedes Level ist auch ohne sie lösbar; mit ihr wird nur die Bestwertung („ohne Hilfe“) nicht vergeben. Rückgängig kann sie wieder entfernen, solange sie leer ist.

## 2. Bedienung
### PC – Maus
- **Klick-Klick**: Klick auf Röhre = Quelle wählen (Röhre hebt sich leicht an). Klick auf zweite Röhre = gießen. Klick auf dieselbe Röhre oder ins Leere = abwählen.
- **Ziehen**: Maustaste auf Quelle drücken, über Ziel loslassen (Pointer Events, Ziel wird beim Überfahren hervorgehoben; gültige Ziele dezent markiert, abschaltbar).
- Rechtsklick: Auswahl aufheben (Kontextmenü unterdrückt).

### PC – Tastatur
| Taste | Wirkung |
|---|---|
| 1–9, 0 | Röhre 1–10 (obere Reihe) wählen bzw. als Ziel gießen |
| Q W E R T Z U I O P | Röhre 11–20 (untere Reihe) – Röhren-Nummern stehen klein unter jeder Röhre |
| Pfeile links/rechts/oben/unten | Fokus zwischen Röhren bewegen |
| Enter / Leertaste | fokussierte Röhre wählen / dorthin gießen |
| Esc | Auswahl aufheben |
| Strg+Z / Rücktaste | Rückgängig |
| H | Hinweis |
| N | Neustart (selbst rückgängig machbar, siehe 5) |
| + | Zusatzröhre |

`onTaste(event)` wertet `event.key` aus (Tastaturlayout-neutral, `Z`/`Y` beide akzeptiert für Röhre 16).

### Handy – Touch
- Tippen-Tippen wie Klick-Klick (Standard), Ziehen mit dem Finger ebenfalls möglich.
- Röhren in 1–2 Reihen, Breite passt sich an; Tippfläche je Röhre ≥ 44 px breit, ganze Röhrenhöhe zählt.
- Leiste unten: Rückgängig, Hinweis, Neustart, + Röhre (groß, einhändig erreichbar).

## 3. Modi & Schwierigkeit
| Stufe | Farben F | leere L | Röhren R | Kapazität K | Ziel-Mindestzüge |
|---|---|---|---|---|---|
| Sanft | 3–4 | 2 | 5–6 | 4 | 4–10 |
| Leicht | 5–6 | 2 | 7–8 | 4 | 10–18 |
| Mittel | 7–9 | 2 | 9–11 | 4 | 16–28 |
| Schwer | 10–12 | 2 | 12–14 | 4 | 24–40 |
| Knifflig | 9–11 | 1–2 | 11–12 | 5 | 28+ |

- Schwierigkeit = Farbanzahl + **minimale Zugzahl** (vom Löser) + Anteil „falscher“ Startzüge (Sackgassen-Dichte, optional).
- **Endlos-Modus (Standard)**: fortlaufende Level-Nummern 1, 2, 3, … Seed = `hash("farben-v1-" + n)`. Stufe aus Kurve: langsamer Anstieg bis Level ~60, danach Wellen (jedes 4. Level bewusst leichter zum Durchatmen). Nur die aktuelle Nummer wird gespeichert; Level ist auf allen Geräten gleich.
- **Freies Spiel**: Stufe wählen, zufälliger Seed.
- **Tageslevel**: Seed = `"farben-tag-" + JJJJ-MM-TT` (lokales Datum), Stufe Mittel. Kein Streak-Druck, nur „gelöst“-Haken im Kalender.
- Entscheidung Endlos statt fester Stufenliste: passt zu „Kopf aus“ (einfach weiter), braucht keine Level-Datei, Fortschritt ist eine Zahl.

## 4. Erzeugung mit Lösbarkeitsgarantie
Läuft im Web Worker (`ctx.worker('spiele/farben-sortieren/worker.js')`, Modul-Worker), Zufall nur über `ctx.zufall(seed)`.

### 4.1 Gewählter Ansatz: vorwärts mischen + Löser prüft
1. `F·K` Schichten zufällig mischen (Fisher-Yates), auf `F` Röhren verteilen, `L` leere dazu.
2. Verwerfen, wenn eine Röhre schon einfarbig voll ist oder mehr als `K-1` gleiche Schichten am Stück liegen (zu leicht).
3. **A*-Löser** prüft Lösbarkeit und liefert minimale Zugzahl + Lösungsweg.
4. Liegt die Zugzahl nicht im Zielbereich der Stufe → nächster Versuch mit `seed + versuch`.
- Erfahrungswert: mit `L = 2` sind zufällige Mischungen fast immer lösbar; mit `L = 1` deutlich seltener – dann mehr Versuche.

### 4.2 Warum nicht rückwärts verwürfeln
Umkehrung eines Gießzugs „k Schichten von A nach B“ = k Schichten von B zurück nach A. Fallstricke:
- Der Rückzug ist nur gültig, wenn der Vorwärtszug **genau k** gegossen hätte (Regel „so viel wie passt“): unter den k Schichten in A muss danach eine andere Farbe liegen oder A war leer, bzw. B war danach genau voll.
- Rückwärts entstehen auch Zustände, die vorwärts nur über unnatürliche Wege erreichbar sind; die Mindestzugzahl ist nicht = Anzahl Rückzüge.
- Rückwärts-Verwürfeln erzeugt typischerweise zu leichte, „aufgeräumte“ Mischungen.
→ Rückwärts nur als Notlösung, Mindestzüge trotzdem per Löser bestimmen.

### 4.3 Löser
- **Zustand**: Röhren als Strings (Farbe = ein Zeichen, unten → oben). **Kanonisierung**: Röhren sortieren und mit `|` verbinden → Röhrenreihenfolge egal, Zustandsraum schrumpft stark. Hash = dieser String (`Map`/`Set`).
- **Heuristik h** (zulässig): `h = Σ_Röhren (Segmente − 1) + Σ_Farben max(0, Röhren, in denen die Farbe das unterste Segment bildet − 1)`. Im Ziel ist h = 0. Ein Zug senkt h um höchstens 1 (er entfernt höchstens eine Segmentgrenze in der Quelle; ein „unterstes Segment“ verschwindet nur, wenn die Quelle leer wird, und dann gab es dort keine Grenze) → A* liefert das Optimum.
- **Schnitte**: nie aus einfarbig voller Röhre gießen; nie eine einfarbige Röhre komplett in eine leere gießen; von mehreren leeren Zielröhren nur die erste betrachten.
- **Budget** in Knoten (z. B. 300 000), **nicht in Zeit** – sonst liefern langsame Geräte andere Level zum selben Seed. Budget überschritten → Versuch verwerfen.

```
funktion löse(start):
  offen = Prioritätswarteschlange [(h(start), 0, start)]
  gesehen = Map{ kanon(start): 0 }
  solange offen nicht leer:
    (f, g, z) = offen.entnehme()
    wenn gelöst(z): return pfad(z)
    wenn ++knoten > BUDGET: return ZU_TEUER
    für jeden zug in züge(z) (mit Schnitten):
      z2 = gieße(z, zug); k = kanon(z2)
      wenn g+1 < gesehen.get(k, ∞): gesehen.set(k, g+1); vorgänger[k] = (z, zug)
                                    offen.füge((g+1+h(z2), g+1, z2))
  return UNLÖSBAR
```
- **Zustandsraum**: Sanft/Leicht < 10⁴ Knoten (ms), Mittel 10⁴–10⁵ (≤ 0,3 s), Schwer bis Budget (≈ 1 s). Bei Budget-Abbruch in Schwer: gewichtetes A* (`f = g + 1,5·h`) als Rückfall → Lösbarkeit garantiert, Anzeige dann „Lösung in ≤ X Zügen“ statt „bestmöglich“.

### 4.4 Laufzeit oder Level-Datei?
**Empfehlung: zur Laufzeit erzeugen** (Worker, deterministisch aus Seed). Begründung: Endlos-Level, kein Node/Python vorhanden, Erzeugung dauert ≤ 1 s. Das **nächste Level wird im Hintergrund vorab erzeugt**, während man spielt → keine Wartezeit. Eine Generator-Seite im Browser für eine Level-Datei ist nicht nötig; nur falls Schwer-Level auf alten Handys zu langsam sind, später als Option (`werkzeuge/`-Seite schreibt JSON, wird in die App gelegt).
- Das komplette Start-Layout wird im Spielstand mitgespeichert → eine spätere Generator-Änderung (`v2` im Seed-Präfix) bricht keine laufenden Spielstände.

## 5. Funktionen
- **Rückgängig** unbegrenzt (Verlauf mit Mengenangabe, daher exakt umkehrbar). Wiederholen optional (Strg+Y).
- **Neustart**: setzt auf Start zurück, legt den alten Verlauf als einen Eintrag ab → „Rückgängig“ direkt nach Neustart stellt den alten Stand wieder her.
- **Hinweis**: Löser im Worker vom aktuellen Zustand → erster Zug des Optimalwegs; Quelle und Ziel werden sanft markiert (Pfeil). In Sackgasse: Verlauf rückwärts durchsuchen, ersten lösbaren Zustand nennen („2 Züge zurück“). Hinweise werden gezählt, nicht bestraft.
- **Zugzähler** oben: „Züge: 14 · bestmöglich: 11“.
- **Sterne (optional, abschaltbar)**: 3 = ≤ Optimum, 2 = ≤ Optimum + 30 %, sonst 1. Kein Stern ohne Lösen ist unmöglich – gelöst ist gelöst. Zusatzröhre/Hinweis → Stern-Anzeige ohne „Bestwert“-Markierung.
- **Statistik**: `ctx.statistik.melde({typ:'gewonnen', level, zuege, optimum, hinweise, zusatzroehre})`.

## 6. Datenmodell & Spielstand
```
Level  = { version:1, seed, stufe, kapazitaet:4, roehren:[[0,3,1,2],[...],[]], optimum:11, optimal:true }
          // Farb-Index pro Schicht, Array unten → oben
Zug    = [von, nach, menge]          // menge macht Rückgängig trivial
Stand  = { version:1, modus:'endlos'|'frei'|'tag', levelNr, datum?, level, verlauf:[Zug|{neustart:[...]}],
           zusatzroehre:false, hinweise:0, gewonnen:false }
```
- `getStand()` liefert `Stand`; aktueller Zustand = `level.roehren` + Verlauf abspielen (bei ≤ ein paar hundert Zügen vernachlässigbar).
- Autospeichern nach jedem Zug über `ctx.speicher`; Fortschritt Endlos (`naechstesLevel`) separat unter `farben.fortschritt`.
- Farben aus `ctx.farben` (Palette mit max. 12 Einträgen), jede Farbe zusätzlich mit festem **Muster + Symbol** (Punkte, Streifen, Karo, Wellen, Kreis, Dreieck, Stern …).

## 7. Darstellung
- **SVG** (eine `<svg>` pro Spielfeld): Röhren als abgerundete Pfade, Schichten als `rect` mit Füllung + SVG-`<pattern>` + mittigem Symbol. Skaliert scharf, DOM-Ereignisse und Fokus (`tabindex`, `aria-label` „Röhre 3: rot, rot, blau“) gratis. Canvas unnötig (≤ 60 Schichten).
- Eigene Optik: weiche Glasröhren mit Zahl darunter, gedeckte Pastellpalette, heller/dunkler Hintergrund nach Einstellung.
- **Animation Gießen** (ruhig, ~350 ms): Quelle hebt sich, kippt leicht zum Ziel, Schichten „sinken“ in der Quelle und „steigen“ im Ziel (Höhenübergang), kein Spritzen. Während Animation sind neue Eingaben gepuffert, nicht blockiert.
- Abschaltbar über `ctx.einstellungen.animationen` und automatisch bei `prefers-reduced-motion` → sofortiger Zustandswechsel.

## 8. Tests
Testseite `tests/farben.html` im Browser (ES-Module, kleines eigenes `pruefe()`), kein Node nötig.
- **Regeln**: gießen in leere Röhre, teilweises Gießen bei wenig Platz, ganzes Segment, ungültig bei anderer Farbe/voll/leer/selbe Röhre, Gewinn-Erkennung inkl. leerer Röhren.
- **Rückgängig**: zufällige Zugfolgen vorwärts, dann komplett zurück → Startzustand identisch.
- **Löser**: handgebaute Fälle mit bekanntem Optimum (z. B. 2 Farben/4 Röhren = 3 Züge), bekannt unlösbarer Fall → `UNLÖSBAR`; Kanonisierung (Röhren vertauscht = gleicher Hash).
- **Generator**: 300 Seeds je Stufe → jedes Level wird unabhängig per Regel-Engine mit dem gelieferten Lösungsweg nachgespielt und endet gelöst; Zugzahl im Zielbereich; Farbanzahl je `K`-mal.
- **Determinismus**: gleicher Seed → identisches Level (zweimal erzeugen, vergleichen).
- **Heuristik-Zulässigkeit**: Stichprobe – h(z) ≤ wahre Restzugzahl (per BFS) auf kleinen Leveln.

## 9. Aufwand & Risiken
- Aufwand: Regel-Engine 0,5 T · Löser + Generator + Worker 2 T · SVG-Oberfläche + Bedienung 2 T · Animation 1 T · Tests 1 T · Feinschliff 0,5–1 T → **ca. 7–8 Personentage**.
- Risiken:
  - Schwere Level sprengen das Knotenbudget → Rückfall gewichtetes A*, „≤ X“-Anzeige; Budget an echten Geräten kalibrieren.
  - Determinismus über Geräte: nur Knotenbudget, keine Zeitgrenzen, keine `Math.random`.
  - Viele Röhren am Handy-Querformat/Hochformat → Zwei-Reihen-Layout früh testen.
  - Farbunterscheidung: 12 Farben + Muster müssen auch klein lesbar sein (Symbol nur ab Mindestgröße, sonst Muster).

## 10. Aufgabenliste
### M1 – Regel-Kern
- [ ] `logik.js`: Zustand, `zuege()`, `gieße()`, `umkehren()`, `gelöst()`
- [ ] Testseite mit Regel- und Rückgängig-Tests
### M2 – Löser & Generator
- [ ] A*-Löser mit Kanonisierung, Heuristik, Schnitten, Knotenbudget
- [ ] Generator (mischen, filtern, Zielbereich je Stufe, Seed-Versuche)
- [ ] Worker-Anbindung über `ctx.worker`, Vorab-Erzeugung des nächsten Levels
- [ ] Generator-Tests (300 Seeds/Stufe), Determinismus-Test, Laufzeit messen
### M3 – Spielbare Oberfläche
- [ ] `index.js` mit Schnittstelle (`erstelle`, `getStand`, `rueckgaengig`, `neustart`, `zerstoere`, `hinweis`, `onTaste`)
- [ ] SVG-Röhren mit Farben + Mustern + Symbolen, Layout 1–2 Reihen
- [ ] Klick-Klick, Ziehen, Tastatur (Ziffern/Buchstaben, Pfeile, Enter), Touch
- [ ] Zugzähler, „bestmöglich“, Gewinn-Erkennung, `meldeGewonnen()`
### M4 – Komfort
- [ ] Hinweis inkl. Sackgassen-Erkennung („X Züge zurück“)
- [ ] Neustart rückgängig machbar, Zusatzröhre
- [ ] Autospeichern, Endlos-Fortschritt, Tageslevel, freies Spiel
- [ ] Statistik-Ereignisse, optionale Sterne
### M5 – Feinschliff
- [ ] Gieß-Animation, abschaltbar, `prefers-reduced-motion`
- [ ] Barrierefreiheit (aria-labels, Fokusrahmen), Handy-Test, Budget-Kalibrierung
