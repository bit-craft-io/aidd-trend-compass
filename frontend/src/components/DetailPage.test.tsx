import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as trendsApi from "../api/trends";
import type { TrendDetail } from "../types";
import { ThemeProvider } from "../theme/ThemeContext";
import { ChartSettingsProvider } from "../chartSettings/ChartSettingsContext";
import { DetailPage } from "./DetailPage";

const { setVisibleRange } = vi.hoisted(() => ({ setVisibleRange: vi.fn() }));

vi.mock("../api/trends");
vi.mock("lightweight-charts", () => ({
  createChart: vi.fn(() => ({
    addCandlestickSeries: vi.fn(() => ({ setData: vi.fn(), applyOptions: vi.fn() })),
    addLineSeries: vi.fn(() => ({ setData: vi.fn(), applyOptions: vi.fn() })),
    applyOptions: vi.fn(),
    timeScale: () => ({ setVisibleRange }),
    remove: vi.fn(),
  })),
}));

const sampleDetail: TrendDetail = {
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
  detail: {
    history: {
      candles: [{ time: "2026-08-24", open: 99, high: 101, low: 98, close: 100, volume: 1000 }],
      sma5: [{ time: "2026-08-24", value: 100 }],
      high_60d: 101,
      low_60d: 98,
      volume_change_pct: 5.0,
    },
    market_analysis: {
      sector_label: "Auto Manufacturers",
      relative_strength_5d_pt: 0.5,
      macro_correlation: { us10y: -0.31, usdjpy: 0.62 },
    },
    news: [
      { headline: "トヨタ、業績見通しを上方修正", sentiment: "positive", url: "https://example.com/1", published_at: "2026-09-18T03:47:37Z" },
    ],
  },
};

function renderAt(code: string) {
  return render(
    <ThemeProvider>
      <ChartSettingsProvider>
        <MemoryRouter initialEntries={[`/trends/${code}`]}>
          <Routes>
            <Route path="/trends/:code" element={<DetailPage />} />
          </Routes>
        </MemoryRouter>
      </ChartSettingsProvider>
    </ThemeProvider>
  );
}

function NavigateButton({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      navigate-{to}
    </button>
  );
}

function renderWithNavigation(initialCode: string) {
  return render(
    <ThemeProvider>
      <ChartSettingsProvider>
        <MemoryRouter initialEntries={[`/trends/${initialCode}`]}>
          <NavigateButton to="/trends/7203" />
          <Routes>
            <Route path="/trends/:code" element={<DetailPage />} />
          </Routes>
        </MemoryRouter>
      </ChartSettingsProvider>
    </ThemeProvider>
  );
}

