import logging
import math
from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from . import jquants_client, models, trend_code_name_service, trend_system_service
from .clock import now_jst

logger = logging.getLogger(__name__)

LAST_RUN_KEY = "screening_last_run_at"
_COOLDOWN = timedelta(hours=24)


def _last_run_at(db: Session) -> datetime | None:
    value = trend_system_service.get_value(db, LAST_RUN_KEY)
    if value is None:
        return None
    return datetime.fromisoformat(value)


def is_cooldown_active(db: Session) -> bool:
    last_run = _last_run_at(db)
    if last_run is None:
        return False
    return now_jst() - last_run < _COOLDOWN


def remaining_cooldown_seconds(db: Session) -> int:
    last_run = _last_run_at(db)
    if last_run is None:
        return 0
    remaining = _COOLDOWN - (now_jst() - last_run)
    return max(math.ceil(remaining.total_seconds()), 0)


def list_active_candidates(db: Session) -> list[models.TrendCandidate]:
    stmt = select(models.TrendCandidate).where(models.TrendCandidate.deleted_at.is_(None))
    return list(db.execute(stmt).scalars().all())


def mark_scan_started(db: Session) -> None:
    trend_system_service.set_value(db, LAST_RUN_KEY, now_jst().isoformat())


def last_run_at_iso(db: Session) -> str | None:
    return trend_system_service.get_value(db, LAST_RUN_KEY)


def run_scan(db: Session) -> int:
    mark_scan_started(db)

    stocks = jquants_client.list_prime_stocks()
    saved_rows = []
    saved_names: dict[str, str] = {}
    for stock in stocks:
        jquants_client.pace_requests()
        try:
            bars = jquants_client.get_daily_bars(stock["code"])
        except jquants_client.JQuantsError:
            logger.warning("failed to fetch daily bars for %s", stock["code"], exc_info=True)
            continue
        saved_rows.append(models.TrendCandidate(code=stock["code"], detail={"history": bars}))
        saved_names[stock["code"]] = stock["name"]

    if stocks and not saved_rows:
        logger.error(
            "screening scan fetched no daily bars for any of %d stocks; keeping existing data",
            len(stocks),
        )
        return 0

    db.execute(delete(models.TrendCandidate))
    db.execute(delete(models.TrendCandidateResult))
    for row in saved_rows:
        db.add(row)
    trend_code_name_service.fill_names(db, saved_names)
    db.commit()
    return len(saved_rows)
