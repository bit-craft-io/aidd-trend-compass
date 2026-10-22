# doc-spec: 銘柄名の一元管理(trend_code_name)

## 機能概要

銘柄コードと銘柄名の対応を、新設の`trend_code_name`テーブルへ一元化する。現在は
`trend.name`(yfinance由来、履歴行ごとにコピー)、`trend.nick_name`(手入力の表示名)、
`trend_candidate.name`(J-Quants由来、発掘のたびに全消去して再投入)と、同じ「コード→名前」
の情報が3か所に分散している。これを1テーブル・1列(`name`)にまとめ、表示名の取得は
すべてこのテーブルへの`code`結合で行う。

## 実装背景

発掘機能(07)の実装で`trend_candidate.name`が増え、コード→名前の情報が`trend`と
`trend_candidate`に二重に存在するようになった。取得元も異なる(yfinanceは英語名、
J-Quantsは日本語の正式名称)ため、同じコードでも画面によって名前が食い違い得る。
また、一覧画面のニックネーム入力欄(06)は「表示名を手入力で上書きする」役割を持ち、
名前の保持場所として`trend.name`と重複している。発掘機能の完成後にまとめて解消する
方針として保留していたリファクタ(本doc-spec)である。

## 影響・対象範囲

- 対象:
  - `trend_code_name`テーブルの新規追加
  - `trend.name`・`trend.nick_name`・`trend_candidate.name`の3列の削除
  - 名前の書き込み(発掘スキャン・銘柄取得・一覧画面の手入力)と読み出し(一覧・詳細・
    発掘結果)の全箇所を`trend_code_name`経由へ変更
  - 一覧画面のニックネーム入力欄の書き込み先変更、`PATCH /trends/{code}/nick_name`の置き換え
- 対象外:
  - 名前の翻訳(yfinanceの名前は翻訳せずそのまま保存する)
  - 発掘画面・詳細画面への名前編集UIの追加(手入力の入口は一覧画面のみ)
  - 名前の変更履歴の保持
  - プライム全銘柄の名前の事前投入(発掘スキャンの対象になった銘柄のみ)

## ゴール

- コード→名前の情報の保持場所が`trend_code_name`の1か所のみになる
- 名前は、yfinanceでの銘柄取得時・発掘スキャン時に、未登録または`name`がNULLの銘柄に
  限って自動で入る。既に値がある銘柄の名前は自動処理で上書きされない
- 一覧画面で名前を手入力して確定すると、その値が`trend_code_name.name`に保存され、
  以降は一覧・詳細・発掘結果のいずれでも同じ名前が表示される
- 発掘スキャン時の名前の反映は、銘柄数によらず発行クエリ数がほぼ一定(一括SELECT+
  一括INSERT+差分のみUPDATE)である

## 解決策・技術アーキテクチャ

### DBスキーマ

**`trend_code_name`テーブル(新規)**

- `id` (PK, auto increment)
- `code` (String(16), UNIQUE制約、FK制約なし・アプリ側で整合性管理)
- `name` (String(255), NULL許容)
- `created_at`
- `updated_at`
- `deleted_at` (ソフトデリート。行の複製による履歴保持は行わず、名前の変更は既存行の
  UPDATEで行う。ソフトデリート済みの行が見つかった場合は`deleted_at`をNULLに戻して
  復活させ、行を増殖させない)

**既存テーブルの列削除**

- `trend.name`、`trend.nick_name`、`trend_candidate.name`を削除する
- 本プロジェクトにはマイグレーション機構が無く、`create_all`では既存テーブルの列削除が
  できないため、手元DBは`docker compose down -v`で作り直す前提とする(個人利用の
  ローカル環境のため許容する)。既存のニックネームと取得済み銘柄は消えるので、再取得する

**名前の読み出し**

- `trend`および`trend_candidate`の各行は、`code`で`trend_code_name`をLEFT JOINして
  名前を得る。行が存在しない、または`name`がNULLの場合、APIは`name`を空文字で返し、
  フロントはコードのみを表示する
- `trend`は履歴行を持つが、名前は履歴に含めずコード単位で1つとする(過去時点の名前は
  保持しない)

### 書き込みルール

`backend/app/trend_code_name_service.py`(新規)に、以下2つの関数を用意する。

**`fill_names(db, names: dict[str, str])` — 「未設定のときだけ埋める」一括処理**

1. `code IN (…)`で既存行を1回のSELECTで取得する(ソフトデリート済みを含む)
2. Pythonで振り分ける
   - 行なし → INSERT対象
   - 行あり・`name`がNULL(またはソフトデリート済みで復活させる場合) → UPDATE対象
   - 行あり・`name`に値あり → 何もしない
3. INSERTは1回のbulk INSERT、UPDATEは対象行のみ発行する
- 既存の`name`は、yfinance・J-Quantsのどちらの取得元でも上書きしない

**`set_name(db, code: str, name: str)` — 手入力による上書き**

