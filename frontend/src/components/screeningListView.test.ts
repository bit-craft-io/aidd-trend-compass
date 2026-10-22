import { describe, expect, it } from "vitest";
import type { ScreeningResultItem, TrendName } from "../types";
import { SCREENING_PAGE_SIZE, pageItems, visibleItems } from "./screeningListView";

function item(code: string, trend: TrendName, signals: string[] = ["ma_trend"]): ScreeningResultItem {
  return { code, name: code, price: 100, matched_signals: signals, type_daily_trend: trend };
}

describe("visibleItems", () => {
  it("drops the none rows when at least one signal is selected", () => {
    const items = [item("1", "up"), item("2", "none"), item("3", "down"), item("4", "flat")];

    expect(visibleItems(items).map((i) => i.code)).toEqual(["1", "3", "4"]);
  });

  it("keeps the none rows when no signal is selected", () => {
    const items = [item("1", "up", []), item("2", "none", [])];

    expect(visibleItems(items).map((i) => i.code)).toEqual(["1", "2"]);
  });

  it("returns an empty list for an empty input", () => {
    expect(visibleItems([])).toEqual([]);
  });
});

describe("pageItems", () => {
  const items = Array.from({ length: 30 }, (_, i) => item(String(i + 1), "up"));

  it("uses 20 rows per page", () => {
    expect(SCREENING_PAGE_SIZE).toBe(20);
  });

  it("fills the first page with 20 rows and puts the rest on the second page", () => {
    expect(pageItems(items, 1)).toHaveLength(20);
    expect(pageItems(items, 2)).toHaveLength(10);
    expect(pageItems(items, 2)[0].code).toBe("21");
  });

  it("returns an empty list for a page past the end", () => {
    expect(pageItems(items, 3)).toEqual([]);
  });

  it("makes 20 and 10 rows after dropping the none rows of 50 (20 of them none)", () => {
    const fifty = Array.from({ length: 50 }, (_, i) => item(String(i + 1), i % 5 < 2 ? "none" : "up"));
    // i % 5 が 0・1 のものが none: 50件のうち 20件

    const visible = visibleItems(fifty);

    expect(visible).toHaveLength(30);
    expect(pageItems(visible, 1)).toHaveLength(20);
    expect(pageItems(visible, 2)).toHaveLength(10);
  });
});
