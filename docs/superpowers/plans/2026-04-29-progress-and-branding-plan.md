# Progress UI + Footer Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show inference-driven progress feedback (`start`, per-turn complete, `done`, `error`) while a generation is running, render an editorial-style "Made with ♥ by techfreakworm" footer credit linking to mayankgupta.in.

**Architecture:** Server-side `ProgressBus` (asyncio fan-out) emits events to a `/api/progress` SSE stream while `/api/generate` and `/api/generate/dialog` are wrapped in `bus.session(...)`. Frontend `useProgress` hook subscribes and renders a `ProgressBar` (determinate fill in Dialog mode, indeterminate stripe in Single). Footer adds a centered `MadeBy` block — Fraunces serif name, mono caps surrounding it, ember heart, single anchor.

**Tech Stack:** Python 3.11, FastAPI + sse-starlette; React 18, TypeScript, Vite, Tailwind, Vitest.

**Repo:** `/Users/techfreakworm/Projects/llm/chatterbox-voicecloner`

**Spec:** `docs/superpowers/specs/2026-04-29-progress-and-branding-design.md`

**Sequencing requirement:** This plan depends on the param-expansion plan's Task 12 (`/api/generate/dialog` endpoint) being committed before this plan's Task 3 runs. Tasks 1, 2, 4, 5, 6, 7 of *this* plan can run independently of that. Tasks 3 must wait until `server/dialog.py` and the `/api/generate/dialog` route exist on master.

**Repo conventions (from `CLAUDE.md`):**
- Mayank Gupta is the **sole author** on every commit. Never include `Co-Authored-By: Claude` trailers, "Generated with Claude Code" footers, or any AI attribution.
- Server is stateless — no DBs.
- Multi-platform: macOS (MPS), Linux (CUDA/CPU), Windows (CUDA/CPU), HF Spaces.

**TDD policy:** Pure logic and components are written test-first. Adapter/model code is exercised through fakes; real-model integration is verified manually.

---

## File Structure (delta vs current main)

```
chatterbox-voicecloner/
├── server/
│   ├── progress.py                            NEW (Task 1)
│   ├── main.py                                MODIFY (Tasks 2, 3)
│   └── dialog.py                              MODIFY (Task 3)
├── tests/
│   ├── test_progress.py                       NEW (Task 1)
│   ├── test_main_progress_sse.py              NEW (Task 2, extended Task 3)
│   └── conftest.py                            MODIFY (Task 1) — add `reset_progress_bus` fixture
├── web/
│   ├── tailwind.config.ts                     MODIFY (Task 4)
│   └── src/
│       ├── lib/progress.ts                    NEW (Task 5)
│       ├── components/
│       │   ├── ProgressBar.tsx                NEW (Task 6)
│       │   └── MadeBy.tsx                     NEW (Task 7)
│       ├── pages/Studio.tsx                   MODIFY (Tasks 6, 7)
│       └── test/
│           ├── progress.test.ts               NEW (Task 5)
│           └── MadeBy.test.tsx                NEW (Task 7)
```

---

## Task 1: Backend — `ProgressBus` and `Session`

**Files:**
- Create: `server/progress.py`
- Test: `tests/test_progress.py`
- Modify: `tests/conftest.py` — add a fixture that resets the module-level bus singleton between tests.

- [ ] **Step 1: Add a fixture in `tests/conftest.py` that resets the bus singleton**

Append at the bottom of `tests/conftest.py`:

```python
@pytest.fixture(autouse=False)
def reset_progress_bus():
    """Reset server.progress._BUS so each test gets a fresh bus."""
    import server.progress as p
    p._BUS = None
    try:
        yield
    finally:
        p._BUS = None
```

- [ ] **Step 2: Write failing tests in `tests/test_progress.py`**

