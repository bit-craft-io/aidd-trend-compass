import numpy as np

if not hasattr(np, "NaN"):
    np.NaN = np.nan  # pandas-ta(numpy>=2.0未対応)向けの互換シム

import pandas as pd
import pandas_ta as ta


def compute_sma5(candles: list[dict]) -> list[dict]:
    closes = pd.Series([c["close"] for c in candles])
    # min_periods=1で、ウィンドウ(5)未満の先頭部分は拡大窓平均を返す
    # (ta.sma(length=5)は厳密5点未満でNoneを返すため使わない)
    sma = closes.rolling(window=5, min_periods=1).mean()
    return [
        {"time": c["time"], "value": round(float(v), 1)}
        for c, v in zip(candles, sma)
        if pd.notna(v)
    ]


def compute_rsi(candles: list[dict]) -> list[dict]:
    closes = pd.Series([c["close"] for c in candles])
    rsi = ta.rsi(closes, length=14)
    if rsi is None:
        return []
    return [
        {"time": c["time"], "value": round(float(v), 1)}
        for c, v in zip(candles, rsi)
        if pd.notna(v)
    ]


def compute_macd(candles: list[dict]) -> dict:
    closes = pd.Series([c["close"] for c in candles])
    macd_df = ta.macd(closes, fast=12, slow=26, signal=9)
    if macd_df is None:
        return {"macd": [], "signal": [], "histogram": []}

    macd_col = next(c for c in macd_df.columns if c.startswith("MACD_"))
    hist_col = next(c for c in macd_df.columns if c.startswith("MACDh_"))
    signal_col = next(c for c in macd_df.columns if c.startswith("MACDs_"))

    macd_line = [
        {"time": c["time"], "value": round(float(v), 2)}
        for c, v in zip(candles, macd_df[macd_col])
        if pd.notna(v)
    ]
    signal_line = [
        {"time": c["time"], "value": round(float(v), 2)}
        for c, v in zip(candles, macd_df[signal_col])
        if pd.notna(v)
    ]
    histogram = [
        {"time": c["time"], "value": round(float(v), 2)}
        for c, v in zip(candles, macd_df[hist_col])
        if pd.notna(v)
    ]
    return {"macd": macd_line, "signal": signal_line, "histogram": histogram}


def compute_bollinger(candles: list[dict]) -> dict:
    closes = pd.Series([c["close"] for c in candles])
    bb_df = ta.bbands(closes, length=20, std=2)
    if bb_df is None:
        return {"upper": [], "middle": [], "lower": []}

    lower_col = next(c for c in bb_df.columns if c.startswith("BBL_"))
    mid_col = next(c for c in bb_df.columns if c.startswith("BBM_"))
    upper_col = next(c for c in bb_df.columns if c.startswith("BBU_"))
    return {
        "upper": [
            {"time": c["time"], "value": round(float(v), 1)}
            for c, v in zip(candles, bb_df[upper_col])
            if pd.notna(v)
        ],
        "middle": [
            {"time": c["time"], "value": round(float(v), 1)}
            for c, v in zip(candles, bb_df[mid_col])
            if pd.notna(v)
        ],
        "lower": [
            {"time": c["time"], "value": round(float(v), 1)}
            for c, v in zip(candles, bb_df[lower_col])
            if pd.notna(v)
        ],
    }
