"""Active-model registry with async swap lock and SSE event bus."""
from __future__ import annotations

import asyncio
import gc
from typing import AsyncIterator

import torch

from server.models.base import ModelAdapter


class Registry:
    def __init__(self, adapter_classes: dict[str, type], device: str):
        self._classes = adapter_classes
        self._device = device
        self._active: ModelAdapter | None = None
        self._active_id: str | None = None
        self._status: str = "idle"
        self._last_error: str | None = None
        self._lock = asyncio.Lock()
        self._subscribers: list[asyncio.Queue[dict]] = []

    @property
    def device(self) -> str:
        return self._device

    def status(self) -> dict:
        return {"id": self._active_id, "status": self._status, "last_error": self._last_error}

    def list_models(self) -> list[dict]:
        return [
            {
                "id": cls.id,
                "label": cls.label,
                "description": cls.description,
                "languages": [l.model_dump() for l in cls.languages],
                "paralinguistic_tags": cls.paralinguistic_tags,
                "supports_voice_clone": cls.supports_voice_clone,
                "params": [p.model_dump() for p in cls.params],
            }
            for cls in self._classes.values()
        ]

    async def get_or_load(self, model_id: str) -> ModelAdapter:
        if model_id not in self._classes:
            raise KeyError(model_id)
        async with self._lock:
            if self._active_id == model_id and self._active is not None:
                return self._active
            await self._publish({"id": model_id, "status": "loading"})
            self._status = "loading"
            self._last_error = None
            if self._active is not None:
                try:
                    self._active.unload()
                finally:
                    self._active = None
                    self._free_caches()
            try:
                instance = self._classes[model_id](self._device)
                instance.load()
            except Exception as exc:
                self._status = "error"
                self._last_error = str(exc)
                self._active_id = None
                await self._publish({"id": model_id, "status": "error", "error": str(exc)})
                raise
            self._active = instance
            self._active_id = model_id
            self._status = "loaded"
            await self._publish({"id": model_id, "status": "loaded"})
            return instance

    async def stream_events(self) -> AsyncIterator[dict]:
        q: asyncio.Queue[dict] = asyncio.Queue()
        self._subscribers.append(q)
        try:
            await q.put({"id": self._active_id, "status": self._status})
            while True:
                yield await q.get()
        finally:
            self._subscribers.remove(q)

    async def _publish(self, event: dict) -> None:
        for q in list(self._subscribers):
            await q.put(event)

    def _free_caches(self) -> None:
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        mps = getattr(torch.backends, "mps", None)
        if mps and mps.is_available():
            try:
                torch.mps.empty_cache()  # type: ignore[attr-defined]
            except Exception:
                pass
