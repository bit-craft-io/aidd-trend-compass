import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as trendsApi from "../api/trends";
import * as trendGroupsApi from "../api/trendGroups";
import * as trendPricesApi from "../api/trendPrices";
import { ThemeProvider } from "../theme/ThemeContext";
import { WatchlistPage } from "./WatchlistPage";

vi.mock("../api/trends");
vi.mock("../api/trendGroups");
vi.mock("../api/trendPrices");

const sampleTrend = {
  id: 1,
  code: "7203",
  name: "トヨタ自動車",
  opinion: "初回取得、履歴データ無し",
  price_at_fetch: 2900,
  created_at: "2026-09-17T00:00:00Z",
  trend_group_id: null,
  buy_category: 0,
  buy_price: null,
  buy_quantity: null,
};

// 入力欄は、ラベルにフォーカスして、編集に入ってから触る(クリックでも、Tab でも、同じ)
function openField(label: string): HTMLElement {
  fireEvent.focus(screen.getByLabelText(label));
  return screen.getByLabelText(label);
}

describe("WatchlistPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(trendsApi.fetchTrends).mockResolvedValue([]);
    vi.mocked(trendGroupsApi.fetchTrendGroups).mockResolvedValue([]);
  });

  it("adds a code and shows it in the table", async () => {
    vi.mocked(trendsApi.addTrend).mockResolvedValue(sampleTrend);
    vi.mocked(trendsApi.fetchTrends)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([sampleTrend]);

    render(
      <ThemeProvider>
        <MemoryRouter>
          <WatchlistPage />
        </MemoryRouter>
      </ThemeProvider>
    );

    await waitFor(() =>
      expect(screen.getByText("ウォッチリスト(0件)")).toBeInTheDocument()
    );

    fireEvent.change(screen.getByLabelText("株式コード"), {
      target: { value: "7203" },
    });
    fireEvent.click(screen.getByRole("button", { name: "取得" }));

    await waitFor(() =>
      expect(screen.getByLabelText("7203の会社名")).toHaveTextContent("トヨタ自動車")
    );
    expect(trendsApi.addTrend).toHaveBeenCalledWith("7203");
    expect(screen.getByRole("button", { name: "表示設定を開く" })).toBeInTheDocument();
  });

  it("links to the screening page", async () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <WatchlistPage />
        </MemoryRouter>
      </ThemeProvider>
    );

    await waitFor(() =>
      expect(screen.getByText("ウォッチリスト(0件)")).toBeInTheDocument()
    );

    expect(screen.getByRole("link", { name: "発掘" })).toHaveAttribute("href", "/screening");
  });

  it("shows inline error when adding an invalid code fails", async () => {
    vi.mocked(trendsApi.addTrend).mockRejectedValue(
      new Error("銘柄コード 0000 のデータを取得できませんでした")
    );

    render(
      <ThemeProvider>
        <MemoryRouter>
          <WatchlistPage />
        </MemoryRouter>
      </ThemeProvider>
    );

    await waitFor(() =>
      expect(screen.getByText("ウォッチリスト(0件)")).toBeInTheDocument()
    );

    fireEvent.change(screen.getByLabelText("株式コード"), {
      target: { value: "0000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "取得" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "銘柄コード 0000 のデータを取得できませんでした"
      )
    );
  });

  it("deletes a trend and removes it from the table", async () => {
    vi.mocked(trendsApi.fetchTrends)
      .mockResolvedValueOnce([sampleTrend])
      .mockResolvedValueOnce([]);
    vi.mocked(trendsApi.deleteTrend).mockResolvedValue({ deleted: true });

    render(
      <ThemeProvider>
        <MemoryRouter>
          <WatchlistPage />
        </MemoryRouter>
      </ThemeProvider>
    );

    await waitFor(() =>
      expect(screen.getByLabelText("7203の会社名")).toBeInTheDocument()
    );

    fireEvent.click(
      within(screen.getByRole("table")).getByRole("button", { name: "削除" })
    );

    await waitFor(() =>
      expect(screen.queryByLabelText("7203の会社名")).not.toBeInTheDocument()
    );
    expect(trendsApi.deleteTrend).toHaveBeenCalledWith("7203");
  });

  it("applies the group filter only after clicking the 絞込 button", async () => {
    const grouped = { ...sampleTrend, code: "6758", trend_group_id: 1 };
    vi.mocked(trendsApi.fetchTrends).mockResolvedValue([sampleTrend, grouped]);
    vi.mocked(trendGroupsApi.fetchTrendGroups).mockResolvedValue([{ id: 1, name: "テック株" }]);

    render(
      <ThemeProvider>
        <MemoryRouter>
          <WatchlistPage />
        </MemoryRouter>
      </ThemeProvider>
    );

    await waitFor(() =>
      expect(screen.getByText("ウォッチリスト(2件)")).toBeInTheDocument()
    );

    fireEvent.change(screen.getByLabelText("グループ絞込"), { target: { value: "1" } });
    expect(screen.getByText("ウォッチリスト(2件)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "絞込" }));

    await waitFor(() =>
      expect(screen.getByText("ウォッチリスト(1件)")).toBeInTheDocument()
    );
  });

  it("saves again when a saved group is changed back to the value it had on load", async () => {
    vi.mocked(trendsApi.fetchTrends).mockResolvedValue([{ ...sampleTrend, trend_group_id: 1 }]);
    vi.mocked(trendGroupsApi.fetchTrendGroups).mockResolvedValue([
      { id: 1, name: "テック株" },
      { id: 2, name: "金融株" },
    ]);
    vi.mocked(trendPricesApi.updateTrendPrice).mockImplementation(async (code, position) => ({
      code,
      ...position,
    }));

    render(
      <ThemeProvider>
        <MemoryRouter>
          <WatchlistPage />
        </MemoryRouter>
      </ThemeProvider>
    );
    await screen.findByLabelText("7203のグループ");

    fireEvent.change(openField("7203のグループ"), { target: { value: "2" } });
    await waitFor(() => expect(trendPricesApi.updateTrendPrice).toHaveBeenCalledTimes(1));
    fireEvent.change(openField("7203のグループ"), { target: { value: "1" } });

    await waitFor(() => expect(trendPricesApi.updateTrendPrice).toHaveBeenCalledTimes(2));
    expect(trendPricesApi.updateTrendPrice).toHaveBeenLastCalledWith(
      "7203",
      expect.objectContaining({ trend_group_id: 1 })
    );
  });

  function renderPage() {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <WatchlistPage />
        </MemoryRouter>
      </ThemeProvider>
    );
  }

  it("shows the value before the save again when saving the position fails", async () => {
    vi.mocked(trendsApi.fetchTrends).mockResolvedValue([sampleTrend]);
    vi.mocked(trendPricesApi.updateTrendPrice).mockRejectedValue(new Error("保存に失敗しました"));
    renderPage();
    await screen.findByLabelText("7203の購入金額");

    const input = openField("7203の購入金額");
    fireEvent.change(input, { target: { value: "2900" } });
    fireEvent.blur(input);

    expect(await screen.findByText("保存に失敗しました")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("7203の購入金額")).toHaveTextContent("—"));
  });

  const savedPerspectives = {
    buy: "終値は2900で、上昇の途中と読めます。",
    sell: "終値は2900で、高値圏にあるとも読めます。",
    keep: "終値は2900で、様子を見る見方もあります。",
    created_at: "2026-10-01T16:43:00+09:00",
  };

  it("has an 意見 button on each row and none at the top left, and no panel before it is pressed", async () => {
    const sony = { ...sampleTrend, id: 2, code: "6758", name: "ソニーグループ" };
    vi.mocked(trendsApi.fetchTrends).mockResolvedValue([sampleTrend, sony]);

    renderPage();

    await screen.findByLabelText("7203の会社名");
    expect(screen.getAllByRole("button", { name: "意見" })).toHaveLength(2);
    expect(screen.queryByRole("region", { name: "AIによる3つの目線" })).not.toBeInTheDocument();
    for (const button of screen.getAllByRole("button", { name: "意見" })) {
      expect(button.closest("tr")).not.toBeNull();
    }
  });

  it("opens the panel on the side, hides the minor columns, and closes them again on a second press", async () => {
    vi.mocked(trendsApi.fetchTrends).mockResolvedValue([{ ...sampleTrend, perspectives: savedPerspectives }]);

    renderPage();

    await screen.findByLabelText("7203の会社名");
    const button = screen.getByRole("button", { name: "意見" });
    fireEvent.click(button);

    expect(screen.getByRole("heading", { name: "7203 トヨタ自動車" })).toBeInTheDocument();
    expect(screen.getByText(savedPerspectives.buy)).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("table")).toHaveClass("watchlist-table--folded");
    for (const name of ["グループ", "更新日時", "預かり区分", "購入金額", "購入株数", "損益"]) {
      expect(screen.getByRole("columnheader", { name })).toHaveClass("minor-col");
    }
    expect(trendsApi.createPerspectives).not.toHaveBeenCalled();

    fireEvent.click(button);

    expect(screen.queryByText(savedPerspectives.buy)).not.toBeInTheDocument();
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("table")).not.toHaveClass("watchlist-table--folded");
  });

  it("creates the perspectives once for a row without saved ones and shows them", async () => {
    vi.mocked(trendsApi.fetchTrends).mockResolvedValue([sampleTrend]);
    vi.mocked(trendsApi.createPerspectives).mockResolvedValue(savedPerspectives);

    renderPage();

    await screen.findByLabelText("7203の会社名");
    fireEvent.click(screen.getByRole("button", { name: "意見" }));

    expect(await screen.findByText(savedPerspectives.buy)).toBeInTheDocument();
    expect(trendsApi.createPerspectives).toHaveBeenCalledTimes(1);
    expect(trendsApi.createPerspectives).toHaveBeenCalledWith("7203");
  });

  it("shows the failure message in the panel when the request fails", async () => {
    vi.mocked(trendsApi.fetchTrends).mockResolvedValue([sampleTrend]);
    vi.mocked(trendsApi.createPerspectives).mockRejectedValue(
      new Error("AIの読み方は今のところ取得できていません")
    );

    renderPage();

    await screen.findByLabelText("7203の会社名");
    fireEvent.click(screen.getByRole("button", { name: "意見" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("AIの読み方は今のところ取得できていません");
  });

  it("switches the panel to another row", async () => {
    const sony = { ...sampleTrend, id: 2, code: "6758", name: "ソニーグループ", perspectives: savedPerspectives };
    vi.mocked(trendsApi.fetchTrends).mockResolvedValue([
      { ...sampleTrend, perspectives: savedPerspectives },
      sony,
    ]);

    renderPage();

    await screen.findByLabelText("7203の会社名");
    const buttons = screen.getAllByRole("button", { name: "意見" });
    fireEvent.click(buttons[0]);
    expect(screen.getByRole("heading", { name: "7203 トヨタ自動車" })).toBeInTheDocument();
    fireEvent.click(buttons[1]);

    expect(screen.getByRole("heading", { name: "6758 ソニーグループ" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "7203 トヨタ自動車" })).not.toBeInTheDocument();
    expect(buttons[0]).toHaveAttribute("aria-pressed", "false");
    expect(buttons[1]).toHaveAttribute("aria-pressed", "true");
  });

  it("closes the panel and unfolds the table when the open row is deleted", async () => {
    vi.mocked(trendsApi.fetchTrends)
      .mockResolvedValueOnce([{ ...sampleTrend, perspectives: savedPerspectives }])
      .mockResolvedValue([]);
    vi.mocked(trendsApi.deleteTrend).mockResolvedValue({ deleted: true });

    renderPage();

    await screen.findByLabelText("7203の会社名");
    fireEvent.click(screen.getByRole("button", { name: "意見" }));
    expect(screen.getByText(savedPerspectives.buy)).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: "削除" }));

    await waitFor(() => expect(screen.queryByText(savedPerspectives.buy)).not.toBeInTheDocument());
    expect(screen.getByRole("table")).not.toHaveClass("watchlist-table--folded");
  });
});
