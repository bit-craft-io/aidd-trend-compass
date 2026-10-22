import type { PositionInput, TrendPrice } from "../types";
import { apiRequest } from "./client";

export function updateTrendPrice(code: string, position: PositionInput): Promise<TrendPrice> {
  return apiRequest<TrendPrice>(`/trend-prices/${code}`, {
    method: "PATCH",
    body: JSON.stringify(position),
  });
}
