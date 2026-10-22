import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WatchlistTable } from "./WatchlistTable";

const trends = [
  {
    id: 1,
    code: "7203",
    name: "",
    opinion: "初回取得、履歴データ無し",
    price_at_fetch: 2900,
    created_at: "2026-09-17T00:00:00Z",
    trend_group_id: null,
    buy_category: 0,
    buy_price: null,
    buy_quantity: null,
    sale_price_target: null,
  },
  {
    id: 2,
    code: "6758",
    name: "ソニーグループ",
    opinion: "横ばい圏、方向感に乏しい",
    price_at_fetch: 3000,
    created_at: "2026-09-17T00:00:00Z",
    trend_group_id: 1,
    buy_category: 1,
    buy_price: 2530,
    buy_quantity: 50,
    sale_price_target: 3300,
  },
];

const groups = [{ id: 1, name: "テック株" }];

// 入力欄は、ラベルにフォーカスして、編集に入ってから触る(クリックでも、Tab でも、同じ)
function openField(label: string): HTMLElement {
  fireEvent.focus(screen.getByLabelText(label));
  return screen.getByLabelText(label);
}

function renderTable(overrides = {}) {
  const props = {
    watchlist: trends,
    groups,
    selectedCodes: new Set<string>(),
    onToggleCode: vi.fn(),
    onToggleAll: vi.fn(),
    onDelete: vi.fn(),
    onSaveName: vi.fn(),
    onSavePosition: vi.fn(),
    openCode: null,
    onToggleOpinion: vi.fn(),
    ...overrides,
  };
  render(
    <MemoryRouter>
      <WatchlistTable {...props} />
    </MemoryRouter>
  );
  return props;
}

