import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as screeningApi from "../api/screening";
import { ThemeProvider } from "../theme/ThemeContext";
import { ScreeningPage } from "./ScreeningPage";

vi.mock("../api/screening");

describe("ScreeningPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(screeningApi.fetchScreeningConditions).mockResolvedValue([]);
  });

  it("shows a heading and a link back to the watchlist", async () => {
    vi.mocked(screeningApi.fetchScreeningStatus).mockResolvedValue({
      api_key_configured: true,
      cooldown_active: false,
      remaining_cooldown_seconds: 0,
      rate_limit_per_64s: 60,
      max_stocks: 1600,
      is_free_mode: false,
    });

    render(
      <ThemeProvider>
        <MemoryRouter>
          <ScreeningPage />
        </MemoryRouter>
      </ThemeProvider>
    );

    expect(screen.getByRole("heading", { name: "発掘" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "一覧へ戻る" })).toHaveAttribute("href", "/");
  });

  it("disables the 取得 button during cooldown", async () => {
    vi.mocked(screeningApi.fetchScreeningStatus).mockResolvedValue({
      api_key_configured: true,
      cooldown_active: true,
      remaining_cooldown_seconds: 3600,
      rate_limit_per_64s: 60,
      max_stocks: 1600,
      is_free_mode: false,
    });

    render(
      <ThemeProvider>
        <MemoryRouter>
          <ScreeningPage />
        </MemoryRouter>
      </ThemeProvider>
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "取得" })).toBeDisabled());
  });

  it("shows the free-mode note when is_free_mode is true", async () => {
    vi.mocked(screeningApi.fetchScreeningStatus).mockResolvedValue({
      api_key_configured: true,
      cooldown_active: false,
      remaining_cooldown_seconds: 0,
      rate_limit_per_64s: 5,
      max_stocks: 10,
      is_free_mode: true,
    });

    render(
      <ThemeProvider>
        <MemoryRouter>
          <ScreeningPage />
        </MemoryRouter>
      </ThemeProvider>
    );

    await waitFor(() =>
      expect(screen.getByText(/稼働モード: Free版/)).toBeInTheDocument()
    );
  });

  const baseStatus = {
    api_key_configured: true,
    cooldown_active: false,
    remaining_cooldown_seconds: 0,
    rate_limit_per_64s: 60,
    max_stocks: 1600,
    is_free_mode: false,
  };

  function renderPage() {
    return render(
      <ThemeProvider>
        <MemoryRouter>
          <ScreeningPage />
        </MemoryRouter>
      </ThemeProvider>
    );
  }

  it("shows 未実行 when last_run_at is null", async () => {
    vi.mocked(screeningApi.fetchScreeningStatus).mockResolvedValue({ ...baseStatus, last_run_at: null });

    renderPage();

    expect(await screen.findByText(/最終発掘: 未実行/)).toBeInTheDocument();
  });

  it("shows 未実行 when last_run_at is absent", async () => {
    vi.mocked(screeningApi.fetchScreeningStatus).mockResolvedValue(baseStatus);

    renderPage();

    expect(await screen.findByText(/最終発掘: 未実行/)).toBeInTheDocument();
  });

  it("shows last_run_at as-is because the server already stores JST", async () => {
    vi.mocked(screeningApi.fetchScreeningStatus).mockResolvedValue({
      ...baseStatus,
      last_run_at: "2026-09-30T10:12:38.123456",
    });

    renderPage();

    expect(await screen.findByText(/最終発掘: 2026\/9\/30 10:12:38/)).toBeInTheDocument();
  });

  it("shows a status-load failure inside the status card, not in other areas", async () => {
    vi.mocked(screeningApi.fetchScreeningStatus).mockRejectedValue(new Error("状態の取得に失敗"));

    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("状態の取得に失敗");
    expect(alert.closest(".detail-card")).toBe(screen.getByText("取得").closest(".detail-card"));
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("shows a search failure in the condition panel only", async () => {
    vi.mocked(screeningApi.fetchScreeningStatus).mockResolvedValue(baseStatus);
    vi.mocked(screeningApi.runScreeningSearch).mockRejectedValue(new Error("検索に失敗"));

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "検索" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("検索に失敗");
    expect(alert.closest(".detail-card")).toBe(screen.getByRole("button", { name: "検索" }).closest(".detail-card"));
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("shows a results-load failure after a successful search in the results area", async () => {
    vi.mocked(screeningApi.fetchScreeningStatus).mockResolvedValue(baseStatus);
    vi.mocked(screeningApi.runScreeningSearch).mockResolvedValue({
      condition_id: 1,
      condition_name: "x",
      matched_count: 0,
    });
    vi.mocked(screeningApi.fetchScreeningResults).mockRejectedValue(new Error("結果の読み込みに失敗"));

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "検索" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("結果の読み込みに失敗");
    expect(alert.closest(".detail-card")).toBeNull();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});
