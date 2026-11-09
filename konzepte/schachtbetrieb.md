# Konzept: Schachtbetrieb (`spiele/schachtbetrieb/`)

Eigenes, minimalistisches Idle-Management-Spiel („Bergwerk-Manager“). Eigene Namen, Optik und Zahlen.
ID `schachtbetrieb` · Name „Schachtbetrieb“ · CSS-Präfix `sb-` · `standVersion` 3 (ältere Stände werden verworfen, Hinweis „neues Bergwerk“).
Echtzeit-Fortschritt ist gewollt (Ausnahme zum Briefing): kein Zeitdruck, nur Wartezeit; kein Verlieren, keine Töne.

## Prinzip (Idle-Miner-artig, nur das Prinzip)
Verkaufszentrum oben, ein durchgehender Aufzugsschacht links, rechts schlanke Schacht-Zeilen. Bergleute füllen das **Schachtlager** (die Kiste, am Aufzug),
der Aufzug holt ab und liefert ins **Eingangslager** des Zentrums, das Zentrum verkauft (1 Erz = 1 Taler). Alles läuft von selbst.
**Pro Station genau ein Upgrade-Knopf** („▲ Preis“, Stufe als Abzeichen; Wirkung nur als Tooltip/aria-label):
Schachtstufe (mehr Bergleute alle 3 Stufen, Tempo und Tragkraft wachsen mit), Aufzugsstufe (Tempo + Ladung), Zentrumsstufe (Verkaufstempo + Ladung). Dazu „+ Neuer Schacht“ (bis 10).
Tippen auf die Bergleute-Fläche eines Schachts = kleiner Anschub (3 s Förderung, höchstens alle 1,5 s).

## Simulation (`logik.js`, ohne DOM, ohne Zufall)
Fließmodell mit echten Puffern: Schachtlager (Kapazität 40 s Förderung), Eingangslager (20 s Verkauf), Geld.
`fortschritt(z, dt)` (rein, deterministisch): n = min(4000, ⌈dt/0,5⌉) Schritte; je Schritt Förderung (gedeckelt durch das Lager) → Aufzug (Zeitbudget, zwei Durchgänge proportional zu den Beständen, begrenzt durch freien Platz im Eingangslager) → Verkauf.
Weitere Funktionen: `kaufe`, `preis`, `naechstesZiel`, `einkommen`, `aufzugLast` (Little: Durchsatz · Fahrzeit), `effektText`, `anschub`, `offline`, `luecke`, `formatiere` (de-DE, „1,2 Mio.“).
Schlüssel für Käufe: `s<k>`, `aufzug`, `zentrum`, `schacht`.

## Wachstum
Kosten = Basis · Wachstum^(Stufe−1) (Schacht 1,24 · Tiefenfaktor 24^k; Aufzug/Zentrum 1,3; neuer Schacht 300 · 12^(k−1)). Stets das Günstigste gekauft: Wartezeiten der ersten 70 Käufe ca. 13–49 s, sanft steigend. Tests: 30 Käufe in 10–180 s, 70 Käufe ≤ 180 s, Gesamtzeiten begrenzt.

## Offline
`luecke(dt)`: bis 60 s voller Wert, darüber die Hälfte, Deckel 8 h. Zeitstempel `t` im Stand; Uhr zurück/Unsinn zählt 0. Beim Öffnen und nach versteckten Tabs „Während du weg warst: +X Taler“ (ab 60 s).

## Bedienung und Optik
Feste Geldleiste (sticky) mit Geld, Einkommen/s und winzigem Hinweis „Nächstes: …“. Zeilen mit dezenten Trennlinien, dünne Füllbalken, tabular-nums, nur CSS-Variablen. Bergleute laufen, Kabine fährt (aus bei `bewegungReduziert`, Klasse `sb-still`). UI-Tick 200 ms, Knöpfe/Textknoten werden nie neu aufgebaut. Taste K kauft das Nächste Ziel; „Neues Bergwerk“ mit Bestätigung. Layout ab 360 px. Kein Rückgängig.

## Datenmodell
`{ v:3, level, fertig, weiter, t, uhr, sperre, geld, gesamt, aufzug:{stufe}, zentrum:{stufe,lager}, schaechte:[{stufe,kiste}] }`, streng validiert (Stufen 1–40, 1–10 Schächte, Puffer auf Kapazität gekappt).

## Tests
`tests/spiele/schachtbetrieb.test.js`: Wachstumskurve, Offline, Determinismus, Puffer, Validierung/Fuzz, Oberfläche (ein Knopf je Station, Knoten bleiben erhalten), Robustheit, Stil.

## Varianten: Level und Endlos
- **Endlos – ohne Ziel** (`level` 0): das bisherige Spiel. **Level – mit Ziel** (Standard): jedes Level ist ein frisches Bergwerk mit einem Ziel in der festen Leiste (Text + schmaler Fortschrittsbalken).
- 25 handgesetzte Level (`LEVEL_TABELLE`: Ziele, Startgeld, Startschächte, Obergrenze der Schächte), danach deterministisch aus der Levelnummer (gleiche Vorlagen, Werte bis ×1,2). Zielarten: Taler verdient, Schächte, Aufzugstufe, Zentrumsstufe, höchste Schachtstufe, alle Schächte ab Stufe, Einkommen/s; Kombinationen brauchen alle Ziele.
- Alles kommt aus `levelDef(n)`, nie blind aus dem Stand (Validierung prüft Schächte gegen die Obergrenze des Levels). Levelzähler `geloest` in `ctx.speicher`; „Neues Spiel“ der Shell startet das nächste Level (`neu(variante)`).
- Ziel erreicht (auch offline oder durch einen Kauf): einmal `ctx.meldeGewonnen(text, { weiterspielen: true })`, Takt steht. „Weiterspielen ohne Ziel“ ruft `weiterspielen()` auf: Flag `weiter` im Stand, Leiste zeigt „Endlos – ohne Ziel“, Ziel wird nie wieder gemeldet; bleibt nach dem Neuladen erhalten. Stand mit `fertig` ohne `weiter` führt in ein frisches Level.
- Zusammenfassung: „Level 4 · Ziel 62 %“, „Level 4 geschafft“, „Endlos · 12.400 Taler“.
- Zeiten (Test): jedes der ersten 40 Level mit „Günstigstes zuerst“ (bei Schachtzielen auch zielgerichtet, mit Sparen) in 1–20 min, Mittel 5–15 min.
