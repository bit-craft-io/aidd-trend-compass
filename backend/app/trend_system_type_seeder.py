"""trend_system_type の初期データを入れるシーダー。

開発・stage・運用で、同じやり方。全行を TRUNCATE して、初期データを、まとめて入れる。
どの環境でも、マスタの内容と id が、同じになる。
"""

from sqlalchemy import delete, insert, text
from sqlalchemy.orm import Session

from . import models

DAILY_TREND_COLUMN = "type_daily_trend"

# (type_column, type_name, type_value)
SEED_ROWS = [
    (DAILY_TREND_COLUMN, "none", 0),
    (DAILY_TREND_COLUMN, "up", 1),
    (DAILY_TREND_COLUMN, "down", 2),
    (DAILY_TREND_COLUMN, "flat", 3),
]


def reset(db: Session) -> int:
    """全行を TRUNCATE して、初期データを、まとめて入れる。入れた行数を返す。"""
    table = models.TrendSystemType.__tablename__
    if db.get_bind().dialect.name == "mysql":
        db.execute(text(f"TRUNCATE TABLE {table}"))  # id の採番も、1に戻る
    else:
        db.execute(delete(models.TrendSystemType))  # SQLite(テスト)。空になるので、id は1から
    db.execute(
        insert(models.TrendSystemType),
        [
            {"type_column": column, "type_name": name, "type_value": value}
            for column, name, value in SEED_ROWS
        ],
    )
    db.commit()
    return len(SEED_ROWS)
