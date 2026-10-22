from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .clock import now_jst


def get_price_row(db: Session, code: str) -> models.TrendPrice | None:
    stmt = select(models.TrendPrice).where(models.TrendPrice.code == code)
    return db.execute(stmt).scalars().first()


def get_active_price(db: Session, code: str) -> models.TrendPrice | None:
    stmt = select(models.TrendPrice).where(
        models.TrendPrice.code == code, models.TrendPrice.deleted_at.is_(None)
    )
    return db.execute(stmt).scalars().first()


def list_active_prices(db: Session) -> list[models.TrendPrice]:
    stmt = select(models.TrendPrice).where(models.TrendPrice.deleted_at.is_(None))
    return list(db.execute(stmt).scalars().all())


def upsert_price(
    db: Session,
    code: str,
    *,
    trend_group_id: int | None,
    buy_category: int,
    buy_price: float | None,
    buy_quantity: int | None,
    sale_price_target: float | None = None,
) -> models.TrendPrice:
    price = get_price_row(db, code)
    if price is None:
        price = models.TrendPrice(code=code)
        db.add(price)
    price.trend_group_id = trend_group_id
    price.buy_category = buy_category
    price.buy_price = buy_price
    price.buy_quantity = buy_quantity
    price.sale_price_target = sale_price_target
    price.deleted_at = None
    db.commit()
    db.refresh(price)
    return price


def soft_delete_price(db: Session, code: str) -> None:
    price = get_price_row(db, code)
    if price is None or price.deleted_at is not None:
        return
    price.deleted_at = now_jst()
    db.commit()


def restore_price_if_exists(db: Session, code: str) -> None:
    price = get_price_row(db, code)
    if price is None or price.deleted_at is None:
        return
    price.deleted_at = None
    db.commit()
