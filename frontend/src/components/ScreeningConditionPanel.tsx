import { useState } from "react";
import type { useScreening } from "../hooks/useScreening";
import { SIGNAL_LABELS } from "./screeningSignalLabels";

const SIGNAL_KEYS = Object.keys(SIGNAL_LABELS);

interface ScreeningConditionPanelProps {
  screening: ReturnType<typeof useScreening>;
}

export function ScreeningConditionPanel({ screening }: ScreeningConditionPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [selectedConditionId, setSelectedConditionId] = useState<number | null>(null);

  const selectedCondition = screening.conditions.find((c) => c.id === selectedConditionId) ?? null;

  const toggleSignal = (key: string) => {
    const next = screening.enabledSignals.includes(key)
      ? screening.enabledSignals.filter((s) => s !== key)
      : [...screening.enabledSignals, key];
    screening.setEnabledSignals(next);
  };

  // 保存済み条件を選ぶと、その場でチェックボックスへ反映し、保存済みの結果を読み込む。
  const handleSelect = (value: string) => {
    if (value === "") {
      setSelectedConditionId(null);
      return;
    }
    const condition = screening.conditions.find((c) => c.id === Number(value));
    if (!condition) return;
    setSelectedConditionId(condition.id);
    screening.applyCondition(condition);
  };

  const handleStartEdit = () => {
    if (!selectedCondition) return;
    setNameDraft(selectedCondition.name);
    setEditingName(true);
  };

  const handleFinishEdit = () => {
    const trimmed = nameDraft.trim();
    if (
      selectedCondition &&
      trimmed !== "" &&
      trimmed.length <= 100 &&
      trimmed !== selectedCondition.name
    ) {
      screening.renameCondition(selectedCondition.id, trimmed);
    }
    setEditingName(false);
  };

  const handleDelete = () => {
    if (selectedCondition) screening.deleteCondition(selectedCondition.id);
  };

  return (
    <div className="detail-card" style={{ marginBottom: 20 }}>
      <div className="screening-condition-row">
        <span>条件</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-dark" onClick={handleStartEdit}>
            編集
          </button>
          {editingName ? (
            <input
              className="code-text-input"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={handleFinishEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              autoFocus
            />
          ) : (
            <select
              className="interval-dropdown"
              aria-label="保存済み条件を選択"
              value={selectedCondition?.id ?? ""}
              onChange={(e) => handleSelect(e.target.value)}
            >
              <option value="">保存済み条件を選択</option>
              {screening.conditions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn btn-primary" onClick={() => screening.runSearch()}>
            検索
          </button>
          <button type="button" className="btn btn-outline-danger" onClick={handleDelete}>
            削除
          </button>
          <button type="button" className="btn btn-dark" onClick={() => setExpanded(!expanded)}>
            {expanded ? "閉じる" : "開\u3000く"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="screening-condition-grid" style={{ marginTop: 14 }}>
          {SIGNAL_KEYS.map((key) => (
            <label key={key} className="chk-row">
              <input
                type="checkbox"
                aria-label={SIGNAL_LABELS[key]}
                checked={screening.enabledSignals.includes(key)}
                onChange={() => toggleSignal(key)}
              />
              {SIGNAL_LABELS[key]}
            </label>
          ))}
        </div>
      )}

      {screening.conditionError && (
        <p role="alert" className="inline-error">
          {screening.conditionError}
        </p>
      )}
    </div>
  );
}
