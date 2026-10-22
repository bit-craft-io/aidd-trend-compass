import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScreeningResultsPanel } from "./ScreeningResultsPanel";

vi.mock("./ScreeningChartPanel", () => ({
  ScreeningChartPanel: ({ code, name }: { code: string | null; name: string }) => (
    <div data-testid="chart-panel">{code === null ? "none" : `${code}:${name}`}</div>
  ),
}));

function page(items: { code: string; name: string }[], conditionId = 1) {
  return {
    condition_id: conditionId,
    total: items.length,
    items: items.map((i) => ({
      ...i,
      price: 1000,
      matched_signals: ["rsi"],
      type_daily_trend: "up" as const,
    })),
  };
}

const TWO = [
  { code: "7203", name: "トヨタ自動車" },
  { code: "6758", name: "ソニーグループ" },
];

function makeScreening(results = page(TWO), extra = {}) {
  return {
    currentConditionId: results.condition_id,
    results,
    resultsGeneration: 0,
    loadingResults: false,
    resultsError: null,
    register: vi.fn().mockResolvedValue({ registered: [], skipped_count: 0, failed: [] }),
    ...extra,
  };
}

describe("ScreeningResultsPanel chart pane", () => {
  it("starts with nothing selected", () => {
    render(<ScreeningResultsPanel screening={makeScreening() as never} />);

    expect(screen.getByTestId("chart-panel")).toHaveTextContent("none");
  });

  it("switches the chart when a row is clicked and highlights it", () => {
    render(<ScreeningResultsPanel screening={makeScreening() as never} />);

    fireEvent.click(screen.getByText("トヨタ自動車"));
    expect(screen.getByTestId("chart-panel")).toHaveTextContent("7203:トヨタ自動車");
    expect(screen.getByText("トヨタ自動車").closest("tr")).toHaveClass("is-viewing");

    fireEvent.click(screen.getByText("ソニーグループ"));
    expect(screen.getByTestId("chart-panel")).toHaveTextContent("6758:ソニーグループ");
    expect(screen.getByText("トヨタ自動車").closest("tr")).not.toHaveClass("is-viewing");
    expect(screen.getByText("ソニーグループ").closest("tr")).toHaveClass("is-viewing");
  });

  it("does not switch the chart when only the checkbox is clicked", () => {
    render(<ScreeningResultsPanel screening={makeScreening() as never} />);

    fireEvent.click(screen.getByLabelText("7203を選択"));

    expect(screen.getByTestId("chart-panel")).toHaveTextContent("none");
    expect(screen.getByLabelText("7203を選択")).toBeChecked();
  });

  it("keeps the viewed row when its checkbox is toggled", () => {
    render(<ScreeningResultsPanel screening={makeScreening() as never} />);

    fireEvent.click(screen.getByText("ソニーグループ"));
    fireEvent.click(screen.getByLabelText("7203を選択"));

    expect(screen.getByTestId("chart-panel")).toHaveTextContent("6758:ソニーグループ");
  });

  it("returns to unselected when the viewed code disappears from the results", () => {
    const { rerender } = render(<ScreeningResultsPanel screening={makeScreening() as never} />);
    fireEvent.click(screen.getByText("トヨタ自動車"));

    rerender(
      <ScreeningResultsPanel
        screening={makeScreening(page([{ code: "6758", name: "ソニーグループ" }])) as never}
      />
    );

    expect(screen.getByTestId("chart-panel")).toHaveTextContent("none");
  });

  it("does not bring the chart back when the code reappears later", () => {
    const { rerender } = render(<ScreeningResultsPanel screening={makeScreening() as never} />);
    fireEvent.click(screen.getByText("トヨタ自動車"));
    rerender(
      <ScreeningResultsPanel
        screening={makeScreening(page([{ code: "6758", name: "ソニーグループ" }])) as never}
      />
    );

    rerender(<ScreeningResultsPanel screening={makeScreening() as never} />);

    expect(screen.getByTestId("chart-panel")).toHaveTextContent("none");
  });

  it("returns to unselected on a new search even when the same code is still listed", () => {
    const { rerender } = render(<ScreeningResultsPanel screening={makeScreening() as never} />);
    fireEvent.click(screen.getByText("トヨタ自動車"));

    rerender(
      <ScreeningResultsPanel screening={makeScreening(page(TWO), { resultsGeneration: 1 }) as never} />
    );

    expect(screen.getByTestId("chart-panel")).toHaveTextContent("none");
  });

  it("gives the results table the fixed-layout class and puts it in the split layout", () => {
    const { container } = render(<ScreeningResultsPanel screening={makeScreening() as never} />);

    expect(container.querySelector("table.screening-results-table")).not.toBeNull();
    const split = container.querySelector(".screening-split");
    expect(split).not.toBeNull();
    expect(split!.querySelector("table")).not.toBeNull();
    expect(split!.querySelector('[data-testid="chart-panel"]')).not.toBeNull();
  });
});

describe("ScreeningResultsPanel row numbers", () => {
  it("shows a 連番 column right after the checkbox column, numbered from 1", () => {
    const { container } = render(<ScreeningResultsPanel screening={makeScreening() as never} />);

    const headers = Array.from(container.querySelectorAll("thead th")).map((th) => th.textContent);
    expect(headers.slice(0, 3)).toEqual(["", "連番", "株式コード"]);
    const rows = container.querySelectorAll("tbody tr");
    expect(rows[0].querySelectorAll("td")[1]).toHaveTextContent("1");
    expect(rows[1].querySelectorAll("td")[1]).toHaveTextContent("2");
  });

  it("continues numbering across pages", () => {
    const many = Array.from({ length: 45 }, (_, i) => ({ code: String(1000 + i), name: `銘柄${i}` }));
    const { container } = render(<ScreeningResultsPanel screening={makeScreening(page(many)) as never} />);

    fireEvent.click(screen.getByRole("button", { name: "次のページ" }));
    fireEvent.click(screen.getByRole("button", { name: "次のページ" }));

    const rows = container.querySelectorAll("tbody tr");
    expect(rows[0].querySelectorAll("td")[1]).toHaveTextContent("41");
    expect(rows[4].querySelectorAll("td")[1]).toHaveTextContent("45");
  });
});
