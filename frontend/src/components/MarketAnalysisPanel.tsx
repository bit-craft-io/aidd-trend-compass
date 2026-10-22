import type { MarketAnalysisDetail } from "../types";

interface MarketAnalysisPanelProps {
  marketAnalysis: MarketAnalysisDetail;
}

export function MarketAnalysisPanel({ marketAnalysis }: MarketAnalysisPanelProps) {
  const { sector_label, relative_strength_5d_pt, macro_correlation } = marketAnalysis;
  const sign = relative_strength_5d_pt >= 0 ? "+" : "";
  const barWidth = Math.min(100, Math.max(0, 50 + relative_strength_5d_pt * 10));

  return (
    <section className="detail-card">
      <h2>市場分析</h2>
      <p>業種: {sector_label}</p>
      <p>
        業種平均との相対強度: {sign}
        {relative_strength_5d_pt.toFixed(1)}pt
      </p>
      <div className="relative-strength-bar" data-testid="relative-strength-bar">
        <div className="relative-strength-bar-fill" style={{ width: `${barWidth}%` }} />
      </div>
      <p>米10年債利回りとの相関: {macro_correlation.us10y.toFixed(2)}</p>
      <p>USD/JPYとの相関: {macro_correlation.usdjpy.toFixed(2)}</p>
    </section>
  );
}
