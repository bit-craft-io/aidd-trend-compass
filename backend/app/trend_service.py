import logging
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, defer

from . import models
from .clock import now_jst
from .history_service import build_history_detail
from .market_analysis_service import build_market_analysis_detail
from .news_service import summarize_and_analyze
from .perspective_service import build_perspectives
from . import trend_code_name_service, trend_direction, trend_price_service, trend_type_service
from .timeframe_service import resample_candles
from .yfinance_client import (
    InvalidCodeError,
    get_industry_label,
    get_intraday_history,
    get_news,
    get_price_history,
    get_quote,
)

logger = logging.getLogger(__name__)


def get_active_trend(db: Session, code: str) -> models.Trend | None:
    # `detail` holds per-code history/market-analysis JSON that can run into
    # the hundreds of KB; including it here makes MySQL sort the full row
    # (risking "Out of sort memory" on a default sort_buffer_size) just to
    # order by created_at, even for a single matching row. It's deferred
    # (loaded lazily on first `.detail` access, via a separate PK lookup
    # with no ORDER BY) so callers that do need it -- e.g. the detail-page
    # endpoint -- still get it, just via a second, filesort-free query.
    stmt = (
        select(models.Trend)
        .options(defer(models.Trend.detail))
        .where(models.Trend.code == code, models.Trend.deleted_at.is_(None))
        .order_by(models.Trend.created_at.desc())
    )
    return db.execute(stmt).scalars().first()


