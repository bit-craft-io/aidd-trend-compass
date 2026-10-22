# 表示テーマ設定(ライト/ダーク/システム) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ヘッダー右上の歯車アイコンから、ライト/ダーク/システムに合わせるの3択でテーマを切り替えられるようにする。選択はlocalStorageに永続化し、システム選択時はOSのダークモード設定にリアルタイム追従する。

**Architecture:** CSS変数(`:root`のライトトークン + `:root[data-theme="dark"]`の上書き)でテーマを表現し、`<html>`要素の`data-theme`属性をReact側の`ThemeProvider`が制御する。既存コンポーネントは配色ロジックを持たず、`index.css`のクラス名をそのまま使い続ける。

**Tech Stack:** 既存のReact + Vite + TypeScript(frontend)のみ。backend変更無し。

**Spec:** projects/trend-compass/docs/design/03-theme-settings.md

## Global Constraints

- 承認済みモックアップ(https://claude.ai/artifact/3dy1FRkkUaY1c3WMbsmWwX)の配色・
  トークン名をそのまま採用する
- localStorageキーは`trend-compass-theme`、値は`light`/`dark`/`system`
  (不正・未設定時は`system`が既定)
- `system`選択時は`window.matchMedia("(prefers-color-scheme: dark)")`の
  変更にアプリ起動中もリアルタイム追従する
- backend側の変更は無し
- テーマごとのカスタムカラー編集・複数デバイス間同期は対象外

---

## File Structure

```
frontend/src/
├── index.css                         # 既存の直書き色を全てCSS変数化、ダーク上書き追加
├── App.tsx                           # <ThemeProvider>で<Routes>を包む
├── theme/
│   ├── ThemeContext.tsx              # 新規: ThemeProvider・useTheme
│   └── ThemeContext.test.tsx         # 新規
├── components/
│   ├── SettingsMenu.tsx              # 新規: 歯車+ドロップダウン
│   ├── SettingsMenu.test.tsx         # 新規
│   ├── WatchlistPage.tsx             # ヘッダーに<SettingsMenu />追加
│   ├── WatchlistPage.test.tsx        # ThemeProviderでラップ+歯車存在確認1件追加
│   ├── DetailPage.tsx                # 3つのヘッダー分岐全てに<SettingsMenu />追加
│   └── DetailPage.test.tsx           # ThemeProviderでラップ+歯車存在確認1件追加
└── setupTests.ts                     # matchMediaのグローバルstub追加
```

---

### Task 1: index.css — CSS変数化

**Files:**
- Modify: `frontend/src/index.css`(全体を置き換え)

**Interfaces:**
- Consumes: なし
- Produces: `:root`のライトトークン一式、`:root[data-theme="dark"]`のダーク上書き。
  既存の全クラス(`.app-header`, `.btn-*`, `.watchlist-table`, `.detail-card`等)は
  そのまま変数参照に置き換わる(クラス名・構造は一切変更しない)

- [ ] **Step 1: 現在のファイルを確認**

Run: `cat frontend/src/index.css`(既存の直書き色を把握する)

- [ ] **Step 2: 全体を置き換え**

`frontend/src/index.css`:
```css
* {
  box-sizing: border-box;
}

:root {
  --bg: #f4f5f7;
  --text: #1f2430;
  --text-muted: #55606e;
  --header-bg: #101c3f;
  --header-text: #ffffff;
  --card-bg: #ffffff;
  --card-border: transparent;
  --card-shadow: 0 1px 2px rgba(16, 20, 30, 0.08);
  --row-border: #eef0f3;
  --btn-primary-bg: #e0a83a;
  --btn-primary-text: #1f2430;
  --btn-primary-hover-bg: #d49a26;
  --btn-dark-bg: #101c3f;
  --btn-dark-text: #ffffff;
  --btn-dark-hover-bg: #1c2c58;
  --pill-blue-bg: #e8f0fe;
  --pill-blue-text: #2f5fdb;
  --btn-link-hover-bg: #d9e6fd;
  --pill-red-bg: #fbe7e7;
  --pill-red-text: #cf3d3d;
  --btn-danger-hover-bg: #f7d5d5;
  --input-bg: #ffffff;
  --input-border: #d6d9e0;
  --menu-bg: #ffffff;
  --menu-border: #e5e7eb;
  --menu-selected-bg: #fff4e0;
  --menu-selected-border: #e0a83a;
  --menu-shadow: 0 8px 24px rgba(16, 20, 30, 0.14);
  --accent-green: #34a853;
  --bar-track: #eef0f3;
  --candle-up: #26a69a;
  --candle-down: #ef5350;
  --sma-line: #2f5fdb;
}

:root[data-theme="dark"] {
  --bg: #10131b;
  --text: #e8eaf0;
  --text-muted: #9aa3b2;
  --header-bg: #0a0e1a;
  --header-text: #f2f4f8;
  --card-bg: #1b202b;
  --card-border: #2a3140;
  --card-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  --row-border: #262c39;
  --btn-primary-bg: #e0a83a;
  --btn-primary-text: #1a1406;
  --btn-primary-hover-bg: #ecb955;
  --btn-dark-bg: #2b3a63;
  --btn-dark-text: #ffffff;
  --btn-dark-hover-bg: #35447a;
  --pill-blue-bg: #1e2a4a;
  --pill-blue-text: #8ab4ff;
  --btn-link-hover-bg: #28365e;
  --pill-red-bg: #3a1f22;
  --pill-red-text: #ff8a8a;
  --btn-danger-hover-bg: #4a2a2e;
  --input-bg: #161a24;
  --input-border: #333c4d;
  --menu-bg: #1b202b;
  --menu-border: #2a3140;
  --menu-selected-bg: #23324f;
  --menu-selected-border: #6f9bff;
  --menu-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  --accent-green: #3ddc84;
  --bar-track: #262c39;
  --candle-up: #2dd4bf;
  --candle-down: #f87171;
  --sma-line: #6f9bff;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Kaku Gothic ProN",
    "Yu Gothic", Meiryo, sans-serif;
  background: var(--bg);
  color: var(--text);
}

.app-header {
  background: var(--header-bg);
  color: var(--header-text);
  padding: 20px 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.app-header h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}

.app-body {
  padding: 24px 32px;
}

.controls-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 24px;
}

.watchlist-count {
  margin: 0;
  align-self: center;
  font-weight: 600;
  color: var(--text);
}

.code-input {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.code-input .field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.code-input label,
.interval-select label {
  font-size: 13px;
  color: var(--text-muted);
}

.code-text-input {
  padding: 8px 10px;
  border: 1px solid var(--input-border);
  background: var(--input-bg);
  color: var(--text);
  border-radius: 4px;
  font-size: 14px;
  min-width: 180px;
}

.interval-select {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.interval-dropdown {
  padding: 8px 10px;
  border: 1px solid var(--input-border);
  border-radius: 4px;
  font-size: 14px;
  background: var(--input-bg);
  color: var(--text);
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
}

.btn-primary:hover {
  background: var(--btn-primary-hover-bg);
}

.btn-dark {
  background: var(--btn-dark-bg);
  color: var(--btn-dark-text);
}

.btn-dark:hover {
  background: var(--btn-dark-hover-bg);
}

.btn-link {
  display: inline-block;
  padding: 6px 14px;
  border-radius: 4px;
  background: var(--pill-blue-bg);
  color: var(--pill-blue-text);
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
}

.btn-link:hover {
  background: var(--btn-link-hover-bg);
}

.btn-danger {
  background: var(--pill-red-bg);
  color: var(--pill-red-text);
}

.btn-danger:hover {
  background: var(--btn-danger-hover-bg);
}

.inline-error {
  width: 100%;
  margin: 4px 0 0;
  color: var(--pill-red-text);
  font-size: 13px;
}

.watchlist-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 6px;
  overflow: hidden;
  box-shadow: var(--card-shadow);
}

.watchlist-table th,
.watchlist-table td {
  padding: 14px 16px;
  text-align: left;
  font-size: 14px;
  color: var(--text);
}

.watchlist-table thead th {
  border-bottom: 1px solid var(--row-border);
  color: var(--text);
  font-weight: 600;
}

.watchlist-table tbody tr {
  border-bottom: 1px solid var(--row-border);
}

.watchlist-table tbody tr:last-child {
  border-bottom: none;
}

.watchlist-table .checkbox-col {
  width: 40px;
}

.watchlist-table .actions-col {
  width: 90px;
}

.back-link {
  color: var(--header-text);
  text-decoration: none;
  font-size: 13px;
  display: inline-block;
  margin-bottom: 8px;
}

.back-link:hover {
  text-decoration: underline;
}

.detail-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
  align-items: start;
}

.detail-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 6px;
  padding: 16px 20px;
  box-shadow: var(--card-shadow);
  min-width: 0;
}

.detail-opinion {
  color: var(--text-muted);
  font-size: 14px;
  margin: 4px 0 16px;
}

.detail-stats {
  color: var(--text-muted);
  font-size: 13px;
  margin-top: 8px;
}

.candlestick-chart-container {
  margin-bottom: 8px;
}

.relative-strength-bar {
  height: 8px;
  background: var(--bar-track);
  border-radius: 4px;
  overflow: hidden;
  margin: 4px 0 12px;
}

.relative-strength-bar-fill {
  height: 100%;
  background: var(--accent-green);
}
```

- [ ] **Step 3: フロントエンド全テストを実行して回帰が無いことを確認**

Run: `cd frontend && npx vitest run`
Expected: PASS(既存35件、クラス名は変えていないので全てそのまま通る)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css
git commit -m "$(cat <<'EOF'
refactor(frontend): convert index.css to CSS custom properties with a dark theme block

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: ThemeContext — 状態管理・永続化・システム設定追従

**Files:**
- Modify: `frontend/src/setupTests.ts`(`matchMedia`のグローバルstub追加)
- Create: `frontend/src/theme/ThemeContext.tsx`
- Test: `frontend/src/theme/ThemeContext.test.tsx`

**Interfaces:**
- Consumes: `window.localStorage`, `window.matchMedia`
- Produces: `ThemeChoice`型(`"light" | "dark" | "system"`)、`EffectiveTheme`型
  (`"light" | "dark"`)、`ThemeProvider`コンポーネント、
  `useTheme(): { themeChoice, effectiveTheme, setThemeChoice }`

- [ ] **Step 1: setupTests.tsにmatchMediaのグローバルstubを追加**

`frontend/src/setupTests.ts` を以下に置き換え(既存の`ResizeObserver`stubはそのまま維持し追記):
```typescript
import "@testing-library/jest-dom/vitest";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof globalThis.matchMedia === "undefined") {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
```

- [ ] **Step 2: 失敗するテストを書く**

`frontend/src/theme/ThemeContext.test.tsx`:
```tsx
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
```

- [ ] **Step 3: 実行して失敗を確認**

Run: `cd frontend && npx vitest run src/theme/ThemeContext.test.tsx`
Expected: FAIL(モジュールが存在しない)

- [ ] **Step 4: 実装**

`frontend/src/theme/ThemeContext.tsx`:
```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeChoice = "light" | "dark" | "system";
export type EffectiveTheme = "light" | "dark";

interface ThemeContextValue {
  themeChoice: ThemeChoice;
  effectiveTheme: EffectiveTheme;
  setThemeChoice: (choice: ThemeChoice) => void;
}

const STORAGE_KEY = "trend-compass-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredThemeChoice(): ThemeChoice {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeChoice, setThemeChoiceState] = useState<ThemeChoice>(readStoredThemeChoice);
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(prefersDark);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const effectiveTheme: EffectiveTheme = useMemo(() => {
    if (themeChoice === "system") {
      return systemPrefersDark ? "dark" : "light";
    }
    return themeChoice;
  }, [themeChoice, systemPrefersDark]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", effectiveTheme);
  }, [effectiveTheme]);

  const setThemeChoice = useCallback((choice: ThemeChoice) => {
    setThemeChoiceState(choice);
    window.localStorage.setItem(STORAGE_KEY, choice);
  }, []);

  const value = useMemo(
    () => ({ themeChoice, effectiveTheme, setThemeChoice }),
    [themeChoice, effectiveTheme, setThemeChoice]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
```

- [ ] **Step 5: 実行して成功を確認**

Run: `cd frontend && npx vitest run src/theme/ThemeContext.test.tsx`
Expected: PASS(5件)

- [ ] **Step 6: フロントエンド全テストを実行して回帰が無いことを確認**

Run: `cd frontend && npx vitest run`
Expected: PASS(既存35件+新規5件=40件)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/setupTests.ts frontend/src/theme/ThemeContext.tsx frontend/src/theme/ThemeContext.test.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): add ThemeContext for light/dark/system theme state and persistence

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: SettingsMenu コンポーネント

