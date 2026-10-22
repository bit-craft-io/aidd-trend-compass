# doc-spec: 種類(type)の名称を汎用的に扱うマスタと、保有銘柄のトレンド名への適用(AIDDS-10)

## 追記の一覧

元の本文は、合意済みなので、書き換えない。追記が、あとの合意として、有効になる。

- AIDDS-10(差し戻し・仕様漏れ、2026-10-07): 保有一覧のトレンド列は、API が返す文字列(`type_daily_trend`)を、そのまま表示する。「上昇・下降・横ばい」への変換は、しない。判定なしは`none`と表示する。元の「画面」の節などの記述(`none`は「—」)を、変更する。下の「追記: AIDDS-10 仕様漏れ」を参照
- AIDDS-17・18(2026-10-07): 発掘の一覧も、マスタの名前(`type_daily_trend`)をそのまま表示する。一覧のトレンド列の見出しに、出どころの添え書きを付ける。「発掘の一覧は、別のタスクにする」の追記は、この追記が有効。詳細は[09-trend-direction-and-market-colors.md](09-trend-direction-and-market-colors.md)の末尾の節

Jira: AIDDS-10。親エピックは AIDDS-9 機能改善 202610_01(2026-10-06 時点)。実装計画:
[docs/superpowers/plans/2026-10-01-AIDDS-9-feature-improvement-202610-01.md](../superpowers/plans/2026-10-01-AIDDS-9-feature-improvement-202610-01.md)
(Task 6)

## 機能概要

次の2つを行う。

1. **種類(type)の名称を、汎用的に扱うマスタ`trend_system_type`を追加する**。「どの列(`type_column`)の、
   どの数値(`type_value`)が、どの名称(`type_name`)か」を、1つの表で持つ。列や機能に依存せず、
   **`type_`で始まる数値の列は、どれも、同じ表と、同じ共通部品で、名称を扱える**(保有銘柄のトレンドに限らない)
2. **このマスタを使って、保有銘柄のトレンドの名称を取得する**。`trend`テーブルの`daily_trend`列
   (文字の`up` / `down` / `flat` / `NULL`)を、数値の列`type_daily_trend`に変え、一覧を取得するときに、
   `trend`とマスタを JOIN して、数値を名称(`type_name`)に戻し、API と画面に返す

## 実装背景

- 文字(`up` 等)を、各テーブルの列に、そのまま持つと、種類が増えたとき(別の列にも種類が要るとき)に、
  意味の置き場所が、列ごとに散らばる。種類の意味を、1つの表(種類テーブル)に集める
- 09の「今後の想定」に書かれていた変更(AIDDS-10)。09の本文は、合意済みなので、書き換えない。
  この設計書が、あとの合意として、有効になる(下の「変更する既存の記述」)

## 影響・対象範囲

- 対象:
  - 汎用の部分(どの`type_`列にも使える): 新しいテーブル`trend_system_type`、その初期値を入れる
    シーダー、名称を引く共通部品(`trend_system_type_service`)
  - 最初の使い手として、保有銘柄のトレンド:
    `trend`テーブルの列`daily_trend`を、数値の列`type_daily_trend`に改名・型変更する
  - 保有銘柄の取得(一覧・取得・更新・名前の保存・詳細)で、種類テーブルを JOIN して、名前を返す
  - 保有銘柄のAPIの項目名`daily_trend`を、`type_daily_trend`に改名する。フロントも合わせる
- 対象外:
  - 発掘の一覧のトレンド。DBに列を持たず、表示のときに、保存済みの日足から計算する(07・09参照)。
    APIの項目名`daily_trend`も、そのまま
  - トレンドの判定の仕方(09の「トレンドの判定」)
  - 保有銘柄のトレンド以外の`type_`列。このマスタと共通部品で扱えるが、今回は、追加しない
  - 種類を増やす画面や、APIでの編集(種類テーブルは、DBで見るためと、JOIN のための表)

## ゴール

- `trend.type_daily_trend`は、数値(`0`: none、`1`: up、`2`: down、`3`: flat)。判定できないときは、
  `NULL`ではなく、`0`(none)にする
- 種類テーブルは、実際に JOIN して使う。一覧の取得で、JOIN は1回(銘柄ごとの追加の問い合わせはしない)
- APIは、`type_daily_trend`に、文字(`none` / `up` / `down` / `flat`)を返す。判定なし(`none`)は、
  画面に「—」と出す(いまの表示と同じ)
- 種類テーブルに、一致する行が無くても(想定外の数値、行の削除など)、一覧は表示される。
  このときの名前は、`none`
- 種類テーブルの初期値は、シーダーで入れる。開発・stage・運用で、同じやり方(起動のたびに、全行を
  `TRUNCATE`して、初期データを入れ直す)。どの環境でも、マスタの内容と`id`が、同じになる

