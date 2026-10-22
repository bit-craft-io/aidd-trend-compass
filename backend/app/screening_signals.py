def _closes(history: list[dict]) -> list[float]:
    return [bar["c"] for bar in history]


def _sma(values: list[float], period: int) -> float | None:
    if len(values) < period:
        return None
    return sum(values[-period:]) / period


def ma_trend(history: list[dict], params: dict) -> dict:
    short_period = params["short_period"]
    long_period = params["long_period"]
    closes = _closes(history)
    if len(closes) < long_period + 1:
        return {"met": False, "value": 0.0}

    short_now = _sma(closes, short_period)
    long_now = _sma(closes, long_period)
    short_prev = _sma(closes[:-1], short_period)
    if short_now is None or long_now is None or short_prev is None:
        return {"met": False, "value": 0.0}

    met = short_now > long_now and short_now > short_prev
    return {"met": met, "value": short_now - long_now}


def bullish_candle_ratio(history: list[dict], params: dict) -> dict:
    period_days = params["period_days"]
    min_bullish_count = params["min_bullish_count"]
    if len(history) < period_days:
        return {"met": False, "value": 0.0}

    recent = history[-period_days:]
    bullish_count = sum(1 for bar in recent if bar["c"] > bar["o"])
    return {"met": bullish_count >= min_bullish_count, "value": float(bullish_count)}


def volume_surge(history: list[dict], params: dict) -> dict:
    period_days = params["period_days"]
    multiplier = params["multiplier"]
    if len(history) < period_days + 1:
        return {"met": False, "value": 0.0}

    baseline = history[-(period_days + 1):-1]
    avg_volume = sum(bar["v"] for bar in baseline) / period_days
    if avg_volume == 0:
        return {"met": False, "value": 0.0}

    today_volume = history[-1]["v"]
    ratio = today_volume / avg_volume
    return {"met": ratio >= multiplier, "value": ratio}


def rebound_pct(history: list[dict], params: dict) -> dict:
    lookback_days = params["lookback_days"]
    threshold_pct = params["threshold_pct"]
    if len(history) < lookback_days + 1:
        return {"met": False, "value": 0.0}

    window = history[-(lookback_days + 1):]
    lowest = min(bar["l"] for bar in window)
    if lowest == 0:
        return {"met": False, "value": 0.0}

    latest_close = history[-1]["c"]
    rebound = (latest_close - lowest) / lowest * 100
    return {"met": rebound >= threshold_pct, "value": rebound}


def bollinger_position(history: list[dict], params: dict) -> dict:
    period = params["period"]
    std_dev = params["std_dev"]
    max_band_pct = params["max_band_pct"]
    closes = _closes(history)
    if len(closes) < period:
        return {"met": False, "value": 0.0}

    window = closes[-period:]
    mean = sum(window) / period
    variance = sum((x - mean) ** 2 for x in window) / period
    stdev = variance**0.5
    upper = mean + std_dev * stdev
    latest_close = closes[-1]

    if latest_close <= mean or upper == mean:
        return {"met": False, "value": 0.0}

    position = (latest_close - mean) / (upper - mean)
    return {"met": position < max_band_pct, "value": position}


def golden_cross_recent(history: list[dict], params: dict) -> dict:
    short_period = params["short_period"]
    long_period = params["long_period"]
    recent_days = params["recent_days"]
    closes = _closes(history)
    if len(closes) < long_period + recent_days:
        return {"met": False, "value": -1.0}

    for offset in range(recent_days):
        end = len(closes) - offset
        short_now = _sma(closes[:end], short_period)
        long_now = _sma(closes[:end], long_period)
        short_prev = _sma(closes[: end - 1], short_period)
        long_prev = _sma(closes[: end - 1], long_period)
        if None in (short_now, long_now, short_prev, long_prev):
            continue
        if short_prev <= long_prev and short_now > long_now:
            return {"met": True, "value": float(offset)}

    return {"met": False, "value": -1.0}


def _ema_series(values: list[float], period: int) -> list[float]:
    if len(values) < period:
        return []
    multiplier = 2 / (period + 1)
    ema = [sum(values[:period]) / period]
    for value in values[period:]:
        ema.append((value - ema[-1]) * multiplier + ema[-1])
    return ema


