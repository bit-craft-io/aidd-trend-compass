# doc-spec: 発掘(新規機能)

## 追記の一覧

元の本文は、合意済みなので、書き換えない。追記が、あとの合意として、有効になる。

- AIDDS-17(2026-10-07): 結果のAPIは、全件を返し(ページ分けの廃止)、各項目の`daily_trend`は`type_daily_trend`(`none` / `up` / `down` / `flat`)になる。フロントが、`none`を除き、ページに分ける。本文の、結果のAPIと、ページングの記述は、この追記が有効。詳細は[09-trend-direction-and-market-colors.md](09-trend-direction-and-market-colors.md)の末尾の節
- AIDDS-18(2026-10-07): 結果一覧の「トレンド」列の見出しに、出どころの添え書き(「J-Quants 日足」「60営業日」)を付ける。列幅の「トレンド80px」は、添え書きのために広げてよい。詳細は、同上

## 機能概要

J-Quants APIの日足データを使い、東証プライム市場相当の銘柄(初期スコープ約1600銘柄)
に対して複数の技術的シグナル(移動平均トレンド・出来高増加等)を計算し、条件に合致
する銘柄を一覧として提示する新機能。ユーザーはその中から気になる銘柄を選び、既存の
ウォッチリスト(機能A)へ登録する。既存の一覧・詳細・ニュース機能(yfinanceベース)
とはデータソース・実装モジュールとも完全に分離する(ハイブリッド構成)。

## 実装背景

既存の一覧画面(機能A)は、ユーザーが銘柄コードを個別に入力して追加する方式であり、
「新規に有望そうな銘柄を見つける」手段を持たない。日足レベルの技術指標を用いて
機械的に候補を絞り込み、購入判断の材料を提示する機能を追加する。

本アプリの根本方針(`docs/brainstorming-intake.md`)である「予測ではなく傾向を示す、
断定調を避ける」を踏襲し、本機能も「上がる銘柄を予測する」ものではなく、「一定の
傾向(シグナル)に合致する銘柄を機械的に絞り込んで提示する」ものと位置づける。

## 影響・対象範囲

- 対象:
  - 新規`jquants_client.py`(J-Quants API V2クライアント。既存`yfinance_client.py`
    とは完全に独立したモジュールとし、相互に依存させない)
  - 新規テーブル4つ: `trend_candidate` / `trend_candidate_condition` /
    `trend_candidate_result` / `trend_system`
  - 新規`/screening`系API(backend)
  - `ScreeningPage.tsx`の本実装(現状は「準備中」のプレースホルダーのみ)
  - 結果一覧の行クリックで右側に日足チャートを表示する機能(追加仕様。下記
    「結果エリアのチャート表示」参照)。チャートデータは`trend_candidate`に
    保存済みの日足を使い、追加のJ-Quants呼び出しは行わない
  - `docker-compose.yml` / `.env` / `.env.example`への環境変数追加
- 対象外:
  - 分足データでの発掘、期間(from-to)・足種(5分足/15分足等)を発掘条件に含める
    こと。発掘は日足による一次スクリーニングに限定し、選定後の詳細な期間・足種
    分析は機能B拡張(`docs/design/04-multi-timeframe-indicators.md`)の詳細画面に
    委ねる
  - `trend.name`と`trend_candidate.name`の重複を解消する`trend_code_name`テーブル
    への一元化(発掘機能の完成後に別途着手する。今回のdoc-spec対象外。08で実施済み)
  - 認証・ユーザー管理(本アプリの既定方針どおり実装しない)
  - 東証プライム以外(グロース・スタンダード等)への対象拡大(初期スコープは
    プライムのみ。将来必要になれば別途検討)

## ゴール

- ユーザーが「取得」ボタンを押すと、J-Quants APIから対象銘柄の日足データ
  (直近60〜90営業日分のOHLCV)を取得し、`trend_candidate`へ保存する
  (この時点ではシグナル計算は行わない)
