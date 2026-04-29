import io

import httpx
import numpy as np
import pytest
import soundfile as sf

from server.main import build_app


pytestmark = pytest.mark.asyncio


def _silent_wav(seconds: float = 1.0, sr: int = 24000) -> bytes:
    samples = np.zeros(int(seconds * sr), dtype=np.float32)
    buf = io.BytesIO()
    sf.write(buf, samples, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


async def test_dialog_generates_concatenated_wav(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    # Have FakeAdapter emit a real silent WAV so the dialog generator can decode it.
    monkeypatch.setattr(
        fake_classes["fake"],
        "generate",
        lambda self, text, ref, lang, p: (_silent_wav(0.2), 24000, 0),
    )
    app = build_app()
    from tests.conftest import lifespan_ctx
    transport = httpx.ASGITransport(app=app)
    async with lifespan_ctx(app), httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        files = {
            "reference_wav_a": ("a.wav", _silent_wav(1.0), "audio/wav"),
            "reference_wav_b": ("b.wav", _silent_wav(1.0), "audio/wav"),
        }
        r = await c.post(
            "/api/generate/dialog",
            data={
                "text": "SPEAKER A: hi\nSPEAKER B: hello",
                "engine_id": "fake",
                "params": "{}",
            },
            files=files,
        )
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("audio/wav")
    assert r.content[:4] == b"RIFF"
    assert r.headers["x-seed-used"] == "0"


async def test_dialog_format_invalid(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    from tests.conftest import lifespan_ctx
    transport = httpx.ASGITransport(app=app)
    async with lifespan_ctx(app), httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/generate/dialog",
            data={"text": "no speaker tags", "engine_id": "fake", "params": "{}"},
            files={
                "reference_wav_a": ("a.wav", _silent_wav(1.0), "audio/wav"),
            },
        )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "dialog_format_invalid"


async def test_dialog_missing_reference(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    monkeypatch.setattr(
        fake_classes["fake"],
        "generate",
        lambda self, text, ref, lang, p: (_silent_wav(0.2), 24000, 0),
    )
    app = build_app()
    from tests.conftest import lifespan_ctx
    transport = httpx.ASGITransport(app=app)
    async with lifespan_ctx(app), httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/generate/dialog",
            data={
                "text": "SPEAKER A: hi\nSPEAKER B: hello",
                "engine_id": "fake",
                "params": "{}",
            },
            files={"reference_wav_a": ("a.wav", _silent_wav(1.0), "audio/wav")},
        )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "dialog_missing_reference"


async def test_dialog_unknown_engine_404(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    from tests.conftest import lifespan_ctx
    transport = httpx.ASGITransport(app=app)
    async with lifespan_ctx(app), httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/generate/dialog",
            data={
                "text": "SPEAKER A: hi",
                "engine_id": "nope",
                "params": "{}",
            },
            files={"reference_wav_a": ("a.wav", _silent_wav(1.0), "audio/wav")},
        )
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "model_not_found"
