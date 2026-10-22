import type {
  ScreeningCandles,
  ScreeningCondition,
  ScreeningRegisterResult,
  ScreeningResultsPage,
  ScreeningSearchResult,
  ScreeningStatus,
} from "../types";
import { apiRequest } from "./client";

export function fetchScreeningStatus(): Promise<ScreeningStatus> {
  return apiRequest<ScreeningStatus>("/screening/status");
}

export function startScreeningScan(): Promise<{ started: boolean }> {
  return apiRequest<{ started: boolean }>("/screening/scan", { method: "POST" });
}

export function runScreeningSearch(enabledSignals: string[]): Promise<ScreeningSearchResult> {
  return apiRequest<ScreeningSearchResult>("/screening/search", {
    method: "POST",
    body: JSON.stringify({ enabled_signals: enabledSignals }),
  });
}

export function fetchScreeningConditions(): Promise<ScreeningCondition[]> {
  return apiRequest<ScreeningCondition[]>("/screening/conditions");
}

export function renameScreeningCondition(id: number, name: string): Promise<ScreeningCondition> {
  return apiRequest<ScreeningCondition>(`/screening/conditions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteScreeningCondition(id: number): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>(`/screening/conditions/${id}`, { method: "DELETE" });
}

export function fetchScreeningResults(conditionId: number): Promise<ScreeningResultsPage> {
  return apiRequest<ScreeningResultsPage>(`/screening/results/${conditionId}`);
}

export function fetchScreeningCandles(code: string): Promise<ScreeningCandles> {
  return apiRequest<ScreeningCandles>(`/screening/candidates/${encodeURIComponent(code)}/candles`);
}

export function registerScreeningResults(codes: string[]): Promise<ScreeningRegisterResult> {
  return apiRequest<ScreeningRegisterResult>("/screening/register", {
    method: "POST",
    body: JSON.stringify({ codes }),
  });
}
