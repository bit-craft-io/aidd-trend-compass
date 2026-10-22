import { useState } from "react";
import type { TrendGroup } from "../types";

interface GroupControlsProps {
  groups: TrendGroup[];
  onCreate: (name: string) => Promise<void>;
  onDelete: (groupId: number) => void;
  error: string | null;
}

export function GroupControls({ groups, onCreate, onDelete, error }: GroupControlsProps) {
  const [name, setName] = useState("");
  const [notFoundError, setNotFoundError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setNotFoundError(null);
    try {
      await onCreate(name.trim());
      setName("");
    } catch {
      // Failure is already surfaced via the `error` prop; leave the
      // user's typed text in place so they don't have to retype it.
    }
  };

  const handleDelete = () => {
    const target = groups.find((group) => group.name === name.trim());
    if (!target) {
      setNotFoundError("該当するグループがありません");
      return;
    }
    setNotFoundError(null);
    onDelete(target.id);
    setName("");
  };

  const displayedError = notFoundError ?? error;

  return (
    <div className="code-input">
      <div className="field">
        <label htmlFor="group-name">グループ名</label>
        <input
          id="group-name"
          className="code-text-input"
          value={name}
          placeholder="例: 成長株"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <button type="button" className="btn btn-primary" onClick={handleCreate}>
        作成
      </button>
      <button type="button" className="btn btn-outline-danger" onClick={handleDelete}>
        削除
      </button>
      {displayedError && (
        <p role="alert" className="inline-error">
          {displayedError}
        </p>
      )}
    </div>
  );
}
