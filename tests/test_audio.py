import io
import wave

import numpy as np
import pytest

from server.audio import (
    AudioValidationError,
    normalize_to_mono_16k,
    validate_reference_clip,
    write_wav_bytes,
)


def _make_wav_bytes(samples: np.ndarray, sample_rate: int, channels: int = 1) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        pcm = (samples * 32767).clip(-32768, 32767).astype(np.int16)
        if channels > 1:
            pcm = np.repeat(pcm[:, None], channels, axis=1).flatten()
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


def test_write_wav_bytes_roundtrip():
    samples = np.sin(np.linspace(0, 6.28, 24000)).astype(np.float32)
    wav_bytes = write_wav_bytes(samples, sample_rate=24000)
    assert wav_bytes[:4] == b"RIFF"
    with wave.open(io.BytesIO(wav_bytes)) as w:
        assert w.getnchannels() == 1
        assert w.getframerate() == 24000


def test_validate_accepts_valid_clip():
    samples = np.zeros(48000, dtype=np.float32)  # 2s at 24kHz
    wav = _make_wav_bytes(samples, 24000)
    info = validate_reference_clip(wav)
    assert info.duration_s == pytest.approx(2.0, rel=1e-3)
    assert info.sample_rate == 24000


def test_validate_rejects_too_short():
    samples = np.zeros(2400, dtype=np.float32)  # 0.1s
    wav = _make_wav_bytes(samples, 24000)
    with pytest.raises(AudioValidationError, match="too short"):
        validate_reference_clip(wav)


def test_validate_rejects_too_long():
    samples = np.zeros(24000 * 70, dtype=np.float32)  # 70s
    wav = _make_wav_bytes(samples, 24000)
    with pytest.raises(AudioValidationError, match="too long"):
        validate_reference_clip(wav)


def test_validate_rejects_low_sample_rate():
    samples = np.zeros(8000, dtype=np.float32)  # 1s at 8kHz
    wav = _make_wav_bytes(samples, 8000)
    with pytest.raises(AudioValidationError, match="sample rate"):
        validate_reference_clip(wav)


def test_validate_rejects_non_wav_bytes():
    with pytest.raises(AudioValidationError, match="format"):
        validate_reference_clip(b"not a wav")


def test_normalize_downmixes_stereo_and_resamples():
    samples = np.zeros((48000, 2), dtype=np.float32)  # 1s stereo at 48kHz
    out, sr = normalize_to_mono_16k(samples, original_sr=48000)
    assert out.ndim == 1
    assert sr == 16000
    assert out.shape[0] == 16000
