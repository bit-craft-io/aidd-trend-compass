import os
import time

import requests

JQUANTS_API_KEY = os.environ.get("JQUANTS_API_KEY", "")
JQUANTS_BASE_URL = os.environ.get("JQUANTS_BASE_URL", "https://api.jquants.com/v2")
JQUANTS_RATE_LIMIT_PER_64S = int(os.environ.get("JQUANTS_RATE_LIMIT_PER_64S", "5"))
JQUANTS_MAX_STOCKS = int(os.environ.get("JQUANTS_MAX_STOCKS", "10"))

_RATE_WINDOW_SECONDS = 64


class JQuantsError(Exception):
    pass


def _headers() -> dict:
    return {"x-api-key": JQUANTS_API_KEY}


def pace_requests() -> None:
    """Sleeps long enough to stay within JQUANTS_RATE_LIMIT_PER_64S requests
    per 64-second window. Call once per outgoing request."""
    if JQUANTS_RATE_LIMIT_PER_64S <= 0:
        return
    time.sleep(_RATE_WINDOW_SECONDS / JQUANTS_RATE_LIMIT_PER_64S)


_REQUEST_TIMEOUT_SECONDS = 30


def _get_json(path: str, label: str, params: dict | None = None) -> dict:
    """GET and decode one page. Never puts headers or the API key in errors."""
    kwargs = {"headers": _headers(), "timeout": _REQUEST_TIMEOUT_SECONDS}
    if params is not None:
        kwargs["params"] = params
    try:
        response = requests.get(f"{JQUANTS_BASE_URL}{path}", **kwargs)
    except requests.RequestException as exc:
        raise JQuantsError(f"failed to fetch {label}: {type(exc).__name__}") from exc
    if response.status_code != 200:
        raise JQuantsError(f"failed to fetch {label}: {response.status_code}")
    try:
        body = response.json()
        body.get("data")
    except (ValueError, AttributeError) as exc:
        raise JQuantsError(f"invalid response for {label}: {type(exc).__name__}") from exc
    return body


def _to_four_digit_code(code: str) -> str | None:
    """5-digit codes are the 4-digit code plus a trailing '0' for ordinary
    stocks; other share classes (5 digits not ending in '0') return None."""
    if len(code) == 5:
        return code[:4] if code.endswith("0") else None
    return code


def list_prime_stocks() -> list[dict]:
    body = _get_json("/equities/master", "listed stocks")
    try:
        stocks = []
        for row in body.get("data") or []:
            if row.get("MktNm") != "プライム":
                continue
            code = _to_four_digit_code(row["Code"])
            if code is None:
                continue
            stocks.append({"code": code, "name": row["CoName"]})
    except (KeyError, TypeError, ValueError, AttributeError) as exc:
        raise JQuantsError(f"malformed listed stock row: {type(exc).__name__}") from exc
    return stocks[:JQUANTS_MAX_STOCKS]


def get_daily_bars(code: str, days: int = 90) -> list[dict]:
    # `days` = number of most recent bars kept; no from/to is sent because the
    # Free plan's data is delayed ~12 weeks (the endpoint has no `days` param).
    rows: list[dict] = []
    params = {"code": code}
    while True:
        body = _get_json("/equities/bars/daily", f"daily bars for {code}", params=params)
        rows.extend(body.get("data") or [])
        pagination_key = body.get("pagination_key")
        if not pagination_key:
            break
        params = {"code": code, "pagination_key": pagination_key}

    try:
        converted = [
            {
                "date": row["Date"],
                "o": float(row["O"]),
                "h": float(row["H"]),
                "l": float(row["L"]),
                "c": float(row["C"]),
                "v": int(row["Vo"]),
            }
            for row in rows
        ]
    except (KeyError, TypeError, ValueError) as exc:
        raise JQuantsError(f"malformed daily bar row for {code}: {type(exc).__name__}") from exc
    return converted[-days:]
