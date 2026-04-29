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
