# 足種切替+テクニカル指標選択式追加 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 詳細画面に足種切替(5分/10分/15分/日足/週足/月足)とテクニカル指標(RSI/MACD/ボリンジャーバンド)の選択式追加表示を実装する。

**Architecture:** 生データ取得元を「日足90日」から「5分足60日(1系統のみ)」へ切り替え、`trend.detail`へ生データ・業種ラベル・マクロ系列を保存する。足種切替・指標算出は`GET /trends/{code}`アクセス時に保存済みデータをpandas resample + pandas-taで加工して応答し、yfinanceへの追加問い合わせは発生させない。

**Tech Stack:** FastAPI, pandas, pandas-ta, yfinance(backend) / React, TypeScript, lightweight-charts(frontend)

**Spec:** [docs/design/04-multi-timeframe-indicators.md](../../design/04-multi-timeframe-indicators.md)

## Global Constraints

- yfinance呼出しは`create_trend`/`refresh_trends`の2箇所のみに限定する。`GET /trends/{code}`(足種切替・指標ON/OFF・詳細画面表示を含む)はいかなる場合もyfinanceへ問い合わせない
- `pandas_ta`をimportする直前に`if not hasattr(np, "NaN"): np.NaN = np.nan`の互換シムを置く(numpy 2.x環境での既知の非互換対策)
- RSI=14、MACD=12/26/9、ボリンジャーバンド=20期間・2σの標準値で固定する。ユーザーによるカスタマイズUIは設けない
- `history`/`market_analysis`はそれぞれ独立してtry/exceptし、片方の失敗がもう片方を巻き込まない(既存の機能B最終レビューで確定した方針)
- `high_60d`/`low_60d`は選択中の足種に依らず、常に`raw_candles`全体(60日分)から算出する
- 足種・指標の選択は全銘柄共通の1設定とし、`localStorage`キー`trend-compass-chart-settings`で永続化する。値が壊れている・存在しない場合は`interval: "1d"`, `indicators: []`を既定値とする
- SMA5は指標選択の対象外(既存通り常時表示、トグル不可)
- コミットメッセージ末尾のtrailerは`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`の1行のみ

---

### Task 1: `yfinance_client.get_intraday_history`

**Files:**
- Modify: `backend/app/yfinance_client.py`
- Test: `backend/tests/test_yfinance_client.py`

**Interfaces:**
- Produces: `get_intraday_history(code: str, interval: str = "5m", period: str = "60d") -> list[dict]`。返り値は`[{"datetime": "2026-09-18T09:05:00+09:00", "open": .., "high": .., "low": .., "close": .., "volume": ..}, ...]`

- [ ] **Step 1: 失敗するテストを書く**

```python
class FakeIntradayTicker:
    def __init__(self, frame):
        self._frame = frame

    def history(self, period, interval):
        return self._frame


def test_get_intraday_history_returns_candles(monkeypatch):
    index = pd.to_datetime(["2026-09-18 09:00:00+09:00", "2026-09-18 09:05:00+09:00"])
    frame = pd.DataFrame(
        {
            "Open": [99.0, 100.0],
            "High": [101.0, 103.0],
            "Low": [98.0, 99.0],
            "Close": [100.0, 102.0],
            "Volume": [1000, 1100],
        },
        index=index,
    )
    monkeypatch.setattr(yfinance_client.yf, "Ticker", lambda symbol: FakeIntradayTicker(frame))

    candles = yfinance_client.get_intraday_history("7203")

    assert candles == [
        {"datetime": "2026-09-18T09:00:00+09:00", "open": 99.0, "high": 101.0, "low": 98.0, "close": 100.0, "volume": 1000},
        {"datetime": "2026-09-18T09:05:00+09:00", "open": 100.0, "high": 103.0, "low": 99.0, "close": 102.0, "volume": 1100},
    ]


def test_get_intraday_history_raises_when_empty(monkeypatch):
    empty_frame = pd.DataFrame(columns=["Open", "High", "Low", "Close", "Volume"])
    monkeypatch.setattr(yfinance_client.yf, "Ticker", lambda symbol: FakeIntradayTicker(empty_frame))

    with pytest.raises(yfinance_client.InvalidCodeError):
        yfinance_client.get_intraday_history("9999")


def test_get_intraday_history_wraps_unexpected_exception(monkeypatch):
    class RaisingTicker:
        def history(self, period, interval):
            raise RuntimeError("boom")

    monkeypatch.setattr(yfinance_client.yf, "Ticker", lambda symbol: RaisingTicker())

    with pytest.raises(yfinance_client.InvalidCodeError):
        yfinance_client.get_intraday_history("7203")
```

これを`backend/tests/test_yfinance_client.py`の末尾へ追記する。

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_yfinance_client.py -v`
Expected: FAIL(`get_intraday_history`未定義)

- [ ] **Step 3: 実装**

`backend/app/yfinance_client.py`の`get_price_history`の直後に追加する(既存`get_price_history`はマクロ・業種指数専用として残置し、削除しない):

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

- [ ] **Step 4: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_yfinance_client.py -v`
Expected: PASS(既存テストも含め全件)

- [ ] **Step 5: コミット**

```bash
cd backend && git add app/yfinance_client.py tests/test_yfinance_client.py
git commit -m "feat(backend): add get_intraday_history for 5-minute candle fetch"
```

---

### Task 2: `indicator_service.py`(新規)

**Files:**
- Create: `backend/app/indicator_service.py`
- Test: `backend/tests/test_indicator_service.py`
- Modify: `backend/requirements.txt`

**Interfaces:**
- Consumes: なし(candlesは`{"time": .., "close": .., ...}`形状のlistを直接受け取る)
- Produces: `compute_sma5(candles: list[dict]) -> list[dict]`、`compute_rsi(candles: list[dict]) -> list[dict]`、
  `compute_macd(candles: list[dict]) -> dict`(`{"macd": [...], "signal": [...], "histogram": [...]}`)、
  `compute_bollinger(candles: list[dict]) -> dict`(`{"upper": [...], "middle": [...], "lower": [...]}`)。
  各点は`{"time": .., "value": ..}`形状

- [ ] **Step 1: 依存追加**

`backend/requirements.txt`へ以下を追記する:

```
pandas-ta==0.3.14b0
```

Run: `cd backend && source .venv/bin/activate && pip install pandas-ta==0.3.14b0`

- [ ] **Step 2: importの互換性を検証する**

Run: `cd backend && source .venv/bin/activate && python -c "import numpy as np; np.NaN = np.nan if not hasattr(np, 'NaN') else np.NaN; import pandas_ta; print('ok')"`

Expected: `ok`が出力される。もしこの時点で`ImportError`等が出る場合、spec記載の互換シムでは解決しないことを意味する。その場合は本Taskを中断し、controller(実装plan実行者)へ「pandas-ta導入断念、手実装フォールバックへ切替が必要」と報告する(Global Constraintsの想定を覆すRulingが必要なため)。

- [ ] **Step 3: 失敗するテストを書く**

```python
from app import indicator_service


def _candles(closes):
    return [{"time": f"2026-09-{i+1:02d}", "close": c} for i, c in enumerate(closes)]


def test_compute_sma5_matches_manual_rolling_average():
    closes = [100.0, 102.0, 104.0, 108.0, 110.0, 112.0]
    candles = _candles(closes)

    result = indicator_service.compute_sma5(candles)

    assert result[-1]["value"] == pytest.approx(107.2, abs=0.05)
    assert result[-1]["time"] == "2026-09-06"


def test_compute_rsi_returns_values_between_0_and_100():
    closes = [100.0 + i for i in range(30)]
    candles = _candles(closes)

    result = indicator_service.compute_rsi(candles)

    assert len(result) > 0
    for point in result:
        assert 0.0 <= point["value"] <= 100.0


def test_compute_rsi_high_for_consistent_uptrend():
    closes = [100.0 + i for i in range(30)]
    candles = _candles(closes)

    result = indicator_service.compute_rsi(candles)

    assert result[-1]["value"] > 70.0


def test_compute_macd_returns_three_series():
    closes = [100.0 + (i % 5) * 2 for i in range(40)]
    candles = _candles(closes)

    result = indicator_service.compute_macd(candles)

    assert set(result.keys()) == {"macd", "signal", "histogram"}
    assert len(result["macd"]) > 0
    assert len(result["signal"]) > 0
    assert len(result["histogram"]) > 0


def test_compute_bollinger_middle_band_close_to_sma():
    closes = [100.0 + (i % 3) for i in range(30)]
    candles = _candles(closes)

    result = indicator_service.compute_bollinger(candles)

    assert set(result.keys()) == {"upper", "middle", "lower"}
    last_upper = result["upper"][-1]["value"]
    last_middle = result["middle"][-1]["value"]
    last_lower = result["lower"][-1]["value"]
    assert last_lower < last_middle < last_upper
```

