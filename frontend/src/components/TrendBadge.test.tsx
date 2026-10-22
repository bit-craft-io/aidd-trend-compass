import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as trendBadge from "./TrendBadge";
import { TrendBadge, trendRowClass } from "./TrendBadge";

describe("TrendBadge", () => {
  it("shows the received string as it is, with the class of the value", () => {
    for (const value of ["up", "down", "flat", "none"] as const) {
      const { unmount } = render(<TrendBadge value={value} />);

      expect(screen.getByText(value)).toHaveClass("trend-badge", `trend-${value}`);
      unmount();
    }
  });

  it("shows a dash only when there is no value", () => {
    const { unmount } = render(<TrendBadge value={null} />);
    expect(screen.getByText("—")).toHaveClass("trend-badge", "trend-unknown");
    unmount();

    render(<TrendBadge value={undefined} />);
    expect(screen.getByText("—")).toHaveClass("trend-unknown");
  });

  it("no longer exports a table that maps the names to Japanese", () => {
    expect(trendBadge).not.toHaveProperty("TREND_LABELS");
  });
});

describe("trendRowClass", () => {
  it("colors up and down rows, and leaves flat and unknown rows uncolored", () => {
    expect(trendRowClass("up")).toBe("row-trend-up");
    expect(trendRowClass("down")).toBe("row-trend-down");
    expect(trendRowClass("flat")).toBeUndefined();
    expect(trendRowClass("none")).toBeUndefined();
    expect(trendRowClass(null)).toBeUndefined();
    expect(trendRowClass(undefined)).toBeUndefined();
  });
});
