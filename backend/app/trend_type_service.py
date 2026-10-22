from sqlalchemy.orm import Session

from . import models, trend_system_type_service
from .trend_system_type_seeder import DAILY_TREND_COLUMN, SEED_ROWS

NONE_NAME = "none"
NONE_VALUE = 0

_VALUE_BY_NAME = {
    name: value for column, name, value in SEED_ROWS if column == DAILY_TREND_COLUMN
}


def daily_trend_value(direction: str | None) -> int:
    """判定結果(up / down / flat / None)を、type_daily_trend の数値にする。
    判定なし(None)と、想定外の名前は、0(none)。"""
    if direction is None:
        return NONE_VALUE
    return _VALUE_BY_NAME.get(direction, NONE_VALUE)


def attach_daily_trend_names(db: Session, trends: list[models.Trend]) -> None:
    """各 trend に、type_daily_trend_name(none / up / down / flat など)を付ける。
    汎用の共通部品を、トレンドの列で呼ぶ。一致する行が無いときは none。"""
    trend_system_type_service.attach_names(
        db,
        trends,
        model=models.Trend,
        value_column=models.Trend.type_daily_trend,
        type_column=DAILY_TREND_COLUMN,
        target_attr="type_daily_trend_name",
        default=NONE_NAME,
    )


def daily_trend_names(db: Session) -> dict[int, str]:
    """type_daily_trend の、数値から名称への対応。マスタが空なら、空の辞書。"""
    return trend_system_type_service.names_by_value(db, DAILY_TREND_COLUMN)


def daily_trend_name(names: dict[int, str], direction: str | None) -> str:
    """判定結果(up / down / flat / None)を、マスタの名称にする。マスタに行が無いときは none。"""
    return names.get(daily_trend_value(direction), NONE_NAME)
