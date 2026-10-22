import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartControls } from "./ChartControls";
import { ChartSettingsProvider } from "../chartSettings/ChartSettingsContext";

function renderWithProvider() {
  return render(
    <ChartSettingsProvider>
      <ChartControls />
    </ChartSettingsProvider>
  );
}

describe("ChartControls", () => {
  it("renders a tab for each interval and a checkbox for each indicator", () => {
    renderWithProvider();

    expect(screen.getByRole("button", { name: "5分" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "日足" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "RSI" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "MACD" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "ボリンジャーバンド" })).toBeInTheDocument();
  });

  it("marks the current interval tab as selected", () => {
    renderWithProvider();

    expect(screen.getByRole("button", { name: "日足" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "5分" })).toHaveAttribute("aria-pressed", "false");
  });

  it("switches interval on tab click", () => {
    renderWithProvider();

    fireEvent.click(screen.getByRole("button", { name: "週足" }));

    expect(screen.getByRole("button", { name: "週足" })).toHaveAttribute("aria-pressed", "true");
  });

  it("toggles an indicator checkbox on click", () => {
    renderWithProvider();

    const rsiCheckbox = screen.getByRole("checkbox", { name: "RSI" });
    expect(rsiCheckbox).not.toBeChecked();

    fireEvent.click(rsiCheckbox);

    expect(rsiCheckbox).toBeChecked();
  });
});
