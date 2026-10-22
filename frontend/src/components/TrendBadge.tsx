import type { TrendName } from "../types";

type TrendValue = TrendName | null | undefined;

export function trendRowClass(value: TrendValue): string | undefined {
  if (value === "up") return "row-trend-up";
  if (value === "down") return "row-trend-down";
  return undefined;
}

// value(API が返す文字列)を、そのまま表示する。
// 値が無いとき(null・未設定)は「—」。
export function TrendBadge({ value }: { value: TrendValue }) {
  if (!value) {
    return <span className="trend-badge trend-unknown">—</span>;
  }
  return <span className={`trend-badge trend-${value}`}>{value}</span>;
}
