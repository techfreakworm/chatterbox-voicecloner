#!/usr/bin/env bash
# Smoke test against a running server on http://127.0.0.1:7860.
# Usage: scripts/smoke.sh [BASE_URL]
set -euo pipefail

BASE="${1:-http://127.0.0.1:7860}"

echo "== /api/health"
curl -fsS "$BASE/api/health" | tee /dev/stderr | grep -q '"device"'

echo
echo "== /api/models"
curl -fsS "$BASE/api/models" | tee /dev/stderr | grep -q 'chatterbox-en'

echo
echo "== activate chatterbox-en"
curl -fsS -X POST "$BASE/api/models/chatterbox-en/activate"

echo
echo "== generate (1 sentence)"
TMP=$(mktemp -t smoke.XXXXXX.wav)
curl -fsS -X POST "$BASE/api/generate" \
    -F text='Hello world from Chatterbox.' \
    -F model_id=chatterbox-en \
    -F params='{}' \
    -o "$TMP"
HEAD=$(head -c 4 "$TMP" | xxd -p)
if [ "$HEAD" != "52494646" ]; then
    echo "FAIL: output is not a RIFF wav (head=$HEAD)"
    exit 1
fi
echo "OK — wrote $TMP ($(wc -c <"$TMP") bytes)"
