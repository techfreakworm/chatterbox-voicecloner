# Progress UI + Footer Branding — Design Spec

**Date:** 2026-04-29
**Status:** Approved (Sections 1–2) — ready for implementation plan
**Repo:** `/Users/techfreakworm/Projects/llm/chatterbox-voicecloner`
**Builds on:**
- `docs/superpowers/specs/2026-04-28-chatterbox-voice-studio-design.md`
- `docs/superpowers/specs/2026-04-29-param-expansion-and-dialog-design.md`

---

## 1. Problem & Goals

Two small polish improvements:

1. **Progress feedback during generation** — today, after clicking Generate the UI just disables the button. On Free CPU HF Spaces a single clip can take 30–90s and Dialog mode runs sequentially per turn — the user has no idea what's happening or how far along it is.
2. **Personal branding in the footer** — a "Made with ♥ by techfreakworm" credit linking to mayankgupta.in, in the same editorial-studio aesthetic as the rest of the UI.

### Non-goals

- Token-level progress hooks into the chatterbox model loop. Fragile across model versions.
- ETA estimation based on text length / device empirics. v1 uses *real* signals only — start, per-turn, done — and elapsed-time ticking.
- Persistent generation history of timing data on the server. Server stays stateless.
- A logo/glyph or animated mark (deferred). Just typography for the credit.

### Success criteria

1. While `/api/generate` or `/api/generate/dialog` is running, a `ProgressBar` is visible in the Studio with:
   - elapsed time counter ticking every 0.5s
   - in Dialog mode, a determinate fill = `current_turn / total_turns` and the label "Turn 2 of 4"
   - in Single mode, an indeterminate animated stripe with label "Generating…"
2. The bar transitions to a 1-second "done" full-bar flash, then fades out to idle.
3. On error, the bar turns red and shows the error message.
4. Multiple browser tabs subscribed to `/api/progress` all see the same events.
5. The footer shows the centered "Made with ♥ by techfreakworm / 2026" block, where "techfreakworm" is a single anchored link to `https://mayankgupta.in` (target=_blank, rel="noopener noreferrer"). Hovering the credit transitions "techfreakworm" to ember and pulses the heart.

---

## 2. Decisions Locked In

| # | Decision | Rationale |
|---|---|---|
| Q1 | **C — Server-side SSE heartbeats; per-turn progress for Dialog** | Real signals from the inference pipeline. No fake progress, no calibration. |
| Q2 | **B-style center-stacked credit, "Made with ♥ by techfreakworm / 2026"** | Open-source convention you asked for, matches editorial typography. |

---

## 3. Architecture Delta

```
chatterbox-voicecloner/
├── server/
│   ├── progress.py                            NEW (Tasks: progress)
│   ├── main.py                                MODIFY (mount /api/progress; wrap generate endpoints)
│   └── dialog.py                              MODIFY (emit turn_complete events)
├── tests/
│   ├── test_progress.py                       NEW
│   └── test_main_progress_sse.py              NEW
├── web/src/
│   ├── components/
│   │   ├── ProgressBar.tsx                    NEW
│   │   └── MadeBy.tsx                         NEW
│   ├── lib/progress.ts                        NEW (subscriber + useProgress hook)
│   ├── pages/Studio.tsx                       MODIFY (render ProgressBar + MadeBy)
│   └── test/
│       ├── progress.test.ts                   NEW (state machine tests)
│       └── MadeBy.test.tsx                    NEW
```

No changes to launchers, Dockerfile, model adapters, registry, or schemas.

---

## 4. Backend — Progress System

### 4.1 `server/progress.py`

Thin in-memory pub/sub built on `asyncio.Queue`.

```python
"""Progress event bus for in-flight generations.

Endpoints (`/api/generate`, `/api/generate/dialog`) wrap their work in
`session(...)` which emits `start` and `done`/`error` events plus a
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
            # Replay current state for late joiners
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
        session = _Session(self, kind=kind, total_turns=total_turns)
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
        # Replay a synthetic tick so a late SSE subscriber knows what's running.
        return ProgressEvent(
            type="tick",
            elapsed_s=self.elapsed(),
            payload={
                "kind": self.kind,
                "turn": self.turn,
                "total_turns": self.total_turns,
            },
        )


# App-level singleton (built once per FastAPI instance via lifespan in main.py).
_BUS: ProgressBus | None = None


def get_bus() -> ProgressBus:
    global _BUS
    if _BUS is None:
        _BUS = ProgressBus()
    return _BUS
```

### 4.2 `/api/progress` SSE endpoint

In `server/main.py`:

```python
from server.progress import get_bus
import json

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

### 4.3 Wrapping generate endpoints

`/api/generate` (single) is wrapped:

```python
async with get_bus().session("single", total_turns=1) as sess:
    # existing generate logic; capture seed_used:
    wav_bytes, _sr, seed_used = gen_fn(text, ref_path, language, parsed_params)
    sess.set_seed(seed_used)
