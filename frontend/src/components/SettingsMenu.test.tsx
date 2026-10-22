import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as ThemeContextModule from "../theme/ThemeContext";
import { SettingsMenu } from "./SettingsMenu";

vi.mock("../theme/ThemeContext", async () => {
  const actual = await vi.importActual<typeof import("../theme/ThemeContext")>(
    "../theme/ThemeContext"
  );
  return { ...actual, useTheme: vi.fn() };
});

function mockUseTheme(themeChoice: "light" | "dark" | "system", setThemeChoice = vi.fn()) {
  vi.mocked(ThemeContextModule.useTheme).mockReturnValue({
    themeChoice,
    effectiveTheme: themeChoice === "system" ? "light" : themeChoice,
    setThemeChoice,
  });
  return setThemeChoice;
}

describe("SettingsMenu", () => {
  it("opens the menu when the gear button is clicked", () => {
    mockUseTheme("light");
    render(<SettingsMenu />);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "表示設定を開く" }));

    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("marks the current theme choice as selected", () => {
    mockUseTheme("dark");
    render(<SettingsMenu />);

    fireEvent.click(screen.getByRole("button", { name: "表示設定を開く" }));

    expect(screen.getByRole("menuitemradio", { name: "ダーク" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByRole("menuitemradio", { name: "ライト" })).toHaveAttribute(
      "aria-checked",
      "false"
    );
  });

  it("calls setThemeChoice and closes the menu when an option is picked", () => {
    const setThemeChoice = mockUseTheme("light");
    render(<SettingsMenu />);

    fireEvent.click(screen.getByRole("button", { name: "表示設定を開く" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "システムに合わせる" }));

    expect(setThemeChoice).toHaveBeenCalledWith("system");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the menu when clicking outside of it", () => {
    mockUseTheme("light");
    render(<SettingsMenu />);

    fireEvent.click(screen.getByRole("button", { name: "表示設定を開く" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
