# 機能B: 詳細画面-履歴/市場分析 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 詳細画面(`/trends/:code`)に、ローソク足チャート・5日移動平均・直近60日高値安値・出来高前日比(履歴データ)と、日経225との相対強度・マクロ指標との相関(市場分析)を表示する。

**Architecture:** 一覧の取得・更新時(`create_trend`/`refresh_trends`)にyfinanceから履歴データを取得し、新設の`history_service`/`market_analysis_service`で計算した結果を`trend.detail`(JSON列)へ保存する。詳細画面は`GET /trends/{code}`でその保存済みデータを読むだけで、新規のyfinance呼出は発生しない。

**Tech Stack:** 既存のFastAPI+SQLAlchemy+MySQL(backend)、React+Vite+TypeScript(frontend)に、backend側は`pandas`(Pearson相関計算)、frontend側は`lightweight-charts`(ローソク足描画)を追加する。

**Spec:** projects/trend-compass/docs/design/02-history-market-analysis.md

## Global Constraints

- 履歴/市場分析データは一覧の取得・更新時にまとめて取得し`trend.detail`へ保存する。詳細画面表示時に新規のyfinance呼出は行わない
- 「業種指数」は日経225(`^N225`)を代用指標として使う。厳密な業種別指数(TOPIX-17等)はスコープ外
- 業種平均との相対強度は直近5日変動率の差(pt単位)、マクロ指標(米10年債利回り`^TNX`・USD/JPY`JPY=X`)との相関は直近20日価格系列のPearson相関係数
- 履歴/市場分析データの取得に失敗しても、`create_trend`/`refresh_trends`自体は失敗させない。`detail={}`のまま処理を継続する
- 一覧用の`TrendOut`レスポンス形式は変更しない。`detail`を返すのは新設の`GET /trends/{code}`のみ
- ニュース取得・センチメント判定(機能C)は対象外

---

## File Structure

```
backend/
├── requirements.txt              # pandas==3.0.5 を追加
├── app/
│   ├── yfinance_client.py        # get_price_history / get_industry_label を追加
│   ├── history_service.py        # 新規: 履歴データ(ローソク足・SMA5・60日高安・出来高前日比)
│   ├── market_analysis_service.py # 新規: 市場分析(相対強度・マクロ相関)
│   ├── trend_service.py          # _build_detail を追加、create_trend/refresh_trendsから呼出
│   ├── schemas.py                # TrendDetailOut を追加
│   └── routers/trends.py         # GET /trends/{code} を追加
└── tests/
    ├── conftest.py                # get_price_history を自動stubするautouseフィクスチャ追加
    ├── test_yfinance_client.py    # get_price_history/get_industry_label のテスト追加
    ├── test_history_service.py    # 新規
    ├── test_market_analysis_service.py # 新規
    ├── test_trend_service.py      # detail構築の成功/失敗テスト追加
    └── test_trends_api.py         # GET /trends/{code} のテスト追加

frontend/
├── package.json                   # lightweight-charts を追加
└── src/
    ├── types.ts                   # Candle/SmaPoint/HistoryDetail/MacroCorrelation/MarketAnalysisDetail/TrendDetail を追加
    ├── api/trends.ts               # fetchTrendDetail を追加
    ├── api/trends.test.ts          # fetchTrendDetail のテスト追加
    ├── App.tsx                     # DetailPlaceholderPage → DetailPage に置き換え
    ├── App.test.tsx                # 詳細画面テストをfetchTrendDetailモックに更新
    └── components/
        ├── CandlestickChart.tsx / .test.tsx    # 新規
        ├── MarketAnalysisPanel.tsx / .test.tsx  # 新規
        ├── DetailPage.tsx / .test.tsx            # 新規(DetailPlaceholderPage.tsx/.test.tsxを置き換え)
        ├── DetailPlaceholderPage.tsx              # 削除
        └── DetailPlaceholderPage.test.tsx         # 削除
```

---

### Task 1: yfinance_client — 履歴データ・業種ラベル取得

**Files:**
- Modify: `backend/app/yfinance_client.py`
- Test: `backend/tests/test_yfinance_client.py`

**Interfaces:**
- Consumes: 既存の`InvalidCodeError`、`_to_yf_symbol`
- Produces: `get_price_history(code: str, days: int = 90) -> list[dict]`(各要素は`{"date": "YYYY-MM-DD", "open": float, "high": float, "low": float, "close": float, "volume": int}`、日付昇順)。`get_industry_label(code: str) -> str`

- [ ] **Step 1: 失敗するテストを書く**

