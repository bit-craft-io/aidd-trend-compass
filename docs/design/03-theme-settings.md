# doc-spec: 表示テーマ設定(ライト/ダーク/システム)

## 機能概要

一覧画面・詳細画面のヘッダー右上に歯車アイコンを追加し、押すと「ライト/ダーク/シス
テムに合わせる」の3択を表示するドロップダウンを開く。選択内容はブラウザの
localStorageに保存され、次回訪問時も維持される。「システムに合わせる」選択時は
OS側のダークモード設定に追従し、OS側の設定変更もアプリ起動中にリアルタイムで反映
する。

本機能は機能A(基盤+一覧画面)・機能B(履歴/市場分析)のような業務機能ではなく、
両画面共通の表示基盤(UI機構)。承認済みのモックアップ
(Artifact: https://claude.ai/artifact/3dy1FRkkUaY1c3WMbsmWwX)にて、配色・
ドロップダウンの見た目・操作感を確定済み。本doc-specはそれをコードへ落とし込む
ための技術設計を記す。

## 実装背景

ユーザーからの直接要望。既存UIは`frontend/src/index.css`に配色を直書きしており、
ダークテーマ導入にはCSS変数化が前提となる。

## 影響・対象範囲

- 対象: `frontend/src/index.css`(CSS変数化+ダーク配色追加)、新規
  `ThemeContext`(状態管理・永続化・システム設定追従)、新規`SettingsMenu`
  コンポーネント、`WatchlistPage`/`DetailPage`のヘッダーへの組込み、
  `main.tsx`への`ThemeProvider`組込み
- 対象外: backend側の変更は無し(本機能はフロントエンドのみで完結する)

## ゴール

- ヘッダーの歯車アイコンを押すと、ライト/ダーク/システムに合わせるの3択が
  表示され、選択中の項目が視覚的に分かる
- 選択を変えると、画面全体(ヘッダー・カード・テーブル・チャート配色等)が
  即座に切り替わる
- 選択内容はページ再読込・別タブでも維持される(localStorage)
- 「システムに合わせる」選択時、OS側のダークモード設定変更にアプリ起動中も
  追従する

## 対象外

- テーマごとのカスタムカラー編集(ユーザーが独自の配色を作る機能)
- サーバー側でのテーマ設定保存(複数デバイス間の同期は対象外。ローカル
  Docker環境での個人利用という機能Aからの前提を踏襲)

## 解決策・技術アーキテクチャ

### 全体構成

CSS変数(カスタムプロパティ)ベースのテーマ切替。`<html>`要素に
`data-theme="light"` / `data-theme="dark"`属性を設定し、`index.css`側で
`:root`(ライト既定値)と`[data-theme="dark"]`(ダーク上書き)の2ブロックに
トークンを定義する。React側は`ThemeContext`が「どちらの属性値にするか」を
決定し、DOM属性への反映もそこで行う(コンポーネント側は`useTheme()`経由で
現在の選択状態と切替関数を得るのみで、個々のコンポーネントに配色ロジックは
持たせない)。

### CSS変数設計(`index.css`)

既存の直書き色(`#f4f5f7`, `#101c3f`等)を全て変数参照に置き換える。トークン名は
モックアップで使用したものに合わせる: `--bg`, `--header-bg`, `--header-text`,
`--card-bg`, `--card-border`, `--card-shadow`, `--text`, `--text-muted`,
`--row-border`, `--btn-primary-bg`, `--btn-primary-text`, `--btn-dark-bg`,
`--btn-dark-text`, `--pill-blue-bg`, `--pill-blue-text`, `--pill-red-bg`,
`--pill-red-text`, `--input-bg`, `--input-border`, `--menu-bg`,
`--menu-border`, `--menu-selected-bg`, `--menu-selected-border`,
`--menu-shadow`, `--accent-green`, `--bar-track`, `--candle-up`,
`--candle-down`, `--sma-line`, `--up-bg`, `--up-text`, `--down-bg`, `--down-text`,
`--row-up-bg`, `--row-down-bg`, `--macd-signal`, `--macd-histogram`。値はモックアップのライト/ダーク配色をそのまま
採用する。

日本式の配色に合わせ、`--candle-up`(陽線)を赤、`--candle-down`(陰線)を緑に変えた(09参照)。
`--up-*`/`--down-*`は上昇・プラス・ポジティブ(赤)と下落・マイナス・ネガティブ(緑)の
文字・背景、`--row-up-bg`/`--row-down-bg`は一覧の行の色。MACDの線は従来の見た目を保つため、
専用の`--macd-signal`/`--macd-histogram`で持つ。

### `ThemeContext`(新規: `frontend/src/theme/ThemeContext.tsx`)

```typescript
export type ThemeChoice = "light" | "dark" | "system";
export type EffectiveTheme = "light" | "dark";

interface ThemeContextValue {
  themeChoice: ThemeChoice;
  effectiveTheme: EffectiveTheme;
  setThemeChoice: (choice: ThemeChoice) => void;
}
```

- `localStorage`キー: `trend-compass-theme`。値が`light`/`dark`/`system`の
  いずれでもない場合(未設定・壊れた値)は`system`を既定値とする
- `system`選択時、`window.matchMedia("(prefers-color-scheme: dark)")`の
  現在値から`effectiveTheme`を決定し、`change`イベントを購読してOS側の
  変更にリアルタイム追従する(`themeChoice`が`system`以外の間はこの購読は
  `effectiveTheme`に影響しない)
- `effectiveTheme`が変化するたびに`document.documentElement`の
  `data-theme`属性を更新する(`useEffect`)
- `setThemeChoice`は状態更新と同時に`localStorage`へ書き込む

### `SettingsMenu`(新規: `frontend/src/components/SettingsMenu.tsx`)

歯車アイコンボタン+開閉するドロップダウン。`useTheme()`から
`themeChoice`/`setThemeChoice`を取得し、3択(ライト/ダーク/システムに合わせる)
を表示、選択中の項目にモックアップ通りのハイライトを付ける。開閉状態は
コンポーネント内のローカルstateで管理する。

### 組込み

- `main.tsx`: `<ThemeProvider>`で`<App />`全体を包む
- `WatchlistPage.tsx`/`DetailPage.tsx`: 既存の`app-header`内、タイトルの
  右側に`<SettingsMenu />`を配置

### テスト方針

- `ThemeContext`: localStorage未設定時は`system`になること、保存済みの値を
  読み込むこと、`setThemeChoice`で状態更新と保存の両方が行われること、
  `matchMedia`の`change`イベントで`system`選択時の`effectiveTheme`が
  追従すること(いずれも`localStorage`/`matchMedia`をモックして検証)
- `SettingsMenu`: 歯車クリックでメニューが開閉すること、各項目クリックで
  `setThemeChoice`が呼ばれること、選択中の項目が視覚的に区別されること
  (テストではクラス名やaria属性等、テキスト以外の手がかりで検証する)
- `WatchlistPage`/`DetailPage`: 既存テストに`SettingsMenu`が追加されたこと
  による影響が無いことを確認(ヘッダーに歯車ボタンが存在することの確認を
  追加する程度に留める)
