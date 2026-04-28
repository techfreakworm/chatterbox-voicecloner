import asyncio

import pytest

from server.registry import Registry


pytestmark = pytest.mark.asyncio


async def test_get_or_load_loads_first_time(fake_classes):
    reg = Registry(adapter_classes=fake_classes, device="cpu")
    a = await reg.get_or_load("fake")
    assert a.loaded is True
    assert reg.status()["status"] == "loaded"
    assert reg.status()["id"] == "fake"


async def test_get_or_load_reuses_active(fake_classes):
    reg = Registry(adapter_classes=fake_classes, device="cpu")
    a1 = await reg.get_or_load("fake")
    a2 = await reg.get_or_load("fake")
    assert a1 is a2


async def test_get_or_load_swaps_to_different(fake_classes):
    reg = Registry(adapter_classes=fake_classes, device="cpu")
    a = await reg.get_or_load("fake")
    b = await reg.get_or_load("fake-b")
    assert b.loaded is True
    assert a.unload_called is True
    assert reg.status()["id"] == "fake-b"


async def test_get_or_load_unknown_id_raises(fake_classes):
    reg = Registry(adapter_classes=fake_classes, device="cpu")
    with pytest.raises(KeyError):
        await reg.get_or_load("nope")


async def test_load_failure_sets_error_status(fake_classes):
    reg = Registry(adapter_classes=fake_classes, device="cpu")
    fake_classes["fake"].instances.clear()
    orig_init = fake_classes["fake"].__init__

    def patched_init(self, device):
        orig_init(self, device)
        self.load_should_fail = True

    fake_classes["fake"].__init__ = patched_init
    try:
        with pytest.raises(RuntimeError):
            await reg.get_or_load("fake")
        s = reg.status()
        assert s["status"] == "error"
        assert "simulated" in s["last_error"]
    finally:
        fake_classes["fake"].__init__ = orig_init


async def test_concurrent_activations_serialize(fake_classes):
    reg = Registry(adapter_classes=fake_classes, device="cpu")
    # All three resolve without error; the final state is the last requested model.
    await asyncio.gather(
        reg.get_or_load("fake"),
        reg.get_or_load("fake-b"),
        reg.get_or_load("fake"),
    )
    s = reg.status()
    assert s["status"] == "loaded"
    assert s["id"] == "fake"


async def test_emits_loading_then_loaded_events(fake_classes):
    reg = Registry(adapter_classes=fake_classes, device="cpu")
    seen: list[dict] = []

    async def collect():
        async for evt in reg.stream_events():
            seen.append(evt)
            if evt["status"] == "loaded":
                return

    consumer = asyncio.create_task(collect())
    await asyncio.sleep(0)
    await reg.get_or_load("fake")
    await asyncio.wait_for(consumer, timeout=2)
    statuses = [e["status"] for e in seen]
    assert "loading" in statuses
    assert "loaded" in statuses
