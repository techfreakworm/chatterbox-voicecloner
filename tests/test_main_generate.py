import httpx
import pytest

from server.main import build_app


pytestmark = pytest.mark.asyncio


async def test_generate_returns_wav_bytes(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    from tests.conftest import lifespan_ctx
    transport = httpx.ASGITransport(app=app)
    async with lifespan_ctx(app), httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/generate",
            data={
                "text": "hello world",
                "model_id": "fake",
                "params": "{}",
            },
        )
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("audio/wav")
    assert r.content == b"FAKEWAV"


async def test_generate_unknown_model_404(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    from tests.conftest import lifespan_ctx
    transport = httpx.ASGITransport(app=app)
    async with lifespan_ctx(app), httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/generate",
            data={"text": "x", "model_id": "nope", "params": "{}"},
        )
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "model_not_found"


async def test_generate_invalid_reference_returns_400(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    from tests.conftest import lifespan_ctx
    transport = httpx.ASGITransport(app=app)
    bad = b"not a wav"
    async with lifespan_ctx(app), httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/generate",
            data={"text": "x", "model_id": "fake", "params": "{}"},
            files={"reference_wav": ("ref.wav", bad, "audio/wav")},
        )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "reference_invalid"