**Files:**
- Create: `frontend/src/components/SettingsMenu.tsx`
- Test: `frontend/src/components/SettingsMenu.test.tsx`
- Modify: `frontend/src/index.css`(追記)

**Interfaces:**
- Consumes: `theme/ThemeContext`の`useTheme`, `ThemeChoice`
- Produces: `SettingsMenu`コンポーネント(props無し。歯車ボタン
  `aria-label="表示設定を開く"`、開いたパネルは`role="menu"`、各選択肢は
  `role="menuitemradio"` + `aria-checked`)

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/components/SettingsMenu.test.tsx`:
```tsx
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
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `cd frontend && npx vitest run src/components/SettingsMenu.test.tsx`
Expected: FAIL(モジュールが存在しない)

- [ ] **Step 3: 実装**

`frontend/src/components/SettingsMenu.tsx`:
```tsx
import { useState } from "react";
import { useTheme, type ThemeChoice } from "../theme/ThemeContext";

const OPTIONS: { key: ThemeChoice; label: string }[] = [
  { key: "light", label: "ライト" },
  { key: "dark", label: "ダーク" },
  { key: "system", label: "システムに合わせる" },
];

export function SettingsMenu() {
  const { themeChoice, setThemeChoice } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div className="settings-menu">
      <button
        type="button"
        aria-label="表示設定を開く"
        aria-expanded={open}
        className="settings-menu-trigger"
        onClick={() => setOpen((prev) => !prev)}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      </button>
      {open && (
        <div className="settings-menu-panel" role="menu">
          <div className="settings-menu-title">表示設定</div>
          <div className="settings-menu-options">
            {OPTIONS.map((opt) => {
              const selected = themeChoice === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  className={
                    selected
                      ? "settings-menu-option settings-menu-option-selected"
                      : "settings-menu-option"
                  }
                  onClick={() => {
                    setThemeChoice(opt.key);
                    setOpen(false);
                  }}
                >
                  <span className="settings-menu-dot"></span>
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
          <div className="settings-menu-note">選択内容はこのブラウザに保存されます</div>
        </div>
      )}
    </div>
  );
}
```

