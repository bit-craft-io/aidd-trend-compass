import { useChartSettings, type IndicatorKey, type Interval } from "../chartSettings/ChartSettingsContext";

const INTERVAL_OPTIONS: { key: Interval; label: string }[] = [
  { key: "5m", label: "5分" },
  { key: "10m", label: "10分" },
  { key: "15m", label: "15分" },
  { key: "1d", label: "日足" },
  { key: "1wk", label: "週足" },
  { key: "1mo", label: "月足" },
];

const INDICATOR_OPTIONS: { key: IndicatorKey; label: string }[] = [
  { key: "rsi", label: "RSI" },
  { key: "macd", label: "MACD" },
  { key: "bollinger", label: "ボリンジャーバンド" },
];

export function ChartControls() {
  const { interval, indicators, setInterval, toggleIndicator } = useChartSettings();

  return (
    <div className="chart-controls">
      <div className="chart-controls-intervals" role="group" aria-label="足種">
        {INTERVAL_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className="chart-controls-interval-tab"
            aria-pressed={interval === opt.key}
            onClick={() => setInterval(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="chart-controls-indicators" role="group" aria-label="指標">
        {INDICATOR_OPTIONS.map((opt) => (
          <label key={opt.key} className="chart-controls-indicator-option">
            <input
              type="checkbox"
              checked={indicators.includes(opt.key)}
              onChange={() => toggleIndicator(opt.key)}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}
