import { useEffect, useRef } from "react";
import { createChart, type IChartApi, type ISeriesApi, type Time } from "lightweight-charts";
import type { Candle, IndicatorPoint, BollingerDetail } from "../types";
import { useTheme } from "../theme/ThemeContext";
import type { VisibleRange } from "./chartRange";

interface CandlestickChartProps {
  candles: Candle[];
  sma5: IndicatorPoint[];
  bollinger?: BollingerDetail;
  // 最初に出す時刻の範囲。無いときは、ライブラリの既定(幅いっぱいに入る分)。ドラッグで、古い分も見られる
  visibleRange?: VisibleRange | null;
}

function readCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function readChartColors() {
  return {
    background: readCssVar("--chart-bg"),
    text: readCssVar("--chart-text"),
    grid: readCssVar("--chart-grid"),
    candleUp: readCssVar("--candle-up"),
    candleDown: readCssVar("--candle-down"),
    smaLine: readCssVar("--sma-line"),
    bollingerLine: readCssVar("--bollinger-line"),
  };
}

export function CandlestickChart({ candles, sma5, bollinger, visibleRange }: CandlestickChartProps) {
  const { effectiveTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bollingerSeriesRef = useRef<ISeriesApi<"Line">[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    const colors = readChartColors();

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 300,
      layout: {
        background: { color: colors.background },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
    });
    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: colors.candleUp,
      downColor: colors.candleDown,
      borderUpColor: colors.candleUp,
      borderDownColor: colors.candleDown,
      wickUpColor: colors.candleUp,
      wickDownColor: colors.candleDown,
    });
    candleSeriesRef.current = candleSeries;
    candleSeries.setData(
      candles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    const smaSeries = chart.addLineSeries({ color: colors.smaLine, lineWidth: 2 });
    smaSeriesRef.current = smaSeries;
    smaSeries.setData(sma5.map((p) => ({ time: p.time as Time, value: p.value })));

    bollingerSeriesRef.current = [];
    if (bollinger) {
      for (const band of [bollinger.upper, bollinger.middle, bollinger.lower]) {
        const series = chart.addLineSeries({ color: colors.bollingerLine, lineWidth: 1 });
        series.setData(band.map((p) => ({ time: p.time as Time, value: p.value })));
        bollingerSeriesRef.current.push(series);
      }
    }

    if (visibleRange) {
      chart.timeScale().setVisibleRange({ from: visibleRange.from as Time, to: visibleRange.to as Time });
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      chart.applyOptions({ width: entry.contentRect.width });
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      smaSeriesRef.current = null;
      bollingerSeriesRef.current = [];
    };
  }, [candles, sma5, bollinger, visibleRange?.from, visibleRange?.to]);

  useEffect(() => {
    if (!chartRef.current) return;

    const colors = readChartColors();

    chartRef.current.applyOptions({
      layout: {
        background: { color: colors.background },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
    });
    candleSeriesRef.current?.applyOptions({
      upColor: colors.candleUp,
      downColor: colors.candleDown,
      borderUpColor: colors.candleUp,
      borderDownColor: colors.candleDown,
      wickUpColor: colors.candleUp,
      wickDownColor: colors.candleDown,
    });
    smaSeriesRef.current?.applyOptions({ color: colors.smaLine });
    bollingerSeriesRef.current.forEach((series) => series.applyOptions({ color: colors.bollingerLine }));
  }, [effectiveTheme]);

  return <div data-testid="candlestick-chart" ref={containerRef} />;
}
