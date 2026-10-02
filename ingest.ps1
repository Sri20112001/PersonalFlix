<#
.SYNOPSIS
  One-shot library ingest: group new root files into studio folders, strip the
  studio prefix, parse performers, register scene rows, then scan + backfill.
.DESCRIPTION
  Idempotent: every step skips work that already exists (folders, rows by
  file_name, links). New performer names are NOT invented here — rows carry
  display names and the app's backfill endpoint verifies each against its
  model page before creating/linking. Known male names (list below) are
  pre-created with the right gender so verification keeps it.
.EXAMPLE
  .\ingest.ps1                  # full run
  .\ingest.ps1 -WhatIf          # print plan only, change nothing
  .\ingest.ps1 -SkipBackfill    # files + rows only, verify later from Health page
#>
param([switch]$WhatIf, [switch]$SkipScan, [switch]$SkipBackfill)

$ErrorActionPreference = "Stop"
$PornRoot = "P:\Personal\Porn"
$DbPath = "$env:LOCALAPPDATA\PersonalFlix\app.db"
$ApiBase = "http://127.0.0.1:31731"
$Tmp = "C:\Users\pugal\AppData\Local\Temp\opencode\ingest"
if (-not (Test-Path -LiteralPath $Tmp)) { New-Item -ItemType Directory -Path $Tmp | Out-Null }

# Curated once: male performers get gender='male' on creation. Learned names
# are appended to ingest-males.txt next to this script (same format, one per
# line) so future runs pick them up. Everyone else defaults to female and the
# backfill never changes gender, only creates + links.
$MaleNames = @(
  "Alberto Blanco", "Alex Jones", "Alex Legend", "Billy Glide", "Chad White",
  "Chris Diamond", "Christian Clay", "Codey Steele", "Daniel Hunter", "Danny D",
  "Danny Mountain", "Derrick Ferrari", "Derrick Pierce", "Enzo East",
  "Eric Masterson", "Erik Everhard", "Isiah Maxwell", "James Deen", "Jason Brown",
  "Jean Val Jean", "John Strong", "Johnny Castle", "Johnny Sins", "Jordan Ash",
  "Justin Hunt", "Manuel Ferrara", "Marcello Bravo", "Markus Dupree",
  "Matthew Meier", "Michael Vegas", "Mick Blue", "Mike Adriano", "Mikey Butders",
  "Mr. Pete", "Ricky Johnson", "Rob Piper", "Ryan Mclane", "Seth Gamble",
  "Small Hands", "Steve Holmes", "Stirling Cooper", "Tommy Gunn", "Tony De Sergio",
  "Xander Corvus", "Keiran Lee", "Jake Adams", "Brickzilla", "Lexington Steele",
  "Oliver Flynn", "Charles Dera", "Scott Nails", "Michael Fly", "Dustin Daring",
  "Robby Apples", "Karlo Karerra", "Ryan Driller"
)
$MaleFile = Join-Path $PSScriptRoot "ingest-males.txt"
if (Test-Path -LiteralPath $MaleFile) {
  $learned = Get-Content -LiteralPath $MaleFile | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith("#") }
  $MaleNames = @($MaleNames + $learned | Sort-Object -Unique)
}

function Slug($s) { return (($s.ToLower() -replace "'", "" -replace "\.", "" -replace "[^a-z0-9]+", "-").Trim("-")) }
$Q = { param($s) return ($s -replace "'", "''") }
$JJ = { param($a) if ($a.Count -eq 0) { return '[]' }; return ('["' + (($a -join '","')) + '"]') }
function Qry($sql) { return C:\platform-tools\sqlite3.exe $DbPath $sql }

# 0. Backups ---------------------------------------------------------------
if (-not $WhatIf) {
  $ts = Get-Date -Format "yyyyMMdd-HHmm"
  Copy-Item -LiteralPath (Join-Path $PornRoot "scenes_db.json") -Destination (Join-Path $PornRoot "scenes_db.backup-$ts.json") -Force
  Copy-Item -LiteralPath $DbPath -Destination "$env:LOCALAPPDATA\PersonalFlix\app.db.backup-$ts.db" -Force
  echo "[backup] $ts"
}
# Performer snapshot for the end-of-run gender check (step 7).
$dbIds = @(Qry "SELECT id FROM performers;")

