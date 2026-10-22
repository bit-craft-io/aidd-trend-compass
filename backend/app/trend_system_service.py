from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models


def get_value(db: Session, key: str) -> str | None:
    stmt = select(models.TrendSystem).where(
        models.TrendSystem.key == key, models.TrendSystem.deleted_at.is_(None)
    )
    row = db.execute(stmt).scalars().first()
    return row.value if row else None


def set_value(db: Session, key: str, value: str) -> models.TrendSystem:
    stmt = select(models.TrendSystem).where(models.TrendSystem.key == key)
    row = db.execute(stmt).scalars().first()
    if row is None:
        row = models.TrendSystem(key=key, value=value)
        db.add(row)
    else:
        row.value = value
        row.deleted_at = None
    db.commit()
    db.refresh(row)
    return row
