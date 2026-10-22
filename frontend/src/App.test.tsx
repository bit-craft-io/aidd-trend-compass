import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import * as trendsApi from "./api/trends";

vi.mock("./api/trends");
vi.mock("lightweight-charts", () => ({
  createChart: vi.fn(() => ({
    addCandlestickSeries: vi.fn(() => ({ setData: vi.fn() })),
    addLineSeries: vi.fn(() => ({ setData: vi.fn() })),
    remove: vi.fn(),
  })),
}));

describe("App routing", () => {
  it("renders the watchlist page at /", async () => {
    vi.mocked(trendsApi.fetchTrends).mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "トレンド羅針盤" })).toBeInTheDocument();
  });

  it("renders the detail page at /trends/:code", async () => {
    vi.mocked(trendsApi.fetchTrendDetail).mockResolvedValue({
      id: 1,
      code: "7203",
      name: "トヨタ自動車",
      opinion: "初回取得、履歴データ無し",
      trend_group_id: null,
      buy_category: 0,
      buy_price: null,
      buy_quantity: null,
      price_at_fetch: 2900,
      created_at: "2026-09-17T00:00:00Z",
      detail: {},
    });

    render(
      <MemoryRouter initialEntries={["/trends/7203"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "7203 トヨタ自動車" })).toBeInTheDocument();
  });

  it("renders the screening page at /screening", async () => {
    render(
      <MemoryRouter initialEntries={["/screening"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "発掘" })).toBeInTheDocument();
  });
});
