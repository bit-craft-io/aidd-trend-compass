import type { Perspectives, Trend, TrendDetail } from "../types";
import { apiRequest } from "./client";
import type { Interval, IndicatorKey } from "../chartSettings/ChartSettingsContext";

export function fetchTrends(): Promise<Trend[]> {
  return apiRequest<Trend[]>("/trends");
}

export function addTrend(code: string): Promise<Trend> {
  return apiRequest<Trend>("/trends", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function refreshTrends(
  codes: string[],
  intervalMinutes: number
): Promise<Trend[]> {
  return apiRequest<Trend[]>("/trends/refresh", {
    method: "POST",
    body: JSON.stringify({ codes, interval_minutes: intervalMinutes }),
  });
}

export function deleteTrend(code: string): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>(`/trends/${code}`, {
    method: "DELETE",
  });
}

export function fetchTrendDetail(
  code: string,
  interval: Interval,
  indicators: IndicatorKey[]
): Promise<TrendDetail> {
  const params = new URLSearchParams({ interval, indicators: indicators.join(",") });
  return apiRequest<TrendDetail>(`/trends/${code}?${params.toString()}`);
}

export function updateName(code: string, name: string): Promise<Trend> {
  return apiRequest<Trend>(`/trends/${code}/name`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function createPerspectives(code: string): Promise<Perspectives> {
  return apiRequest<Perspectives>(`/trends/${code}/perspectives`, { method: "POST" });
}
