import math

import yfinance as yf


class InvalidCodeError(Exception):
    pass


def get_quote(code: str) -> dict:
    symbol = _to_yf_symbol(code)
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
    except Exception as exc:
        raise InvalidCodeError(code) from exc
    price = info.get("currentPrice") or info.get("regularMarketPrice")
    name = info.get("longName") or info.get("shortName")
    if price is None or name is None:
        raise InvalidCodeError(code)
    return {"name": name, "price": float(price)}


def _build_candle(row) -> dict | None:
    # NaN/infはJSONに書けない(MySQLのJSON列が拒否する)ため、価格が有限でない足は捨てる。
    prices = [float(row[key]) for key in ("Open", "High", "Low", "Close")]
    if not all(math.isfinite(p) for p in prices):
        return None
    volume = float(row["Volume"])
    return {
        "open": prices[0],
        "high": prices[1],
        "low": prices[2],
        "close": prices[3],
        "volume": int(volume) if math.isfinite(volume) else 0,
    }


def get_price_history(code: str, days: int = 90) -> list[dict]:
    symbol = _to_yf_symbol(code)
    try:
        ticker = yf.Ticker(symbol)
        history = ticker.history(period="6mo")
    except Exception as exc:
        raise InvalidCodeError(code) from exc

    if history.empty:
        raise InvalidCodeError(code)

    history = history.tail(days)
    candles = []
    for date, row in history.iterrows():
        candle = _build_candle(row)
        if candle is None:
            continue
        candles.append({"date": date.strftime("%Y-%m-%d"), **candle})
    if not candles:
        raise InvalidCodeError(code)
    return candles


def get_intraday_history(code: str, interval: str = "5m", period: str = "60d") -> list[dict]:
    symbol = _to_yf_symbol(code)
    try:
        ticker = yf.Ticker(symbol)
        history = ticker.history(period=period, interval=interval)
    except Exception as exc:
        raise InvalidCodeError(code) from exc

    if history.empty:
        raise InvalidCodeError(code)

    candles = []
    for dt, row in history.iterrows():
        candle = _build_candle(row)
        if candle is None:
            continue
        candles.append({"datetime": dt.isoformat(), **candle})
    if not candles:
        raise InvalidCodeError(code)
    return candles


def get_industry_label(code: str) -> str:
    symbol = _to_yf_symbol(code)
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
    except Exception as exc:
        raise InvalidCodeError(code) from exc

    label = info.get("industry") or info.get("sector")
    if label is None:
        raise InvalidCodeError(code)
    return label


def get_news(code: str) -> list[dict]:
    symbol = _to_yf_symbol(code)
    try:
        ticker = yf.Ticker(symbol)
        items = ticker.news
    except Exception as exc:
        raise InvalidCodeError(code) from exc

    news = []
    for item in items:
        content = item.get("content", {})
        title = content.get("title")
        if not title:
            continue
        news.append(
            {
                "title": title,
                "summary": content.get("summary") or "",
                "published_at": content.get("pubDate") or "",
                "url": (content.get("canonicalUrl") or {}).get("url") or "",
            }
        )
    return news


def _to_yf_symbol(code: str) -> str:
    return f"{code}.T" if code.isdigit() else code
