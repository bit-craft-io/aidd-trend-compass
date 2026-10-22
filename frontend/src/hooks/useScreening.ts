import { useCallback, useEffect, useState } from "react";
import {
  deleteScreeningCondition,
  fetchScreeningConditions,
  fetchScreeningResults,
  fetchScreeningStatus,
  registerScreeningResults,
  renameScreeningCondition,
  runScreeningSearch,
  startScreeningScan,
} from "../api/screening";
import type {
  ScreeningCondition,
  ScreeningRegisterResult,
  ScreeningResultsPage,
  ScreeningStatus,
} from "../types";

const STATUS_POLL_INTERVAL_MS = 10_000;

export function useScreening() {
  const [status, setStatus] = useState<ScreeningStatus | null>(null);
  const [conditions, setConditions] = useState<ScreeningCondition[]>([]);
  const [enabledSignals, setEnabledSignals] = useState<string[]>([]);
  const [currentConditionId, setCurrentConditionId] = useState<number | null>(null);
  const [results, setResults] = useState<ScreeningResultsPage | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  // 検索・条件適用のたびに増やす。同じ条件IDの再検索でも結果パネルの選択状態を初期化するため。
  const [resultsGeneration, setResultsGeneration] = useState(0);
  // エラーは発生源のエリアごとに持つ(該当エリア直下に表示するため)。
  const [statusError, setStatusError] = useState<string | null>(null);
  const [conditionError, setConditionError] = useState<string | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setStatus(await fetchScreeningStatus());
  }, []);

  const loadConditions = useCallback(async () => {
    setConditions(await fetchScreeningConditions());
  }, []);

  useEffect(() => {
    Promise.all([loadStatus(), loadConditions()])
      .then(() => setStatusError(null))
      .catch((err) => setStatusError((err as Error).message));
  }, [loadStatus, loadConditions]);

  // クールダウン中のみ、ステータスを定期的に取り直して残り時間の表示を更新する。
  const cooldownActive = status?.cooldown_active ?? false;
  useEffect(() => {
    if (!cooldownActive) return;
    const id = setInterval(() => {
      loadStatus()
        .then(() => setStatusError(null))
        .catch((err) => setStatusError((err as Error).message));
    }, STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [cooldownActive, loadStatus]);

  const runScan = useCallback(async () => {
    setStatusError(null);
    try {
      await startScreeningScan();
      await loadStatus();
    } catch (err) {
      setStatusError((err as Error).message);
    }
  }, [loadStatus]);

  // errorSlot: 読み込み失敗をどのエリアに出すか(検索は結果エリア、条件の適用は条件エリア)。
  const loadResults = useCallback(
    async (conditionId: number, errorSlot: "results" | "condition" = "results") => {
      const setSlot = errorSlot === "condition" ? setConditionError : setResultsError;
      setLoadingResults(true);
      setSlot(null);
      try {
        const page_ = await fetchScreeningResults(conditionId);
        setResults(page_);
        setCurrentConditionId(conditionId);
        setResultsError(null);
      } catch (err) {
        setSlot((err as Error).message);
      } finally {
        setLoadingResults(false);
      }
    },
    []
  );

  const runSearch = useCallback(async () => {
    setConditionError(null);
    setResultsError(null);
    let searchResult;
    try {
      searchResult = await runScreeningSearch(enabledSignals);
      await loadConditions();
    } catch (err) {
      setConditionError((err as Error).message);
      return;
    }
    // 結果の読み込み失敗は結果エリア側に出す(loadResults内で処理)。
    setResultsGeneration((g) => g + 1);
    await loadResults(searchResult.condition_id);
  }, [enabledSignals, loadConditions, loadResults]);

  const applyCondition = useCallback(
    async (condition: ScreeningCondition) => {
      setEnabledSignals(condition.enabled_signals);
      setResultsGeneration((g) => g + 1);
      await loadResults(condition.id, "condition");
    },
    [loadResults]
  );

  const renameCondition = useCallback(
    async (id: number, name: string) => {
      setConditionError(null);
      try {
        await renameScreeningCondition(id, name);
        await loadConditions();
      } catch (err) {
        setConditionError((err as Error).message);
      }
    },
    [loadConditions]
  );

  const deleteCondition = useCallback(
    async (id: number) => {
      setConditionError(null);
      try {
        await deleteScreeningCondition(id);
        if (id === currentConditionId) {
          setResults(null);
          setCurrentConditionId(null);
        }
        await loadConditions();
      } catch (err) {
        setConditionError((err as Error).message);
      }
    },
    [currentConditionId, loadConditions]
  );

  const register = useCallback(async (codes: string[]): Promise<ScreeningRegisterResult | null> => {
    setResultsError(null);
    try {
      return await registerScreeningResults(codes);
    } catch (err) {
      setResultsError((err as Error).message);
      return null;
    }
  }, []);

  return {
    status,
    conditions,
    enabledSignals,
    setEnabledSignals,
    currentConditionId,
    results,
    resultsGeneration,
    loadingResults,
    statusError,
    conditionError,
    resultsError,
    runScan,
    runSearch,
    applyCondition,
    renameCondition,
    deleteCondition,
    loadResults,
    register,
  };
}