- 行が無ければ作成し、あれば`name`を上書きする。ソフトデリート済みなら復活させる
- 前後の空白を除去した結果が空文字なら、`name`をNULLに戻す

**呼び出し元**

- 発掘スキャン(`trend_candidate_service`): J-Quantsマスタから得た`(code, CoName)`を
  `fill_names`へ渡す。スキャン対象になった銘柄が対象であり、プライム全銘柄は入れない
- 銘柄取得(`trend_service`のcreate/refresh): yfinanceの名前を翻訳せずそのまま
  `fill_names`へ渡す(1件)
- 一覧画面の手入力: 下記APIから`set_name`を呼ぶ

**取得元の優先関係(結果)**

手入力 > 既存の値 > 取得元(yfinance / J-Quants)。先にyfinanceの英語名が入った銘柄は、
後から発掘に出てきてもJ-Quantsの日本語名には置き換わらない。日本語にしたい場合は、
一覧画面で手入力して直す運用とする。

### API(backend / FastAPI)

- `GET /trends` — レスポンスの`name`は`trend_code_name`から取得(未設定は空文字)。
  `nick_name`フィールドは廃止する
- `PATCH /trends/{code}/name` — 名前の手入力更新(`set_name`)。従来の
  `PATCH /trends/{code}/nick_name`を置き換える。空文字は`name`のNULL化を意味する
- `GET /trends/{code}`(詳細)、発掘の結果取得(`GET /screening/results`系) —
  `name`は`trend_code_name`から取得する。レスポンスの形は変えない

### コンポーネント(frontend)

- `WatchlistRow`: 「会社名」列の入力欄を、`trend_code_name.name`の編集欄として維持する。
  値は`name`を表示し、placeholderは銘柄コードにする。確定は06と同じく`onBlur`
  およびEnter(`input.blur()`を発火)で行い、直前の保存値との差分が無ければAPI呼出しを
  スキップする。呼出先は`PATCH /trends/{code}/name`
- `types.ts`: `Trend`型から`nick_name`を除去する
- `DetailPage`の見出し、発掘の結果表: APIが返す`name`をそのまま表示する(コードのみ
  の場合は空欄でよい)

### データフロー

1. 銘柄取得: `POST /trends` → yfinanceの名前を`fill_names`へ → `trend`行を作成
2. 発掘スキャン: J-Quantsマスタ取得 → `trend_candidate`を再投入 → 同じ`(code, CoName)`を
   `fill_names`へ(スキャン対象分のみ)
3. 名前の手入力: 一覧の入力欄で確定 → `PATCH /trends/{code}/name` → `set_name` →
   成功時は入力値をそのまま表示に維持
4. 表示: 一覧・詳細・発掘結果はいずれも`code`で`trend_code_name`をLEFT JOINして`name`を得る

### エラー処理

既存方針を踏襲し、専用のトースト等は導入しない。名前更新のAPI呼出しが失敗した場合は、
該当行の直下にインラインで赤字エラーメッセージを表示する。`fill_names`の失敗は、
それを呼んだ処理(銘柄取得・発掘スキャン)本体の失敗として扱い、部分的に名前だけ
欠けた状態で成功扱いにしない。

### テスト方針

- backend: pytestで以下を重点的に単体テストする
  - `fill_names`: 新規INSERT・`name`がNULLの行のUPDATE・値ありの行が変更されないこと・
    ソフトデリート済み行の復活・空の入力で何も発行しないこと
  - `fill_names`の発行クエリ数が、銘柄数(例: 1件と500件)によらず一定であること
    (SQLAlchemyのイベントでSQL発行数を数えて検証する)
  - `set_name`: 新規作成・上書き・空文字でNULL化・ソフトデリート済みの復活
  - 銘柄取得・発掘スキャンが`fill_names`経由で名前を保存し、既存の名前を上書きしないこと
  - 名前が未設定(行なし、または`name`がNULL)の銘柄が、`GET /trends`・詳細・発掘結果で
    空文字の`name`のまま返り、一覧から漏れないこと
- frontend: vitestで以下を確認する
  - 名前入力欄が`onBlur`・Enterの両方でAPIを呼び、差分が無ければ呼ばないこと
  - 空で確定した場合に空文字がAPIへ送られること
  - `nick_name`を参照する箇所が残っていないこと(型チェックで担保)
- 実機スモークテスト(CLAUDE.md記載の必須項目に加える): DB作り直し後に、銘柄取得→
  名前の自動入力→手入力で変更→発掘スキャン後も手入力の名前が維持される、の一連を確認する

### 実装上の前提・注意

- 発掘機能(07)のブランチがmainへマージされた後に着手する(`trend_candidate`が
  mainに存在する状態で、3列をまとめて削除するため)
- 06(ポジション管理+グルーピング)のdoc-specにある`nick_name`の記述は、本doc-specに
  より置き換わる。実装時に06側へ追記して整合を取る
- CLAUDE.mdの「機能への分割」に本doc-specへの参照を、実装着手時に追加する