return Response(...)
```

`/api/generate/dialog` is wrapped similarly with `kind="dialog"` and `total_turns=len(turns)`. Inside `server/dialog.py:generate_dialog`, after each turn's adapter call, we call `await session.turn_complete(i + 1)`. Since `generate_dialog` does not currently take a session, the signature is extended:

```python
async def generate_dialog(
    *, registry, engine_id, text, language, params, speaker_clips, silence_ms=250,
    session=None,   # optional ProgressBus session
):
```

When `session is None` (e.g., direct unit tests), turn-complete events are skipped.

### 4.4 Tests

`tests/test_progress.py`:

- `bus.subscribe` registers a queue and `publish` delivers to it.
- Two concurrent subscribers both receive the same events.
- Late subscriber gets a snapshot tick when joining mid-session.
- `session(...)` emits start → done in normal flow.
- `session(...)` emits start → error on exception and re-raises.
- `session.turn_complete(i)` emits a `turn_complete` event with the right turn/total payload.

`tests/test_main_progress_sse.py`:

- Connect to `/api/progress`, dispatch a fake `/api/generate` (using FakeAdapter), assert the SSE stream contains a `start` event and a `done` event with non-zero `elapsed_s`.
- For dialog: dispatch `/api/generate/dialog` with a 2-turn script; assert the stream emits `start (total=2)`, at least one `turn_complete (turn=1)`, `turn_complete (turn=2)`, `done`.

The tests use `httpx.ASGITransport` with the existing `lifespan_ctx` fixture and the existing `FakeAdapter`; the bus singleton is reset between tests with a small fixture that monkeypatches `_BUS = None`.

---

## 5. Frontend — Progress UI

### 5.1 `lib/progress.ts`

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

export function subscribeProgress(
  onState: (s: ProgressState) => void,
): () => void {
  const es = new EventSource("/api/progress");
  let doneTimer: number | null = null;
  es.onmessage = (m) => {
    if (doneTimer) {
      window.clearTimeout(doneTimer);
      doneTimer = null;
    }
    const evt = JSON.parse(m.data) as {
      type: "start" | "tick" | "turn_complete" | "done" | "error";
      elapsed_s: number;
      kind?: "single" | "dialog";
      turn?: number;
      total_turns?: number;
      message?: string;
    };
    if (evt.type === "start" || evt.type === "tick" || evt.type === "turn_complete") {
      onState({
        phase: "running",
        kind: (evt.kind ?? "single") as "single" | "dialog",
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
    if (doneTimer) window.clearTimeout(doneTimer);
    es.close();
  };
}
```

### 5.2 `useProgress` hook

```ts
import { useEffect, useState } from "react";
import { subscribeProgress, type ProgressState } from "./progress";

export function useProgress(): ProgressState {
  const [state, setState] = useState<ProgressState>({ phase: "idle" });
  useEffect(() => {
    const close = subscribeProgress(setState);
    return close;
  }, []);
  return state;
}
```

### 5.3 `ProgressBar.tsx`

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
      : null; // null = indeterminate

  const label =
    state.phase === "done"
      ? `done · ${fmt(state.elapsedS)}`
      : isDialog
      ? `Turn ${state.turn} of ${state.total} · ${fmt(state.elapsedS)}`
      : `Generating · ${fmt(state.elapsedS)}`;

  return (
    <div className="border-b border-[hsl(var(--ember))]/30 bg-[hsl(var(--ember))]/10 px-8 py-2">
      <div className="flex items-center gap-4">
        <span className="label-mono text-[hsl(var(--ember))] whitespace-nowrap">
          {label}
        </span>
        <div className="flex-1 h-1 bg-[hsl(var(--ember))]/20 rounded-sm overflow-hidden">
          {fill === null ? (
            <div className="h-full w-1/3 bg-[hsl(var(--ember))] animate-[progress-stripe_1.2s_linear_infinite]" />
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

The `progress-stripe` keyframe is added to `tailwind.config.ts`:

```ts
keyframes: {
  ...
  "progress-stripe": {
    "0%": { transform: "translateX(-100%)" },
    "100%": { transform: "translateX(300%)" },
  },
},
animation: {
  ...
  "progress-stripe": "progress-stripe 1.2s linear infinite",
},
```

### 5.4 Studio integration

`web/src/pages/Studio.tsx` adds `<ProgressBar />` immediately below `<LoadingBanner />` and above the error banner. The component is self-subscribing — Studio doesn't pass it any props.

---

## 6. Frontend — `MadeBy` component + footer integration

### 6.1 `MadeBy.tsx`

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

### 6.2 Studio footer block

Replace the existing `<footer>` content with:

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

### 6.3 Tests

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
});
```

---

## 7. Edge Cases (frozen)

| Case | Resolution |
|---|---|
| `/api/progress` connection drops mid-generation | EventSource auto-reconnects; on reconnect the bus's snapshot tick brings the new client up to date. |
| User opens two tabs and clicks Generate in one | Both tabs see the same events (single shared bus). The non-generating tab also shows the bar — acceptable: it reflects what the server is doing. |
| Generation fails after start | `error` event fires; bar turns red; auto-reset on the next `start` or after the user clicks Generate again. |
| Multiple sessions in flight | Cannot happen: registry serializes generations behind the active-model lock. |
| User has JS disabled | No bar; existing button-disabled UX is the fallback. |
| Tick fires after session ends (race) | Bus's `_current_session` reset under the lock; an in-flight tick still has a valid `_Session` reference and will publish one more event before the ticker is cancelled — harmless. |
| Heart emoji `♥` not rendering on user's browser | Fallback character from system font; if catastrophic the test wouldn't catch it but it's a single Unicode codepoint widely supported. |

---

## 8. Implementation Order (preview)

1. Backend `progress.py` + tests.
2. Wire `/api/progress` SSE endpoint and refactor `/api/generate` + `/api/generate/dialog` to use `session(...)`. Plumb `seed_used` into the session.
3. Frontend `lib/progress.ts` + `useProgress` + tests.
4. Frontend `ProgressBar.tsx` + Studio integration.
5. `MadeBy.tsx` + footer integration + test.

Each phase ends with green pytest/vitest and a sole-author commit per `CLAUDE.md`.

---

*End of design spec.*
