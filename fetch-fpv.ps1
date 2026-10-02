<#
.SYNOPSIS
  Scrape a freepornvideos.xxx video page, download the file, and register it
  for PersonalFlix (scenes_db.json + app.db).
.EXAMPLE
  .\fetch-fpv.ps1 -Url "https://www.freepornvideos.xxx/videos/93665510/indian-summer/"
  .\fetch-fpv.ps1 -Url "<url>" -Res 720m -NoScan
#>
param(
  [Parameter(Mandatory = $true)][string]$Url,
  [string]$Res = "480m",
  [switch]$NoScan
)

$ErrorActionPreference = "Stop"
$PornRoot = "P:\Personal\Porn"
$DbPath = "$env:LOCALAPPDATA\PersonalFlix\app.db"
$ApiBase = "http://127.0.0.1:31731"
$Tmp = "C:\Users\pugal\AppData\Local\Temp\opencode\fetch-fpv"
if (-not (Test-Path -LiteralPath $Tmp)) { New-Item -ItemType Directory -Path $Tmp | Out-Null }

function Clean-Name([string]$s) {
  # Keep long-form convention separators (" - ", double-space date) intact,
  # strip only filesystem-illegal characters.
  return ($s -replace '[<>:"/\\|?*]', "").Trim()
}

# 1. Fetch page ---------------------------------------------------------------
if ($Url -notmatch "/videos/(\d+)/") { throw "URL must look like .../videos/<id>/<slug>/" }
$siteId = $Matches[1]
$htmlFile = Join-Path $Tmp "$siteId.html"
curl.exe -sL -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" --max-time 60 $Url -o $htmlFile
$html = Get-Content -LiteralPath $htmlFile -Raw
if ($html -match "temporary unavailable" -or $html.Length -lt 10000) {
  throw "Site blocked the fetch (rate-limit). Wait a few minutes and retry."
}

# 2. Scrape details -----------------------------------------------------------
$titleTag = [regex]::Match($html, "<title>(.*?)</title>").Groups[1].Value.Trim()
$studio = ""
if ($titleTag -match "^\[(.+?)\]") { $studio = $Matches[1].Trim() }
$ld = [regex]::Match($html, '<script type="application/ld\+json">(.*?)</script>', "Singleline").Groups[1].Value
$title = ([regex]::Match($ld, '"name":\s*"([^"]+)"').Groups[1].Value -split " - ")[-1].Trim()
if (-not $title) { $title = ($titleTag -replace "^\[.+?\]\s*-\s*", "" -replace "\s*[-|,].*$", "").Trim() }
$isoDate = [regex]::Match($ld, '"uploadDate":\s*"(\d{4})-(\d{2})-(\d{2})')
$dateIso = "$($isoDate.Groups[1].Value)-$($isoDate.Groups[2].Value)-$($isoDate.Groups[3].Value)"
$dateFile = "$($isoDate.Groups[3].Value).$($isoDate.Groups[2].Value).$($isoDate.Groups[1].Value)"
$durIso = [regex]::Match($ld, '"duration":\s*"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?"')
$durSec = ([int]$durIso.Groups[1].Value) * 3600 + ([int]$durIso.Groups[2].Value) * 60 + ([int]$durIso.Groups[3].Value)
$models = [regex]::Matches($html, '/models/[^"]+/">([^<]+)</a>') |
  ForEach-Object { $_.Groups[1].Value.Trim() } | Sort-Object -Unique
$siteNames = [regex]::Matches($html, '/sites/[^"]+/">([^<]+)</a>') |
  ForEach-Object { $_.Groups[1].Value.Trim() } | Sort-Object -Unique | Select-Object -First 1
if (-not $studio) { $studio = $siteNames }
$fileUrl = ([regex]::Matches($html, "https://www\.freepornvideos\.xxx/get_file/[^""'\s<>]+") |
  ForEach-Object { $_.Value } | Sort-Object -Unique |
  Where-Object { $_ -match "_${Res}\.mp4" } | Select-Object -First 1)
if (-not $fileUrl) { throw "No ${Res} download link on page. Open the page and check available qualities." }

echo "STUDIO: $studio | TITLE: $title | DATE: $dateIso | DUR: ${durSec}s | MODELS: $($models -join ', ')"

# 3. Resolve studio folder + id ----------------------------------------------
$studiosDb = Get-Content -LiteralPath (Join-Path $PornRoot "studios_db.json") -Raw | ConvertFrom-Json
$studioId = ($studiosDb | Where-Object { $_.name -eq $studio -or $_._id -eq $studio.ToLower() } |
  Select-Object -First 1)._id
