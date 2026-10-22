# CLAUDE.md

このファイルは、このプロジェクト固有の文脈を記す。

## ルール

- ひな形から引き継いだ絶対ルール(ドキュメント運用・ブランチ運用): `.claude/rules/base-rules.md`(追記しない)
- ひな形から引き継いだ、話題ごとの運用の規則: `.claude/rules/jira.md`(Jira)、`.claude/rules/git.md`(git)、`.claude/rules/design-addenda.md`(設計書の追記)
- 判断の記録(ADR): `.claude/rules/adr.md`。判断が分かれる点で、ユーザーが決めたら、その直後に、ADR の下書きを出す(黙って、省かない)
- 過去の判断の引き当て(RAG)の規則: `.claude/rules/rag.md`
- このプロジェクト独自のルール: `.claude/rules/` に別ファイルを追加して書く
- どの時点のひな形からコピーしたかは、`.claude/TEMPLATE_VERSION` に記す(コピー時に書く。ひな形の README 参照)

## 前提のプラグイン

このプロジェクトは、Claude Code のプラグイン `superpowers`(brainstorming・writing-plans・subagent-driven-development など)と
`skill-creator` を前提にする。未導入だと、`/superpowers:brainstorming` や、`superpowers:*` を使う手順
(`.claude/skills/jira-exec` など)が動かない。未導入のときは、次を実行する:

```
claude plugin install   superpowers@claude-plugins-official --scope user
claude plugin install skill-creator@claude-plugins-official --scope user
```

`adr`・`genshijin` の導入は、ひな形(aidd-template-claude)の README の「セットアップ」を参照。導入状況は、`/plugin list` で確認できる。

## プロジェクト概要

アプリ名: トレンド羅針盤

株価の「予測」ではなく、マクロ(業界・市場全体)とミクロ(個別銘柄)を繋ぎ、過去データ・
ニュース・市場分析に基づく「傾向」を、根拠を示しつつ控えめに提示する補助アプリ。
断定調(「上がります」等)を避け、「数字を先に示し、控えめな言葉を添える」型の文言を
徹底する。ローカルDocker環境で完結させる想定で、多数への公開は想定しない。

詳細な企画背景・画面イメージ・DB設計の叩き台は `docs/brainstorming-intake.md` を参照。

### 機能への分割

1つの `trend` テーブル(現在値と履歴を1本で兼ねるソフトデリート設計)を軸に、
以下3機能へ分割して実装する。機能A完成時点で「価格+所見のみのMVP」が動く。

- **機能A: 基盤+一覧画面** — Docker/DB/API/React土台、`trend`テーブルの取得・更新・
  ソフトデリート、一覧画面(取得・ウォッチリスト・チェックボックス・更新間隔・削除)。
  doc-spec: [docs/design/01-watchlist-foundation.md](docs/design/01-watchlist-foundation.md)
- **機能B: 詳細画面-履歴/市場分析** — ローソク足チャート・移動平均・出来高、業種指数
  比較、マクロ指標相関。doc-spec: [docs/design/02-history-market-analysis.md](docs/design/02-history-market-analysis.md)
- **機能B拡張: 足種切替+テクニカル指標選択式追加** — 足種(5分/10分/15分/日足/週足/月足)
  切替、テクニカル指標(RSI/MACD/ボリンジャーバンド)の選択式追加表示。機能Bの直接の
  延長。doc-spec: [docs/design/04-multi-timeframe-indicators.md](docs/design/04-multi-timeframe-indicators.md)
- **機能C: 詳細画面-ニュース/センチメント** — ニュース取得+Claude APIによるセンチメント
  判定。doc-spec: [docs/design/05-news-sentiment.md](docs/design/05-news-sentiment.md)
- **機能A拡張: ポジション管理+グルーピング** — 一覧画面へ購入金額・購入株数・
  預かり区分・損益、会社名ニックネーム表示、グループ作成/選択/絞込を追加。
  `trend_price`/`trend_group`テーブルを新設。機能Aの直接の延長。
  doc-spec: [docs/design/06-position-grouping.md](docs/design/06-position-grouping.md)
- **発掘(新規機能)** — J-Quants API(V2、日足)を使い、東証プライム銘柄から複数の
  技術シグナルで候補を絞り込み、既存ウォッチリストへ登録する機能。既存のyfinance
  ベース機能(A/B/C)とはデータソース・モジュールとも完全分離するハイブリッド構成。
  `trend_candidate`/`trend_candidate_condition`/`trend_candidate_result`/
  `trend_system`テーブルを新設。doc-spec: [docs/design/07-screening.md](docs/design/07-screening.md)
