from datetime import datetime

import pytest
from sqlalchemy.exc import IntegrityError

from app.clock import now_jst
from app import models


def test_trend_has_no_name_or_nick_name_columns(db_session):
    trend = models.Trend(
        code="7203",
        opinion="初回取得、履歴データ無し",
        detail={},
        price_at_fetch=2900.0,
    )
    db_session.add(trend)
    db_session.commit()
    db_session.refresh(trend)

    assert not hasattr(models.Trend, "name")
    assert not hasattr(models.Trend, "nick_name")


def test_trend_group_soft_delete_round_trip(db_session):
    group = models.TrendGroup(name="成長株")
    db_session.add(group)
    db_session.commit()
    db_session.refresh(group)
    assert group.deleted_at is None

    group.deleted_at = now_jst()
    db_session.commit()
    db_session.refresh(group)
    assert group.deleted_at is not None


def test_trend_price_defaults(db_session):
    price = models.TrendPrice(code="7203")
    db_session.add(price)
    db_session.commit()
    db_session.refresh(price)

    assert price.trend_group_id is None
    assert price.buy_category == 0
    assert price.buy_price is None
    assert price.buy_quantity is None
    assert price.sale_price_target is None
    assert price.deleted_at is None


def test_trend_price_code_is_unique(db_session):
    db_session.add(models.TrendPrice(code="7203"))
    db_session.commit()

    db_session.add(models.TrendPrice(code="7203"))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_trend_candidate_defaults(db_session):
    candidate = models.TrendCandidate(code="7203", detail={"history": []})
    db_session.add(candidate)
    db_session.commit()
    db_session.refresh(candidate)

    assert candidate.deleted_at is None
    assert candidate.detail == {"history": []}


def test_trend_candidate_condition_defaults(db_session):
    condition = models.TrendCandidateCondition(
        name="2026-09-29_1432", condition={"volume_surge": {"enabled": True}}
    )
    db_session.add(condition)
    db_session.commit()
    db_session.refresh(condition)

    assert condition.name == "2026-09-29_1432"
    assert condition.deleted_at is None


def test_trend_candidate_result_defaults(db_session):
    condition = models.TrendCandidateCondition(name="2026-09-29_1432", condition={})
    db_session.add(condition)
    db_session.commit()
    db_session.refresh(condition)

    result = models.TrendCandidateResult(condition_id=condition.id, code="7203")
    db_session.add(result)
    db_session.commit()
    db_session.refresh(result)

    assert result.condition_id == condition.id
    assert result.code == "7203"
    assert result.deleted_at is None


def test_trend_system_key_is_unique(db_session):
    db_session.add(models.TrendSystem(key="screening_last_run_at", value="2026-09-28T10:00:00"))
    db_session.commit()

    db_session.add(models.TrendSystem(key="screening_last_run_at", value="x"))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_trend_code_name_defaults(db_session):
    row = models.TrendCodeName(code="7203")
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)

    assert row.name is None
    assert row.deleted_at is None
    assert row.created_at is not None
    assert row.updated_at is not None


def test_trend_code_name_code_is_unique(db_session):
    db_session.add(models.TrendCodeName(code="7203", name="トヨタ自動車"))
    db_session.commit()

    db_session.add(models.TrendCodeName(code="7203", name="重複"))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_trend_type_daily_trend_defaults_to_zero(db_session):
    trend = models.Trend(code="7203", opinion="x", detail={}, price_at_fetch=1.0)
    db_session.add(trend)
    db_session.commit()
    db_session.refresh(trend)

    assert trend.type_daily_trend == 0


def test_trend_system_type_column_and_value_are_unique(db_session):
    db_session.add(models.TrendSystemType(type_column="type_daily_trend", type_name="dup", type_value=1))

    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_trend_system_type_has_the_timestamp_columns(db_session):
    row = db_session.query(models.TrendSystemType).first()

    assert row.created_at is not None
    assert row.updated_at is not None
    assert row.deleted_at is None
