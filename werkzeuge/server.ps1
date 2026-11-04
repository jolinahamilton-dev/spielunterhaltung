# Lokaler Testserver für „Spielunterhaltung“ (ohne Node/Python, ohne Adminrechte)
# Start:  pwsh -NoProfile -File werkzeuge\server.ps1            → http://localhost:8080/
#         pwsh -NoProfile -File werkzeuge\server.ps1 -Port 8090
# Beenden: Strg+C
param(
  [int]$Port = 8080
)

$ErrorActionPreference = 'Stop'
$wurzel = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.svg' = 'image/svg+xml'
  '.png' = 'image/png'
  '.ico' = 'image/x-icon'
  '.md' = 'text/markdown; charset=utf-8'
  '.txt' = 'text/plain; charset=utf-8'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Spielunterhaltung läuft auf http://localhost:$Port/  (Ordner: $wurzel)  – Beenden mit Strg+C"

function Sende($antwort, [int]$status, [byte[]]$inhalt, [string]$typ) {
  $antwort.StatusCode = $status
  $antwort.ContentType = $typ
  $antwort.Headers['Cache-Control'] = 'no-store'
  $antwort.ContentLength64 = $inhalt.Length
  $antwort.OutputStream.Write($inhalt, 0, $inhalt.Length)
  $antwort.OutputStream.Close()
}

try {
  while ($listener.IsListening) {
    $aufgabe = $listener.GetContextAsync()
    # In kleinen Schritten warten, damit Strg+C wirkt
    while (-not $aufgabe.AsyncWaitHandle.WaitOne(250)) { }
    $kontext = $aufgabe.GetAwaiter().GetResult()
    $anfrage = $kontext.Request
    $antwort = $kontext.Response
    try {
      $pfad = [Uri]::UnescapeDataString($anfrage.Url.AbsolutePath)
      if ($pfad.EndsWith('/')) { $pfad += 'index.html' }
      $relativ = $pfad.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
      $voll = [System.IO.Path]::GetFullPath((Join-Path $wurzel $relativ))

      if (-not $voll.StartsWith($wurzel, [StringComparison]::OrdinalIgnoreCase)) {
        Sende $antwort 403 ([Text.Encoding]::UTF8.GetBytes('Verboten')) 'text/plain; charset=utf-8'
      }
      elseif (Test-Path -LiteralPath $voll -PathType Container) {
        $antwort.Redirect($anfrage.Url.AbsolutePath.TrimEnd('/') + '/')
        $antwort.Close()
      }
      elseif (Test-Path -LiteralPath $voll -PathType Leaf) {
        $endung = [System.IO.Path]::GetExtension($voll).ToLowerInvariant()
        $typ = $mime[$endung]
        if (-not $typ) { $typ = 'application/octet-stream' }
        Sende $antwort 200 ([System.IO.File]::ReadAllBytes($voll)) $typ
      }
      else {
        Sende $antwort 404 ([Text.Encoding]::UTF8.GetBytes("Nicht gefunden: $pfad")) 'text/plain; charset=utf-8'
      }
      Write-Host ("{0} {1} {2}" -f $antwort.StatusCode, $anfrage.HttpMethod, $pfad)
    }
    catch {
      Write-Host "Fehler: $_"
      try { $antwort.Abort() } catch { }
    }
  }
}
finally {
  $listener.Stop()
  $listener.Close()
}
