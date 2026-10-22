from sqlalchemy import select

from app import models, trend_system_type_seeder
from app.clock import now_jst

EXPECTED = [
    (1, "type_daily_trend", "none", 0),
    (2, "type_daily_trend", "up", 1),
    (3, "type_daily_trend", "down", 2),
    (4, "type_daily_trend", "flat", 3),
]


def _rows(db):
    stmt = select(models.TrendSystemType).order_by(models.TrendSystemType.id)
    return [(r.id, r.type_column, r.type_name, r.type_value) for r in db.execute(stmt).scalars().all()]


def test_reset_inserts_the_four_daily_trend_types_into_an_empty_table(db_session):
    db_session.query(models.TrendSystemType).delete()
    db_session.commit()

    inserted = trend_system_type_seeder.reset(db_session)

    assert inserted == 4
    assert _rows(db_session) == EXPECTED


def test_reset_fills_the_timestamp_columns(db_session):
    trend_system_type_seeder.reset(db_session)

    row = db_session.query(models.TrendSystemType).first()
    assert row.created_at is not None
    assert row.updated_at is not None
    assert row.deleted_at is None


def test_reset_deletes_every_row_and_restores_the_initial_data(db_session):
    db_session.add(models.TrendSystemType(type_column="type_other", type_name="x", type_value=1))
    db_session.query(models.TrendSystemType).filter_by(type_value=1, type_column="type_daily_trend").update(
        {"type_name": "UP"}
    )
    db_session.commit()

    trend_system_type_seeder.reset(db_session)

    assert _rows(db_session) == EXPECTED


def test_reset_gives_the_same_ids_every_time(db_session):
    trend_system_type_seeder.reset(db_session)
    first = _rows(db_session)
    trend_system_type_seeder.reset(db_session)

    assert _rows(db_session) == first == EXPECTED


def test_reset_clears_a_soft_deleted_row_too(db_session):
    db_session.query(models.TrendSystemType).filter_by(type_value=1).update({"deleted_at": now_jst()})
    db_session.commit()

    trend_system_type_seeder.reset(db_session)

    assert db_session.query(models.TrendSystemType).filter(models.TrendSystemType.deleted_at.is_not(None)).count() == 0
