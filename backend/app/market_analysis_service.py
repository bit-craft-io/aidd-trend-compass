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
