import { useEffect, useState } from "react";
import type { useScreening } from "../hooks/useScreening";
import { ScreeningChartPanel } from "./ScreeningChartPanel";
import { Pager } from "./Pager";
import { SIGNAL_LABELS } from "./screeningSignalLabels";
import { SCREENING_PAGE_SIZE, pageItems, visibleItems } from "./screeningListView";
import { TrendBadge, trendRowClass } from "./TrendBadge";

interface ScreeningResultsPanelProps {
  screening: ReturnType<typeof useScreening>;
}

export function ScreeningResultsPanel({ screening }: ScreeningResultsPanelProps) {
  const { results, resultsGeneration } = screening;
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [registeredCodes, setRegisteredCodes] = useState<Set<string>>(new Set());
  const [failedCodes, setFailedCodes] = useState<string[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [viewingCode, setViewingCode] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // 前回検索の選択状態を持ち越さない(登録済み集合は検索を跨いで保持する)。
  const resultsConditionId = results?.condition_id;
  useEffect(() => {
    setSelectedCodes(new Set());
    setSkippedCount(0);
    setViewingCode(null);
    setPage(1);
  }, [resultsConditionId, resultsGeneration]);

  // ページ送りなどで表示中の銘柄が一覧から消えたら、チャートを未選択に戻す。
  useEffect(() => {
    if (viewingCode === null) return;
    const rows = results ? pageItems(visibleItems(results.items), page) : [];
    if (!rows.some((item) => item.code === viewingCode)) {
      setViewingCode(null);
    }
  }, [results, viewingCode, page]);

  if (!results) {
    // 結果が無くても、読み込みや登録の失敗だけは結果エリアに表示する。
    return screening.resultsError ? (
      <p role="alert" className="inline-error">
        {screening.resultsError}
      </p>
    ) : null;
  }

  const toggle = (code: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const handleRegister = async () => {
    const submitted = Array.from(selectedCodes);
    setFailedCodes([]);
    setSkippedCount(0);
    const result = await screening.register(submitted);
    if (result) {
      setSkippedCount(result.skipped_count ?? 0);
      const failed = result.failed ?? [];
      // 登録された銘柄も重複スキップされた銘柄も、ウォッチリストには存在する。
      setRegisteredCodes((prev) => {
        const next = new Set(prev);
        for (const code of submitted) {
          if (!failed.includes(code)) next.add(code);
        }
        return next;
      });
      setFailedCodes(failed);
      setSelectedCodes(new Set());
    }
  };

  const visible = visibleItems(results.items);
  const totalPages = Math.max(Math.ceil(visible.length / SCREENING_PAGE_SIZE), 1);
  const currentPage = Math.min(page, totalPages);
  const pageRows = pageItems(visible, currentPage);
  const viewingItem = pageRows.find((item) => item.code === viewingCode);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600 }}>該当{visible.length}件</span>
        <button
          type="button"
          className="btn btn-dark"
          disabled={selectedCodes.size === 0}
          onClick={handleRegister}
        >
          選択をウォッチリストへ
        </button>
      </div>

      {results.total === 0 && (
        <p className="screening-status-note">
          取得後は保存済み条件の結果が消去されます。「検索」を押すと再計算されます。
        </p>
      )}

      {skippedCount > 0 && (
        <p className="screening-status-note">
          既にウォッチリストにある{skippedCount}件はスキップしました
        </p>
      )}

      {screening.resultsError && (
        <p role="alert" className="inline-error">
          {screening.resultsError}
        </p>
      )}

      {failedCodes.length > 0 && (
        <p role="alert" className="inline-error">
          登録できなかったコード: {failedCodes.join("、")}
        </p>
      )}

      <div className="screening-split">
        <div className="screening-split-main">
          <table className="watchlist-table screening-results-table">
            <thead>
              <tr>
                <th className="checkbox-col"></th>
                <th className="seq-col">連番</th>
                <th className="code-col">株式コード</th>
                <th className="name-col">銘柄名</th>
                <th className="price-col">現在値</th>
                <th className="trend-col">
                  トレンド
                  <span className="trend-note">
                    J-Quants 日足
                    <br />
                    60営業日
                  </span>
                </th>
                <th>該当シグナル</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((item, index) => (
                <tr
                  key={item.code}
                  className={
                    [item.code === viewingCode ? "is-viewing" : "", trendRowClass(item.type_daily_trend) ?? ""]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  tabIndex={0}
                  onClick={() => setViewingCode(item.code)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.target === e.currentTarget) setViewingCode(item.code);
                  }}
                >
                  <td className="checkbox-col" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`${item.code}を選択`}
                      checked={selectedCodes.has(item.code)}
                      onChange={() => toggle(item.code)}
                    />
                  </td>
                  <td className="seq-col">{(currentPage - 1) * SCREENING_PAGE_SIZE + index + 1}</td>
                  <td>{item.code}</td>
                  <td className="name-col" title={item.name}>
                    {item.name}
                  </td>
                  <td>{item.price !== null ? `¥${item.price.toLocaleString()}` : "—"}</td>
                  <td>
                    <TrendBadge value={item.type_daily_trend} />
                  </td>
                  <td>
                    {registeredCodes.has(item.code)
                      ? "登録済み"
                      : item.matched_signals.map((k) => SIGNAL_LABELS[k] ?? k).join("・")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Pager currentPage={currentPage} totalPages={totalPages} onPageChange={setPage} />
        </div>
        <ScreeningChartPanel code={viewingItem?.code ?? null} name={viewingItem?.name ?? ""} />
      </div>
    </div>
  );
}
