import type { Perspectives, Trend } from "../types";
import type { PerspectivesState } from "../hooks/usePerspectives";

const LEADS = [
  { key: "buy", label: "買い目線で見ると" },
  { key: "sell", label: "売り目線で見ると" },
  { key: "keep", label: "キープ(様子見)の目線で見ると" },
] as const;

interface PerspectivesPanelProps {
  trend: Trend;
  state: PerspectivesState;
  perspectives: Perspectives | null;
  error?: string;
}

export function PerspectivesPanel({ trend, state, perspectives, error }: PerspectivesPanelProps) {
  return (
    <section className="perspectives-panel" aria-label="AIによる3つの目線">
      <h2>
        {trend.code} {trend.name}
      </h2>
      <p className="perspectives-disclaimer">断定的な見解ではなく、参考情報として掲載</p>
      {state === "loading" && <p>作成中...</p>}
      {state === "error" && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {perspectives && (
        <>
          <dl className="perspectives-list">
            {LEADS.map(({ key, label }) => (
              <div className="perspective-item" key={key}>
                <dt>{label}</dt>
                <dd>{perspectives[key]}</dd>
              </div>
            ))}
          </dl>
          <p className="perspectives-created">
            作成: {new Date(perspectives.created_at).toLocaleString("ja-JP")}
          </p>
        </>
      )}
    </section>
  );
}
