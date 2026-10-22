# 機能改善_202610_02(make.d の導入) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Jira: AIDDS-23 機能改善_202610_02

## 確認してほしい点(最初に読んでください)

実装に入る前に、次の判断を、確認してほしい。私が選んだ既定を書く。変えたい点があれば、教えてほしい。

1. **タスクは1つ(AIDDS-22)なので、Task も1つ**。ファイルは `Makefile` と `make.d/container.mk` の2つだけで、分けても、別々にレビューする意味が無い。
2. **`YES` は、コマンドラインで渡されたときだけ受け付ける**(私の判断)。雛形の `NAME` と同じ作り。環境変数に `YES` が残っていると、`container-destroy` が、確認なしで DB のデータを消すのを避ける。設計書 11 に反映済み(未承認の間に直した)。`rag.mk` は、この守りが無い。
3. **実機の確認は、別のプロジェクト名とポートの、使い捨てのスタックで行う**。いま、あなたのスタック(`bcaidd-trend-compass`、DB 3307 / backend 8000 / frontend 5173)が動いていて、実データがある。素のまま `container-destroy` を試すと、そのデータが消える。`COMPOSE_PROJECT_NAME=aidds22-smoke` と、ポートを変える上書きの設定ファイル(スクラッチ用のディレクトリに置き、リポジトリには入れない)で、あなたのスタックには触れずに確かめる。
4. **`container-up` の終わりに出す URL は、固定の値(5173 / 8000 / 3307)**。設計書の決定どおり。使い捨てのスタックで試すときは、実際のポートと食い違って出るが、機能の不具合ではない。
5. **コミットは3つに分ける**: 設計書、計画書、実装(`git.md`: 設計書・計画書の変更は、実装のコミットと分ける)。設計書と計画書は、この計画書の了承のあと、最初に、作業ブランチへコミットする。
6. **`README.md`(未追跡)は、`Makefile` の内容に合わせて更新する**(あなたの指示)。ただし、**コミットは、先の指示(「コミットせぬ」)どおり、しない**。コミットに含めたいときは、教えてほしい(含めるなら、実装のコミットとは別の `docs` のコミットにする)。`git add` は、ファイルを名指しして行う。
7. **作業ブランチ**: `origin/develop` から、ローカルの `develop` を作り、そこから `feature/20261022` を切る。`main` へは、コミットしない。
8. **`CLAUDE.md` は変えない**(あなたの指示)。「機能への分割」への設計書 11 のリンクも、足さない(09・10 も、足していない先例)。

## 実装の順番と理由

Task は1つなので、順番は無い。手順の順は、次のとおり。

1. ブランチを切り、設計書・計画書をコミットする(実装と分けるため、先に)
2. `Makefile` と `container.mk` を作り、そのあとで、`README.md` を合わせる(内容を見比べるため)
3. 使い捨てのスタックで、4つの命令を確かめる
4. 実装をコミットする

**Goal:** `make container-up` / `container-down` / `container-destroy` で、コンテナの起動と破棄を行えるようにする。

**Architecture:** 雛形(`bc.aidd-template-claude`)の作りに倣い、`Makefile` には `help` と include だけを置き、命令は `make.d/container.mk` に書く。`docker-compose.yml` は変えない。

**Tech Stack:** GNU Make 4.3、Docker Compose v5.6、bash

**Spec:** [docs/design/11-make-container-commands.md](../../design/11-make-container-commands.md)。参照元: `/var/www/bc.aidd-template-claude/Makefile`、`/var/www/bc.aidd-template-claude/make.d/template.mk`、`/var/www/bc.aidd-rag/make.d/rag.mk`

## Global Constraints

- 命令の名前は `container-up` / `container-down` / `container-destroy`。
- `docker-compose.yml` を変えない。`CLAUDE.md` を変えない。`README.md` は「起動方法」と「ディレクトリ構成」の節だけ変える。
- `container-up` に `--wait` を付けない。イメージは消さない。
- `container-destroy` の確認の既定は「いいえ」。`YES=1` は、コマンドラインだけ。
- あなたの稼働中のスタック(`bcaidd-trend-compass`)に、触れない。

## Review Focus

仕様が黙っているが、使う人が当たりそうな条件。それぞれ、Task 1 の手順で確かめる。

