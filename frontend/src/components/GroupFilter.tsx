import { useEffect, useState } from "react";
import type { TrendGroup } from "../types";

interface GroupFilterProps {
  groups: TrendGroup[];
  filterGroupId: number | null;
  onApplyFilter: (groupId: number | null) => void;
}

export function GroupFilter({ groups, filterGroupId, onApplyFilter }: GroupFilterProps) {
  const [filterSelection, setFilterSelection] = useState(
    filterGroupId === null ? "" : String(filterGroupId)
  );

  // If the group currently selected in this <select> disappears (e.g. it
  // was deleted), fall back to "すべて" so the displayed value and the
  // React state agree again -- otherwise the select LOOKS like "すべて"
  // (no option matches the stale id) while `filterSelection` still holds
  // the dead id, and clicking 絞込 re-applies a filter for a group that
  // no longer exists.
  useEffect(() => {
    if (filterSelection !== "" && !groups.some((group) => String(group.id) === filterSelection)) {
      setFilterSelection("");
    }
  }, [groups, filterSelection]);

  return (
    <div className="code-input">
      <div className="field">
        <label htmlFor="group-filter-select">グループ絞込</label>
        <select
          id="group-filter-select"
          className="interval-dropdown"
          value={filterSelection}
          onChange={(e) => setFilterSelection(e.target.value)}
        >
          <option value="">すべて</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="btn btn-dark"
        onClick={() => onApplyFilter(filterSelection === "" ? null : Number(filterSelection))}
      >
        絞込
      </button>
    </div>
  );
}
