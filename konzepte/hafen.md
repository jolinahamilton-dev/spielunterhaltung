# Konzept: Hafen (`spiele/hafen/`)

Eigenes Idle-Management-Spiel („Hafen-Manager“). ID `hafen` · Name „Hafen“ · CSS-Präfix `ha-` · Währung „Münzen“.
Beschreibung: „Schiffe laufen ein, Kräne laden aus, das Lager verkauft – baue deinen kleinen Hafen in Ruhe aus.“

## Ausnahme zum Briefing
Echtzeit-Fortschritt ist gewollt (kein Zeitdruck, nur Wartezeit). Kein Verlieren, keine Sammelzwänge, keine Töne, kein Timer-Druck.
Varianten: nur `standard`. Rückgängig gibt es nicht.

## Prinzip
Seitenansicht: Leuchtturm links, Meer, darunter bis zu 6 **Docks**. Jedes Dock hat ein Schiff mit einer **Frachtart** (Holz, Fisch, Erz).
Schiffe kommen von selbst, legen an, werden von den Kränen entladen, die Ware geht ins **Lager**, die Lagerhalle verkauft sie gegen Münzen (wertvollste Fracht zuerst).
Antippen eines Schiffs beschleunigt das Entladen leicht (Schub von 2 % einer Fahrt, höchstens alle 1,5 s).

## Upgrades (alle als Buttons mit Preis)
- **Neues Dock** (bis 6; Preis ×3,2 je Dock)
- **Kräne: Tempo / Kapazität** (je bis Stufe 40)
- **Lagerhalle** (Lagerplatz + Verkaufstempo)
- **Schiffe: Größe / Häufigkeit**
- **Leuchtturm** (Reichweite: mehr und größere Schiffe, kürzere Wartezeit; schaltet Fisch ab Stufe 4 und Erz ab Stufe 8 frei)
- **Lotsenboot** (einmalig: Anlegen geht automatisch und ist dreimal so schnell)
Kosten = Basis · Wachstum^(Stufe−1), Wachstum 1,15–1,3, Wirkung linear sanft. **Frachtzuteilung** je Dock per Knopf; beim Freischalten einer neuen Fracht wechseln Docks, die auf der bisher besten Fracht liefen, automatisch (von Hand änderbar).

## Simulation (`logik.js`, ohne DOM, ohne Zufall)
Fließmodell. Je Dock i: Zykluszeit `T = Anlegen + Schiffsgröße/Krantempo + Wartezeit auf das nächste Schiff`; der Fortschritt `p ∈ [0,1)` im Zustand ist die Schiffsphase (ankommen → entladen → ablegen) und treibt die Anzeige.
Je Schritt: `dp = h/T`, Ware `dp·S` ins Lager, begrenzt durch freien Lagerplatz (+ Verkaufsrate im Schritt; dann warten die Kräne). Danach verkauft das Lager `min(Bestand, Rate·h)`, teuerste Fracht zuerst.
`fortschritt(z, dt)` teilt dt in n = min(600, max(1, ⌈dt/0,5⌉)) gleiche Schritte, liefert einen neuen Zustand (Eingabe bleibt unverändert).
`kaufe(z, was)` → `{ ok, zustand, preis, grund }`, `preis`, `naechstesZiel` (günstigstes Upgrade, das das Einkommen wirklich steigert, samt Wartezeit), `einkommen` (Gleichgewicht, Münzen/s), `formatiere` (de-DE, „1,2 Mio.“).

## Offline
`luecke(dt)`: Abwesenheit bis 60 s voll, darüber nur die Hälfte (Faktor ≤ 1), Deckel 8 h. Spielstand hat Zeitstempel `t` (ms): Uhr zurück oder absurde Werte (Zukunft) zählen 0; ein Stand mit `t` mehr als 1 Tag in der Zukunft ist ungültig. Beim Öffnen ab 60 s Abwesenheit: „Während du weg warst: +X Münzen“. Verstecker Tab: Takt stoppt, beim Zurückkehren wird nachgerechnet (gleiche `luecke`).
UI-Tick 200 ms. Speichern alle 10 s und bei jedem Kauf.

## Optik
Seitenansicht Hafen/Meer, ruhige Dauerbewegung (Wellen, Schiffe gleiten, Leuchtfeuer pulsiert, CSS). Bei `bewegungReduziert()`: Klasse `ha-still`, keine Animation, nur Zahlen/Balken. Farben nur über CSS-Variablen; Symbole (`ctx.farben`) bei Muster-Modus an den Fracht-Chips.
Layout: eine Spalte ab 360 px, Seite scrollt senkrecht.

## Bedienung
Alles Buttons (Tab/Enter), Preis im Knopf, bei zu wenig Geld `aria-disabled="true"` (Klick meldet „Noch zu wenig Münzen“). Taste K kauft das Nächste Ziel. „Neuer Hafen“ über Knopf und Shell-Taste N mit Bestätigung.

## Datenmodell (standVersion 1)
`{ v:1, t, uhr, sperre, geld, gesamt, docks:[{f,p}], kran:{tempo,kap}, halle, schiff:{groesse,haeufig}, turm, lotse, lager:[holz,fisch,erz] }`
Streng validiert (`ausSpeicher`): endliche Zahlen in Grenzen, ganze Stufen ≤ Maximum, 1–6 Docks, Fracht nur wenn vom Leuchtturm freigeschaltet, Lagerbestand ≤ Lagerplatz; Zusatzfelder werden verworfen. Ungültig → neuer Hafen.

## Tests
Wachstumskurve (Günstigstes-zuerst: erste 30 Käufe in den Zielgrenzen), Offline-Deckel und Zeitplausibilität, Determinismus, Validierung/Fuzz, Kaufregeln, Formatierung, Oberfläche (Smoketest, K-Taste, Abwesenheit, Neu, ruhig), kaputte Stände, Stil (kein vibrate/Audio/eval/innerHTML/Math.random).