describe("WatchlistTable", () => {
  it("adds a トレンド column header and shows each row's daily trend", () => {
    renderTable({
      watchlist: [
        { ...trends[0], type_daily_trend: "up" },
        { ...trends[1], type_daily_trend: "down" },
        { ...trends[1], id: 3, code: "9984", type_daily_trend: "none" },
        { ...trends[1], id: 4, code: "8306", type_daily_trend: null },
      ],
    });

    expect(screen.getByRole("columnheader", { name: /^トレンド/ })).toHaveClass("trend-col");
    const badges = Array.from(document.querySelectorAll(".trend-badge")).map((el) => el.textContent);
    expect(badges).toEqual(["up", "down", "none", "—"]);
  });

  it("colors up rows and down rows, and leaves flat and unknown rows uncolored", () => {
    renderTable({
      watchlist: [
        { ...trends[0], type_daily_trend: "up" },
        { ...trends[1], type_daily_trend: "down" },
        { ...trends[1], id: 3, code: "9984", type_daily_trend: "flat" },
        { ...trends[1], id: 4, code: "8306" },
      ],
    });

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveClass("row-trend-up");
    expect(rows[1]).toHaveClass("row-trend-down");
    expect(rows[2]).not.toHaveClass("row-trend-up");
    expect(rows[2]).not.toHaveClass("row-trend-down");
    expect(rows[3]).not.toHaveClass("row-trend-up");
    expect(rows[3]).not.toHaveClass("row-trend-down");
  });

  it("renders a row per trend with code, price, and opinion", () => {
    renderTable();

    expect(screen.getByText("7203")).toBeInTheDocument();
    expect(screen.getByText("¥2,900")).toBeInTheDocument();
    expect(screen.getByText("初回取得、履歴データ無し")).toBeInTheDocument();
  });

  it("shows name as the company name label, falling back to — and the code as the input placeholder", () => {
    renderTable();

    expect(screen.getByLabelText("6758の会社名")).toHaveTextContent("ソニーグループ");
    expect(screen.getByLabelText("7203の会社名")).toHaveTextContent("—");
    expect(openField("7203の会社名")).toHaveAttribute("placeholder", "7203");
  });

  it("calls onSaveName on blur when the value changed", () => {
    const props = renderTable();

    const input = openField("7203の会社名");
    fireEvent.change(input, { target: { value: "トヨタ" } });
    fireEvent.blur(input);

    expect(props.onSaveName).toHaveBeenCalledWith("7203", "トヨタ");
  });

  it("calls onSaveName when Enter is pressed after the value changed", () => {
    const props = renderTable();

    const input = openField("7203の会社名");
    fireEvent.change(input, { target: { value: "トヨタ" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onSaveName).toHaveBeenCalledWith("7203", "トヨタ");
    expect(props.onSaveName).toHaveBeenCalledTimes(1);
  });

  it("sends the trimmed name when the typed value has surrounding spaces", () => {
    const props = renderTable();

    const input = openField("7203の会社名");
    fireEvent.change(input, { target: { value: "  トヨタ  " } });
    fireEvent.blur(input);

    expect(props.onSaveName).toHaveBeenCalledWith("7203", "トヨタ");
  });

  it("does not call onSaveName on blur when the value is unchanged", () => {
    const props = renderTable();

    const input = openField("6758の会社名");
    fireEvent.blur(input);

    expect(props.onSaveName).not.toHaveBeenCalled();
  });

  it("sends an empty string when the name is cleared", () => {
    const props = renderTable();

    const input = openField("6758の会社名");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(props.onSaveName).toHaveBeenCalledWith("6758", "");
  });

  it("keeps in-progress buy_price text when only the name of the trend changes", () => {
    const props = {
      watchlist: trends,
      groups,
      selectedCodes: new Set<string>(),
      onToggleCode: vi.fn(),
      onToggleAll: vi.fn(),
      onDelete: vi.fn(),
      onSaveName: vi.fn(),
      onSavePosition: vi.fn(),
      openCode: null,
      onToggleOpinion: vi.fn(),
    };
    const { rerender } = render(
      <MemoryRouter>
        <WatchlistTable {...props} />
      </MemoryRouter>
    );
    fireEvent.change(openField("7203の購入金額"), { target: { value: "2950" } });

    const renamed = trends.map((t) => (t.code === "7203" ? { ...t, name: "トヨタ" } : t));
    rerender(
      <MemoryRouter>
        <WatchlistTable {...props} watchlist={renamed} />
      </MemoryRouter>
    );

    expect(screen.getByLabelText("7203の会社名")).toHaveTextContent("トヨタ");
    expect(screen.getByLabelText("7203の購入金額")).toHaveValue("2950");
  });

  it("calls onSavePosition with full position payload when buy_price is edited", () => {
    const props = renderTable();

    const input = openField("7203の購入金額");
    fireEvent.change(input, { target: { value: "2900" } });
    fireEvent.blur(input);

    expect(props.onSavePosition).toHaveBeenCalledWith("7203", {
      trend_group_id: null,
      buy_category: 0,
      buy_price: 2900,
      buy_quantity: null,
      sale_price_target: null,
    });
  });

  it("Enter key on buy_quantity input triggers blur-save", () => {
    const props = renderTable();

    const input = openField("7203の購入株数");
    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onSavePosition).toHaveBeenCalledWith("7203", {
      trend_group_id: null,
      buy_category: 0,
      buy_price: null,
      buy_quantity: 100,
      sale_price_target: null,
    });
  });

  it("computes and displays profit/loss when buy_price and buy_quantity are set", () => {
    renderTable();

    // (3000 - 2530) * 50 = 23500
    expect(screen.getByText("+¥23,500")).toBeInTheDocument();
  });

  it("recomputes profit/loss as soon as the value is confirmed, without waiting for the saved row", () => {
    renderTable();

    const input = openField("6758の購入金額");
    fireEvent.change(input, { target: { value: "2900" } });
    fireEvent.blur(input);

    // (3000 - 2900) * 50 = 5000, updated from the confirmed value (onSavePosition is a mock here)
    expect(screen.getByText("+¥5,000")).toBeInTheDocument();
  });

  it("shows a row-scoped error message when rowErrors has an entry for that code", () => {
    renderTable({ rowErrors: { "6758": "保存に失敗しました" } });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("保存に失敗しました");
    // Only the row for 6758 should show the error, not the row for 7203.
    expect(screen.queryAllByRole("alert")).toHaveLength(1);
  });

  it("falls back to the unselected label when the row's group is not in the active group list", () => {
    const orphaned = [{ ...trends[1], trend_group_id: 999 }];
    renderTable({ watchlist: orphaned });

    expect(screen.getByLabelText("6758のグループ")).toHaveTextContent("未選択");
  });

  it("calls onToggleCode when a row checkbox is clicked", () => {
    const props = renderTable();

    fireEvent.click(screen.getByLabelText("7203を選択"));

    expect(props.onToggleCode).toHaveBeenCalledWith("7203");
  });

  it("calls onToggleAll when header checkbox is clicked", () => {
    const props = renderTable();

    fireEvent.click(screen.getByLabelText("全選択/全解除"));

    expect(props.onToggleAll).toHaveBeenCalled();
  });

  it("calls onDelete with the row's code", () => {
    const props = renderTable();

    fireEvent.click(screen.getAllByRole("button", { name: "削除" })[0]);

    expect(props.onDelete).toHaveBeenCalledWith("7203");
  });

  it("links the detail button to the trend's detail route", () => {
    renderTable();

    expect(screen.getAllByRole("link", { name: "詳細" })[0]).toHaveAttribute(
      "href",
      "/trends/7203"
    );
  });

  it("has 意見 / 詳細 / 削除 in every row under a single 操作 column", () => {
    renderTable();

    expect(screen.getAllByRole("columnheader", { name: "操作" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "意見" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "詳細" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "削除" })).toHaveLength(2);
  });

  it("calls onToggleOpinion with the code of the row", () => {
    const props = renderTable();

    fireEvent.click(screen.getAllByRole("button", { name: "意見" })[1]);

    expect(props.onToggleOpinion).toHaveBeenCalledWith("6758");
  });

  it("marks the open row with aria-pressed and is-viewing, and folds the minor columns", () => {
    renderTable({ openCode: "6758" });

    const buttons = screen.getAllByRole("button", { name: "意見" });
    expect(buttons[0]).toHaveAttribute("aria-pressed", "false");
    expect(buttons[1]).toHaveAttribute("aria-pressed", "true");
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).not.toHaveClass("is-viewing");
    expect(rows[1]).toHaveClass("is-viewing");
    expect(screen.getByRole("table")).toHaveClass("watchlist-table--folded");
  });

  it("marks the seven minor columns, in the header and in every row, so they can be hidden", () => {
    renderTable({ openCode: "7203" });

    const names = ["グループ", "更新日時", "預かり区分", "購入金額", "購入株数", "売価(予)", "損益"];
    for (const name of names) {
      expect(screen.getByRole("columnheader", { name })).toHaveClass("minor-col");
    }
    const headers = screen.getAllByRole("columnheader");
    expect(headers.filter((h) => h.classList.contains("minor-col"))).toHaveLength(7);
    const firstRow = screen.getAllByRole("row")[1];
    expect(firstRow.querySelectorAll("td.minor-col")).toHaveLength(7);
  });

  it("is not folded while nothing is open", () => {
    renderTable();

    expect(screen.getByRole("table")).not.toHaveClass("watchlist-table--folded");
  });

  it("shows a row error under the company name while folded, not in the profit column", () => {
    renderTable({ openCode: "7203", rowErrors: { "7203": "保存に失敗しました" } });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("保存に失敗しました");
    expect(alert.closest("td")).not.toHaveClass("minor-col");
    expect(alert.closest("td")).toContainElement(screen.getByLabelText("7203の会社名"));
  });

  it("shows a row error in the profit column while not folded", () => {
    renderTable({ rowErrors: { "7203": "保存に失敗しました" } });

    expect(screen.getByRole("alert").closest("td")).toHaveClass("minor-col");
  });
});

