# Konzept: Hafen (`spiele/hafen/`) – Version 3, minimalistisch

Eigenes Idle-Management-Spiel. ID `hafen` · Name „Hafen“ · CSS-Präfix `ha-` · Währung „Münzen“ · `standVersion` 3 (ältere Stände werden verworfen → neuer Hafen).
Ausnahme zum Briefing: Echtzeit-Fortschritt (nur Wartezeit, kein Zeitdruck, kein Verlieren, keine Töne). Nur Variante `standard`, kein Rückgängig.

## Aufbau (von oben nach unten, schmal und ruhig, wenig Text)
1. **Feste Geldleiste** (`position: sticky` unter der Kopfleiste): Münzen + Einkommen/s.
2. **Verkaufszeile:** Leuchtturm-Symbol, Hauptlager-Balken „x / y“, Verkaufstempo, **ein** Upgrade-Knopf.
3. **Kran-Streifen links** (durchgehend, mit Laufwagen) mit **einem** Upgrade-Knopf; rechts daneben die **Dock-Zeilen**, eine schlanke Zeile je Ebene: Symbol, Schiff am Kai (kleine Grafik mit Ladebalken, Name klein), Dock-Lager (Zahl + dünner Balken, am Kran), **ein** Upgrade-Knopf.
4. **„+ Neues Dock“** als dünne Zeile mit Ressourcenname und Preis.
Jede Ebene bleibt eine eigene Ressource (8 Docks: Holz, Fisch, Erz, Kohle, Stoffe, Gewürze, Porzellan, Perlen; Wert ×3 je Dock).

## Stufen (je Station genau ein Knopf „▲ Preis“ mit Stufe als Abzeichen; Wirkung nur in `title`/`aria-label`)
- **Dockstufe:** Schiffsgröße, Entladetempo, Dock-Lager, schnelleres Anlegen/kürzere Wartezeit (das Lotsenboot ist hier integriert).
- **Kranstufe:** Transporttempo vom Dock-Lager ins Hauptlager (für alle Docks, anteilig nach Lagerstand).
- **Verkaufsstufe:** Verkaufstempo + Hauptlager-Platz; die Leuchtturm-Reichweite (nur Optik) ist daran gekoppelt.
Kosten = Basis · Wachstum^(Stufe−1): Dock 12 · 1,2 (×5 je weiteres Dock), Kran 25 · 1,25, Verkauf 30 · 1,25; neues Dock 60 · 4^(n−2). Das „Nächste Ziel“ (günstigstes Upgrade mit Einkommenszuwachs) trägt einen gestrichelten Rahmen; Taste K kauft es.

## Simulation (`logik.js`, ohne DOM, Zufall und Uhr)
Kette: Schiff (Phase, Entladen nur im Entladefenster, stoßweise) → Dock-Lager → Kran → Hauptlager → Verkauf (teuerste Ware zuerst) → Münzen. `fortschritt(z, dt)` rein und deterministisch, höchstens 600 Schritte; volles Dock-Lager hält das Entladen an, volles Hauptlager den Kran. `kaufe`, `preis`, `effekt`, `naechstesZiel`, `einkommenDetail`, `anschub` (Schiff antippen: +2 % einer Fahrt, Pause 1,5 s), `formatiere` (de-DE), `formatiereDauer`.

## Offline
Bis 60 s voller Wert, darüber Faktor 0,5, Deckel 8 h. Uhr zurück/absurd → 0; Zeitstempel > 1 Tag in der Zukunft → Stand verworfen. „Während du weg warst (…): +X Münzen“. Verstecker Tab: Takt stoppt, bei Rückkehr wird nachgerechnet.

## Optik
Zeilen ohne dicke Rahmen, dezente Trennlinien, dünne Füllbalken, tabular-nums, Farben nur aus CSS-Variablen (hell/dunkel), ruhige Dauerbewegung (Laufwagen, Leuchtfeuer, Schiffe), aus bei `bewegungReduziert()` (Klasse `ha-still`). Layout ab 360 px. Knöpfe und Anzeigen werden einmal gebaut; pro Tick ändern sich nur Text/Breite bei Wertänderung (Test prüft Knotenidentität).

