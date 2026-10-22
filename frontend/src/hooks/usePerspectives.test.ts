import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as trendsApi from "../api/trends";
import type { Perspectives, Trend } from "../types";
import { usePerspectives } from "./usePerspectives";

vi.mock("../api/trends");

const saved: Perspectives = { buy: "a1", sell: "b2", keep: "c3", created_at: "2026-10-01T16:43:00+09:00" };

function makeTrend(id: number, code: string, perspectives: Perspectives | null = null): Trend {
  return {
    id,
    code,
    name: `name${code}`,
    opinion: "",
    price_at_fetch: 100,
    created_at: "2026-10-01T00:00:00Z",
    trend_group_id: null,
    buy_category: 0,
    buy_price: null,
    buy_quantity: null,
    perspectives,
  };
}

describe("usePerspectives", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts closed", () => {
    const { result } = renderHook(() => usePerspectives([makeTrend(1, "7203")]));

    expect(result.current.openCode).toBeNull();
    expect(result.current.opened).toBeNull();
    expect(result.current.state).toBe("closed");
  });

  it("shows the saved perspectives without calling the AI", () => {
    const { result } = renderHook(() => usePerspectives([makeTrend(1, "7203", saved)]));

    act(() => result.current.toggle("7203"));

    expect(result.current.openCode).toBe("7203");
    expect(result.current.state).toBe("done");
    expect(result.current.perspectives).toEqual(saved);
    expect(trendsApi.createPerspectives).not.toHaveBeenCalled();
  });

  it("calls createPerspectives only once when opened, even across re-renders", async () => {
    let resolve: (p: Perspectives) => void = () => {};
    vi.mocked(trendsApi.createPerspectives).mockImplementation(
      () => new Promise<Perspectives>((r) => (resolve = r))
    );
    const watchlist = [makeTrend(1, "7203")];
    const { result, rerender } = renderHook(() => usePerspectives(watchlist));

    act(() => result.current.toggle("7203"));
    rerender();
    rerender();

    expect(result.current.state).toBe("loading");
    expect(trendsApi.createPerspectives).toHaveBeenCalledTimes(1);
    expect(trendsApi.createPerspectives).toHaveBeenCalledWith("7203");

    await act(async () => resolve(saved));
    expect(result.current.state).toBe("done");
    expect(result.current.perspectives).toEqual(saved);
    expect(trendsApi.createPerspectives).toHaveBeenCalledTimes(1);
  });

  it("shows the error and calls again after closing and reopening", async () => {
    vi.mocked(trendsApi.createPerspectives).mockRejectedValueOnce(
      new Error("AIの読み方は今のところ取得できていません")
    );
    vi.mocked(trendsApi.createPerspectives).mockResolvedValueOnce(saved);
    const watchlist = [makeTrend(1, "7203")];
    const { result } = renderHook(() => usePerspectives(watchlist));

    act(() => result.current.toggle("7203"));
    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(result.current.error).toBe("AIの読み方は今のところ取得できていません");
    expect(trendsApi.createPerspectives).toHaveBeenCalledTimes(1);

    act(() => result.current.toggle("7203"));
    expect(result.current.openCode).toBeNull();
    act(() => result.current.toggle("7203"));

    await waitFor(() => expect(result.current.state).toBe("done"));
    expect(trendsApi.createPerspectives).toHaveBeenCalledTimes(2);
  });

  it("closes when the same row is toggled again and switches when another row is toggled", () => {
    const watchlist = [makeTrend(1, "7203", saved), makeTrend(2, "6758", saved)];
    const { result } = renderHook(() => usePerspectives(watchlist));

    act(() => result.current.toggle("7203"));
    expect(result.current.openCode).toBe("7203");
    act(() => result.current.toggle("6758"));
    expect(result.current.openCode).toBe("6758");
    act(() => result.current.toggle("6758"));
    expect(result.current.openCode).toBeNull();
  });

  it("does not call the AI again for a row whose result was just created", async () => {
    vi.mocked(trendsApi.createPerspectives).mockResolvedValue(saved);
    const watchlist = [makeTrend(1, "7203")];
    const { result } = renderHook(() => usePerspectives(watchlist));

    act(() => result.current.toggle("7203"));
    await waitFor(() => expect(result.current.state).toBe("done"));
    act(() => result.current.toggle("7203"));
    act(() => result.current.toggle("7203"));

    expect(result.current.state).toBe("done");
    expect(trendsApi.createPerspectives).toHaveBeenCalledTimes(1);
  });

  it("closes (not folded) when the open stock disappears from the watchlist", () => {
    const { result, rerender } = renderHook(({ list }) => usePerspectives(list), {
      initialProps: { list: [makeTrend(1, "7203", saved), makeTrend(2, "6758", saved)] },
    });
    act(() => result.current.toggle("7203"));
    expect(result.current.opened?.code).toBe("7203");

    rerender({ list: [makeTrend(2, "6758", saved)] });

    expect(result.current.opened).toBeNull();
    expect(result.current.openCode).toBeNull();
    expect(result.current.state).toBe("closed");
  });

  it("closes without calling the AI when a refresh replaces the open row, and builds for the new row afterwards", async () => {
    const { result, rerender } = renderHook(({ list }) => usePerspectives(list), {
      initialProps: { list: [makeTrend(1, "7203", saved)] },
    });
    act(() => result.current.toggle("7203"));
    expect(result.current.state).toBe("done");

    rerender({ list: [makeTrend(5, "7203", null)] });

    expect(result.current.opened).toBeNull();
    expect(result.current.state).toBe("closed");
    expect(trendsApi.createPerspectives).not.toHaveBeenCalled();

    vi.mocked(trendsApi.createPerspectives).mockResolvedValue({ ...saved, buy: "new" });
    act(() => result.current.toggle("7203"));
    await waitFor(() => expect(result.current.state).toBe("done"));
    expect(result.current.perspectives?.buy).toBe("new");
    expect(trendsApi.createPerspectives).toHaveBeenCalledTimes(1);
  });

  it("stays closed, without calling the AI, when the open row leaves the list and comes back", () => {
    const a = makeTrend(1, "7203");
    const b = makeTrend(2, "6758", saved);
    vi.mocked(trendsApi.createPerspectives).mockReturnValue(new Promise(() => {}));
    const { result, rerender } = renderHook(({ list }) => usePerspectives(list), {
      initialProps: { list: [a, b] },
    });
    act(() => result.current.toggle("6758"));
    expect(result.current.openCode).toBe("6758");

    rerender({ list: [a] });
    expect(result.current.openCode).toBeNull();
    rerender({ list: [a, b] });

    expect(result.current.openCode).toBeNull();
    expect(result.current.state).toBe("closed");
    expect(trendsApi.createPerspectives).not.toHaveBeenCalled();
  });

  it("calls the AI once when closed and reopened while the first request is pending", () => {
    vi.mocked(trendsApi.createPerspectives).mockReturnValue(new Promise(() => {}));
    const watchlist = [makeTrend(1, "7203")];
    const { result } = renderHook(() => usePerspectives(watchlist));

    act(() => result.current.toggle("7203"));
    act(() => result.current.toggle("7203"));
    act(() => result.current.toggle("7203"));

    expect(result.current.state).toBe("loading");
    expect(trendsApi.createPerspectives).toHaveBeenCalledTimes(1);
  });

  it("calls once per row when switching away and back while pending, and keeps the first result", async () => {
    const resolvers: Record<string, (p: Perspectives) => void> = {};
    vi.mocked(trendsApi.createPerspectives).mockImplementation(
      (code: string) => new Promise<Perspectives>((r) => (resolvers[code] = r))
    );
    const watchlist = [makeTrend(1, "7203"), makeTrend(2, "6758")];
    const { result } = renderHook(() => usePerspectives(watchlist));

    act(() => result.current.toggle("7203"));
    act(() => result.current.toggle("6758"));
    act(() => result.current.toggle("7203"));
    expect(trendsApi.createPerspectives).toHaveBeenCalledTimes(2);

    await act(async () => resolvers["7203"]({ ...saved, buy: "first" }));
    expect(result.current.state).toBe("done");
    expect(result.current.perspectives?.buy).toBe("first");
    await act(async () => resolvers["6758"](saved));
    act(() => result.current.toggle("6758"));
    expect(result.current.perspectives).toEqual(saved);
    act(() => result.current.toggle("7203"));
    expect(result.current.perspectives?.buy).toBe("first");
    expect(trendsApi.createPerspectives).toHaveBeenCalledTimes(2);
  });

  it("treats an Error with an empty message as a failure with the fallback text, without re-calling", async () => {
    vi.mocked(trendsApi.createPerspectives).mockRejectedValue(new Error(""));
    const watchlist = [makeTrend(1, "7203")];
    const { result } = renderHook(() => usePerspectives(watchlist));

    act(() => result.current.toggle("7203"));

    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(result.current.error).toBe("AIの読み方は今のところ取得できていません");
    expect(trendsApi.createPerspectives).toHaveBeenCalledTimes(1);
  });
});