`backend/tests/test_yfinance_client.py` に追記(既存の`FakeTicker`クラスはそのまま再利用):
```python
import pandas as pd


class FakeHistoryTicker:
    def __init__(self, frame):
        self._frame = frame

    def history(self, period):
        return self._frame


def test_get_price_history_returns_candles(monkeypatch):
    index = pd.to_datetime(["2026-08-24", "2026-08-25"])
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
    monkeypatch.setattr(yfinance_client.yf, "Ticker", lambda symbol: FakeHistoryTicker(frame))

    candles = yfinance_client.get_price_history("7203")

    assert candles == [
        {"date": "2026-08-24", "open": 99.0, "high": 101.0, "low": 98.0, "close": 100.0, "volume": 1000},
        {"date": "2026-08-25", "open": 100.0, "high": 103.0, "low": 99.0, "close": 102.0, "volume": 1100},
    ]


def test_get_price_history_truncates_to_requested_days(monkeypatch):
    index = pd.to_datetime(["2026-08-24", "2026-08-25", "2026-08-26"])
    frame = pd.DataFrame(
        {
            "Open": [10.0, 20.0, 30.0],
            "High": [11.0, 21.0, 31.0],
            "Low": [9.0, 19.0, 29.0],
            "Close": [10.5, 20.5, 30.5],
            "Volume": [100, 200, 300],
        },
        index=index,
    )
    monkeypatch.setattr(yfinance_client.yf, "Ticker", lambda symbol: FakeHistoryTicker(frame))

    candles = yfinance_client.get_price_history("7203", days=2)

    assert len(candles) == 2
    assert candles[0]["date"] == "2026-08-25"
    assert candles[1]["date"] == "2026-08-26"


def test_get_price_history_raises_when_empty(monkeypatch):
    empty_frame = pd.DataFrame(columns=["Open", "High", "Low", "Close", "Volume"])
    monkeypatch.setattr(yfinance_client.yf, "Ticker", lambda symbol: FakeHistoryTicker(empty_frame))

    with pytest.raises(yfinance_client.InvalidCodeError):
        yfinance_client.get_price_history("9999")


def test_get_price_history_wraps_unexpected_exception(monkeypatch):
    class RaisingTicker:
        def history(self, period):
            raise RuntimeError("boom")

    monkeypatch.setattr(yfinance_client.yf, "Ticker", lambda symbol: RaisingTicker())

    with pytest.raises(yfinance_client.InvalidCodeError):
        yfinance_client.get_price_history("7203")


def test_get_industry_label_returns_industry(monkeypatch):
    monkeypatch.setattr(
        yfinance_client.yf, "Ticker", lambda symbol: FakeTicker({"industry": "Auto Manufacturers"})
    )

    label = yfinance_client.get_industry_label("7203")

    assert label == "Auto Manufacturers"


def test_get_industry_label_falls_back_to_sector(monkeypatch):
    monkeypatch.setattr(
        yfinance_client.yf, "Ticker", lambda symbol: FakeTicker({"sector": "Consumer Cyclical"})
    )

    label = yfinance_client.get_industry_label("7203")

    assert label == "Consumer Cyclical"


def test_get_industry_label_raises_when_missing(monkeypatch):
    monkeypatch.setattr(yfinance_client.yf, "Ticker", lambda symbol: FakeTicker({}))

    with pytest.raises(yfinance_client.InvalidCodeError):
        yfinance_client.get_industry_label("9999")
```

(`import pandas as pd`をファイル先頭のimport群に追加すること。`pandas`はyfinanceの依存として既にインストール済みなのでこの時点で`requirements.txt`変更は不要)