1. `container-destroy` で、確認に Enter だけ(または `n`)を返す。何も消さず、終了コードが 0 でないこと。
2. 環境変数に `YES=1` がある状態で `make container-destroy`。確認が出ること(省かれないこと)。
3. 標準入力が無い(閉じている)状態で `container-destroy`。確認の読み取りが失敗して、消さずに終わること。
4. 別のディレクトリから `make -C <このプロジェクト> container-up`。動くこと(`docker-compose.yml` を、`Makefile` のある場所から読む)。
5. docker が応答しないとき。`docker compose` のエラーが、そのまま見え、URL の案内を出さないこと。

---

### Task 1: make.d を導入し、コンテナの起動・破棄の命令を足す (AIDDS-22)

**Files:**
- Create: `Makefile`
- Create: `make.d/container.mk`
- Modify: `README.md`(未追跡のファイルを更新する。コミットはしない)
- Create(コミットのみ): `docs/design/11-make-container-commands.md`(作成済み)、本計画書

**Interfaces:**
- Produces: 目標 `help`、`container-up`、`container-down`、`container-destroy`。変数 `YES`(コマンドラインのみ)

- [ ] **Step 1: 作業ブランチを切る**

  `git fetch` のあと、`origin/develop` から、ローカルの `develop` を作る(`git switch -c develop --track origin/develop`)。先頭が `origin/develop` と同じ(`b65d60b`)ことを確かめて、報告する。そこから `git switch -c feature/20261022`。`git branch --show-current` で、`feature/20261022` を確かめる。未追跡の `README.md` は、そのまま残す。

- [ ] **Step 2: 設計書をコミットする**

  `git add docs/design/11-make-container-commands.md` のみ。メッセージ: `docs(design): make.d の設計書を追加 (AIDDS-22)`

- [ ] **Step 3: 計画書をコミットする**

  `git add docs/superpowers/plans/2026-10-22-AIDDS-23-feature-improvement-202610-02.md` のみ。メッセージ: `docs(plan): 機能改善_202610_02 の計画書を追加 (AIDDS-23)`

- [ ] **Step 4: `Makefile` を作る**

  `/var/www/bc.aidd-template-claude/Makefile` を元にする。先頭の説明、`SHELL := /bin/bash`、`.DEFAULT_GOAL := help`、`help` 目標は、そのまま写す。include は `include make.d/container.mk` の1行だけ(`template.mk` の行は、持ち込まない)。コメントは、雛形と同じ英語。

- [ ] **Step 5: `make.d/container.mk` を作る**

  `rag.mk` と同じ構成(先頭に説明、`#@vars container-*`、`#@var YES`、`#@example`、`.PHONY`)。
  - `YES` は、`ifneq ($(origin YES),command line)` で、`YES :=` に空にする(`template.mk` の `NAME` と同じ書き方)
  - `container-up: ## Start the containers (db, backend, frontend)`: `docker compose up -d --build`。成功したら、`frontend: http://localhost:5173`、`backend: http://localhost:8000`、`db: localhost:3307` を出す。`docker compose` が失敗したら、URL を出さずに、その終了コードで終わる
  - `container-down: ## Stop and remove the containers (the db data is kept)`: `docker compose down`
  - `container-destroy: ## Stop and remove the containers and DELETE the db data`: `YES` が空なら、`read -r -p "Delete the containers and ALL the db data? [y/N] " ans` で確認し、`y` / `yes` 以外は `Aborted.` を出して、`exit 1`。通ったら `docker compose down -v`

- [ ] **Step 6: `README.md` を更新する**

  更新の前に、今の `README.md` を、スクラッチ用のディレクトリへ控える。設計書 11 の「README の更新」のとおり。「起動方法」に、`container-up`・`container-down`・`container-destroy`(`YES=1` で確認を省略)を、**箇条書きにせず、テーブルで**書く(列: 命令 / 動き / 実行するコマンド)。表の下に、`make`(引数なし)で一覧が出ることを1文で足す。URL の3行は、今のまま残す。「ディレクトリ構成」に `Makefile` と `make.d/` を足す。ほかの節は、変えない。書いた内容が、Step 4・5 で作った `Makefile` / `container.mk` の `## 説明` と、食い違わないことを、見比べて確かめる。

- [ ] **Step 7: 使い方の表示を確かめる(あなたのスタックに触れない)**

  Run: `make` と `make help`
  Expected: 目標 `help`・`container-up`・`container-down`・`container-destroy` が、説明つきで出る。`Variables (for "container-*")` に `YES` が出る。`Example:` が出る。

  Run: `make -n container-up`、`make -n container-down`、`make -n container-destroy YES=1`
  Expected: 実行される行が、それぞれ `docker compose up -d --build` …、`docker compose down`、`docker compose down -v` と見える(実行はされない)。

