# Testet Seiten in einem unsichtbaren Chromium (Electron aus dem Anime Tracker) – ohne Edge/Chrome.
# Voraussetzung: Testserver läuft (werkzeuge\server.ps1, Port 8080). Jeder Aufruf beginnt mit leerem Speicher.
#
# Beispiele (PowerShell, im Projektordner):
#   .\werkzeuge\test-lauf.ps1 -Url "http://localhost:8080/tests/einzel.html?datei=spiele/sudoku.test.js"
#   .\werkzeuge\test-lauf.ps1 -Url "http://localhost:8080/#/spiel/sudoku" -Warte "document.querySelector('.sd-feld')" `
#       -Js "document.querySelectorAll('.sd-zelle').length", "return 1+1" -Bild "C:\temp\sudoku.png" -Breite 375 -Hoehe 812 -Dunkel
#
# -Warte : JS-Ausdruck, bis er wahr ist (Standard: Test-Ergebnis bzw. 1,5 s)
# -Js    : ein oder mehrere JS-Ausdrücke/Blöcke (async, `return` erlaubt); Ergebnis wird als JSON ausgegeben
# -Bild  : Screenshot (PNG) nach allen -Js
param(
  [Parameter(Mandatory = $true)][string]$Url,
  [string]$Warte,
  [string[]]$Js = @(),
  [string]$Bild,
  [int]$Breite = 1200,
  [int]$Hoehe = 850,
  [int]$Zeit = 20000,
  [switch]$Dunkel
)

$electron = Join-Path $PSScriptRoot '..\..\anime-tracker\node_modules\electron\dist\electron.exe'
if (-not (Test-Path $electron)) { Write-Host "Electron nicht gefunden: $electron"; exit 2 }

# alte TL_*-Variablen entfernen
Get-ChildItem Env: | Where-Object { $_.Name -like 'TL_*' } | ForEach-Object { Remove-Item "Env:$($_.Name)" }
$env:TL_URL = $Url
if ($Warte) { $env:TL_WARTE = $Warte }
for ($i = 0; $i -lt $Js.Count; $i++) { Set-Item "Env:TL_JS$i" $Js[$i] }
if ($Bild) { $env:TL_BILD = $Bild }
$env:TL_BREITE = "$Breite"; $env:TL_HOEHE = "$Hoehe"; $env:TL_ZEIT = "$Zeit"
if ($Dunkel) { $env:TL_DUNKEL = '1' }

try {
  & $electron (Join-Path $PSScriptRoot 'test-lauf.cjs') 2>&1 | ForEach-Object { "$_" } |
    Where-Object { $_ -notmatch "console-message' arguments are deprecated" -and $_ -ne '' }
}
finally {
  Get-ChildItem Env: | Where-Object { $_.Name -like 'TL_*' } | ForEach-Object { Remove-Item "Env:$($_.Name)" }
}