`frontend/src/index.css` の末尾に追記:
```css
.settings-menu {
  position: relative;
}

.settings-menu-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: transparent;
  color: var(--header-text);
  cursor: pointer;
}

.settings-menu-panel {
  position: absolute;
  top: 44px;
  right: 0;
  width: 248px;
  background: var(--menu-bg);
  border: 1px solid var(--menu-border);
  border-radius: 10px;
  box-shadow: var(--menu-shadow);
  padding: 16px;
  z-index: 10;
}

.settings-menu-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 10px;
}

.settings-menu-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.settings-menu-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  color: var(--text);
  text-align: left;
}

.settings-menu-option-selected {
  background: var(--menu-selected-bg);
}

.settings-menu-dot {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 2px solid var(--input-border);
  box-sizing: border-box;
  display: inline-block;
  position: relative;
}

.settings-menu-option-selected .settings-menu-dot {
  border-color: var(--menu-selected-border);
}

.settings-menu-option-selected .settings-menu-dot::after {
  content: "";
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: var(--menu-selected-border);
}

.settings-menu-note {
  margin-top: 12px;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.5;
}
```

- [ ] **Step 4: 実行して成功を確認**

Run: `cd frontend && npx vitest run src/components/SettingsMenu.test.tsx`
Expected: PASS(3件)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SettingsMenu.tsx frontend/src/components/SettingsMenu.test.tsx frontend/src/index.css
git commit -m "$(cat <<'EOF'
feat(frontend): add SettingsMenu component for theme selection

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: WatchlistPage統合 + App全体をThemeProviderで包む

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/WatchlistPage.tsx`
- Modify: `frontend/src/components/WatchlistPage.test.tsx`

**Interfaces:**
- Consumes: `theme/ThemeContext`の`ThemeProvider`、`components/SettingsMenu`
- Produces: なし(統合のみ)

- [ ] **Step 1: App.tsxをThemeProviderで包む**

`frontend/src/App.tsx`:
```tsx
import { Route, Routes } from "react-router-dom";
import { DetailPage } from "./components/DetailPage";
import { WatchlistPage } from "./components/WatchlistPage";
import { ThemeProvider } from "./theme/ThemeContext";

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/" element={<WatchlistPage />} />
        <Route path="/trends/:code" element={<DetailPage />} />
      </Routes>
    </ThemeProvider>
  );
}
```

(`App.test.tsx`は変更不要。`ThemeProvider`は`App`内部で完結するため、
`<App />`を描画する既存テストは無修正のまま通る)

- [ ] **Step 2: WatchlistPage.tsxのヘッダーにSettingsMenuを追加**

`frontend/src/components/WatchlistPage.tsx` の先頭importに追記:
```tsx
import { SettingsMenu } from "./SettingsMenu";
```

ヘッダー部分を以下に置き換え:
```tsx
      <header className="app-header">
        <h1>株価羅針盤</h1>
        <SettingsMenu />
      </header>