- 直前の取得から24時間以内は再取得できない(クールダウン)
- J-Quants未契約・Free版キーのみ(Light版APIキー未設定)の場合でも、対象銘柄数を
  絞った上で動作確認できる。稼働モードが画面上で分かる
- 12種のシグナル項目をチェックボックスで複数選択し、AND条件で絞り込める。
  シグナル計算は検索実行時に`trend_candidate`の生データから行い、条件に合致した
  銘柄コードを`trend_candidate_result`へ保存する
- 絞り込み条件は検索実行のたびに自動保存され、後から一覧から選択して再利用・
  リネーム・削除できる(明示的な「保存」操作は不要)
- 絞り込み結果は直近の取得(スキャン)分のみキャッシュされ、同じ条件を再度選べば
  再計算なしで即座に表示できる
- 発掘結果一覧から複数銘柄を選択し、まとめて既存のウォッチリストへ登録できる。
  既にウォッチリストへ登録済みの銘柄は一覧上で識別できる
- 結果一覧の行をクリックすると、その銘柄の日足ローソク足チャート(直近約90営業日
  +5日移動平均線)が右側に表示される。足の長さ(値幅)と陽線・陰線の色で、値動きの
  形を確認できればよい(ボリンジャーバンド・出来高は表示しない)
- 結果一覧のチェックボックスの右隣に、項目名「連番」の列を置く。検索結果の並び順に
  1から振る通し番号で、ページを跨いで続く(2ページ目の先頭は、1ページの件数+1)。
  DBのIDではなく画面上の表示専用の値
- 結果一覧の各列の横幅は固定であり、検索条件を変えて結果が入れ替わっても、
  内容の文字数によって列幅が変動しない

## 対象外

- 分足データ・期間指定条件を発掘機能自体に持たせること
- `trend_code_name`テーブルへの一元化(08で実施済み)
- 認証・ユーザー管理
- 東証プライム以外の市場区分への対象拡大

## 解決策・技術アーキテクチャ

### 画面デザイン

配色は既存のライト/ダークテーマのCSSカスタムプロパティ(`frontend/src/index.css`
の`:root` / `:root[data-theme="dark"]`)をそのまま流用する。新規トークンは追加
しない(既存の`--btn-discovery-*`・`--btn-primary-*`・`--btn-dark-*`・`--card-*`
等を使い回す)。

レイアウトは縦3段構成:

1. **ステータス/取得エリア**(カード): 「最終発掘: {日時}」「次回発掘可能: あと
   {残り時間}」を左側に、「取得」ボタン(`--btn-discovery-*`配色)を右側に配置。
   クールダウン中はボタンを`disabled`にする。稼働モードが Free版の場合、
   「稼働モード: Free版(5req/64秒・対象{N}銘柄)」のような注記を同エリアに表示する
2. **条件エリア**(カード): デフォルトで折りたたみ(閉)状態。常時表示する要素
   (折りたたみ中も見える、左から順に): 「編集」ボタン(`--btn-dark-*`)+
   保存済み条件セレクト+「適用」ボタン(`--btn-dark-*`)+「検索」ボタン
   (`--btn-primary-*`)+「削除」ボタン(`--btn-outline-danger-*`、選択中の
   条件を削除)+開閉トグル(「条件を編集 ▼」/「閉じる ▲」)。「編集」ボタン
   押下で、セレクトボックスがテキスト入力に切り替わり、選択中の条件名を
   編集できる(`blur`で確定)。セレクトの選択肢としてではなく現在値としてしか
   名前を表示できない都合上、会社名ニックネーム編集(テーブルセル内で常時
   編集可能)とは異なり、明示的な「編集」ボタンで編集モードへ切り替える
   方式にする。展開時: 12項目のチェックボックスを4列グリッド
   (`grid-template-columns: repeat(4, minmax(0, 1fr))`)で表示する
