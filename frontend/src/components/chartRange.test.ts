import { describe, expect, it } from "vitest";
import { recentCalendarDaysRange, recentTradingDaysRange } from "./chartRange";

// 分足の時刻は、日本時間の壁時計を、UTC として入れた UNIX 秒。ここでは、同じ作りで、時刻を作る。
const ts = (month: number, day: number, hour = 9, minute = 0) =>
  Date.UTC(2026, month - 1, day, hour, minute) / 1000;

// その日の 9:00・9:05・9:10 の3本
const day = (month: number, d: number) => [ts(month, d, 9, 0), ts(month, d, 9, 5), ts(month, d, 9, 10)];

describe("recentTradingDaysRange", () => {
  it("returns the first bar of the third-from-last trading day through the last bar", () => {
    // 10/5(月)〜10/8(木)の4営業日
    const times = [...day(10, 5), ...day(10, 6), ...day(10, 7), ...day(10, 8)];

    expect(recentTradingDaysRange(times)).toEqual({ from: ts(10, 6, 9, 0), to: ts(10, 8, 9, 10) });
  });

  it("counts days that have bars, so a weekend is skipped (Thu, Fri, Mon are 3 trading days)", () => {
    const times = [...day(10, 7), ...day(10, 8), ...day(10, 9), ...day(10, 12)];

    expect(recentTradingDaysRange(times)).toEqual({ from: ts(10, 8, 9, 0), to: ts(10, 12, 9, 10) });
  });

  it("counts the latest day as one day even when it has only a few bars so far", () => {
    const times = [...day(10, 5), ...day(10, 6), ...day(10, 7), ts(10, 8, 9, 0)];

    expect(recentTradingDaysRange(times)).toEqual({ from: ts(10, 6, 9, 0), to: ts(10, 8, 9, 0) });
  });

  it("returns null when there are three trading days or fewer, so everything is shown", () => {
    expect(recentTradingDaysRange([...day(10, 6), ...day(10, 7), ...day(10, 8)])).toBeNull();
    expect(recentTradingDaysRange(day(10, 8))).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(recentTradingDaysRange([])).toBeNull();
  });

  it("returns null for daily or longer bars, whose time is a date string", () => {
    expect(recentTradingDaysRange(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"])).toBeNull();
  });

  it("uses the given number of days", () => {
    const times = [...day(10, 5), ...day(10, 6), ...day(10, 7), ...day(10, 8)];

    expect(recentTradingDaysRange(times, 2)).toEqual({ from: ts(10, 7, 9, 0), to: ts(10, 8, 9, 10) });
  });
});

// 日足の時刻は、日付の文字(YYYY-MM-DD)。start から、count 日分の、平日だけを返す。
function weekdays(start: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  while (out.length < count) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe("recentCalendarDaysRange", () => {
  it("returns the first bar within 30 calendar days of the last day (the last day included) through the last bar", () => {
    // 2026-08-17(月)から40営業日 → 最後は 10/9(金)。30暦日は、9/10(木)〜10/9
    const times = weekdays("2026-08-17", 40);
    expect(times[times.length - 1]).toBe("2026-10-09");

    expect(recentCalendarDaysRange(times)).toEqual({ from: "2026-09-10", to: "2026-10-09" });
  });

  it("returns null when all bars fit in exactly 30 calendar days, so everything is shown", () => {
    // 9/10 〜 10/9 は、ちょうど30暦日
    expect(recentCalendarDaysRange(weekdays("2026-09-10", 22))).toBeNull();
  });

  it("narrows the range when the history is one day longer than 30 days", () => {
    const times = ["2026-09-09", ...weekdays("2026-09-10", 22)];

    expect(recentCalendarDaysRange(times)).toEqual({ from: "2026-09-10", to: "2026-10-09" });
  });

  it("starts at the next bar when the boundary day has no bar (a weekend)", () => {
    // 最後が 10/12(月)なら、境界は 9/13(日)。最初の足は 9/14(月)
    const times = weekdays("2026-08-17", 41);
    expect(times[times.length - 1]).toBe("2026-10-12");

    expect(recentCalendarDaysRange(times)).toEqual({ from: "2026-09-14", to: "2026-10-12" });
  });

  it("returns null for fewer than 30 days of bars, an empty list, numeric times or non-date text", () => {
    expect(recentCalendarDaysRange(weekdays("2026-10-01", 5))).toBeNull();
    expect(recentCalendarDaysRange([])).toBeNull();
    expect(recentCalendarDaysRange([ts(10, 5), ts(10, 6), ts(11, 7)])).toBeNull();
    expect(recentCalendarDaysRange(["abc", "def"])).toBeNull();
  });

  it("uses the given number of days", () => {
    const times = weekdays("2026-08-17", 40);

    // 最後の 10/9 を含めて7暦日 → 境界は 10/3(土)。最初の足は 10/5(月)
    expect(recentCalendarDaysRange(times, 7)).toEqual({ from: "2026-10-05", to: "2026-10-09" });
  });
});

