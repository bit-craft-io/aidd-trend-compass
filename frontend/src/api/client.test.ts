import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./client";

describe("apiRequest", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws a Japanese message when fetch itself fails (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(apiRequest("/trends")).rejects.toThrow("サーバーに接続できませんでした");
  });

  it("returns parsed JSON on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      })
    );

    const result = await apiRequest<{ ok: boolean }>("/trends");

    expect(result).toEqual({ ok: true });
  });

  it("throws the server-provided detail message on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ detail: "見つかりません" }),
      })
    );

    await expect(apiRequest("/trends/9999")).rejects.toThrow("見つかりません");
  });
});
