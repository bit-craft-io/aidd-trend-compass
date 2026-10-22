import type { TrendGroup } from "../types";
import { apiRequest } from "./client";

export function fetchTrendGroups(): Promise<TrendGroup[]> {
  return apiRequest<TrendGroup[]>("/trend-groups");
}

export function createTrendGroup(name: string): Promise<TrendGroup> {
  return apiRequest<TrendGroup>("/trend-groups", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function deleteTrendGroup(groupId: number): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>(`/trend-groups/${groupId}`, {
    method: "DELETE",
  });
}
