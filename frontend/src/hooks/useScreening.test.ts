import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as screeningApi from "../api/screening";
import { useScreening } from "./useScreening";

vi.mock("../api/screening");

const sampleStatus = {
  api_key_configured: true,
  cooldown_active: false,
  remaining_cooldown_seconds: 0,
  rate_limit_per_64s: 5,
  max_stocks: 10,
  is_free_mode: true,
};

describe("useScreening", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(screeningApi.fetchScreeningStatus).mockResolvedValue(sampleStatus);
    vi.mocked(screeningApi.fetchScreeningConditions).mockResolvedValue([]);
  });

  it("loads status and conditions on mount", async () => {
    const { result } = renderHook(() => useScreening());

    await waitFor(() => expect(result.current.status).toEqual(sampleStatus));
    expect(result.current.conditions).toEqual([]);
  });

  it("runSearch calls the api and stores condition/results", async () => {
    vi.mocked(screeningApi.runScreeningSearch).mockResolvedValue({
      condition_id: 1,
      condition_name: "2026-09-29_1432",
      matched_count: 1,
    });
    vi.mocked(screeningApi.fetchScreeningResults).mockResolvedValue({
      condition_id: 1,
      total: 1,
      items: [{ code: "7203", name: "トヨタ自動車", price: 2900, matched_signals: ["volume_surge"], type_daily_trend: "up" }],
    });
    const { result } = renderHook(() => useScreening());
    await waitFor(() => expect(result.current.status).toEqual(sampleStatus));

    await act(async () => {
      result.current.setEnabledSignals(["volume_surge"]);
    });
    await act(async () => {
      await result.current.runSearch();
    });

    expect(screeningApi.runScreeningSearch).toHaveBeenCalledWith(["volume_surge"]);
    expect(result.current.results?.items).toHaveLength(1);
  });

  it("applyCondition sets enabledSignals and loads that condition's cached results, without calling search", async () => {
    vi.mocked(screeningApi.fetchScreeningResults).mockResolvedValue({
      condition_id: 5,
      total: 0,
      items: [],
    });
    const { result } = renderHook(() => useScreening());
    await waitFor(() => expect(result.current.status).toEqual(sampleStatus));

    await act(async () => {
      await result.current.applyCondition({ id: 5, name: "出来高重視セット", enabled_signals: ["ma_trend", "rsi"] });
    });

    expect(result.current.enabledSignals).toEqual(["ma_trend", "rsi"]);
    expect(screeningApi.fetchScreeningResults).toHaveBeenCalledWith(5);
    expect(screeningApi.runScreeningSearch).not.toHaveBeenCalled();
  });

  it("deleteCondition clears results and currentConditionId when the deleted condition is the current one", async () => {
    vi.mocked(screeningApi.fetchScreeningResults).mockResolvedValue({
      condition_id: 5,
      total: 0,
      items: [],
    });
    vi.mocked(screeningApi.deleteScreeningCondition).mockResolvedValue({ deleted: true });
    const { result } = renderHook(() => useScreening());
    await waitFor(() => expect(result.current.status).toEqual(sampleStatus));

    await act(async () => {
      await result.current.applyCondition({ id: 5, name: "出来高重視セット", enabled_signals: ["ma_trend", "rsi"] });
    });
    expect(result.current.currentConditionId).toBe(5);
    expect(result.current.results).not.toBeNull();

    await act(async () => {
      await result.current.deleteCondition(5);
    });

    expect(screeningApi.deleteScreeningCondition).toHaveBeenCalledWith(5);
    expect(result.current.results).toBeNull();
    expect(result.current.currentConditionId).toBeNull();
  });

  it("deleteCondition leaves results and currentConditionId intact when a different condition is deleted", async () => {
    vi.mocked(screeningApi.fetchScreeningResults).mockResolvedValue({
      condition_id: 5,
      total: 0,
      items: [],
    });
    vi.mocked(screeningApi.deleteScreeningCondition).mockResolvedValue({ deleted: true });
    const { result } = renderHook(() => useScreening());
    await waitFor(() => expect(result.current.status).toEqual(sampleStatus));

    await act(async () => {
      await result.current.applyCondition({ id: 5, name: "出来高重視セット", enabled_signals: ["ma_trend", "rsi"] });
    });

    await act(async () => {
      await result.current.deleteCondition(9);
    });

    expect(screeningApi.deleteScreeningCondition).toHaveBeenCalledWith(9);
    expect(result.current.results).not.toBeNull();
    expect(result.current.currentConditionId).toBe(5);
  });

  it("runScan calls startScreeningScan and reloads status", async () => {
    vi.mocked(screeningApi.startScreeningScan).mockResolvedValue({ started: true });
    const { result } = renderHook(() => useScreening());
    await waitFor(() => expect(result.current.status).toEqual(sampleStatus));

    await act(async () => {
      await result.current.runScan();
    });

    expect(screeningApi.startScreeningScan).toHaveBeenCalled();
    expect(screeningApi.fetchScreeningStatus).toHaveBeenCalledTimes(2);
  });

  it("register calls registerScreeningResults with selected codes", async () => {
    vi.mocked(screeningApi.registerScreeningResults).mockResolvedValue({
      registered: ["7203"],
      skipped_count: 0,
      failed: [],
    });
    const { result } = renderHook(() => useScreening());
    await waitFor(() => expect(result.current.status).toEqual(sampleStatus));

    await act(async () => {
      await result.current.register(["7203"]);
    });

    expect(screeningApi.registerScreeningResults).toHaveBeenCalledWith(["7203"]);
  });

  describe("status polling", () => {
    const cooldownStatus = { ...sampleStatus, cooldown_active: true, remaining_cooldown_seconds: 3600 };

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("re-fetches status every 10 seconds while cooldown_active", async () => {
      vi.mocked(screeningApi.fetchScreeningStatus).mockResolvedValue(cooldownStatus);
      renderHook(() => useScreening());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screeningApi.fetchScreeningStatus).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(9_999);
      });
      expect(screeningApi.fetchScreeningStatus).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(screeningApi.fetchScreeningStatus).toHaveBeenCalledTimes(2);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(screeningApi.fetchScreeningStatus).toHaveBeenCalledTimes(3);
    });

    it("does not poll when cooldown is inactive", async () => {
      renderHook(() => useScreening());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screeningApi.fetchScreeningStatus).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      expect(screeningApi.fetchScreeningStatus).toHaveBeenCalledTimes(1);
    });

    it("stops polling once the status turns inactive", async () => {
      vi.mocked(screeningApi.fetchScreeningStatus)
        .mockResolvedValueOnce(cooldownStatus)
        .mockResolvedValue(sampleStatus);
      renderHook(() => useScreening());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(screeningApi.fetchScreeningStatus).toHaveBeenCalledTimes(2);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(screeningApi.fetchScreeningStatus).toHaveBeenCalledTimes(2);
    });

    it("clears the interval on unmount", async () => {
      vi.mocked(screeningApi.fetchScreeningStatus).mockResolvedValue(cooldownStatus);
      const { unmount } = renderHook(() => useScreening());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screeningApi.fetchScreeningStatus).toHaveBeenCalledTimes(1);

      unmount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      expect(screeningApi.fetchScreeningStatus).toHaveBeenCalledTimes(1);
    });

    it("reports a polling failure in statusError without throwing", async () => {
      vi.mocked(screeningApi.fetchScreeningStatus)
        .mockResolvedValueOnce(cooldownStatus)
        .mockRejectedValueOnce(new Error("poll failed"));
      const { result } = renderHook(() => useScreening());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });

      expect(result.current.statusError).toBe("poll failed");
    });

    it("clears statusError once a later poll succeeds", async () => {
      vi.mocked(screeningApi.fetchScreeningStatus)
        .mockResolvedValueOnce(cooldownStatus)
        .mockRejectedValueOnce(new Error("poll failed"))
        .mockResolvedValue(cooldownStatus);
      const { result } = renderHook(() => useScreening());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(result.current.statusError).toBe("poll failed");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });

      expect(result.current.statusError).toBeNull();
    });
  });

  describe("per-area errors", () => {
    const emptyResults = { condition_id: 1, total: 0, items: [] };

    async function mounted() {
      const hook = renderHook(() => useScreening());
      await waitFor(() => expect(hook.result.current.status).toEqual(sampleStatus));
      return hook;
    }

    function errors(result: { current: ReturnType<typeof useScreening> }) {
      return [result.current.statusError, result.current.conditionError, result.current.resultsError];
    }

    it("initial load failure goes to statusError only", async () => {
      vi.mocked(screeningApi.fetchScreeningStatus).mockRejectedValue(new Error("load failed"));
      const { result } = renderHook(() => useScreening());

      await waitFor(() => expect(result.current.statusError).toBe("load failed"));
      expect(errors(result)).toEqual(["load failed", null, null]);
    });

    it("runScan failure goes to statusError only, and is cleared by the next runScan", async () => {
      vi.mocked(screeningApi.startScreeningScan)
        .mockRejectedValueOnce(new Error("scan failed"))
        .mockResolvedValueOnce({ started: true });
      const { result } = await mounted();

      await act(async () => {
        await result.current.runScan();
      });
      expect(errors(result)).toEqual(["scan failed", null, null]);

      await act(async () => {
        await result.current.runScan();
      });
      expect(result.current.statusError).toBeNull();
    });

    it("runSearch API failure goes to conditionError only", async () => {
      vi.mocked(screeningApi.runScreeningSearch).mockRejectedValue(new Error("search failed"));
      const { result } = await mounted();

      await act(async () => {
        await result.current.runSearch();
      });

      expect(errors(result)).toEqual([null, "search failed", null]);
      expect(screeningApi.fetchScreeningResults).not.toHaveBeenCalled();
    });

    it("runSearch follow-up results-load failure goes to resultsError only", async () => {
      vi.mocked(screeningApi.runScreeningSearch).mockResolvedValue({
        condition_id: 1,
        condition_name: "x",
        matched_count: 0,
      });
      vi.mocked(screeningApi.fetchScreeningResults).mockRejectedValue(new Error("results failed"));
      const { result } = await mounted();

      await act(async () => {
        await result.current.runSearch();
      });

      expect(errors(result)).toEqual([null, null, "results failed"]);
    });

    it("runSearch clears the previous condition and results errors at its start", async () => {
      vi.mocked(screeningApi.runScreeningSearch)
        .mockRejectedValueOnce(new Error("search failed"))
        .mockResolvedValueOnce({ condition_id: 1, condition_name: "x", matched_count: 0 });
      vi.mocked(screeningApi.fetchScreeningResults).mockResolvedValue(emptyResults);
      const { result } = await mounted();
      await act(async () => {
        await result.current.runSearch();
      });
      expect(result.current.conditionError).toBe("search failed");

      await act(async () => {
        await result.current.runSearch();
      });

      expect(errors(result)).toEqual([null, null, null]);
    });

    it("applyCondition results-load failure goes to conditionError only", async () => {
      vi.mocked(screeningApi.fetchScreeningResults).mockRejectedValue(new Error("apply failed"));
      const { result } = await mounted();

      await act(async () => {
        await result.current.applyCondition({ id: 5, name: "n", enabled_signals: [] });
      });

      expect(errors(result)).toEqual([null, "apply failed", null]);
    });

    it("renameCondition and deleteCondition failures go to conditionError only", async () => {
      vi.mocked(screeningApi.renameScreeningCondition).mockRejectedValue(new Error("rename failed"));
      vi.mocked(screeningApi.deleteScreeningCondition).mockRejectedValue(new Error("delete failed"));
      const { result } = await mounted();

      await act(async () => {
        await result.current.renameCondition(1, "x");
      });
      expect(errors(result)).toEqual([null, "rename failed", null]);

      await act(async () => {
        await result.current.deleteCondition(1);
      });
      expect(errors(result)).toEqual([null, "delete failed", null]);
    });

    it("results loading failure goes to resultsError only", async () => {
      vi.mocked(screeningApi.fetchScreeningResults).mockRejectedValue(new Error("loading failed"));
      const { result } = await mounted();

      await act(async () => {
        await result.current.loadResults(1);
      });

      expect(errors(result)).toEqual([null, null, "loading failed"]);
    });

    it("whole-call register failure goes to resultsError only and returns null", async () => {
      vi.mocked(screeningApi.registerScreeningResults).mockRejectedValue(new Error("register failed"));
      const { result } = await mounted();

      let returned: unknown = "unset";
      await act(async () => {
        returned = await result.current.register(["7203"]);
      });

      expect(returned).toBeNull();
      expect(errors(result)).toEqual([null, null, "register failed"]);
    });
  });
});