```python
import asyncio

import pytest

from server.progress import ProgressEvent, get_bus


pytestmark = pytest.mark.asyncio


async def test_subscribe_receives_published_events(reset_progress_bus):
    bus = get_bus()
    async with bus.subscribe() as q:
        await bus.publish(ProgressEvent(type="tick", elapsed_s=0.1, payload={"foo": 1}))
        evt = await asyncio.wait_for(q.get(), 0.5)
    assert evt.type == "tick"
    assert evt.payload == {"foo": 1}


async def test_two_subscribers_both_receive_events(reset_progress_bus):
    bus = get_bus()
    async with bus.subscribe() as q1, bus.subscribe() as q2:
        await bus.publish(ProgressEvent(type="tick", elapsed_s=0.0))
        a = await asyncio.wait_for(q1.get(), 0.5)
        b = await asyncio.wait_for(q2.get(), 0.5)
    assert a.type == "tick"
    assert b.type == "tick"


async def test_session_emits_start_and_done(reset_progress_bus):
    bus = get_bus()
    received: list[ProgressEvent] = []

    async def collect():
        async with bus.subscribe() as q:
            while True:
                received.append(await q.get())
                if received[-1].type == "done":
                    return

    consumer = asyncio.create_task(collect())
    await asyncio.sleep(0)  # let subscriber register

    async with bus.session("single", total_turns=1) as sess:
        sess.set_seed(42)

    await asyncio.wait_for(consumer, 1.0)
    types = [e.type for e in received]
    assert types[0] == "start"
    assert types[-1] == "done"
    done_payload = received[-1].payload
    assert done_payload["seed_used"] == 42


async def test_session_emits_error_on_exception_and_reraises(reset_progress_bus):
    bus = get_bus()
    received: list[ProgressEvent] = []

    async def collect():
        async with bus.subscribe() as q:
            while True:
                received.append(await q.get())
                if received[-1].type in ("done", "error"):
                    return

    consumer = asyncio.create_task(collect())
    await asyncio.sleep(0)

    with pytest.raises(RuntimeError):
        async with bus.session("single", total_turns=1):
            raise RuntimeError("boom")

    await asyncio.wait_for(consumer, 1.0)
    types = [e.type for e in received]
    assert "error" in types
    assert any(e.payload.get("message") == "boom" for e in received)


async def test_turn_complete_event_carries_turn_payload(reset_progress_bus):
    bus = get_bus()
    received: list[ProgressEvent] = []

    async def collect():
        async with bus.subscribe() as q:
            while True:
                received.append(await q.get())
                if received[-1].type == "done":
                    return

    consumer = asyncio.create_task(collect())
    await asyncio.sleep(0)

    async with bus.session("dialog", total_turns=3) as sess:
        await sess.turn_complete(1)
        await sess.turn_complete(2)
        await sess.turn_complete(3)

    await asyncio.wait_for(consumer, 1.0)
    turn_events = [e for e in received if e.type == "turn_complete"]
    assert [e.payload["turn"] for e in turn_events] == [1, 2, 3]
    assert all(e.payload["total_turns"] == 3 for e in turn_events)


async def test_late_subscriber_gets_snapshot(reset_progress_bus):
    bus = get_bus()
    received: list[ProgressEvent] = []

    async def collect():
        async with bus.subscribe() as q:
            received.append(await asyncio.wait_for(q.get(), 1.0))

    async with bus.session("dialog", total_turns=4) as sess:
        await sess.turn_complete(2)
        # join AFTER the session started
        consumer = asyncio.create_task(collect())
        await asyncio.wait_for(consumer, 1.0)

    assert received[0].type == "tick"
    assert received[0].payload["kind"] == "dialog"
    assert received[0].payload["turn"] == 2
    assert received[0].payload["total_turns"] == 4
```

- [ ] **Step 3: Run them — expect `ModuleNotFoundError`**

```bash
.venv/bin/pytest tests/test_progress.py -v
```

Expected: ImportError because `server.progress` doesn't exist.

- [ ] **Step 4: Implement `server/progress.py`**

Create `server/progress.py`:

