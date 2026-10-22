import type { ScreeningResultItem } from "../types";

export const SCREENING_PAGE_SIZE = 20;

// 発掘画面の業務ルール: トレンドが none の銘柄は、一覧に出さない。
// ただし、シグナルの条件を1つも選んでいないとき(matched_signals が空)は、全銘柄が対象なので、除かない。
export function visibleItems(items: ScreeningResultItem[]): ScreeningResultItem[] {
  return items.filter((item) => item.type_daily_trend !== "none" || item.matched_signals.length === 0);
}

export function pageItems<T>(items: T[], page: number, pageSize = SCREENING_PAGE_SIZE): T[] {
  return items.slice((page - 1) * pageSize, page * pageSize);
}
