import { describe, expect, it } from "vitest";
import css from "../index.css?raw";

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`rule not found: ${selector}`);
  return match[1];
}

describe("Japanese-style market colors", () => {
  it("colors a profit red and a loss green", () => {
    expect(rule(".pnl-plus")).toContain("var(--up-text)");
    expect(rule(".pnl-minus")).toContain("var(--down-text)");
  });

  it("colors positive news red and negative news green", () => {
    expect(rule(".news-pill-positive")).toContain("var(--up-bg)");
    expect(rule(".news-pill-positive")).toContain("var(--up-text)");
    expect(rule(".news-pill-negative")).toContain("var(--down-bg)");
    expect(rule(".news-pill-negative")).toContain("var(--down-text)");
  });

  it("keeps the delete button and the error text red", () => {
    expect(rule(".btn-danger")).toContain("var(--pill-red-bg)");
    expect(rule(".btn-danger")).toContain("var(--pill-red-text)");
    expect(rule(".inline-error")).toContain("var(--pill-red-text)");
  });

  it("colors an up trend red and a down trend green", () => {
    expect(rule(".trend-up")).toContain("var(--up-text)");
    expect(rule(".trend-down")).toContain("var(--down-text)");
  });

  it("draws up candles red and down candles green in the light theme", () => {
    const light = css.slice(css.indexOf(":root {"), css.indexOf(':root[data-theme="dark"]'));
    expect(light).toContain("--candle-up: #ef5350;");
    expect(light).toContain("--candle-down: #26a69a;");
  });

  it("draws up candles red and down candles green in the dark theme", () => {
    const dark = css.slice(css.indexOf(':root[data-theme="dark"]'));
    expect(dark).toContain("--candle-up: #f87171;");
    expect(dark).toContain("--candle-down: #2dd4bf;");
  });

  it("keeps the MACD line colors as they were", () => {
    const light = css.slice(css.indexOf(":root {"), css.indexOf(':root[data-theme="dark"]'));
    expect(light).toContain("--macd-signal: #ef5350;");
    expect(light).toContain("--macd-histogram: #26a69a;");
  });

  it("keeps the trend column and badge on one line", () => {
    expect(rule(".trend-badge")).toContain("white-space: nowrap");
    expect(rule(".watchlist-table .trend-col")).toContain("white-space: nowrap");
  });

  it("lets the viewing highlight win over the up/down row colors (same specificity, so it must come later)", () => {
    const viewing = css.indexOf("\n.watchlist-table tbody tr.is-viewing {");
    expect(viewing).toBeGreaterThan(css.indexOf("\n.watchlist-table tbody tr.row-trend-up {"));
    expect(viewing).toBeGreaterThan(css.indexOf("\n.watchlist-table tbody tr.row-trend-down {"));
    expect(rule(".watchlist-table tbody tr.is-viewing")).toContain("var(--pill-blue-bg)");
  });
});
