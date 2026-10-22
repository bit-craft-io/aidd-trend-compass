from datetime import datetime, timezone

import pytest
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


def test_resample_candles_5m_time_is_local_wallclock_as_utc_epoch():
    # RAW_5M's first bar is 2026-09-18T09:00:00+09:00 (JST). lightweight-charts
    # has no timezone awareness and renders UTCTimestamp as UTC wall-clock time,
    # so the emitted epoch must reproduce "2026-09-18 09:00:00" when interpreted
    # as UTC, not the true UTC instant (which would be "2026-09-18 00:00:00").
    result = timeframe_service.resample_candles(RAW_5M, "5m")

    expected = int(datetime(2026, 9, 18, 9, 0, 0, tzinfo=timezone.utc).timestamp())
    assert result[0]["time"] == expected


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
