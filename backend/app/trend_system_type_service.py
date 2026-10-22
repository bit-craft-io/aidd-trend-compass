from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from . import models


def join_condition(type_column: str, value_column):
    """マスタを、type_column の種類として、数値の列(value_column)に結ぶ JOIN 条件。
    削除済みの行は、結ばない。"""
    return and_(
        models.TrendSystemType.type_column == type_column,
        models.TrendSystemType.type_value == value_column,
        models.TrendSystemType.deleted_at.is_(None),
    )


def attach_names(
    db: Session,
    rows: list,
    *,
    model,
    value_column,
    type_column: str,
    target_attr: str,
    default: str,
) -> None:
    """model の行と、マスタを LEFT JOIN で引き(1回の問い合わせ)、名称(type_name)を、
    各行の target_attr に付ける。一致する行が無いときは default。
    選ぶのは、行の id と type_name だけ(重い列は読まない)。"""
    ids = [row.id for row in rows if row.id is not None]
    names: dict[int, str] = {}
    if ids:
        stmt = (
            select(model.id, models.TrendSystemType.type_name)
            .select_from(model)
            .outerjoin(models.TrendSystemType, join_condition(type_column, value_column))
            .where(model.id.in_(ids))
        )
        names = {row.id: row.type_name for row in db.execute(stmt)}
    for row in rows:
        setattr(row, target_attr, names.get(row.id) or default)


def names_by_value(db: Session, type_column: str) -> dict[int, str]:
    """type_column の種類の、数値(type_value)から名称(type_name)への対応を、1回の問い合わせで返す。
    削除済みの行は、含めない。行の列に保存していない値(発掘の結果など)に、名称を付けるときに使う。"""
    stmt = select(models.TrendSystemType.type_value, models.TrendSystemType.type_name).where(
        models.TrendSystemType.type_column == type_column,
        models.TrendSystemType.deleted_at.is_(None),
    )
    return {row.type_value: row.type_name for row in db.execute(stmt)}
