from app import trend_system_service


def test_get_value_returns_none_when_missing(db_session):
    assert trend_system_service.get_value(db_session, "screening_last_run_at") is None


def test_set_value_then_get_value_round_trip(db_session):
    trend_system_service.set_value(db_session, "screening_last_run_at", "2026-09-28T10:00:00")

    assert trend_system_service.get_value(db_session, "screening_last_run_at") == "2026-09-28T10:00:00"


def test_set_value_updates_existing_key_without_creating_new_row(db_session):
    trend_system_service.set_value(db_session, "screening_last_run_at", "2026-09-28T10:00:00")
    trend_system_service.set_value(db_session, "screening_last_run_at", "2026-09-29T10:00:00")

    from app import models
    from sqlalchemy import select

    rows = db_session.execute(
        select(models.TrendSystem).where(models.TrendSystem.key == "screening_last_run_at")
    ).scalars().all()

    assert len(rows) == 1
    assert rows[0].value == "2026-09-29T10:00:00"
