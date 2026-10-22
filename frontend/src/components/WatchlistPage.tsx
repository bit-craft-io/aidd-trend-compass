import { Link } from "react-router-dom";
import { usePerspectives } from "../hooks/usePerspectives";
import { useTrendGroups } from "../hooks/useTrendGroups";
import { useWatchlist } from "../hooks/useWatchlist";
import { CodeInput } from "./CodeInput";
import { GroupControls } from "./GroupControls";
import { GroupFilter } from "./GroupFilter";
import { IntervalSelect } from "./IntervalSelect";
import { PerspectivesPanel } from "./PerspectivesPanel";
import { SettingsMenu } from "./SettingsMenu";
import { WatchlistTable } from "./WatchlistTable";

export function WatchlistPage() {
  const {
    watchlist,
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
  } = useWatchlist();
  const { groups, error: groupError, create: createGroup, remove: removeGroup } = useTrendGroups();
  const perspectivesApi = usePerspectives(watchlist);

  return (
    <main>
      <header className="app-header">
        <h1>トレンド羅針盤</h1>
        <div className="app-header-actions">
          <Link to="/screening" className="header-nav-link">
            発掘
          </Link>
          <SettingsMenu />
        </div>
      </header>
      <div className="app-body">
        <div className="controls-row">
          <div className="controls-row-group">
            <CodeInput onSubmit={add} error={error} />
            <GroupControls
              groups={groups}
              onCreate={createGroup}
              onDelete={removeGroup}
              error={groupError}
            />
          </div>
          <div className="controls-row-group">
            <GroupFilter groups={groups} filterGroupId={groupFilter} onApplyFilter={setGroupFilter} />
            <IntervalSelect interval={interval} onChange={setInterval} onRefresh={refresh} />
          </div>
        </div>
        <div className="controls-row watchlist-count">
          <p className="watchlist-count">ウォッチリスト({watchlist.length}件)</p>
        </div>
        <div className="watchlist-layout">
          <WatchlistTable
            watchlist={watchlist}
            groups={groups}
            selectedCodes={selectedCodes}
            rowErrors={rowErrors}
            openCode={perspectivesApi.openCode}
            onToggleCode={toggleCode}
            onToggleAll={toggleAll}
            onToggleOpinion={perspectivesApi.toggle}
            onDelete={remove}
            onSaveName={saveName}
            onSavePosition={savePosition}
          />
          {perspectivesApi.opened && (
            <PerspectivesPanel
              trend={perspectivesApi.opened}
              state={perspectivesApi.state}
              perspectives={perspectivesApi.perspectives}
              error={perspectivesApi.error}
            />
          )}
        </div>
      </div>
    </main>
  );
}