if (-not $studioId) {
  $studioId = ($studio.ToLower() -replace "'", "" -replace "\.", "" -replace "[^a-z0-9]+", "-").Trim("-")
  echo "WARN: '$studio' not in studios_db.json using id '$studioId'. Add it for exact-match scan linking."
}
$studioDir = Get-ChildItem -LiteralPath $PornRoot -Directory |
  Where-Object { $_.Name -eq $studio } | Select-Object -First 1
if (-not $studioDir) {
  $ci = Get-ChildItem -LiteralPath $PornRoot -Directory |
    Where-Object { $_.Name.ToLower() -eq $studio.ToLower() } | Select-Object -First 1
  if ($ci) { $studioDir = $ci } else { $studioDir = New-Item -ItemType Directory -Path (Join-Path $PornRoot $studio) }
}

# 4. Download -----------------------------------------------------------------
$base = Clean-Name (($models -join " - ") + " - " + $title + "  " + $dateFile + "_" + $Res + ".mp4")
$dest = Join-Path $studioDir.FullName $base
if (Test-Path -LiteralPath $dest) { throw "Already exists: $dest" }
echo "DOWNLOADING to $dest ..."
curl.exe -sL -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" --max-time 900 $fileUrl -o $dest
$got = (Get-Item -LiteralPath $dest).Length
if ($got -lt 10MB) { throw "Suspiciously small file ($got bytes). Page may have blocked the download." }
$probe = & ffprobe.exe -v error -show_entries format=duration -of csv=p=0 $dest 2>$null
$gotSec = [int][math]::Round([double]$probe)
$diff = [math]::Abs($gotSec - $durSec)
echo "FILE: $([math]::Round($got / 1MB, 1)) MB, $($gotSec)s (page: ${durSec}s, diff ${diff}s)"
if ($diff -gt 90) { echo "WARN: duration differs >90s from page. Verify content before keeping." }

# 5. Register -----------------------------------------------------------------
$perfDb = Get-Content -LiteralPath (Join-Path $PornRoot "performers_db.json") -Raw | ConvertFrom-Json
$pids = @($models | ForEach-Object { $n = $_; ($perfDb | Where-Object { $_.name -eq $n } | Select-Object -First 1)._id } | Where-Object { $_ })
$rel = "Porn/" + $studioDir.Name + "/" + $base
$orig = "${siteId}_${Res}.mp4"

$j = Get-Content -LiteralPath (Join-Path $PornRoot "scenes_db.json") -Raw | ConvertFrom-Json
$list = [System.Collections.ArrayList]$j
if ($list._id -notcontains [int]$siteId) {
  $list.Add([PSCustomObject]@{
      _id            = [int]$siteId; file_name = $base; original_name = $orig; resolution = $Res
      studio         = $studio; title = $title; performers = @($models); date = $dateIso; network = ""
      source_url     = $Url; file_path = $rel; performer_ids = @($pids)
      studio_id      = $studioId; category_ids = @()
    }) | Out-Null
  $list | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $PornRoot "scenes_db.json") -Encoding UTF8
  echo "scenes_db.json: $($list.Count) rows"
} else { echo "scenes_db.json already has id $siteId" }

$Q = { param($s) return ($s -replace "'", "''") }
$J = { param($a) if ($a.Count -eq 0) { return '[]' }; return ('["' + (($a -join '","')) + '"]') }
$sql = "INSERT OR IGNORE INTO scenes (id, file_name, original_name, resolution, studio, studio_id, title, performers, performer_ids, date, network, source_url, file_path, category_ids, related_ids, file_exists) VALUES ($siteId,'" + (& $Q $base) + "','" + $orig + "','" + $Res + "','" + (& $Q $studio) + "','" + $studioId + "','" + (& $Q $title) + "','" + (& $Q (& $J $models)) + "','" + (& $Q (& $J $pids)) + "','" + $dateIso + "','','$Url','" + (& $Q $rel) + "','[]','[]',1);"
Set-Content -LiteralPath (Join-Path $Tmp "ins.sql") -Value $sql -Encoding UTF8
C:\platform-tools\sqlite3.exe $DbPath ".read $(Join-Path $Tmp 'ins.sql')"
echo "app.db scenes: $(C:\platform-tools\sqlite3.exe $DbPath 'SELECT COUNT(*) FROM scenes;')"

# 6. Scan ---------------------------------------------------------------------
if (-not $NoScan) {
  try {
    $scan = Invoke-RestMethod -Uri "$ApiBase/api/library/scan" -Method Post -TimeoutSec 300
    echo "SCAN: files=$($scan.files) updated=$($scan.updated) new=$($scan.new) missing=$($scan.missing) conflicts=$($scan.conflicts)"
  } catch { echo "SCAN skipped (server not running): $($_.Exception.Message)" }
}
echo "DONE: $base"
