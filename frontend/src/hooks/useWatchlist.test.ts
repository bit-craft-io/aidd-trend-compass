import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as trendsApi from "../api/trends";
import * as trendPricesApi from "../api/trendPrices";
import { useWatchlist } from "./useWatchlist";

vi.mock("../api/trends");
vi.mock("../api/trendPrices");

const sampleTrend = {
  id: 1,
  code: "7203",
  name: "トヨタ自動車",
  opinion: "初回取得、履歴データ無し",
  trend_group_id: null,
  buy_category: 0,
  buy_price: null,
  buy_quantity: null,
  price_at_fetch: 2900,
  created_at: "2026-09-17T00:00:00Z",
};

describe("useWatchlist", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(trendsApi.fetchTrends).mockResolvedValue([sampleTrend]);
  });

  it("loads watchlist on mount", async () => {
    const { result } = renderHook(() => useWatchlist());

    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));
    expect(result.current.watchlist[0].code).toBe("7203");
  });

  it("toggleCode adds and removes code from selection", async () => {
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    act(() => result.current.toggleCode("7203"));
    expect(result.current.selectedCodes.has("7203")).toBe(true);

    act(() => result.current.toggleCode("7203"));
    expect(result.current.selectedCodes.has("7203")).toBe(false);
  });

  it("toggleAll selects all then clears", async () => {
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    act(() => result.current.toggleAll());
    expect(result.current.selectedCodes.size).toBe(1);

    act(() => result.current.toggleAll());
    expect(result.current.selectedCodes.size).toBe(0);
  });

  it("toggleAll only selects codes visible under the active group filter", async () => {
    const grouped = { ...sampleTrend, code: "6758", trend_group_id: 5 };
    vi.mocked(trendsApi.fetchTrends).mockResolvedValue([sampleTrend, grouped]);
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(2));

    act(() => result.current.setGroupFilter(5));
    await waitFor(() => expect(result.current.watchlist).toEqual([grouped]));

    act(() => result.current.toggleAll());

    expect(result.current.selectedCodes.has("6758")).toBe(true);
    expect(result.current.selectedCodes.has("7203")).toBe(false);
    expect(result.current.selectedCodes.size).toBe(1);
  });

  it("add calls api and reloads watchlist", async () => {
    vi.mocked(trendsApi.addTrend).mockResolvedValue(sampleTrend);
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    await act(async () => {
      await result.current.add("7203");
    });

    expect(trendsApi.addTrend).toHaveBeenCalledWith("7203");
    expect(trendsApi.fetchTrends).toHaveBeenCalledTimes(2);
  });

  it("add sets error message on failure", async () => {
    vi.mocked(trendsApi.addTrend).mockRejectedValue(
      new Error("銘柄コード 0000 のデータを取得できませんでした")
    );
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    await act(async () => {
      await result.current.add("0000");
    });

    expect(result.current.error).toBe("銘柄コード 0000 のデータを取得できませんでした");
  });

  it("refresh sends selected codes and interval", async () => {
    vi.mocked(trendsApi.refreshTrends).mockResolvedValue([sampleTrend]);
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    act(() => result.current.toggleCode("7203"));
    await act(async () => {
      await result.current.refresh();
    });

    expect(trendsApi.refreshTrends).toHaveBeenCalledWith(["7203"], 1);
  });

  it("remove sets error message on failure", async () => {
    vi.mocked(trendsApi.deleteTrend).mockRejectedValue(
      new Error("銘柄コード 7203 は見つかりません")
    );
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    await act(async () => {
      await result.current.remove("7203");
    });

    expect(result.current.error).toBe("銘柄コード 7203 は見つかりません");
  });

  it("refresh sets error message on failure", async () => {
    vi.mocked(trendsApi.refreshTrends).mockRejectedValue(
      new Error("更新に失敗しました")
    );
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    act(() => result.current.toggleCode("7203"));
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBe("更新に失敗しました");
  });

  it("saveName calls api, updates the local name and does not reload the watchlist on success", async () => {
    vi.mocked(trendsApi.updateName).mockResolvedValue({ ...sampleTrend, name: "トヨタ" });
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    await act(async () => {
      await result.current.saveName("7203", "トヨタ");
    });

    expect(trendsApi.updateName).toHaveBeenCalledWith("7203", "トヨタ");
    expect(result.current.watchlist[0].name).toBe("トヨタ");
    // 成功時に再読込すると、同じ行の他の入力欄の入力途中の値を巻き戻し得るため、再読込しない。
    expect(trendsApi.fetchTrends).toHaveBeenCalledTimes(1);
  });

  it("savePosition calls api, updates the local row and does not reload the watchlist on success", async () => {
    vi.mocked(trendPricesApi.updateTrendPrice).mockResolvedValue({
      code: "7203",
      trend_group_id: null,
      buy_category: 1,
      buy_price: 2900,
      buy_quantity: 100,
      sale_price_target: null,
    });
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    await act(async () => {
      await result.current.savePosition("7203", {
        trend_group_id: null,
        buy_category: 1,
        buy_price: 2900,
        buy_quantity: 100,
        sale_price_target: null,
      });
    });

    expect(trendPricesApi.updateTrendPrice).toHaveBeenCalledWith("7203", {
      trend_group_id: null,
      buy_category: 1,
      buy_price: 2900,
      buy_quantity: 100,
      sale_price_target: null,
    });
    expect(trendsApi.fetchTrends).toHaveBeenCalledTimes(1);
    expect(result.current.watchlist[0]).toMatchObject({
      buy_category: 1,
      buy_price: 2900,
      buy_quantity: 100,
    });
  });

  it("savePosition makes a just-assigned group usable by the group filter without reloading", async () => {
    vi.mocked(trendPricesApi.updateTrendPrice).mockResolvedValue({
      code: "7203",
      trend_group_id: 5,
      buy_category: 0,
      buy_price: null,
      buy_quantity: null,
      sale_price_target: null,
    });
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    await act(async () => {
      await result.current.savePosition("7203", {
        trend_group_id: 5,
        buy_category: 0,
        buy_price: null,
        buy_quantity: null,
        sale_price_target: null,
      });
    });
    act(() => result.current.setGroupFilter(5));

    expect(result.current.watchlist.map((t) => t.code)).toEqual(["7203"]);
    expect(trendsApi.fetchTrends).toHaveBeenCalledTimes(1);
  });

  it("saveName sets a row-scoped error on failure without touching the shared error or the name", async () => {
    vi.mocked(trendsApi.updateName).mockRejectedValue(new Error("保存に失敗しました"));
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    await act(async () => {
      await result.current.saveName("7203", "トヨタ");
    });

    expect(result.current.rowErrors["7203"]).toBe("保存に失敗しました");
    expect(result.current.error).toBeNull();
    expect(result.current.watchlist[0].name).toBe("トヨタ自動車");
  });

  it("savePosition sets a row-scoped error on failure without touching the shared error", async () => {
    vi.mocked(trendPricesApi.updateTrendPrice).mockRejectedValue(new Error("保存に失敗しました"));
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    await act(async () => {
      await result.current.savePosition("7203", {
        trend_group_id: null,
        buy_category: 1,
        buy_price: 2900,
        buy_quantity: 100,
        sale_price_target: null,
      });
    });

    expect(result.current.rowErrors["7203"]).toBe("保存に失敗しました");
    expect(result.current.error).toBeNull();
    expect(result.current.watchlist[0]).toMatchObject({ buy_category: 0, buy_price: null });
  });

  it("setGroupFilter narrows watchlist to the matching group", async () => {
    const grouped = { ...sampleTrend, code: "6758", trend_group_id: 5 };
    vi.mocked(trendsApi.fetchTrends).mockResolvedValue([sampleTrend, grouped]);
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(2));

    act(() => result.current.setGroupFilter(5));

    expect(result.current.watchlist).toEqual([grouped]);
  });
});
