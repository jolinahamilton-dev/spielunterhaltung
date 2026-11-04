# Schreibt die Dateiliste für den Service Worker in version.js.
# Aufruf:  pwsh -NoProfile -File werkzeuge\precache-liste.ps1              (Version bleibt)
#          pwsh -NoProfile -File werkzeuge\precache-liste.ps1 -Version 0.2.0
param(
  [string]$Version
)

$ErrorActionPreference = 'Stop'
$wurzel = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$ziel = Join-Path $wurzel 'version.js'

if (-not $Version) {
  $alt = Get-Content -LiteralPath $ziel -Raw -ErrorAction SilentlyContinue
  if ($alt -match "SPIEL_VERSION\s*=\s*'([^']+)'") { $Version = $Matches[1] } else { $Version = '0.0.0' }
}

# Nicht in den Cache: Entwicklungs-Ordner, Dokumente, der Service Worker selbst
$ausgeschlossen = '^(\.git|\.claude|tests|werkzeuge|konzepte)(/|$)'
$dateien = Get-ChildItem -LiteralPath $wurzel -Recurse -File |
  ForEach-Object { $_.FullName.Substring($wurzel.Length).TrimStart('\', '/').Replace('\', '/') } |
  Where-Object { $_ -notmatch $ausgeschlossen } |
  Where-Object { $_ -notmatch '\.(md|ps1|mjs)$' } |
  Where-Object { $_ -notin @('sw.js', '.nojekyll', '.gitignore') } |
  Sort-Object

$zeilen = $dateien | ForEach-Object { "  './$_'," }
$inhalt = @"
// Wird von werkzeuge/precache-liste.ps1 geschrieben – Version hier oder per -Version erhöhen.
// Jede Veröffentlichung braucht eine neue Version, sonst holt sich der Service Worker kein Update.
self.SPIEL_VERSION = '$Version';
self.SPIEL_DATEIEN = [
  './',
$($zeilen -join "`n")
];
"@
[System.IO.File]::WriteAllText($ziel, $inhalt + "`n", [System.Text.UTF8Encoding]::new($false))
Write-Host "version.js: Version $Version, $($dateien.Count + 1) Einträge"