3. **結果エリア**: 「該当{N}件」(左)と「選択をウォッチリストへ」ボタン(右端、
   同一行で`justify-content: space-between`)。その下に一覧テーブル(列: 選択
   チェックボックス / 株式コード / 銘柄名 / 現在値 / トレンド / 該当シグナル)。行の色
   (上昇=赤っぽい、下降=緑っぽい)とトレンドの定義は、
   [09-trend-direction-and-market-colors.md](09-trend-direction-and-market-colors.md)
   を参照する。既にウォッチリストへ
   登録済みの銘柄は「登録済み」の表示に置き換える(選択不可にはしない)。
   最下部にページング(ページ番号方式、`‹ 1 2 3 … 10 ›`)を中央揃えで配置する

#### 結果エリアのチャート表示(追加仕様)

結果エリアを左右2カラムに分け、左に一覧テーブル、右にチャートパネルを配置する
(左:右 = 約1.05:1)。

- 一覧テーブルの列幅は固定(`table-layout: fixed`): 選択チェックボックス48px /
  連番56px / 株式コード88px / 銘柄名176px(はみ出す分は`text-overflow: ellipsis`で省略し、
  `title`属性で全文を表示) / 現在値120px / トレンド80px / 該当シグナル(残り全幅)
- 行(チェックボックス以外の部分)をクリックすると、その銘柄が「表示中」になり、
  右のチャートパネルが切り替わる。表示中の行はハイライトする(青系: 背景`--pill-blue-bg`と、左端の内側の線
  `--pill-blue-text`。緑だと、下降の行の緑と見分けがつかないため、緑から青系に変えた。
  トレンドの色より優先する)。チェックボックス
  の操作(選択)では、チャートは切り替えない
- チャートパネルの内容: 見出し「{コード} {銘柄名}」、補足「日足・直近90営業日
  (J-Quants)」、ローソク足チャート(既存の`CandlestickChart`を流用、5日
  移動平均線付き。ボリンジャーバンド・出来高は表示しない)、最下部に1行の
  サマリ(「終値 / 5日移動平均 / 期間高値・期間安値」。数値を先に示し、断定的な
  言い回しは使わない)
- 未選択の間(初期表示・検索のやり直し直後)は、チャートパネルに「行をクリック
  すると日足チャートを表示します」と表示する。検索・条件の適用・ページ送り
  などで表示中の銘柄が一覧から消えた場合も、未選択に戻す
- 縦の高さ: チャートパネルは固定高さ(約420px)で、表の高さには合わせない。上端
  を表と揃え、スクロール時も画面内に残るよう`position: sticky`とする。行数が
  少ない場合は空行を補わず、表の下が空くだけでよい
- 幅が約1100px未満のときは縦積みにし、チャートパネルを表の下に配置する

モックアップ(ダークテーマ、参考): https://claude.ai/artifact/HccX7ByGcyekg8B1kkXH3a

### DBスキーマ

**`trend_candidate`テーブル(新規)**

- `id` (PK, auto increment)
- `code`
- (銘柄名は`trend_code_name`で管理するため、本テーブルには持たない(08参照))
- `detail` (JSON。直近60〜90営業日分の日足OHLCV履歴。例:
  `{"history": [{"date": "2026-09-28", "o": 1200, "h": 1250, "l": 1190,
  "c": 1234, "v": 254000}, ...]}`。閾値・期間を検索時に可変にできるよう、
  計算済みシグナル値ではなく生データを保持する)
- `created_at` / `updated_at` / `deleted_at`

取得(スキャン)実行のたびにテーブルをTRUNCATEしてから一括INSERTする(UPDATEは
行わない。過去のスキャン結果は判断材料として保持する価値が無いため)。

**`trend_candidate_condition`テーブル(新規)**

- `id` (PK, auto increment)
- `name` (条件セット名。検索実行時に仮名で自動生成され、後から「編集」ボタンで
  リネームできる。仮名の形式は実行日時から`YYYY-MM-DD_HHMM`
  (例: `2026-09-29_1432`)で生成する)
