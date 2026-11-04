# Spielunterhaltung als Windows-App

Die Windows-App zeigt dieselben Spiele wie die Web-App, aber als eigenes Programm (Startmenü, eigenes Fenster,
kein Browser). Sie läuft komplett offline. Neue Versionen erscheinen als **GitHub-Release**
(gebaut von `.github/workflows/pc-release.yml`), und das Scoop-Manifest `bucket/spielunterhaltung.json`
wird dabei aktualisiert. Darüber zeigt **UniGetUI** Updates an – genau wie beim Anime Tracker.

## Installieren (einmalig)

### Weg A – über UniGetUI (empfohlen, mit Updates)
1. UniGetUI öffnen → **Einstellungen → Paketmanager → Scoop** → unter **Buckets** → **Bucket hinzufügen**:
   - Name: `spielunterhaltung`
   - URL: `https://github.com/jolinahamilton-dev/spielunterhaltung`
   (Alternativ im Terminal: `scoop bucket add spielunterhaltung https://github.com/jolinahamilton-dev/spielunterhaltung`)
2. In UniGetUI nach **spielunterhaltung** suchen → Quelle **Scoop** → **Installieren**.
3. „Spielunterhaltung“ steht danach im Startmenü (Ordner *Scoop Apps*).

### Weg B – Installer herunterladen
https://github.com/jolinahamilton-dev/spielunterhaltung/releases/latest → `Spielunterhaltung-Setup-x.y.z.exe`
herunterladen und ausführen. Windows SmartScreen warnt evtl. („unbekannter Herausgeber“, weil die App nicht
signiert ist) → **Weitere Informationen → Trotzdem ausführen**. Updates zeigt UniGetUI bei diesem Weg nicht an.

## Im Alltag
- UniGetUI meldet neue Versionen unter **Updates**. Vor dem Aktualisieren die App schließen.
- Spielstände liegen getrennt von der App in `%APPDATA%\spielunterhaltung` und bleiben bei Updates erhalten.
- Die Web-App im Browser hat **eigene** Spielstände. Umziehen: in der App unter **Info → Sicherung speichern / laden**.
- Tasten: **F11** Vollbild, **Strg+R** neu laden.

## Neue Version veröffentlichen (macht Claude)
1. `powershell -File werkzeuge\precache-liste.ps1 -Version x.y.z` – setzt die Version in `version.js` **und** `package.json`.
2. Tests laufen lassen, `CHANGELOG.md` ergänzen, committen.
3. Annotierten Tag anlegen und hochladen: `git tag -a vx.y.z -m "…Änderungen…"` → `git push origin main vx.y.z`
4. Der Workflow prüft Tag, `package.json` und `version.js`, baut Installer + Zip, legt das Release an
   (Text = Tag-Nachricht) und setzt Version + Prüfsumme im Scoop-Manifest. Der Push auf `main` aktualisiert
   gleichzeitig die Web-App auf GitHub Pages.

## Technik
- `desktop/main.cjs`: Electron-Hauptprozess. Liefert nur `index.html`, `version.js`, `manifest.webmanifest`,
  `css/`, `kern/`, `spiele/`, `icons/` über das eigene Schema `app://spielunterhaltung/` aus.
- Sicherheit: `contextIsolation`, `sandbox`, kein `nodeIntegration`, kein Preload; das Fenster kann nicht
  wegnavigieren, keine neuen Fenster öffnen und bekommt keine Geräterechte; dieselbe Content-Security-Policy wie im Web.
- Lokal starten (ohne npm, mit dem Electron aus dem Anime Tracker): `& "..\anime-tracker\node_modules\electron\dist\electron.exe" .`
- Selbsttest: `$env:SPIEL_SELBSTTEST = "$env:TEMP\desktop-test"; & "..\anime-tracker\node_modules\electron\dist\electron.exe" .`
