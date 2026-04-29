import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activateModel, generate, getActiveModel, listModels } from "@/lib/api";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("api", () => {
  it("listModels GETs /api/models", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([{ id: "x" }])));
    const out = await listModels();
    expect(fetchMock).toHaveBeenCalledWith("/api/models");
    expect(out[0].id).toBe("x");
  });

  it("getActiveModel returns status object", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "x", status: "loaded" })),
    );
    const out = await getActiveModel();
    expect(out.status).toBe("loaded");
  });

  it("activateModel posts to /api/models/{id}/activate", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 202 }));
    await activateModel("foo");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/models/foo/activate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("generate posts multipart and returns response blob with seed", async () => {
    fetchMock.mockResolvedValue(
      new Response("RIFFFAKE", {
        status: 200,
        headers: { "X-Seed-Used": "777" },
      }),
    );
    const out = await generate({ modelId: "x", text: "hi", params: {} });
    expect(typeof out.blob.size).toBe("number");
    expect(out.seedUsed).toBe(777);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/generate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("generate surfaces error JSON on 4xx", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: "model_not_found", message: "x" } }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
    );
    await expect(
      generate({ modelId: "x", text: "hi", params: {} }),
    ).rejects.toThrow(/model_not_found/);
  });
});
