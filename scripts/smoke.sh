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

echo
echo "== generate dialog (2 speakers, en)"
# Make a tiny silent reference clip (1s mono 24k WAV) for both speakers.
REF_A=$(mktemp -t smoke_a.XXXXXX.wav)
REF_B=$(mktemp -t smoke_b.XXXXXX.wav)
python - <<'PY' "$REF_A"
import sys, numpy as np, soundfile as sf
sf.write(sys.argv[1], np.zeros(24000, dtype="float32"), 24000, format="WAV", subtype="PCM_16")
PY
python - <<'PY' "$REF_B"
import sys, numpy as np, soundfile as sf
sf.write(sys.argv[1], np.zeros(24000, dtype="float32"), 24000, format="WAV", subtype="PCM_16")
PY

OUT=$(mktemp -t smoke_dialog.XXXXXX.wav)
curl -fsS -X POST "$BASE/api/generate/dialog" \
    -F text='SPEAKER A: hi.
SPEAKER B: hello.' \
    -F engine_id=chatterbox-en \
    -F params='{}' \
    -F reference_wav_a=@"$REF_A" \
    -F reference_wav_b=@"$REF_B" \
    -o "$OUT"
HEAD=$(head -c 4 "$OUT" | xxd -p)
if [ "$HEAD" != "52494646" ]; then
    echo "FAIL: dialog output is not a RIFF wav (head=$HEAD)"
    exit 1
fi
echo "OK — wrote $OUT ($(wc -c <"$OUT") bytes)"
