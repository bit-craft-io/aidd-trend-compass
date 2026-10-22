import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScreeningConditionPanel } from "./ScreeningConditionPanel";

function makeScreening(overrides = {}) {
  return {
    status: null,
    conditions: [{ id: 1, name: "出来高重視セット", enabled_signals: ["volume_surge"] }],
    enabledSignals: [] as string[],
    setEnabledSignals: vi.fn(),
    currentConditionId: null,
    results: null,
    loadingResults: false,
    statusError: null,
    conditionError: null,
    resultsError: null,
    runScan: vi.fn(),
    runSearch: vi.fn(),
    applyCondition: vi.fn(),
    renameCondition: vi.fn(),
    deleteCondition: vi.fn(),
    register: vi.fn(),
    ...overrides,
  };
}

describe("ScreeningConditionPanel", () => {
  it("is collapsed by default (checkbox grid not shown)", () => {
    render(<ScreeningConditionPanel screening={makeScreening() as never} />);

    expect(screen.queryByLabelText("移動平均トレンド")).not.toBeInTheDocument();
  });

  it("expands the checkbox grid when the toggle is clicked", () => {
    render(<ScreeningConditionPanel screening={makeScreening() as never} />);

    fireEvent.click(screen.getByRole("button", { name: /開.く/ }));

    expect(screen.getByLabelText("移動平均トレンド")).toBeInTheDocument();
  });

  it("toggling a checkbox calls setEnabledSignals", () => {
    const screening = makeScreening();
    render(<ScreeningConditionPanel screening={screening as never} />);
    fireEvent.click(screen.getByRole("button", { name: /開.く/ }));

    fireEvent.click(screen.getByLabelText("移動平均トレンド"));

    expect(screening.setEnabledSignals).toHaveBeenCalledWith(["ma_trend"]);
  });

  it("clicking 検索 calls runSearch", () => {
    const screening = makeScreening();
    render(<ScreeningConditionPanel screening={screening as never} />);

    fireEvent.click(screen.getByRole("button", { name: "検索" }));

    expect(screening.runSearch).toHaveBeenCalled();
  });

  it("has no 適用 button; choosing a saved condition applies it immediately", () => {
    const screening = makeScreening();
    render(<ScreeningConditionPanel screening={screening as never} />);
    expect(screen.queryByRole("button", { name: "適用" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("保存済み条件を選択"), { target: { value: "1" } });

    expect(screening.applyCondition).toHaveBeenCalledTimes(1);
    expect(screening.applyCondition).toHaveBeenCalledWith({
      id: 1,
      name: "出来高重視セット",
      enabled_signals: ["volume_surge"],
    });
    expect((screen.getByLabelText("保存済み条件を選択") as HTMLSelectElement).value).toBe("1");
  });

  it("choosing the placeholder clears the selection without calling applyCondition", () => {
    const screening = makeScreening();
    render(<ScreeningConditionPanel screening={screening as never} />);
    fireEvent.change(screen.getByLabelText("保存済み条件を選択"), { target: { value: "1" } });
    screening.applyCondition.mockClear();

    fireEvent.change(screen.getByLabelText("保存済み条件を選択"), { target: { value: "" } });

    expect((screen.getByLabelText("保存済み条件を選択") as HTMLSelectElement).value).toBe("");
    expect(screening.applyCondition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    expect(screening.deleteCondition).not.toHaveBeenCalled();
  });

  it("toggle reads 開　く (full-width space) when collapsed and 閉じる when expanded, without arrows", () => {
    render(<ScreeningConditionPanel screening={makeScreening() as never} />);

    const toggle = screen.getByRole("button", { name: "開\u3000く" });
    // toHaveTextContentは空白を正規化するため、textContentで全角スペースそのものを検証する。
    expect(toggle.textContent).toBe("開\u3000く");
    expect(toggle.textContent).not.toMatch(/[▼▲]/);

    fireEvent.click(toggle);

    const closeToggle = screen.getByRole("button", { name: "閉じる" });
    expect(closeToggle.textContent).toBe("閉じる");
  });

  it("shows conditionError under the panel with role=alert", () => {
    render(
      <ScreeningConditionPanel
        screening={makeScreening({ conditionError: "検索に失敗しました" }) as never}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("検索に失敗しました");
  });

  it("does not show statusError or resultsError inside the condition panel", () => {
    render(
      <ScreeningConditionPanel
        screening={makeScreening({ statusError: "状態エラー", resultsError: "結果エラー" }) as never}
      />
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clicking 編集 switches the select to a text input, and blur renames", () => {
    const screening = makeScreening();
    render(<ScreeningConditionPanel screening={screening as never} />);
    fireEvent.change(screen.getByLabelText("保存済み条件を選択"), { target: { value: "1" } });

    fireEvent.click(screen.getByRole("button", { name: "編集" }));
    const input = screen.getByDisplayValue("出来高重視セット");
    fireEvent.change(input, { target: { value: "新しい名前" } });
    fireEvent.blur(input);

    expect(screening.renameCondition).toHaveBeenCalledWith(1, "新しい名前");
  });

  it("clicking 削除 calls deleteCondition for the selected condition", () => {
    const screening = makeScreening();
    render(<ScreeningConditionPanel screening={screening as never} />);
    fireEvent.change(screen.getByLabelText("保存済み条件を選択"), { target: { value: "1" } });

    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    expect(screening.deleteCondition).toHaveBeenCalledWith(1);
  });

  it("select value follows the conditions list when the selected condition vanishes", () => {
    const screening = makeScreening();
    const { rerender } = render(<ScreeningConditionPanel screening={screening as never} />);
    const select = screen.getByLabelText("保存済み条件を選択") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "1" } });
    expect(select.value).toBe("1");

    rerender(
      <ScreeningConditionPanel screening={{ ...screening, conditions: [] } as never} />,
    );

    expect((screen.getByLabelText("保存済み条件を選択") as HTMLSelectElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    expect(screening.deleteCondition).not.toHaveBeenCalled();
  });

  function startEditing(screening: ReturnType<typeof makeScreening>) {
    render(<ScreeningConditionPanel screening={screening as never} />);
    fireEvent.change(screen.getByLabelText("保存済み条件を選択"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "編集" }));
    return screen.getByDisplayValue("出来高重視セット");
  }

  it("does not rename when the draft is empty or whitespace", () => {
    const screening = makeScreening();
    const input = startEditing(screening);

    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);

    expect(screening.renameCondition).not.toHaveBeenCalled();
    expect(screen.getByLabelText("保存済み条件を選択")).toBeInTheDocument();
  });

  it("does not rename when the draft is longer than 100 characters", () => {
    const screening = makeScreening();
    const input = startEditing(screening);

    fireEvent.change(input, { target: { value: "あ".repeat(101) } });
    fireEvent.blur(input);

    expect(screening.renameCondition).not.toHaveBeenCalled();
  });

  it("does not rename when the trimmed draft equals the current name", () => {
    const screening = makeScreening();
    const input = startEditing(screening);

    fireEvent.change(input, { target: { value: "  出来高重視セット  " } });
    fireEvent.blur(input);

    expect(screening.renameCondition).not.toHaveBeenCalled();
  });

  it("renames with the trimmed draft", () => {
    const screening = makeScreening();
    const input = startEditing(screening);

    fireEvent.change(input, { target: { value: "  新しい名前  " } });
    fireEvent.blur(input);

    expect(screening.renameCondition).toHaveBeenCalledWith(1, "新しい名前");
  });

  it("pressing Enter in the rename input commits exactly once", () => {
    const screening = makeScreening();
    const input = startEditing(screening);
    input.focus();

    fireEvent.change(input, { target: { value: "新しい名前" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screening.renameCondition).toHaveBeenCalledTimes(1);
    expect(screening.renameCondition).toHaveBeenCalledWith(1, "新しい名前");
  });
});
