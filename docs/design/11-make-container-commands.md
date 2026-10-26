# doc-spec: make.d の導入(コンテナの起動・破棄)(AIDDS-22)

## 追記の一覧

元の本文は、合意済みなので、書き換えない。追記が、あとの合意として、有効になる。

- AIDDS-27(2026-10-26): container-replace の追加(元の記述の変更: 「命令は3つ」を4つにする。「README の更新」の「3つの命令」のテーブルに、1行足す)

Jira: AIDDS-22。親エピックは AIDDS-23 機能改善_202610_02(2026-10-22 時点)。

## 機能概要

`make` の命令で、コンテナの起動と破棄を行えるようにする。雛形(`bc.aidd-template-claude`)の
`Makefile` と `make.d/` の作りに倣い、`Makefile` に `help` と include だけを置き、命令は
`make.d/container.mk` に書く。

命令は3つ。

- `container-up`: コンテナを起動する
- `container-down`: コンテナを止めて破棄する(DB のデータは残す)
- `container-destroy`: コンテナを止めて破棄し、DB のデータも消す

## 実装背景

起動と破棄は、`docker compose up -d --build` などを、そのつど手で打っている。雛形と、兄弟の
`bc.aidd-rag` は、`make` の命令にまとめており(`rag-up`・`rag-down`・`rag-destroy`)、
同じ作りを、このプロジェクトにも入れる。

## 影響・対象範囲

- 対象:
  - `Makefile` の新規追加(`help` 目標と、`include make.d/container.mk`)
  - `make.d/container.mk` の新規追加(`container-up`・`container-down`・`container-destroy`)
  - `README.md` の更新(「起動方法」の節と「ディレクトリ構成」の節を、`Makefile` の内容に合わせる)
- 対象外:
  - `docker-compose.yml` の変更(サービス・ポート・volume は、そのまま)
  - 雛形の `make.d/template.mk`(`make new`)。このプロジェクトは、雛形ではないので取り込まない
  - `CLAUDE.md` の変更(「起動」の節の併記も、機能の分割へのリンク追記も、しない)
  - コンテナのイメージの削除(`down` も `destroy` も、イメージは残す)
  - backend / frontend のテスト・型チェックの命令(今回は、コンテナだけ)

## ゴール

- `make`(引数なし)で、使い方が出る。`## 説明` の付いた目標が、一覧に出る
- `make container-up` で、db・backend・frontend が起動する。終わりに、各 URL を出す
- `make container-down` で、コンテナとネットワークが消える。DB のデータ(volume `db_data`)は残る
- `make container-destroy` で、確認のあと、コンテナと volume が消える。`YES=1` で、確認を省ける
- 確認で「いいえ」(Enter、`n` など)と答えれば、何も消さずに終わる(既定は「いいえ」)
- 環境変数の `YES` だけでは、確認を省かない
- `README.md` の「起動方法」に、3つの命令と、それぞれの動き(上の表)が書かれている。「ディレクトリ構成」に、
  `Makefile` と `make.d/` が載っている

## 解決策・技術アーキテクチャ

### 構成

- `Makefile`: 雛形と同じ。`SHELL := /bin/bash`、`.DEFAULT_GOAL := help`、`help` 目標。
  include は、`make.d/container.mk` の1行。`help` は、`## 説明` の付いた目標と、`#@vars` /
  `#@var` / `#@example` の行を読んで出す
- `make.d/container.mk`: 話題ごとに1ファイル。変数と例は、`#@vars` / `#@var` / `#@example` で書く
- 話題が増えたら、`make.d/<話題>.mk` を足し、`Makefile` に include を1行足す

### 命令

| 命令 | 動き |
|---|---|
| `container-up` | `docker compose up -d --build`。終わりに URL を出す(frontend 5173、backend 8000、DB 3307) |
| `container-down` | `docker compose down`。volume は残す |
| `container-destroy` | 確認のあと、`docker compose down -v`。確認は `YES=1` で省ける(`rag-destroy` と同じ作り) |

- `container-up` に、`--wait` は付けない。`docker-compose.yml` で healthcheck を持つのは `db` だけで、
  backend と frontend には無いため。起動の指示を出して、すぐ返す
- `YES` は、コマンドラインで渡されたときだけ受け付ける(`make container-destroy YES=1`)。環境変数に
  `YES` があっても、確認は省かない。データを誤って消すのを避けるため。雛形の `NAME` の扱いと同じ作り
- URL は、`docker-compose.yml` の `ports` に書かれた値(5173、8000、3307)を、そのまま出す。
  ポートが変われば、`container.mk` の表示も直す

### README の更新