- `condition` (JSON。12シグナル項目それぞれの有効/無効と、期間・倍率等の
  パラメータを保持する。パラメータはUI上で入力させず(チェックボックスの
  有効/無効のみをユーザー操作とする)、「検索」実行時にバックエンド側が
  以下の既定値を自動で埋めて生成する。将来、値をユーザー調整可能にしたく
  なった場合も、この`condition`構造自体は変更不要でUI側に入力欄を足すだけ
  で対応できる)
- `created_at` / `updated_at` / `deleted_at`

**12シグナル項目のパラメータ既定値**(いずれもテクニカル分析で広く使われる
目安値を採用):

```json
{
  "ma_trend": {"enabled": false, "short_period": 5, "long_period": 25},
  "bullish_candle_ratio": {"enabled": false, "period_days": 5, "min_bullish_count": 3},
  "volume_surge": {"enabled": false, "period_days": 20, "multiplier": 1.5},
  "rebound_pct": {"enabled": false, "lookback_days": 20, "threshold_pct": 5},
  "bollinger_position": {"enabled": false, "period": 20, "std_dev": 2, "max_band_pct": 0.9},
  "golden_cross_recent": {"enabled": false, "short_period": 5, "long_period": 25, "recent_days": 5},
  "macd_golden_cross": {"enabled": false, "fast": 12, "slow": 26, "signal": 9},
  "rsi": {"enabled": false, "period_days": 14, "lower": 30, "upper": 70},
  "candle_quality": {"enabled": false, "body_ratio_min": 0.6},
  "high_break": {"enabled": false, "lookback_days": 20},
  "sector_relative_strength": {"enabled": false, "period_days": 20, "outperform_pct": 0},
  "ma_deviation": {"enabled": false, "period": 25, "max_deviation_pct": 10}
}
```

「検索」ボタン押下のたびに、チェックボックス選択状態+パラメータを1件の
`trend_candidate_condition`として自動保存する(明示的な保存操作は無い)。

**`trend_candidate_result`テーブル(新規)**

- `id` (PK, auto increment)
- `condition_id` (`trend_candidate_condition.id`に対応。FK制約なし・アプリ側で
  整合性管理)
- `code`
- `created_at` / `updated_at` / `deleted_at`

「検索」実行時に、該当した銘柄コードを`condition_id`に紐付けて保存する
(=直近の`trend_candidate`スキャン結果に対する絞り込み結果のキャッシュ)。
どのパラメータで実行した結果かは`condition_id`経由で`trend_candidate_condition`
を参照すれば分かるため、本テーブルに条件パラメータを重複して持たせない。

新規スキャン(`trend_candidate`のTRUNCATE+再INSERT)が走るたびに、本テーブルの
全行をDELETEしてから、以後の検索結果をINSERTしていく(過去のスキャン時点の絞り
込み結果は、状況が変わるため参照価値が無い)。

**`trend_system`テーブル(新規)**

- `id` (PK, auto increment)
- `key` (VARCHAR, UNIQUE)
- `value` (TEXT)
- `created_at` / `updated_at` / `deleted_at`

用途は状態管理に限らない汎用key-value設定テーブルとする。初期用途として、
最終スキャン実行日時(`key = "screening_last_run_at"`)を保持し、24時間クール
ダウンの判定に使う。

**全テーブル共通の方針**: `created_at` / `updated_at` / `deleted_at`は、実際の
アクセスパターン上使わない列があっても例外を作らず全テーブルに統一して持たせる
(例: `trend_candidate`はTRUNCATE運用のため`deleted_at`は実質使われないが、
列としては保持する)。

### J-Quants連携

- 対象API: J-Quants API V2(`x-api-key`ヘッダーによるAPIキー単体認証。トークン
  発行フローは不要、有効期限も無い)
