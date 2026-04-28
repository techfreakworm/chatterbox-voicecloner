#!/usr/bin/env bash
# One-click: venv -> install -> build SPA -> serve -> open browser.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if command -v python3.11 >/dev/null 2>&1; then
    PY=python3.11
elif command -v python3 >/dev/null 2>&1; then
    PY=python3
else
    echo "ERROR: python3.11 (or python3) not found. Install Python 3.11+." >&2
    exit 1
fi

if [ ! -d .venv ]; then
    echo "==> Creating venv (.venv) with $PY"
    "$PY" -m venv .venv
fi
# shellcheck source=/dev/null
. .venv/bin/activate

REQ_HASH=$(shasum requirements.txt | awk '{print $1}')
MARKER=".venv/.installed-marker"
if [ ! -f "$MARKER" ] || [ "$(cat "$MARKER")" != "$REQ_HASH" ]; then
    echo "==> Installing python deps"
    pip install --upgrade pip
    pip install -r requirements.txt
    echo "$REQ_HASH" > "$MARKER"
fi

if [ ! -d web/node_modules ]; then
    echo "==> Installing web deps"
    (cd web && npm ci)
fi

if [ ! -d server/static ] || [ ! -f web/dist/index.html ]; then
    echo "==> Building web"
    (cd web && npm run build)
    rm -rf server/static
    mkdir -p server/static
    cp -R web/dist/* server/static/
fi

export PYTORCH_ENABLE_MPS_FALLBACK="${PYTORCH_ENABLE_MPS_FALLBACK:-1}"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-7860}"
URL="http://$HOST:$PORT"

echo "==> Serving on $URL"
( sleep 2 && python -m webbrowser "$URL" ) &
exec uvicorn server.main:app --host "$HOST" --port "$PORT"
