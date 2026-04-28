import { describe, expect, it } from "vitest";
import { Recorder } from "@/lib/audio";

describe("Recorder state machine", () => {
  it("starts in idle", () => {
    const r = new Recorder();
    expect(r.state).toBe("idle");
  });

  it("transitions idle -> requesting on start()", () => {
    const r = new Recorder();
    r.requestStart();
    expect(r.state).toBe("requesting");
  });

  it("transitions to error on permission denial", async () => {
    const r = new Recorder({
      getUserMedia: () => Promise.reject(new Error("denied")),
    });
    await r.start().catch(() => {});
    expect(r.state).toBe("error");
    expect(r.lastError?.message).toBe("denied");
  });

  it("ignores stop() in idle", async () => {
    const r = new Recorder();
    const result = await r.stop();
    expect(r.state).toBe("idle");
    expect(result).toBeNull();
  });
});
