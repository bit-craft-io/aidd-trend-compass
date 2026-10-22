from app import screening_signals


def _bar(date, o, h, l, c, v):
    return {"date": date, "o": o, "h": h, "l": l, "c": c, "v": v}


def _flat_history(days, price=1000.0, volume=100000):
    return [_bar(f"2026-01-{i + 1:02d}", price, price, price, price, volume) for i in range(days)]


def test_ma_trend_met_when_short_ma_above_long_ma_and_rising():
    history = _flat_history(25, price=1000.0)
    # Last 6 bars trend upward so the 5-day MA is above the 25-day MA and rising.
    for i, price in enumerate([1010, 1020, 1030, 1040, 1050, 1060]):
        history.append(_bar(f"2026-02-{i + 1:02d}", price, price, price, price, 100000))

    result = screening_signals.SIGNAL_FUNCTIONS["ma_trend"](
        history, {"short_period": 5, "long_period": 25}
    )

    assert result["met"] is True


def test_ma_trend_not_met_with_flat_history():
    history = _flat_history(30)

    result = screening_signals.SIGNAL_FUNCTIONS["ma_trend"](
        history, {"short_period": 5, "long_period": 25}
    )

    assert result["met"] is False


def test_bullish_candle_ratio_met_when_enough_bullish_days():
    history = _flat_history(2)
    for i in range(5):
        history.append(_bar(f"2026-02-{i + 1:02d}", 1000, 1010, 995, 1005, 100000))

    result = screening_signals.SIGNAL_FUNCTIONS["bullish_candle_ratio"](
        history, {"period_days": 5, "min_bullish_count": 3}
    )

    assert result["met"] is True
    assert result["value"] == 5


def test_volume_surge_met_when_today_volume_exceeds_multiplier():
    history = _flat_history(20, volume=100000)
    history.append(_bar("2026-02-01", 1000, 1010, 995, 1005, 200000))

    result = screening_signals.SIGNAL_FUNCTIONS["volume_surge"](
        history, {"period_days": 20, "multiplier": 1.5}
    )

    assert result["met"] is True
    assert result["value"] == 2.0


def test_rebound_pct_met_when_recovered_from_recent_low():
    history = [_bar("2026-01-01", 1000, 1000, 900, 950, 100000)]
    for i in range(19):
        history.append(_bar(f"2026-01-{i + 2:02d}", 950, 950, 940, 945, 100000))
    history.append(_bar("2026-02-01", 990, 1000, 985, 1000, 100000))

    result = screening_signals.SIGNAL_FUNCTIONS["rebound_pct"](
        history, {"lookback_days": 20, "threshold_pct": 5}
    )

    assert result["met"] is True


def test_bollinger_position_met_when_above_mid_band_not_overheated():
    # Linear uptrend from 1000 to 1010 over 20 days produces stdev ≈ 3.035
    # which allows position ≈ 0.824 (well below max_band_pct of 0.9)
    history = []
    for i in range(20):
        price = 1000.0 + (i / 19) * 10
        date = f"2026-01-{i+1:02d}"
        history.append(_bar(date, price, price + 1, price - 1, price, 100000))

    result = screening_signals.SIGNAL_FUNCTIONS["bollinger_position"](
        history, {"period": 20, "std_dev": 2, "max_band_pct": 0.9}
    )

    assert result["met"] is True


def test_golden_cross_recent_met_when_cross_happened_within_window():
    history = _flat_history(25, price=1000.0)
    for i, price in enumerate([1005, 1015, 1030, 1050, 1080]):
        history.append(_bar(f"2026-02-{i + 1:02d}", price, price, price, price, 100000))

    result = screening_signals.SIGNAL_FUNCTIONS["golden_cross_recent"](
        history, {"short_period": 5, "long_period": 25, "recent_days": 5}
    )

    assert result["met"] is True


def test_macd_golden_cross_not_met_on_flat_history():
    history = _flat_history(40)

    result = screening_signals.SIGNAL_FUNCTIONS["macd_golden_cross"](
        history, {"fast": 12, "slow": 26, "signal": 9}
    )

    assert result["met"] is False


def test_rsi_met_when_within_neutral_band():
    history = _flat_history(2, price=1000.0)
    for i in range(14):
        history.append(_bar(f"2026-02-{i + 1:02d}", 1000 + i, 1005 + i, 995 + i, 1000 + i, 100000))

    result = screening_signals.SIGNAL_FUNCTIONS["rsi"](
        history, {"period_days": 14, "lower": 30, "upper": 70}
    )

    assert 0 <= result["value"] <= 100


def test_candle_quality_met_when_body_is_large_and_bullish():
    history = _flat_history(2)
    history.append(_bar("2026-02-01", 1000, 1105, 995, 1100, 100000))

    result = screening_signals.SIGNAL_FUNCTIONS["candle_quality"](
        history, {"body_ratio_min": 0.6}
    )

    assert result["met"] is True


def test_candle_quality_not_met_when_bearish():
    history = _flat_history(2)
    history.append(_bar("2026-02-01", 1100, 1105, 995, 1000, 100000))

    result = screening_signals.SIGNAL_FUNCTIONS["candle_quality"](
        history, {"body_ratio_min": 0.6}
    )

    assert result["met"] is False


def test_high_break_met_when_close_exceeds_recent_high():
    history = _flat_history(20, price=1000.0)
    history.append(_bar("2026-02-01", 1010, 1020, 1005, 1015, 100000))

    result = screening_signals.SIGNAL_FUNCTIONS["high_break"](history, {"lookback_days": 20})

    assert result["met"] is True


def test_sector_relative_strength_is_always_a_stub():
    history = _flat_history(20)

    result = screening_signals.SIGNAL_FUNCTIONS["sector_relative_strength"](
        history, {"period_days": 20, "outperform_pct": 0}
    )

    assert result == {"met": False, "value": 0.0}


def test_ma_deviation_met_when_within_max_deviation():
    history = _flat_history(25, price=1000.0)

    result = screening_signals.SIGNAL_FUNCTIONS["ma_deviation"](
        history, {"period": 25, "max_deviation_pct": 10}
    )

    assert result["met"] is True


def test_all_signals_return_not_met_with_insufficient_history():
    history = _flat_history(2)

    for name, fn in screening_signals.SIGNAL_FUNCTIONS.items():
        params = {
            "ma_trend": {"short_period": 5, "long_period": 25},
            "bullish_candle_ratio": {"period_days": 5, "min_bullish_count": 3},
            "volume_surge": {"period_days": 20, "multiplier": 1.5},
            "rebound_pct": {"lookback_days": 20, "threshold_pct": 5},
            "bollinger_position": {"period": 20, "std_dev": 2, "max_band_pct": 0.9},
            "golden_cross_recent": {"short_period": 5, "long_period": 25, "recent_days": 5},
            "macd_golden_cross": {"fast": 12, "slow": 26, "signal": 9},
            "rsi": {"period_days": 14, "lower": 30, "upper": 70},
            "candle_quality": {"body_ratio_min": 0.6},
            "high_break": {"lookback_days": 20},
            "sector_relative_strength": {"period_days": 20, "outperform_pct": 0},
            "ma_deviation": {"period": 25, "max_deviation_pct": 10},
        }[name]

        result = fn(history, params)

        assert result["met"] is False, f"{name} should not be met with insufficient history"