- [ ] **Step 2: 実行して失敗を確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_yfinance_client.py -v`
Expected: FAIL(`AttributeError: module 'app.yfinance_client' has no attribute 'get_price_history'`等)

- [ ] **Step 3: 実装を追記**

`backend/app/yfinance_client.py` に追記:
```python
def get_price_history(code: str, days: int = 90) -> list[dict]:
    symbol = _to_yf_symbol(code)
    try:
        ticker = yf.Ticker(symbol)
        history = ticker.history(period="6mo")
    except Exception as exc:
        raise InvalidCodeError(code) from exc

    if history.empty:
        raise InvalidCodeError(code)

    history = history.tail(days)
    candles = []
    for date, row in history.iterrows():
        candles.append(
            {
                "date": date.strftime("%Y-%m-%d"),
                "open": float(row["Open"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
                "close": float(row["Close"]),
                "volume": int(row["Volume"]),
            }
        )
    return candles


def get_industry_label(code: str) -> str:
    symbol = _to_yf_symbol(code)
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
    except Exception as exc:
        raise InvalidCodeError(code) from exc

    label = info.get("industry") or info.get("sector")
    if label is None:
        raise InvalidCodeError(code)
    return label
```

- [ ] **Step 4: 実行して成功を確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_yfinance_client.py -v`
Expected: PASS(既存3件+新規7件=10件)

- [ ] **Step 5: Commit**

```bash
git add backend/app/yfinance_client.py backend/tests/test_yfinance_client.py
git commit -m "$(cat <<'EOF'
feat(backend): add get_price_history and get_industry_label to yfinance client

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: history_service — 履歴データ算出

**Files:**
- Create: `backend/app/history_service.py`
- Test: `backend/tests/test_history_service.py`

**Interfaces:**
- Consumes: なし(candlesのリストのみを受け取る、純粋な計算関数)
- Produces: `history_service.build_history_detail(candles: list[dict]) -> dict`。返り値の形は
  `{"candles": [...], "sma5": [{"date": str, "value": float}, ...], "high_60d": float, "low_60d": float, "volume_change_pct": float}`。
  `candles`が空リストの場合は`{}`を返す

- [ ] **Step 1: 失敗するテストを書く**

`backend/tests/test_history_service.py`:
```python
from app import history_service

CANDLES = [
    {"date": "2026-08-24", "open": 99.0, "high": 102.0, "low": 98.0, "close": 100.0, "volume": 1000},
    {"date": "2026-08-25", "open": 100.0, "high": 104.0, "low": 100.0, "close": 102.0, "volume": 1100},
    {"date": "2026-08-26", "open": 102.0, "high": 106.0, "low": 102.0, "close": 104.0, "volume": 1050},
    {"date": "2026-08-27", "open": 104.0, "high": 110.0, "low": 106.0, "close": 108.0, "volume": 1200},
    {"date": "2026-08-28", "open": 108.0, "high": 112.0, "low": 108.0, "close": 110.0, "volume": 900},
    {"date": "2026-08-31", "open": 110.0, "high": 114.0, "low": 110.0, "close": 112.0, "volume": 1500},
]


def test_build_history_detail_returns_all_display_candles():
    detail = history_service.build_history_detail(CANDLES)

    assert len(detail["candles"]) == 6
    assert detail["candles"][0] == CANDLES[0]
    assert detail["candles"][-1] == CANDLES[-1]


def test_build_history_detail_computes_rolling_sma5():
    detail = history_service.build_history_detail(CANDLES)

    values = [point["value"] for point in detail["sma5"]]
    assert values == [100.0, 101.0, 102.0, 103.5, 104.8, 107.2]
    assert detail["sma5"][0]["date"] == "2026-08-24"


def test_build_history_detail_computes_60d_high_low():
    detail = history_service.build_history_detail(CANDLES)

    assert detail["high_60d"] == 114.0
    assert detail["low_60d"] == 98.0


def test_build_history_detail_computes_volume_change_pct():
    detail = history_service.build_history_detail(CANDLES)

    assert detail["volume_change_pct"] == 66.7


def test_build_history_detail_returns_empty_dict_for_no_candles():
    assert history_service.build_history_detail([]) == {}
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_history_service.py -v`
Expected: FAIL(`ModuleNotFoundError: No module named 'app.history_service'`)

- [ ] **Step 3: 実装**

`backend/app/history_service.py`:
```python
def build_history_detail(candles: list[dict]) -> dict:
    if not candles:
        return {}

    closes = [c["close"] for c in candles]
    sma5_all = _rolling_sma(closes, 5)

    display_candles = candles[-20:]
    display_sma5 = sma5_all[-20:]

    last_60 = candles[-60:]
    high_60d = max(c["high"] for c in last_60)
    low_60d = min(c["low"] for c in last_60)

    latest_volume = candles[-1]["volume"]
    previous_volume = candles[-2]["volume"] if len(candles) >= 2 else None
    if previous_volume:
        volume_change_pct = round((latest_volume - previous_volume) / previous_volume * 100, 1)
    else:
        volume_change_pct = 0.0

    return {
        "candles": [
            {
                "date": c["date"],
                "open": c["open"],
                "high": c["high"],
                "low": c["low"],
                "close": c["close"],
                "volume": c["volume"],
            }
            for c in display_candles
        ],
        "sma5": [
            {"date": c["date"], "value": round(v, 1)}
            for c, v in zip(display_candles, display_sma5)
        ],
        "high_60d": high_60d,
        "low_60d": low_60d,
        "volume_change_pct": volume_change_pct,
    }


def _rolling_sma(values: list[float], window: int) -> list[float]:
    result = []
    for i in range(len(values)):
        start = max(0, i - window + 1)
        segment = values[start : i + 1]
        result.append(sum(segment) / len(segment))
    return result
```

- [ ] **Step 4: 実行して成功を確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_history_service.py -v`
Expected: PASS(5件)

- [ ] **Step 5: Commit**

```bash
git add backend/app/history_service.py backend/tests/test_history_service.py
git commit -m "$(cat <<'EOF'
feat(backend): add history_service for candle/SMA5/60d high-low/volume-change

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: market_analysis_service — 相対強度・マクロ相関算出

**Files:**
- Create: `backend/app/market_analysis_service.py`
- Modify: `backend/requirements.txt`(`pandas==3.0.5`を追加)
- Test: `backend/tests/test_market_analysis_service.py`

**Interfaces:**
- Consumes: `yfinance_client.get_industry_label`、`yfinance_client.get_price_history`
- Produces: `market_analysis_service.build_market_analysis_detail(code: str, candles: list[dict]) -> dict`。
  返り値: `{"sector_label": str, "relative_strength_5d_pt": float, "macro_correlation": {"us10y": float, "usdjpy": float}}`

- [ ] **Step 1: requirements.txtにpandasを追加**

`backend/requirements.txt` の`yfinance==1.7.0`の下に追記:
```
pandas==3.0.5
```

Run: `cd backend && source .venv/bin/activate && pip install -r requirements.txt` (既にインストール済みのため変化無しの想定。バージョン不一致があれば合わせる)

- [ ] **Step 2: 失敗するテストを書く**

`backend/tests/test_market_analysis_service.py`:
```python
import pytest

from app import market_analysis_service


def test_relative_strength_5d_positive_when_stock_outperforms():
    stock = [{"close": v} for v in [100.0, 102.0, 104.0, 108.0, 110.0, 112.0]]
    index = [{"close": v} for v in [200.0, 201.0, 202.0, 203.0, 204.0, 200.0]]

    result = market_analysis_service._relative_strength_5d(stock, index)

    stock_change = (112.0 - 102.0) / 102.0 * 100
    index_change = (200.0 - 201.0) / 201.0 * 100
    assert result == pytest.approx(round(stock_change - index_change, 1))


def test_relative_strength_5d_returns_zero_when_insufficient_data():
    result = market_analysis_service._relative_strength_5d(
        [{"close": 100.0}], [{"close": 200.0}]
    )

    assert result == 0.0


def test_correlation_20d_perfect_positive():
    stock = [{"close": float(v)} for v in range(1, 21)]
    other = [{"close": float(v) * 2} for v in range(1, 21)]

    result = market_analysis_service._correlation_20d(stock, other)

    assert result == pytest.approx(1.0)


def test_correlation_20d_perfect_negative():
    stock = [{"close": float(v)} for v in range(1, 21)]
    other = [{"close": float(-v)} for v in range(1, 21)]

    result = market_analysis_service._correlation_20d(stock, other)

    assert result == pytest.approx(-1.0)


def test_correlation_20d_returns_zero_when_insufficient_data():
    result = market_analysis_service._correlation_20d(
        [{"close": 100.0}], [{"close": 200.0}]
    )

    assert result == 0.0


def test_build_market_analysis_detail_assembles_all_fields(monkeypatch):
    stock_candles = [{"close": float(v)} for v in range(1, 21)]
    index_candles = [{"close": float(v) * 2} for v in range(1, 21)]
    us10y_candles = [{"close": float(v)} for v in range(1, 21)]
    usdjpy_candles = [{"close": float(-v)} for v in range(1, 21)]

    def fake_get_price_history(code):
        return {"^N225": index_candles, "^TNX": us10y_candles, "JPY=X": usdjpy_candles}[code]

    monkeypatch.setattr(
        market_analysis_service, "get_industry_label", lambda code: "Auto Manufacturers"
    )
    monkeypatch.setattr(market_analysis_service, "get_price_history", fake_get_price_history)

    detail = market_analysis_service.build_market_analysis_detail("7203", stock_candles)

    assert detail["sector_label"] == "Auto Manufacturers"
    assert detail["relative_strength_5d_pt"] == 0.0
    assert detail["macro_correlation"]["us10y"] == pytest.approx(1.0)
    assert detail["macro_correlation"]["usdjpy"] == pytest.approx(-1.0)
```

- [ ] **Step 3: 実行して失敗を確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_market_analysis_service.py -v`
Expected: FAIL(`ModuleNotFoundError: No module named 'app.market_analysis_service'`)

- [ ] **Step 4: 実装**

`backend/app/market_analysis_service.py`:
```python
import pandas as pd

from .yfinance_client import get_industry_label, get_price_history


def build_market_analysis_detail(code: str, candles: list[dict]) -> dict:
    sector_label = get_industry_label(code)

    index_candles = get_price_history("^N225")
    relative_strength_5d_pt = _relative_strength_5d(candles, index_candles)

    us10y_candles = get_price_history("^TNX")
    usdjpy_candles = get_price_history("JPY=X")

    return {
        "sector_label": sector_label,
        "relative_strength_5d_pt": relative_strength_5d_pt,
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

- [ ] **Step 5: 実行して成功を確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_market_analysis_service.py -v`
Expected: PASS(6件)

- [ ] **Step 6: Commit**

```bash
git add backend/app/market_analysis_service.py backend/requirements.txt backend/tests/test_market_analysis_service.py
git commit -m "$(cat <<'EOF'
feat(backend): add market_analysis_service for relative strength and macro correlation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: trend_service統合 — detail構築を取得/更新に組み込む

**Files:**
- Modify: `backend/tests/conftest.py`(get_price_historyを自動stubするautouseフィクスチャ追加)
- Modify: `backend/app/trend_service.py`
- Modify: `backend/tests/test_trend_service.py`

**Interfaces:**
- Consumes: `yfinance_client.get_price_history`、`history_service.build_history_detail`、
  `market_analysis_service.build_market_analysis_detail`
- Produces: `trend_service._build_detail(code: str) -> dict`(成功時`{"history": {...}, "market_analysis": {...}}`、
  失敗時・candles空時`{}`)。`create_trend`/`refresh_trends`が生成する`Trend`の`detail`フィールドがこれで置き換わる

**背景:** `create_trend`/`refresh_trends`はこれ以降、常に`get_price_history`を呼ぶようになる。
既存のTask4〜7のテスト(このタスクより前に作成済み)は`get_price_history`を一切モックしていないため、
そのまま実行すると実際にyfinanceへ問い合わせに行ってしまう(遅い・ネットワーク依存・既存アサーションには
影響しないが不安定)。これを避けるため、`conftest.py`に「デフォルトで`get_price_history`が空リストを返す」
autouseフィクスチャを追加する。既存テストは1行も変更不要(このフィクスチャがテストごとに自動適用される)。
本タスクで追加する新規テストは、個別に`monkeypatch.setattr(trend_service, "get_price_history", ...)`で
このデフォルトを上書きする。

- [ ] **Step 1: conftest.pyにautouseフィクスチャを追加**

`backend/tests/conftest.py` の先頭importに追記:
```python
from app import models, trend_service  # noqa: F401  Trendをメタデータに登録するため
```
(既存の`from app import models  # noqa: F401 ...`の行を上記に置き換える)

ファイル末尾に追記:
```python
@pytest.fixture(autouse=True)
def _stub_price_history(monkeypatch):
    monkeypatch.setattr(trend_service, "get_price_history", lambda code: [])
```

- [ ] **Step 2: 実行して既存テストが変わらずPASSすることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/ -v`
Expected: PASS(既存の全テストがこれまでと同じ件数のまま通る。この時点では`_build_detail`は未実装なので
`create_trend`/`refresh_trends`の`detail`はまだ常に`{}`のまま=挙動は変化していない)

- [ ] **Step 3: 失敗する新規テストを書く**

`backend/tests/test_trend_service.py` に追記:
```python
def test_create_trend_populates_detail_when_history_available(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    candles = [
        {"date": "2026-08-24", "open": 99.0, "high": 101.0, "low": 98.0, "close": 100.0, "volume": 1000}
    ]
    monkeypatch.setattr(trend_service, "get_price_history", lambda code: candles)
    monkeypatch.setattr(
        trend_service,
        "build_history_detail",
        lambda c: {"candles": c, "sma5": [], "high_60d": 101.0, "low_60d": 98.0, "volume_change_pct": 0.0},
    )
    monkeypatch.setattr(
        trend_service,
        "build_market_analysis_detail",
        lambda code, c: {
            "sector_label": "Auto Manufacturers",
            "relative_strength_5d_pt": 0.0,
            "macro_correlation": {"us10y": 0.0, "usdjpy": 0.0},
        },
    )

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.detail["history"]["high_60d"] == 101.0
    assert trend.detail["market_analysis"]["sector_label"] == "Auto Manufacturers"


def test_create_trend_leaves_detail_empty_when_history_fetch_fails(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )

    def raise_error(code):
        raise RuntimeError("yfinance unreachable")

    monkeypatch.setattr(trend_service, "get_price_history", raise_error)

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.detail == {}
    assert trend.name == "トヨタ自動車"


def test_create_trend_leaves_detail_empty_when_no_candles_returned(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    monkeypatch.setattr(trend_service, "get_price_history", lambda code: [])

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.detail == {}
```

- [ ] **Step 4: 実行して失敗を確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_trend_service.py -v`
Expected: FAIL(`AttributeError: module 'app.trend_service' has no attribute 'build_history_detail'`等。
1件目のテストは新規属性が無いためエラーで失敗、2・3件目は`detail`が常に`{}`になる実装がまだ無いため
既存挙動(常に`{}`)と偶然一致してPASSしてしまう可能性があるが、1件目の失敗を確認できれば十分)

- [ ] **Step 5: 実装**

`backend/app/trend_service.py` の先頭import群を以下に置き換える(既存の`from .yfinance_client import InvalidCodeError, get_quote`を含む):
```python
import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .history_service import build_history_detail
from .market_analysis_service import build_market_analysis_detail
from .yfinance_client import InvalidCodeError, get_price_history, get_quote

logger = logging.getLogger(__name__)
```

`_build_opinion`関数の直前に追記:
```python
def _build_detail(code: str) -> dict:
    try:
        candles = get_price_history(code)
        if not candles:
            return {}
        return {
            "history": build_history_detail(candles),
            "market_analysis": build_market_analysis_detail(code, candles),
        }
    except Exception:
        logger.warning("failed to build detail for %s", code, exc_info=True)
        return {}
```

`create_trend`内の`detail={},`を`detail=_build_detail(code),`に変更。
`refresh_trends`内の`detail={},`を`detail=_build_detail(code),`に変更。

- [ ] **Step 6: 実行して成功を確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/ -v`
Expected: PASS(全件。既存テストも新規3件も含めて)

- [ ] **Step 7: Commit**

```bash
git add backend/app/trend_service.py backend/tests/conftest.py backend/tests/test_trend_service.py
git commit -m "$(cat <<'EOF'
feat(backend): wire history/market-analysis detail building into create_trend and refresh_trends

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: API — GET /trends/{code}

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/trends.py`
- Modify: `backend/tests/test_trends_api.py`

**Interfaces:**
- Consumes: `trend_service.get_active_trend`
- Produces: `GET /trends/{code}` → 200(`TrendDetailOut`、`detail`を含む) | 404

- [ ] **Step 1: 失敗するテストを書く**

`backend/tests/test_trends_api.py` に追記:
```python
def test_get_trend_detail_returns_detail(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})

    response = client.get("/trends/7203")

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == "7203"
    assert body["detail"] == {}


def test_get_trend_detail_not_found_returns_404(client):
    response = client.get("/trends/9999")

    assert response.status_code == 404
```

(このファイルの`client`フィクスチャは`conftest.py`のautouseフィクスチャと合わせて`get_price_history`が
自動的に空リストを返すため、追加のモック無しで`detail == {}`になる)

- [ ] **Step 2: 実行して失敗を確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_trends_api.py -v`
Expected: FAIL(`test_get_trend_detail_returns_detail`が404になる。`GET /trends/{code}`が未実装なので
`GET /trends/7203`は既存の`GET /trends/{code}`相当のルートが無く、Starletteのデフォルトで404)

- [ ] **Step 3: 実装**

`backend/app/schemas.py` に追記:
```python
class TrendDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    opinion: str
    price_at_fetch: float
    created_at: datetime
    detail: dict
```

`backend/app/routers/trends.py` のimportを更新(`TrendDetailOut`を追加):
```python
from ..schemas import DeleteResponse, RefreshRequest, TrendCreateRequest, TrendDetailOut, TrendOut
```

`list_trends`関数の直後に追記:
```python
@router.get("/{code}", response_model=TrendDetailOut)
def get_trend_detail(code: str, db: Session = Depends(get_db)):
    trend = trend_service.get_active_trend(db, code)
    if trend is None:
        raise HTTPException(status_code=404, detail=f"銘柄コード {code} は見つかりません")
    return trend
```

- [ ] **Step 4: 実行して成功を確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/ -v`
Expected: PASS(全件)

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas.py backend/app/routers/trends.py backend/tests/test_trends_api.py
git commit -m "$(cat <<'EOF'
feat(backend): add GET /trends/{code} detail endpoint

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: frontend型定義 + APIクライアント

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api/trends.ts`
- Modify: `frontend/src/api/trends.test.ts`

**Interfaces:**
- Consumes: 既存の`apiRequest`
- Produces: `Candle`/`SmaPoint`/`HistoryDetail`/`MacroCorrelation`/`MarketAnalysisDetail`/`TrendDetail`型、
  `fetchTrendDetail(code: string): Promise<TrendDetail>`

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/api/trends.test.ts` の先頭importを以下に置き換え:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addTrend, deleteTrend, fetchTrendDetail, fetchTrends, refreshTrends } from "./trends";
```

ファイル末尾に追記:
```ts
it("fetchTrendDetail returns parsed detail", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 1,
        code: "7203",
        name: "トヨタ自動車",
        opinion: "初回取得、履歴データ無し",
        price_at_fetch: 2900,
        created_at: "2026-09-17T00:00:00Z",
        detail: {},
      }),
    })
  );

  const result = await fetchTrendDetail("7203");

  expect(result.code).toBe("7203");
  expect(result.detail).toEqual({});
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `cd frontend && npx vitest run src/api/trends.test.ts`
Expected: FAIL(`fetchTrendDetail`が存在しない)

- [ ] **Step 3: 実装**

`frontend/src/types.ts` を以下に置き換え(既存の`Trend`インターフェースはそのまま、追記のみ):
```ts
export interface Trend {
  id: number;
  code: string;
  name: string;
  opinion: string;
  price_at_fetch: number;
  created_at: string;
}

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SmaPoint {
  date: string;
  value: number;
}

export interface HistoryDetail {
  candles: Candle[];
  sma5: SmaPoint[];
  high_60d: number;
  low_60d: number;
  volume_change_pct: number;
}

export interface MacroCorrelation {
  us10y: number;
  usdjpy: number;
}

export interface MarketAnalysisDetail {
  sector_label: string;
  relative_strength_5d_pt: number;
  macro_correlation: MacroCorrelation;
}

export interface TrendDetail extends Trend {
  detail: {
    history?: HistoryDetail;
    market_analysis?: MarketAnalysisDetail;
  };
}
```

`frontend/src/api/trends.ts` の先頭importを更新:
```ts
import type { Trend, TrendDetail } from "../types";
import { apiRequest } from "./client";
```

ファイル末尾に追記:
```ts
export function fetchTrendDetail(code: string): Promise<TrendDetail> {
  return apiRequest<TrendDetail>(`/trends/${code}`);
}
```

- [ ] **Step 4: 実行して成功を確認**

Run: `cd frontend && npx vitest run src/api/trends.test.ts`
Expected: PASS(6件)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types.ts frontend/src/api/trends.ts frontend/src/api/trends.test.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add TrendDetail types and fetchTrendDetail API client

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: CandlestickChart コンポーネント

**Files:**
- Modify: `frontend/package.json`(`lightweight-charts`を追加)
- Create: `frontend/src/components/CandlestickChart.tsx`
- Test: `frontend/src/components/CandlestickChart.test.tsx`

**Interfaces:**
- Consumes: `types.ts`の`Candle`/`SmaPoint`
- Produces: `CandlestickChart({ candles, sma5 }: { candles: Candle[]; sma5: SmaPoint[] })`。
  ルート要素に`data-testid="candlestick-chart"`を持つ

- [ ] **Step 1: lightweight-chartsをインストール**

Run: `cd frontend && npm install lightweight-charts@4.2.0`

- [ ] **Step 2: 失敗するテストを書く**

`frontend/src/components/CandlestickChart.test.tsx`:
```tsx
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CandlestickChart } from "./CandlestickChart";

const setDataCandle = vi.fn();
const setDataLine = vi.fn();
const addCandlestickSeries = vi.fn(() => ({ setData: setDataCandle }));
const addLineSeries = vi.fn(() => ({ setData: setDataLine }));
const remove = vi.fn();

vi.mock("lightweight-charts", () => ({
  createChart: vi.fn(() => ({
    addCandlestickSeries,
    addLineSeries,
    remove,
  })),
}));

describe("CandlestickChart", () => {
  it("renders a container and initializes candle + SMA5 series", () => {
    const candles = [
      { date: "2026-08-24", open: 99, high: 101, low: 98, close: 100, volume: 1000 },
    ];
    const sma5 = [{ date: "2026-08-24", value: 100 }];

    const { getByTestId } = render(<CandlestickChart candles={candles} sma5={sma5} />);

    expect(getByTestId("candlestick-chart")).toBeInTheDocument();
    expect(addCandlestickSeries).toHaveBeenCalled();
    expect(addLineSeries).toHaveBeenCalled();
    expect(setDataCandle).toHaveBeenCalledWith([
      { time: "2026-08-24", open: 99, high: 101, low: 98, close: 100 },
    ]);
    expect(setDataLine).toHaveBeenCalledWith([{ time: "2026-08-24", value: 100 }]);
  });
});
```

- [ ] **Step 3: 実行して失敗を確認**

Run: `cd frontend && npx vitest run src/components/CandlestickChart.test.tsx`
Expected: FAIL(モジュールが存在しない)

- [ ] **Step 4: 実装**

`frontend/src/components/CandlestickChart.tsx`:
```tsx
import { useEffect, useRef } from "react";
import { createChart, type IChartApi } from "lightweight-charts";
import type { Candle, SmaPoint } from "../types";

interface CandlestickChartProps {
  candles: Candle[];
  sma5: SmaPoint[];
}

export function CandlestickChart({ candles, sma5 }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 300,
    });
    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries();
    candleSeries.setData(
      candles.map((c) => ({
        time: c.date,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    const smaSeries = chart.addLineSeries({ color: "#2f5fdb", lineWidth: 2 });
    smaSeries.setData(sma5.map((p) => ({ time: p.date, value: p.value })));

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, sma5]);

  return <div data-testid="candlestick-chart" ref={containerRef} />;
}
```

- [ ] **Step 5: 実行して成功を確認**

Run: `cd frontend && npx vitest run src/components/CandlestickChart.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/CandlestickChart.tsx frontend/src/components/CandlestickChart.test.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): add CandlestickChart component using lightweight-charts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: MarketAnalysisPanel コンポーネント

**Files:**
- Create: `frontend/src/components/MarketAnalysisPanel.tsx`
- Test: `frontend/src/components/MarketAnalysisPanel.test.tsx`

**Interfaces:**
- Consumes: `types.ts`の`MarketAnalysisDetail`
- Produces: `MarketAnalysisPanel({ marketAnalysis }: { marketAnalysis: MarketAnalysisDetail })`

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/components/MarketAnalysisPanel.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketAnalysisPanel } from "./MarketAnalysisPanel";