```python
"""Progress event bus for in-flight generations.

Endpoints (`/api/generate`, `/api/generate/dialog`) wrap their work in
`bus.session(...)` which emits `start` and `done`/`error` events plus a
0.5s `tick` heartbeat. Dialog mode also emits `turn_complete` between
adapter calls. Subscribers receive events via `subscribe()` (used by
the SSE endpoint).
"""
from __future__ import annotations

import asyncio
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import AsyncIterator, Literal


EventType = Literal["start", "tick", "turn_complete", "done", "error"]


@dataclass
class ProgressEvent:
    type: EventType
    elapsed_s: float
    payload: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {"type": self.type, "elapsed_s": round(self.elapsed_s, 2), **self.payload}


class ProgressBus:
    def __init__(self) -> None:
        self._subscribers: list[asyncio.Queue[ProgressEvent]] = []
        self._lock = asyncio.Lock()
        self._current_session: "_Session | None" = None

    async def publish(self, event: ProgressEvent) -> None:
        async with self._lock:
            subs = list(self._subscribers)
        for q in subs:
            await q.put(event)

    @asynccontextmanager
    async def subscribe(self) -> AsyncIterator[asyncio.Queue[ProgressEvent]]:
        q: asyncio.Queue[ProgressEvent] = asyncio.Queue()
        async with self._lock:
            self._subscribers.append(q)
            if self._current_session is not None:
                snapshot = self._current_session.snapshot_event()
                if snapshot is not None:
                    await q.put(snapshot)
        try:
            yield q
        finally:
            async with self._lock:
                if q in self._subscribers:
                    self._subscribers.remove(q)

    @asynccontextmanager
    async def session(
        self, kind: Literal["single", "dialog"], total_turns: int = 1,
    ) -> AsyncIterator["_Session"]:
        session = _Session(bus=self, kind=kind, total_turns=total_turns)
        async with self._lock:
            self._current_session = session
        await self.publish(
            ProgressEvent(
                type="start",
                elapsed_s=0.0,
                payload={"kind": kind, "total_turns": total_turns, "turn": 0},
            ),
        )
        ticker = asyncio.create_task(session._tick_loop())
        try:
            yield session
            await self.publish(
                ProgressEvent(
                    type="done",
                    elapsed_s=session.elapsed(),
                    payload={
                        "kind": kind,
                        "seed_used": session.seed_used,
                        "turn": session.turn,
                        "total_turns": total_turns,
                    },
                ),
            )
        except Exception as exc:
            await self.publish(
                ProgressEvent(
                    type="error",
                    elapsed_s=session.elapsed(),
                    payload={"message": str(exc)},
                ),
            )
            raise
        finally:
            ticker.cancel()
            try:
                await ticker
            except asyncio.CancelledError:
                pass
            async with self._lock:
                if self._current_session is session:
                    self._current_session = None


@dataclass
class _Session:
    bus: ProgressBus
    kind: Literal["single", "dialog"]
    total_turns: int
    started_at: float = field(default_factory=time.monotonic)
    turn: int = 0
    seed_used: int | None = None

    def elapsed(self) -> float:
        return time.monotonic() - self.started_at

    def set_seed(self, seed: int) -> None:
        self.seed_used = seed

    async def turn_complete(self, turn_index: int) -> None:
        self.turn = turn_index
        await self.bus.publish(
            ProgressEvent(
                type="turn_complete",
                elapsed_s=self.elapsed(),
                payload={
                    "turn": turn_index,
                    "total_turns": self.total_turns,
                    "kind": self.kind,
                },
            ),
        )

    async def _tick_loop(self) -> None:
        try:
            while True:
                await asyncio.sleep(0.5)
                await self.bus.publish(
                    ProgressEvent(
                        type="tick",
                        elapsed_s=self.elapsed(),
                        payload={
                            "kind": self.kind,
                            "turn": self.turn,
                            "total_turns": self.total_turns,
                        },
                    ),
                )
        except asyncio.CancelledError:
            pass

    def snapshot_event(self) -> ProgressEvent | None:
        return ProgressEvent(
            type="tick",
            elapsed_s=self.elapsed(),
            payload={
                "kind": self.kind,
                "turn": self.turn,
                "total_turns": self.total_turns,
            },
        )


_BUS: ProgressBus | None = None


def get_bus() -> ProgressBus:
    global _BUS
    if _BUS is None:
        _BUS = ProgressBus()
    return _BUS
```

- [ ] **Step 5: Run the suite — expect 6 passed**

```bash
.venv/bin/pytest tests/test_progress.py -v
```

Expected: 6 passed.

- [ ] **Step 6: Run the full backend suite to make sure nothing else regressed**

```bash
.venv/bin/pytest -q
```

Expected: all green (the previous total + 6).

- [ ] **Step 7: Commit**

```bash
git add server/progress.py tests/test_progress.py tests/conftest.py
git commit -m "feat(progress): ProgressBus with sessions, ticks, and turn-complete events"
```

---

## Task 2: `/api/progress` SSE endpoint + wrap `/api/generate`

**Files:**
- Modify: `server/main.py`
- Test: `tests/test_main_progress_sse.py`
- Modify: `tests/test_main_generate.py` (the existing `seed_used` flow should now route through the session — no test change needed if behavior is preserved, but add an assertion that the bus emits done)

- [ ] **Step 1: Write `tests/test_main_progress_sse.py`**

