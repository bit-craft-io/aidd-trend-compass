from app import trend_service


def test_update_trend_price_creates_row_when_missing(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})

    response = client.patch(
        "/trend-prices/7203",
        json={"trend_group_id": None, "buy_category": 1, "buy_price": 2900.0, "buy_quantity": 100},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == "7203"
    assert body["buy_category"] == 1
    assert float(body["buy_price"]) == 2900.0
    assert body["buy_quantity"] == 100


def test_update_trend_price_reflected_in_list_trends(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})
    client.patch(
        "/trend-prices/7203",
        json={"trend_group_id": None, "buy_category": 2, "buy_price": 2800.0, "buy_quantity": 10},
    )

    response = client.get("/trends")

    body = response.json()[0]
    assert body["buy_category"] == 2
    assert body["buy_quantity"] == 10


def test_update_trend_price_rejects_buy_category_out_of_range(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})

    response = client.patch(
        "/trend-prices/7203",
        json={"trend_group_id": None, "buy_category": 4, "buy_price": 2900.0, "buy_quantity": 100},
    )

    assert response.status_code == 422


def _add_trend(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})


def test_update_trend_price_saves_and_returns_the_sale_price_target(client, monkeypatch):
    _add_trend(client, monkeypatch)

    response = client.patch(
        "/trend-prices/7203",
        json={
            "trend_group_id": None, "buy_category": 1, "buy_price": 2900.0,
            "buy_quantity": 100, "sale_price_target": 3300.5,
        },
    )

    assert response.status_code == 200
    assert float(response.json()["sale_price_target"]) == 3300.5


def test_sale_price_target_is_reflected_in_list_trends(client, monkeypatch):
    _add_trend(client, monkeypatch)
    client.patch(
        "/trend-prices/7203",
        json={
            "trend_group_id": None, "buy_category": 1, "buy_price": 2900.0,
            "buy_quantity": 100, "sale_price_target": 3300.5,
        },
    )

    body = client.get("/trends").json()[0]

    assert float(body["sale_price_target"]) == 3300.5


def test_sale_price_target_is_null_for_a_trend_without_a_price_row(client, monkeypatch):
    _add_trend(client, monkeypatch)

    body = client.get("/trends").json()[0]

    assert body["sale_price_target"] is None


def test_update_trend_price_accepts_a_null_sale_price_target(client, monkeypatch):
    _add_trend(client, monkeypatch)
    client.patch(
        "/trend-prices/7203",
        json={"trend_group_id": None, "buy_category": 1, "buy_price": 2900.0,
              "buy_quantity": 100, "sale_price_target": 3300.0},
    )

    response = client.patch(
        "/trend-prices/7203",
        json={"trend_group_id": None, "buy_category": 1, "buy_price": 2900.0,
              "buy_quantity": 100, "sale_price_target": None},
    )

    assert response.status_code == 200
    assert response.json()["sale_price_target"] is None
    assert client.get("/trends").json()[0]["sale_price_target"] is None

