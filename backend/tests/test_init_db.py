from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import init_db, models


def test_main_creates_the_tables_and_resets_the_master(monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(init_db, "engine", engine)
    monkeypatch.setattr(init_db, "SessionLocal", factory)

    init_db.main()
    with factory() as db:
        db.query(models.TrendSystemType).filter_by(type_value=1).update({"type_name": "UP"})
        db.commit()
    init_db.main()

    with factory() as db:
        rows = db.execute(
            select(models.TrendSystemType.id, models.TrendSystemType.type_name).order_by(models.TrendSystemType.id)
        ).all()
    assert [tuple(row) for row in rows] == [(1, "none"), (2, "up"), (3, "down"), (4, "flat")]
