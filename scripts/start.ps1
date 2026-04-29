param(
    [string]$BindHost = "127.0.0.1",
    [int]$Port = 7860
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path "$PSScriptRoot/.."
Set-Location $Root

# ---------------------------------------------------------------------------
# Prereq check + optional winget install
# ---------------------------------------------------------------------------

function Test-Py311 {
    $py = Get-Command py -ErrorAction SilentlyContinue
    if (-not $py) { return $false }
    $listing = (& py -0 2>&1 | Out-String)
    return ($listing -match "3\.11")
}

function Test-Node {
    return [bool] (Get-Command npm -ErrorAction SilentlyContinue)
}

function Install-WithWinget($name, $id) {
    $w = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $w) {
        Write-Host ""
        Write-Host "$name not found, and 'winget' is not available on this system."
        Write-Host "Install $name manually, then re-run scripts\start.bat."
        if ($name -eq "Python 3.11") {
            Write-Host "  -> https://www.python.org/downloads/"
        } elseif ($name -eq "Node.js LTS") {
            Write-Host "  -> https://nodejs.org/"
        }
        exit 1
    }
    Write-Host ""
    $resp = Read-Host "$name not found. Install now via winget ($id)? [Y/n]"
    if ($resp -and ($resp -ne "y") -and ($resp -ne "Y")) {
        Write-Host "Skipped. Install $name manually and re-run."
        exit 1
    }
    Write-Host "==> Installing $name (this can take a couple of minutes)…"
    & winget install --id $id -e --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        Write-Error "winget install failed (exit $LASTEXITCODE)."
        exit 1
    }
    Write-Host ""
    Write-Host "==> $name installed."
    Write-Host "    Close this window and run scripts\start.bat again so the new PATH takes effect."
    exit 0
}

if (-not (Test-Py311)) { Install-WithWinget "Python 3.11" "Python.Python.3.11" }
if (-not (Test-Node))  { Install-WithWinget "Node.js LTS" "OpenJS.NodeJS.LTS" }

# ---------------------------------------------------------------------------
# venv + Python deps
# ---------------------------------------------------------------------------

if (-not (Test-Path ".venv")) {
    Write-Host "==> Creating venv (.venv)"
    & py -3.11 -m venv .venv
}

. .venv/Scripts/Activate.ps1

$reqHash = (Get-FileHash requirements.txt -Algorithm SHA1).Hash
$marker = ".venv/.installed-marker"
if (-not (Test-Path $marker) -or (Get-Content $marker) -ne $reqHash) {
    Write-Host "==> Installing python deps"
    pip install --upgrade pip
    pip install -r requirements.txt
    Set-Content $marker $reqHash
}

# ---------------------------------------------------------------------------
# web deps + build
# ---------------------------------------------------------------------------

if (-not (Test-Path "web/node_modules")) {
    Write-Host "==> Installing web deps"
    Push-Location web
    npm ci
    Pop-Location
}

if (-not (Test-Path "server/static/index.html")) {
    Write-Host "==> Building web"
    Push-Location web
    npm run build
    Pop-Location
    if (Test-Path "server/static") { Remove-Item -Recurse -Force "server/static" }
    New-Item -ItemType Directory -Force "server/static" | Out-Null
    Copy-Item -Recurse "web/dist/*" "server/static/"
}

# ---------------------------------------------------------------------------
# serve
# ---------------------------------------------------------------------------

$env:PYTORCH_ENABLE_MPS_FALLBACK = "1"
$Url = "http://${BindHost}:$Port"
Write-Host "==> Serving on $Url"
Start-Process $Url
uvicorn server.main:app --host $BindHost --port $Port
