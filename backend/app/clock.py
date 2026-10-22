from datetime import datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))


def now_jst() -> datetime:
    # DBのDATETIME列はタイムゾーン情報を持たないため、JSTの壁時計時刻をnaiveで返す。
    return datetime.now(JST).replace(tzinfo=None)
