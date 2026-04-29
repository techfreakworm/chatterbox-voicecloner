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