これを`backend/tests/test_indicator_service.py`として新規作成する(先頭に`import pytest`を追加)。

- [ ] **Step 4: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_indicator_service.py -v`
Expected: FAIL(`indicator_service`モジュール未定義)

- [ ] **Step 5: 実装**

`backend/app/indicator_service.py`を新規作成:

```python
import numpy as np

if not hasattr(np, "NaN"):
    np.NaN = np.nan  # pandas-ta(numpy>=2.0未対応)向けの互換シム

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

`ta.bbands`が返すDataFrameの列順は実際にインストールされたバージョンで確認し、
`lower_col, mid_col, upper_col = bb_df.columns[0], bb_df.columns[1], bb_df.columns[2]`の
順序がテスト(`last_lower < last_middle < last_upper`)を満たすよう調整する
(列順が想定と異なりテストが落ちる場合、位置引数の順序を入れ替えて対処する)。

- [ ] **Step 6: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_indicator_service.py -v`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
cd backend && git add app/indicator_service.py tests/test_indicator_service.py requirements.txt
git commit -m "feat(backend): add indicator_service for SMA5/RSI/MACD/Bollinger via pandas-ta"
```

---

### Task 3: `timeframe_service.py`(新規)

**Files:**
- Create: `backend/app/timeframe_service.py`
- Test: `backend/tests/test_timeframe_service.py`

**Interfaces:**
- Produces: `resample_candles(raw_candles: list[dict], interval: str) -> list[dict]`。
  `raw_candles`は`{"datetime": .., "open": .., "high": .., "low": .., "close": .., "volume": ..}`形状
  (Task1の`get_intraday_history`と同じ)。返り値は`{"time": .., "open": .., "high": .., "low": .., "close": .., "volume": ..}`形状
  (分足なら`time`はint(UNIX秒)、日足以上は`"YYYY-MM-DD"`文字列)

- [ ] **Step 1: 失敗するテストを書く**

```python
from app import timeframe_service


RAW_5M = [
    {"datetime": "2026-09-18T09:00:00+09:00", "open": 100.0, "high": 101.0, "low": 99.0, "close": 100.5, "volume": 100},
    {"datetime": "2026-09-18T09:05:00+09:00", "open": 100.5, "high": 102.0, "low": 100.0, "close": 101.5, "volume": 150},
    {"datetime": "2026-09-18T09:10:00+09:00", "open": 101.5, "high": 103.0, "low": 101.0, "close": 102.5, "volume": 200},
    {"datetime": "2026-09-19T09:00:00+09:00", "open": 103.0, "high": 105.0, "low": 102.0, "close": 104.0, "volume": 300},
]


def test_resample_candles_5m_is_passthrough_shaped():
    result = timeframe_service.resample_candles(RAW_5M, "5m")

    assert len(result) == 4
    assert isinstance(result[0]["time"], int)
    assert result[0]["open"] == 100.0
    assert result[0]["close"] == 100.5


def test_resample_candles_10m_aggregates_two_5m_bars():
    result = timeframe_service.resample_candles(RAW_5M, "10m")

    first_day = [c for c in result if c["open"] == 100.0]
    assert len(first_day) == 1
    bar = first_day[0]
    assert bar["high"] == 102.0
    assert bar["low"] == 99.0
    assert bar["close"] == 101.5
    assert bar["volume"] == 250


def test_resample_candles_1d_aggregates_by_calendar_day():
    result = timeframe_service.resample_candles(RAW_5M, "1d")

    assert len(result) == 2
    assert result[0]["time"] == "2026-09-18"
    assert result[0]["high"] == 103.0
    assert result[0]["low"] == 99.0
    assert result[0]["volume"] == 450
    assert result[1]["time"] == "2026-09-19"


def test_resample_candles_raises_on_unsupported_interval():
    with pytest.raises(ValueError):
        timeframe_service.resample_candles(RAW_5M, "1m")


def test_resample_candles_returns_empty_list_for_empty_input():
    assert timeframe_service.resample_candles([], "1d") == []
```

これを`backend/tests/test_timeframe_service.py`として新規作成する(先頭に`import pytest`を追加)。

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_timeframe_service.py -v`
Expected: FAIL(`timeframe_service`モジュール未定義)

- [ ] **Step 3: 実装**

`backend/app/timeframe_service.py`を新規作成:

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

- [ ] **Step 4: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_timeframe_service.py -v`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd backend && git add app/timeframe_service.py tests/test_timeframe_service.py
git commit -m "feat(backend): add timeframe_service to resample raw 5-minute candles"
```

---

### Task 4: `history_service.py`改修

**Files:**
- Modify: `backend/app/history_service.py`
- Test: `backend/tests/test_history_service.py`(全面書き換え)

**Interfaces:**
- Consumes: `indicator_service.compute_sma5/compute_rsi/compute_macd/compute_bollinger`(Task2)
- Produces: `build_history_detail(raw_candles: list[dict], display_candles: list[dict], indicators: list[str]) -> dict`

- [ ] **Step 1: 既存テストを新シグネチャに合わせて全面書き換える**

`backend/tests/test_history_service.py`の内容を以下で置き換える:

```python
from app import history_service

RAW_CANDLES = [
    {"datetime": f"2026-08-{24 + i:02d}T09:00:00+09:00", "open": 99.0 + i, "high": 102.0 + i, "low": 98.0 + i, "close": 100.0 + i, "volume": 1000 + i * 50}
    for i in range(6)
]

DISPLAY_CANDLES = [
    {"time": "2026-08-24", "open": 99.0, "high": 102.0, "low": 98.0, "close": 100.0, "volume": 1000},
    {"time": "2026-08-25", "open": 100.0, "high": 104.0, "low": 100.0, "close": 102.0, "volume": 1100},
    {"time": "2026-08-26", "open": 102.0, "high": 106.0, "low": 102.0, "close": 104.0, "volume": 1050},
]


def test_build_history_detail_returns_display_candles_as_is():
    detail = history_service.build_history_detail(RAW_CANDLES, DISPLAY_CANDLES, [])

    assert detail["candles"] == DISPLAY_CANDLES


def test_build_history_detail_includes_sma5():
    detail = history_service.build_history_detail(RAW_CANDLES, DISPLAY_CANDLES, [])

    assert len(detail["sma5"]) > 0
    assert detail["sma5"][0]["time"] == "2026-08-24"


def test_build_history_detail_high_low_use_full_raw_candles_regardless_of_display():
    detail = history_service.build_history_detail(RAW_CANDLES, DISPLAY_CANDLES, [])

    assert detail["high_60d"] == max(c["high"] for c in RAW_CANDLES)
    assert detail["low_60d"] == min(c["low"] for c in RAW_CANDLES)


def test_build_history_detail_computes_volume_change_pct():
    detail = history_service.build_history_detail(RAW_CANDLES, DISPLAY_CANDLES, [])

    expected = round((1050 - 1100) / 1100 * 100, 1)
    assert detail["volume_change_pct"] == expected


def test_build_history_detail_returns_empty_dict_for_no_display_candles():
    assert history_service.build_history_detail(RAW_CANDLES, [], []) == {}


def test_build_history_detail_omits_indicators_when_not_requested():
    detail = history_service.build_history_detail(RAW_CANDLES, DISPLAY_CANDLES, [])

    assert "rsi" not in detail
    assert "macd" not in detail
    assert "bollinger" not in detail


def test_build_history_detail_includes_rsi_when_requested():
    detail = history_service.build_history_detail(RAW_CANDLES, DISPLAY_CANDLES, ["rsi"])

    assert "rsi" in detail
    assert "macd" not in detail