## Datenmodell (standVersion 3)
`{ v:3, t, uhr, sperre, geld, gesamt, kran, verkauf, docks:[{stufe,p,puffer}], haupt:[8 Zahlen] }`, streng validiert (`ausSpeicher`), Zusatzfelder verworfen.

## Tests
Format, Puffer-Fluss/Kapazitäten, Verkauf teuerste zuerst, Determinismus, Schrittweiten-Konsistenz, Käufe/Maxima (Schlüssel `d0…`, `kran`, `verkauf`, `neu`), Dock-/Kran-/Verkaufsstufen, Effekt-Vorschau, Preiswachstum ≤ ×1,3, Wachstumskurve (erste 30 Käufe 3–180 s; 2. Dock in 3–15 min; Docks mit Vorrang im Abstand 1,5–20 min mit steigenden Preisen; Upgrade-Wartezeit ≤ 180 s), Offline-Deckel/Konsistenz, Validierung/Fuzz/alte Stände, Oberfläche (ein Knopf je Station, keine Neuaufbauten, Käufe, K-Taste, neues Dock, Abwesenheit, ruhig, Pause), kaputte Stände, Stil.

## Varianten (Version 4, `standVersion` 4)
`level` „Level – mit Ziel“ und `endlos` „Endlos – ohne Ziel“ (= der bisherige Modus, unverändert). Der Spielstand trägt `modus`; passt er nicht zur gewählten Variante, wird er verworfen (neuer Hafen). Die Variantenwahl samt „Neues Spiel“ läuft über die Shell (`neu(variante)`).

### Level-Modus
- Jedes Level ist ein frischer Hafen mit klarem Ziel in der festen Leiste (Text + schmaler Fortschrittsbalken). Zielarten: Münzen verdient, Docks, Kran-/Verkaufsstufe, Dockstufe, verkaufte Einheiten einer Ressource; auch kombiniert. Levelvorgaben: Startdocks, Startkapital, optional Obergrenze verfügbarer Docks.
- 24 handgesetzte Level (`LEVEL` in `logik.js`), danach deterministisch erzeugt aus der Levelnummer (6er-Rhythmus, Ziel ≈ 15 min Startein­kommen · wachsend, gedeckelt bei Level 999). Zielwerte werden nicht gespeichert, sondern aus der Levelnummer abgeleitet.
- Zeitziel: zielgerichtet gespielt 1–20 min (meist 3–10), auch beim Investieren nie unter 1 min (Test über die ersten 30 Level).
- Ziel erreicht → `ctx.meldeGewonnen(text, { weiterspielen: true })`; das nächste Level wird in `ctx.speicher` („level“) vorgemerkt; „Neues Spiel“ der Shell startet es. Ein neu gestartetes, noch ungelöstes Level beginnt von vorn. Kein Verlieren, kein Zeitlimit. Offline-Fortschritt zählt; wird das Ziel in der Abwesenheit erreicht, meldet das Spiel es beim Öffnen. Nach dem Ziel steht der Takt.
- „Weiterspielen ohne Ziel“ → `weiterspielen()`: Flag `weiter` im Spielstand (überlebt Neuladen), Takt läuft weiter, Docks-Obergrenze entfällt, Leiste zeigt „Endlos“, das Ziel wird nie ein zweites Mal gemeldet.
- Kachel-Text: „Level 4 · Ziel 62 %“, „Level 4 geschafft · Endlos“ bzw. „Endlos · 12.400 Münzen“.
- Datenmodell zusätzlich: `modus`, `level` (0 im Endlos-Modus), `weiter` (0/1), `verkauft` (8 Zahlen, verkaufte Einheiten je Ressource); streng validiert (Docks nur bis zur Level-Grenze, solange nicht `weiter`).
