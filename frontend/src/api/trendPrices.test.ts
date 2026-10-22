import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateTrendPrice } from "./trendPrices";

describe("trendPrices api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("updateTrendPrice sends PATCH with position payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: "7203", trend_group_id: null, buy_category: 1, buy_price: 2900, buy_quantity: 100, sale_price_target: null }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateTrendPrice("7203", {
      trend_group_id: null,
      buy_category: 1,
      buy_price: 2900,
      buy_quantity: 100,
      sale_price_target: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/trend-prices/7203"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ trend_group_id: null, buy_category: 1, buy_price: 2900, buy_quantity: 100, sale_price_target: null }),
      })
    );
  });
});
