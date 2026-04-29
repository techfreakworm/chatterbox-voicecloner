import asyncio
import json

import httpx
import pytest

from server.main import build_app


pytestmark = pytest.mark.asyncio


async def _run_sse_until_done(app, path="/api/progress", timeout=3.0):
    """Drive the ASGI SSE endpoint manually and collect parsed events until
    a 'done'/'error' event arrives or the timeout fires.

    Note: httpx ASGITransport buffers the entire response before returning,
    so it can't be used to stream a long-lived SSE response. We invoke the
    ASGI app directly with a bespoke receive/send pair and parse SSE frames
    out of the body chunks as they're emitted. Returns (events, timed_out).
    """
    events: list[dict] = []
    request_consumed = asyncio.Event()
    stop = asyncio.Event()

    async def receive():
        if request_consumed.is_set():
            # Hold here until the test signals the client wants to disconnect.
            await stop.wait()
            return {"type": "http.disconnect"}
        request_consumed.set()
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        if message["type"] == "http.response.body":
            body = message.get("body", b"")
            for line in body.decode("utf-8", errors="replace").splitlines():
                line = line.strip()
                if not line.startswith("data:"):
                    continue
                payload = line[len("data:") :].strip()
                if not payload:
                    continue
                try:
                    evt = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                events.append(evt)
                if evt.get("type") in ("done", "error"):
                    stop.set()

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "headers": [],
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "server": ("test", 80),
        "client": ("test", 12345),
        "root_path": "",
    }

    app_task = asyncio.create_task(app(scope, receive, send))
    timed_out = False
    try:
        await asyncio.wait_for(stop.wait(), timeout=timeout)
    except asyncio.TimeoutError:
        timed_out = True
        stop.set()
    # Allow disconnect to propagate, then cancel the app task if still alive.
    await asyncio.sleep(0.05)
    if not app_task.done():
        app_task.cancel()
        try:
            await app_task
        except (asyncio.CancelledError, Exception):
            pass
    return events, timed_out


async def test_single_generate_emits_start_and_done(
    monkeypatch, fake_classes, reset_progress_bus,
):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    from tests.conftest import lifespan_ctx
    transport = httpx.ASGITransport(app=app)
    async with lifespan_ctx(app), httpx.AsyncClient(
        transport=transport, base_url="http://t",
    ) as c:
        # Start collecting SSE events from a parallel ASGI invocation.
        sse_task = asyncio.create_task(_run_sse_until_done(app, timeout=3.0))
        # Give the subscriber a moment to register before generate fires.
        await asyncio.sleep(0.05)
        gen_resp = await c.post(
            "/api/generate",
            data={"text": "hi", "model_id": "fake", "params": "{}"},
        )
        events, timed_out = await sse_task

    assert gen_resp.status_code == 200
    assert not timed_out, f"SSE timed out before 'done'; got events: {events}"
    types = [e["type"] for e in events]
    assert types[0] == "start"
    assert "done" in types
    done = next(e for e in events if e["type"] == "done")
    assert done["seed_used"] == 0
    assert done["kind"] == "single"


async def test_unknown_engine_does_not_emit_progress(
    monkeypatch, fake_classes, reset_progress_bus,
):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    from tests.conftest import lifespan_ctx
    transport = httpx.ASGITransport(app=app)
    async with lifespan_ctx(app), httpx.AsyncClient(
        transport=transport, base_url="http://t",
    ) as c:
        sse_task = asyncio.create_task(_run_sse_until_done(app, timeout=0.6))
        await asyncio.sleep(0.05)
        r = await c.post(
            "/api/generate",
            data={"text": "x", "model_id": "nope", "params": "{}"},
        )
        events, timed_out = await sse_task

    assert r.status_code == 404
    # Bus stayed quiet — no start/done fired because the route 404'd before
    # entering the session.
    assert timed_out
    assert events == []
