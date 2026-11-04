# Erzeugt die PNG-Icons (gleiches Motiv wie icons/icon.svg) mit System.Drawing.
# Aufruf: pwsh -NoProfile -File werkzeuge\icons.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$ordner = Join-Path $PSScriptRoot '..\icons'

function Farbe([string]$hex, [int]$alpha = 255) {
  $c = [System.Drawing.ColorTranslator]::FromHtml($hex)
  [System.Drawing.Color]::FromArgb($alpha, $c.R, $c.G, $c.B)
}

function RundesRechteck($g, $pinsel, [float]$x, [float]$y, [float]$b, [float]$hh, [float]$r) {
  $p = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $b - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $b - $d, $y + $hh - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $hh - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  $g.FillPath($pinsel, $p)
  $p.Dispose()
}

# $maskierbar: Hintergrund randlos, Motiv in der sicheren Zone (80 %)
function Zeichne([int]$groesse, [string]$datei, [bool]$maskierbar) {
  $bmp = [System.Drawing.Bitmap]::new($groesse, $groesse)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)
  $k = $groesse / 512.0
  $gruen = [System.Drawing.SolidBrush]::new((Farbe '#2f7a72'))
  if ($maskierbar) { $g.FillRectangle($gruen, 0, 0, $groesse, $groesse) }
  else { RundesRechteck $g $gruen 0 0 $groesse $groesse (112 * $k) }

  $s = if ($maskierbar) { 0.78 } else { 1.0 }
  $mitte = 256
  $t = { param($v) (($v - $mitte) * $s + $mitte) * $k }
  $hell = [System.Drawing.SolidBrush]::new((Farbe '#f6f3ee'))
  $hellLeise = [System.Drawing.SolidBrush]::new((Farbe '#f6f3ee' 140))
  $gelb = [System.Drawing.SolidBrush]::new((Farbe '#e3c454'))
  $b = 124 * $s * $k; $r = 28 * $s * $k
  RundesRechteck $g $hell (& $t 120) (& $t 120) $b $b $r
  RundesRechteck $g $hellLeise (& $t 268) (& $t 120) $b $b $r
  RundesRechteck $g $hellLeise (& $t 120) (& $t 268) $b $b $r
  RundesRechteck $g $gelb (& $t 268) (& $t 268) $b $b $r

  $bmp.Save((Join-Path $ordner $datei), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "icons/$datei"
}

Zeichne 192 'icon-192.png' $false
Zeichne 512 'icon-512.png' $false
Zeichne 512 'icon-maskable-512.png' $true
