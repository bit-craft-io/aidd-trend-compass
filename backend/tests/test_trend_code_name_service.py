from sqlalchemy import event, select

from app import models, trend_code_name_service


def _row(db, code):
    return db.execute(
        select(models.TrendCodeName).where(models.TrendCodeName.code == code)
    ).scalars().first()


def test_fill_names_inserts_new_codes(db_session):
    trend_code_name_service.fill_names(db_session, {"7203": "トヨタ自動車", "6758": "ソニーグループ"})
    db_session.commit()

    assert _row(db_session, "7203").name == "トヨタ自動車"
    assert _row(db_session, "6758").name == "ソニーグループ"


def test_fill_names_fills_row_whose_name_is_null(db_session):
    db_session.add(models.TrendCodeName(code="7203", name=None))
    db_session.commit()

    trend_code_name_service.fill_names(db_session, {"7203": "トヨタ自動車"})
    db_session.commit()

    assert _row(db_session, "7203").name == "トヨタ自動車"


def test_fill_names_never_overwrites_existing_name(db_session):
    db_session.add(models.TrendCodeName(code="7203", name="手入力のトヨタ"))
    db_session.commit()

    trend_code_name_service.fill_names(db_session, {"7203": "Toyota Motor Corp"})
    db_session.commit()

    assert _row(db_session, "7203").name == "手入力のトヨタ"


def test_fill_names_resurrects_soft_deleted_row_and_fills_null_name(db_session):
    from app.clock import now_jst

    db_session.add(models.TrendCodeName(code="7203", name=None, deleted_at=now_jst()))
    db_session.commit()

    trend_code_name_service.fill_names(db_session, {"7203": "トヨタ自動車"})
    db_session.commit()

    row = _row(db_session, "7203")
    assert row.deleted_at is None
    assert row.name == "トヨタ自動車"
    assert db_session.execute(select(models.TrendCodeName)).scalars().all() == [row]


def test_fill_names_resurrects_soft_deleted_row_but_keeps_existing_name(db_session):
    from app.clock import now_jst

    db_session.add(models.TrendCodeName(code="7203", name="残す名前", deleted_at=now_jst()))
    db_session.commit()

    trend_code_name_service.fill_names(db_session, {"7203": "上書きしない"})
    db_session.commit()

    row = _row(db_session, "7203")
    assert row.deleted_at is None
    assert row.name == "残す名前"


def test_fill_names_ignores_empty_and_blank_names(db_session):
    trend_code_name_service.fill_names(db_session, {"7203": "", "6758": "   "})
    db_session.commit()

    assert _row(db_session, "7203") is None
    assert _row(db_session, "6758") is None


def test_fill_names_with_empty_input_issues_no_statement(db_session):
    statements = []
    event.listen(
        db_session.get_bind(), "before_cursor_execute",
        lambda conn, cursor, statement, params, context, executemany: statements.append(statement),
    )

    trend_code_name_service.fill_names(db_session, {})

    assert statements == []


def _count_statements(db, fn):
    statements = []

    def listener(conn, cursor, statement, params, context, executemany):
        statements.append(statement)

    engine = db.get_bind()
    event.listen(engine, "before_cursor_execute", listener)
    try:
        fn()
    finally:
        event.remove(engine, "before_cursor_execute", listener)
    return len(statements)


def test_fill_names_statement_count_is_constant_regardless_of_number_of_names(db_session):
    one = _count_statements(
        db_session,
        lambda: trend_code_name_service.fill_names(db_session, {"1000": "銘柄1"}),
    )
    many = _count_statements(
        db_session,
        lambda: trend_code_name_service.fill_names(
            db_session, {str(2000 + i): f"銘柄{i}" for i in range(500)}
        ),
    )

    assert one == many


def test_set_name_creates_row(db_session):
    trend_code_name_service.set_name(db_session, "7203", "トヨタ")
    db_session.commit()

    assert _row(db_session, "7203").name == "トヨタ"


def test_set_name_overwrites_existing_name(db_session):
    db_session.add(models.TrendCodeName(code="7203", name="Toyota Motor Corp"))
    db_session.commit()

    trend_code_name_service.set_name(db_session, "7203", "トヨタ")
    db_session.commit()

    assert _row(db_session, "7203").name == "トヨタ"


def test_set_name_strips_whitespace(db_session):
    trend_code_name_service.set_name(db_session, "7203", "  トヨタ  ")
    db_session.commit()

    assert _row(db_session, "7203").name == "トヨタ"


def test_set_name_with_blank_resets_name_to_null(db_session):
    db_session.add(models.TrendCodeName(code="7203", name="トヨタ"))
    db_session.commit()

    trend_code_name_service.set_name(db_session, "7203", "   ")
    db_session.commit()

    assert _row(db_session, "7203").name is None


def test_set_name_resurrects_soft_deleted_row(db_session):
    from app.clock import now_jst

    db_session.add(models.TrendCodeName(code="7203", name="古い", deleted_at=now_jst()))
    db_session.commit()

    trend_code_name_service.set_name(db_session, "7203", "トヨタ")
    db_session.commit()

    row = _row(db_session, "7203")
    assert row.deleted_at is None
    assert row.name == "トヨタ"


def test_get_names_returns_only_active_rows_with_a_name(db_session):
    from app.clock import now_jst

    db_session.add_all(
        [
            models.TrendCodeName(code="7203", name="トヨタ"),
            models.TrendCodeName(code="6758", name=None),
            models.TrendCodeName(code="9984", name="削除済み", deleted_at=now_jst()),
        ]
    )
    db_session.commit()

    names = trend_code_name_service.get_names(db_session, ["7203", "6758", "9984", "1111"])

    assert names == {"7203": "トヨタ"}


def test_get_names_with_empty_codes_issues_no_statement(db_session):
    count = _count_statements(
        db_session, lambda: trend_code_name_service.get_names(db_session, [])
    )

    assert count == 0
