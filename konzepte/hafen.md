# Konzept: Hafen (`spiele/hafen/`) – Version 2 mit Ebenen

Eigenes Idle-Management-Spiel. ID `hafen` · Name „Hafen“ · CSS-Präfix `ha-` · Währung „Münzen“ · `standVersion` 2 (Stände der ersten Fassung werden verworfen → neuer Hafen).
Ausnahme zum Briefing: Echtzeit-Fortschritt (nur Wartezeit, kein Zeitdruck, kein Verlieren, keine Töne). Nur Variante `standard`, kein Rückgängig.

## Recherche (Prinzip, keine Übernahme)
Bekannte Idle-Tycoon-Spiele bauen auf Stationen/Ebenen mit eigener Ressource, einer Kette Erzeugung → Puffer/Lager → Transport → Verkauf, Upgrades direkt an der Station und dem Grundsatz, dass die Stufen der Kette zueinander passen müssen (sonst staut es sich). Daraus: Ebenen mit eigener Ware, sichtbare Puffer an jeder Station, Engpässe zeigen (roter Balken), Upgrades in der Karte der Station.

## Prinzip
Jede **Ebene** hat eine eigene Ressource (Holz, Fisch, Erz, Kohle, Stoffe, Gewürze, Porzellan, Perlen; Wert ×3 je Ebene), ein eigenes Dock mit Schiff, Kran, Dock-Lager und Lader. Eine neue Ressource gibt es nur durch **Kauf der nächsten Ebene** (Preis 60 · 4^(n−2)).
Kette je Ebene: Schiff (Ladung) → Kran (nur im Entladefenster, stoßweise) → **Dock-Lager** → Lader → **Hauptlager** → Verkauf (wertvollste Ware zuerst) → Münzen.
Antippen eines Schiffs: kleiner Schub (+2 % einer Fahrt in das Dock-Lager, Pause 1,5 s).

## Upgrades (direkt in der Ebenen-Karte, mit Effekt-Vorschau „a → b“, Stufe, Preis)
- Kran (Tempo) · Schiffe (Größe, seltener Wartezeit) · Dock-Lager (Platz + Lader-Tempo) · Lotsenboot (einmalig, Anlegen schneller)
- Karte „Hafenanlagen“: Leuchtturm (alle Ebenen: größere Schiffe, kürzere Wartezeit/Anlegen), Verkaufshalle (Hauptlager-Platz + Verkaufstempo)
Kosten = Basis · Wachstum^(Stufe−1) (1,18–1,28), Ebenen-Upgrades zusätzlich ×5 je Ebene. Ein Upgrade ohne Wirkung auf das Einkommen wird nicht als „Nächstes Ziel“ empfohlen.

## Simulation (`logik.js`, ohne DOM, Zufall und Uhr)
`fortschritt(z, dt)` rein und deterministisch, n = min(600, max(1, ⌈dt/0,5⌉)) Schritte; je Schritt: Schiffsphase rückt vor, Ware im Entladefenster ins Dock-Lager (begrenzt durch freien Platz, Kran wartet bei vollem Lager), Lader → Hauptlager (begrenzt durch Platz), Verkauf. `kaufe`, `preis`, `effekt`, `naechstesZiel`, `einkommenDetail`, `anschub`, `formatiere` (de-DE), `formatiereDauer`.

## Offline
Abwesenheit bis 60 s voll, darüber Faktor 0,5, Deckel 8 h (`luecke`). Uhr zurück/absurd → 0; Zeitstempel > 1 Tag in der Zukunft → Stand verworfen. „Während du weg warst (…): +X Münzen“. Verstecker Tab: Takt stoppt, bei Rückkehr wird nachgerechnet.

## Oberfläche
Feste Leiste (`position: sticky` unter der Kopfleiste): Münzen, Einkommen/s, „Ziel“ knapp mit Kaufen-Knopf. Karte Hafenanlagen mit Leuchtturm-Szene, Hauptlager-Balken. Je Ebene eine Karte: Symbol, Wert, Ertrag/s, Schiff am Kai, drei Mengenzeilen (Schiff, Dock-Lager, Im Verkauf: Balken + „Menge / Kapazität“, feste Breiten, tabular-nums) und vier Upgrade-Knöpfe. Ruhige Dauerbewegung (Wellen, Leuchtfeuer, Schiffe), aus bei `bewegungReduziert()` (Klasse `ha-still`). Layout ab 360 px.
**Keine Neuaufbauten pro Tick:** Knöpfe/Balken werden einmal gebaut, danach nur Text/Breite bei Änderung (Test prüft Knotenidentität).
Bedienung: Buttons mit `aria-label` (inkl. Effekt und Einkommenszuwachs), Taste K kauft das Ziel, „Neuer Hafen“ mit Bestätigung.

## Datenmodell (standVersion 2)
`{ v:2, t, uhr, sperre, geld, gesamt, halle, turm, ebenen:[{kran,schiff,lager,lotse,p,puffer}], haupt:[8 Zahlen] }`, streng validiert (`ausSpeicher`), Zusatzfelder verworfen.

## Tests
Format, Puffer-Fluss und Kapazitäten, Verkauf teuerste zuerst, Determinismus, Schrittweiten-Konsistenz, Käufe/Maxima, Ebenen-Regeln, Effekt-Vorschau, Preiswachstum ≤ ×1,3, Wachstumskurve (erste 30 Käufe 3–180 s; zweite Ebene in 3–15 min; Ebenen mit Vorrang alle 1,5–20 min mit steigenden Preisen), Offline-Deckel/Konsistenz, Validierung/Fuzz/alte Stände, Oberfläche (keine Neuaufbauten, Käufe, K-Taste, neue Ebene, Abwesenheit, ruhig, Pause), kaputte Stände, Stil.
