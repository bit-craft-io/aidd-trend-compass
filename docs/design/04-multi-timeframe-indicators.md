# doc-spec: 足種切替+テクニカル指標選択式追加(機能B拡張)

## 機能概要

詳細画面の履歴データ表示を拡張し、足種(5分/10分/15分/日足/週足/月足)の切替と、
テクニカル指標(RSI/MACD/ボリンジャーバンド)の選択式追加表示に対応する。機能B
(`docs/design/02-history-market-analysis.md`)の直接の延長であり、既存の
ローソク足チャート・SMA5・市場分析(業種相対強度・マクロ相関)の枠組みを踏襲する。

TradingView(https://jp.tradingview.com/)を参考にした拡張候補のうち、本doc-specは
「足種切替」「テクニカル指標選択式追加」の2点のみを対象とする。「アラート」
「経済カレンダー」は別途、前提(通知先・データ取得元)を詰めた上で別doc-specとして
扱う(`docs/brainstorming-intake.md`の「追加検討候補」節参照)。

## 実装背景

機能A・機能B・横断的UI基盤(テーマ設定)の実装完了後、ユーザーより
TradingView相当の機能追加要望が出た。詳細な経緯は
`docs/brainstorming-intake.md`の「追加検討候補」節を参照。

## 影響・対象範囲

- 対象:
  - backend: `yfinance_client.py`(分足取得関数追加)、`timeframe_service.py`(新規、
    resample処理)、`indicator_service.py`(新規、RSI/MACD/ボリンジャーバンド/SMA5算出)、
    `history_service.py`(足種・指標を受け取る形に改修)、`market_analysis_service.py`
    (yfinance呼出しを排除し純粋な計算関数化、算出ロジック自体は無変更)、
    `trend_service.py`(`_build_detail`を生データ・マクロ系列の保存に改修、
    新規`build_detail_view`で読み取り時の加工を担う)、`schemas.py`、
    `routers/trends.py`(`GET /trends/{code}`にquery param追加)、
    `requirements.txt`(`pandas-ta`追加)
  - frontend: `theme/`と対になる`chartSettings/ChartSettingsContext.tsx`(新規)、
    `ChartControls.tsx`(新規)、`IndicatorPanel.tsx`(新規)、`CandlestickChart.tsx`
    (ボリンジャーバンド重ね書き対応)、`DetailPage.tsx`、`types.ts`、`api/trends.ts`
- 対象外: 一覧画面(`GET /trends`)、機能A(基盤・一覧)、テーマ設定、市場分析の
  算出ロジック自体(相対強度・相関の計算式は無変更)、アラート、経済カレンダー

## ゴール

- 詳細画面の履歴データ欄に足種切替タブ(5分/10分/15分/日足/週足/月足)が表示され、
  選択した足種のローソク足チャートに切り替わる
- RSI/MACD/ボリンジャーバンドをチェックボックスで任意にON/OFFでき、複数同時表示できる
- 選択した足種・指標は`localStorage`へ永続化され、次回訪問時・別銘柄表示時も
  同じ設定が引き継がれる(全銘柄共通の1設定)
- 足種切替・指標のON/OFF・詳細画面の表示そのものは、外部API(yfinance)への
  追加問い合わせを一切発生させない。yfinance呼出しは既存通り「更新」ボタン
  (`refresh_trends`)と「コード入力し取得」(`create_trend`)の2箇所のみに限定する
  (市場分析が使う業種指数・マクロ指標の系列も、この2箇所でまとめて取得・保存する)
- 市場分析(業種相対強度・マクロ相関)は、生データ取得元の変更後も現状と同じ値を
  算出し続ける(算出ロジック自体への影響が無いことを確認する)

## 対象外

- 1分足: yfinance側の取得可能期間が直近7日分のみと短く、実用上の価値が薄いため
  見送り(`docs/brainstorming-intake.md`で既に決定済み)
- 指標の計算期間カスタマイズ: RSI=14、MACD=12/26/9、ボリンジャーバンド=20期間・2σの
  標準値で固定とし、ユーザーによる変更UIは設けない
- 銘柄ごとの個別設定: 足種・指標の選択は全銘柄共通の1設定とし、銘柄ごとに
  別々の設定を記憶する機能は設けない
- アラート、経済カレンダー: 別途、前提を詰めた上で別doc-specとして扱う
- 詳細画面の日足チャート表示レンジが、既存の90日から約60日に狭まる点(後述)は
  許容する(1系統のみの生データ取得を優先するための既知のトレードオフ)

## 解決策・技術アーキテクチャ

### 全体構成

生データの取得元を「日足90日」から「5分足60日(1系統のみ)」へ切り替える。あわせて
市場分析が使う業種指数(`^N225`)・マクロ指標(`^TNX`・`JPY=X`)・業種ラベルも、
従来通り「更新」「コード入力し取得」のタイミングでまとめて取得し`trend.detail`へ
保存する。`GET /trends/{code}`(足種切替・指標ON/OFF・詳細画面の初回表示を含む)は
**保存済みデータのみを加工して応答し、yfinanceへは一切問い合わせない**。

```
[refresh/create]                                    [GET /trends/{code}?interval=..&indicators=..]
yfinance(5分足60日 + ^N225/^TNX/JPY=X日足 + 業種ラベル) ──┐        trend.detail ──┐
                                                          ↓                       ↓
                          trend.detail = {                          timeframe_service.resample_candles()
                            "raw_candles": [...],                              ↓
                            "sector_label": "...",                   history_service / indicator_service
                            "macro_candles": {"index": [...],       market_analysis_service(保存済みmacro使用)
                                               "us10y": [...],                  ↓
                                               "usdjpy": [...]}       API応答(history/market_analysis)
                          }
```

### backend

#### `yfinance_client.py`

`get_intraday_history(code: str, interval: str = "5m", period: str = "60d") -> list[dict]`
を追加(既存`get_price_history`は残置しない、本機能で置き換える)。

```python
def get_intraday_history(code: str, interval: str = "5m", period: str = "60d") -> list[dict]:
    symbol = _to_yf_symbol(code)
    try:
        ticker = yf.Ticker(symbol)
        history = ticker.history(period=period, interval=interval)
    except Exception as exc:
        raise InvalidCodeError(code) from exc

    if history.empty:
        raise InvalidCodeError(code)

    candles = []
    for dt, row in history.iterrows():
        candles.append(
            {
                "datetime": dt.isoformat(),
                "open": float(row["Open"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
                "close": float(row["Close"]),
                "volume": int(row["Volume"]),
            }
        )
    return candles
```

返り値の`datetime`はISO8601形式(タイムゾーン情報込み)とし、既存`get_price_history`の
`date`(日付のみ)フィールドと区別する。

#### `timeframe_service.py`(新規)

```python
import pandas as pd

INTERVAL_TO_PANDAS_RULE = {
    "5m": "5min",
    "10m": "10min",
    "15m": "15min",
    "1d": "1D",
    "1wk": "1W",
    "1mo": "1ME",
}


def resample_candles(raw_candles: list[dict], interval: str) -> list[dict]:
    if not raw_candles:
        return []
    if interval not in INTERVAL_TO_PANDAS_RULE:
        raise ValueError(f"unsupported interval: {interval}")

    df = pd.DataFrame(raw_candles)
    df["datetime"] = pd.to_datetime(df["datetime"])
    df = df.set_index("datetime")

    rule = INTERVAL_TO_PANDAS_RULE[interval]
    agg = df.resample(rule).agg(
        {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}
    )
    agg = agg.dropna(subset=["open"])

    is_intraday = interval in ("5m", "10m", "15m")
    candles = []
    for dt, row in agg.iterrows():
        candles.append(
            {
                "time": int(dt.timestamp()) if is_intraday else dt.strftime("%Y-%m-%d"),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": int(row["volume"]),
            }
        )
    return candles
```

- `interval="5m"`は生データそのものと解像度が同じだが、他の足種と処理経路を統一する
  ため同じ`resample`を通す(結果は実質パススルー)
- `10m`はyfinance非対応のintervalだが、5分足から`resample("10min")`で自然に合成できる
  (特別分岐不要)
- `time`フィールドは、分足では`lightweight-charts`が要求するUNIX秒(int)、日足以上では
  従来通り`"YYYY-MM-DD"`文字列とする(下記frontend節の技術注意を参照)

#### `indicator_service.py`(新規)

pandas-taを用いて指標を算出する。SMA5もここへ統合し、`history_service.py`側の
手実装`_rolling_sma`を廃止する。

**既知の互換性問題と対処**: このプロジェクトのnumpyは`2.5.3`。pandas-taの最新
PyPI版(`0.3.14b0`)は内部で`from numpy import NaN as npNaN`を使っており、
numpy 2.0以降で`numpy.NaN`が削除された為`import pandas_ta`自体が失敗する既知の
不具合がある。`pandas_ta`をimportする直前に以下の互換シムを置くことで回避する
(コミュニティで定番の回避策):

```python
import numpy as np
if not hasattr(np, "NaN"):
    np.NaN = np.nan  # pandas-ta(numpy>=2.0未対応)向けの互換シム
```

この回避策でも`import pandas_ta`が失敗する場合は、pandas-taへの依存を諦め、
既存`_rolling_sma`と同じ手実装パターンでRSI/MACD/ボリンジャーバンドを
自前実装するフォールバックへ切り替える(実装Task内で最初に検証し、
問題があればplanのRuling対象とする)。

```python
import pandas as pd
import pandas_ta as ta


def compute_sma5(candles: list[dict]) -> list[dict]:
    closes = pd.Series([c["close"] for c in candles])
    sma = ta.sma(closes, length=5)
    return [
        {"time": c["time"], "value": round(float(v), 1)}
        for c, v in zip(candles, sma)
        if pd.notna(v)
    ]


def compute_rsi(candles: list[dict]) -> list[dict]:
    closes = pd.Series([c["close"] for c in candles])
    rsi = ta.rsi(closes, length=14)
    return [
        {"time": c["time"], "value": round(float(v), 1)}
        for c, v in zip(candles, rsi)
        if pd.notna(v)
    ]


def compute_macd(candles: list[dict]) -> dict:
    closes = pd.Series([c["close"] for c in candles])
    macd_df = ta.macd(closes, fast=12, slow=26, signal=9)
    macd_col, signal_col, hist_col = macd_df.columns
    macd_line = [
        {"time": c["time"], "value": round(float(v), 2)}
        for c, v in zip(candles, macd_df[macd_col])
        if pd.notna(v)
    ]
    signal_line = [
        {"time": c["time"], "value": round(float(v), 2)}
        for c, v in zip(candles, macd_df[signal_col])
        if pd.notna(v)
    ]
    histogram = [
        {"time": c["time"], "value": round(float(v), 2)}
        for c, v in zip(candles, macd_df[hist_col])
        if pd.notna(v)
    ]
    return {"macd": macd_line, "signal": signal_line, "histogram": histogram}


def compute_bollinger(candles: list[dict]) -> dict:
    closes = pd.Series([c["close"] for c in candles])
    bb_df = ta.bbands(closes, length=20, std=2)
    lower_col, mid_col, upper_col = bb_df.columns[0], bb_df.columns[1], bb_df.columns[2]
    return {
        "upper": [
            {"time": c["time"], "value": round(float(v), 1)}
            for c, v in zip(candles, bb_df[upper_col])
            if pd.notna(v)
        ],
        "middle": [
            {"time": c["time"], "value": round(float(v), 1)}
            for c, v in zip(candles, bb_df[mid_col])
            if pd.notna(v)
        ],
        "lower": [
            {"time": c["time"], "value": round(float(v), 1)}
            for c, v in zip(candles, bb_df[lower_col])
            if pd.notna(v)
        ],
    }
```

`pandas_ta`の`bbands`/`macd`が返すDataFrameの列名はバージョン依存のため、列名を
直接文字列指定せず`columns`の位置から取得する(実装時にインストールされた
`pandas-ta`のバージョンで実際の列順を確認して固定する)。

#### `history_service.py`(改修)

```python
def build_history_detail(raw_candles: list[dict], display_candles: list[dict], indicators: list[str]) -> dict:
    if not display_candles:
        return {}

    high_60d = max(c["high"] for c in raw_candles)
    low_60d = min(c["low"] for c in raw_candles)

    latest_volume = display_candles[-1]["volume"]
    previous_volume = display_candles[-2]["volume"] if len(display_candles) >= 2 else None
    volume_change_pct = (
        round((latest_volume - previous_volume) / previous_volume * 100, 1)
        if previous_volume
        else 0.0
    )

    detail = {
        "candles": display_candles,
        "sma5": compute_sma5(display_candles),
        "high_60d": high_60d,
        "low_60d": low_60d,
        "volume_change_pct": volume_change_pct,
    }
    if "rsi" in indicators:
        detail["rsi"] = compute_rsi(display_candles)
    if "macd" in indicators:
        detail["macd"] = compute_macd(display_candles)
    if "bollinger" in indicators:
        detail["bollinger"] = compute_bollinger(display_candles)
    return detail
```

- `raw_candles`: 生の5分足全件(60日分)。`high_60d`/`low_60d`は選択中の足種に
  依らず常にこの全件から算出する(足種切替で値が変動しない)
- `display_candles`: `timeframe_service.resample_candles(raw_candles, interval)`の結果
  (チャート描画・SMA5・RSI/MACD/ボリンジャーバンドの算出対象)
- 既存の「直近20日分のみ表示」という絞り込みは廃止し、resample結果を全件表示する
  (日足の場合、5分足60日分から生成される日足本数はおおむね40〜60本程度になる想定)

#### `market_analysis_service.py`(改修、算出ロジックは無変更・I/Oを排除)

yfinance呼出し(`get_industry_label`・`get_price_history`)を内部から削除し、
必要なデータを全て引数で受け取る純粋な計算関数へ変える。相対強度・相関の
計算式(`_relative_strength_5d`・`_correlation_20d`)自体は無変更。

```python
def build_market_analysis_detail(
    candles: list[dict],
    index_candles: list[dict],
    us10y_candles: list[dict],
    usdjpy_candles: list[dict],
    sector_label: str,
) -> dict:
    return {
        "sector_label": sector_label,
        "relative_strength_5d_pt": _relative_strength_5d(candles, index_candles),
        "macro_correlation": {
            "us10y": _correlation_20d(candles, us10y_candles),
            "usdjpy": _correlation_20d(candles, usdjpy_candles),
        },
    }
```

`_get_price_history_cached`・`get_industry_label`/`get_price_history`のimportは
削除する(この関数はyfinanceを一切知らない状態になる)。バッチ内でのマクロ系列
使い回し(旧`cache`引数)は、fetchタイミングごと`trend_service.py`側へ移る。

#### `trend_service.py`(改修)

```python
from .yfinance_client import (
    InvalidCodeError,
    get_industry_label,
    get_intraday_history,
    get_price_history,
    get_quote,
)


def _build_detail(code: str, macro_cache: dict | None = None) -> dict:
    try:
        raw_candles = get_intraday_history(code)
    except Exception:
        logger.warning("failed to fetch intraday history for %s", code, exc_info=True)
        return {}

    if not raw_candles:
        return {}

    detail: dict = {"raw_candles": raw_candles}

    try:
        detail["sector_label"] = get_industry_label(code)
    except Exception:
        logger.warning("failed to fetch industry label for %s", code, exc_info=True)

    try:
        cache = {} if macro_cache is None else macro_cache
        detail["macro_candles"] = {
            "index": _cached_macro_fetch("^N225", cache),
            "us10y": _cached_macro_fetch("^TNX", cache),
            "usdjpy": _cached_macro_fetch("JPY=X", cache),
        }
    except Exception:
        logger.warning("failed to fetch macro series for %s", code, exc_info=True)

    return detail


def _cached_macro_fetch(ticker: str, cache: dict) -> list[dict]:
    if ticker not in cache:
        cache[ticker] = get_price_history(ticker)
    return cache[ticker]


def build_detail_view(stored_detail: dict, interval: str, indicators: list[str]) -> dict:
    raw_candles = stored_detail.get("raw_candles")
    if not raw_candles:
        return {}

    view: dict = {}
    try:
        display_candles = resample_candles(raw_candles, interval)
        view["history"] = build_history_detail(raw_candles, display_candles, indicators)
    except Exception:
        logger.warning("failed to build history view", exc_info=True)

    try:
        daily_candles = resample_candles(raw_candles, "1d")
        macro = stored_detail.get("macro_candles", {})
        view["market_analysis"] = build_market_analysis_detail(
            daily_candles,
            macro.get("index", []),
            macro.get("us10y", []),
            macro.get("usdjpy", []),
            stored_detail.get("sector_label", ""),
        )
    except Exception:
        logger.warning("failed to build market analysis view", exc_info=True)

    return view
```

- `history`/`market_analysis`の算出は、refresh/create時ではなく
  `GET /trends/{code}`アクセス時に行う形へ移動する(下記`routers/trends.py`参照)。
  ただし算出に必要な入力データ(`raw_candles`・`sector_label`・`macro_candles`)は
  全てrefresh/create時に取得・保存済みのものを使うため、読み取り時にyfinanceへ
  問い合わせることは無い
- `macro_cache`(機能B最終レビューで追加した、refreshバッチ内でのマクロ系列
  使い回し)は、fetchタイミングが変わらず`_build_detail`(refresh/create時)に
  残るため、そのまま維持する。`refresh_trends`内で`macro_cache: dict = {}`を
  用意し各`_build_detail(code, macro_cache)`呼出しへ渡す既存の配線は無変更
- `get_price_history`(日足取得、既存関数)はマクロ・業種指数専用として残置する。
  対象銘柄自身の生データ取得は`get_intraday_history`に一本化する
- `build_detail_view`は新規のモジュールレベル関数として`trend_service.py`に追加する
  (`_build_detail`のようなprivate関数ではなく、`routers/trends.py`から直接呼ぶ
  public関数)

#### `schemas.py`(改修)

```python
class TrendDetailOut(TrendOut):
    detail: dict
```

シグネチャ自体は変更しないが、`detail`の中身は`trend.detail`カラムをそのまま
返すのではなく、下記`routers/trends.py`で都度組み立てた`{"history": ..., "market_analysis": ...}`
を渡す

#### `routers/trends.py`(改修)

```python
@router.get("/{code}", response_model=TrendDetailOut)
def get_trend_detail(
    code: str,
    interval: str = "1d",
    indicators: str = "",
    db: Session = Depends(get_db),
):
    trend = trend_service.get_active_trend(db, code)
    if trend is None:
        raise HTTPException(status_code=404, detail=f"銘柄コード {code} は見つかりません")

    indicator_list = [i for i in indicators.split(",") if i]
    detail = trend_service.build_detail_view(trend.detail, interval, indicator_list)

    return TrendDetailOut(
        id=trend.id,
        code=trend.code,
        name=trend.name,
        opinion=trend.opinion,
        price_at_fetch=trend.price_at_fetch,
        created_at=trend.created_at,
        detail=detail,
    )
```

`build_detail_view`の実装は上記`trend_service.py`節を参照。

既存(機能B最終レビューで確定済み)の「履歴と市場分析はそれぞれ独立してtry/exceptし、
片方の失敗がもう片方を巻き込まない」という方針をそのまま踏襲する。

`interval`に不正な値が来た場合は422を返す(`ValueError`を`routers`側でHTTPExceptionへ変換)。

### frontend

#### `chartSettings/ChartSettingsContext.tsx`(新規、`theme/ThemeContext.tsx`と対になる構成)

```typescript
export type Interval = "5m" | "10m" | "15m" | "1d" | "1wk" | "1mo";
export type IndicatorKey = "rsi" | "macd" | "bollinger";

interface ChartSettingsContextValue {
  interval: Interval;
  indicators: IndicatorKey[];
  setInterval: (interval: Interval) => void;
  toggleIndicator: (indicator: IndicatorKey) => void;
}
```

- `localStorage`キー: `trend-compass-chart-settings`(値: `{"interval": "1d", "indicators": ["rsi"]}`
  形式のJSON)。値が壊れている・存在しない場合は`interval: "1d"`, `indicators: []`を既定値とする
- `ThemeProvider`と同様、`App.tsx`内で`ChartSettingsProvider`が`Routes`全体を包む形とし、
  全銘柄で共通の1設定として振る舞う(`DetailPage`遷移時に銘柄が変わってもリセットしない)
- SMA5は本設定の対象外(既存通り常時表示、トグル不可)

#### `ChartControls.tsx`(新規)

足種タブ(5分/10分/15分/日足/週足/月足)とRSI/MACD/ボリンジャーバンドの
チェックボックス群。`useChartSettings()`から現在値と更新関数を取得して描画する。

#### `IndicatorPanel.tsx`(新規)

RSI・MACDを、価格チャートの下に別パネル(サブチャート)として描画する
`lightweight-charts`ラッパー。選択されている指標のみ描画し、非選択時は
要素ごと非表示(高さを取らない)。`CandlestickChart.tsx`と同様のテーマ追従
(`useTheme()`経由の`effectiveTheme`監視、`readCssVar`パターン)を行う。

#### `CandlestickChart.tsx`(改修)

ボリンジャーバンド選択時、価格チャートに上限・中央・下限の3本のライン系列を
追加描画する(SMA5と同じ`addLineSeries`パターン)。`bollinger`データが渡されない
(未選択)場合は追加描画しない。

#### 技術注意: `time`フィールドの型

`lightweight-charts`は、日足以上(business day相当)では`"YYYY-MM-DD"`文字列を
`time`に渡せるが、分足(時刻を含む系列)ではUNIX秒(number)を渡す必要がある。
`timeframe_service.resample_candles`が返す`time`は、分足選択時はint、日足以上では
文字列と、選択中の足種によって型が変わる(backendのアーキテクチャ節を参照)。
frontendの`Candle`型は`time: string | number`とし、`CandlestickChart.tsx`は
そのまま`lightweight-charts`へ渡すのみ(型分岐の解釈はfrontend側で行わない)。

#### `types.ts`(改修)

```typescript
export interface Candle {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorPoint {
  time: string | number;
  value: number;
}

export interface MacdDetail {
  macd: IndicatorPoint[];
  signal: IndicatorPoint[];
  histogram: IndicatorPoint[];
}

export interface BollingerDetail {
  upper: IndicatorPoint[];
  middle: IndicatorPoint[];
  lower: IndicatorPoint[];
}

export interface HistoryDetail {
  candles: Candle[];
  sma5: IndicatorPoint[];
  high_60d: number;
  low_60d: number;
  volume_change_pct: number;
  rsi?: IndicatorPoint[];
  macd?: MacdDetail;
  bollinger?: BollingerDetail;
}
```

`SmaPoint`型は`IndicatorPoint`へ統合(SMA5・RSIとも同じ`{time, value}`形状のため)。

#### `api/trends.ts`(改修)

`fetchTrendDetail(code: string, interval: Interval, indicators: IndicatorKey[])`へ拡張し、
`GET /trends/{code}?interval=..&indicators=..`を呼ぶ形にする。

#### `DetailPage.tsx`(改修)

- `useChartSettings()`から`interval`/`indicators`を取得し、`fetchTrendDetail`へ渡す
- `interval`/`indicators`が変わるたびに再取得する(`useEffect`の依存配列に追加)
- 履歴データカード内に`ChartControls`を追加配置、`history.rsi`/`history.macd`が
  存在すれば`IndicatorPanel`をチャートの下に追加描画

### エラー処理

- `get_intraday_history`失敗(yfinance側エラー・データ無し): 既存の`get_price_history`
  失敗時と同じパターンを踏襲、ログのみ出力し`detail={}`のまま保存を継続する
  (現在値・所見の保存自体は妨げない)
- `get_industry_label`失敗: ログのみ出力し`detail["sector_label"]`を設定しない
  (`raw_candles`の保存自体は妨げない、`sector_label`欠落時は`build_detail_view`側で
  空文字扱い)
- マクロ系列(`^N225`/`^TNX`/`JPY=X`)取得失敗: ログのみ出力し
  `detail["macro_candles"]`を設定しない(同上、`raw_candles`の保存は妨げない)
- `build_detail_view`内、`history`/`market_analysis`それぞれ独立してtry/exceptし、
  片方が失敗してももう片方は表示される(機能B最終レビューで確定した方針を継続)。
  `macro_candles`が未保存の場合、`market_analysis`は空の系列(`[]`)を相関計算に
  渡す形になり、`_correlation_20d`は既存ロジック通り(データ不足時)`0.0`を返す
- `interval`に不正な値(`INTERVAL_TO_PANDAS_RULE`に存在しない値)が指定された場合、
  `GET /trends/{code}`は422を返す
- `raw_candles`が未保存(`{}`のまま)の銘柄に対して`GET /trends/{code}`を呼んだ場合、
  `detail`は`{}`を返す(既存の「データ未取得」表示分岐がそのまま機能する)
- `GET /trends/{code}`(足種切替・指標ON/OFF・詳細画面表示を含む)はいかなる場合も
  yfinanceへ問い合わせない(保存済みデータの加工失敗のみがエラー要因になる)

### テスト方針

- backend:
  - `timeframe_service.resample_candles`: 既知の5分足入力に対し、各intervalで
    期待するOHLCV集計結果になることを単体テストで検証(特に10分足=yfinance非対応
    intervalの合成が正しく2本の5分足から1本の10分足を作ることを確認)
  - `indicator_service`: 既知の価格系列に対するRSI/MACD/ボリンジャーバンドの
    算出値を、電卓検証済みの期待値と比較する単体テスト
  - `history_service.build_history_detail`: `high_60d`/`low_60d`が`raw_candles`
    全体から算出され、`display_candles`(足種切替後の系列)の影響を受けないことを検証
  - `market_analysis_service.build_market_analysis_detail`: yfinanceのモック不要
    (純粋関数化済み)。既知の`candles`/`index_candles`/`us10y_candles`/
    `usdjpy_candles`/`sector_label`を渡し、期待する相対強度・相関値になることを検証
    (既存の相関・相対強度の計算式自体は無変更のため、既存テストケースの入力・期待値を
    そのまま流用できる)
  - `trend_service._build_detail`: `raw_candles`/`sector_label`/`macro_candles`が
    正しく`detail`へ格納されること、いずれかの取得(業種ラベル・マクロ系列)が
    失敗しても`raw_candles`の保存自体は妨げられないことを検証
  - `trend_service.build_detail_view`: `history`/`market_analysis`いずれかの
    算出が例外を出しても、もう片方が正常に返ることを確認する既存パターンの
    回帰テスト。`stored_detail`が保存済みデータのみから計算されること
    (yfinance系関数を一切モックせずにテストが通ることで、read-pathにyfinance呼出しが
    無いことを検証する)
  - `refresh_trends`: 複数銘柄のバッチ内で`macro_cache`により`^N225`/`^TNX`/`JPY=X`の
    fetchが銘柄数によらず1回ずつに収まることを検証する回帰テスト
    (既存`test_refresh_trends_shares_macro_cache_across_codes`と同型、
    `get_price_history`のモック対象を`market_analysis_service`から`trend_service`へ
    移すのみ)
  - API: `GET /trends/{code}?interval=1d`(200)、`GET /trends/{code}?interval=invalid`
    (422)、`indicators=rsi,macd`指定時に該当フィールドが含まれること
- frontend:
  - `ChartSettingsContext`: `ThemeContext.test.tsx`と同様のパターンで
    localStorage読み書き・既定値・壊れた値のフォールバックを検証
  - `ChartControls`: タブクリックで`setInterval`が呼ばれること、チェックボックスで
    `toggleIndicator`が呼ばれることを検証
  - `CandlestickChart`: `bollinger`ありなしで系列描画数(モックの`addLineSeries`
    呼出回数)が変わることを検証
  - `DetailPage`: `interval`/`indicators`変更時に`fetchTrendDetail`が新しい
    引数で再呼出されることを、APIモックで確認する統合テスト
