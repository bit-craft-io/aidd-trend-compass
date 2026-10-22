import { Link } from "react-router-dom";
import { useScreening } from "../hooks/useScreening";
import { ScreeningConditionPanel } from "./ScreeningConditionPanel";
import { ScreeningResultsPanel } from "./ScreeningResultsPanel";
import { SettingsMenu } from "./SettingsMenu";

function formatLastRun(lastRunAt: string | null | undefined): string {
  if (!lastRunAt) return "未実行";
  // サーバーはJSTの時刻文字列(タイムゾーン表記なし)を返すため、JSTとして解釈する。
  const date = new Date(`${lastRunAt}+09:00`);
  if (Number.isNaN(date.getTime())) return "未実行";
  return date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function formatRemaining(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `あと${hours}時間${minutes}分`;
}

export function ScreeningPage() {
  const screening = useScreening();
  const { status } = screening;

  return (
    <main>
      <header className="app-header">
        <div>
          <Link to="/" className="back-link">
            一覧へ戻る
          </Link>
          <h1>発掘</h1>
        </div>
        <SettingsMenu />
      </header>
      <div className="app-body">
        <div className="detail-card" style={{ marginBottom: 20 }}>
          <div className="screening-condition-row">
            <div>
              {status && <div>最終発掘: {formatLastRun(status.last_run_at)}</div>}
              {status?.cooldown_active && (
                <div>取得開始済み(24時間以内)。取得はバックグラウンドで実行中の場合があり、完了まで数分かかる</div>
              )}
              {status && status.cooldown_active && (
                <div>次回発掘可能: {formatRemaining(status.remaining_cooldown_seconds)}</div>
              )}
              {status?.is_free_mode && (
                <div className="screening-status-note">
                  稼働モード: Free版({status.rate_limit_per_64s}req/64秒・対象{status.max_stocks}銘柄)
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn btn-discovery"
              disabled={!status || status.cooldown_active || !status.api_key_configured}
              onClick={() => screening.runScan()}
            >
              取得
            </button>
          </div>
          {status && !status.api_key_configured && (
            <p role="alert" className="inline-error">
              J-Quants APIキーが未設定です
            </p>
          )}
          {screening.statusError && (
            <p role="alert" className="inline-error">
              {screening.statusError}
            </p>
          )}
        </div>

        <ScreeningConditionPanel screening={screening} />
        <ScreeningResultsPanel screening={screening} />
      </div>
    </main>
  );
}
