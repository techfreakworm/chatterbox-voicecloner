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