- [ ] **Step 8: 使い捨てのスタックを用意する**

  スクラッチ用のディレクトリに、上書きの設定ファイル `smoke.override.yml` を作る。`db` の `ports` を `["3317:3306"]`、`backend` を `["8010:8000"]`、`frontend` を `["5183:5173"]` に、`!override` で置き換える。`frontend` の `VITE_API_BASE_URL` は `http://localhost:8010`。以降の命令の頭に、次の環境変数を付ける。

  `COMPOSE_PROJECT_NAME=aidds22-smoke COMPOSE_FILE=docker-compose.yml:<スクラッチ>/smoke.override.yml`

  Run: 上の環境変数つきで `docker compose config --quiet`
  Expected: エラーなし。`docker compose ps` を、環境変数なしで実行して、あなたのスタックの3つが、そのまま動いていること。

- [ ] **Step 9: `container-up` を確かめる**

  Run: 環境変数つきで `make container-up`
  Expected: 終了コード 0。`aidds22-smoke` の3つのコンテナが起動する。最後に URL の案内が出る。
  Run: `curl -s http://localhost:8010/health` が成功する。

- [ ] **Step 10: `container-destroy` の守りを確かめる(Review Focus 1〜3)**

  - 確認で Enter だけ: `printf '\n' | make container-destroy`(環境変数つき)。Expected: `Aborted.`、終了コード 非0、`aidds22-smoke` のコンテナと volume が残る
  - 確認で `n`: 同様
  - 環境変数 `YES=1` だけ: `echo n | YES=1 make container-destroy`(環境変数つき)。Expected: 確認が出て、`Aborted.`(省かれない)
  - 標準入力が閉じている: `make container-destroy </dev/null`。Expected: 消さずに終わる

- [ ] **Step 11: `container-down` を確かめる**

  Run: 環境変数つきで `make container-down`
  Expected: コンテナが消え、`docker volume ls` に `aidds22-smoke_db_data` が残る。続けて `make container-up` で起動し直したとき、DB のデータが残っていること(`docker compose exec db mysql …` で、テーブルの存在を見る)。

- [ ] **Step 12: `container-destroy` を確かめる**

  Run: 環境変数つきで `make container-destroy YES=1`
  Expected: コンテナと volume が消える(`docker volume ls` に `aidds22-smoke_db_data` が無い)。確認なしで通る。

- [ ] **Step 13: 別のディレクトリからの実行と、docker が止まっているとき(Review Focus 4・5)**

  - `make -C /var/www/bc.aidd-trend-compass -n container-up`(別のディレクトリから)。Expected: 同じ行が見える
  - `DOCKER_HOST=unix:///nonexistent make container-up`。Expected: `docker compose` のエラーが見え、URL の案内は出ず、終了コードが 0 でない

- [ ] **Step 14: 後片付けと、あなたのスタックの無事の確認**

  `aidds22-smoke` のコンテナ・volume・ネットワークが残っていれば消す(`make container-destroy YES=1`、環境変数つき)。スクラッチの設定ファイルは、リポジトリに入れない。最後に、環境変数なしの `docker compose ps` で、`bcaidd-trend-compass` の3つが動いていること、`docker volume ls` に `bcaidd-trend-compass_db_data` が残っていることを確かめる。

- [ ] **Step 15: 設計書との照合**

  設計書 11 の「ゴール」の各項目が、Step 7〜13 で確かめられたことを突き合わせる。食い違いがあれば、設計書の末尾に、節を追記する(元の本文は、書き換えない)。無ければ、何もしない。

- [ ] **Step 16: 実装をコミットする**

  `git add Makefile make.d/container.mk` のみ(名指し)。メッセージ: `feat(make): コンテナの起動・破棄の make 命令を追加 (AIDDS-22)`。`README.md` は、含めない。`git status --short` で、残りが `?? README.md` だけ(更新済みの未追跡のまま)であることを確かめる。

- [ ] **Step 17: 自己レビュー**

  差分(`git diff develop..HEAD --stat` と中身)を見直す。`docker-compose.yml` と `CLAUDE.md` が、変わっていないこと。`README.md` は、「起動方法」と「ディレクトリ構成」の節以外が、元のままであること(更新前の内容は、Step 6 で取った控えと、見比べる)。