def macd_golden_cross(history: list[dict], params: dict) -> dict:
    fast = params["fast"]
    slow = params["slow"]
    signal_period = params["signal"]
    closes = _closes(history)
    if len(closes) < slow + signal_period + 2:
        return {"met": False, "value": 0.0}

    fast_ema = _ema_series(closes, fast)
    slow_ema = _ema_series(closes, slow)
    offset = len(fast_ema) - len(slow_ema)
    macd_line = [f - s for f, s in zip(fast_ema[offset:], slow_ema)]
    signal_line = _ema_series(macd_line, signal_period)
    if len(signal_line) < 2:
        return {"met": False, "value": 0.0}

    macd_aligned = macd_line[-len(signal_line):]
    met = macd_aligned[-2] <= signal_line[-2] and macd_aligned[-1] > signal_line[-1]
    return {"met": met, "value": macd_aligned[-1] - signal_line[-1]}


def rsi(history: list[dict], params: dict) -> dict:
    period_days = params["period_days"]
    lower = params["lower"]
    upper = params["upper"]
    closes = _closes(history)
    if len(closes) < period_days + 1:
        return {"met": False, "value": 0.0}

    window = closes[-(period_days + 1):]
    gains = [max(window[i] - window[i - 1], 0) for i in range(1, len(window))]
    losses = [max(window[i - 1] - window[i], 0) for i in range(1, len(window))]
    avg_gain = sum(gains) / period_days
    avg_loss = sum(losses) / period_days

    if avg_loss == 0:
        value = 100.0
    else:
        rs = avg_gain / avg_loss
        value = 100 - (100 / (1 + rs))

    return {"met": lower < value < upper, "value": value}


def candle_quality(history: list[dict], params: dict) -> dict:
    body_ratio_min = params["body_ratio_min"]
    if not history:
        return {"met": False, "value": 0.0}

    bar = history[-1]
    candle_range = bar["h"] - bar["l"]
    if candle_range <= 0:
        return {"met": False, "value": 0.0}

    body = abs(bar["c"] - bar["o"])
    ratio = body / candle_range
    met = ratio >= body_ratio_min and bar["c"] > bar["o"]
    return {"met": met, "value": ratio}


def high_break(history: list[dict], params: dict) -> dict:
    lookback_days = params["lookback_days"]
    if len(history) < lookback_days + 1:
        return {"met": False, "value": 0.0}

    window = history[-(lookback_days + 1):-1]
    recent_high = max(bar["h"] for bar in window)
    if recent_high == 0:
        return {"met": False, "value": 0.0}

    latest_close = history[-1]["c"]
    met = latest_close > recent_high
    return {"met": met, "value": (latest_close - recent_high) / recent_high * 100}


def sector_relative_strength(history: list[dict], params: dict) -> dict:
    # Sector-average index data is not wired up in this scope (no data
    # source decided yet -- see spec's 対象外 section). Always returns
    # not-met rather than inventing a fake comparison.
    return {"met": False, "value": 0.0}


def ma_deviation(history: list[dict], params: dict) -> dict:
    period = params["period"]
    max_deviation_pct = params["max_deviation_pct"]
    closes = _closes(history)
    if len(closes) < period:
        return {"met": False, "value": 0.0}

    mean = _sma(closes, period)
    if mean is None or mean == 0:
        return {"met": False, "value": 0.0}

    deviation_pct = (closes[-1] - mean) / mean * 100
    return {"met": abs(deviation_pct) <= max_deviation_pct, "value": deviation_pct}


SIGNAL_FUNCTIONS = {
    "ma_trend": ma_trend,
    "bullish_candle_ratio": bullish_candle_ratio,
    "volume_surge": volume_surge,
    "rebound_pct": rebound_pct,
    "bollinger_position": bollinger_position,
    "golden_cross_recent": golden_cross_recent,
    "macd_golden_cross": macd_golden_cross,
    "rsi": rsi,
    "candle_quality": candle_quality,
    "high_break": high_break,
    "sector_relative_strength": sector_relative_strength,
    "ma_deviation": ma_deviation,
}
