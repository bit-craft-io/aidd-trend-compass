import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScreeningResultsPanel } from "./ScreeningResultsPanel";
import { SIGNAL_LABELS } from "./screeningSignalLabels";

function makeScreening(overrides = {}) {
  return {
    status: null,
    conditions: [],
    enabledSignals: [] as string[],
    setEnabledSignals: vi.fn(),
    currentConditionId: 1,
    results: {
      condition_id: 1,
      total: 1,
      items: [
        { code: "7203", name: "トヨタ自動車", price: 2900, matched_signals: ["volume_surge"], type_daily_trend: "up" },
      ],
    },
    loadingResults: false,
    statusError: null,
    conditionError: null,
    resultsError: null,
    runScan: vi.fn(),
    runSearch: vi.fn(),
    applyCondition: vi.fn(),
    renameCondition: vi.fn(),
    deleteCondition: vi.fn(),
    register: vi.fn().mockResolvedValue({ registered: ["7203"], skipped_count: 0 }),
    ...overrides,
  };
}

describe("ScreeningResultsPanel", () => {
  it("shows the matched count on the left and the register button on the right of the same row", () => {
    render(<ScreeningResultsPanel screening={makeScreening() as never} />);

    expect(screen.getByText("該当1件")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "選択をウォッチリストへ" })).toBeInTheDocument();
  });

  it("lists result rows with code, name, price and matched signals", () => {
    render(<ScreeningResultsPanel screening={makeScreening() as never} />);

    expect(screen.getByText("7203")).toBeInTheDocument();
    expect(screen.getByText("トヨタ自動車")).toBeInTheDocument();
  });

  it("selecting a row and clicking 選択をウォッチリストへ calls register with that code", async () => {
    const screening = makeScreening();
    render(<ScreeningResultsPanel screening={screening as never} />);

    fireEvent.click(screen.getByLabelText("7203を選択"));
    fireEvent.click(screen.getByRole("button", { name: "選択をウォッチリストへ" }));

    expect(screening.register).toHaveBeenCalledWith(["7203"]);
  });

  it("shows nothing meaningful when there are no results yet", () => {
    render(<ScreeningResultsPanel screening={makeScreening({ results: null }) as never} />);

    expect(screen.queryByText("該当1件")).not.toBeInTheDocument();
  });

  it("adds a トレンド column and tints rows by the daily trend", () => {
    const screening = makeScreening({
      results: {
        condition_id: 1,
        total: 3,
        items: [
          { code: "7203", name: "トヨタ自動車", price: 2900, matched_signals: [], type_daily_trend: "up" },
          { code: "6758", name: "ソニーグループ", price: 3000, matched_signals: [], type_daily_trend: "down" },
          { code: "9984", name: "ソフトバンクG", price: 8000, matched_signals: [], type_daily_trend: "flat" },
        ],
      },
    });

    render(<ScreeningResultsPanel screening={screening as never} />);

    expect(screen.getByRole("columnheader", { name: /^トレンド/ })).toBeInTheDocument();
    const badges = Array.from(document.querySelectorAll(".trend-badge")).map((el) => el.textContent);
    expect(badges).toEqual(["up", "down", "flat"]);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveClass("row-trend-up");
    expect(rows[1]).toHaveClass("row-trend-down");
    expect(rows[2]).not.toHaveClass("row-trend-up");
    expect(rows[2]).not.toHaveClass("row-trend-down");
  });
});

const REGISTER_NAME = "選択をウォッチリストへ";

function twoItemResults(conditionId = 1) {
  return {
    condition_id: conditionId,
    total: 2,
    items: [
      { code: "7203", name: "トヨタ自動車", price: 2900, matched_signals: ["volume_surge"], type_daily_trend: "up" },
      { code: "6758", name: "ソニーグループ", price: 13000, matched_signals: ["rsi"], type_daily_trend: "down" },
    ],
  };
}

function manyItems(count: number, trend: "up" | "none" = "up", signals: string[] = ["ma_trend"]) {
  return Array.from({ length: count }, (_, i) => ({
    code: String(1000 + i),
    name: `銘柄${i}`,
    price: 100,
    matched_signals: signals,
    type_daily_trend: trend,
  }));
}
function resultsOf(items: ReturnType<typeof manyItems>) {
  return { condition_id: 1, total: items.length, items };
}

