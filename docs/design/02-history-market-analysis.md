# doc-spec: 詳細画面-履歴/市場分析(機能B)

## 追記の一覧

元の本文は、合意済みなので、書き換えない。追記が、あとの合意として、有効になる。

- AIDDS-20(2026-10-19): アプリ名を「トレンド羅針盤」に変更する。本文の「株価羅針盤」は、「トレンド羅針盤」と読み替える。詳細は、[01-watchlist-foundation.md](01-watchlist-foundation.md) の追記(AIDDS-20)

## 機能概要

詳細画面(`/trends/:code`)に、対象銘柄の履歴データ(ローソク足チャート・移動平均・
直近60日高値安値・出来高)と市場分析(業種平均との相対強度・マクロ指標との相関)を
表示する。機能Aで作成済みのプレースホルダー画面(`DetailPlaceholderPage`)を実体に
置き換える。データはローソク足描画に用いる生データも含め、一覧の取得・更新時に
まとめて取得し`trend.detail`(JSON列)へ保存する。詳細画面はDBに保存済みのデータを
読むだけで、新規のyfinance呼出は発生しない。

ニュース・センチメント判定(機能C)は本doc-specの対象外。

## 実装背景

株価羅針盤は「予測」ではなく「傾向分析・助言」を主軸とするアプリであり、一覧画面の
簡易な所見だけでなく、判断材料となる生データ(履歴・市場全体との比較)を詳細画面で
確認できることが企画の核。詳細な企画背景は `docs/brainstorming-intake.md` を参照。

## 影響・対象範囲

- 対象: `backend/app/yfinance_client.py`への履歴取得関数追加、新規
  `history_service.py`/`market_analysis_service.py`、`trend_service.py`の
  `create_trend`/`refresh_trends`拡張、`GET /trends/{code}`エンドポイント追加、
  `DetailPlaceholderPage`を実体の詳細画面に置き換え
- 対象外: ニュース取得・センチメント判定(機能C)、一覧画面(`GET /trends`)の
  レスポンス形式変更(`detail`は一覧では返さない)

## ゴール

- 詳細画面を開くと、直近20日のローソク足チャート・5日移動平均線・直近60日高値安値・
  出来高(前日比)が表示される
- 市場分析欄に、日経225(業種指数の代用)との直近5日相対強度、米10年債利回り・
  USD/JPYとの直近20日Pearson相関係数が表示される
- 履歴/市場分析データの取得に失敗しても、銘柄の取得・所見表示自体は失敗しない
  (`detail`が空のまま保存され、詳細画面には「データ未取得」の控えめな文言を表示)

## 対象外

- ニュース取得・センチメント判定(機能C、別doc-specで扱う)
- 厳密な業種別指数(TOPIX-17等)の使用。yfinance単体では専用ティカーが無いため、
  日経225(`^N225`)を市場全体の代用指標として使う
- 詳細画面を開いた際のライブ再取得(常に一覧の取得・更新タイミングのデータを表示する)

## 解決策・技術アーキテクチャ

### 全体構成

既存のFastAPI+SQLAlchemy+MySQL(backend)、React+Vite+TypeScript(frontend)構成に
増築する。新規処理は全てbackend側で行い、`trend.detail`(既存のJSON列、現状は常に
`{}`)へ計算済みデータを保存する。フロントは詳細画面表示時に`GET /trends/{code}`で
その保存済みデータを読むだけで、新規のyfinance呼出は発生しない。

チャート描画には`lightweight-charts`(TradingView製、ローソク足描画特化、軽量)を
新規導入する。

### backend

- `yfinance_client.py`: `get_price_history(code: str, days: int = 90) -> list[dict]`
  を追加。既存`get_quote`とは別関数として分離(単一責務維持)。返り値は
  `[{"date": "2026-09-01", "open": .., "high": .., "low": .., "close": .., "volume": ..}, ...]`
  形式で、直近`days`日分(暦日)を返す
