from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .clock import now_jst


def create_group(db: Session, name: str) -> models.TrendGroup:
    group = models.TrendGroup(name=name)
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


def list_active_groups(db: Session) -> list[models.TrendGroup]:
    stmt = (
        select(models.TrendGroup)
        .where(models.TrendGroup.deleted_at.is_(None))
        .order_by(models.TrendGroup.created_at)
    )
    return list(db.execute(stmt).scalars().all())


def soft_delete_group(db: Session, group_id: int) -> bool:
    stmt = select(models.TrendGroup).where(
        models.TrendGroup.id == group_id, models.TrendGroup.deleted_at.is_(None)
    )
    group = db.execute(stmt).scalars().first()
    if group is None:
        return False
    group.deleted_at = now_jst()
    db.commit()
    return True