function pageButtonLabels() {
  return screen
    .getAllByRole("button")
    .map((b) => b.textContent ?? "")
    .filter((t) => /^\d+$/.test(t));
}

describe("ScreeningResultsPanel signal labels", () => {
  it("renders the Japanese label for a known signal key", () => {
    render(<ScreeningResultsPanel screening={makeScreening() as never} />);

    expect(screen.getByText(SIGNAL_LABELS["volume_surge"])).toBeInTheDocument();
  });

  it("falls back to the raw key for an unknown signal and joins several with ・", () => {
    const results = {
      ...twoItemResults(),
      items: [
        { code: "7203", name: "トヨタ自動車", price: 2900, matched_signals: ["volume_surge", "mystery_signal"] },
      ],
    };
    render(<ScreeningResultsPanel screening={makeScreening({ results }) as never} />);

    expect(screen.getByText(`${SIGNAL_LABELS["volume_surge"]}・mystery_signal`)).toBeInTheDocument();
  });
});

describe("ScreeningResultsPanel register", () => {
  it("disables the register button while nothing is selected", () => {
    render(<ScreeningResultsPanel screening={makeScreening() as never} />);

    expect(screen.getByRole("button", { name: REGISTER_NAME })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("7203を選択"));
    expect(screen.getByRole("button", { name: REGISTER_NAME })).toBeEnabled();
  });

  it("clears the selection when the same condition is re-searched (generation bump, same condition_id)", () => {
    const first = makeScreening({ results: twoItemResults(), resultsGeneration: 0 });
    const { rerender } = render(<ScreeningResultsPanel screening={first as never} />);
    fireEvent.click(screen.getByLabelText("7203を選択"));
    expect(screen.getByRole("button", { name: REGISTER_NAME })).toBeEnabled();

    const second = makeScreening({ results: twoItemResults(), resultsGeneration: 1 });
    rerender(<ScreeningResultsPanel screening={second as never} />);

    expect(screen.getByLabelText("7203を選択")).not.toBeChecked();
    expect(screen.getByRole("button", { name: REGISTER_NAME })).toBeDisabled();
  });

  it("marks submitted rows 登録済み and clears the selection", async () => {
    const screening = makeScreening({ results: twoItemResults() });
    render(<ScreeningResultsPanel screening={screening as never} />);

    fireEvent.click(screen.getByLabelText("7203を選択"));
    fireEvent.click(screen.getByRole("button", { name: REGISTER_NAME }));

    await waitFor(() => expect(screen.getByText("登録済み")).toBeInTheDocument());
    expect(screen.getAllByText("登録済み")).toHaveLength(1);
    expect(screen.getByText(SIGNAL_LABELS["rsi"])).toBeInTheDocument();
    expect(screen.getByLabelText("7203を選択")).not.toBeChecked();
    expect(screen.getByRole("button", { name: REGISTER_NAME })).toBeDisabled();
  });

  it("also marks submitted rows 登録済み when they were skipped as duplicates", async () => {
    const register = vi.fn().mockResolvedValue({ registered: ["7203"], skipped_count: 1, failed: [] });
    render(<ScreeningResultsPanel screening={makeScreening({ results: twoItemResults(), register }) as never} />);

    fireEvent.click(screen.getByLabelText("7203を選択"));
    fireEvent.click(screen.getByLabelText("6758を選択"));
    fireEvent.click(screen.getByRole("button", { name: REGISTER_NAME }));

    await waitFor(() => expect(screen.getAllByText("登録済み")).toHaveLength(2));
    expect(register).toHaveBeenCalledWith(["7203", "6758"]);
  });

  it("shows failed codes in an alert and does not mark them 登録済み", async () => {
    const register = vi.fn().mockResolvedValue({ registered: ["7203"], skipped_count: 0, failed: ["6758"] });
    render(<ScreeningResultsPanel screening={makeScreening({ results: twoItemResults(), register }) as never} />);

    fireEvent.click(screen.getByLabelText("7203を選択"));
    fireEvent.click(screen.getByLabelText("6758を選択"));
    fireEvent.click(screen.getByRole("button", { name: REGISTER_NAME }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("登録できなかったコード: 6758");
    expect(screen.getAllByText("登録済み")).toHaveLength(1);
    expect(screen.getByText(SIGNAL_LABELS["rsi"])).toBeInTheDocument();
  });

  it("clears the failed message on the next register attempt", async () => {
    const register = vi
      .fn()
      .mockResolvedValueOnce({ registered: [], skipped_count: 0, failed: ["7203"] })
      .mockResolvedValueOnce({ registered: ["7203"], skipped_count: 0, failed: [] });
    render(<ScreeningResultsPanel screening={makeScreening({ register }) as never} />);

    fireEvent.click(screen.getByLabelText("7203を選択"));
    fireEvent.click(screen.getByRole("button", { name: REGISTER_NAME }));
    await screen.findByRole("alert");

    fireEvent.click(screen.getByLabelText("7203を選択"));
    fireEvent.click(screen.getByRole("button", { name: REGISTER_NAME }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByText("登録済み")).toBeInTheDocument();
  });

  it("keeps the selection when register returns null", async () => {
    const register = vi.fn().mockResolvedValue(null);
    render(<ScreeningResultsPanel screening={makeScreening({ register }) as never} />);

    fireEvent.click(screen.getByLabelText("7203を選択"));
    fireEvent.click(screen.getByRole("button", { name: REGISTER_NAME }));

    await waitFor(() => expect(register).toHaveBeenCalled());
    expect(screen.getByLabelText("7203を選択")).toBeChecked();
    expect(screen.queryByText("登録済み")).not.toBeInTheDocument();
  });

  it("clears the selection when the results' condition_id changes but keeps registered marks", async () => {
    const screening = makeScreening({ results: twoItemResults(1) });
    const { rerender } = render(<ScreeningResultsPanel screening={screening as never} />);

    // 7203 を登録済みにしたうえで、6758 だけ選択した状態を作る
    fireEvent.click(screen.getByLabelText("7203を選択"));
    fireEvent.click(screen.getByRole("button", { name: REGISTER_NAME }));
    await waitFor(() => expect(screen.getByText("登録済み")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("6758を選択"));
    expect(screen.getByRole("button", { name: REGISTER_NAME })).toBeEnabled();

    rerender(
      <ScreeningResultsPanel
        screening={{ ...screening, currentConditionId: 2, results: twoItemResults(2) } as never}
      />
    );

    expect(screen.getByLabelText("6758を選択")).not.toBeChecked();
    expect(screen.getByRole("button", { name: REGISTER_NAME })).toBeDisabled();
    expect(screen.getByText("登録済み")).toBeInTheDocument();
  });
});

function seqNumbers() {
  return Array.from(document.querySelectorAll("td.seq-col")).map((el) => el.textContent);
}

function clickNext(times: number) {
  for (let i = 0; i < times; i++) {
    fireEvent.click(screen.getByRole("button", { name: "次のページ" }));
  }
}

describe("ScreeningResultsPanel pager", () => {
  it("shows just page 1 with prev/next disabled when everything fits on one page", () => {
    render(<ScreeningResultsPanel screening={makeScreening() as never} />);

    expect(pageButtonLabels()).toEqual(["1"]);
    expect(screen.queryByText("…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "前のページ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "次のページ" })).toBeDisabled();
  });

  it("shows 1 … 4 5 6 … 10 for page 5 of 10 (200 rows)", () => {
    render(<ScreeningResultsPanel screening={makeScreening({ results: resultsOf(manyItems(200)) }) as never} />);

    clickNext(4);

    expect(pageButtonLabels()).toEqual(["1", "4", "5", "6", "10"]);
    expect(screen.getAllByText("…")).toHaveLength(2);
    expect(seqNumbers()[0]).toBe("81");
  });

  it("does not put an ellipsis between consecutive page numbers", () => {
    render(<ScreeningResultsPanel screening={makeScreening({ results: resultsOf(manyItems(200)) }) as never} />);

    clickNext(1);

    // 1 2 3 … 10
    expect(pageButtonLabels()).toEqual(["1", "2", "3", "10"]);
    expect(screen.getAllByText("…")).toHaveLength(1);
  });

  it("marks the current page as disabled with aria-current=page", () => {
    render(<ScreeningResultsPanel screening={makeScreening({ results: resultsOf(manyItems(200)) }) as never} />);

    clickNext(4);

    const current = screen.getByRole("button", { name: "5" });
    expect(current).toBeDisabled();
    expect(current).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "4" })).not.toHaveAttribute("aria-current");
  });

  it("prev and next move to page-1 and page+1 (checked by the row numbers)", () => {
    render(<ScreeningResultsPanel screening={makeScreening({ results: resultsOf(manyItems(200)) }) as never} />);

    clickNext(1);
    expect(seqNumbers()[0]).toBe("21");

    fireEvent.click(screen.getByRole("button", { name: "前のページ" }));
    expect(seqNumbers()[0]).toBe("1");

    clickNext(2);
    expect(seqNumbers()[0]).toBe("41");
  });

  it("disables prev on the first page and next on the last page", () => {
    render(<ScreeningResultsPanel screening={makeScreening({ results: resultsOf(manyItems(200)) }) as never} />);
    expect(screen.getByRole("button", { name: "前のページ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "次のページ" })).toBeEnabled();

    clickNext(9);
    expect(screen.getByRole("button", { name: "前のページ" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "次のページ" })).toBeDisabled();
  });
});

describe("ScreeningResultsPanel none handling and paging", () => {
  it("drops the none rows and counts only the rest when signals are selected", () => {
    const items = [...manyItems(3, "up"), ...manyItems(2, "none").map((i, n) => ({ ...i, code: `n${n}` }))];

    render(<ScreeningResultsPanel screening={makeScreening({ results: resultsOf(items) }) as never} />);

    expect(screen.getByText("該当3件")).toBeInTheDocument();
    expect(screen.queryByText("none")).not.toBeInTheDocument();
  });

  it("keeps the none rows and shows none when no signal is selected", () => {
    const items = [...manyItems(2, "up", []), ...manyItems(1, "none", []).map((i) => ({ ...i, code: "n0" }))];

    render(<ScreeningResultsPanel screening={makeScreening({ results: resultsOf(items) }) as never} />);

    expect(screen.getByText("該当3件")).toBeInTheDocument();
    expect(screen.getAllByText("none")).toHaveLength(1);
  });

  it("fills the first page with 20 rows and the second with the rest after dropping none rows", () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      code: String(2000 + i),
      name: `銘柄${i}`,
      price: 100,
      matched_signals: ["ma_trend"],
      type_daily_trend: i % 5 < 2 ? "none" : "up",
    }));

    render(<ScreeningResultsPanel screening={makeScreening({ results: resultsOf(items as never) }) as never} />);

    expect(screen.getByText("該当30件")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox", { name: /を選択$/ })).toHaveLength(20);
    fireEvent.click(screen.getByRole("button", { name: "次のページ" }));
    expect(screen.getAllByRole("checkbox", { name: /を選択$/ })).toHaveLength(10);
  });

  it("shows an empty table with 該当0件 and one page when every row is none", () => {
    render(
      <ScreeningResultsPanel
        screening={makeScreening({ results: resultsOf(manyItems(5, "none")) }) as never}
      />
    );

    expect(screen.getByText("該当0件")).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox", { name: /を選択$/ })).toHaveLength(0);
    expect(screen.getByRole("button", { name: "次のページ" })).toBeDisabled();
  });

  it("returns to the first page when the results are replaced by a new search", () => {
    const first = makeScreening({ results: resultsOf(manyItems(50)) });
    const { rerender } = render(<ScreeningResultsPanel screening={first as never} />);
    fireEvent.click(screen.getByRole("button", { name: "次のページ" }));

    const second = makeScreening({ results: resultsOf(manyItems(50)), resultsGeneration: 1 });
    rerender(<ScreeningResultsPanel screening={second as never} />);

    expect(screen.getByRole("button", { name: "前のページ" })).toBeDisabled();
  });
});