def test_build_history_detail_includes_macd_and_bollinger_when_requested():
    detail = history_service.build_history_detail(RAW_CANDLES, DISPLAY_CANDLES, ["macd", "bollinger"])

    assert "macd" in detail
    assert "bollinger" in detail
    assert "rsi" not in detail
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_history_service.py -v`
Expected: FAIL(`build_history_detail`の引数不一致)

- [ ] **Step 3: 実装**

`backend/app/history_service.py`の内容を以下で置き換える(既存`_rolling_sma`は削除する):

```python
from .indicator_service import compute_bollinger, compute_macd, compute_rsi, compute_sma5


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

- [ ] **Step 4: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_history_service.py -v`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd backend && git add app/history_service.py tests/test_history_service.py
git commit -m "feat(backend): rework build_history_detail for multi-timeframe + optional indicators"
```

---

### Task 5: `market_analysis_service.py`改修(yfinance呼出しを排除)

**Files:**
- Modify: `backend/app/market_analysis_service.py`
- Test: `backend/tests/test_market_analysis_service.py`

**Interfaces:**
- Produces: `build_market_analysis_detail(candles: list[dict], index_candles: list[dict], us10y_candles: list[dict], usdjpy_candles: list[dict], sector_label: str) -> dict`
  (yfinance/`code`引数を持たない純粋関数)
- `_relative_strength_5d`・`_correlation_20d`(private、無変更)は維持

- [ ] **Step 1: 既存の`test_build_market_analysis_detail_assembles_all_fields`を新シグネチャに書き換える**

`backend/tests/test_market_analysis_service.py`内の該当テストを以下に置き換える(他の`_relative_strength_5d`/`_correlation_20d`テストは無変更のまま残す):

```python
def test_build_market_analysis_detail_assembles_all_fields():
    stock_candles = [{"close": float(v)} for v in range(1, 21)]
    index_candles = [{"close": float(v) * 2} for v in range(1, 21)]
    us10y_candles = [{"close": float(v)} for v in range(1, 21)]
    usdjpy_candles = [{"close": float(-v)} for v in range(1, 21)]

    detail = market_analysis_service.build_market_analysis_detail(
        stock_candles, index_candles, us10y_candles, usdjpy_candles, "Auto Manufacturers"
    )

    assert detail["sector_label"] == "Auto Manufacturers"
    assert detail["relative_strength_5d_pt"] == 0.0
    assert detail["macro_correlation"]["us10y"] == pytest.approx(1.0)
    assert detail["macro_correlation"]["usdjpy"] == pytest.approx(-1.0)


def test_build_market_analysis_detail_handles_missing_macro_series():
    stock_candles = [{"close": float(v)} for v in range(1, 21)]

    detail = market_analysis_service.build_market_analysis_detail(
        stock_candles, [], [], [], ""
    )

    assert detail["sector_label"] == ""
    assert detail["macro_correlation"]["us10y"] == 0.0
    assert detail["macro_correlation"]["usdjpy"] == 0.0
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_market_analysis_service.py -v`
Expected: FAIL(引数不一致)

- [ ] **Step 3: 実装**

`backend/app/market_analysis_service.py`の内容を以下で置き換える(`get_industry_label`/`get_price_history`のimportと`_get_price_history_cached`は削除する):

```python
import pandas as pd


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


def _pct_change_5d(candles: list[dict]) -> float:
    closes = [c["close"] for c in candles]
    window = closes[-5:]
    if len(window) < 2 or window[0] == 0:
        return 0.0
    return (window[-1] - window[0]) / window[0] * 100


def _relative_strength_5d(candles: list[dict], index_candles: list[dict]) -> float:
    stock_change = _pct_change_5d(candles)
    index_change = _pct_change_5d(index_candles)
    return round(stock_change - index_change, 1)


def _correlation_20d(candles: list[dict], other_candles: list[dict]) -> float:
    stock_closes = [c["close"] for c in candles[-20:]]
    other_closes = [c["close"] for c in other_candles[-20:]]
    length = min(len(stock_closes), len(other_closes))
    if length < 2:
        return 0.0

    stock_series = pd.Series(stock_closes[-length:])
    other_series = pd.Series(other_closes[-length:])
    correlation = stock_series.corr(other_series)
    if pd.isna(correlation):
        return 0.0
    return round(float(correlation), 2)
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_market_analysis_service.py -v`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd backend && git add app/market_analysis_service.py tests/test_market_analysis_service.py
git commit -m "refactor(backend): make build_market_analysis_detail a pure function (no yfinance I/O)"
```

---

### Task 6: `trend_service.py`改修 + `conftest.py`更新

**Files:**
- Modify: `backend/app/trend_service.py`
- Modify: `backend/tests/conftest.py`
- Modify: `backend/tests/test_trend_service.py`(該当テストの書き換え・削除・追加)

**Interfaces:**
- Consumes: `get_intraday_history`/`get_industry_label`/`get_price_history`(`yfinance_client`)、`resample_candles`(Task3)、
  `build_history_detail`(Task4)、`build_market_analysis_detail`(Task5)
- Produces: `_build_detail(code: str, macro_cache: dict | None = None) -> dict`(private、`refresh_trends`/`create_trend`専用)、
  `build_detail_view(stored_detail: dict, interval: str, indicators: list[str]) -> dict`(public、routerから呼ぶ)

- [ ] **Step 1: `conftest.py`のautouseスタブを更新**

`backend/tests/conftest.py`の`_stub_price_history`フィクスチャを以下に置き換える(関数名はそのまま、中身を更新):

```python
@pytest.fixture(autouse=True)
def _stub_price_history(monkeypatch):
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: [])
    monkeypatch.setattr(trend_service, "get_industry_label", lambda code: "")
    monkeypatch.setattr(trend_service, "get_price_history", lambda ticker: [])
```

(`market_analysis_service`はもうyfinance系関数を持たないため、そちらへの`monkeypatch.setattr`は削除する)

- [ ] **Step 2: `test_trend_service.py`の該当テストを書き換える**

以下のテストは新設計(`_build_detail`が`raw_candles`/`sector_label`/`macro_candles`を保存するだけ、
history/market_analysisの算出は`build_detail_view`側)に合わせて、既存の同名テストを**削除**し、
下記の新テストに置き換える:
`test_create_trend_populates_detail_when_history_available`、
`test_create_trend_leaves_detail_empty_when_history_fetch_fails`、
`test_create_trend_leaves_detail_empty_when_no_candles_returned`、
`test_create_trend_keeps_history_when_market_analysis_fails`、
`test_refresh_trends_shares_macro_cache_across_codes`

```python
def test_create_trend_stores_raw_candles_and_macro_data(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    raw_candles = [
        {"datetime": "2026-09-18T09:00:00+09:00", "open": 99.0, "high": 101.0, "low": 98.0, "close": 100.0, "volume": 1000}
    ]
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: raw_candles)
    monkeypatch.setattr(trend_service, "get_industry_label", lambda code: "Auto Manufacturers")
    monkeypatch.setattr(trend_service, "get_price_history", lambda ticker: [{"close": 100.0}])

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.detail["raw_candles"] == raw_candles
    assert trend.detail["sector_label"] == "Auto Manufacturers"
    assert trend.detail["macro_candles"]["index"] == [{"close": 100.0}]


def test_create_trend_leaves_detail_empty_when_intraday_fetch_fails(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )

    def raise_error(code):
        raise RuntimeError("yfinance unreachable")

    monkeypatch.setattr(trend_service, "get_intraday_history", raise_error)

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.detail == {}
    assert trend.name == "トヨタ自動車"


def test_create_trend_leaves_detail_empty_when_no_candles_returned(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: [])

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.detail == {}


def test_create_trend_keeps_raw_candles_when_sector_label_fetch_fails(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    raw_candles = [
        {"datetime": "2026-09-18T09:00:00+09:00", "open": 99.0, "high": 101.0, "low": 98.0, "close": 100.0, "volume": 1000}
    ]
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: raw_candles)

    def raise_error(code):
        raise RuntimeError("industry lookup failed")

    monkeypatch.setattr(trend_service, "get_industry_label", raise_error)

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.detail["raw_candles"] == raw_candles
    assert "sector_label" not in trend.detail