# 1. Group -----------------------------------------------------------------
$toGroup = Get-ChildItem -LiteralPath $PornRoot -File -Filter "*.mp4" |
  Where-Object { $_.Name -match " - " }
echo "[group] root files with studio prefix: $($toGroup.Count)"
$moved = 0
foreach ($f in $toGroup) {
  $idx = $f.Name.IndexOf(" - ")
  $studio = $f.Name.Substring(0, $idx)
  $newName = $f.Name.Substring($idx + 3)
  $destDir = Join-Path $PornRoot $studio
  if ($WhatIf) { echo "  MOVE [$studio] $newName"; continue }
  if (-not (Test-Path -LiteralPath $destDir)) {
    New-Item -ItemType Directory -Path $destDir | Out-Null
    echo "  NEW FOLDER: $studio"
  }
  $dest = Join-Path $destDir $newName
  if (Test-Path -LiteralPath $dest) { echo "  SKIP exists: $dest"; continue }
  Move-Item -LiteralPath $f.FullName -Destination $dest
  $moved++
}
echo "[group] moved: $moved"

# 2. Studio map (exact name/id match, else slug + create) -------------------
$studiosDb = Get-Content -LiteralPath (Join-Path $PornRoot "studios_db.json") -Raw | ConvertFrom-Json
$slist = [System.Collections.ArrayList]$studiosDb
$studioIdOf = @{}
foreach ($s in $slist) {
  $studioIdOf[$s.name.ToLower()] = $s._id
  $studioIdOf[$s._id.ToLower()] = $s._id
}
function Get-StudioId($studio, $create) {
  $k = $studio.ToLower()
  if ($studioIdOf.ContainsKey($k)) { return $studioIdOf[$k] }
  $id = Slug $studio
  if ($create) {
    $slist.Add([PSCustomObject]@{ _id = $id; name = $studio }) | Out-Null
    $studioIdOf[$k] = $id; $studioIdOf[$id] = $id
    Qry "INSERT OR IGNORE INTO studios (id, name) VALUES ('$id','$(($studio -replace "'", "''")))');"
    echo "  NEW STUDIO: $studio ($id)"
  }
  return $id
}

# 3. Discover unregistered descriptive files --------------------------------
$regNames = @{}
foreach ($n in (Get-Content -LiteralPath (Join-Path $PornRoot "scenes_db.json") -Raw | ConvertFrom-Json | ForEach-Object { $_.file_name })) { $regNames[$n] = 1 }
foreach ($n in (Qry "SELECT file_name FROM scenes;")) { $regNames[$n] = 1 }
$cands = Get-ChildItem -LiteralPath $PornRoot -File -Recurse -Filter "*.mp4" |
  Where-Object { $_.Name -match " - " -and -not $regNames.ContainsKey($_.Name) } |
  Sort-Object FullName
echo "[discover] unregistered descriptive files: $($cands.Count)"
$plan = foreach ($f in $cands) {
  # In -WhatIf mode files still sit in root: derive the studio from the prefix.
  $studioDir = $f.Directory.Name
  $parseName = $f.Name
  if ($f.Directory.FullName -eq $PornRoot) {
    $idx = $f.Name.IndexOf(" - ")
    $studioDir = $f.Name.Substring(0, $idx)
    $parseName = $f.Name.Substring($idx + 3)
  }
  $stem = [System.IO.Path]::GetFileNameWithoutExtension($parseName)
  $core = $stem; $iso = ""; $res = ""
  if ($stem -match "^(.*)  (\d{2})\.(\d{2})\.(\d{4})_(.+)$") {
    $core = $Matches[1]; $iso = "$($Matches[4])-$($Matches[3])-$($Matches[2])"; $res = $Matches[5]
  }
  $segs = $core -split " - "
  if ($segs.Count -lt 2) { continue }
  [PSCustomObject]@{
    file      = $f.FullName; name = $f.Name; studioDir = $studioDir
    title     = $segs[-1].Trim()
    perfs     = @($segs[0..($segs.Count - 2)] | ForEach-Object { $_.Trim() })
    date      = $iso; res = $res
  }
}
$plan | Format-Table name -AutoSize | Out-String | Write-Output
if ($WhatIf) { echo "[whatif] stopping before writes"; return }