describe("ScreeningResultsPanel errors and notices", () => {
  it("shows resultsError at the top of the results panel with role=alert", () => {
    render(<ScreeningResultsPanel screening={makeScreening({ resultsError: "登録に失敗しました" }) as never} />);

    expect(screen.getByRole("alert")).toHaveTextContent("登録に失敗しました");
    expect(screen.getByText("該当1件")).toBeInTheDocument();
  });

  it("renders only the alert when results is null but resultsError is set", () => {
    const { container } = render(
      <ScreeningResultsPanel
        screening={makeScreening({ results: null, resultsError: "読み込みに失敗しました" }) as never}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("読み込みに失敗しました");
    expect(container.children).toHaveLength(1);
    expect(screen.queryByRole("button", { name: REGISTER_NAME })).not.toBeInTheDocument();
  });

  it("renders nothing when results is null and there is no resultsError", () => {
    const { container } = render(
      <ScreeningResultsPanel screening={makeScreening({ results: null }) as never} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("does not show statusError or conditionError inside the results panel", () => {
    render(
      <ScreeningResultsPanel
        screening={makeScreening({ statusError: "状態エラー", conditionError: "条件エラー" }) as never}
      />
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the empty-results hint when total is 0", () => {
    const results = { condition_id: 1, total: 0, items: [] };
    render(<ScreeningResultsPanel screening={makeScreening({ results }) as never} />);

    const hint = screen.getByText(
      "取得後は保存済み条件の結果が消去されます。「検索」を押すと再計算されます。"
    );
    expect(hint).toHaveClass("screening-status-note");
  });

  it("does not show the empty-results hint when total is greater than 0", () => {
    render(<ScreeningResultsPanel screening={makeScreening() as never} />);

    expect(screen.queryByText(/取得後は保存済み条件の結果が消去されます/)).not.toBeInTheDocument();
  });

  it("shows a neutral skipped-count note after registering, and clears it on the next register", async () => {
    const register = vi
      .fn()
      .mockResolvedValueOnce({ registered: ["7203"], skipped_count: 2, failed: [] })
      .mockResolvedValueOnce({ registered: ["6758"], skipped_count: 0, failed: [] });
    render(<ScreeningResultsPanel screening={makeScreening({ results: twoItemResults(), register }) as never} />);

    fireEvent.click(screen.getByLabelText("7203を選択"));
    fireEvent.click(screen.getByRole("button", { name: REGISTER_NAME }));
    expect(await screen.findByText("既にウォッチリストにある2件はスキップしました")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("6758を選択"));
    fireEvent.click(screen.getByRole("button", { name: REGISTER_NAME }));

    await waitFor(() =>
      expect(screen.queryByText(/既にウォッチリストにある.*スキップしました/)).not.toBeInTheDocument()
    );
  });

  it("does not show a skipped-count note when nothing was skipped", async () => {
    render(<ScreeningResultsPanel screening={makeScreening() as never} />);

    fireEvent.click(screen.getByLabelText("7203を選択"));
    fireEvent.click(screen.getByRole("button", { name: REGISTER_NAME }));

    await waitFor(() => expect(screen.getByText("登録済み")).toBeInTheDocument());
    expect(screen.queryByText(/スキップしました/)).not.toBeInTheDocument();
  });

  it("clears the skipped-count note when the results' condition changes", async () => {
    const register = vi.fn().mockResolvedValue({ registered: [], skipped_count: 1, failed: [] });
    const screening = makeScreening({ results: twoItemResults(1), register });
    const { rerender } = render(<ScreeningResultsPanel screening={screening as never} />);

    fireEvent.click(screen.getByLabelText("7203を選択"));
    fireEvent.click(screen.getByRole("button", { name: REGISTER_NAME }));
    await screen.findByText("既にウォッチリストにある1件はスキップしました");

    rerender(
      <ScreeningResultsPanel
        screening={{ ...screening, currentConditionId: 2, results: twoItemResults(2) } as never}
      />
    );

    await waitFor(() => expect(screen.queryByText(/スキップしました/)).not.toBeInTheDocument());
  });
});

describe("ScreeningResultsPanel trend note", () => {
  it("shows where the trend comes from under the トレンド header", () => {
    render(<ScreeningResultsPanel screening={makeScreening() as never} />);

    const header = screen.getByRole("columnheader", { name: /トレンド/ });
    expect(header).toHaveTextContent(/J-Quants 日足/);
    expect(header).toHaveTextContent(/60営業日/);
  });
});
