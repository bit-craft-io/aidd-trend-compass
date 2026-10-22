import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchTrendDetail } from "../api/trends";
import type { TrendDetail } from "../types";
import { useChartSettings } from "../chartSettings/ChartSettingsContext";
import { CandlestickChart } from "./CandlestickChart";
import { recentCalendarDaysRange, recentTradingDaysRange } from "./chartRange";
import { ChartControls } from "./ChartControls";
import { IndicatorPanel } from "./IndicatorPanel";
import { MarketAnalysisPanel } from "./MarketAnalysisPanel";
import { NewsSection } from "./NewsSection";
import { SettingsMenu } from "./SettingsMenu";

// 最初に出す範囲: 分足(5分・10分・15分)は、最後の3営業日。日足は、最後の日を含めて暦日30日(4週間)。
// 週足・月足は、範囲を指定しない(今のまま)。どれも、ドラッグで、古い分も見られる
const INTRADAY_INTERVALS = new Set(["5m", "10m", "15m"]);

function initialVisibleRange(interval: string, times: (string | number)[]) {
  if (INTRADAY_INTERVALS.has(interval)) return recentTradingDaysRange(times);
  if (interval === "1d") return recentCalendarDaysRange(times);
  return null;
}

export function DetailPage() {
  const { code } = useParams<{ code: string }>();
  const { interval, indicators } = useChartSettings();
  const [trend, setTrend] = useState<TrendDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    let ignore = false;
    setError(null);
    fetchTrendDetail(code, interval, indicators)
      .then((data) => {
        if (!ignore) setTrend(data);
      })
      .catch((err) => {
        if (!ignore) setError((err as Error).message);
      });
    return () => {
      ignore = true;
    };
  }, [code, interval, indicators]);

  // 描画のたびに、新しい配列にすると、RSI・MACD のチャートが、毎回、作り直される。trend が変わるときだけ作る
  const candleTimes = useMemo(() => trend?.detail.history?.candles.map((c) => c.time), [trend]);

  if (error) {
    return (
      <main>
        <header className="app-header">
          <Link to="/" className="back-link">
            一覧へ戻る
          </Link>
          <SettingsMenu />
        </header>
        <div className="app-body">
          <p role="alert">{error}</p>
        </div>
      </main>
    );
  }

  if (!trend) {
    return (
      <main>
        <header className="app-header">
          <Link to="/" className="back-link">
            一覧へ戻る
          </Link>
          <SettingsMenu />
        </header>
        <div className="app-body">
          <p>読込中...</p>
        </div>
      </main>
    );
  }

  const { history, market_analysis } = trend.detail;
  const latestSma5 = history?.sma5[history.sma5.length - 1]?.value;
  const visibleRange = candleTimes ? initialVisibleRange(interval, candleTimes) : null;

  return (
    <main>
      <header className="app-header">
        <div>
          <Link to="/" className="back-link">
            一覧へ戻る
          </Link>
          <h1>
            {trend.code} {trend.name}
          </h1>
        </div>
        <SettingsMenu />
      </header>
      <div className="app-body">
        <NewsSection news={trend.detail.news} />
        <p className="detail-opinion">{trend.opinion}</p>
        <div className="detail-grid">
          <section className="detail-card">
            <h2>履歴データ</h2>
            {history ? (
              <>
                <ChartControls />
                <div className="candlestick-chart-container">
                  <CandlestickChart
                    candles={history.candles}
                    sma5={history.sma5}
                    bollinger={history.bollinger}
                    visibleRange={visibleRange}
                  />
                </div>
                <IndicatorPanel
                  rsi={history.rsi}
                  macd={history.macd}
                  visibleRange={visibleRange}
                  timeline={candleTimes}
                />
                <p className="detail-stats">
                  現在値: ¥{trend.price_at_fetch.toLocaleString()}
                  {latestSma5 !== undefined && ` / 5日移動平均: ¥${latestSma5.toLocaleString()}`} /
                  直近60日高値: ¥{history.high_60d.toLocaleString()} / 安値: ¥
                  {history.low_60d.toLocaleString()} / 出来高前日比: {history.volume_change_pct}%
                </p>
              </>
            ) : (
              <p>履歴データは今のところ取得できていません。</p>
            )}
          </section>
          {market_analysis ? (
            <MarketAnalysisPanel marketAnalysis={market_analysis} />
          ) : (
            <section className="detail-card">
              <h2>市場分析</h2>
              <p>市場分析データは今のところ取得できていません。</p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
