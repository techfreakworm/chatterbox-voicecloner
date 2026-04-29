"""Shared test fixtures."""
from __future__ import annotations

from contextlib import asynccontextmanager

import pytest

from server.schemas import Lang, ParamSpec


class FakeAdapter:
    """Minimal in-memory adapter for unit tests."""
    id = "fake"
    label = "Fake"
    description = "Test fake"
    languages = [Lang(code="en", label="English")]
    paralinguistic_tags: list[str] = ["[laugh]"]
    supports_voice_clone = True
    params = [ParamSpec(name="t", label="T", type="float", default=0.5, min=0.0, max=1.0)]

    instances: list["FakeAdapter"] = []

    def __init__(self, device: str):
        self.device = device
        self.loaded = False
        self.unload_called = False
        self.load_should_fail = False
        FakeAdapter.instances.append(self)

    def load(self) -> None:
        if self.load_should_fail:
            raise RuntimeError("simulated load failure")
        self.loaded = True

    def unload(self) -> None:
        self.unload_called = True
        self.loaded = False

    def generate(self, text, reference_wav_path, language, params):
        # FakeAdapter never actually applies a seed; report the input or 0.
        seed_in = params.get("seed", 0) if isinstance(params, dict) else 0
        seed_used = 0 if seed_in is None or seed_in < 0 else int(seed_in)
        return (b"FAKEWAV", 24000, seed_used)


class FakeAdapterB(FakeAdapter):
    id = "fake-b"
    label = "Fake B"


@pytest.fixture
def fake_classes():
    FakeAdapter.instances.clear()
    return {FakeAdapter.id: FakeAdapter, FakeAdapterB.id: FakeAdapterB}


@asynccontextmanager
async def lifespan_ctx(app):
    """Run an ASGI app's lifespan startup/shutdown around an `httpx.AsyncClient`."""
    async with app.router.lifespan_context(app):
        yield


@pytest.fixture(autouse=False)
def reset_progress_bus():
    """Reset server.progress._BUS so each test gets a fresh bus."""
    import server.progress as p
    p._BUS = None
    try:
        yield
    finally:
        p._BUS = None
