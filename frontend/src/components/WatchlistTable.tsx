import type { PositionInput, Trend, TrendGroup } from "../types";
import { WatchlistRow } from "./WatchlistRow";

interface WatchlistTableProps {
  watchlist: Trend[];
  groups: TrendGroup[];
  selectedCodes: Set<string>;
  rowErrors?: Record<string, string>;
  openCode: string | null;
  onToggleCode: (code: string) => void;
  onToggleAll: () => void;
  onToggleOpinion: (code: string) => void;
  onDelete: (code: string) => void;
  onSaveName: (code: string, name: string) => void;
  onSavePosition: (code: string, position: PositionInput) => void;
}

export function WatchlistTable({
  watchlist,
  groups,
  selectedCodes,
  rowErrors = {},
  openCode,
  onToggleCode,
  onToggleAll,
  onToggleOpinion,
  onDelete,
  onSaveName,
  onSavePosition,
}: WatchlistTableProps) {
  const folded = openCode !== null;
  const allSelected = watchlist.length > 0 && selectedCodes.size === watchlist.length;

  return (
    <table className={folded ? "watchlist-table watchlist-table--folded" : "watchlist-table"}>
      <thead>
        <tr>
          <th className="checkbox-col">
            <input
              type="checkbox"
              aria-label="全選択/全解除"
              checked={allSelected}
              onChange={onToggleAll}
            />
          </th>
          <th className="minor-col">グループ</th>
          <th className="minor-col">更新日時</th>
          <th className="code-col">コード</th>
          <th>会社名</th>
          <th>現在値</th>
          <th className="minor-col">預かり区分</th>
          <th className="minor-col">購入金額</th>
          <th className="minor-col">購入株数</th>
          <th className="minor-col">売価(予)</th>
          <th className="trend-col">
            トレンド
            {!folded && (
              <span className="trend-note">
                5分足を日足に
                <br />
                更新時の値
              </span>
            )}
          </th>
          <th className="minor-col">損益</th>
          <th className="actions-col">操作</th>
        </tr>
      </thead>
      <tbody>
        {watchlist.map((trend) => (
          <WatchlistRow
            key={trend.code}
            trend={trend}
            groups={groups}
            selected={selectedCodes.has(trend.code)}
            error={rowErrors[trend.code]}
            viewing={openCode === trend.code}
            folded={folded}
            onToggleOpinion={onToggleOpinion}
            onToggleCode={onToggleCode}
            onDelete={onDelete}
            onSaveName={onSaveName}
            onSavePosition={onSavePosition}
          />
        ))}
      </tbody>
    </table>
  );
}
