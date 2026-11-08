# Konzept: Schachtbetrieb (`spiele/schachtbetrieb/`)

Eigenes Idle-Management-Spiel („Bergwerk-Manager“). Eigene Namen, Optik und Zahlen. ID `schachtbetrieb` · Name „Schachtbetrieb“ · CSS-Präfix `sb-`.
Beschreibung: „Bergleute fördern, der Aufzug liefert, das Zentrum verkauft – baue dein Bergwerk in Ruhe aus.“

## Ausnahme zum Briefing
Echtzeit-Fortschritt ist hier gewollt (kein Zeitdruck, nur Wartezeit). Kein Verlieren, keine Sammelzwänge, keine Töne.

## Prinzip
Oben das **Verkaufszentrum** (Lager + Lagerarbeiter), daneben/darunter der **Aufzug**, darunter bis zu 12 **Schächte** übereinander.
Alles läuft von selbst: Bergleute füllen die Schachtkiste, der Aufzug holt Kisten ab und liefert ins Zentrum-Lager, der Lagerarbeiter verkauft gegen **Taler**.
Mit Talern: neuen Schacht öffnen; je Schacht Bergleute (Anzahl, max. 20), Tempo, Tragkraft (Stufen bis 40); Aufzug Tempo/Ladung; Zentrum Tempo/Ladung.
Tippen auf „Antreiben“ eines Schachts = kleiner Anschub (Kiste bekommt 3 s Förderung, höchstens alle 1,5 s). Kein Vorarbeiter/Manager (alles automatisch).

## Simulation (`logik.js`, ohne DOM, ohne Zufall)
Fließmodell mit Beständen (in Taler-Wert): Schachtkiste i, Zentrum-Lager, Geld.
`fortschritt(z, dt)` teilt dt in n = min(600, max(1, ⌈dt/0.5⌉)) gleich lange Schritte; je Schritt: Förderung → Aufzug (Zeitbudget h, in zwei Durchgängen proportional zu den Kistenbeständen; Fahrzeit je Schacht wächst mit der Tiefe) → Verkauf (Rate = Zentrum-Ladung/Zeit). Große dt kosten also höchstens 600 Schritte.
Reine Funktion: liefert einen neuen Zustand.
`kaufe(z, was)`, `preis(z, was)`, `naechstesZiel(z)` (günstigstes mögliches Upgrade + Wartezeit aus `einkommen(z)`), `formatiere(zahl)` (de-DE, „1,2 Mio.“).

## Wachstum
Kosten = Basis · Wachstum^(Stufe−1) (Wachstum 1,15–1,3 je Kategorie, nie explodierend), Wirkung steigt sanfter. Test: kauft man stets das günstigste, liegen die Wartezeiten der ersten 30 Käufe zwischen 1 s und 4 min, die Gesamtzeit unter 90 min.

## Offline
`luecke(dt)`: bis 60 s voller Wert; darüber nur die Hälfte; Deckel 8 h Wirkzeit-Eingabe. Spielstand enthält Zeitstempel `t` (ms). Negative/absurde Lücken (Uhr zurück, >1 Tag in der Zukunft) zählen 0. Beim Öffnen: „Während du weg warst: +X Taler“ (ab 60 s Abwesenheit). Auch ein versteckter Tab wird beim Zurückkehren so nachgerechnet.

## Bedienung
Maus/Touch und Tastatur: alle Kaufknöpfe sind Buttons (Tab/Enter), Preis im Knopf, bei zu wenig Geld `aria-disabled="true"` (Klick meldet „Noch zu wenig Taler“). Taste K kauft das „Nächste Ziel“. „Neues Bergwerk“ über die Shell (Taste N, Bestätigungsdialog der Shell); Rückgängig gibt es nicht (`kannRueckgaengig` → false).
Animation: Kabine fährt, Bergleute-Punkte laufen (CSS, ruhig); bei `bewegungReduziert()` aus (nur Zahlen/Balken). UI-Tick 200 ms.
Layout ab 360 px: Schächte untereinander, Seite scrollt senkrecht.

## Datenmodell (standVersion 1)
`{ v:1, t, uhr, sperre, geld, gesamt, aufzug:{tempo,ladung}, zentrum:{tempo,ladung,lager}, schaechte:[{n,tempo,trag,kiste}] }`
Streng validiert (`ausSpeicher`): Zahlen endlich und in Grenzen, Stufen ≤ Maximum, 1–12 Schächte; sonst neues Bergwerk.

## Tests
Wachstumskurve, Offline-Deckel, Determinismus, Validierung, keine Zeitrückwärts-Effekte, Kauf-Regeln, Formatierung, Stil (kein vibrate/Audio/eval), Spiel-Smoketest und kaputte Stände.