```

- [ ] **Step 3: 失敗するテストを確認(ThemeProvider無しで描画するとuseThemeが例外を投げる)**

Run: `cd frontend && npx vitest run src/components/WatchlistPage.test.tsx`
Expected: FAIL(`useTheme must be used within a ThemeProvider`エラーで3件とも失敗)

- [ ] **Step 4: WatchlistPage.test.tsxを更新**

`frontend/src/components/WatchlistPage.test.tsx` の先頭importに追記:
```tsx
import { ThemeProvider } from "../theme/ThemeContext";
```

3箇所の`render(<MemoryRouter>...`を、それぞれ`<ThemeProvider>`で外側から包む
(中身は変更しない)。例えば1件目:
```tsx
    render(
      <ThemeProvider>
        <MemoryRouter>
          <WatchlistPage />
        </MemoryRouter>
      </ThemeProvider>
    );
```
同様に残り2箇所(`shows inline error...`, `deletes a trend...`)の`render(...)`も
`<ThemeProvider>`で包む。

1件目のテスト(`adds a code and shows it in the table`)の末尾に、歯車ボタンが
存在することの確認を1行追加:
```tsx
    expect(screen.getByRole("button", { name: "表示設定を開く" })).toBeInTheDocument();
```

- [ ] **Step 5: 実行して成功を確認**

Run: `cd frontend && npx vitest run src/components/WatchlistPage.test.tsx`
Expected: PASS(3件)

- [ ] **Step 6: フロントエンド全テストを実行**

Run: `cd frontend && npx vitest run`
Expected: PASS(全件。App.test.tsxも無修正のまま通ることを確認)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/WatchlistPage.tsx frontend/src/components/WatchlistPage.test.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): wrap App in ThemeProvider and add SettingsMenu to the watchlist header

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: DetailPage統合

**Files:**
- Modify: `frontend/src/components/DetailPage.tsx`
- Modify: `frontend/src/components/DetailPage.test.tsx`

**Interfaces:**
- Consumes: `components/SettingsMenu`
- Produces: なし(統合のみ)

- [ ] **Step 1: DetailPage.tsxの3つのヘッダー分岐全てにSettingsMenuを追加**

`frontend/src/components/DetailPage.tsx` の先頭importに追記:
```tsx
import { SettingsMenu } from "./SettingsMenu";
```

エラー分岐のヘッダーを置き換え:
```tsx
      <main>
        <header className="app-header">
          <Link to="/" className="back-link">
            一覧へ戻る
          </Link>
          <SettingsMenu />
        </header>
        <div className="app-body">
          <p role="alert">{error}</p>
        </div>
      </main>
```

読込中分岐のヘッダーを置き換え:
```tsx
      <main>
        <header className="app-header">
          <Link to="/" className="back-link">
            一覧へ戻る
          </Link>
          <SettingsMenu />
        </header>
        <div className="app-body">
          <p>読込中...</p>
        </div>
      </main>
```

通常表示分岐のヘッダーを置き換え(`back-link`と`h1`を1つの`div`でまとめ、
`SettingsMenu`と横並びにする):
```tsx
      <header className="app-header">
        <div>
          <Link to="/" className="back-link">
            一覧へ戻る
          </Link>
          <h1>
            {trend.code} {trend.name}
          </h1>
        </div>
        <SettingsMenu />
      </header>
```

- [ ] **Step 2: 失敗するテストを確認**

Run: `cd frontend && npx vitest run src/components/DetailPage.test.tsx`
Expected: FAIL(`useTheme must be used within a ThemeProvider`エラーで3件とも失敗)

- [ ] **Step 3: DetailPage.test.tsxを更新**

`frontend/src/components/DetailPage.test.tsx` の先頭importに追記:
```tsx
import { ThemeProvider } from "../theme/ThemeContext";
```

`renderAt`ヘルパー関数を以下に置き換え:
```tsx
function renderAt(code: string) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[`/trends/${code}`]}>
        <Routes>
          <Route path="/trends/:code" element={<DetailPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );
}
```

1件目のテスト(`shows the chart and market analysis panel...`)の末尾に、
歯車ボタンが存在することの確認を1行追加:
```tsx
    expect(screen.getByRole("button", { name: "表示設定を開く" })).toBeInTheDocument();
