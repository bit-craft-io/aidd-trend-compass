import pandas as pd

INTERVAL_TO_PANDAS_RULE = {
    "5m": "5min",
    "10m": "10min",
    "15m": "15min",
    "1d": "1D",
    "1wk": "1W",
    "1mo": "1ME",
}


def resample_candles(raw_candles: list[dict], interval: str) -> list[dict]:
    if not raw_candles:
        return []
    if interval not in INTERVAL_TO_PANDAS_RULE:
        raise ValueError(f"unsupported interval: {interval}")

    df = pd.DataFrame(raw_candles)
    df["datetime"] = pd.to_datetime(df["datetime"])
    df = df.set_index("datetime")

    rule = INTERVAL_TO_PANDAS_RULE[interval]
    agg = df.resample(rule).agg(
        {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}
    )
    agg = agg.dropna(subset=["open"])

    is_intraday = interval in ("5m", "10m", "15m")
    candles = []
    for dt, row in agg.iterrows():
        if is_intraday:
            # lightweight-charts renders UTCTimestamp as UTC wall-clock time and
            # has no timezone awareness. dt is tz-aware (e.g. +09:00), so a plain
            # dt.timestamp() yields the true UTC epoch, which shifts the bar by
            # the JST offset on the chart. Instead, treat the local wall-clock
            # time as if it were UTC by adding back the UTC offset.
            offset = dt.utcoffset()
            offset_seconds = offset.total_seconds() if offset is not None else 0
            time_value = int(dt.timestamp() + offset_seconds)
        else:
            time_value = dt.strftime("%Y-%m-%d")
        candles.append(
            {
                "time": time_value,
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": int(row["volume"]),
            }
        )
    return candles