```python
import asyncio
import json

import httpx
import pytest

from server.main import build_app


pytestmark = pytest.mark.asyncio


async def _drain_until_done(stream):
    """Consume SSE lines until a 'done' event arrives. Returns parsed events list."""
    events = []
    async for line in stream.aiter_lines():
        if not line.startswith("data:"):
            continue
        evt = json.loads(line[len("data:") :].strip())
        events.append(evt)
        if evt["type"] in ("done", "error"):
            return events
    return events


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
        async with c.stream("GET", "/api/progress") as stream:
            # Kick off a generate from a separate task
            asyncio.create_task(
                c.post(
                    "/api/generate",
                    data={"text": "hi", "model_id": "fake", "params": "{}"},
                ),
            )
            events = await asyncio.wait_for(_drain_until_done(stream), 3.0)

    types = [e["type"] for e in events]
    assert types[0] == "start"
    assert types[0]["kind" if isinstance(types[0], dict) else "type"] in ("start", "single") or events[0]["payload" if "payload" in events[0] else "kind"] in ("single", None)
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
        # Subscribe; then submit a 404 — bus should stay quiet.
        async with c.stream("GET", "/api/progress") as stream:
            await c.post(
                "/api/generate",
                data={"text": "x", "model_id": "nope", "params": "{}"},
            )
            with pytest.raises(asyncio.TimeoutError):
                await asyncio.wait_for(_drain_until_done(stream), 0.6)
```

> Note: the over-defensive `types[0]` line above intentionally accommodates either `event["type"]` or future flat shapes. Keep the simple form `types[0] == "start"`. Replace that line in the actual test file with the cleaner form below before running:

Replace lines 35-36 above with:

```python
    assert types[0] == "start"
```

- [ ] **Step 2: Modify `server/main.py` — add `/api/progress` endpoint and wrap `/api/generate`**

In `server/main.py`, add the import line near the top:

```python
from server.progress import get_bus
```

Inside `build_app()`, after the existing `/api/models/active/events` endpoint, add the SSE endpoint:

```python
    @app.get("/api/progress")
    async def progress_events():
        bus = get_bus()

        async def gen():
            async with bus.subscribe() as q:
                while True:
                    evt = await q.get()
                    yield {"data": json.dumps(evt.to_dict())}

        return EventSourceResponse(gen())
```

Then refactor the body of `@app.post("/api/generate")` to wrap in a session. Replace the `gen_fn = decorate(adapter.generate)` block through `return Response(...)` with:

```python
        gen_fn = decorate(adapter.generate)
        bus = get_bus()
        try:
            async with bus.session("single", total_turns=1) as sess:
                wav_bytes, _sr, seed_used = gen_fn(
                    text, ref_path, language, json.loads(params or "{}")
                )
                sess.set_seed(seed_used)
        except Exception as exc:
            return JSONResponse(
                status_code=500,
                content={"error": {"code": "generation_failed", "message": str(exc)}},
            )
        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={
                "X-Seed-Used": str(seed_used),
                "Access-Control-Expose-Headers": "X-Seed-Used",
            },
        )
```

- [ ] **Step 3: Run the new SSE tests**

```bash
.venv/bin/pytest tests/test_main_progress_sse.py -v
```

Expected: 2 passed.

- [ ] **Step 4: Run the full backend suite**

```bash
.venv/bin/pytest -q
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add server/main.py tests/test_main_progress_sse.py
git commit -m "feat(progress): /api/progress SSE endpoint; wrap /api/generate in session"
```

---

## Task 3: Wrap `/api/generate/dialog` + plumb session into `generate_dialog`

**Sequencing:** Run after the param-expansion plan's Task 12 has merged (`server/dialog.py` and `/api/generate/dialog` exist).

**Files:**
- Modify: `server/dialog.py` — extend `generate_dialog` with optional `session` param
- Modify: `server/main.py` — wrap `/api/generate/dialog` in `bus.session("dialog", total_turns=N)`, pass session into `generate_dialog`
- Modify: `tests/test_main_progress_sse.py` — add a dialog-mode test
- Modify: `tests/test_dialog_endpoint.py` — verify existing tests still pass with session=None default

- [ ] **Step 1: Extend `generate_dialog` signature in `server/dialog.py`**

In `server/dialog.py`, change the signature of `generate_dialog`. The current signature ends with `silence_ms: int = SILENCE_GAP_MS` — add a `session` parameter after it:

```python
async def generate_dialog(
    *,
    registry: Registry,
    engine_id: str,
    text: str,
    language: Optional[str],
    params: dict,
    speaker_clips: dict[str, bytes],
    silence_ms: int = SILENCE_GAP_MS,
    session: "object | None" = None,   # _Session from server.progress, or None
) -> tuple[bytes, int, int]:
```

Inside the function, after the loop computes one turn's `wav_bytes` and appends to `chunks`, emit a `turn_complete` event when a session is provided. Replace the existing `for turn in turns:` block (the inner loop) with:

```python
    for i, turn in enumerate(turns):
        apply_seed(seed_used)
        wav_bytes, sr, _ = adapter.generate(
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
```