## 解決策・技術アーキテクチャ

### DBスキーマ

`trend`(変更):

- 列`daily_trend`(`String(8)`、NULL可)を、`type_daily_trend`(`SmallInteger`、NOT NULL、既定`0`)に変える。
  列名の先頭は`type_`(種類テーブルの`type_column`と同じ名前)

`trend_system_type`(新規)。全テーブルの方針どおり、`created_at` / `updated_at` / `deleted_at`を持つ:

| 列 | 型 | 意味 |
|---|---|---|
| `id` | BigInteger、auto increment | 主キー |
| `type_column` | String(100) | どの列の種類か(例 `type_daily_trend`) |
| `type_name` | String(100) | どの値か(例 `none` / `up` / `down` / `flat`) |
| `type_value` | Integer | 数値(例 `0` / `1` / `2` / `3`) |

- `type_column`と`type_value`の組に、一意制約を付ける
- 他のテーブルへの外部キー制約は付けない(このプロジェクトの方針)
- 既存の`trend_system`(キーと値を持つ表)とは、別のもの

初期値(シーダーが入れる4行):

| type_column | type_name | type_value |
|---|---|---|
| `type_daily_trend` | `none` | 0 |
| `type_daily_trend` | `up` | 1 |
| `type_daily_trend` | `down` | 2 |
| `type_daily_trend` | `flat` | 3 |

### 保存(書き込み)

- `trend_service`が、取得・更新のとき、日足から判定した結果(`up` / `down` / `flat` / `None`)を、
  数値にして、`trend.type_daily_trend`に保存する。`None`と、想定外の文字は、`0`
- 数値と名前の対応は、シーダーの初期値の定義(コード内の定数)を、1か所の元にする

### 取得(読み込み)

汎用の共通部品(マスタの側。どの列の種類にも使える)と、トレンドの側の使い方に分ける。

- 共通部品`trend_system_type_service`:
  - `join_condition(type_column, value_column)`: マスタを、ある列の種類として、数値の列に結ぶ JOIN 条件
    (`type_column`が一致、`type_value`が数値の列と一致、`deleted_at IS NULL`)
  - `attach_names(db, rows, model=…, value_column=…, type_column=…, target_attr=…, default=…)`:
    `model`の行と、マスタを LEFT JOIN し(1回の問い合わせ)、名称を、各行の`target_attr`に付ける。
    選ぶのは、行の`id`と`type_name`だけ(重い列は読まない)。一致する行が無いときは、`default`
- トレンドの側`trend_type_service.attach_daily_trend_names(db, trends)`: 共通部品を、
  `model=Trend`・`value_column=Trend.type_daily_trend`・`type_column='type_daily_trend'`・
  `target_attr='type_daily_trend_name'`・`default='none'`で呼ぶ
- 一覧(`GET /trends`)・取得(`POST /trends`)・更新(`POST /trends/refresh`)・名前の保存
  (`PATCH /trends/{code}/name`)・詳細(`GET /trends/{code}`)が、この名前を返す

### シーダー

- `trend_system_type_seeder.reset(db)`。全行を`TRUNCATE`して(MySQL。SQLite のテストでは`DELETE`)、
  初期データを、まとめて入れる(bulk insert)。`id`の採番も戻るので、どの環境でも、同じ`id`になる。
  入れた行数を返す
- 開発・stage・運用で、同じやり方にする。「足りない行だけ入れる」やり方は、環境ごとに、マスタに
  差が出て、運用が複雑になるため、取らない。マスタの行を、DBで直しても、次の起動で、初期データに戻る
  (直すときは、シーダーの定義を直す)
- 世代管理用の列は、あとで追加する(今回は、扱わない)
- `python -m app.init_db`(コンテナの起動時に実行される)の中で、テーブルを作ったあとに、実行する
- 起動のたびに、全行が入れ替わる。別のインスタンスが動いている間に起動すると、入れ替えの一瞬だけ、
  名称が`none`になりうる(一覧は、表示される)

### API

- `GET /trends`、`POST /trends`、`POST /trends/refresh`、`PATCH /trends/{code}/name`、
  `GET /trends/{code}`: 各項目の`daily_trend`を、`type_daily_trend`(文字。`none` / `up` / `down` / `flat`)に
  改名する
- `GET /screening/results/{condition_id}`: 変更しない(`daily_trend`のまま。`up` / `down` / `flat` / `null`)

### 画面

- 保有銘柄の一覧のトレンド列と、行の色: `type_daily_trend`を使う。`none`は、「—」(色なし)。
  古い応答の`null`・未設定も、「—」(互換)
- 発掘の一覧: 変更しない

#### 別の`type_`列を足すとき

保有銘柄のトレンド以外の列にも、同じ形で足せる。