def list_active_trends(db: Session) -> list[models.Trend]:
    # See get_active_trend's comment: same reasoning, same fix.
    stmt = (
        select(models.Trend)
        .options(defer(models.Trend.detail))
        .where(models.Trend.deleted_at.is_(None))
        .order_by(models.Trend.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


def create_trend(db: Session, code: str) -> models.Trend:
    previous = get_active_trend(db, code)
    quote = get_quote(code)
    detail = _build_detail(code)
    trend = models.Trend(
        code=code,
        opinion=_build_opinion(previous, quote["price"]),
        detail=detail,
        type_daily_trend=trend_type_service.daily_trend_value(_daily_trend(detail)),
        price_at_fetch=quote["price"],
    )
    if previous is not None:
        previous.deleted_at = now_jst()
    db.add(trend)
    trend_code_name_service.fill_names(db, {code: quote["name"]})
    db.commit()
    db.refresh(trend)
    trend_price_service.restore_price_if_exists(db, code)
    price = trend_price_service.get_active_price(db, code)
    _attach_price_fields(trend, price)
    trend_type_service.attach_daily_trend_names(db, [trend])
    return _attach_name(trend, trend_code_name_service.get_names(db, [code]))


def _attach_name(trend: models.Trend, names: dict[str, str]) -> models.Trend:
    trend.name = names.get(trend.code, "")
    return trend


def _attach_price_fields(trend: models.Trend, price: models.TrendPrice | None) -> models.Trend:
    trend.trend_group_id = price.trend_group_id if price else None
    trend.buy_category = price.buy_category if price else 0
    trend.buy_price = float(price.buy_price) if price and price.buy_price is not None else None
    trend.buy_quantity = price.buy_quantity if price else None
    trend.sale_price_target = (
        float(price.sale_price_target) if price and price.sale_price_target is not None else None
    )
    return trend


def list_watchlist(db: Session) -> list[models.Trend]:
    trends = list_active_trends(db)
    prices_by_code = {p.code: p for p in trend_price_service.list_active_prices(db)}
    names = trend_code_name_service.get_names(db, [t.code for t in trends])
    for trend in trends:
        _attach_price_fields(trend, prices_by_code.get(trend.code))
        _attach_name(trend, names)
    trend_type_service.attach_daily_trend_names(db, trends)
    return trends


def update_name(db: Session, code: str, name: str) -> models.Trend | None:
    trend = get_active_trend(db, code)
    if trend is None:
        return None
    trend_code_name_service.set_name(db, code, name)
    db.commit()
    db.refresh(trend)
    price = trend_price_service.get_active_price(db, code)
    _attach_price_fields(trend, price)
    trend_type_service.attach_daily_trend_names(db, [trend])
    return _attach_name(trend, trend_code_name_service.get_names(db, [code]))


def _daily_trend(detail: dict | None) -> str | None:
    raw_candles = (detail or {}).get("raw_candles")
    if not raw_candles:
        return None
    try:
        return trend_direction.classify_candles(resample_candles(raw_candles, "1d"))
    except Exception:
        logger.warning("failed to classify the daily trend", exc_info=True)
        return None


def _build_detail(code: str, macro_cache: dict | None = None) -> dict:
    try:
        raw_candles = get_intraday_history(code)
    except Exception:
        logger.warning("failed to fetch intraday history for %s", code, exc_info=True)
        return {}

    if not raw_candles:
        return {}

    detail: dict = {"raw_candles": raw_candles}

    try:
        detail["sector_label"] = get_industry_label(code)
    except Exception:
        logger.warning("failed to fetch industry label for %s", code, exc_info=True)

    try:
        cache = {} if macro_cache is None else macro_cache
        detail["macro_candles"] = {
            "index": _cached_macro_fetch("^N225", cache),
            "us10y": _cached_macro_fetch("^TNX", cache),
            "usdjpy": _cached_macro_fetch("JPY=X", cache),
        }
    except Exception:
        logger.warning("failed to fetch macro series for %s", code, exc_info=True)

    try:
        raw_news = get_news(code)
        detail["news"] = summarize_and_analyze(code, raw_news)
    except Exception:
        logger.warning("failed to fetch/analyze news for %s", code, exc_info=True)

    return detail


def _cached_macro_fetch(ticker: str, cache: dict) -> list[dict]:
    if ticker not in cache:
        cache[ticker] = get_price_history(ticker)
    return cache[ticker]


def build_detail_view(stored_detail: dict, interval: str, indicators: list[str]) -> dict:
    raw_candles = stored_detail.get("raw_candles")
    if not raw_candles:
        return {}

    display_candles = resample_candles(raw_candles, interval)  # ValueError(不正interval)はここで呼び出し元まで伝播させる

    view: dict = {}
    try:
        view["history"] = build_history_detail(raw_candles, display_candles, indicators)
    except Exception:
        logger.warning("failed to build history view", exc_info=True)

    try:
        daily_candles = resample_candles(raw_candles, "1d")
        macro = stored_detail.get("macro_candles", {})
        view["market_analysis"] = build_market_analysis_detail(
            daily_candles,
            macro.get("index", []),
            macro.get("us10y", []),
            macro.get("usdjpy", []),
            stored_detail.get("sector_label", ""),
        )
    except Exception:
        logger.warning("failed to build market analysis view", exc_info=True)

    view["news"] = stored_detail.get("news", [])

    return view


def _build_opinion(previous: models.Trend | None, price: float) -> str:
    if previous is None:
        return "初回取得、履歴データ無し"

    prev_price = float(previous.price_at_fetch)
    diff = price - prev_price
    pct = (diff / prev_price * 100) if prev_price else 0.0
    sign = "+" if diff >= 0 else ""

    if diff > 0:
        trend_word = "上昇傾向"
    elif diff < 0:
        trend_word = "下落傾向"
    else:
        trend_word = "横ばい"

    return f"前回取得比{sign}{pct:.1f}%、{trend_word}の可能性"


INTERVAL_MINUTES = {1, 5, 10, 15}


def generate_perspectives_for(trend: models.Trend) -> dict[str, str] | None:
    raw_candles = (trend.detail or {}).get("raw_candles")
    if not raw_candles:
        return None
    daily_candles = resample_candles(raw_candles, "1d")
    return build_perspectives(
        trend.code, daily_candles, trend_direction.classify_candles(daily_candles)
    )


def get_or_create_perspectives(db: Session, trend: models.Trend) -> dict | None:
    if trend.perspectives:
        return trend.perspectives
    generated = generate_perspectives_for(trend)
    if generated is None:
        return None
    trend.perspectives = {**generated, "created_at": now_jst().isoformat()}
    db.commit()
    return trend.perspectives


def refresh_trends(db: Session, codes: list[str], interval_minutes: int) -> list[models.Trend]:
    if interval_minutes not in INTERVAL_MINUTES:
        raise ValueError(f"invalid interval: {interval_minutes}")

    threshold = now_jst() - timedelta(minutes=interval_minutes)
    updated = []
    macro_cache: dict = {}

    for code in codes:
        current = get_active_trend(db, code)
        if current is None or current.created_at > threshold:
            continue

        try:
            quote = get_quote(code)
        except InvalidCodeError:
            continue

        detail = _build_detail(code, macro_cache)
        stored_detail = detail or current.detail
        new_trend = models.Trend(
            code=code,
            opinion=_build_opinion(current, quote["price"]),
            detail=stored_detail,
            type_daily_trend=trend_type_service.daily_trend_value(_daily_trend(stored_detail)),
            price_at_fetch=quote["price"],
        )
        current.deleted_at = now_jst()
        price = trend_price_service.get_active_price(db, code)
        _attach_price_fields(new_trend, price)
        db.add(new_trend)
        trend_code_name_service.fill_names(db, {code: quote["name"]})
        updated.append(new_trend)

    db.commit()
    for trend in updated:
        db.refresh(trend)
    names = trend_code_name_service.get_names(db, [t.code for t in updated])
    for trend in updated:
        _attach_name(trend, names)
    trend_type_service.attach_daily_trend_names(db, updated)
    return updated


def delete_trend(db: Session, code: str) -> bool:
    trend = get_active_trend(db, code)
    if trend is None:
        return False
    trend.deleted_at = now_jst()
    db.commit()
    trend_price_service.soft_delete_price(db, code)
    return True
