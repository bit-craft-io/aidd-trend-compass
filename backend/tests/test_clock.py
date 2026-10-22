from datetime import datetime, timedelta

from sqlalchemy import update

from app import clock, models, trend_candidate_service, trend_system_service


def _assert_is_jst_now(value: datetime):
    expected = datetime.utcnow() + timedelta(hours=9)
    assert value.tzinfo is None
    assert abs(value - expected) < timedelta(seconds=5)


def test_now_jst_is_naive_and_nine_hours_ahead_of_utc():
    _assert_is_jst_now(clock.now_jst())


def test_new_row_created_at_and_updated_at_are_jst(db_session):
    group = models.TrendGroup(name="成長株")
    db_session.add(group)
    db_session.commit()
    db_session.refresh(group)

    _assert_is_jst_now(group.created_at)
    _assert_is_jst_now(group.updated_at)


def test_updated_at_is_jst_after_update(db_session):
    group = models.TrendGroup(name="成長株")
    db_session.add(group)
    db_session.commit()
    stale = update(models.TrendGroup).where(models.TrendGroup.id == group.id)
    db_session.execute(stale.values(updated_at=datetime(2000, 1, 1)))
    db_session.execute(stale.values(name="配当株"))
    db_session.commit()
    db_session.refresh(group)

    _assert_is_jst_now(group.updated_at)


def test_scan_start_stamp_is_jst(db_session):
    trend_candidate_service.mark_scan_started(db_session)

    stamp = trend_system_service.get_value(db_session, trend_candidate_service.LAST_RUN_KEY)
    _assert_is_jst_now(datetime.fromisoformat(stamp))