describe("WatchlistTable trend note", () => {
  it("shows where the trend comes from under the トレンド header", () => {
    renderTable({ openCode: null });

    const header = screen.getByRole("columnheader", { name: /トレンド/ });
    expect(header).toHaveTextContent(/5分足を日足に/);
    expect(header).toHaveTextContent(/更新時の値/);
  });

  it("hides the note while the opinion panel is open and the columns are folded", () => {
    renderTable({ openCode: "7203" });

    const header = screen.getByRole("columnheader", { name: /トレンド/ });
    expect(header).not.toHaveTextContent(/5分足を日足に/);
    expect(header).not.toHaveTextContent(/更新時の値/);
  });
});

describe("WatchlistTable sale price target", () => {
  it("puts the 売価(予) column between 購入株数 and トレンド", () => {
    renderTable();

    const names = screen.getAllByRole("columnheader").map((h) => h.textContent ?? "");
    const quantity = names.findIndex((n) => n === "購入株数");
    const sale = names.findIndex((n) => n === "売価(予)");
    const trend = names.findIndex((n) => n.startsWith("トレンド"));
    expect(sale).toBe(quantity + 1);
    expect(trend).toBe(sale + 1);
  });

  it("shows the saved value in the label, and — when it is not set", () => {
    renderTable();

    expect(screen.getByLabelText("6758の売却価格(予定)")).toHaveTextContent("3300");
    expect(screen.getByLabelText("7203の売却価格(予定)")).toHaveTextContent("—");
  });

  it("calls onSavePosition with the whole position when the value is edited and the input loses focus", () => {
    const props = renderTable();

    const input = openField("7203の売却価格(予定)");
    fireEvent.change(input, { target: { value: "3100" } });
    fireEvent.blur(input);

    expect(props.onSavePosition).toHaveBeenCalledWith("7203", {
      trend_group_id: null,
      buy_category: 0,
      buy_price: null,
      buy_quantity: null,
      sale_price_target: 3100,
    });
  });

  it("saves on the Enter key, the same way as on blur", () => {
    const props = renderTable();

    const input = openField("7203の売却価格(予定)");
    fireEvent.change(input, { target: { value: "3200" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onSavePosition).toHaveBeenCalledWith("7203", {
      trend_group_id: null,
      buy_category: 0,
      buy_price: null,
      buy_quantity: null,
      sale_price_target: 3200,
    });
  });

  it("sends null when the input is cleared, and does not save when the value is unchanged", () => {
    const props = renderTable();

    const unchanged = openField("6758の売却価格(予定)");
    fireEvent.blur(unchanged);
    expect(props.onSavePosition).not.toHaveBeenCalled();

    const reopened = openField("6758の売却価格(予定)");
    fireEvent.change(reopened, { target: { value: "" } });
    fireEvent.blur(reopened);
    expect(props.onSavePosition).toHaveBeenCalledWith("6758", {
      trend_group_id: 1,
      buy_category: 1,
      buy_price: 2530,
      buy_quantity: 50,
      sale_price_target: null,
    });
  });

  it("treats a non-numeric value as not set (null), like the purchase price", () => {
    const props = renderTable();

    const input = openField("7203の売却価格(予定)");
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.blur(input);

    expect(props.onSavePosition).not.toHaveBeenCalled();
  });

  it("keeps the profit and loss unchanged by the sale price target", () => {
    renderTable();

    // (3000 - 2530) * 50 = 23500。売却価格(予定)(3300)は、損益に使わない
    expect(screen.getByText("+¥23,500")).toBeInTheDocument();
  });
});

describe("WatchlistTable group select", () => {
  it("labels the empty option 未選択", () => {
    renderTable();

    const select = openField("7203のグループ");
    expect(within(select).getByRole("option", { name: "未選択" })).toHaveValue("");
    expect(within(select).queryByRole("option", { name: "グループを選択" })).not.toBeInTheDocument();
  });
});

describe("WatchlistTable click-to-edit", () => {
  it("does not call onSavePosition when a field is opened and closed without a change", () => {
    const props = renderTable();

    const input = openField("7203の購入金額");
    fireEvent.blur(input);

    expect(props.onSavePosition).not.toHaveBeenCalled();
  });

  it("lets only half-width digits into the buy price", () => {
    renderTable();

    const input = openField("7203の購入金額");
    fireEvent.change(input, { target: { value: "ab１2.5-3" } });

    expect(input).toHaveValue("253");
  });

  it("shows the unselected group and category as 未選択", () => {
    renderTable();

    expect(screen.getByLabelText("7203のグループ")).toHaveTextContent("未選択");
    expect(screen.getByLabelText("7203の預かり区分")).toHaveTextContent("未選択");
  });
});

