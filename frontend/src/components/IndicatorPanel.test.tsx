import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IndicatorPanel } from "./IndicatorPanel";
import { ThemeProvider } from "../theme/ThemeContext";

const setDataLine = vi.fn();
const addLineSeries = vi.fn(() => ({ setData: setDataLine, applyOptions: vi.fn() }));
const applyOptionsChart = vi.fn();
const remove = vi.fn();
const setVisibleRange = vi.fn();

vi.mock("lightweight-charts", () => ({
  createChart: vi.fn(() => ({
    addLineSeries,
    applyOptions: applyOptionsChart,
    timeScale: () => ({ setVisibleRange }),
    remove,
  })),
}));

describe("IndicatorPanel", () => {
  it("renders nothing when neither rsi nor macd is provided", () => {
    const { container } = render(
      <ThemeProvider>
        <IndicatorPanel />
      </ThemeProvider>
    );

    expect(container.querySelector('[data-testid="indicator-panel-rsi"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="indicator-panel-macd"]')).not.toBeInTheDocument();
  });

  it("renders an RSI panel when rsi data is provided", () => {
    const rsi = [{ time: "2026-08-24", value: 65 }];

    const { getByTestId } = render(
      <ThemeProvider>
        <IndicatorPanel rsi={rsi} />
      </ThemeProvider>
    );

    expect(getByTestId("indicator-panel-rsi")).toBeInTheDocument();
  });

  it("renders a MACD panel with three series when macd data is provided", () => {
    addLineSeries.mockClear();
    const macd = {
      macd: [{ time: "2026-08-24", value: 1.2 }],
      signal: [{ time: "2026-08-24", value: 1.0 }],
      histogram: [{ time: "2026-08-24", value: 0.2 }],
    };

    const { getByTestId } = render(
      <ThemeProvider>
        <IndicatorPanel macd={macd} />
      </ThemeProvider>
    );

    expect(getByTestId("indicator-panel-macd")).toBeInTheDocument();
    expect(addLineSeries).toHaveBeenCalledTimes(3);
  });

  it("sets the same visible range on the RSI and MACD charts when a range is given", () => {
    setVisibleRange.mockClear();
    const rsi = [{ time: 1000, value: 65 }];
    const macd = {
      macd: [{ time: 1000, value: 1 }],
      signal: [{ time: 1000, value: 1 }],
      histogram: [{ time: 1000, value: 0 }],
    };

    render(
      <ThemeProvider>
        <IndicatorPanel rsi={rsi} macd={macd} visibleRange={{ from: 1000, to: 2000 }} />
      </ThemeProvider>
    );

    expect(setVisibleRange).toHaveBeenCalledTimes(2);
    expect(setVisibleRange).toHaveBeenNthCalledWith(1, { from: 1000, to: 2000 });
    expect(setVisibleRange).toHaveBeenNthCalledWith(2, { from: 1000, to: 2000 });
  });

  it("does not touch the time scale when no range is given", () => {
    setVisibleRange.mockClear();
    const rsi = [{ time: "2026-08-24", value: 65 }];

    render(
      <ThemeProvider>
        <IndicatorPanel rsi={rsi} />
      </ThemeProvider>
    );

    expect(setVisibleRange).not.toHaveBeenCalled();
  });

  it("pads the series with empty points for every time of the price chart when a range is given, so the axes line up", () => {
    setDataLine.mockClear();
    const rsi = [
      { time: 3, value: 65 },
      { time: 4, value: 66 },
    ];

    render(
      <ThemeProvider>
        <IndicatorPanel rsi={rsi} visibleRange={{ from: 1, to: 4 }} timeline={[1, 2, 3, 4]} />
      </ThemeProvider>
    );

    expect(setDataLine).toHaveBeenCalledWith([{ time: 1 }, { time: 2 }, { time: 3, value: 65 }, { time: 4, value: 66 }]);
  });

  it("pads each of the three MACD series the same way", () => {
    setDataLine.mockClear();
    const point = (time: number, value: number) => ({ time, value });
    const macd = {
      macd: [point(3, 1)],
      signal: [point(3, 2)],
      histogram: [point(3, 3)],
    };

    render(
      <ThemeProvider>
        <IndicatorPanel macd={macd} visibleRange={{ from: 1, to: 3 }} timeline={[1, 2, 3]} />
      </ThemeProvider>
    );

    expect(setDataLine).toHaveBeenCalledTimes(3);
    expect(setDataLine).toHaveBeenNthCalledWith(1, [{ time: 1 }, { time: 2 }, { time: 3, value: 1 }]);
    expect(setDataLine).toHaveBeenNthCalledWith(2, [{ time: 1 }, { time: 2 }, { time: 3, value: 2 }]);
    expect(setDataLine).toHaveBeenNthCalledWith(3, [{ time: 1 }, { time: 2 }, { time: 3, value: 3 }]);
  });

  it("keeps the data as it is when no range is given, even if a timeline is passed", () => {
    setDataLine.mockClear();
    const rsi = [{ time: 3, value: 65 }];

    render(
      <ThemeProvider>
        <IndicatorPanel rsi={rsi} timeline={[1, 2, 3]} />
      </ThemeProvider>
    );

    expect(setDataLine).toHaveBeenCalledWith([{ time: 3, value: 65 }]);
  });
});

