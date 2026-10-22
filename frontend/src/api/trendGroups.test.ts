import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTrendGroup, deleteTrendGroup, fetchTrendGroups } from "./trendGroups";

describe("trendGroups api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchTrendGroups returns parsed list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ id: 1, name: "成長株" }],
      })
    );

    const result = await fetchTrendGroups();

    expect(result).toEqual([{ id: 1, name: "成長株" }]);
  });

  it("createTrendGroup posts name", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 1, name: "成長株" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await createTrendGroup("成長株");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/trend-groups"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "成長株" }) })
    );
  });

  it("deleteTrendGroup sends DELETE to id endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ deleted: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await deleteTrendGroup(1);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/trend-groups/1"),
      expect.objectContaining({ method: "DELETE" })
    );
    expect(result.deleted).toBe(true);
  });
});