describe("DetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("shows the chart, market analysis panel, and chart controls when detail data is available", async () => {
    vi.mocked(trendsApi.fetchTrendDetail).mockResolvedValue(sampleDetail);

    renderAt("7203");

    expect(await screen.findByRole("heading", { name: "7203 トヨタ自動車" })).toBeInTheDocument();
    expect(screen.getByTestId("candlestick-chart")).toBeInTheDocument();
    expect(screen.getByText("業種: Auto Manufacturers")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "表示設定を開く" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "日足" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "最新ニュース" })).toBeInTheDocument();
    expect(screen.queryByText("トヨタ、業績見通しを上方修正")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^開/ }));

    expect(screen.getByText("トヨタ、業績見通しを上方修正")).toBeInTheDocument();
  });

  it("refetches with the new interval when the user switches timeframe tabs", async () => {
    vi.mocked(trendsApi.fetchTrendDetail).mockResolvedValue(sampleDetail);

    renderAt("7203");
    await screen.findByTestId("candlestick-chart");

    screen.getByRole("button", { name: "週足" }).click();

    await waitFor(() =>
      expect(trendsApi.fetchTrendDetail).toHaveBeenLastCalledWith("7203", "1wk", [])
    );
  });

  it("shows a not-yet-available message when detail is empty", async () => {
    vi.mocked(trendsApi.fetchTrendDetail).mockResolvedValue({
      ...sampleDetail,
      detail: {},
    });

    renderAt("7203");

    await waitFor(() =>
      expect(screen.getByText("履歴データは今のところ取得できていません。")).toBeInTheDocument()
    );
    expect(screen.getByText("市場分析データは今のところ取得できていません。")).toBeInTheDocument();
  });

  it("shows an inline error when the fetch fails", async () => {
    vi.mocked(trendsApi.fetchTrendDetail).mockRejectedValue(
      new Error("銘柄コード 9999 は見つかりません")
    );

    renderAt("9999");

    expect(await screen.findByRole("alert")).toHaveTextContent("銘柄コード 9999 は見つかりません");
  });

  it("clears a stale error and returns to a loading state once a new fetch starts", async () => {
    vi.mocked(trendsApi.fetchTrendDetail).mockRejectedValueOnce(
      new Error("銘柄コード 9999 は見つかりません")
    );
    // Never resolves within this test: we only assert the transitional state
    // right after navigation, before any new response has arrived.
    vi.mocked(trendsApi.fetchTrendDetail).mockImplementationOnce(() => new Promise(() => {}));

    renderWithNavigation("9999");

    expect(await screen.findByRole("alert")).toHaveTextContent("銘柄コード 9999 は見つかりません");

    screen.getByRole("button", { name: "navigate-/trends/7203" }).click();

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByText("読込中...")).toBeInTheDocument();
  });

  it("ignores a stale response from an older request when a newer request resolves first (race guard)", async () => {
    const dailyDetail = { ...sampleDetail, opinion: "日足の所見" };
    const weeklyDetail = { ...sampleDetail, opinion: "週足の所見" };
    const dailyAgainDetail = { ...sampleDetail, opinion: "日足(2回目)の所見" };

    let resolveWeekly!: (value: typeof weeklyDetail) => void;
    const weeklyPromise = new Promise<typeof weeklyDetail>((resolve) => {
      resolveWeekly = resolve;
    });
    let resolveDailyAgain!: (value: typeof dailyAgainDetail) => void;
    const dailyAgainPromise = new Promise<typeof dailyAgainDetail>((resolve) => {
      resolveDailyAgain = resolve;
    });

    // Distinguish the 1st (initial "1d") call from the 3rd (back-to-"1d")
    // call by call order, since both share the same interval argument.
    let dailyCallCount = 0;
    vi.mocked(trendsApi.fetchTrendDetail).mockImplementation((_code, interval) => {
      if (interval === "1wk") return weeklyPromise;
      dailyCallCount += 1;
      if (dailyCallCount === 1) return Promise.resolve(dailyDetail);
      return dailyAgainPromise;
    });

    renderAt("7203");
    expect(await screen.findByText("日足の所見")).toBeInTheDocument();

    // Switch to weekly (2nd request; its promise stays unresolved for now),
    // waiting for the tab's own render to commit so the 2 clicks aren't
    // batched into a single React state update (which would skip the
    // intermediate "1wk" render and never trigger the 2nd effect run).
    screen.getByRole("button", { name: "週足" }).click();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "週足" })).toHaveAttribute("aria-pressed", "true")
    );

    // Switch back to daily (3rd request) before the 2nd request resolves.
    // The 2nd request's effect cleanup should mark it stale, so its later
    // resolution must not overwrite the 3rd request's result.
    screen.getByRole("button", { name: "日足" }).click();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "日足" })).toHaveAttribute("aria-pressed", "true")
    );

    await act(async () => {
      resolveWeekly(weeklyDetail);
      resolveDailyAgain(dailyAgainDetail);
    });

    await waitFor(() => expect(screen.getByText("日足(2回目)の所見")).toBeInTheDocument());
    expect(screen.queryByText("週足の所見")).not.toBeInTheDocument();
  });
});