1. 数値の列を、`type_<名前>`(例 `type_buy_category`)の名前で作る(`SmallInteger`、NOT NULL、既定`0`)。
   `0`は、none(未設定)に使う
2. シーダー(`trend_system_type_seeder.SEED_ROWS`)に、`(type_column, type_name, type_value)`の行を足す。
   `type_column`は、列名と同じ
3. 名称を返す側で、共通部品`trend_system_type_service.attach_names`を、その列で呼ぶ
   (`value_column`、`type_column`、`target_attr`、`default`を渡す)。APIの項目名は、列名に合わせる
4. 設計書に、追記する(元の本文は、書き換えない)

このとき、マスタの表・共通部品・JOIN の書き方は、変えなくてよい。

## エラー処理

- 種類テーブルに、一致する行が無い、または、テーブルが空でも、一覧は表示される(名前は`none`)

### テスト方針

- シーダー: 全行を入れ替えて、4行・`id`1〜4に揃う・何度でも実行できる・時刻が入る・DBで直した名前が
  初期値に戻る・削除済みの行も消える
- 数値化: `None`・`up`・`down`・`flat`・`none`・想定外の文字
- JOIN: 名前が、種類テーブルの名前に従う・一致する行が無いと`none`・削除済みの行は無視・空の一覧
- 保存: 取得・更新で数値が入る(判定なしは0)
- API: 項目名`type_daily_trend`・`daily_trend`が無い・マスタが空でも200
- `init_db`: テーブルを作り、マスタが入る。2回実行しても、同じ4行・`id`1〜4
- フロント: `none`が「—」・行の色なし
- 実機スモークテスト(`CLAUDE.md`)。DBは作り直す

## 変更する既存の記述

元の本文は、書き換えない。この設計書が、あとの合意として、有効になる。

- 01の`trend`テーブルの項目: `daily_trend`(`up` / `down` / `flat`、判定できないときはNULL)は、
  `type_daily_trend`(数値。判定なしは0)になる
- 06のトレンド列: `trend.daily_trend`は、`trend.type_daily_trend`(APIでは、文字)になる
- 09の「DBスキーマ」「API」の`daily_trend`(保有銘柄)は、`type_daily_trend`になる。09の
  「今後の想定」で未決だった点は、この設計書で決まった(`type_column`は列名`type_daily_trend`、
  列は数値、API・画面は文字のまま、種類テーブルはJOINで使う)
- 07(発掘)の`daily_trend`は、変わらない

## 画像

チケット(AIDDS-10)に、添付画像は無い。

## 追記: AIDDS-10 仕様漏れ「保有一覧のトレンドは、送られてきた文字列を、そのまま表示する」(2026-10-07)

意図: フロントは、API から送られてきた表示文字列を、そのまま表示する。フロント側に、名称を日本語に
直す対応表を持たない(Jira のコメントでの指摘。仕様漏れ)。

- 保有一覧のトレンド列: `type_daily_trend`の文字列(`none` / `up` / `down` / `flat`)を、そのまま
  表示する。判定なし(`none`)も、`none`と表示する。値が無い(古い応答の`null`・未設定)ときだけ、「—」
- 行の色は、これまでどおり、値で決める(`up`=赤、`down`=緑、それ以外は色なし)。バッジの文字の色も、
  値ごとの色(`up`=赤、`down`=緑、それ以外は薄い色)
- 変更する元の記述: 「画面」の節の、「`none`は、「—」(色なし)」(`none`は、`none`と表示する)。
  「ゴール」の、「判定なし(`none`)は、画面に「—」と出す」。「テスト方針」の、「フロント: `none`が
  「—」」。09・06の、保有一覧のトレンド列の、「上昇・下降・横ばい」の表示の記述
- 発掘の一覧: 別のタスクにする。当面は、いまの表示(上昇・下降・横ばい・「—」)のまま。そのための
  日本語の対応表は、発掘の画面の側に残す(別のタスクで、API の文字列の表示に、そろえる)
- 表示の文字を、マスタで管理する案(AIDDS-16)は、この追記と矛盾しない。API が返す文字列が、
  マスタの表示名に変われば、画面は、その文字を、そのまま表示する

## 追記: AIDDS-17・AIDDS-18(2026-10-07)

- 発掘の一覧のトレンドは、保有一覧と同じく、マスタの名前を、そのまま表示する(AIDDS-17)。
  上の追記の「発掘の一覧: 別のタスクにする」は、このタスクで、そろう
- 保有一覧のトレンド列の見出しに、出どころの添え書き(「5分足を日足に」「更新時の値」)を付ける(AIDDS-18)。
  意見のパネルを開いて列を折りたたんだときは、出さない
- 詳細は、[09-trend-direction-and-market-colors.md](09-trend-direction-and-market-colors.md)の末尾の節
