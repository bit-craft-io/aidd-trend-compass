from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from . import (
    models,
    screening_signals,
    trend_candidate_service,
    trend_code_name_service,
    trend_direction,
    trend_type_service,
)


def run_search(db: Session, condition: models.TrendCandidateCondition) -> list[str]:
    enabled_signals = [
        key for key, params in condition.condition.items() if params.get("enabled")
    ]

    matched_codes = []
    for candidate in trend_candidate_service.list_active_candidates(db):
        history = candidate.detail.get("history", [])
        all_met = True
        for signal_key in enabled_signals:
            params = condition.condition[signal_key]
            fn = screening_signals.SIGNAL_FUNCTIONS[signal_key]
            if not fn(history, params)["met"]:
                all_met = False
                break
        if all_met:
            matched_codes.append(candidate.code)

    db.execute(
        delete(models.TrendCandidateResult).where(
            models.TrendCandidateResult.condition_id == condition.id
        )
    )
    for code in matched_codes:
        db.add(models.TrendCandidateResult(condition_id=condition.id, code=code))
    db.commit()
    return matched_codes


def get_cached_results(db: Session, condition_id: int) -> list[dict]:
    condition = db.execute(
        select(models.TrendCandidateCondition).where(
            models.TrendCandidateCondition.id == condition_id
        )
    ).scalars().first()
    enabled_signals = []
    if condition is not None:
        enabled_signals = [
            key for key, params in condition.condition.items() if params.get("enabled")
        ]

    result_rows = db.execute(
        select(models.TrendCandidateResult)
        .where(
            models.TrendCandidateResult.condition_id == condition_id,
            models.TrendCandidateResult.deleted_at.is_(None),
        )
        .order_by(models.TrendCandidateResult.id)
    ).scalars().all()
    codes = [r.code for r in result_rows]

    candidates_by_code = {
        c.code: c
        for c in db.execute(
            select(models.TrendCandidate).where(models.TrendCandidate.code.in_(codes))
        ).scalars().all()
    }
    names = trend_code_name_service.get_names(db, codes)
    trend_names = trend_type_service.daily_trend_names(db)

    items = []
    for code in codes:
        candidate = candidates_by_code.get(code)
        if candidate is None:
            continue
        history = candidate.detail.get("history", [])
        price = history[-1]["c"] if history else None
        trend = trend_direction.classify_history(history)
        # ma_trend は閾値が無く、絞り込みが「上昇」と見た銘柄でも、判定は「横ばい」になり得る。
        # 食い違う情報を出さないため、その場合は、判定なし(none)にする。画面は、none の銘柄を除く。
        if "ma_trend" in enabled_signals and trend != trend_direction.UP:
            trend = None
        items.append(
            {
                "code": code,
                "name": names.get(code, ""),
                "price": price,
                "matched_signals": enabled_signals,
                "type_daily_trend": trend_type_service.daily_trend_name(trend_names, trend),
            }
        )

    return items
