import { useEffect, useState } from "react";
import { fetchScreeningCandles } from "../api/screening";
import type { ScreeningCandles } from "../types";
import { CandlestickChart } from "./CandlestickChart";

interface ScreeningChartPanelProps {
  code: string | null;
  name: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; data: ScreeningCandles };

const yen = (v: number) => `¥${v.toLocaleString()}`;

function summarize(data: ScreeningCandles): string | null {
  if (data.candles.length === 0) return null;
  const close = data.candles[data.candles.length - 1].close;
  const sma = data.sma5.length > 0 ? yen(data.sma5[data.sma5.length - 1].value) : "—";
  const high = Math.max(...data.candles.map((c) => c.high));
  const low = Math.min(...data.candles.map((c) => c.low));
  return `終値 ${yen(close)} / 5日移動平均 ${sma} / 期間高値 ${yen(high)}・期間安値 ${yen(low)}`;
}

export function ScreeningChartPanel({ code, name }: ScreeningChartPanelProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (code === null) return;
    // 後から選んだ銘柄のレスポンスだけを反映するため、切替時に古い要求を無効化する。
    let cancelled = false;
    setState({ status: "loading" });
    fetchScreeningCandles(code)
      .then((data) => {
        if (!cancelled) setState({ status: "loaded", data });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: "error", message: (err as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (code === null) {
    return (
      <aside className="screening-chart-panel">
        <p className="screening-chart-empty">行をクリックすると日足チャートを表示します</p>
      </aside>
    );
  }

  // 銘柄切替の直後、effectが走るまでの1描画だけ前の銘柄のデータが残るため、コードが一致しない間は読込中扱いにする。
  const view: LoadState =
    state.status === "loaded" && state.data.code !== code ? { status: "loading" } : state;
  const summary = view.status === "loaded" ? summarize(view.data) : null;

  return (
    <aside className="screening-chart-panel">
      <h3 className="screening-chart-title">{`${code} ${name}`.trim()}</h3>
      <p className="screening-chart-sub">日足・直近90営業日(J-Quants)</p>
      {view.status === "loading" && <p className="screening-chart-empty">読み込み中…</p>}
      {view.status === "error" && (
        <p role="alert" className="inline-error">
          {view.message}
        </p>
      )}
      {view.status === "loaded" && (
        <>
          <CandlestickChart candles={view.data.candles} sma5={view.data.sma5} />
          {summary && <p className="screening-chart-summary">{summary}</p>}
        </>
      )}
    </aside>
  );
}
