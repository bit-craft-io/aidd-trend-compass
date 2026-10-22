import pytest

from app import indicator_service


def _candles(closes):
    return [{"time": f"2026-09-{i+1:02d}", "close": c} for i, c in enumerate(closes)]


def test_compute_sma5_matches_manual_rolling_average():
    closes = [100.0, 102.0, 104.0, 108.0, 110.0, 112.0]
    candles = _candles(closes)

    result = indicator_service.compute_sma5(candles)

    assert result[-1]["value"] == pytest.approx(107.2, abs=0.05)
    assert result[-1]["time"] == "2026-09-06"


def test_compute_sma5_produces_value_for_every_candle_even_below_window():
    closes = [100.0, 102.0, 104.0]
    candles = _candles(closes)

    result = indicator_service.compute_sma5(candles)

    assert len(result) == 3
    assert result[0]["value"] == 100.0
    assert result[0]["time"] == "2026-09-01"


def test_compute_rsi_returns_empty_list_for_insufficient_data():
    closes = [100.0, 102.0, 104.0]
    candles = _candles(closes)

    result = indicator_service.compute_rsi(candles)

    assert result == []


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
    last_macd = result["macd"][-1]["value"]
    last_signal = result["signal"][-1]["value"]
    last_histogram = result["histogram"][-1]["value"]
    assert last_histogram == pytest.approx(last_macd - last_signal, abs=0.05)


def test_compute_bollinger_middle_band_close_to_sma():
    closes = [100.0 + (i % 3) for i in range(30)]
    candles = _candles(closes)

    result = indicator_service.compute_bollinger(candles)

    assert set(result.keys()) == {"upper", "middle", "lower"}
    last_upper = result["upper"][-1]["value"]
    last_middle = result["middle"][-1]["value"]
    last_lower = result["lower"][-1]["value"]
    assert last_lower < last_middle < last_upper
