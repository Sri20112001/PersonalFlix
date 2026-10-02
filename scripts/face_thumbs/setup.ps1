# PersonalFlix face sidecar setup: creates a self-contained venv under
# %LOCALAPPDATA%\PersonalFlix\tools\face and installs uniface (CPU) into it.
# Model weights download on first script run (SHA-256 verified by uniface).
# Re-run any time to repair/upgrade.
$ErrorActionPreference = "Stop"

$faceRoot = Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "PersonalFlix\tools\face"
$venv = Join-Path $faceRoot "venv"
$py = Join-Path $venv "Scripts\python.exe"

if (!(Test-Path $py)) {
  Write-Host "[face] creating venv at $venv"
  New-Item -ItemType Directory -Force -Path $faceRoot | Out-Null
  python -m venv $venv
}

Write-Host "[face] installing requirements..."
& $py -m pip install --upgrade pip
& $py -m pip install -r (Join-Path $PSScriptRoot "requirements.txt")

Write-Host "[face] verifying import..."
& $py -c "import uniface, cv2, numpy; print('uniface OK')"
Write-Host "[face] done. Venv python: $py"
