import asyncio

import httpx
import pytest

from server.main import build_app


pytestmark = pytest.mark.asyncio


async def test_activate_then_status_loaded(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    from tests.conftest import lifespan_ctx
    transport = httpx.ASGITransport(app=app)
    async with lifespan_ctx(app), httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/api/models/fake/activate")
        assert r.status_code in (200, 202)
        for _ in range(20):
            s = (await c.get("/api/models/active")).json()
            if s["status"] == "loaded":
                break
            await asyncio.sleep(0.05)
        assert s["id"] == "fake"
        assert s["status"] == "loaded"


async def test_activate_unknown_returns_404(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    from tests.conftest import lifespan_ctx
    transport = httpx.ASGITransport(app=app)
    async with lifespan_ctx(app), httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/api/models/nope/activate")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "model_not_found"


# Note: integration test for /api/models/active/events SSE stream is omitted.
# Registry event emission is unit-tested in tests/test_registry.py
# (test_emits_loading_then_loaded_events). The /api/models/active/events
# endpoint is a thin sse-starlette wrapper around that generator.
