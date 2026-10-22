from sqlalchemy import select

from app import models, trend_system_type_service
from app.clock import now_jst


def _trend(db, code, value):
    trend = models.Trend(
        code=code, opinion="x", detail={}, price_at_fetch=100.0, type_daily_trend=value
    )
    db.add(trend)
    db.commit()
    db.refresh(trend)
    return trend


def _attach(db, trends, type_column="type_daily_trend"):
    trend_system_type_service.attach_names(
        db,
        trends,
        model=models.Trend,
        value_column=models.Trend.type_daily_trend,
        type_column=type_column,
        target_attr="label",
        default="unknown",
    )


def test_attach_names_sets_the_name_from_the_master(db_session):
    trends = [_trend(db_session, "1001", 1), _trend(db_session, "1002", 3)]

    _attach(db_session, trends)

    assert [t.label for t in trends] == ["up", "flat"]


def test_attach_names_uses_the_default_when_there_is_no_row(db_session):
    trend = _trend(db_session, "1001", 9)

    _attach(db_session, [trend])

    assert trend.label == "unknown"


def test_attach_names_only_uses_the_rows_of_the_given_type_column(db_session):
    db_session.add(models.TrendSystemType(type_column="type_other", type_name="other-up", type_value=1))
    db_session.commit()
    trend = _trend(db_session, "1001", 1)

    _attach(db_session, [trend], type_column="type_other")

    assert trend.label == "other-up"


def test_attach_names_ignores_a_soft_deleted_row(db_session):
    db_session.query(models.TrendSystemType).filter_by(type_value=1).update({"deleted_at": now_jst()})
    db_session.commit()
    trend = _trend(db_session, "1001", 1)

    _attach(db_session, [trend])

    assert trend.label == "unknown"


def test_attach_names_accepts_an_empty_list(db_session):
    _attach(db_session, [])


def test_join_condition_selects_the_row_of_a_type_column_and_value(db_session):
    stmt = select(models.TrendSystemType.type_name).where(
        trend_system_type_service.join_condition("type_daily_trend", 2)
    )

    assert db_session.execute(stmt).scalars().all() == ["down"]


def test_names_by_value_returns_the_value_to_name_map_of_one_column(db_session):
    names = trend_system_type_service.names_by_value(db_session, "type_daily_trend")

    assert names == {0: "none", 1: "up", 2: "down", 3: "flat"}


def test_names_by_value_is_empty_for_an_unknown_column(db_session):
    assert trend_system_type_service.names_by_value(db_session, "type_unknown") == {}


def test_names_by_value_skips_deleted_rows(db_session):
    db_session.query(models.TrendSystemType).filter_by(type_value=1).update({"deleted_at": now_jst()})
    db_session.commit()

    names = trend_system_type_service.names_by_value(db_session, "type_daily_trend")

    assert 1 not in names
