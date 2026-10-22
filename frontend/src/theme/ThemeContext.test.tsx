import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeContext";

function mockMatchMedia(matches: boolean) {
  const listeners: Array<(event: MediaQueryListEvent) => void> = [];
  const mql = {
    matches,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (
      _event: string,
      listener: (event: MediaQueryListEvent) => void
    ) => {
      listeners.push(listener);
    },
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));
  return {
    triggerChange: (next: boolean) => {
      mql.matches = next;
      listeners.forEach((listener) => listener({ matches: next } as MediaQueryListEvent));
    },
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe("ThemeContext", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to system when nothing is stored", () => {
    mockMatchMedia(false);

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.themeChoice).toBe("system");
    expect(result.current.effectiveTheme).toBe("light");
  });

  it("reads a previously stored choice", () => {
    mockMatchMedia(false);
    window.localStorage.setItem("trend-compass-theme", "dark");

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.themeChoice).toBe("dark");
    expect(result.current.effectiveTheme).toBe("dark");
  });

  it("persists the choice and updates the document attribute", () => {
    mockMatchMedia(false);

    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => result.current.setThemeChoice("dark"));

    expect(result.current.effectiveTheme).toBe("dark");
    expect(window.localStorage.getItem("trend-compass-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("follows the OS preference when set to system, including live changes", () => {
    const media = mockMatchMedia(false);

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.effectiveTheme).toBe("light");

    act(() => media.triggerChange(true));

    expect(result.current.effectiveTheme).toBe("dark");
  });

  it("ignores OS preference changes once a concrete theme is chosen", () => {
    const media = mockMatchMedia(false);

    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => result.current.setThemeChoice("light"));
    act(() => media.triggerChange(true));

    expect(result.current.effectiveTheme).toBe("light");
  });
});
