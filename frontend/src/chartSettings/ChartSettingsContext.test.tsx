import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { ChartSettingsProvider, useChartSettings } from "./ChartSettingsContext";

function wrapper({ children }: { children: ReactNode }) {
  return <ChartSettingsProvider>{children}</ChartSettingsProvider>;
}

describe("ChartSettingsContext", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to daily interval and no indicators", () => {
    const { result } = renderHook(() => useChartSettings(), { wrapper });

    expect(result.current.interval).toBe("1d");
    expect(result.current.indicators).toEqual([]);
  });

  it("reads a previously stored setting", () => {
    window.localStorage.setItem(
      "trend-compass-chart-settings",
      JSON.stringify({ interval: "15m", indicators: ["rsi"] })
    );

    const { result } = renderHook(() => useChartSettings(), { wrapper });

    expect(result.current.interval).toBe("15m");
    expect(result.current.indicators).toEqual(["rsi"]);
  });

  it("falls back to defaults when the stored value is malformed", () => {
    window.localStorage.setItem("trend-compass-chart-settings", "not json");

    const { result } = renderHook(() => useChartSettings(), { wrapper });

    expect(result.current.interval).toBe("1d");
    expect(result.current.indicators).toEqual([]);
  });

  it("persists interval changes to localStorage", () => {
    const { result } = renderHook(() => useChartSettings(), { wrapper });

    act(() => result.current.setInterval("1wk"));

    expect(result.current.interval).toBe("1wk");
    const stored = JSON.parse(window.localStorage.getItem("trend-compass-chart-settings")!);
    expect(stored.interval).toBe("1wk");
  });

  it("toggles an indicator on and off", () => {
    const { result } = renderHook(() => useChartSettings(), { wrapper });

    act(() => result.current.toggleIndicator("macd"));
    expect(result.current.indicators).toEqual(["macd"]);

    act(() => result.current.toggleIndicator("macd"));
    expect(result.current.indicators).toEqual([]);
  });
});
