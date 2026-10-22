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
