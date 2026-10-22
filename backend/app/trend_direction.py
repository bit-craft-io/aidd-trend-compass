import os

UP = "up"
DOWN = "down"
FLAT = "flat"


def settings() -> tuple[int, int, float]:
    try:
        short_period = int(os.environ.get("TREND_SHORT_PERIOD", "5"))
        long_period = int(os.environ.get("TREND_LONG_PERIOD", "25"))
        flat_band_pct = float(os.environ.get("TREND_FLAT_BAND_PCT", "1.0"))
    except ValueError as exc:
        raise ValueError(f"トレンド判定の設定が数値でない: {exc}") from exc
    if short_period < 1 or long_period <= short_period:
        raise ValueError(
            f"TREND_SHORT_PERIOD({short_period})は1以上、"
            f"TREND_LONG_PERIOD({long_period})はそれより大きくする"
        )
    if flat_band_pct < 0:
        raise ValueError(f"TREND_FLAT_BAND_PCT({flat_band_pct})は0以上にする")
    return short_period, long_period, flat_band_pct


def classify_trend(
    closes: list[float],
    short_period: int | None = None,
    long_period: int | None = None,
    flat_band_pct: float | None = None,
) -> str | None:
    default_short, default_long, default_band = settings()
    short_period = default_short if short_period is None else short_period
    long_period = default_long if long_period is None else long_period
    flat_band_pct = default_band if flat_band_pct is None else flat_band_pct

    if len(closes) < long_period + 1:
        return None

    short_now = sum(closes[-short_period:]) / short_period
    short_prev = sum(closes[-short_period - 1 : -1]) / short_period
    long_now = sum(closes[-long_period:]) / long_period
    if long_now == 0:
        return None

    gap_pct = (short_now - long_now) / long_now * 100
    if abs(gap_pct) <= flat_band_pct:
        return FLAT
    if short_now > long_now and short_now > short_prev:
        return UP
    if short_now < long_now and short_now < short_prev:
        return DOWN
    return FLAT


def classify_candles(candles: list[dict]) -> str | None:
    return classify_trend([c["close"] for c in candles])


def classify_history(history: list[dict]) -> str | None:
    return classify_trend([bar["c"] for bar in history])
