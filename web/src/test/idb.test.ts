import { beforeEach, describe, expect, it } from "vitest";
import {
  addHistory,
  addVoice,
  db,
  deleteVoice,
  listHistory,
  listVoices,
  setFavorite,
  HISTORY_CAP,
} from "@/lib/idb";

beforeEach(async () => {
  await db.voices.clear();
  await db.history.clear();
});

describe("voices", () => {
  it("adds and lists voices ordered by createdAt desc", async () => {
    await addVoice({ name: "A", blob: new Blob(["a"]), sampleRate: 24000, durationMs: 1000 });
    await new Promise((r) => setTimeout(r, 5));
    await addVoice({ name: "B", blob: new Blob(["b"]), sampleRate: 24000, durationMs: 1500 });
    const out = await listVoices();
    expect(out.map((v) => v.name)).toEqual(["B", "A"]);
  });

  it("setFavorite toggles", async () => {
    const id = await addVoice({ name: "A", blob: new Blob(["a"]), sampleRate: 24000, durationMs: 1000 });
    await setFavorite(id, true);
    const v = (await listVoices()).find((x) => x.id === id)!;
    expect(v.isFavorite).toBe(true);
  });

  it("deleteVoice removes", async () => {
    const id = await addVoice({ name: "A", blob: new Blob(["a"]), sampleRate: 24000, durationMs: 1000 });
    await deleteVoice(id);
    expect(await listVoices()).toEqual([]);
  });
});

describe("history", () => {
  it("caps at HISTORY_CAP entries (oldest evicted)", async () => {
    for (let i = 0; i < HISTORY_CAP + 5; i++) {
      await addHistory({
        text: `t${i}`,
        modelId: "x",
        voiceId: undefined,
        language: undefined,
        params: {},
        audioBlob: new Blob([`${i}`]),
      });
    }
    const items = await listHistory();
    expect(items.length).toBe(HISTORY_CAP);
    expect(items[0].text).toBe(`t${HISTORY_CAP + 4}`);
  });
});

describe("history v2", () => {
  it("stores seedUsed and kind on a row", async () => {
    const id = await addHistory({
      text: "x",
      modelId: "m",
      voiceId: undefined,
      language: undefined,
      params: {},
      audioBlob: new Blob([""]),
      kind: "single",
      seedUsed: 12345,
    });
    const items = await listHistory();
    const item = items.find((h) => h.id === id)!;
    expect(item.seedUsed).toBe(12345);
    expect(item.kind).toBe("single");
  });

  it("stores speakers list on a dialog row", async () => {
    const id = await addHistory({
      text: "SPEAKER A: hi",
      modelId: "m",
      voiceId: undefined,
      language: undefined,
      params: {},
      audioBlob: new Blob([""]),
      kind: "dialog",
      seedUsed: 7,
      speakers: [
        { letter: "A", voiceId: 1 },
        { letter: "B", voiceId: 2 },
      ],
    });
    const items = await listHistory();
    const item = items.find((h) => h.id === id)!;
    expect(item.speakers).toEqual([
      { letter: "A", voiceId: 1 },
      { letter: "B", voiceId: 2 },
    ]);
  });
});