- ベースURL: `https://api.jquants.com/v2`(公式ドキュメントで確認済み)
- 銘柄マスタ取得: `/equities/master`(東証プライム銘柄を絞り込んで対象リストと
  する)
- 日足データ取得: `/equities/bars/daily`(銘柄ごとに直近60〜90営業日分の
  OHLCVを取得する)
- レート制限: Free版 5req/分、Light版 60req/分。安全マージンを持たせ、実装は
  「64秒あたり」のペース(Free版 5req/64秒、Light版 60req/64秒)で制御する
- プラン設定: `JQUANTS_RATE_LIMIT_PER_64S`(既定5)・`JQUANTS_MAX_STOCKS`
  (既定10)を環境変数化する。Light版契約後は60・1600(対象銘柄数)へ変更する
  ことで、コード変更無しにフルスキャンへ移行できる
- 既存の`yfinance_client.py`(機能A/B/Cで使用)とは相互依存させない。発掘機能
  専用に新規`jquants_client.py`を作成する

### API Keyの扱い

- `.env`(`.gitignore`対象)に`JQUANTS_API_KEY`の実値を設定する
- ベースURLも`JQUANTS_BASE_URL`(既定`https://api.jquants.com/v2`)として
  `.env`で設定可能にする(ハードコードしない。将来ホストが変わった場合や
  検証環境切替にコード変更無しで対応できるようにする)
- `.env.example`には`JQUANTS_API_KEY`のキー名のみ、`JQUANTS_BASE_URL`は
  既定値付きで記載する(既存の`ANTHROPIC_API_KEY`と同じ方針)
- `docker-compose.yml`の`backend`サービスの`environment`に
  `JQUANTS_API_KEY: ${JQUANTS_API_KEY:-}` / `JQUANTS_BASE_URL:
  ${JQUANTS_BASE_URL:-https://api.jquants.com/v2}`を追加し、`backend`側は
  `os.environ.get("JQUANTS_API_KEY")` / `os.environ.get("JQUANTS_BASE_URL", "https://api.jquants.com/v2")`
  で読み込む
- `JQUANTS_API_KEY`が未設定の場合、発掘画面の「取得」ボタンは無効化し、
  「J-Quants APIキーが未設定です」等のメッセージを表示する

### API(backend / FastAPI)

- `POST /screening/scan` — 取得(スキャン)を開始する。非同期(`BackgroundTasks`)。
  開始前に`trend_system`へ実行開始日時を書き込んでからバックグラウンド処理を
  起動する(クールダウン判定・二重実行防止のため)。クールダウン中は423等で
  拒否する。個別銘柄の取得に失敗しても処理は継続し、失敗銘柄はスキップする
- `GET /screening/status` — 最終スキャン日時、次回実行可能までの残り時間、
  現在の稼働モード(Free/Light相当のレート制限・対象銘柄数)を返す
- `POST /screening/search` — 有効化されたシグナル項目(チェックボックス選択
  状態)のみを受け取る(数値パラメータはフロントから送らず、バックエンド側が
  既定値一覧を自動で適用する)。現在の`trend_candidate`に対して絞り込みを
  行う。同期処理(FastAPIの`def`
  エンドポイントとして定義し、自動的にスレッドプールへオフロードすることで
  イベントループの専有を避ける。`BackgroundTasks`によるポーリングは導入しない)。
  実行のたびに`trend_candidate_condition`を自動生成し、
  `trend_candidate_result`を生成する
- `GET /screening/conditions` — 保存済み条件の一覧を返す(セレクトボックスの
  選択肢用)
- `PATCH /screening/conditions/{id}` — 条件名のリネーム
- `DELETE /screening/conditions/{id}` — 条件のソフトデリート
- `GET /screening/results/{condition_id}` — 「適用」ボタン押下時に呼ぶ。指定
  条件の直近`trend_candidate_result`をページング付きで返す(再計算なし)。
  各項目に`daily_trend`(`up` / `down` / `flat` / `null`)を含める。保存済みの日足から、
  表示のときに計算する。`ma_trend`が条件に含まれ、判定が`up`でないときは`null`
  (画面は「—」)にする。`ma_trend`には閾値が無く、絞り込みの結果と食い違う「横ばい」を
  出さないため
