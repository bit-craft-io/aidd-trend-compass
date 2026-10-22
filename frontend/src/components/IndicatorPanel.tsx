import { useEffect, useRef } from "react";
import { createChart, type IChartApi, type Time } from "lightweight-charts";
import type { IndicatorPoint, MacdDetail } from "../types";
import { useTheme } from "../theme/ThemeContext";
import type { VisibleRange } from "./chartRange";

interface IndicatorPanelProps {
  rsi?: IndicatorPoint[];
  macd?: MacdDetail;
  // 上の価格のチャートの、全部の時刻。範囲を指定するときだけ、系列を、この時刻に合わせて、値の無い点で埋める
  timeline?: (string | number)[];
  // 上の価格のチャートと同じ範囲を、最初に出す。無いときは、ライブラリの既定
  visibleRange?: VisibleRange | null;
}

function readCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// 指標は、計算に必要な本数(RSI は15本、MACD は26本)が、たまるまで、値が無い。ライブラリは、データのある時刻にだけ、軸を作るので、
// 範囲を指定しても、データの始まりに、詰められて、上のチャートと、軸が、ずれる。上のチャートの全部の時刻に、値の無い点を足して、そろえる。
function alignToTimeline(points: IndicatorPoint[], timeline?: (string | number)[], enabled?: boolean) {
  if (!enabled || !timeline) return points.map((p) => ({ time: p.time as Time, value: p.value }));
  const valueAt = new Map<string | number, number>(points.map((p) => [p.time, p.value]));
  return timeline.map((time) => {
    const value = valueAt.get(time);
    return value === undefined ? { time: time as Time } : { time: time as Time, value };
  });
}

function RsiChart({
  rsi,
  visibleRange,
  timeline,
}: {
  rsi: IndicatorPoint[];
  visibleRange?: VisibleRange | null;
  timeline?: (string | number)[];
}) {
  const { effectiveTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 120,
      layout: {
        background: { color: readCssVar("--chart-bg") },
        textColor: readCssVar("--chart-text"),
      },
    });
    chartRef.current = chart;
    const series = chart.addLineSeries({ color: readCssVar("--sma-line"), lineWidth: 2 });
    series.setData(alignToTimeline(rsi, timeline, !!visibleRange));
    if (visibleRange) {
      chart.timeScale().setVisibleRange({ from: visibleRange.from as Time, to: visibleRange.to as Time });
    }
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [rsi, timeline, visibleRange?.from, visibleRange?.to]);

  useEffect(() => {
    chartRef.current?.applyOptions({
      layout: {
        background: { color: readCssVar("--chart-bg") },
        textColor: readCssVar("--chart-text"),
      },
    });
  }, [effectiveTheme]);

  return <div data-testid="indicator-panel-rsi" ref={containerRef} />;
}

function MacdChart({
  macd,
  visibleRange,
  timeline,
}: {
  macd: MacdDetail;
  visibleRange?: VisibleRange | null;
  timeline?: (string | number)[];
}) {
  const { effectiveTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 120,
      layout: {
        background: { color: readCssVar("--chart-bg") },
        textColor: readCssVar("--chart-text"),
      },
    });
    chartRef.current = chart;
    for (const [series_data, color] of [
      [macd.macd, readCssVar("--sma-line")],
      [macd.signal, readCssVar("--macd-signal")],
      [macd.histogram, readCssVar("--macd-histogram")],
    ] as const) {
      const series = chart.addLineSeries({ color, lineWidth: 1 });
      series.setData(alignToTimeline(series_data, timeline, !!visibleRange));
    }
    if (visibleRange) {
      chart.timeScale().setVisibleRange({ from: visibleRange.from as Time, to: visibleRange.to as Time });
    }
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [macd, timeline, visibleRange?.from, visibleRange?.to]);

  useEffect(() => {
    chartRef.current?.applyOptions({
      layout: {
        background: { color: readCssVar("--chart-bg") },
        textColor: readCssVar("--chart-text"),
      },
    });
  }, [effectiveTheme]);

  return <div data-testid="indicator-panel-macd" ref={containerRef} />;
}

export function IndicatorPanel({ rsi, macd, visibleRange, timeline }: IndicatorPanelProps) {
  return (
    <>
      {rsi && <RsiChart rsi={rsi} visibleRange={visibleRange} timeline={timeline} />}
      {macd && <MacdChart macd={macd} visibleRange={visibleRange} timeline={timeline} />}
    </>
  );
}
