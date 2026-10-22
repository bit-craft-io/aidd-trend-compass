import { useCallback, useEffect, useState } from "react";
import { createTrendGroup, deleteTrendGroup, fetchTrendGroups } from "../api/trendGroups";
import type { TrendGroup } from "../types";

export function useTrendGroups() {
  const [groups, setGroups] = useState<TrendGroup[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchTrendGroups();
    setGroups(result);
  }, []);

  useEffect(() => {
    load().catch((err) => setError((err as Error).message));
  }, [load]);

  const create = useCallback(
    async (name: string) => {
      setError(null);
      try {
        await createTrendGroup(name);
        await load();
      } catch (err) {
        setError((err as Error).message);
        throw err;
      }
    },
    [load]
  );

  const remove = useCallback(
    async (groupId: number) => {
      setError(null);
      try {
        await deleteTrendGroup(groupId);
        await load();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [load]
  );

  return { groups, error, create, remove };
}