- `POST /screening/register` — 選択した銘柄コードの配列を受け取り、まとめて
  ウォッチリスト(`trend`)へ登録する。既にウォッチリストへ存在するコードは
  スキップし、レスポンスでスキップ件数を返す
- `GET /screening/candidates/{code}/candles` — 指定コードの`trend_candidate`
  に保存済みの日足から、チャート表示用のデータを返す。レスポンスは
  `{code, name, candles: [{time("YYYY-MM-DD"), open, high, low, close, volume}],
  sma5: [{time, value}]}`。`sma5`は終値の5日単純移動平均(5本未満の期間は含めない)
  で、backendで計算する。`trend_candidate`に該当コードが無ければ404を返す。
  J-Quantsへの問い合わせは行わない

### コンポーネント(frontend)

`ScreeningPage.tsx`を「画面デザイン」節のレイアウトに沿って本実装する。

- ステータス/取得エリア: `GET /screening/status`をポーリングし、クールダウン
  残り時間を表示更新する。「取得」ボタン押下で`POST /screening/scan`を呼び、
  以後はステータスのポーリングで進捗(完了)を検知する
- 条件エリア: 12項目のチェックボックス状態をローカルstateで保持。「検索」
  ボタン押下で`POST /screening/search`を呼び、レスポンスの`condition_id`で
  結果エリアを更新する。保存済み条件セレクトは`GET /screening/conditions`
  から取得する。「編集」ボタン押下でセレクトをテキスト入力に切り替え、
  `blur`で`PATCH /screening/conditions/{id}`を呼んでリネームを確定する
  (セレクトの現在値表示しかできない都合上、`WatchlistRow`の会社名
  ニックネームのような常時編集可能なテーブルセル方式ではなく、明示的な
  編集ボタンで切り替える方式にする)
- 結果エリア: テーブル各行にチェックボックスを持ち、選択状態をローカルstateで
  管理する。「選択をウォッチリストへ」ボタン押下で`POST /screening/register`
  を呼び、成功後は該当行を「登録済み」表示に切り替える
- チャートパネル(`ScreeningChartPanel.tsx`、追加仕様): 表示中の銘柄コードを
  `ScreeningResultsPanel`のstateで保持し、変化のたびに
  `GET /screening/candidates/{code}/candles`を呼ぶ。既存の`CandlestickChart`
  (`candles`と`sma5`のみ渡す)を流用する。読み込み中・取得失敗・未選択の各状態を
  パネル内に表示する(失敗はインラインの赤字メッセージ)。短時間に行を切り替えた
  場合、後から選んだ銘柄のレスポンスだけを反映する(古いレスポンスで上書きしない)

### データフロー

1. 取得: 「取得」ボタン押下 → `POST /screening/scan` →
   (バックエンド)`trend_system`へ実行開始日時を記録 → バックグラウンドで
   J-Quantsから銘柄マスタ+日足データを取得(64秒間隔でペーシング、失敗銘柄は
   スキップ) → `trend_candidate`をTRUNCATE+一括INSERT →
   `trend_candidate_result`を全件DELETE(過去スキャン分の結果を無効化)
2. 検索: チェックボックス選択 → 「検索」ボタン押下 →
   `POST /screening/search`(既定パラメータをバックエンド側で自動適用) →
   `trend_candidate_condition`を自動生成 →
   `trend_candidate`に対しJSON条件でAND絞り込み → 該当コードを
   `trend_candidate_result`へ保存 → 結果エリアへ反映
3. 条件の再利用: 保存済み条件セレクトで選択 → 「適用」でチェックボックスへ
   反映すると同時に`GET /screening/results/{condition_id}`から直近の結果を
   そのまま表示する(検索は走らない、再計算なし)。独立した「表示」ボタンは
   設けない(画面デザイン節のボタン列に含めていない為、「適用」に統合する)
