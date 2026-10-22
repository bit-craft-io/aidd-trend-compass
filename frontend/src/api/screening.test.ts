import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteScreeningCondition,
  fetchScreeningConditions,
  fetchScreeningResults,
  fetchScreeningStatus,
  registerScreeningResults,
  renameScreeningCondition,
  runScreeningSearch,
  startScreeningScan,
} from "./screening";

describe("screening api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchScreeningStatus GETs /screening/status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        api_key_configured: true,
        cooldown_active: false,
        remaining_cooldown_seconds: 0,
        rate_limit_per_64s: 5,
        max_stocks: 10,
        is_free_mode: true,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchScreeningStatus();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/screening/status"),
      expect.anything()
    );
  });

  it("startScreeningScan POSTs /screening/scan", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ started: true }) });
    vi.stubGlobal("fetch", fetchMock);

    await startScreeningScan();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/screening/scan"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("runScreeningSearch POSTs enabled_signals", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ condition_id: 1, condition_name: "2026-09-29_1432", matched_count: 3 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await runScreeningSearch(["volume_surge"]);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/screening/search"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ enabled_signals: ["volume_surge"] }),
      })
    );
  });

  it("fetchScreeningConditions GETs /screening/conditions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] })
    );

    await fetchScreeningConditions();
  });

  it("renameScreeningCondition PATCHes name", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 1, name: "出来高重視セット" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await renameScreeningCondition(1, "出来高重視セット");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/screening/conditions/1"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "出来高重視セット" }),
      })
    );
  });

  it("deleteScreeningCondition DELETEs by id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ deleted: true }) })
    );

    await deleteScreeningCondition(1);
  });

  it("fetchScreeningResults GETs without page params", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ condition_id: 1, total: 0, items: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchScreeningResults(1);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/screening\/results\/1$/),
      expect.anything()
    );
  });

  it("registerScreeningResults POSTs codes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ registered: ["7203"], skipped_count: 0 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await registerScreeningResults(["7203"]);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/screening/register"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ codes: ["7203"] }) })
    );
  });
});