```

- [ ] **Step 4: 実行して成功を確認**

Run: `cd frontend && npx vitest run src/components/DetailPage.test.tsx`
Expected: PASS(3件)

- [ ] **Step 5: フロントエンド全テストとtypecheckを実行**

Run:
```bash
cd frontend && npx vitest run && npx tsc --noEmit
```
Expected: 両方成功

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/DetailPage.tsx frontend/src/components/DetailPage.test.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): add SettingsMenu to all DetailPage header states

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 最終疎通確認

**Files:** なし(検証のみ)

**Interfaces:** なし

- [ ] **Step 1: フロントエンド全テストとtypecheckを実行**

Run:
```bash
cd frontend && npx vitest run && npx tsc --noEmit
```
Expected: 全件成功

- [ ] **Step 2: docker composeで再ビルドし実機で確認**

Run:
```bash
docker compose up -d --build frontend
```
その後ブラウザ(またはPlaywright)で以下を確認:
- 一覧画面・詳細画面それぞれのヘッダー右上に歯車アイコンが表示される
- 歯車を押すとドロップダウンが開き、ライト/ダーク/システムに合わせるの
  3択が表示される
- 「ダーク」を選ぶと画面全体(ヘッダー・カード・テーブル・チャート配色・
  相対強度バー)が承認済みモックアップ通りのダーク配色に切り替わる
- ページを再読み込みしても選択したテーマが維持される(localStorage確認)
- ウィンドウをリサイズしても詳細画面のレイアウトが崩れない
  (機能Bで修正済みの`min-width: 0`が引き続き効いていることの確認)

完了後: `docker compose down`

- [ ] **Step 3: Commit**

このタスクはコード変更を伴わないため、コミットは無し。全て完了していれば
作業終了。

---

## Self-Review Notes

- **Spec coverage:** doc-specのゴール4項目(3択表示・即時切替・永続化・
  システム設定へのリアルタイム追従)は、それぞれTask3、Task1+3、Task2、
  Task2で実装・テスト済み。対象外(カスタムカラー編集・複数デバイス同期)は
  範囲外のまま維持。
- **命名一貫性確認済み:** `ThemeChoice`/`EffectiveTheme`/`useTheme`/
  `ThemeProvider`/`setThemeChoice`は全タスクで一致。CSS変数名は
  doc-specのトークン一覧とモックアップに完全準拠。
- **既存テストへの影響:** `App.test.tsx`は無修正のまま通る設計にした
  (`ThemeProvider`を`App`内部に置くことで、`App`を描画する既存テストが
  自動的にカバーされるため)。`WatchlistPage.test.tsx`/`DetailPage.test.tsx`
  のみ`ThemeProvider`でのラップが必要。
- **doc-specにない実装判断の補足:** ボタンのhover配色(`--btn-primary-hover-bg`等)
  はモックアップが静的画像のため定義されておらず、本プランで各テーマに
  合わせて新規に決定した(doc-specのトークン一覧を補完する形。既存の
  ライト側hover色は元のCSSの値をそのまま流用し、視覚的な差分を出さない
  よう配慮した)。
