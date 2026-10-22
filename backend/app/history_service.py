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