- 「起動方法」: 起動・停止・破棄の3つの命令は、箇条書きにせず、**テーブル**で書く。列は「命令」「動き」
  「実行するコマンド」。行は、`make container-up`(起動)、`make container-down`(データを残して停止)、
  `make container-destroy`(データごと消す。確認あり。`YES=1` で確認を省略)。表の下に、`make`(引数なし)で
  命令の一覧が出ることを、1文で書く。起動後の URL(DB 3307、backend 8000、frontend 5173)の3行は、
  今の書き方のまま残す
- 「ディレクトリ構成」: `Makefile` と `make.d/`(命令の置き場)を足す
- 上の2つの節以外は、変えない

### 判断の経緯

- 命令の名前は、話題(コンテナの操作)で `container-*` とした。`trend-*` は、アプリ名で、話題が増えると
  何の命令か紛れる(2026-10-22)
- 「破棄」は、データを残す `container-down` と、データごと消す `container-destroy` の両方を置く
  (2026-10-22)
- 参照元: `bc.aidd-template-claude/Makefile`、`bc.aidd-template-claude/make.d/template.mk`、
  `bc.aidd-rag/make.d/rag.mk`
- 画面は無いので、「画面デザイン」の節は無い

## 追記: container-replace(コンテナを1つ指定して置き換える)(AIDDS-27、2026-10-26)

### 経緯

`.env` の値を変えたあと、コンテナを1つだけ作り直したい場面がある。`container-up` は全部のコンテナを対象にし、`docker compose up -d --build` で、設定の変わらないコンテナは作り直されない。1つを指定して、確実に作り直す命令を足す。

### 元の記述との関係

- 「機能概要」の「命令は3つ」を、4つにする。足すのは `container-replace`
- 「README の更新」の「3つの命令」のテーブルに、`make container-replace SERVICE=<サービス名>` の行を足す
- そのほかの記述(`container-up`・`container-down`・`container-destroy`、`YES` の扱い、対象外)は、変えない

### 命令

| 命令 | 動き |
|---|---|
| `container-replace` | 指定したコンテナ1つを、ビルドし直して作り直す。`docker compose up -d --build --force-recreate --no-deps $(SERVICE)`。volume(DB のデータ)は残す |

- 変数 `SERVICE`: 作り直すサービス名(`db` / `backend` / `frontend`)。**必須**。コマンドラインで渡されたときだけ受け付ける(`make container-replace SERVICE=frontend`)。環境変数に `SERVICE` があっても、無いものとして扱う(別の用途の `SERVICE` で、意図しないコンテナを作り直すのを避ける。`YES` と同じ作り)
- `SERVICE` が空のときは、何も実行せず、`SERVICE is required. Example: make container-replace SERVICE=frontend` を出し、終了コードを 0 でなくして止める。全部を作り直すのは `container-up` の役目とし、混ぜない
- `SERVICE` に、`docker-compose.yml` に無い名前を渡したときの検査は、足さない。`docker compose` のエラーが、そのまま見える(サービス名の一覧を、`docker-compose.yml` と二重に持たないため)
- `--no-deps` を付ける。付けないと、`depends_on` の先(`frontend` なら `backend` と `db`)も、`--force-recreate` の対象になりうる。指定した1つだけを作り直すため
- `--no-deps` のため、`depends_on` の先が動いていなくても、起動しない。`backend` を作り直すときに `db` が止まっていれば、`backend` は、DB に繋がらない。そのときは、先に `make container-up` を行う
- `--force-recreate` を付ける。`.env` を変えただけで、コンテナの設定もイメージも変わらないとき、付けないと、何も起きないことがある
- `--build` を付ける。ソースの変更も、設定の変更も、まとめて反映する。使う人が「どちらか」を考えずに済む
- 終わりに、`Replaced: <サービス名>` を出す(URL は、出さない)
- `make` の一覧には、変数 `SERVICE` と、例 `make container-replace SERVICE=frontend` を足す

### 判断の経緯

- 名前は `container-replace`。`container-build` は、イメージを作るだけと読めて、動きと食い違う。`container-restart` は、設定の再読み込みと紛れる(2026-10-26)
- ビルドを含める(`--build`)。含めない案(設定の反映だけ)は、ソースの変更が反映されず、使い分けを強いる。採らなかった(2026-10-26)
- `SERVICE` を省いたら、止める。全部を作り直す案は、`container-up` と役目が重なる。採らなかった(2026-10-26)
- `--no-deps` を付ける(2026-10-26)。依頼の文には無かったが、「1つのコンテナだけ」という依頼の意図に合わせた。実機で、ほかのコンテナが作り直されぬことを確かめる
