import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CandlestickChart } from "./CandlestickChart";
import { ThemeProvider } from "../theme/ThemeContext";

const setDataCandle = vi.fn();
const setDataLine = vi.fn();
const applyOptionsCandle = vi.fn();
const applyOptionsLine = vi.fn();
const applyOptionsChart = vi.fn();
const addCandlestickSeries = vi.fn(() => ({
  setData: setDataCandle,
  applyOptions: applyOptionsCandle,
}));
const addLineSeries = vi.fn(() => ({ setData: setDataLine, applyOptions: applyOptionsLine }));
const remove = vi.fn();
const setVisibleRange = vi.fn();

vi.mock("lightweight-charts", () => ({
  createChart: vi.fn(() => ({
    addCandlestickSeries,
    addLineSeries,
    applyOptions: applyOptionsChart,
    timeScale: () => ({ setVisibleRange }),
    remove,
  })),
}));

describe("CandlestickChart", () => {
  it("renders a container and initializes candle + SMA5 series", () => {
    const candles = [
      { time: "2026-08-24", open: 99, high: 101, low: 98, close: 100, volume: 1000 },
    ];
    const sma5 = [{ time: "2026-08-24", value: 100 }];

    const { getByTestId } = render(
      <ThemeProvider>
        <CandlestickChart candles={candles} sma5={sma5} />
      </ThemeProvider>
    );

    expect(getByTestId("candlestick-chart")).toBeInTheDocument();
    expect(addCandlestickSeries).toHaveBeenCalled();
    expect(setDataCandle).toHaveBeenCalledWith([
      { time: "2026-08-24", open: 99, high: 101, low: 98, close: 100 },
    ]);
    expect(setDataLine).toHaveBeenCalledWith([{ time: "2026-08-24", value: 100 }]);
  });

  it("does not add extra line series when bollinger is not provided", () => {
    addLineSeries.mockClear();
    const candles = [
      { time: "2026-08-24", open: 99, high: 101, low: 98, close: 100, volume: 1000 },
    ];

    render(
      <ThemeProvider>
        <CandlestickChart candles={candles} sma5={[]} />
      </ThemeProvider>
    );

    expect(addLineSeries).toHaveBeenCalledTimes(1); // SMA5のみ
  });

  it("adds three extra line series when bollinger is provided", () => {
    addLineSeries.mockClear();
    const candles = [
      { time: "2026-08-24", open: 99, high: 101, low: 98, close: 100, volume: 1000 },
    ];
    const bollinger = {
      upper: [{ time: "2026-08-24", value: 105 }],
      middle: [{ time: "2026-08-24", value: 100 }],
      lower: [{ time: "2026-08-24", value: 95 }],
    };

    render(
      <ThemeProvider>
        <CandlestickChart candles={candles} sma5={[]} bollinger={bollinger} />
      </ThemeProvider>
    );

    expect(addLineSeries).toHaveBeenCalledTimes(4); // SMA5 + upper/middle/lower
  });

  it("sets the visible range on the time scale when a range is given", () => {
    setVisibleRange.mockClear();
    const candles = [{ time: 1000, open: 99, high: 101, low: 98, close: 100, volume: 1000 }];

    render(
      <ThemeProvider>
        <CandlestickChart candles={candles} sma5={[]} visibleRange={{ from: 1000, to: 2000 }} />
      </ThemeProvider>
    );

    expect(setVisibleRange).toHaveBeenCalledWith({ from: 1000, to: 2000 });
  });

  it("does not touch the time scale when no range is given", () => {
    setVisibleRange.mockClear();
    const candles = [{ time: "2026-08-24", open: 99, high: 101, low: 98, close: 100, volume: 1000 }];

    render(
      <ThemeProvider>
        <CandlestickChart candles={candles} sma5={[]} />
      </ThemeProvider>
    );

    expect(setVisibleRange).not.toHaveBeenCalled();
  });
});