describe("MarketAnalysisPanel", () => {
  it("renders sector label, relative strength, and macro correlation", () => {
    render(
      <MarketAnalysisPanel
        marketAnalysis={{
          sector_label: "Auto Manufacturers",
          relative_strength_5d_pt: 0.5,
          macro_correlation: { us10y: -0.31, usdjpy: 0.62 },
        }}
      />
    );

    expect(screen.getByText("業種: Auto Manufacturers")).toBeInTheDocument();
    expect(screen.getByText("業種平均との相対強度: +0.5pt")).toBeInTheDocument();
    expect(screen.getByText("米10年債利回りとの相関: -0.31")).toBeInTheDocument();
    expect(screen.getByText("USD/JPYとの相関: 0.62")).toBeInTheDocument();
  });

  it("does not add a plus sign for a negative relative strength value", () => {
    render(
      <MarketAnalysisPanel
        marketAnalysis={{
          sector_label: "Auto Manufacturers",
          relative_strength_5d_pt: -0.5,
          macro_correlation: { us10y: 0.1, usdjpy: 0.1 },
        }}
      />
    );

    expect(screen.getByText("業種平均との相対強度: -0.5pt")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `cd frontend && npx vitest run src/components/MarketAnalysisPanel.test.tsx`
Expected: FAIL(モジュールが存在しない)

- [ ] **Step 3: 実装**

`frontend/src/components/MarketAnalysisPanel.tsx`:
```tsx
import type { MarketAnalysisDetail } from "../types";

interface MarketAnalysisPanelProps {
  marketAnalysis: MarketAnalysisDetail;
}

export function MarketAnalysisPanel({ marketAnalysis }: MarketAnalysisPanelProps) {
  const { sector_label, relative_strength_5d_pt, macro_correlation } = marketAnalysis;
  const sign = relative_strength_5d_pt >= 0 ? "+" : "";

  return (
    <section>
      <h2>市場分析</h2>
      <p>業種: {sector_label}</p>
      <p>
        業種平均との相対強度: {sign}
        {relative_strength_5d_pt.toFixed(1)}pt
      </p>
      <p>米10年債利回りとの相関: {macro_correlation.us10y.toFixed(2)}</p>
      <p>USD/JPYとの相関: {macro_correlation.usdjpy.toFixed(2)}</p>
    </section>
  );
}
```

- [ ] **Step 4: 実行して成功を確認**

Run: `cd frontend && npx vitest run src/components/MarketAnalysisPanel.test.tsx`
Expected: PASS(2件)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MarketAnalysisPanel.tsx frontend/src/components/MarketAnalysisPanel.test.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): add MarketAnalysisPanel component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: DetailPage統合 + ルーティング更新

**Files:**
- Create: `frontend/src/components/DetailPage.tsx`
- Test: `frontend/src/components/DetailPage.test.tsx`
- Delete: `frontend/src/components/DetailPlaceholderPage.tsx`
- Delete: `frontend/src/components/DetailPlaceholderPage.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `api/trends.fetchTrendDetail`、`CandlestickChart`、`MarketAnalysisPanel`
- Produces: `DetailPage`(ルート`/trends/:code`の実体)

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/components/DetailPage.test.tsx`:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as trendsApi from "../api/trends";
import { DetailPage } from "./DetailPage";

vi.mock("../api/trends");
vi.mock("lightweight-charts", () => ({
  createChart: vi.fn(() => ({
    addCandlestickSeries: vi.fn(() => ({ setData: vi.fn() })),
    addLineSeries: vi.fn(() => ({ setData: vi.fn() })),
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
      candles: [{ date: "2026-08-24", open: 99, high: 101, low: 98, close: 100, volume: 1000 }],
      sma5: [{ date: "2026-08-24", value: 100 }],
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
    <MemoryRouter initialEntries={[`/trends/${code}`]}>
      <Routes>
        <Route path="/trends/:code" element={<DetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("DetailPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows the chart and market analysis panel when detail data is available", async () => {
    vi.mocked(trendsApi.fetchTrendDetail).mockResolvedValue(sampleDetail);

    renderAt("7203");

    expect(await screen.findByRole("heading", { name: "7203 トヨタ自動車" })).toBeInTheDocument();
    expect(screen.getByTestId("candlestick-chart")).toBeInTheDocument();
    expect(screen.getByText("業種: Auto Manufacturers")).toBeInTheDocument();
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

- [ ] **Step 2: 実行して失敗を確認**

Run: `cd frontend && npx vitest run src/components/DetailPage.test.tsx`
Expected: FAIL(モジュールが存在しない)

- [ ] **Step 3: 実装**

`frontend/src/components/DetailPage.tsx`:
```tsx
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchTrendDetail } from "../api/trends";
import type { TrendDetail } from "../types";
import { CandlestickChart } from "./CandlestickChart";
import { MarketAnalysisPanel } from "./MarketAnalysisPanel";

export function DetailPage() {
  const { code } = useParams<{ code: string }>();
  const [trend, setTrend] = useState<TrendDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    fetchTrendDetail(code)
      .then(setTrend)
      .catch((err) => setError((err as Error).message));
  }, [code]);

  if (error) {
    return (
      <main>
        <Link to="/">一覧へ戻る</Link>
        <p role="alert">{error}</p>
      </main>
    );
  }

  if (!trend) {
    return (
      <main>
        <Link to="/">一覧へ戻る</Link>
        <p>読込中...</p>
      </main>
    );
  }

  const { history, market_analysis } = trend.detail;

  return (
    <main>
      <Link to="/">一覧へ戻る</Link>
      <h1>
        {trend.code} {trend.name}
      </h1>
      {history ? (
        <>
          <CandlestickChart candles={history.candles} sma5={history.sma5} />
          <p>
            直近60日高値: ¥{history.high_60d.toLocaleString()} / 安値: ¥
            {history.low_60d.toLocaleString()} / 出来高前日比: {history.volume_change_pct}%
          </p>
        </>
      ) : (
        <p>履歴データは今のところ取得できていません。</p>
      )}
      {market_analysis ? (
        <MarketAnalysisPanel marketAnalysis={market_analysis} />
      ) : (
        <p>市場分析データは今のところ取得できていません。</p>
      )}
    </main>
  );
}
```

- [ ] **Step 4: 実行して成功を確認**

Run: `cd frontend && npx vitest run src/components/DetailPage.test.tsx`
Expected: PASS(3件)

- [ ] **Step 5: DetailPlaceholderPageを削除し、App.tsxを更新**

Run: `rm frontend/src/components/DetailPlaceholderPage.tsx frontend/src/components/DetailPlaceholderPage.test.tsx`

`frontend/src/App.tsx`:
```tsx
import { Route, Routes } from "react-router-dom";
import { DetailPage } from "./components/DetailPage";
import { WatchlistPage } from "./components/WatchlistPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WatchlistPage />} />
      <Route path="/trends/:code" element={<DetailPage />} />
    </Routes>
  );
}
```

`frontend/src/App.test.tsx`の2件目のテスト(`"renders the detail placeholder at /trends/:code"`)を
以下に置き換える(1件目の`"renders the watchlist page at /"`はそのまま変更しない):
```tsx
it("renders the detail page at /trends/:code", async () => {
  vi.mocked(trendsApi.fetchTrendDetail).mockResolvedValue({
    id: 1,
    code: "7203",
    name: "トヨタ自動車",
    opinion: "初回取得、履歴データ無し",
    price_at_fetch: 2900,
    created_at: "2026-09-17T00:00:00Z",
    detail: {},
  });

  render(
    <MemoryRouter initialEntries={["/trends/7203"]}>
      <App />
    </MemoryRouter>
  );

  expect(await screen.findByRole("heading", { name: "7203 トヨタ自動車" })).toBeInTheDocument();
});
```

- [ ] **Step 6: フロントエンド全テストを実行して成功を確認**

Run: `cd frontend && npx vitest run`
Expected: PASS(全件)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/DetailPage.tsx frontend/src/components/DetailPage.test.tsx frontend/src/App.tsx frontend/src/App.test.tsx
git rm frontend/src/components/DetailPlaceholderPage.tsx frontend/src/components/DetailPlaceholderPage.test.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): replace DetailPlaceholderPage with real DetailPage (chart + market analysis)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: 最終疎通確認

**Files:** なし(検証のみ)

**Interfaces:** なし

- [ ] **Step 1: バックエンド全テストを実行**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/ -v`
Expected: PASS(全件)

- [ ] **Step 2: フロントエンド全テストとtypecheckを実行**

Run:
```bash
cd frontend && npx vitest run && npx tsc --noEmit
```
Expected: 両方成功

- [ ] **Step 3: docker composeで再ビルドし疎通確認**

Run:
```bash
docker compose up -d --build
curl -sf http://localhost:8000/health
```
その後ブラウザ(またはPlaywright)で以下を確認:
- 一覧画面でコード(例: 7203)を取得→「詳細」リンク→`/trends/7203`へ遷移
- ローソク足チャートが表示される(実際のyfinanceデータが取得できる環境であれば実データ、
  取得できない環境では「履歴データは今のところ取得できていません。」の文言が表示される
  ことを確認する。どちらであっても一覧画面自体の取得・所見表示は失敗しないことを確認する)
- 「一覧へ戻る」で一覧画面に戻れる

完了後: `docker compose down`

- [ ] **Step 4: Commit**

このタスクはコード変更を伴わないため、コミットは無し。全て完了していれば作業終了。

---

## Self-Review Notes

- **Spec coverage:** doc-specのゴール3項目(履歴データ表示・市場分析表示・取得失敗時の非破壊性)は
  それぞれTask1-2、Task3、Task4で実装・テスト済み。対象外(機能C・厳密な業種指数・ライブ再取得)は
  範囲外のまま維持。
- **命名一貫性確認済み:** `get_price_history`/`get_industry_label`(yfinance_client)、
  `build_history_detail`(history_service)、`build_market_analysis_detail`(market_analysis_service)、
  `_build_detail`(trend_service)は全タスクで一致。frontend側`fetchTrendDetail`/`TrendDetail`/
  `HistoryDetail`/`MarketAnalysisDetail`も一貫。
- **既存テストへの影響:** Task4のautouseフィクスチャにより、機能Aで作成済みの既存テスト(Task4-7相当)は
  1つも変更せずに済む設計にした。
- **doc-specからの差分:** doc-specのJSON例では`sma5_latest`(単一値)としていたが、モックアップ
  (`level-02-detail_*.png`)が示す「青線: 5日移動平均」はチャート全体を覆う移動平均線であり、
  単一値では表現できない。本プランでは`sma5`(表示中の各日に対応する値の配列)に変更した。
  frontendの移動平均線表示・stats行の「最新値」表示は`sma5`配列の最後の要素から導出する。
