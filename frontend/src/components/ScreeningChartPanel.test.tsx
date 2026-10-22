import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as screeningApi from "../api/screening";
import type { ScreeningCandles } from "../types";
import { ScreeningChartPanel } from "./ScreeningChartPanel";

vi.mock("../api/screening");
vi.mock("./CandlestickChart", () => ({
  CandlestickChart: ({ candles, sma5 }: { candles: unknown[]; sma5: unknown[] }) => (
    <div data-testid="candlestick-chart">{`candles:${candles.length} sma5:${sma5.length}`}</div>
  ),
}));

function makeCandles(code: string, name: string): ScreeningCandles {
  return {
    code,
    name,
    candles: [
      { time: "2026-09-25", open: 98, high: 105, low: 95, close: 100, volume: 10 },
      { time: "2026-09-26", open: 100, high: 112, low: 99, close: 110, volume: 20 },
    ],
    sma5: [{ time: "2026-09-26", value: 104.5 }],
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("ScreeningChartPanel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows the hint and does not call the API while nothing is selected", () => {
    render(<ScreeningChartPanel code={null} name="" />);

    expect(screen.getByText("行をクリックすると日足チャートを表示します")).toBeInTheDocument();
    expect(screeningApi.fetchScreeningCandles).not.toHaveBeenCalled();
  });

  it("shows heading, sub-heading, chart and a numbers-first summary after loading", async () => {
    vi.mocked(screeningApi.fetchScreeningCandles).mockResolvedValue(makeCandles("7203", "トヨタ自動車"));

    render(<ScreeningChartPanel code="7203" name="トヨタ自動車" />);

    expect(screen.getByText("読み込み中…")).toBeInTheDocument();
    expect(await screen.findByTestId("candlestick-chart")).toHaveTextContent("candles:2 sma5:1");
    expect(screen.getByRole("heading", { name: "7203 トヨタ自動車" })).toBeInTheDocument();
    expect(screen.getByText("日足・直近90営業日(J-Quants)")).toBeInTheDocument();
    expect(screen.getByText(/終値 ¥110/)).toHaveTextContent("5日移動平均 ¥104.5");
    expect(screen.getByText(/終値 ¥110/)).toHaveTextContent("期間高値 ¥112");
    expect(screen.getByText(/終値 ¥110/)).toHaveTextContent("期間安値 ¥95");
    expect(screeningApi.fetchScreeningCandles).toHaveBeenCalledWith("7203");
  });

  it("shows an inline error when the fetch fails", async () => {
    vi.mocked(screeningApi.fetchScreeningCandles).mockRejectedValue(new Error("取得に失敗"));

    render(<ScreeningChartPanel code="7203" name="トヨタ自動車" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("取得に失敗");
    expect(screen.queryByTestId("candlestick-chart")).not.toBeInTheDocument();
  });

  it("returns to the hint when the code is cleared", async () => {
    vi.mocked(screeningApi.fetchScreeningCandles).mockResolvedValue(makeCandles("7203", "トヨタ自動車"));

    const { rerender } = render(<ScreeningChartPanel code="7203" name="トヨタ自動車" />);
    await screen.findByTestId("candlestick-chart");
    rerender(<ScreeningChartPanel code={null} name="" />);

    expect(screen.getByText("行をクリックすると日足チャートを表示します")).toBeInTheDocument();
    expect(screen.queryByTestId("candlestick-chart")).not.toBeInTheDocument();
  });

  it("does not let a slow earlier response overwrite the later selection", async () => {
    const first = deferred<ScreeningCandles>();
    const second = deferred<ScreeningCandles>();
    vi.mocked(screeningApi.fetchScreeningCandles).mockImplementation((code: string) =>
      code === "7203" ? first.promise : second.promise
    );

    const { rerender } = render(<ScreeningChartPanel code="7203" name="トヨタ自動車" />);
    rerender(<ScreeningChartPanel code="6758" name="ソニーグループ" />);

    second.resolve(makeCandles("6758", "ソニーグループ"));
    await screen.findByTestId("candlestick-chart");
    first.resolve({ ...makeCandles("7203", "トヨタ自動車"), candles: [] });

    await waitFor(() => expect(screeningApi.fetchScreeningCandles).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(screen.getByTestId("candlestick-chart")).toHaveTextContent("candles:2");
    expect(screen.getByRole("heading", { name: "6758 ソニーグループ" })).toBeInTheDocument();
  });

  it("does not show the previous code's error on a new selection", async () => {
    vi.mocked(screeningApi.fetchScreeningCandles)
      .mockRejectedValueOnce(new Error("失敗A"))
      .mockResolvedValueOnce(makeCandles("6758", "ソニーグループ"));

    const { rerender } = render(<ScreeningChartPanel code="7203" name="トヨタ自動車" />);
    await screen.findByRole("alert");
    rerender(<ScreeningChartPanel code="6758" name="ソニーグループ" />);

    await screen.findByTestId("candlestick-chart");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
