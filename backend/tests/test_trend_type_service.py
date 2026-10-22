from app import models, trend_type_service
from app.clock import now_jst


def _trend(db, code, value):
    trend = models.Trend(
        code=code, opinion="x", detail={}, price_at_fetch=100.0, type_daily_trend=value
    )
    db.add(trend)
    db.commit()
    db.refresh(trend)
    return trend


def test_daily_trend_value_maps_every_direction():
    assert trend_type_service.daily_trend_value("none") == 0
    assert trend_type_service.daily_trend_value("up") == 1
    assert trend_type_service.daily_trend_value("down") == 2
    assert trend_type_service.daily_trend_value("flat") == 3


def test_daily_trend_value_is_zero_without_a_judgement_or_for_an_unknown_name():
    assert trend_type_service.daily_trend_value(None) == 0
    assert trend_type_service.daily_trend_value("sideways") == 0


def test_attach_names_joins_the_master(db_session):
    trends = [_trend(db_session, "1001", 0), _trend(db_session, "1002", 1),
              _trend(db_session, "1003", 2), _trend(db_session, "1004", 3)]

    trend_type_service.attach_daily_trend_names(db_session, trends)

    assert [t.type_daily_trend_name for t in trends] == ["none", "up", "down", "flat"]


def test_attach_names_follows_the_name_in_the_master(db_session):
    db_session.query(models.TrendSystemType).filter_by(type_value=1).update({"type_name": "rise"})
    db_session.commit()
    trend = _trend(db_session, "1001", 1)

    trend_type_service.attach_daily_trend_names(db_session, [trend])

    assert trend.type_daily_trend_name == "rise"


def test_attach_names_uses_none_when_the_master_has_no_row(db_session):
    trend = _trend(db_session, "1001", 9)

    trend_type_service.attach_daily_trend_names(db_session, [trend])

    assert trend.type_daily_trend_name == "none"


def test_attach_names_uses_none_when_the_master_is_empty(db_session):
    db_session.query(models.TrendSystemType).delete()
    db_session.commit()
    trend = _trend(db_session, "1001", 1)

    trend_type_service.attach_daily_trend_names(db_session, [trend])

    assert trend.type_daily_trend_name == "none"


def test_attach_names_ignores_a_soft_deleted_master_row(db_session):
    db_session.query(models.TrendSystemType).filter_by(type_value=1).update({"deleted_at": now_jst()})
    db_session.commit()
    trend = _trend(db_session, "1001", 1)

    trend_type_service.attach_daily_trend_names(db_session, [trend])

    assert trend.type_daily_trend_name == "none"


def test_attach_names_accepts_an_empty_list(db_session):
    trend_type_service.attach_daily_trend_names(db_session, [])


def test_daily_trend_name_uses_the_master_name_and_falls_back_to_none(db_session):
    names = trend_type_service.daily_trend_names(db_session)

    assert trend_type_service.daily_trend_name(names, "up") == "up"
    assert trend_type_service.daily_trend_name(names, "down") == "down"
    assert trend_type_service.daily_trend_name(names, "flat") == "flat"
    assert trend_type_service.daily_trend_name(names, None) == "none"
    assert trend_type_service.daily_trend_name({}, "up") == "none"
