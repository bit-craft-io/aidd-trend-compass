# doc-spec: make.d の導入(コンテナの起動・破棄)(AIDDS-22)

## 追記の一覧

元の本文は、合意済みなので、書き換えない。追記が、あとの合意として、有効になる。

(まだ無い)

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
