import pandas as pd
import pytest

from app import yfinance_client


class FakeTicker:
    def __init__(self, info):
        self.info = info


def test_get_quote_returns_name_and_price(monkeypatch):
    monkeypatch.setattr(
        yfinance_client.yf,
        "Ticker",
        lambda symbol: FakeTicker({"longName": "トヨタ自動車", "currentPrice": 2914.0}),
    )

    quote = yfinance_client.get_quote("7203")

    assert quote == {"name": "トヨタ自動車", "price": 2914.0}


def test_get_quote_uses_tokyo_suffix_for_numeric_codes(monkeypatch):
    seen = {}

    def fake_ticker(symbol):
        seen["symbol"] = symbol
        return FakeTicker({"longName": "テスト", "currentPrice": 100.0})

    monkeypatch.setattr(yfinance_client.yf, "Ticker", fake_ticker)
    yfinance_client.get_quote("7203")

    assert seen["symbol"] == "7203.T"


def test_get_quote_raises_when_price_missing(monkeypatch):
    monkeypatch.setattr(
        yfinance_client.yf,
        "Ticker",
        lambda symbol: FakeTicker({"longName": "テスト"}),
    )

    with pytest.raises(yfinance_client.InvalidCodeError):
        yfinance_client.get_quote("9999")


def test_get_quote_wraps_unexpected_exceptions(monkeypatch):
    def raise_error(symbol):
        raise RuntimeError("network exploded")

    monkeypatch.setattr(yfinance_client.yf, "Ticker", raise_error)

    with pytest.raises(yfinance_client.InvalidCodeError):
        yfinance_client.get_quote("7203")


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


class FakeIntradayTicker:
    def __init__(self, frame):
        self._frame = frame

    def history(self, period, interval):
        return self._frame


class FakeNewsTicker:
    def __init__(self, items):
        self.news = items


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


def test_get_news_extracts_title_summary_time_url(monkeypatch):
    items = [
        {
            "content": {
                "title": "Toyota raises full-year forecast",
                "summary": "Toyota Motor raised its earnings outlook.",
                "pubDate": "2026-09-18T03:47:37Z",
                "canonicalUrl": {"url": "https://example.com/article-1"},
            }
        },
        {
            "content": {
                "title": "Sector Update: Auto stocks rise",
                "summary": "",
                "pubDate": "2026-09-17T08:38:43Z",
                "canonicalUrl": {"url": "https://example.com/article-2"},
            }
        },
    ]
    monkeypatch.setattr(yfinance_client.yf, "Ticker", lambda symbol: FakeNewsTicker(items))

    news = yfinance_client.get_news("7203")

    assert news == [
        {
            "title": "Toyota raises full-year forecast",
            "summary": "Toyota Motor raised its earnings outlook.",
            "published_at": "2026-09-18T03:47:37Z",
            "url": "https://example.com/article-1",
        },
        {
            "title": "Sector Update: Auto stocks rise",
            "summary": "",
            "published_at": "2026-09-17T08:38:43Z",
            "url": "https://example.com/article-2",
        },
    ]


def test_get_news_skips_items_without_title(monkeypatch):
    items = [
        {"content": {"title": "", "summary": "x", "pubDate": "2026-09-18T00:00:00Z", "canonicalUrl": {"url": "https://example.com/x"}}},
        {"content": {"title": "Valid headline", "summary": "y", "pubDate": "2026-09-17T00:00:00Z", "canonicalUrl": {"url": "https://example.com/y"}}},
    ]
    monkeypatch.setattr(yfinance_client.yf, "Ticker", lambda symbol: FakeNewsTicker(items))

    news = yfinance_client.get_news("7203")

    assert len(news) == 1
    assert news[0]["title"] == "Valid headline"


def test_get_news_returns_empty_list_when_no_news(monkeypatch):
    monkeypatch.setattr(yfinance_client.yf, "Ticker", lambda symbol: FakeNewsTicker([]))

    assert yfinance_client.get_news("7203") == []


def test_get_news_wraps_unexpected_exception(monkeypatch):
    class RaisingTicker:
        @property
        def news(self):
            raise RuntimeError("boom")

    monkeypatch.setattr(yfinance_client.yf, "Ticker", lambda symbol: RaisingTicker())

    with pytest.raises(yfinance_client.InvalidCodeError):
        yfinance_client.get_news("7203")


def _frame_with_nan_row(index):
    return pd.DataFrame(
        {
            "Open": [99.0, float("nan"), 100.0],
            "High": [101.0, float("nan"), 103.0],
            "Low": [98.0, float("nan"), 99.0],
            "Close": [100.0, float("nan"), 102.0],
            "Volume": [1000, float("nan"), float("nan")],
        },
        index=index,
    )


def test_get_price_history_drops_nan_price_rows_and_zeroes_nan_volume(monkeypatch):
    import json

    index = pd.to_datetime(["2026-08-24", "2026-08-25", "2026-08-26"])
    frame = _frame_with_nan_row(index)
    monkeypatch.setattr(yfinance_client.yf, "Ticker", lambda symbol: FakeHistoryTicker(frame))

    candles = yfinance_client.get_price_history("1301")

    assert [c["date"] for c in candles] == ["2026-08-24", "2026-08-26"]
    assert candles[1]["volume"] == 0
    json.dumps(candles, allow_nan=False)


def test_get_price_history_raises_when_all_rows_are_nan(monkeypatch):
    index = pd.to_datetime(["2026-08-24"])
    frame = pd.DataFrame(
        {
            "Open": [float("nan")],
            "High": [float("nan")],
            "Low": [float("nan")],
            "Close": [float("nan")],
            "Volume": [float("nan")],
        },
        index=index,
    )
    monkeypatch.setattr(yfinance_client.yf, "Ticker", lambda symbol: FakeHistoryTicker(frame))

    with pytest.raises(yfinance_client.InvalidCodeError):
        yfinance_client.get_price_history("1301")


def test_get_intraday_history_drops_nan_price_rows_and_zeroes_nan_volume(monkeypatch):
    import json

    index = pd.to_datetime(
        ["2026-09-18 09:00:00+09:00", "2026-09-18 09:05:00+09:00", "2026-09-18 09:10:00+09:00"]
    )
    frame = _frame_with_nan_row(index)
    monkeypatch.setattr(yfinance_client.yf, "Ticker", lambda symbol: FakeIntradayTicker(frame))

    candles = yfinance_client.get_intraday_history("1301")

    assert [c["datetime"] for c in candles] == [
        "2026-09-18T09:00:00+09:00",
        "2026-09-18T09:10:00+09:00",
    ]
    assert candles[1]["volume"] == 0
    json.dumps(candles, allow_nan=False)


def test_get_intraday_history_raises_when_all_rows_are_nan(monkeypatch):
    index = pd.to_datetime(["2026-09-18 09:00:00+09:00"])
    frame = pd.DataFrame(
        {
            "Open": [float("nan")],
            "High": [float("nan")],
            "Low": [float("nan")],
            "Close": [float("nan")],
            "Volume": [float("nan")],
        },
        index=index,
    )
    monkeypatch.setattr(yfinance_client.yf, "Ticker", lambda symbol: FakeIntradayTicker(frame))

    with pytest.raises(yfinance_client.InvalidCodeError):
        yfinance_client.get_intraday_history("1301")