(Note: `i + 1` so turn numbers are 1-indexed, matching the spec's `turn 1 of N`.)

- [ ] **Step 2: Wrap `/api/generate/dialog` in `server/main.py`**

Find the `generate_dialog_route` body (added by the param-expansion plan's Task 12). Replace the `try / except / return Response` block at the end of the route — the part that calls `generate_dialog(...)` — with a session-wrapped version:

```python
        bus = get_bus()
        try:
            from server.dialog import parse_dialog
            turns_preview = parse_dialog(text)
            total_turns = len(turns_preview)
        except DialogParseError as exc:
            return JSONResponse(
                status_code=400,
                content={"error": {"code": "dialog_format_invalid", "message": str(exc)}},
            )

        try:
            async with bus.session("dialog", total_turns=total_turns) as sess:
                wav_bytes, _sr, seed_used = await generate_dialog(
                    registry=app.state.registry,
                    engine_id=engine_id,
                    text=text,
                    language=language,
                    params=json.loads(params or "{}"),
                    speaker_clips=speaker_clips,
                    session=sess,
                )
                sess.set_seed(seed_used)
        except KeyError:
            raise HTTPException(
                status_code=404,
                detail={"error": {"code": "model_not_found", "message": engine_id}},
            )
        except DialogReferenceError as exc:
            return JSONResponse(
                status_code=400,
                content={"error": {"code": "dialog_missing_reference", "message": str(exc)}},
            )
        except Exception as exc:
            return JSONResponse(
                status_code=500,
                content={"error": {"code": "generation_failed", "message": str(exc)}},
            )
        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={
                "X-Seed-Used": str(seed_used),
                "Access-Control-Expose-Headers": "X-Seed-Used",
            },
        )
```

We pre-parse the dialog so we know `total_turns` *before* opening the session — that way `start` carries the right `total_turns`.

- [ ] **Step 3: Add a dialog-mode SSE test**

Append to `tests/test_main_progress_sse.py`:

```python
async def test_dialog_emits_per_turn_events(
    monkeypatch, fake_classes, reset_progress_bus,
):
    import io
    import numpy as np
    import soundfile as sf

    def _silent_wav(seconds: float = 0.2, sr: int = 24000) -> bytes:
        samples = np.zeros(int(seconds * sr), dtype=np.float32)
        buf = io.BytesIO()
        sf.write(buf, samples, sr, format="WAV", subtype="PCM_16")
        return buf.getvalue()

    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    fake_classes["fake"].generate = lambda self, text, ref, lang, p: (
        _silent_wav(0.1), 24000, 0,
    )
    app = build_app()
    from tests.conftest import lifespan_ctx
    transport = httpx.ASGITransport(app=app)
    async with lifespan_ctx(app), httpx.AsyncClient(
        transport=transport, base_url="http://t",
    ) as c:
        async with c.stream("GET", "/api/progress") as stream:
            asyncio.create_task(
                c.post(
                    "/api/generate/dialog",
                    data={
                        "text": "SPEAKER A: hi\nSPEAKER B: hello",
                        "engine_id": "fake",
                        "params": "{}",
                    },
                    files={
                        "reference_wav_a": ("a.wav", _silent_wav(1.0), "audio/wav"),
                        "reference_wav_b": ("b.wav", _silent_wav(1.0), "audio/wav"),
                    },
                ),
            )
            events = await asyncio.wait_for(_drain_until_done(stream), 5.0)

    types = [e["type"] for e in events]
    assert types[0] == "start"
    start = events[0]
    assert start["kind"] == "dialog"
    assert start["total_turns"] == 2
    turn_events = [e for e in events if e["type"] == "turn_complete"]
    turn_indices = [e["turn"] for e in turn_events]
    assert turn_indices == [1, 2]
    assert events[-1]["type"] == "done"
```

- [ ] **Step 4: Run dialog endpoint + progress tests**

```bash
.venv/bin/pytest tests/test_dialog_endpoint.py tests/test_main_progress_sse.py -v
```

Expected: all green.

- [ ] **Step 5: Run the full backend suite**

```bash
.venv/bin/pytest -q
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add server/dialog.py server/main.py tests/test_main_progress_sse.py
git commit -m "feat(progress): wrap /api/generate/dialog in session; emit per-turn events"
```

---

## Task 4: Tailwind keyframe for progress stripe

**Files:**
- Modify: `web/tailwind.config.ts`

- [ ] **Step 1: Add the `progress-stripe` keyframe and animation**

In `web/tailwind.config.ts`, find the `keyframes:` block and add a new entry; also add the corresponding `animation:` entry. The full theme block should look like:

```ts
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulse_dot: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        "progress-stripe": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(300%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.2, 0.7, 0.2, 1) both",
        "pulse-dot": "pulse_dot 1.6s ease-in-out infinite",
        "progress-stripe": "progress-stripe 1.2s linear infinite",
      },
```

- [ ] **Step 2: Build to confirm**

```bash
cd web && npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd ..
git add web/tailwind.config.ts
git commit -m "chore(web): tailwind keyframe + animation for progress stripe"
```

---

## Task 5: Frontend — `lib/progress.ts` + tests

**Files:**
- Create: `web/src/lib/progress.ts`
- Test: `web/src/test/progress.test.ts`

- [ ] **Step 1: Write the failing tests in `web/src/test/progress.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeProgress, type ProgressState } from "@/lib/progress";

class MockEventSource {
  url: string;
  onmessage: ((m: { data: string }) => void) | null = null;
  closed = false;
  static last: MockEventSource;
  constructor(url: string) {
    this.url = url;
    MockEventSource.last = this;
  }
  emit(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  vi.stubGlobal("EventSource", MockEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("subscribeProgress", () => {
  it("emits running on start", () => {
    const states: ProgressState[] = [];
    subscribeProgress((s) => states.push(s));
    MockEventSource.last.emit({
      type: "start", elapsed_s: 0, kind: "dialog", total_turns: 3, turn: 0,
    });
    expect(states[0]).toMatchObject({ phase: "running", kind: "dialog", total: 3 });
  });

  it("updates turn on turn_complete", () => {
    const states: ProgressState[] = [];
    subscribeProgress((s) => states.push(s));
    MockEventSource.last.emit({
      type: "start", elapsed_s: 0, kind: "dialog", total_turns: 3, turn: 0,
    });
    MockEventSource.last.emit({
      type: "turn_complete", elapsed_s: 1.2, kind: "dialog", total_turns: 3, turn: 2,
    });
    const last = states[states.length - 1];
    expect(last).toMatchObject({ phase: "running", turn: 2, total: 3 });
  });

  it("transitions to done then idle", async () => {
    vi.useFakeTimers();
    const states: ProgressState[] = [];
    subscribeProgress((s) => states.push(s));
    MockEventSource.last.emit({ type: "done", elapsed_s: 4.5 });
    expect(states[states.length - 1]).toMatchObject({ phase: "done", elapsedS: 4.5 });
    vi.advanceTimersByTime(1100);
    expect(states[states.length - 1]).toMatchObject({ phase: "idle" });
    vi.useRealTimers();
  });

  it("emits error", () => {
    const states: ProgressState[] = [];
    subscribeProgress((s) => states.push(s));
    MockEventSource.last.emit({
      type: "error", elapsed_s: 2, message: "boom",
    });
    expect(states[states.length - 1]).toMatchObject({ phase: "error", message: "boom" });
  });

  it("close() shuts down EventSource", () => {
    const close = subscribeProgress(() => {});
    close();
    expect(MockEventSource.last.closed).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd web && npm run test -- progress
```

Expected: failure — module missing.

- [ ] **Step 3: Implement `web/src/lib/progress.ts`**

```ts
export type ProgressState =
  | { phase: "idle" }
  | {
      phase: "running";
      kind: "single" | "dialog";
      turn: number;
      total: number;
      elapsedS: number;
    }
  | { phase: "done"; elapsedS: number }
  | { phase: "error"; message: string };

type ProgressEvent = {
  type: "start" | "tick" | "turn_complete" | "done" | "error";
  elapsed_s: number;
  kind?: "single" | "dialog";
  turn?: number;
  total_turns?: number;
  message?: string;
  seed_used?: number | null;
};

export function subscribeProgress(
  onState: (s: ProgressState) => void,
): () => void {
  const es = new EventSource("/api/progress");
  let doneTimer: number | null = null;

  es.onmessage = (m: MessageEvent) => {
    if (doneTimer !== null) {
      window.clearTimeout(doneTimer);
      doneTimer = null;
    }
    let evt: ProgressEvent;
    try {
      evt = JSON.parse(m.data) as ProgressEvent;
    } catch {
      return;
    }
    if (evt.type === "start" || evt.type === "tick" || evt.type === "turn_complete") {
      onState({
        phase: "running",
        kind: (evt.kind ?? "single"),
        turn: evt.turn ?? 0,
        total: evt.total_turns ?? 1,
        elapsedS: evt.elapsed_s ?? 0,
      });
      return;
    }
    if (evt.type === "done") {
      onState({ phase: "done", elapsedS: evt.elapsed_s });
      doneTimer = window.setTimeout(() => onState({ phase: "idle" }), 1000);
      return;
    }
    if (evt.type === "error") {
      onState({ phase: "error", message: evt.message ?? "Generation failed" });
    }
  };

  return () => {
    if (doneTimer !== null) window.clearTimeout(doneTimer);
    es.close();
  };
}

import { useEffect, useState } from "react";

export function useProgress(): ProgressState {
  const [state, setState] = useState<ProgressState>({ phase: "idle" });
  useEffect(() => {
    const close = subscribeProgress(setState);
    return close;
  }, []);
  return state;
}
```

- [ ] **Step 4: Run tests — expect 5 passed**

```bash
cd web && npm run test -- progress
```

Expected: 5 passed.

- [ ] **Step 5: Build**

```bash
cd web && npm run build
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
cd ..
git add web/src/lib/progress.ts web/src/test/progress.test.ts
git commit -m "feat(web): progress subscriber + useProgress hook"
```

---

## Task 6: Frontend — `ProgressBar` component + Studio integration

**Files:**
- Create: `web/src/components/ProgressBar.tsx`
- Modify: `web/src/pages/Studio.tsx`

- [ ] **Step 1: Implement `ProgressBar.tsx`**

```tsx
import { useProgress } from "@/lib/progress";

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function ProgressBar() {
  const state = useProgress();
  if (state.phase === "idle") return null;

  if (state.phase === "error") {
    return (
      <div className="border-b border-red-900/40 bg-red-950/30 px-8 py-2.5">
        <span className="label-mono text-red-400">progress error</span>
        <span className="ml-3 text-sm text-red-300/90">{state.message}</span>
      </div>
    );
  }

  const isRunning = state.phase === "running";
  const isDialog = isRunning && state.kind === "dialog";
  const fill =
    state.phase === "done"
      ? 1
      : isDialog && state.total > 0
      ? state.turn / state.total
      : null;

  const elapsedS = state.phase === "running" ? state.elapsedS : state.phase === "done" ? state.elapsedS : 0;
  const label =
    state.phase === "done"
      ? `done · ${fmt(elapsedS)}`
      : isDialog
      ? `Turn ${state.turn} of ${state.total} · ${fmt(elapsedS)}`
      : `Generating · ${fmt(elapsedS)}`;

  return (
    <div className="border-b border-[hsl(var(--ember))]/30 bg-[hsl(var(--ember))]/10 px-8 py-2">
      <div className="flex items-center gap-4">
        <span className="label-mono text-[hsl(var(--ember))] whitespace-nowrap">
          {label}
        </span>
        <div className="flex-1 h-1 bg-[hsl(var(--ember))]/20 rounded-sm overflow-hidden">
          {fill === null ? (
            <div className="h-full w-1/3 bg-[hsl(var(--ember))] animate-progress-stripe" />
          ) : (
            <div
              className="h-full bg-[hsl(var(--ember))] transition-[width] duration-200 ease-linear"
              style={{ width: `${fill * 100}%` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `Studio.tsx`**

In `web/src/pages/Studio.tsx`, add the import:

```tsx
import ProgressBar from "@/components/ProgressBar";
```

Find the `<LoadingBanner ... />` element and insert `<ProgressBar />` immediately after it (and before the `{err && ...}` error banner). The block becomes:

```tsx
      <LoadingBanner
        visible={loadingModel}
        message="Loading model — first activation can take 30–60s"
      />
      <ProgressBar />
      {err && (
        <div className="border-b border-red-900/40 bg-red-950/30 px-8 py-2.5">
          <span className="label-mono text-red-400">error</span>
          <span className="ml-3 text-sm text-red-300/90">{err}</span>
        </div>
      )}
```

- [ ] **Step 3: Build**

```bash
cd web && npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd ..
git add web/src/components/ProgressBar.tsx web/src/pages/Studio.tsx
git commit -m "feat(web): ProgressBar — determinate (Dialog) and indeterminate (Single)"
```

---

## Task 7: Frontend — `MadeBy` component + footer integration + test

**Files:**
- Create: `web/src/components/MadeBy.tsx`
- Test: `web/src/test/MadeBy.test.tsx`
- Modify: `web/src/pages/Studio.tsx` (footer)

- [ ] **Step 1: Write the failing test**

`web/src/test/MadeBy.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MadeBy from "@/components/MadeBy";

describe("MadeBy", () => {
  it("renders an anchor to mayankgupta.in opening in a new tab", () => {
    render(<MadeBy />);
    const link = screen.getByRole("link", { name: /made by/i });
    expect(link).toHaveAttribute("href", "https://mayankgupta.in");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.textContent).toMatch(/techfreakworm/);
  });

  it("includes the heart and the year", () => {
    render(<MadeBy />);
    const link = screen.getByRole("link", { name: /made by/i });
    expect(link.textContent).toMatch(/♥/);
    expect(link.textContent).toMatch(/2026/);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd web && npm run test -- MadeBy
```

Expected: failure — component missing.

- [ ] **Step 3: Implement `MadeBy.tsx`**

```tsx
const URL = "https://mayankgupta.in";

export default function MadeBy() {
  return (
    <a
      href={URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Made by Mayank Gupta — opens mayankgupta.in in a new tab"
      className="group block text-center py-6 select-none"
    >
      <div className="label-mono inline-flex items-center gap-1.5 text-muted-foreground">
        <span>Made with</span>
        <span
          aria-hidden
          className="text-[hsl(var(--ember))] group-hover:animate-pulse-dot"
        >
          ♥
        </span>
        <span>by</span>
      </div>
      <div className="display-serif text-[24px] mt-1 transition-colors duration-200 group-hover:text-[hsl(var(--ember))]">
        techfreakworm
      </div>
      <div className="label-mono mt-1 text-muted-foreground/70">2026</div>
    </a>
  );
}
```

- [ ] **Step 4: Run tests — expect 2 passed**

```bash
cd web && npm run test -- MadeBy
```

Expected: 2 passed.

- [ ] **Step 5: Replace the footer in `Studio.tsx`**

In `web/src/pages/Studio.tsx`, add the import:

```tsx
import MadeBy from "@/components/MadeBy";
```

Find the existing `<footer className="border-t border-border mt-16">...</footer>` block and replace its contents:

```tsx
      <footer className="border-t border-border mt-16">
        <MadeBy />
        <div className="rule-dotted mx-8" />
        <div className="mx-auto max-w-[1280px] px-8 py-6 flex items-center justify-between">
          <span className="label-mono">chatterbox · resemble ai</span>
          <span className="label-mono">stateless · browser-persisted</span>
        </div>
      </footer>
```

- [ ] **Step 6: Build**

```bash
cd web && npm run build
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
cd ..
git add web/src/components/MadeBy.tsx web/src/test/MadeBy.test.tsx web/src/pages/Studio.tsx
git commit -m "feat(web): footer credit — Made with ♥ by techfreakworm"
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Implementing task |
|---|---|
| §4.1 `ProgressBus` and `_Session` | Task 1 |
| §4.2 `/api/progress` SSE endpoint | Task 2 |
| §4.3 wrap `/api/generate` in session | Task 2 |
| §4.3 wrap `/api/generate/dialog`; extend `generate_dialog` with `session` param | Task 3 |
| §4.4 backend tests | Tasks 1, 2, 3 |
| §5.1 `lib/progress.ts` + state types | Task 5 |
| §5.2 `useProgress` hook | Task 5 |
| §5.3 `ProgressBar` component | Task 6 |
| §5.3 `progress-stripe` keyframe | Task 4 |
| §5.4 Studio integration of `<ProgressBar />` | Task 6 |
| §6.1 `MadeBy` component | Task 7 |
| §6.2 footer block update | Task 7 |
| §6.3 frontend test | Task 7 |
| §7 edge cases (dropped connection, two tabs, error, multiple sessions impossible, no JS, late tick race, heart fallback) | Covered by behavior of bus snapshot replay (Task 1), session error event (Task 1), single registry lock (existing), no-JS = idle (no bar rendered) (Task 6), tick cancellation in `finally` (Task 1) |

No gaps.

**2. Placeholder scan:**

- No `TBD`, `TODO`, "fill in", "implement later" tokens in any task body.
- One inline note in Task 2 Step 1 instructed the engineer to replace an over-defensive line with `assert types[0] == "start"` — that *is* the actual final line; both are concrete code. Re-reading, leave the simpler form in the test file.

**3. Type consistency:**

- `ProgressEvent` defined in Task 1 — used in Tasks 1, 2, 3. Same shape (`type`, `elapsed_s`, `payload`).
- `_Session` defined in Task 1 — referenced in Task 3 as the type for the new `session` parameter on `generate_dialog`.
- `ProgressState` defined in Task 5 — used in Tasks 5, 6.
- `subscribeProgress` returns `() => void` (close handle) — Task 5 tests call it that way.
- `useProgress()` returns `ProgressState` — Task 6 destructures `state.phase`, `state.kind`, etc.
- `bus.session(kind, total_turns)` shape consistent across Tasks 1, 2, 3. `kind` is `"single" | "dialog"` everywhere.
- `turn_index` / `turn` field naming: Task 1 passes `payload["turn"]`; frontend Task 5 reads `evt.turn`. Same key.
- `total_turns` payload key consistent across server (Task 1, payload), test (Task 1, 3), frontend (Task 5).

No inconsistencies.

---

*End of plan.*
