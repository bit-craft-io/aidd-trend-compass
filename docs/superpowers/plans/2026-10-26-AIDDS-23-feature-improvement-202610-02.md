# 機能改善_202610_02(container-replace の追加) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Jira: AIDDS-23 機能改善_202610_02

前の計画書: [2026-10-22-AIDDS-23-feature-improvement-202610-02.md](2026-10-22-AIDDS-23-feature-improvement-202610-02.md)(Task 1: AIDDS-22。PR #1 でマージ済み)。計画書は、日付とエピックが同じなら追記し、日付が違えば新しく作る。この計画書は、2026-10-26 付けの分(前の計画書は 10-22 付けで、日付が違うため、新しく作った)。

## 確認してほしい点(最初に読んでください)

実装に入る前に、次の判断を、確認してほしい。私が選んだ既定を書く。変えたい点があれば、教えてほしい。

1. **`--no-deps` は付けない**(実機の結果による変更。2026-10-26)。初めは付ける案だったが、付けずに試したところ、`depends_on` の先は作り直されなかった。ゆえに外した(設計書 11 の追記「--no-deps を外す」)。依頼の意図は「1つのコンテナだけ」。実機で、ほかのコンテナの ID が変わらぬことを確かめる。
2. **`SERVICE` は、コマンドラインだけ受け付ける**(私の判断)。環境変数の `SERVICE` は無視する。`YES` と同じ作り。
3. **`SERVICE` に無い名前**は、検査せず、`docker compose` のエラーに任せる。
4. **`README.md`(未追跡)**: 前の回で更新したまま、未コミット。`container-replace` の行を足し、**別の `docs` コミットに含める**(私の既定。前の回は「コミットせぬ」の指示だった。含めたくなければ、教えてほしい。その場合、コミットから外す)。
5. **設計書 11 に追記済み**(未承認の間に書いた)。この計画書と一緒に見てほしい。
6. **ファイル名の日付は 2026-10-26**。同じエピックの前の計画書は 10-22 付けで、日付が違うため、追記せず、新しく作った。同じ日付なら、追記する定め。

## 実装の順番と理由

Task は1つ(AIDDS-27)なので、順番は無い。手順の順は、次のとおり。

1. 設計書の追記と、この計画書をコミットする(実装と分けるため、先に)
2. `container.mk` に足し、そのあとで、`README.md` を合わせる(内容を見比べるため)
3. 使い捨てのスタックで確かめる(あなたのスタックには触れず、終わりに無事を確かめる)
4. 実装をコミットし、`README.md` を別にコミットする

**Goal:** `make container-replace SERVICE=<サービス名>` で、指定した1つのコンテナだけを、ビルドし直して作り直せるようにする。

**Architecture:** 前の回の `make.d/container.mk` に、目標を1つ足す。`YES` と同じ作りで、`SERVICE` はコマンドラインのみ受け付ける。`docker-compose.yml` は変えない。

**Tech Stack:** GNU Make 4.3、Docker Compose v5.6、bash

**Spec:** [docs/design/11-make-container-commands.md](../../design/11-make-container-commands.md) の末尾の追記「container-replace」(AIDDS-27)

## Global Constraints

- 命令の名前は `container-replace`。変数の名前は `SERVICE`(必須)。
- 実行する命令は `docker compose up -d --build --force-recreate $(SERVICE)`。
- `docker-compose.yml` を変えない。`CLAUDE.md` を変えない。`README.md` は「起動方法」のテーブルに1行足すだけ。
- 既存の `container-up` / `container-down` / `container-destroy` の動きを変えない。
- あなたの稼働中のスタック(`bcaidd-trend-compass`)に、触れない。

## Review Focus

仕様が黙っているが、使う人が当たりそうな条件。それぞれ、Task 1 の手順で確かめる。

1. `SERVICE` を省く。何も実行せず、使い方を出し、終了コードが 0 でないこと。
2. 環境変数に `SERVICE=frontend` があり、コマンドラインに無い。省いたときと同じく、止まること。
3. 無いサービス名(`SERVICE=nothing`)。`docker compose` のエラーが見え、終了コードが 0 でないこと。
4. `SERVICE=frontend` で、`db` と `backend` のコンテナが作り直されないこと(ID と起動時刻が変わらない)。
5. `SERVICE=db` で、DB のデータ(volume)が残ること。

---

### Task 1: コンテナを1つ指定して置き換える命令 container-replace を足す (AIDDS-27)

**Files:**
- Modify: `make.d/container.mk`
- Modify: `README.md`(「起動方法」のテーブルに1行)
- Modify(コミットのみ): `docs/design/11-make-container-commands.md`(追記済み)、本計画書

**Interfaces:**
- Consumes: 前の回の `make.d/container.mk`(`YES` の扱い、`#@vars container-*`、`.PHONY`)
- Produces: 目標 `container-replace`。変数 `SERVICE`(コマンドラインのみ、必須)

- [x] **Step 1: 作業ブランチを切る**

  `git fetch` のあと、`develop` を `origin/develop` に追いつかせ(ファストフォワード。先頭 `08676f8`)、そこから `feature/20261026` を切った。未追跡の `README.md` は、そのまま持ち越した。

- [x] **Step 2: 設計書の追記をコミットする**

  `git add docs/design/11-make-container-commands.md` のみ。メッセージ: `docs(design): container-replace の設計を追記 (AIDDS-27)`

- [x] **Step 3: 計画書をコミットする**

  `git add docs/superpowers/plans/2026-10-26-AIDDS-23-feature-improvement-202610-02.md` のみ。メッセージ: `docs(plan): container-replace の計画書を追加 (AIDDS-27)`

- [x] **Step 4: `make.d/container.mk` に `container-replace` を足す**

  - 先頭の `Usage:` の行に `container-replace SERVICE=<name>` を足す
  - `#@var SERVICE Name of the service to replace (container-replace; required; command line only)` と、`#@example make container-replace SERVICE=frontend` を足す
  - `YES` と同じ書き方で、`ifneq ($(origin SERVICE),command line)` のとき `SERVICE :=` に空にする
  - `.PHONY` に `container-replace` を足す
  - `container-replace: ## Rebuild and recreate one container (SERVICE=<name>; the db data is kept)`: `SERVICE` が空なら、`SERVICE is required. Example: make container-replace SERVICE=frontend` を出して、`exit 1`。あれば `docker compose up -d --build --force-recreate $(SERVICE)`。成功したら `Replaced: $(SERVICE)` を出す

- [x] **Step 5: `README.md` を更新する**

  更新の前に、今の `README.md` を、スクラッチ用のディレクトリへ控える。「起動方法」のテーブルに、`make container-replace SERVICE=<サービス名>`(動き: 指定した1つのコンテナを、ビルドし直して作り直す。DBのデータは残す。実行するコマンド: `docker compose up -d --build --force-recreate <サービス名>`)の行を足す。表の周りに、命令の数を書いた箇所があれば直す。ほかの節は、変えない。`container.mk` の `## 説明` と、見比べて確かめる。

- [x] **Step 6: 使い方の表示を確かめる(あなたのスタックに触れない)**

  Run: `make help`
  Expected: `container-replace` が説明つきで出る。`Variables` に `SERVICE` が出る。`Example:` に `make container-replace SERVICE=frontend` が出る。
  Run: `make -n container-replace SERVICE=frontend`
  Expected: `docker compose up -d --build --force-recreate frontend` が見える(実行はされない)。

- [x] **Step 7: あなたのスタックの控えを取り、使い捨てのスタックを用意する**

  環境変数なしで、あなたのスタックの3つのコンテナの ID と起動時刻(`docker inspect -f '{{.Name}} {{.Id}} {{.State.StartedAt}}'`)を、スクラッチに控える。前の計画書(`2026-10-22-AIDDS-23-feature-improvement-202610-02.md`)の Task 1 Step 8 と同じ、`smoke.override.yml`(ポート 3317 / 8010 / 5183)と、`COMPOSE_PROJECT_NAME=aidds27-smoke` を使う。`make container-up`(環境変数つき)で、3つを起動する。

- [x] **Step 8: `container-replace` を確かめる(Review Focus 1〜5)**

  すべて、環境変数つき。
  - `make container-replace`(`SERVICE` なし)。Expected: 使い方が出て、終了コード 非0。コンテナは、変わらない
  - `SERVICE=frontend make container-replace`(環境変数のみ)。Expected: 同じく止まる
  - `make container-replace SERVICE=nothing`。Expected: `docker compose` のエラー、終了コード 非0
  - 3つの ID・起動時刻を控え、`make container-replace SERVICE=frontend`。Expected: `Replaced: frontend`。`frontend` の ID・起動時刻だけが変わり、`db` と `backend` は変わらない
  - 目印の表を DB に作り、`make container-replace SERVICE=db`。Expected: `db` が作り直され、起動し直しても表の値が残る

- [x] **Step 9: 後片付けと、あなたのスタックの無事の確認**

  `aidds27-smoke` のコンテナ・volume・ネットワークを消す(`make container-destroy YES=1`、環境変数つき)。今回のイメージ(`aidds27-smoke-*`)だけを `docker rmi` で消す。環境変数なしで、Step 7 で控えた ID・起動時刻と同じであることを確かめる。

- [x] **Step 10: 設計書との照合**

  設計書 11 の追記「container-replace」の各項目が、Step 6・8 で確かめられたことを突き合わせる。食い違いがあれば、追記の節の末尾に、節を足す。無ければ、何もしない。

- [x] **Step 11: 実装をコミットする**

  `git add make.d/container.mk` のみ(名指し)。メッセージ: `feat(make): コンテナを1つ指定して置き換える命令を追加 (AIDDS-27)`。

- [x] **Step 12: `README.md` をコミットする**

  確認してほしい点 4 の既定どおり。`git add README.md` のみ。メッセージ: `docs(readme): 起動方法を make の命令に合わせる (AIDDS-27)`。

- [x] **Step 13: 自己レビュー**

  差分(`git diff develop..HEAD --stat` と中身)を見直す。`docker-compose.yml` と `CLAUDE.md` が、変わっていないこと。`README.md` は、「起動方法」と「ディレクトリ構成」以外が、元のままであること。