4. ウォッチリスト登録: 結果一覧から複数選択 → 「選択をウォッチリストへ」→
   `POST /screening/register` → 成功銘柄は「登録済み」表示、既存重複は
   スキップ件数として通知

### エラー処理

既存方針を踏襲し、専用のトースト等は導入しない。

- `JQUANTS_API_KEY`未設定: 「取得」ボタンを無効化し、インラインメッセージで
  案内する
- クールダウン中の取得: ボタンを無効化し、残り時間を表示する(そもそも押下
  できない状態にする)
- スキャン中の個別銘柄取得失敗: 処理は継続し、失敗銘柄は`trend_candidate`に
  含めない(スキップ)
- 検索・登録APIの呼び出し失敗: 該当エリア直下にインラインで赤字エラー
  メッセージを表示する

### テスト方針

- backend: pytestで以下を重点的に単体テストする
  - `trend_candidate`のTRUNCATE+一括INSERTロジック
  - `trend_candidate_condition`の自動生成・リネーム・ソフトデリート
  - `trend_candidate_result`の生成、および新規スキャン時の全件無効化
  - JSON条件によるAND絞り込みクエリ
  - クールダウン判定(`trend_system`の最終実行日時を用いた24時間チェック)
  - `JQUANTS_API_KEY`未設定時に取得APIが適切に拒否すること
  - ウォッチリスト登録時の重複コードスキップ挙動
  - `jquants_client.py`のレート制限ペーシング(64秒あたりのリクエスト数)
  - `GET /screening/candidates/{code}/candles`: 保存済み日足がローソク足の形式で
    返ること・`sma5`の値・未登録コードで404・J-Quantsを呼ばないこと
- frontend: vitestで以下をコンポーネントテストする
  - クールダウン中の「取得」ボタンの無効化表示
  - チェックボックス選択→検索→結果一覧反映の一連の挙動
  - 条件エリアの開閉トグル(デフォルト閉であること含む)
  - 「編集」ボタン押下によるセレクト→テキスト入力への切り替え、blur確定
  - 「登録済み」表示の切り替え
  - 行クリックでチャートパネルが切り替わり、チェックボックス操作では切り替わらない
    こと。未選択時の案内表示。表示中の銘柄が一覧から消えたときに未選択へ戻ること。
    行を素早く切り替えたときに、古いレスポンスで上書きされないこと
  - 結果表が`table-layout: fixed`の列幅クラスを持つこと
  - 「連番」列がチェックボックスの右隣にあり、1から始まりページを跨いで続くこと

### 時刻の扱い

本アプリ全体で、DBに保存する日時(`created_at`/`updated_at`/`deleted_at`、
`trend_system`の実行開始日時、条件名の採番)は日本時間(JST)のnaiveな
日時とする。時刻の取得は`backend/app/clock.py`の`now_jst()`に統一し、
`datetime.utcnow`は使わない。クールダウン判定(24時間)や取得間隔の判定も
同じJST基準で行う。フロントは、サーバーが返すタイムゾーン表記なしの
日時文字列をJSTとして解釈する。マイグレーション機構が無いため、UTCで
保存済みの既存データがある環境はDBを作り直す。

## 追記: AIDDS-17・AIDDS-18(2026-10-07)

- 結果のAPI(`GET /screening/results/{condition_id}`)と、結果エリアのページ分け、トレンドの表示は、
  [09-trend-direction-and-market-colors.md](09-trend-direction-and-market-colors.md)の末尾の節が有効
  (AIDDS-17: 全件を返し、フロントでページ分け。`type_daily_trend`を、`up`などで表示。`none`の銘柄は、一覧に出さない)
- 結果一覧の「トレンド」列の見出しに、添え書きを付ける(AIDDS-18)。同じ節が有効