- `history_service.py`(新規): `build_history_detail(candles: list[dict]) -> dict`。
  直近20日分の`candles`(ローソク足描画用)、5日移動平均の最新値、直近60日分の
  高値・安値、出来高の前日比(%)を算出して返す
- `market_analysis_service.py`(新規): `build_market_analysis_detail(code: str, candles: list[dict]) -> dict`。
  日経225(`^N225`)の直近5日変動率と対象銘柄の直近5日変動率の差(相対強度、pt単位)、
  米10年債利回り(`^TNX`)・USD/JPY(`JPY=X`)それぞれの直近20日価格系列と対象銘柄の
  直近20日価格系列のPearson相関係数を算出して返す。`sector_label`はyfinanceの
  `info.get("industry")`をそのまま(英語表記のまま)使う
- `trend_service.py`: `create_trend`/`refresh_trends`で`get_quote`成功後、
  `get_price_history`→`history_service`/`market_analysis_service`を呼び出す。
  この一連の呼出は`try/except`で包み、失敗時はログのみ出力して`detail={}`のまま
  処理を継続する(現在値・所見の保存は妨げない)
- `schemas.py`: `TrendDetailOut`を追加(`TrendOut`の全フィールド + `detail: dict`)。
  一覧用の`TrendOut`は変更しない
- `routers/trends.py`: `GET /trends/{code}`を追加。対象codeの最新行
  (`deleted_at IS NULL`)を`TrendDetailOut`で返す。存在しなければ404

`detail`のJSON構造:
```json
{
  "history": {
    "candles": [{"date": "2026-09-01", "open": 2900.0, "high": 2920.0, "low": 2890.0, "close": 2914.0, "volume": 1234000}, "...(直近20日分)"],
    "sma5_latest": 2861.0,
    "high_60d": 2940.0,
    "low_60d": 2680.0,
    "volume_change_pct": 18.0
  },
  "market_analysis": {
    "sector_label": "Auto Manufacturers",
    "relative_strength_5d_pt": 0.5,
    "macro_correlation": {"us10y": -0.31, "usdjpy": 0.62}
  }
}
```

### frontend

- 依存追加: `lightweight-charts`
- `DetailPage.tsx`(既存`DetailPlaceholderPage.tsx`を置き換え): マウント時に
  `GET /trends/{code}`を呼び、`detail.history`/`detail.market_analysis`が空なら
  「データ未取得」の文言を表示、値があれば`CandlestickChart`/`MarketAnalysisPanel`
  へ渡して描画
- `CandlestickChart.tsx`: `lightweight-charts`のラッパー。`candles`と`sma5_latest`
  を受け取り描画
- `MarketAnalysisPanel.tsx`: `relative_strength_5d_pt`(バー表示)と
  `macro_correlation`(2項目のテキスト表示)を受け取り描画
- `types.ts`: `TrendDetail`型を追加(`Trend`型 + `detail: { history, market_analysis } | null`)

### エラー処理

- `get_quote`失敗: 既存通り404(`InvalidCodeError`)
- 履歴/市場分析取得(`get_price_history`以降)の失敗: 個別にcatchしログのみ出力、
  `detail={}`のままcommitを継続する。一覧の取得・更新自体は失敗させない
- `GET /trends/{code}`: 対象codeの最新行が存在しない場合404

### テスト方針

- backend: `history_service`/`market_analysis_service`の単体テスト
  (既知の入力candlesでSMA・相対強度・相関の計算値を検証、yfinance呼出はモック)
- `trend_service`: 履歴/市場分析取得が例外を出しても`create_trend`/`refresh_trends`
  が例外を伝播せず処理を継続することの確認テスト
- API: `GET /trends/{code}`の200(detail含む)/404
- frontend: `CandlestickChart`/`MarketAnalysisPanel`はpropsが正しく渡り、想定する
  DOM要素(コンテナ・数値テキスト等)が生成されることを確認するレベルに留める
  (`lightweight-charts`はcanvas描画のためjsdom上での描画内容そのものの検証は行わない)。
  `DetailPage`はAPIをモックした統合テストで、データ有無それぞれの表示分岐を確認する