describe("DetailPage visible range of the intraday charts", () => {
  // 分足の時刻: 日本時間の壁時計を、UTC として入れた UNIX 秒(バックエンドの作りと同じ)
  const ts = (month: number, day: number, hour = 9, minute = 0) =>
    Date.UTC(2026, month - 1, day, hour, minute) / 1000;
  const intradayTimes = [
    ts(10, 5), ts(10, 5, 9, 5), ts(10, 6), ts(10, 6, 9, 5), ts(10, 7), ts(10, 7, 9, 5), ts(10, 8), ts(10, 8, 9, 5),
  ];
  const intradayDetail: TrendDetail = {
    ...sampleDetail,
    detail: {
      ...sampleDetail.detail,
      history: {
        candles: intradayTimes.map((time) => ({ time, open: 99, high: 101, low: 98, close: 100, volume: 1000 })),
        sma5: intradayTimes.map((time) => ({ time, value: 100 })),
        rsi: intradayTimes.map((time) => ({ time, value: 60 })),
        high_60d: 101,
        low_60d: 98,
        volume_change_pct: 5.0,
      },
    },
  };

  beforeEach(() => {
    window.localStorage.clear();
    setVisibleRange.mockClear();
    vi.mocked(trendsApi.fetchTrendDetail).mockResolvedValue(intradayDetail);
  });

  it("shows the last three trading days on the price chart and the RSI chart for 10-minute bars", async () => {
    renderAt("7203");
    await screen.findByText("トヨタ自動車", { exact: false });
    setVisibleRange.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "10分" }));

    // 10/6・10/7・10/8 の3営業日: 10/6 9:00 〜 10/8 9:05
    await waitFor(() => expect(setVisibleRange).toHaveBeenCalledTimes(2));
    expect(setVisibleRange).toHaveBeenNthCalledWith(1, { from: ts(10, 6), to: ts(10, 8, 9, 5) });
    expect(setVisibleRange).toHaveBeenNthCalledWith(2, { from: ts(10, 6), to: ts(10, 8, 9, 5) });
  });

  it("does not set a range for daily bars, whose time is a date string", async () => {
    vi.mocked(trendsApi.fetchTrendDetail).mockResolvedValue(sampleDetail);

    renderAt("7203");
    await screen.findByText("トヨタ自動車", { exact: false });

    expect(setVisibleRange).not.toHaveBeenCalled();
  });
});

describe("DetailPage visible range of the daily charts", () => {
  // 日足の時刻は、日付の文字。2026-08-17(月)から40営業日 → 最後は 2026-10-09
  const dailyTimes: string[] = [];
  const day = new Date("2026-08-17T00:00:00Z");
  while (dailyTimes.length < 40) {
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) dailyTimes.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  const dailyDetail: TrendDetail = {
    ...sampleDetail,
    detail: {
      ...sampleDetail.detail,
      history: {
        candles: dailyTimes.map((time) => ({ time, open: 99, high: 101, low: 98, close: 100, volume: 1000 })),
        sma5: dailyTimes.map((time) => ({ time, value: 100 })),
        rsi: dailyTimes.map((time) => ({ time, value: 60 })),
        high_60d: 101,
        low_60d: 98,
        volume_change_pct: 5.0,
      },
    },
  };

  beforeEach(() => {
    window.localStorage.clear();
    setVisibleRange.mockClear();
    vi.mocked(trendsApi.fetchTrendDetail).mockResolvedValue(dailyDetail);
  });

  it("shows the last 30 calendar days on the price chart and the RSI chart for daily bars", async () => {
    renderAt("7203");

    // 30暦日(最後の 10/9 を含む)→ 9/10 〜 10/9。上のチャートと RSI に、同じ範囲
    await waitFor(() => expect(setVisibleRange).toHaveBeenCalledTimes(2));
    expect(setVisibleRange).toHaveBeenNthCalledWith(1, { from: "2026-09-10", to: "2026-10-09" });
    expect(setVisibleRange).toHaveBeenNthCalledWith(2, { from: "2026-09-10", to: "2026-10-09" });
  });

  it("does not set a range for weekly or monthly bars", async () => {
    renderAt("7203");
    await waitFor(() => expect(setVisibleRange).toHaveBeenCalled());
    setVisibleRange.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "週足" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "週足" })).toHaveAttribute("aria-pressed", "true"));
    await screen.findByText("トヨタ自動車", { exact: false });
    expect(setVisibleRange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "月足" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "月足" })).toHaveAttribute("aria-pressed", "true"));
    await screen.findByText("トヨタ自動車", { exact: false });
    expect(setVisibleRange).not.toHaveBeenCalled();
  });
});

