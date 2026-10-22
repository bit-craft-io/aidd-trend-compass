import copy

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .clock import now_jst

DEFAULT_SIGNAL_PARAMS = {
    "ma_trend": {"enabled": False, "short_period": 5, "long_period": 25},
    "bullish_candle_ratio": {"enabled": False, "period_days": 5, "min_bullish_count": 3},
    "volume_surge": {"enabled": False, "period_days": 20, "multiplier": 1.5},
    "rebound_pct": {"enabled": False, "lookback_days": 20, "threshold_pct": 5},
    "bollinger_position": {"enabled": False, "period": 20, "std_dev": 2, "max_band_pct": 0.9},
    "golden_cross_recent": {
        "enabled": False, "short_period": 5, "long_period": 25, "recent_days": 5
    },
    "macd_golden_cross": {"enabled": False, "fast": 12, "slow": 26, "signal": 9},
    "rsi": {"enabled": False, "period_days": 14, "lower": 30, "upper": 70},
    "candle_quality": {"enabled": False, "body_ratio_min": 0.6},
    "high_break": {"enabled": False, "lookback_days": 20},
    "sector_relative_strength": {"enabled": False, "period_days": 20, "outperform_pct": 0},
    "ma_deviation": {"enabled": False, "period": 25, "max_deviation_pct": 10},
}


def _enabled_set(condition_json: dict) -> frozenset[str]:
    return frozenset(key for key, params in condition_json.items() if params.get("enabled"))


def create_condition(db: Session, enabled_signals: list[str]) -> models.TrendCandidateCondition:
    condition_json = copy.deepcopy(DEFAULT_SIGNAL_PARAMS)
    for key in enabled_signals:
        if key in condition_json:
            condition_json[key]["enabled"] = True

    name = now_jst().strftime("%Y-%m-%d_%H%M")
    condition = models.TrendCandidateCondition(name=name, condition=condition_json)
    db.add(condition)
    db.commit()
    db.refresh(condition)
    return condition


def get_or_create_condition(
    db: Session, enabled_signals: list[str]
) -> models.TrendCandidateCondition:
    # 有効シグナルの集合が同じ検索は同一の条件として扱う(順序は無関係)。
    # 既存の有効な条件があれば、id・名前(改名済みの可能性)ごと再利用する。
    requested = frozenset(key for key in enabled_signals if key in DEFAULT_SIGNAL_PARAMS)
    for existing in list_conditions(db):
        if _enabled_set(existing.condition) == requested:
            return existing
    return create_condition(db, enabled_signals)


def list_conditions(db: Session) -> list[models.TrendCandidateCondition]:
    stmt = (
        select(models.TrendCandidateCondition)
        .where(models.TrendCandidateCondition.deleted_at.is_(None))
        .order_by(models.TrendCandidateCondition.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


def get_active_condition(
    db: Session, condition_id: int
) -> models.TrendCandidateCondition | None:
    stmt = select(models.TrendCandidateCondition).where(
        models.TrendCandidateCondition.id == condition_id,
        models.TrendCandidateCondition.deleted_at.is_(None),
    )
    return db.execute(stmt).scalars().first()


def rename_condition(
    db: Session, condition_id: int, name: str
) -> models.TrendCandidateCondition | None:
    stmt = select(models.TrendCandidateCondition).where(
        models.TrendCandidateCondition.id == condition_id,
        models.TrendCandidateCondition.deleted_at.is_(None),
    )
    condition = db.execute(stmt).scalars().first()
    if condition is None:
        return None
    condition.name = name
    db.commit()
    db.refresh(condition)
    return condition


def soft_delete_condition(db: Session, condition_id: int) -> bool:
    stmt = select(models.TrendCandidateCondition).where(
        models.TrendCandidateCondition.id == condition_id,
        models.TrendCandidateCondition.deleted_at.is_(None),
    )
    condition = db.execute(stmt).scalars().first()
    if condition is None:
        return False
    condition.deleted_at = now_jst()
    db.commit()
    return True