# 4. Pre-create known males (so verification preserves gender) -------------
$dbIds = @(Qry "SELECT id FROM performers;")
$dbNames = @(Qry "SELECT name FROM performers;")
$nameToId = @{}
for ($i = 0; $i -lt $dbNames.Count; $i++) { $nameToId[$dbNames[$i]] = $dbIds[$i] }
$malesNew = $plan.perfs | Sort-Object -Unique | Where-Object { ($MaleNames -contains $_) -and (-not $nameToId.ContainsKey($_)) }
$pseed = Get-Content -LiteralPath (Join-Path $PornRoot "performers_db.json") -Raw | ConvertFrom-Json
$plist = [System.Collections.ArrayList]$pseed
foreach ($n in $malesNew) {
  $id = Slug $n
  Qry "INSERT OR IGNORE INTO performers (id, name, slug, gender) VALUES ('$id','$(($n -replace "'", "''"))','$id','male');"
  if ($plist._id -notcontains $id) {
    $plist.Add([PSCustomObject]@{ _id = $id; name = $n; slug = $id; gender = "male" }) | Out-Null
  }
  $nameToId[$n] = $id
  echo "  MALE: $n"
}
$plist | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $PornRoot "performers_db.json") -Encoding UTF8

# 5. Scene rows (JSON + DB) -------------------------------------------------
$maxId = [int](Qry "SELECT MAX(id) FROM scenes;")
$j = Get-Content -LiteralPath (Join-Path $PornRoot "scenes_db.json") -Raw | ConvertFrom-Json
$jlist = [System.Collections.ArrayList]$j
$nextId = $maxId + 1
$sql = foreach ($p in $plan) {
  $sid = Get-StudioId $p.studioDir $true
  $pids = @($p.perfs | ForEach-Object { if ($nameToId.ContainsKey($_)) { $nameToId[$_] } } | Where-Object { $_ })
  $rel = "Porn/" + $p.studioDir + "/" + $p.name
  $jlist.Add([PSCustomObject]@{
      _id = $nextId; file_name = $p.name; original_name = $p.name; resolution = $p.res
      studio = $p.studioDir; title = $p.title; performers = @($p.perfs); date = $p.date; network = ""
      source_url = ""; file_path = $rel; performer_ids = @($pids); studio_id = $sid; category_ids = @()
    }) | Out-Null
  $vals = @($nextId, (& $Q $p.name), (& $Q $p.name), $p.res, (& $Q $p.studioDir), $sid, (& $Q $p.title), (& $Q (& $JJ $p.perfs)), (& $Q (& $JJ $pids)), $p.date, "", "", (& $Q $rel), "[]", "[]", 1)
  $nextId++
  "INSERT OR IGNORE INTO scenes (id, file_name, original_name, resolution, studio, studio_id, title, performers, performer_ids, date, network, source_url, file_path, category_ids, related_ids, file_exists) VALUES (" + $vals[0] + ",'" + $vals[1] + "','" + $vals[2] + "','" + $vals[3] + "','" + $vals[4] + "','" + $vals[5] + "','" + $vals[6] + "','" + $vals[7] + "','" + $vals[8] + "','" + $vals[9] + "','" + $vals[10] + "','" + $vals[11] + "','" + $vals[12] + "','" + $vals[13] + "','" + $vals[14] + "'," + $vals[15] + ");"
}
$jlist | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $PornRoot "scenes_db.json") -Encoding UTF8
$slist | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $PornRoot "studios_db.json") -Encoding UTF8
$sql | Set-Content -LiteralPath (Join-Path $Tmp "ingest.sql") -Encoding UTF8
Qry ".read $(Join-Path $Tmp 'ingest.sql')"
echo "[rows] scenes: $(Qry 'SELECT COUNT(*) FROM scenes;') json: $($jlist.Count)"

