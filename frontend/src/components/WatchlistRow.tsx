import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PositionInput, Trend, TrendGroup } from "../types";
import { InlineEditField } from "./InlineEditField";
import { TrendBadge, trendRowClass } from "./TrendBadge";

interface WatchlistRowProps {
  trend: Trend;
  groups: TrendGroup[];
  selected: boolean;
  error?: string;
  viewing: boolean;
  folded: boolean;
  onToggleOpinion: (code: string) => void;
  onToggleCode: (code: string) => void;
  onDelete: (code: string) => void;
  onSaveName: (code: string, name: string) => void;
  onSavePosition: (code: string, position: PositionInput) => void;
}

const BUY_CATEGORY_OPTIONS = [
  { value: 0, label: "未選択" },
  { value: 1, label: "特定" },
  { value: 2, label: "一般" },
  { value: 3, label: "NISA" },
];

function toPositionInput(trend: Trend): PositionInput {
  return {
    trend_group_id: trend.trend_group_id,
    buy_category: trend.buy_category,
    buy_price: trend.buy_price,
    buy_quantity: trend.buy_quantity,
    sale_price_target: trend.sale_price_target ?? null,
  };
}

export function WatchlistRow({
  trend,
  groups,
  selected,
  error,
  viewing,
  folded,
  onToggleOpinion,
  onToggleCode,
  onDelete,
  onSaveName,
  onSavePosition,
}: WatchlistRowProps) {
  const [position, setPosition] = useState<PositionInput>(toPositionInput(trend));

  // 依存をtrendオブジェクトではなくプリミティブにする: 名前保存で行のオブジェクトが
  // 差し替わっても、入力途中の購入金額等を巻き戻さないため。
  useEffect(() => {
    setPosition(toPositionInput(trend));
  }, [trend.trend_group_id, trend.buy_category, trend.buy_price, trend.buy_quantity, trend.sale_price_target]);

  // 保存に失敗したとき(行のエラーが出たとき)は、確定した値を、保存前の値(trend)に戻す
  useEffect(() => {
    if (error) setPosition(toPositionInput(trend));
  }, [error]);

  const savePositionIfChanged = (next: PositionInput) => {
    const before = toPositionInput(trend);
    const changed =
      next.trend_group_id !== before.trend_group_id ||
      next.buy_category !== before.buy_category ||
      next.buy_price !== before.buy_price ||
      next.buy_quantity !== before.buy_quantity ||
      next.sale_price_target !== before.sale_price_target;
    setPosition(next);
    if (changed) onSavePosition(trend.code, next);
  };

  const handleGroupChange = (value: string) => {
    savePositionIfChanged({ ...position, trend_group_id: value === "" ? null : Number(value) });
  };

  const handleCategoryChange = (value: string) => {
    savePositionIfChanged({ ...position, buy_category: Number(value) });
  };

  const numberText = (n: number | null) => (n === null ? "" : String(n));
  const numberOrNull = (text: string) => (text === "" ? null : Number(text));

  const commitNumber = (field: "buy_price" | "buy_quantity" | "sale_price_target") => (text: string) =>
    savePositionIfChanged({ ...position, [field]: numberOrNull(text) });

  const commitName = (text: string) => {
    const trimmed = text.trim();
    if (trimmed !== trend.name) onSaveName(trend.code, trimmed);
  };

  const selectedGroupId = groups.some((g) => g.id === position.trend_group_id)
    ? String(position.trend_group_id)
    : "";

  const groupOptions = [
    { value: "", label: "未選択" },
    ...groups.map((g) => ({ value: String(g.id), label: g.name })),
  ];
  const categoryOptions = BUY_CATEGORY_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }));

  const pnl =
    position.buy_price !== null && position.buy_quantity !== null
      ? (trend.price_at_fetch - position.buy_price) * position.buy_quantity
      : null;

  return (
    <tr className={[trendRowClass(trend.type_daily_trend), viewing ? "is-viewing" : ""].filter(Boolean).join(" ")}>
      <td className="checkbox-col">
        <input
          type="checkbox"
          aria-label={`${trend.code}を選択`}
          checked={selected}
          onChange={() => onToggleCode(trend.code)}
        />
      </td>
      <td className="minor-col">
        <InlineEditField
          label={`${trend.code}のグループ`}
          kind="select"
          className="group-select"
          value={selectedGroupId}
          options={groupOptions}
          onCommit={handleGroupChange}
        />
      </td>
      <td className="minor-col">{new Date(trend.created_at).toLocaleString("ja-JP")}</td>
      <td>{trend.code}</td>
      <td>
        <InlineEditField
          label={`${trend.code}の会社名`}
          kind="text"
          className="name-input"
          value={trend.name}
          placeholder={trend.code}
          onCommit={commitName}
        />
        {folded && error && (
          <span role="alert" className="inline-error">
            {error}
          </span>
        )}
      </td>
      <td>¥{trend.price_at_fetch.toLocaleString()}</td>
      <td className="minor-col">
        <InlineEditField
          label={`${trend.code}の預かり区分`}
          kind="select"
          className="group-select"
          value={String(position.buy_category)}
          options={categoryOptions}
          onCommit={handleCategoryChange}
        />
      </td>
      <td className="minor-col">
        <InlineEditField
          label={`${trend.code}の購入金額`}
          kind="digits"
          className="amount-input"
          value={numberText(position.buy_price)}
          onCommit={commitNumber("buy_price")}
        />
      </td>
      <td className="minor-col">
        <InlineEditField
          label={`${trend.code}の購入株数`}
          kind="digits"
          className="amount-input"
          value={numberText(position.buy_quantity)}
          onCommit={commitNumber("buy_quantity")}
        />
      </td>
      <td className="minor-col">
        <InlineEditField
          label={`${trend.code}の売却価格(予定)`}
          kind="digits"
          className="amount-input"
          value={numberText(position.sale_price_target)}
          onCommit={commitNumber("sale_price_target")}
        />
      </td>
      <td>
        <TrendBadge value={trend.type_daily_trend} />
      </td>
      <td className="minor-col">
        {pnl === null ? (
          "—"
        ) : (
          <span className={pnl >= 0 ? "pnl-plus" : "pnl-minus"}>
            {pnl >= 0 ? "+" : ""}¥{Math.round(pnl).toLocaleString()}
          </span>
        )}
        <span className="opinion">{trend.opinion}</span>
        {!folded && error && (
          <span role="alert" className="inline-error">
            {error}
          </span>
        )}
      </td>
      <td className="actions-col">
        <button
          type="button"
          className="btn btn-primary"
          aria-pressed={viewing}
          onClick={() => onToggleOpinion(trend.code)}
        >
          意見
        </button>
        <Link to={`/trends/${trend.code}`} className="btn btn-info">
          詳細
        </Link>
        <button type="button" className="btn btn-danger" onClick={() => onDelete(trend.code)}>
          削除
        </button>
      </td>
    </tr>
  );
}
