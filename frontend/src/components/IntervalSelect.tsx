import { INTERVAL_OPTIONS, IntervalMinutes } from "../hooks/useWatchlist";

interface IntervalSelectProps {
  interval: IntervalMinutes;
  onChange: (interval: IntervalMinutes) => void;
  onRefresh: () => void;
}

export function IntervalSelect({ interval, onChange, onRefresh }: IntervalSelectProps) {
  return (
    // <div className="interval-select">
    <div className="code-input">
      <div className="field">
        <label htmlFor="refresh-interval">更新間隔</label>
        <select
          id="refresh-interval"
          className="interval-dropdown"
          value={interval}
          onChange={(e) => onChange(Number(e.target.value) as IntervalMinutes)}
        >
          {INTERVAL_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes}分
            </option>
          ))}
        </select>
      </div>
      <button type="button" className="btn btn-dark" onClick={onRefresh}>
        更新
      </button>
    </div>
  );
}
