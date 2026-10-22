import { useCallback, useEffect, useState } from "react";
import { addTrend, deleteTrend, fetchTrends, refreshTrends, updateName } from "../api/trends";
import { updateTrendPrice } from "../api/trendPrices";
import type { PositionInput, Trend } from "../types";

export const INTERVAL_OPTIONS = [1, 5, 10, 15] as const;
export type IntervalMinutes = (typeof INTERVAL_OPTIONS)[number];

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<Trend[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [interval, setInterval] = useState<IntervalMinutes>(1);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const trends = await fetchTrends();
    setWatchlist(trends);
  }, []);

  useEffect(() => {
    load().catch((err) => setError((err as Error).message));
  }, [load]);

  const add = useCallback(
    async (code: string) => {
      setError(null);
      try {
        await addTrend(code);
        await load();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [load]
  );

  const remove = useCallback(
    async (code: string) => {
      setError(null);
      try {
        await deleteTrend(code);
        setSelectedCodes((prev) => {
          const next = new Set(prev);
          next.delete(code);
          return next;
        });
        await load();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [load]
  );

  const refresh = useCallback(async () => {
    setError(null);
    try {
      await refreshTrends(Array.from(selectedCodes), interval);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [selectedCodes, interval, load]);

  const toggleCode = useCallback((code: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }, []);

  const [groupFilter, setGroupFilter] = useState<number | null>(null);

  const filteredWatchlist =
    groupFilter === null ? watchlist : watchlist.filter((t) => t.trend_group_id === groupFilter);

  const toggleAll = useCallback(() => {
    const visibleCodes = filteredWatchlist.map((t) => t.code);
    setSelectedCodes((prev) => {
      const allVisibleSelected = visibleCodes.every((code) => prev.has(code));
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleCodes.forEach((code) => next.delete(code));
      } else {
        visibleCodes.forEach((code) => next.add(code));
      }
      return next;
    });
  }, [filteredWatchlist]);

  const clearRowError = useCallback((code: string) => {
    setRowErrors((prev) => {
      if (!(code in prev)) return prev;
      const next = { ...prev };
      delete next[code];
      return next;
    });
  }, []);

  const setRowError = useCallback((code: string, message: string) => {
    setRowErrors((prev) => ({ ...prev, [code]: message }));
  }, []);

  const saveName = useCallback(
    async (code: string, name: string) => {
      clearRowError(code);
      try {
        const updated = await updateName(code, name);
        setWatchlist((prev) =>
          prev.map((t) => (t.code === code ? { ...t, name: updated.name } : t))
        );
      } catch (err) {
        setRowError(code, (err as Error).message);
      }
    },
    [clearRowError, setRowError]
  );

  const savePosition = useCallback(
    async (code: string, position: PositionInput) => {
      clearRowError(code);
      try {
        const updated = await updateTrendPrice(code, position);
        setWatchlist((prev) =>
          prev.map((t) =>
            t.code === code
              ? {
                  ...t,
                  trend_group_id: updated.trend_group_id,
                  buy_category: updated.buy_category,
                  buy_price: updated.buy_price,
                  buy_quantity: updated.buy_quantity,
                  sale_price_target: updated.sale_price_target,
                }
              : t
          )
        );
      } catch (err) {
        setRowError(code, (err as Error).message);
      }
    },
    [clearRowError, setRowError]
  );

  return {
    watchlist: filteredWatchlist,
    selectedCodes,
    interval,
    groupFilter,
    error,
    rowErrors,
    setInterval,
    setGroupFilter,
    add,
    remove,
    refresh,
    toggleCode,
    toggleAll,
    saveName,
    savePosition,
  };
}