def test_refresh_trends_shares_macro_cache_across_codes(db_session, monkeypatch):
    stock_candles = [
        {"datetime": "2026-09-18T09:00:00+09:00", "open": 100.0, "high": 101.0, "low": 99.0, "close": 100.0, "volume": 100}
    ]
    macro_calls: dict[str, int] = {}

    def counting_get_price_history(ticker):
        macro_calls[ticker] = macro_calls.get(ticker, 0) + 1
        return [{"close": 100.0} for _ in range(20)]

    monkeypatch.setattr(trend_service, "get_quote", lambda code: {"name": "テスト", "price": 100.0})
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: stock_candles)
    monkeypatch.setattr(trend_service, "get_industry_label", lambda code: "Test Industry")
    monkeypatch.setattr(trend_service, "get_price_history", counting_get_price_history)

    trend_service.create_trend(db_session, "0001")
    trend_service.create_trend(db_session, "0002")

    for code in ("0001", "0002"):
        row = trend_service.get_active_trend(db_session, code)
        row.created_at = datetime.utcnow() - timedelta(minutes=10)
    db_session.commit()

    macro_calls.clear()

    trend_service.refresh_trends(db_session, ["0001", "0002"], 5)

    assert macro_calls == {"^N225": 1, "^TNX": 1, "JPY=X": 1}


def test_build_detail_view_returns_empty_dict_when_no_raw_candles():
    assert trend_service.build_detail_view({}, "1d", []) == {}


def test_build_detail_view_returns_history_and_market_analysis():
    stored_detail = {
        "raw_candles": [
            {
                "datetime": f"2026-08-{24 + i:02d}T09:00:00+09:00",
                "open": 99.0 + i,
                "high": 102.0 + i,
                "low": 98.0 + i,
                "close": 100.0 + i,
                "volume": 1000,
            }
            for i in range(25)
        ],
        "sector_label": "Auto Manufacturers",
        "macro_candles": {
            "index": [{"close": 100.0 + i} for i in range(20)],
            "us10y": [{"close": 100.0} for _ in range(20)],
            "usdjpy": [{"close": 100.0} for _ in range(20)],
        },
    }

    view = trend_service.build_detail_view(stored_detail, "1d", [])

    assert "history" in view
    assert "market_analysis" in view
    assert view["market_analysis"]["sector_label"] == "Auto Manufacturers"


def test_build_detail_view_history_survives_market_analysis_failure(monkeypatch):
    stored_detail = {
        "raw_candles": [
            {
                "datetime": "2026-08-24T09:00:00+09:00",
                "open": 99.0,
                "high": 102.0,
                "low": 98.0,
                "close": 100.0,
                "volume": 1000,
            }
        ],
        "sector_label": "Auto Manufacturers",
        "macro_candles": {"index": [], "us10y": [], "usdjpy": []},
    }

    def raise_error(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(trend_service, "build_market_analysis_detail", raise_error)

    view = trend_service.build_detail_view(stored_detail, "1d", [])

    assert "history" in view
    assert "market_analysis" not in view
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_trend_service.py -v`
Expected: FAIL(`get_intraday_history`/`build_detail_view`未定義等)

- [ ] **Step 4: 実装**

`backend/app/trend_service.py`のimport文と`_build_detail`を以下で置き換え、`build_detail_view`を新規追加する:

```python
from .yfinance_client import (
    InvalidCodeError,
    get_industry_label,
    get_intraday_history,
    get_price_history,
    get_quote,
)
from .history_service import build_history_detail
from .market_analysis_service import build_market_analysis_detail
from .timeframe_service import resample_candles


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

(`refresh_trends`本体・`create_trend`本体は無変更。両者とも既に`_build_detail(code, macro_cache)`/
`_build_detail(code)`を呼んでいるため、内部の書き換えだけで済む)

- [ ] **Step 5: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_trend_service.py -v`
Expected: PASS

- [ ] **Step 6: バックエンド全テストを実行し回帰が無いことを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/ -v`
Expected: 全件PASS(Task1〜5の変更も含め)

- [ ] **Step 7: コミット**

```bash
cd backend && git add app/trend_service.py tests/conftest.py tests/test_trend_service.py
git commit -m "feat(backend): store raw candles + macro data at fetch time, compute views on read"
```

---

### Task 7: `schemas.py` + `routers/trends.py`改修

**Files:**
- Modify: `backend/app/schemas.py`(変更なし、確認のみ)
- Modify: `backend/app/routers/trends.py`
- Modify: `backend/tests/test_trends_api.py`

**Interfaces:**
- Consumes: `trend_service.build_detail_view`(Task6)

- [ ] **Step 1: 既存の`test_get_trend_detail_returns_full_detail_end_to_end`を書き換え、新規テストを追加**

`backend/tests/test_trends_api.py`内の`test_get_trend_detail_returns_full_detail_end_to_end`を
以下に置き換え、直後に2件追加する:

```python
def test_get_trend_detail_returns_full_detail_end_to_end(client, monkeypatch):
    raw_candles = [
        {
            "datetime": f"2026-08-{24 + i:02d}T09:00:00+09:00",
            "open": 99.0 + i,
            "high": 102.0 + i,
            "low": 98.0 + i,
            "close": 100.0 + i,
            "volume": 1000,
        }
        for i in range(25)
    ]
    macro_candles = [{"close": 100.0} for _ in range(20)]

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: raw_candles)
    monkeypatch.setattr(trend_service, "get_industry_label", lambda code: "Auto Manufacturers")
    monkeypatch.setattr(trend_service, "get_price_history", lambda ticker: macro_candles)

    client.post("/trends", json={"code": "7203"})

    response = client.get("/trends/7203")

    assert response.status_code == 200
    detail = response.json()["detail"]
    assert len(detail["history"]["candles"]) > 0
    assert detail["market_analysis"]["sector_label"] == "Auto Manufacturers"
    assert "us10y" in detail["market_analysis"]["macro_correlation"]


def test_get_trend_detail_accepts_interval_and_indicators(client, monkeypatch):
    raw_candles = [
        {
            "datetime": f"2026-08-{24 + i:02d}T09:00:00+09:00",
            "open": 99.0 + i,
            "high": 102.0 + i,
            "low": 98.0 + i,
            "close": 100.0 + i,
            "volume": 1000,
        }
        for i in range(25)
    ]
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: raw_candles)
    monkeypatch.setattr(trend_service, "get_industry_label", lambda code: "Auto Manufacturers")
    monkeypatch.setattr(trend_service, "get_price_history", lambda ticker: [{"close": 100.0}])

    client.post("/trends", json={"code": "7203"})

    response = client.get("/trends/7203?interval=1wk&indicators=rsi,macd")

    assert response.status_code == 200
    detail = response.json()["detail"]
    assert "rsi" in detail["history"]
    assert "macd" in detail["history"]
    assert "bollinger" not in detail["history"]


def test_get_trend_detail_rejects_invalid_interval(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: [])
    client.post("/trends", json={"code": "7203"})

    response = client.get("/trends/7203?interval=1m")

    assert response.status_code == 422
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_trends_api.py -v`
Expected: FAIL(query param未対応)

- [ ] **Step 3: 実装**

`backend/app/routers/trends.py`の`get_trend_detail`を以下で置き換える:

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
    try:
        detail = trend_service.build_detail_view(trend.detail, interval, indicator_list)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

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

(`schemas.py`の`TrendDetailOut`は変更不要、確認のみで良い)

- [ ] **Step 4: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_trends_api.py -v`
Expected: PASS

- [ ] **Step 5: バックエンド全テストを実行**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/ -v`
Expected: 全件PASS

- [ ] **Step 6: コミット**

```bash
cd backend && git add app/routers/trends.py tests/test_trends_api.py
git commit -m "feat(backend): accept interval/indicators query params on GET /trends/{code}"
```

---

### Task 8: frontend `types.ts` + `chartSettings/ChartSettingsContext.tsx`(新規)

**Files:**
- Modify: `frontend/src/types.ts`
- Create: `frontend/src/chartSettings/ChartSettingsContext.tsx`
- Test: `frontend/src/chartSettings/ChartSettingsContext.test.tsx`

**Interfaces:**
- Produces: `Interval`型(`"5m" | "10m" | "15m" | "1d" | "1wk" | "1mo"`)、
  `IndicatorKey`型(`"rsi" | "macd" | "bollinger"`)、
  `ChartSettingsProvider`、`useChartSettings(): { interval, indicators, setInterval, toggleIndicator }`

- [ ] **Step 1: `types.ts`を更新**

`frontend/src/types.ts`の`Candle`/`SmaPoint`/`HistoryDetail`を以下で置き換える(`Trend`・`MacroCorrelation`・
`MarketAnalysisDetail`・`TrendDetail`は無変更):

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

- [ ] **Step 2: 失敗するテストを書く**

```tsx
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { ChartSettingsProvider, useChartSettings } from "./ChartSettingsContext";

function wrapper({ children }: { children: ReactNode }) {
  return <ChartSettingsProvider>{children}</ChartSettingsProvider>;
}

describe("ChartSettingsContext", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to daily interval and no indicators", () => {
    const { result } = renderHook(() => useChartSettings(), { wrapper });

    expect(result.current.interval).toBe("1d");
    expect(result.current.indicators).toEqual([]);
  });

  it("reads a previously stored setting", () => {
    window.localStorage.setItem(
      "trend-compass-chart-settings",
      JSON.stringify({ interval: "15m", indicators: ["rsi"] })
    );

    const { result } = renderHook(() => useChartSettings(), { wrapper });

    expect(result.current.interval).toBe("15m");
    expect(result.current.indicators).toEqual(["rsi"]);
  });

  it("falls back to defaults when the stored value is malformed", () => {
    window.localStorage.setItem("trend-compass-chart-settings", "not json");

    const { result } = renderHook(() => useChartSettings(), { wrapper });

    expect(result.current.interval).toBe("1d");
    expect(result.current.indicators).toEqual([]);
  });

  it("persists interval changes to localStorage", () => {
    const { result } = renderHook(() => useChartSettings(), { wrapper });

    act(() => result.current.setInterval("1wk"));

    expect(result.current.interval).toBe("1wk");
    const stored = JSON.parse(window.localStorage.getItem("trend-compass-chart-settings")!);
    expect(stored.interval).toBe("1wk");
  });

  it("toggles an indicator on and off", () => {
    const { result } = renderHook(() => useChartSettings(), { wrapper });

    act(() => result.current.toggleIndicator("macd"));
    expect(result.current.indicators).toEqual(["macd"]);

    act(() => result.current.toggleIndicator("macd"));
    expect(result.current.indicators).toEqual([]);
  });
});
```

これを`frontend/src/chartSettings/ChartSettingsContext.test.tsx`として新規作成する。

- [ ] **Step 3: テストが失敗することを確認**

Run: `cd frontend && npx vitest run src/chartSettings/ChartSettingsContext.test.tsx`
Expected: FAIL(モジュール未定義)

- [ ] **Step 4: 実装**

`frontend/src/chartSettings/ChartSettingsContext.tsx`を新規作成(`theme/ThemeContext.tsx`と対になる構成):

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Interval = "5m" | "10m" | "15m" | "1d" | "1wk" | "1mo";
export type IndicatorKey = "rsi" | "macd" | "bollinger";

interface ChartSettingsContextValue {
  interval: Interval;
  indicators: IndicatorKey[];
  setInterval: (interval: Interval) => void;
  toggleIndicator: (indicator: IndicatorKey) => void;
}

const STORAGE_KEY = "trend-compass-chart-settings";
const VALID_INTERVALS: Interval[] = ["5m", "10m", "15m", "1d", "1wk", "1mo"];
const VALID_INDICATORS: IndicatorKey[] = ["rsi", "macd", "bollinger"];

interface StoredSettings {
  interval: Interval;
  indicators: IndicatorKey[];
}

const ChartSettingsContext = createContext<ChartSettingsContextValue | null>(null);

function readStoredSettings(): StoredSettings {
  const fallback: StoredSettings = { interval: "1d", indicators: [] };
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw);
    const interval = VALID_INTERVALS.includes(parsed.interval) ? parsed.interval : fallback.interval;
    const indicators = Array.isArray(parsed.indicators)
      ? parsed.indicators.filter((i: unknown): i is IndicatorKey => VALID_INDICATORS.includes(i as IndicatorKey))
      : fallback.indicators;
    return { interval, indicators };
  } catch {
    return fallback;
  }
}

