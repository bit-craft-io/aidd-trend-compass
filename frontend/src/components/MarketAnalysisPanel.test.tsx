import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketAnalysisPanel } from "./MarketAnalysisPanel";

describe("MarketAnalysisPanel", () => {
  it("renders sector label, relative strength, and macro correlation", () => {
    render(
      <MarketAnalysisPanel
        marketAnalysis={{
          sector_label: "Auto Manufacturers",
          relative_strength_5d_pt: 0.5,
          macro_correlation: { us10y: -0.31, usdjpy: 0.62 },
        }}
      />
    );

    expect(screen.getByText("業種: Auto Manufacturers")).toBeInTheDocument();
    expect(screen.getByText("業種平均との相対強度: +0.5pt")).toBeInTheDocument();
    expect(screen.getByText("米10年債利回りとの相関: -0.31")).toBeInTheDocument();
    expect(screen.getByText("USD/JPYとの相関: 0.62")).toBeInTheDocument();
  });

  it("does not add a plus sign for a negative relative strength value", () => {
    render(
      <MarketAnalysisPanel
        marketAnalysis={{
          sector_label: "Auto Manufacturers",
          relative_strength_5d_pt: -0.5,
          macro_correlation: { us10y: 0.1, usdjpy: 0.1 },
        }}
      />
    );

    expect(screen.getByText("業種平均との相対強度: -0.5pt")).toBeInTheDocument();
  });
});