- **銘柄名の一元管理(trend_code_name)** — コード→名前の情報を`trend_code_name`テーブルへ
  集約し、`trend.name`/`trend.nick_name`/`trend_candidate.name`を廃止する。銘柄取得・
  発掘スキャンは未設定時のみ自動で名前を埋め、一覧画面の入力欄で手入力できる。
  doc-spec: [docs/design/08-trend-code-name.md](docs/design/08-trend-code-name.md)

## ビルド・テスト・起動

### 起動

プロジェクトルートで以下を実行し、`db`/`backend`/`frontend`
の3コンテナをビルドして起動する。

```
docker compose up -d --build
```

- DB(MySQL): ホスト側は `localhost:3307`(コンテナ内部は3306のまま)。同一ホスト上の
  既存の別コンテナが3306を占有していたため、ホスト側マッピングのみ3307に変更している
  (`docker-compose.yml`の`db`サービス参照)。
- backend(FastAPI): `http://localhost:8000`。ヘルスチェックは `http://localhost:8000/health`。
- frontend(React/Vite): `http://localhost:5173`。

### テスト

バックエンド(pytest、`backend/.venv`の仮想環境を使用):

```
cd backend && source .venv/bin/activate && python -m pytest tests/ -v
```

フロントエンド(vitest):

```
cd frontend && npx vitest run
```

型チェック(TypeScript、`tsc --noEmit`。`npm run typecheck`でも同義):

```
cd frontend && npx tsc --noEmit
```

### 実機スモークテスト(mainへのマージ前必須)

pytest/vitestはSQLite・モック環境で動くため、以下のような「ユニットテストは
通るが実機でしか顕在化しない」不具合を検知できない:

- MySQL固有の挙動(例: 大きなJSON列を含む行でのORDER BYが
  `Out of sort memory`を起こす。SQLiteでは再現しない)
- 複数コンポーネント間のstate同期漏れ(例: 選択中の項目が外部要因で
  リストから消えた際、selectの表示と内部stateが乖離する)
- レイアウト崩れ(flexboxの入れ子構造による意図しないズレ等)

実装完了・mainへのマージ前には、`docker compose up -d --build`で
実機(ブラウザ)を必ず一通り操作して確認する。最低限の導線:

- 銘柄取得(新規コード/既存コードの再取得)
- グループ作成→銘柄への紐付け→絞込→対象グループの削除→絞込を
  「すべて」に戻す、の一連
- 購入金額・購入株数・預かり区分・会社名ニックネームの入力・保存
  (blur確定、Enter確定の両方)
- 一覧から詳細画面への遷移
- ダークテーマ/ライトテーマ切替
- 名前の一元管理: 銘柄取得→名前の自動入力→一覧で名前を手入力→発掘スキャン後も
  手入力の名前が維持される(DBは`docker compose down -v`で作り直してから確認する)

## アーキテクチャ

### 全体構成

Docker Compose で3コンテナ構成: `frontend`(React/Vite)、`backend`(FastAPI)、
`db`(MySQL)。フロントはバックエンドのREST APIのみを叩き、yfinance呼出・
テクニカル指標計算(pandas-ta)・センチメント判定(Claude API)は全てbackend側に
集約する(言語跨ぎの問題を回避)。

### 認証

無し。ローカルDocker環境で個人利用のみを想定するため。

### 詳細

各機能の詳細アーキテクチャは、上記「機能への分割」内の doc-spec 各ファイルを参照。

### 横断的UI基盤

業務機能A/B/Cとは別軸で、両画面共通の表示テーマ切替(ライト/ダーク/システムに
合わせる)を実装する。doc-spec: [docs/design/03-theme-settings.md](docs/design/03-theme-settings.md)

## .claude配下の役割

| ディレクトリ/ファイル | 役割 |
|---|---|
| `.claude/skills/` | 再利用可能な技(SKILL.md)。個人・プロジェクト固有の作業手順 |
| `.claude/rules/` | Markdown形式の規約。ファイルパスに応じ条件付きで読み込み可 |
| `.claude/agents/` | 独立した文脈窓を持つ専用subagentの定義 |
| `.claude/agent-memory/` | `memory: project`指定のsubagentが持つ永続記憶 |
| `.claude/output-styles/` | Claudeの応答スタイル(人格)を切り替える定義 |
| `.claude/workflows/` | 複数subagentを組み合わせて動かす、JavaScript製の動的ワークフロー |
| `.claude/hooks/` | Hook用スクリプトの置き場(`settings.json`から参照。フォルダ自体は公式仕様ではなく慣例) |
| `.claude/settings.json` | チーム共有設定(git管理対象) |
| `.claude/settings.local.json` | 個人設定(gitignore対象、自動生成) |

## Git管理

このひな形をコピーして作ったプロジェクトは、それぞれ独立した git リポジトリとして管理する。
コピー後は、コピー元の `.git` を引き継がず、`git init` し直す。
