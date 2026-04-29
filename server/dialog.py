"""Dialog mode: parse SPEAKER X: scripts into ordered turns and stitch
per-turn outputs into a single concatenated WAV.

Generator is in this same file but added in Task 12.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


_SPEAKER_RE = re.compile(r"^\s*SPEAKER\s+([A-D])\s*:\s*", re.MULTILINE)


@dataclass(frozen=True)
class DialogTurn:
    speaker: str   # "A" | "B" | "C" | "D"
    text: str


class DialogParseError(ValueError):
    """Raised when a dialog script can't be parsed into turns."""


def parse_dialog(text: str) -> list[DialogTurn]:
    matches = list(_SPEAKER_RE.finditer(text))
    if not matches:
        raise DialogParseError(
            "Use SPEAKER A: ... / SPEAKER B: ... lines to define turns."
        )
    turns: list[DialogTurn] = []
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        block = text[start:end].strip()
        if block:
            turns.append(DialogTurn(speaker=m.group(1), text=block))
    if not turns:
        raise DialogParseError("No non-empty speaker turns found.")
    return turns


import io as _io
import tempfile as _tempfile
from typing import Optional

import numpy as _np
import soundfile as _sf

from server.audio import AudioValidationError, validate_reference_clip, write_wav_bytes
from server.registry import Registry
from server.seed import apply_seed


SILENCE_GAP_MS = 250


class DialogReferenceError(ValueError):
    """Raised when a turn references a speaker without an uploaded clip."""


def _decode_wav_to_mono_float(wav_bytes: bytes) -> tuple[_np.ndarray, int]:
    arr, sr = _sf.read(_io.BytesIO(wav_bytes), dtype="float32", always_2d=False)
    if arr.ndim == 2:
        arr = arr.mean(axis=1)
    return arr.astype(_np.float32), int(sr)


def _save_temp_wav(data: bytes) -> str:
    tmp = _tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    tmp.write(data)
    tmp.flush()
    tmp.close()
    return tmp.name


async def generate_dialog(
    *,
    registry: Registry,
    engine_id: str,
    text: str,
    language: Optional[str],
    params: dict,
    speaker_clips: dict[str, bytes],   # letter -> raw upload bytes (already validated)
    silence_ms: int = SILENCE_GAP_MS,
    session: "object | None" = None,   # _Session from server.progress, or None
) -> tuple[bytes, int, int]:
    turns = parse_dialog(text)

    # Verify every referenced speaker has a clip.
    referenced = {t.speaker for t in turns}
    missing = referenced - set(speaker_clips.keys())
    if missing:
        raise DialogReferenceError(
            f"missing reference for speaker {sorted(missing)[0]}"
        )

    # Persist each clip to a tempfile path once (the adapter expects a path).
    paths: dict[str, str] = {
        letter: _save_temp_wav(blob) for letter, blob in speaker_clips.items()
    }

    adapter = await registry.get_or_load(engine_id)

    # Resolve and re-apply one seed for the whole dialog.
    seed_used = apply_seed(params.get("seed"))
    params_for_call = {**params, "seed": seed_used}

    sr_out: int | None = None
    adapter_seed_used: int = seed_used
    chunks: list[_np.ndarray] = []
    for i, turn in enumerate(turns):
        # Re-apply the same seed before each turn so the run is reproducible.
        apply_seed(seed_used)
        wav_bytes, sr, adapter_seed_used = adapter.generate(
            turn.text, paths[turn.speaker], language, params_for_call,
        )
        arr, _ = _decode_wav_to_mono_float(wav_bytes)
        chunks.append(arr)
        if sr_out is None:
            sr_out = sr
        if silence_ms > 0:
            chunks.append(_np.zeros(int(silence_ms * sr / 1000), dtype=_np.float32))
        if session is not None:
            await session.turn_complete(i + 1)

    assert sr_out is not None
    full = _np.concatenate(chunks) if chunks else _np.zeros(0, dtype=_np.float32)
    out = write_wav_bytes(full, sr_out)
    return out, sr_out, adapter_seed_used
