"""Audio I/O and validation utilities."""
from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
import soundfile as sf


MIN_DURATION_S = 0.5
MAX_DURATION_S = 60.0
MIN_SAMPLE_RATE = 16000


class AudioValidationError(ValueError):
    """Raised when a reference clip fails validation."""


@dataclass(frozen=True)
class ClipInfo:
    duration_s: float
    sample_rate: int
    channels: int


def validate_reference_clip(wav_bytes: bytes) -> ClipInfo:
    try:
        with sf.SoundFile(io.BytesIO(wav_bytes)) as f:
            sample_rate = f.samplerate
            channels = f.channels
            frames = f.frames
    except Exception as exc:
        raise AudioValidationError(f"invalid audio format: {exc}") from exc

    duration_s = frames / float(sample_rate) if sample_rate else 0.0

    if sample_rate < MIN_SAMPLE_RATE:
        raise AudioValidationError(
            f"sample rate {sample_rate} below minimum {MIN_SAMPLE_RATE}"
        )
    if duration_s < MIN_DURATION_S:
        raise AudioValidationError(f"clip too short ({duration_s:.2f}s)")
    if duration_s > MAX_DURATION_S:
        raise AudioValidationError(f"clip too long ({duration_s:.2f}s)")

    return ClipInfo(duration_s=duration_s, sample_rate=sample_rate, channels=channels)


def write_wav_bytes(samples: np.ndarray, sample_rate: int) -> bytes:
    buf = io.BytesIO()
    sf.write(buf, samples, sample_rate, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def normalize_to_mono_16k(
    samples: np.ndarray, original_sr: int, target_sr: int = 16000
) -> tuple[np.ndarray, int]:
    """Downmix to mono and naive linear resample to target_sr."""
    if samples.ndim == 2:
        samples = samples.mean(axis=1)
    if original_sr == target_sr:
        return samples.astype(np.float32), target_sr
    duration = samples.shape[0] / float(original_sr)
    target_len = int(round(duration * target_sr))
    x_old = np.linspace(0.0, 1.0, samples.shape[0], endpoint=False)
    x_new = np.linspace(0.0, 1.0, target_len, endpoint=False)
    out = np.interp(x_new, x_old, samples).astype(np.float32)
    return out, target_sr
