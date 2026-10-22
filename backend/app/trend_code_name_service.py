from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from . import models


def fill_names(db: Session, names: dict[str, str]) -> None:
    candidates = {code: name.strip() for code, name in names.items() if name and name.strip()}
    if not candidates:
        return

    existing = {
        row.code: row
        for row in db.execute(
            select(models.TrendCodeName).where(
                models.TrendCodeName.code.in_(list(candidates))
            )
        ).scalars()
    }

    new_rows = []
    for code, name in candidates.items():
        row = existing.get(code)
        if row is None:
            new_rows.append({"code": code, "name": name})
            continue
        if row.deleted_at is not None:
            row.deleted_at = None
        if row.name is None:
            row.name = name

    if new_rows:
        db.execute(insert(models.TrendCodeName), new_rows)
    db.flush()


def set_name(db: Session, code: str, name: str) -> models.TrendCodeName:
    value = name.strip() or None
    row = db.execute(
        select(models.TrendCodeName).where(models.TrendCodeName.code == code)
    ).scalars().first()
    if row is None:
        row = models.TrendCodeName(code=code, name=value)
        db.add(row)
    else:
        row.name = value
        row.deleted_at = None
    db.flush()
    return row


def get_names(db: Session, codes: list[str]) -> dict[str, str]:
    if not codes:
        return {}
    rows = db.execute(
        select(models.TrendCodeName).where(
            models.TrendCodeName.code.in_(codes),
            models.TrendCodeName.deleted_at.is_(None),
            models.TrendCodeName.name.is_not(None),
        )
    ).scalars()
    return {row.code: row.name for row in rows}
