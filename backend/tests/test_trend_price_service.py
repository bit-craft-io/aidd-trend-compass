from app import trend_price_service


def test_upsert_price_creates_row_when_missing(db_session):
    price = trend_price_service.upsert_price(
        db_session,
        "7203",
        trend_group_id=None,
        buy_category=1,
        buy_price=2900.0,
        buy_quantity=100,
    )

    assert price.code == "7203"
    assert price.buy_category == 1
    assert float(price.buy_price) == 2900.0
    assert price.buy_quantity == 100


def test_upsert_price_updates_existing_row_without_creating_new_one(db_session):
    trend_price_service.upsert_price(
        db_session, "7203", trend_group_id=None, buy_category=1, buy_price=2900.0, buy_quantity=100
    )

    updated = trend_price_service.upsert_price(
        db_session, "7203", trend_group_id=None, buy_category=2, buy_price=3000.0, buy_quantity=50
    )

    all_rows = trend_price_service.list_active_prices(db_session)
    assert len(all_rows) == 1
    assert updated.buy_category == 2
    assert updated.buy_quantity == 50


def test_soft_delete_price_then_restore_reuses_same_row(db_session):
    created = trend_price_service.upsert_price(
        db_session, "7203", trend_group_id=None, buy_category=1, buy_price=2900.0, buy_quantity=100
    )

    trend_price_service.soft_delete_price(db_session, "7203")
    assert trend_price_service.get_active_price(db_session, "7203") is None

    trend_price_service.restore_price_if_exists(db_session, "7203")
    restored = trend_price_service.get_active_price(db_session, "7203")

    assert restored is not None
    assert restored.id == created.id
    assert restored.buy_quantity == 100


def test_restore_price_if_exists_is_noop_when_no_row(db_session):
    trend_price_service.restore_price_if_exists(db_session, "9999")

    assert trend_price_service.get_active_price(db_session, "9999") is None


def test_soft_delete_price_is_noop_when_no_row(db_session):
    trend_price_service.soft_delete_price(db_session, "9999")

    assert trend_price_service.get_price_row(db_session, "9999") is None


def test_upsert_price_stores_the_sale_price_target(db_session):
    price = trend_price_service.upsert_price(
        db_session,
        "7203",
        trend_group_id=None,
        buy_category=1,
        buy_price=2900.0,
        buy_quantity=100,
        sale_price_target=3300.5,
    )

    assert float(price.sale_price_target) == 3300.5


def test_upsert_price_leaves_the_sale_price_target_empty_by_default(db_session):
    price = trend_price_service.upsert_price(
        db_session, "7203", trend_group_id=None, buy_category=1, buy_price=2900.0, buy_quantity=100
    )

    assert price.sale_price_target is None


def test_upsert_price_updates_and_clears_the_sale_price_target(db_session):
    trend_price_service.upsert_price(
        db_session, "7203", trend_group_id=None, buy_category=1, buy_price=2900.0,
        buy_quantity=100, sale_price_target=3300.0,
    )

    changed = trend_price_service.upsert_price(
        db_session, "7203", trend_group_id=None, buy_category=1, buy_price=2900.0,
        buy_quantity=100, sale_price_target=3500.0,
    )
    assert float(changed.sale_price_target) == 3500.0

    cleared = trend_price_service.upsert_price(
        db_session, "7203", trend_group_id=None, buy_category=1, buy_price=2900.0,
        buy_quantity=100, sale_price_target=None,
    )
    assert cleared.sale_price_target is None
    assert len(trend_price_service.list_active_prices(db_session)) == 1


def test_soft_delete_then_restore_keeps_the_sale_price_target(db_session):
    trend_price_service.upsert_price(
        db_session, "7203", trend_group_id=None, buy_category=1, buy_price=2900.0,
        buy_quantity=100, sale_price_target=3300.0,
    )

    trend_price_service.soft_delete_price(db_session, "7203")
    trend_price_service.restore_price_if_exists(db_session, "7203")

    restored = trend_price_service.get_active_price(db_session, "7203")
    assert float(restored.sale_price_target) == 3300.0

