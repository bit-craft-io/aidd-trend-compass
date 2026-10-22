import { beforeEach, describe, expect, it, vi } from "vitest";
import { addTrend, deleteTrend, fetchTrendDetail, fetchTrends, refreshTrends, updateName } from "./trends";

describe("trends api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchTrends returns parsed list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 1,
            code: "7203",
            name: "トヨタ自動車",
            opinion: "初回取得、履歴データ無し",
            price_at_fetch: 2900,
            created_at: "2026-09-17T00:00:00Z",
          },
        ],
      })
    );

    const result = await fetchTrends();

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("7203");
  });

  it("addTrend posts code and returns created trend", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: 1,
        code: "7203",
        name: "トヨタ自動車",
        opinion: "初回取得、履歴データ無し",
        price_at_fetch: 2900,
        created_at: "2026-09-17T00:00:00Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await addTrend("7203");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/trends"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: "7203" }),
      })
    );
  });

  it("throws with server detail message when request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ detail: "銘柄コード 0000 のデータを取得できませんでした" }),
      })
    );

    await expect(addTrend("0000")).rejects.toThrow(
      "銘柄コード 0000 のデータを取得できませんでした"
    );
  });

  it("refreshTrends posts codes and interval", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await refreshTrends(["7203"], 5);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/trends/refresh"),
      expect.objectContaining({
        body: JSON.stringify({ codes: ["7203"], interval_minutes: 5 }),
      })
    );
  });

  it("deleteTrend sends DELETE to code endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ deleted: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await deleteTrend("7203");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/trends/7203"),
      expect.objectContaining({ method: "DELETE" })
    );
    expect(result.deleted).toBe(true);
  });

  it("fetchTrendDetail returns parsed detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 1,
          code: "7203",
          name: "トヨタ自動車",
          opinion: "初回取得、履歴データ無し",
          price_at_fetch: 2900,
          created_at: "2026-09-17T00:00:00Z",
          detail: {},
        }),
      })
    );

    const result = await fetchTrendDetail("7203", "1d", []);

    expect(result.code).toBe("7203");
    expect(result.detail).toEqual({});
  });

  it("updateName sends PATCH with name", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 1, code: "7203", name: "トヨタ" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateName("7203", "トヨタ");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/trends/7203/name"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "トヨタ" }),
      })
    );
  });
});
