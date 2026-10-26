# トレンド羅針盤

株価の「予測」ではなく、マクロ（業界・市場全体）とミクロ（個別銘柄）を繋ぎ、根拠を示しつつ控えめに「傾向」を提示する補助アプリ。

## 主な機能

- 機能A: 基盤と一覧画面
- 機能B: 詳細画面（履歴・市場分析）
- 機能B拡張: 足種切替とテクニカル指標（RSI / MACD / ボリンジャーバンド）
- 機能C: ニュース・センチメント
- 機能A拡張: ポジション管理とグルーピング
- 発掘: 技術シグナルによる候補銘柄のスクリーニング
- 銘柄名の一元管理（trend_code_name）

詳細な企画背景・画面イメージ・DB設計は `docs/` 配下の設計書を参照。

## 技術スタック

- Backend: FastAPI
- Frontend: React / Vite / TypeScript
- DB: MySQL
- 実行環境: Docker Compose

## 起動方法

プロジェクトルートで `make` の命令を実行する。`make`（引数なし）で、命令の一覧が出る。

| 命令 | 動き | 実行するコマンド |
|---|---|---|
| `make container-up` | db / backend / frontend の3コンテナをビルドして起動する | `docker compose up -d --build` |
| `make container-down` | コンテナを止めて破棄する（DBのデータは残す） | `docker compose down` |
| `make container-destroy` | コンテナを止めて破棄し、DBのデータも消す（確認あり。`YES=1` で確認を省略） | `docker compose down -v` |
| `make container-replace SERVICE=<サービス名>` | 指定した1つのコンテナを、ビルドし直して作り直す（DBのデータは残す。`SERVICE` は必須） | `docker compose up -d --build --force-recreate <サービス名>` |

起動後の接続先:

- DB (MySQL): `localhost:3307`
- Backend (FastAPI): http://localhost:8000 （ヘルスチェック: http://localhost:8000/health）
- Frontend (React/Vite): http://localhost:5173

## テスト

バックエンド（pytest）:

```
cd backend && source .venv/bin/activate && python -m pytest tests/ -v
```

フロントエンド（vitest）:

```
cd frontend && npx vitest run
```

型チェック（TypeScript）:

```
cd frontend && npx tsc --noEmit
```

## ディレクトリ構成

- `backend/` : FastAPI アプリケーション
- `frontend/` : React アプリケーション
- `docs/` : 企画・設計ドキュメント
- `docker-compose.yml` : ローカル環境の定義
- `Makefile` : `make` の命令の入口（`help` と include）
- `make.d/` : `make` の命令の置き場（話題ごとに1ファイル）
- `.env.example` : 環境変数のサンプル
- `CLAUDE.md` : プロジェクト固有の文脈とルール