# 6. Scan + backfill ----------------------------------------------------------
if (-not $SkipScan) {
  try {
    $s = Invoke-RestMethod -Uri "$ApiBase/api/library/scan" -Method Post -TimeoutSec 300
    echo "[scan] files=$($s.files) updated=$($s.updated) new=$($s.new) missing=$($s.missing) conflicts=$($s.conflicts)"
  } catch { echo "[scan] FAILED (server running?): $($_.Exception.Message)" }
}
if (-not $SkipBackfill) {
  try {
    $b = Invoke-RestMethod -Uri "$ApiBase/api/library/fetch-backfill" -Method Post -ContentType "application/json" -Body '{"dry_run":false,"existing":false}' -TimeoutSec 60
    if ($b.job_id) {
      echo "[backfill] job $($b.job_id), polling..."
      for ($i = 1; $i -le 60; $i++) {
        Start-Sleep -Seconds 20
        try { $st = Invoke-RestMethod -Uri "$ApiBase/api/library/fetch/$($b.job_id)" -TimeoutSec 20 }
        catch { continue }
        if ($st.state -notin @("queued", "downloading")) { echo "[backfill] $($st.state): $($st.message)"; break }
      }
    } else { echo "[backfill] $($b.error)" }
  } catch { echo "[backfill] FAILED: $($_.Exception.Message)" }
}
# 7. Gender check -------------------------------------------------------------
# Newcomers default female. Diff the performer table around the backfill and
# let the user mark males (M) / transgender (T) — learned into ingest-males.txt.
if (-not $SkipBackfill) {
  $afterIds = @(Qry "SELECT id FROM performers;")
  $afterNames = @(Qry "SELECT name FROM performers;")
  $newOnes = @()
  for ($i = 0; $i -lt $afterIds.Count; $i++) {
    if ($dbIds -notcontains $afterIds[$i]) {
      $newOnes += [PSCustomObject]@{ n = ($newOnes.Count + 1); id = $afterIds[$i]; name = $afterNames[$i] }
    }
  }
  # NOTE: $dbIds snapshot must be taken before step 4; see below.
  if ($newOnes.Count -gt 0) {
    echo "[gender] newcomers defaulted female:"
    $newOnes | Format-Table n, name -AutoSize | Out-String | Write-Output
    $ans = Read-Host "mark males/trans (e.g. 2,5 T7 - Enter for none)"
    $toMale = @(); $toTrans = @()
    foreach ($tok in ($ans -split ",")) {
      $tok = $tok.Trim()
      if (-not $tok) { continue }
      if ($tok -match "^T(\d+)$") {
        $hit = $newOnes | Where-Object { $_.n -eq [int]$Matches[1] }
        if ($hit) { $toTrans += $hit }
      } elseif ($tok -match "^\d+$") {
        $hit = $newOnes | Where-Object { $_.n -eq [int]$tok }
        if ($hit) { $toMale += $hit }
      }
    }
    $pseed2 = Get-Content -LiteralPath (Join-Path $PornRoot "performers_db.json") -Raw | ConvertFrom-Json
    $plist2 = [System.Collections.ArrayList]$pseed2
    foreach ($m in $toMale) {
      Qry "UPDATE performers SET gender='male' WHERE id='$($m.id)';"
      $row = $plist2 | Where-Object { $_._id -eq $m.id } | Select-Object -First 1
      if ($row) { $row.gender = "male" } else {
        $plist2.Add([PSCustomObject]@{ _id = $m.id; name = $m.name; slug = $m.id; gender = "male" }) | Out-Null
      }
      Add-Content -LiteralPath $MaleFile -Value $m.name
      echo "  MALE: $($m.name) (learned)"
    }
    foreach ($m in $toTrans) {
      Qry "UPDATE performers SET gender='transgender' WHERE id='$($m.id)';"
      $row = $plist2 | Where-Object { $_._id -eq $m.id } | Select-Object -First 1
      if ($row) { $row.gender = "transgender" }
      echo "  TRANS: $($m.name)"
    }
    $plist2 | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $PornRoot "performers_db.json") -Encoding UTF8
  } else { echo "[gender] no newcomers" }
}
echo "[done]"
