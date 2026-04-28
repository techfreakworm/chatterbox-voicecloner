param(
    [string]$BindHost = "127.0.0.1",
    [int]$Port = 7860
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path "$PSScriptRoot/.."
Set-Location $Root

$python = Get-Command py -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Error "Python launcher 'py' not found. Install Python 3.11+ from python.org."
    exit 1
}

if (-not (Test-Path ".venv")) {
    Write-Host "==> Creating venv (.venv)"
    & py -3.11 -m venv .venv
}

$activate = ".venv/Scripts/Activate.ps1"
. $activate

$reqHash = (Get-FileHash requirements.txt -Algorithm SHA1).Hash
$marker = ".venv/.installed-marker"
if (-not (Test-Path $marker) -or (Get-Content $marker) -ne $reqHash) {
    Write-Host "==> Installing python deps"
    pip install --upgrade pip
    pip install -r requirements.txt
    Set-Content $marker $reqHash
}

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

$env:PYTORCH_ENABLE_MPS_FALLBACK = "1"
$Url = "http://${BindHost}:$Port"
Write-Host "==> Serving on $Url"
Start-Process $Url
uvicorn server.main:app --host $BindHost --port $Port