function writeStoredSettings(settings: StoredSettings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function ChartSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<StoredSettings>(readStoredSettings);

  const setInterval = useCallback((interval: Interval) => {
    setSettings((prev) => {
      const next = { ...prev, interval };
      writeStoredSettings(next);
      return next;
    });
  }, []);

  const toggleIndicator = useCallback((indicator: IndicatorKey) => {
    setSettings((prev) => {
      const has = prev.indicators.includes(indicator);
      const indicators = has
        ? prev.indicators.filter((i) => i !== indicator)
        : [...prev.indicators, indicator];
      const next = { ...prev, indicators };
      writeStoredSettings(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ interval: settings.interval, indicators: settings.indicators, setInterval, toggleIndicator }),
    [settings, setInterval, toggleIndicator]
  );

  return <ChartSettingsContext.Provider value={value}>{children}</ChartSettingsContext.Provider>;
}

export function useChartSettings(): ChartSettingsContextValue {
  const ctx = useContext(ChartSettingsContext);
  if (!ctx) {
    throw new Error("useChartSettings must be used within a ChartSettingsProvider");
  }
  return ctx;
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `cd frontend && npx vitest run src/chartSettings/ChartSettingsContext.test.tsx`
Expected: PASS

- [ ] **Step 6: 型チェック**

Run: `cd frontend && npx tsc --noEmit`
Expected: エラー無し(この時点で`CandlestickChart.tsx`等、旧`Candle`/`SmaPoint`型を使う既存ファイルが型エラーになる場合がある。Task10で修正するため、ここでは`CandlestickChart.tsx`/`CandlestickChart.test.tsx`/`DetailPage.tsx`/`DetailPage.test.tsx`起因のエラーのみ許容し、`types.ts`/`ChartSettingsContext.tsx`自体にエラーが無いことのみ確認する)

- [ ] **Step 7: コミット**

```bash
cd frontend && git add src/types.ts src/chartSettings/ChartSettingsContext.tsx src/chartSettings/ChartSettingsContext.test.tsx
git commit -m "feat(frontend): add multi-timeframe types and ChartSettingsContext"
```

---

### Task 9: `ChartControls.tsx`(新規)

**Files:**
- Create: `frontend/src/components/ChartControls.tsx`
- Test: `frontend/src/components/ChartControls.test.tsx`

**Interfaces:**
- Consumes: `useChartSettings`(Task8)
- Produces: `<ChartControls />`(props無し)

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartControls } from "./ChartControls";
import { ChartSettingsProvider } from "../chartSettings/ChartSettingsContext";

function renderWithProvider() {
  return render(
    <ChartSettingsProvider>
      <ChartControls />
    </ChartSettingsProvider>
  );
}

describe("ChartControls", () => {
  it("renders a tab for each interval and a checkbox for each indicator", () => {
    renderWithProvider();

    expect(screen.getByRole("button", { name: "5分" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "日足" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "RSI" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "MACD" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "ボリンジャーバンド" })).toBeInTheDocument();
  });

  it("marks the current interval tab as selected", () => {
    renderWithProvider();

    expect(screen.getByRole("button", { name: "日足" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "5分" })).toHaveAttribute("aria-pressed", "false");
  });

  it("switches interval on tab click", () => {
    renderWithProvider();

    fireEvent.click(screen.getByRole("button", { name: "週足" }));

    expect(screen.getByRole("button", { name: "週足" })).toHaveAttribute("aria-pressed", "true");
  });

  it("toggles an indicator checkbox on click", () => {
    renderWithProvider();

    const rsiCheckbox = screen.getByRole("checkbox", { name: "RSI" });
    expect(rsiCheckbox).not.toBeChecked();

    fireEvent.click(rsiCheckbox);

    expect(rsiCheckbox).toBeChecked();
  });
});
```

これを`frontend/src/components/ChartControls.test.tsx`として新規作成する。

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd frontend && npx vitest run src/components/ChartControls.test.tsx`
Expected: FAIL(モジュール未定義)

- [ ] **Step 3: 実装**

`frontend/src/components/ChartControls.tsx`を新規作成:

```tsx
import { useChartSettings, type IndicatorKey, type Interval } from "../chartSettings/ChartSettingsContext";

const INTERVAL_OPTIONS: { key: Interval; label: string }[] = [
  { key: "5m", label: "5分" },
  { key: "10m", label: "10分" },
  { key: "15m", label: "15分" },
  { key: "1d", label: "日足" },
  { key: "1wk", label: "週足" },
  { key: "1mo", label: "月足" },
];

const INDICATOR_OPTIONS: { key: IndicatorKey; label: string }[] = [
  { key: "rsi", label: "RSI" },
  { key: "macd", label: "MACD" },
  { key: "bollinger", label: "ボリンジャーバンド" },
];

export function ChartControls() {
  const { interval, indicators, setInterval, toggleIndicator } = useChartSettings();

  return (
    <div className="chart-controls">
      <div className="chart-controls-intervals" role="group" aria-label="足種">
        {INTERVAL_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className="chart-controls-interval-tab"
            aria-pressed={interval === opt.key}
            onClick={() => setInterval(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="chart-controls-indicators" role="group" aria-label="指標">
        {INDICATOR_OPTIONS.map((opt) => (
          <label key={opt.key} className="chart-controls-indicator-option">
            <input
              type="checkbox"
              checked={indicators.includes(opt.key)}
              onChange={() => toggleIndicator(opt.key)}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd frontend && npx vitest run src/components/ChartControls.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd frontend && git add src/components/ChartControls.tsx src/components/ChartControls.test.tsx
git commit -m "feat(frontend): add ChartControls for interval tabs and indicator checkboxes"
```

---

### Task 10: `CandlestickChart.tsx`改修(time型統一 + ボリンジャーバンド重ね書き)

**Files:**
- Modify: `frontend/src/components/CandlestickChart.tsx`
- Modify: `frontend/src/components/CandlestickChart.test.tsx`

**Interfaces:**
- Consumes: `Candle`/`IndicatorPoint`/`BollingerDetail`型(Task8)
- Produces: `<CandlestickChart candles={Candle[]} sma5={IndicatorPoint[]} bollinger={BollingerDetail | undefined} />`

- [ ] **Step 1: 既存テストを`date`→`time`フィールド名に更新し、ボリンジャーバンドのテストを追加**

`frontend/src/components/CandlestickChart.test.tsx`を以下で置き換える:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CandlestickChart } from "./CandlestickChart";
import { ThemeProvider } from "../theme/ThemeContext";

const setDataCandle = vi.fn();
const setDataLine = vi.fn();
const applyOptionsCandle = vi.fn();
const applyOptionsLine = vi.fn();
const applyOptionsChart = vi.fn();
const addCandlestickSeries = vi.fn(() => ({
  setData: setDataCandle,
  applyOptions: applyOptionsCandle,
}));
const addLineSeries = vi.fn(() => ({ setData: setDataLine, applyOptions: applyOptionsLine }));
const remove = vi.fn();

vi.mock("lightweight-charts", () => ({
  createChart: vi.fn(() => ({
    addCandlestickSeries,
    addLineSeries,
    applyOptions: applyOptionsChart,
    remove,
  })),
}));

describe("CandlestickChart", () => {
  it("renders a container and initializes candle + SMA5 series", () => {
    const candles = [
      { time: "2026-08-24", open: 99, high: 101, low: 98, close: 100, volume: 1000 },
    ];
    const sma5 = [{ time: "2026-08-24", value: 100 }];

    const { getByTestId } = render(
      <ThemeProvider>
        <CandlestickChart candles={candles} sma5={sma5} />
      </ThemeProvider>
    );

    expect(getByTestId("candlestick-chart")).toBeInTheDocument();
    expect(addCandlestickSeries).toHaveBeenCalled();
    expect(setDataCandle).toHaveBeenCalledWith([
      { time: "2026-08-24", open: 99, high: 101, low: 98, close: 100 },
    ]);
    expect(setDataLine).toHaveBeenCalledWith([{ time: "2026-08-24", value: 100 }]);
  });

  it("does not add extra line series when bollinger is not provided", () => {
    addLineSeries.mockClear();
    const candles = [
      { time: "2026-08-24", open: 99, high: 101, low: 98, close: 100, volume: 1000 },
    ];

    render(
      <ThemeProvider>
        <CandlestickChart candles={candles} sma5={[]} />
      </ThemeProvider>
    );

    expect(addLineSeries).toHaveBeenCalledTimes(1); // SMA5のみ
  });

  it("adds three extra line series when bollinger is provided", () => {
    addLineSeries.mockClear();
    const candles = [
      { time: "2026-08-24", open: 99, high: 101, low: 98, close: 100, volume: 1000 },
    ];
    const bollinger = {
      upper: [{ time: "2026-08-24", value: 105 }],
      middle: [{ time: "2026-08-24", value: 100 }],
      lower: [{ time: "2026-08-24", value: 95 }],
    };

    render(
      <ThemeProvider>
        <CandlestickChart candles={candles} sma5={[]} bollinger={bollinger} />
      </ThemeProvider>
    );

    expect(addLineSeries).toHaveBeenCalledTimes(4); // SMA5 + upper/middle/lower
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd frontend && npx vitest run src/components/CandlestickChart.test.tsx`
Expected: FAIL(`date`→`time`のプロパティ不一致、`bollinger` props未対応)

- [ ] **Step 3: 実装**

`frontend/src/components/CandlestickChart.tsx`を以下の点で改修する:

1. `import type { Candle, IndicatorPoint, BollingerDetail } from "../types";`へ変更(`SmaPoint`は`IndicatorPoint`に統合済み)
2. propsに`bollinger?: BollingerDetail`を追加
3. `candles.map((c) => ({ time: c.date, ... }))`→`candles.map((c) => ({ time: c.time, ... }))`、
   `sma5.map((p) => ({ time: p.date, ... }))`→`sma5.map((p) => ({ time: p.time, ... }))`
4. マウント用`useEffect`(`[candles, sma5]`依存)内、SMA5系列描画の直後に、`bollinger`が渡されていれば
   upper/middle/lowerの3本を追加描画する`bollingerSeriesRef`群を新設し、クリーンアップでも解除する

```tsx
import { useEffect, useRef } from "react";
import { createChart, type IChartApi, type ISeriesApi } from "lightweight-charts";
import type { Candle, IndicatorPoint, BollingerDetail } from "../types";
import { useTheme } from "../theme/ThemeContext";

interface CandlestickChartProps {
  candles: Candle[];
  sma5: IndicatorPoint[];
  bollinger?: BollingerDetail;
}

function readCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function readChartColors() {
  return {
    background: readCssVar("--chart-bg"),
    text: readCssVar("--chart-text"),
    grid: readCssVar("--chart-grid"),
    candleUp: readCssVar("--candle-up"),
    candleDown: readCssVar("--candle-down"),
    smaLine: readCssVar("--sma-line"),
  };
}

export function CandlestickChart({ candles, sma5, bollinger }: CandlestickChartProps) {
  const { effectiveTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bollingerSeriesRef = useRef<ISeriesApi<"Line">[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    const colors = readChartColors();

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 300,
      layout: {
        background: { color: colors.background },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
    });
    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: colors.candleUp,
      downColor: colors.candleDown,
      borderUpColor: colors.candleUp,
      borderDownColor: colors.candleDown,
      wickUpColor: colors.candleUp,
      wickDownColor: colors.candleDown,
    });
    candleSeriesRef.current = candleSeries;
    candleSeries.setData(
      candles.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    const smaSeries = chart.addLineSeries({ color: colors.smaLine, lineWidth: 2 });
    smaSeriesRef.current = smaSeries;
    smaSeries.setData(sma5.map((p) => ({ time: p.time, value: p.value })));

    bollingerSeriesRef.current = [];
    if (bollinger) {
      for (const band of [bollinger.upper, bollinger.middle, bollinger.lower]) {
        const series = chart.addLineSeries({ color: colors.smaLine, lineWidth: 1 });
        series.setData(band.map((p) => ({ time: p.time, value: p.value })));
        bollingerSeriesRef.current.push(series);
      }
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      chart.applyOptions({ width: entry.contentRect.width });
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      smaSeriesRef.current = null;
      bollingerSeriesRef.current = [];
    };
  }, [candles, sma5, bollinger]);

  useEffect(() => {
    if (!chartRef.current) return;

    const colors = readChartColors();

    chartRef.current.applyOptions({
      layout: {
        background: { color: colors.background },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
    });
    candleSeriesRef.current?.applyOptions({
      upColor: colors.candleUp,
      downColor: colors.candleDown,
      borderUpColor: colors.candleUp,
      borderDownColor: colors.candleDown,
      wickUpColor: colors.candleUp,
      wickDownColor: colors.candleDown,
    });
    smaSeriesRef.current?.applyOptions({ color: colors.smaLine });
    bollingerSeriesRef.current.forEach((series) => series.applyOptions({ color: colors.smaLine }));
  }, [effectiveTheme]);

  return <div data-testid="candlestick-chart" ref={containerRef} />;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd frontend && npx vitest run src/components/CandlestickChart.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd frontend && git add src/components/CandlestickChart.tsx src/components/CandlestickChart.test.tsx
git commit -m "feat(frontend): switch CandlestickChart to time field and add Bollinger overlay"
```

---

### Task 11: `IndicatorPanel.tsx`(新規、RSI/MACDサブパネル)

**Files:**
- Create: `frontend/src/components/IndicatorPanel.tsx`
- Test: `frontend/src/components/IndicatorPanel.test.tsx`

**Interfaces:**
- Consumes: `IndicatorPoint`/`MacdDetail`型(Task8)、`useTheme`(既存`theme/ThemeContext.tsx`)
- Produces: `<IndicatorPanel rsi={IndicatorPoint[] | undefined} macd={MacdDetail | undefined} />`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IndicatorPanel } from "./IndicatorPanel";
import { ThemeProvider } from "../theme/ThemeContext";

const setDataLine = vi.fn();
const addLineSeries = vi.fn(() => ({ setData: setDataLine, applyOptions: vi.fn() }));
const applyOptionsChart = vi.fn();
const remove = vi.fn();

vi.mock("lightweight-charts", () => ({
  createChart: vi.fn(() => ({
    addLineSeries,
    applyOptions: applyOptionsChart,
    remove,
  })),
}));

describe("IndicatorPanel", () => {
  it("renders nothing when neither rsi nor macd is provided", () => {
    const { container } = render(
      <ThemeProvider>
        <IndicatorPanel />
      </ThemeProvider>
    );

    expect(container.querySelector('[data-testid="indicator-panel-rsi"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="indicator-panel-macd"]')).not.toBeInTheDocument();
  });

  it("renders an RSI panel when rsi data is provided", () => {
    const rsi = [{ time: "2026-08-24", value: 65 }];

    const { getByTestId } = render(
      <ThemeProvider>
        <IndicatorPanel rsi={rsi} />
      </ThemeProvider>
    );

    expect(getByTestId("indicator-panel-rsi")).toBeInTheDocument();
  });

  it("renders a MACD panel with three series when macd data is provided", () => {
    addLineSeries.mockClear();
    const macd = {
      macd: [{ time: "2026-08-24", value: 1.2 }],
      signal: [{ time: "2026-08-24", value: 1.0 }],
      histogram: [{ time: "2026-08-24", value: 0.2 }],
    };

    const { getByTestId } = render(
      <ThemeProvider>
        <IndicatorPanel macd={macd} />
      </ThemeProvider>
    );

    expect(getByTestId("indicator-panel-macd")).toBeInTheDocument();
    expect(addLineSeries).toHaveBeenCalledTimes(3);
  });
});
```

これを`frontend/src/components/IndicatorPanel.test.tsx`として新規作成する。

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd frontend && npx vitest run src/components/IndicatorPanel.test.tsx`
Expected: FAIL(モジュール未定義)

- [ ] **Step 3: 実装**

`frontend/src/components/IndicatorPanel.tsx`を新規作成(`CandlestickChart.tsx`と同じテーマ追従パターン):

```tsx
import { useEffect, useRef } from "react";
import { createChart, type IChartApi } from "lightweight-charts";
import type { IndicatorPoint, MacdDetail } from "../types";
import { useTheme } from "../theme/ThemeContext";

interface IndicatorPanelProps {
  rsi?: IndicatorPoint[];
  macd?: MacdDetail;
}

function readCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function RsiChart({ rsi }: { rsi: IndicatorPoint[] }) {
  const { effectiveTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 120,
      layout: {
        background: { color: readCssVar("--chart-bg") },
        textColor: readCssVar("--chart-text"),
      },
    });
    chartRef.current = chart;
    const series = chart.addLineSeries({ color: readCssVar("--sma-line"), lineWidth: 2 });
    series.setData(rsi.map((p) => ({ time: p.time, value: p.value })));
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [rsi]);

  useEffect(() => {
    chartRef.current?.applyOptions({
      layout: {
        background: { color: readCssVar("--chart-bg") },
        textColor: readCssVar("--chart-text"),
      },
    });
  }, [effectiveTheme]);

  return <div data-testid="indicator-panel-rsi" ref={containerRef} />;
}

function MacdChart({ macd }: { macd: MacdDetail }) {
  const { effectiveTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 120,
      layout: {
        background: { color: readCssVar("--chart-bg") },
        textColor: readCssVar("--chart-text"),
      },
    });
    chartRef.current = chart;
    for (const [series_data, color] of [
      [macd.macd, readCssVar("--sma-line")],
      [macd.signal, readCssVar("--candle-down")],
      [macd.histogram, readCssVar("--candle-up")],
    ] as const) {
      const series = chart.addLineSeries({ color, lineWidth: 1 });
      series.setData(series_data.map((p) => ({ time: p.time, value: p.value })));
    }
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [macd]);

  useEffect(() => {
    chartRef.current?.applyOptions({
      layout: {
        background: { color: readCssVar("--chart-bg") },
        textColor: readCssVar("--chart-text"),
      },
    });
  }, [effectiveTheme]);

  return <div data-testid="indicator-panel-macd" ref={containerRef} />;
}

export function IndicatorPanel({ rsi, macd }: IndicatorPanelProps) {
  return (
    <>
      {rsi && <RsiChart rsi={rsi} />}
      {macd && <MacdChart macd={macd} />}
    </>
  );
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd frontend && npx vitest run src/components/IndicatorPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd frontend && git add src/components/IndicatorPanel.tsx src/components/IndicatorPanel.test.tsx
git commit -m "feat(frontend): add IndicatorPanel for RSI/MACD sub-charts"
```

---

### Task 12: `api/trends.ts` + `App.tsx` + `DetailPage.tsx`統合

**Files:**
- Modify: `frontend/src/api/trends.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/DetailPage.tsx`
- Modify: `frontend/src/components/DetailPage.test.tsx`

**Interfaces:**
- Consumes: `ChartSettingsProvider`/`useChartSettings`(Task8)、`ChartControls`(Task9)、
  `CandlestickChart`(Task10)、`IndicatorPanel`(Task11)

- [ ] **Step 1: 既存`DetailPage.test.tsx`を新しい`detail`形状・`ChartSettingsProvider`込みで書き換える**

`frontend/src/components/DetailPage.test.tsx`を以下で置き換える:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as trendsApi from "../api/trends";
import { ThemeProvider } from "../theme/ThemeContext";
import { ChartSettingsProvider } from "../chartSettings/ChartSettingsContext";
import { DetailPage } from "./DetailPage";

vi.mock("../api/trends");
vi.mock("lightweight-charts", () => ({
  createChart: vi.fn(() => ({
    addCandlestickSeries: vi.fn(() => ({ setData: vi.fn(), applyOptions: vi.fn() })),
    addLineSeries: vi.fn(() => ({ setData: vi.fn(), applyOptions: vi.fn() })),
    applyOptions: vi.fn(),
    remove: vi.fn(),
  })),
}));

const sampleDetail = {
  id: 1,
  code: "7203",
  name: "トヨタ自動車",
  opinion: "初回取得、履歴データ無し",
  price_at_fetch: 2900,
  created_at: "2026-09-17T00:00:00Z",
  detail: {
    history: {
      candles: [{ time: "2026-08-24", open: 99, high: 101, low: 98, close: 100, volume: 1000 }],
      sma5: [{ time: "2026-08-24", value: 100 }],
      high_60d: 101,
      low_60d: 98,
      volume_change_pct: 5.0,
    },
    market_analysis: {
      sector_label: "Auto Manufacturers",
      relative_strength_5d_pt: 0.5,
      macro_correlation: { us10y: -0.31, usdjpy: 0.62 },
    },
  },
};

function renderAt(code: string) {
  return render(
    <ThemeProvider>
      <ChartSettingsProvider>
        <MemoryRouter initialEntries={[`/trends/${code}`]}>
          <Routes>
            <Route path="/trends/:code" element={<DetailPage />} />
          </Routes>
        </MemoryRouter>
      </ChartSettingsProvider>
    </ThemeProvider>
  );
}

describe("DetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("shows the chart, market analysis panel, and chart controls when detail data is available", async () => {
    vi.mocked(trendsApi.fetchTrendDetail).mockResolvedValue(sampleDetail);

    renderAt("7203");

    expect(await screen.findByRole("heading", { name: "7203 トヨタ自動車" })).toBeInTheDocument();
    expect(screen.getByTestId("candlestick-chart")).toBeInTheDocument();
    expect(screen.getByText("業種: Auto Manufacturers")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "表示設定を開く" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "日足" })).toBeInTheDocument();
  });

  it("refetches with the new interval when the user switches timeframe tabs", async () => {
    vi.mocked(trendsApi.fetchTrendDetail).mockResolvedValue(sampleDetail);

    renderAt("7203");
    await screen.findByTestId("candlestick-chart");

    screen.getByRole("button", { name: "週足" }).click();

    await waitFor(() =>
      expect(trendsApi.fetchTrendDetail).toHaveBeenLastCalledWith("7203", "1wk", [])
    );
  });

  it("shows a not-yet-available message when detail is empty", async () => {
    vi.mocked(trendsApi.fetchTrendDetail).mockResolvedValue({
      ...sampleDetail,
      detail: {},
    });

    renderAt("7203");

    await waitFor(() =>
      expect(screen.getByText("履歴データは今のところ取得できていません。")).toBeInTheDocument()
    );
    expect(screen.getByText("市場分析データは今のところ取得できていません。")).toBeInTheDocument();
  });

  it("shows an inline error when the fetch fails", async () => {
    vi.mocked(trendsApi.fetchTrendDetail).mockRejectedValue(
      new Error("銘柄コード 9999 は見つかりません")
    );

    renderAt("9999");

    expect(await screen.findByRole("alert")).toHaveTextContent("銘柄コード 9999 は見つかりません");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd frontend && npx vitest run src/components/DetailPage.test.tsx`
Expected: FAIL(`fetchTrendDetail`の引数不一致、`ChartControls`未組込み)

- [ ] **Step 3: `api/trends.ts`を改修**

`frontend/src/api/trends.ts`の`fetchTrendDetail`を以下で置き換える:

```typescript
import type { Interval, IndicatorKey } from "../chartSettings/ChartSettingsContext";

export function fetchTrendDetail(
  code: string,
  interval: Interval,
  indicators: IndicatorKey[]
): Promise<TrendDetail> {
  const params = new URLSearchParams({ interval, indicators: indicators.join(",") });
  return apiRequest<TrendDetail>(`/trends/${code}?${params.toString()}`);
}
```

- [ ] **Step 4: `App.tsx`を改修**

`frontend/src/App.tsx`を以下で置き換える:

```tsx
import { Route, Routes } from "react-router-dom";
import { DetailPage } from "./components/DetailPage";
import { WatchlistPage } from "./components/WatchlistPage";
import { ThemeProvider } from "./theme/ThemeContext";
import { ChartSettingsProvider } from "./chartSettings/ChartSettingsContext";

export default function App() {
  return (
    <ThemeProvider>
      <ChartSettingsProvider>
        <Routes>
          <Route path="/" element={<WatchlistPage />} />
          <Route path="/trends/:code" element={<DetailPage />} />
        </Routes>
      </ChartSettingsProvider>
    </ThemeProvider>
  );
}
```

(`ChartSettingsProvider`を`ThemeProvider`と同じ位置=`App`内に置くことで、`App.test.tsx`の変更は不要になる)

- [ ] **Step 5: `DetailPage.tsx`を改修**

`frontend/src/components/DetailPage.tsx`を以下で置き換える:

```tsx
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchTrendDetail } from "../api/trends";
import type { TrendDetail } from "../types";
import { useChartSettings } from "../chartSettings/ChartSettingsContext";
import { CandlestickChart } from "./CandlestickChart";
import { ChartControls } from "./ChartControls";
import { IndicatorPanel } from "./IndicatorPanel";
import { MarketAnalysisPanel } from "./MarketAnalysisPanel";
import { SettingsMenu } from "./SettingsMenu";

export function DetailPage() {
  const { code } = useParams<{ code: string }>();
  const { interval, indicators } = useChartSettings();
  const [trend, setTrend] = useState<TrendDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    fetchTrendDetail(code, interval, indicators)
      .then(setTrend)
      .catch((err) => setError((err as Error).message));
  }, [code, interval, indicators]);

  if (error) {
    return (
      <main>
        <header className="app-header">
          <Link to="/" className="back-link">
            一覧へ戻る
          </Link>
          <SettingsMenu />
        </header>
        <div className="app-body">
          <p role="alert">{error}</p>
        </div>
      </main>
    );
  }

  if (!trend) {
    return (
      <main>
        <header className="app-header">
          <Link to="/" className="back-link">
            一覧へ戻る
          </Link>
          <SettingsMenu />
        </header>
        <div className="app-body">
          <p>読込中...</p>
        </div>
      </main>
    );
  }

  const { history, market_analysis } = trend.detail;
  const latestSma5 = history?.sma5[history.sma5.length - 1]?.value;

  return (
    <main>
      <header className="app-header">
        <div>
          <Link to="/" className="back-link">
            一覧へ戻る
          </Link>
          <h1>
            {trend.code} {trend.name}
          </h1>
        </div>
        <SettingsMenu />
      </header>
      <div className="app-body">
        <p className="detail-opinion">{trend.opinion}</p>
        <div className="detail-grid">
          <section className="detail-card">
            <h2>履歴データ</h2>
            {history ? (
              <>
                <ChartControls />
                <div className="candlestick-chart-container">
                  <CandlestickChart candles={history.candles} sma5={history.sma5} bollinger={history.bollinger} />
                </div>
                <IndicatorPanel rsi={history.rsi} macd={history.macd} />
                <p className="detail-stats">
                  現在値: ¥{trend.price_at_fetch.toLocaleString()}
                  {latestSma5 !== undefined && ` / 5日移動平均: ¥${latestSma5.toLocaleString()}`} /
                  直近60日高値: ¥{history.high_60d.toLocaleString()} / 安値: ¥
                  {history.low_60d.toLocaleString()} / 出来高前日比: {history.volume_change_pct}%
                </p>
              </>
            ) : (
              <p>履歴データは今のところ取得できていません。</p>
            )}
          </section>
          {market_analysis ? (
            <MarketAnalysisPanel marketAnalysis={market_analysis} />
          ) : (
            <section className="detail-card">
              <h2>市場分析</h2>
              <p>市場分析データは今のところ取得できていません。</p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: テストが通ることを確認**

Run: `cd frontend && npx vitest run`
Expected: 全件PASS(`App.test.tsx`含む)

- [ ] **Step 7: 型チェック**

Run: `cd frontend && npx tsc --noEmit`
Expected: エラー無し

- [ ] **Step 8: コミット**

```bash
cd frontend && git add src/api/trends.ts src/App.tsx src/components/DetailPage.tsx src/components/DetailPage.test.tsx
git commit -m "feat(frontend): wire ChartControls/IndicatorPanel into DetailPage"
```

---

### Task 13: 最終検証(コード変更無し)

**Files:** なし(検証のみ)

- [ ] **Step 1: フロントエンド全テスト + 型チェック**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: 全件PASS、tscエラー無し

- [ ] **Step 2: バックエンド全テスト**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/ -v`
Expected: 全件PASS

- [ ] **Step 3: Docker起動して実画面確認**

Run: `docker compose up -d --build`

Playwright等で以下を確認する:
- 詳細画面に足種タブ(5分/10分/15分/日足/週足/月足)と指標チェックボックス(RSI/MACD/
  ボリンジャーバンド)が表示される
- 足種タブをクリックするとチャートが切り替わり、ブラウザの開発者ツール(Network)で
  `GET /trends/{code}`以外の外部通信(yfinance相当)が発生していないことを確認する
  (バックエンドログでyfinance呼出しが「更新」「取得」時以外に発生していないことも
  合わせて確認する)
- RSI/MACDチェックボックスON時、チャート下にサブパネルが表示される
- ボリンジャーバンドON時、価格チャートに3本の追加ラインが重ね書きされる
- ダークテーマ切替時、ChartControls・IndicatorPanel共に配色が追従する(機能3=
  テーマ設定との統合確認)
- 足種・指標選択後にページリロードしても設定が維持される(localStorage永続化)
- 別銘柄の詳細画面へ遷移しても、直前に選択した足種・指標設定が引き継がれる
  (全銘柄共通1設定であることの確認)

この Task は verification のみでコード変更・コミットを行わない。
