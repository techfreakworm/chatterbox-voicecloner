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

  it("generate posts multipart and returns response blob", async () => {
    fetchMock.mockResolvedValue(new Response("RIFFFAKE", { status: 200 }));
    const out = await generate({
      modelId: "x",
      text: "hi",
      params: {},
    });
    expect(typeof out.size).toBe("number");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/generate",
      expect.objectContaining({ method: "POST" }),
    );
    const call = fetchMock.mock.calls[0];
    const body = call[1].body as FormData;
    expect(body.get("text")).toBe("hi");
    expect(body.get("model_id")).toBe("x");
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
