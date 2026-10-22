from datetime import datetime, timedelta

from app.clock import now_jst
from app import market_analysis_service, models, trend_service  # noqa: F401
from app.yfinance_client import InvalidCodeError


def _make_raw_candles(n: int = 25) -> list[dict]:
    # NOTE: uses real date arithmetic (not "24 + i" string formatting) so the
    # generated dates don't overflow past the end of the month (e.g. day 32).
    start = datetime(2026, 8, 24, 9, 0, 0)
    return [
        {
            "datetime": (start + timedelta(days=i)).strftime("%Y-%m-%dT%H:%M:%S+09:00"),
            "open": 99.0 + i,
            "high": 102.0 + i,
            "low": 98.0 + i,
            "close": 100.0 + i,
            "volume": 1000,
        }
        for i in range(n)
    ]


def test_add_trend_success(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )

    response = client.post("/trends", json={"code": "7203"})

    assert response.status_code == 201
    body = response.json()
    assert body["code"] == "7203"
    assert body["name"] == "トヨタ自動車"


def test_add_trend_invalid_code_returns_404(client, monkeypatch):
    def raise_invalid(code):
        raise InvalidCodeError(code)

    monkeypatch.setattr(trend_service, "get_quote", raise_invalid)

    response = client.post("/trends", json={"code": "0000"})

    assert response.status_code == 404
    assert "0000" in response.json()["detail"]


def test_list_trends_returns_active_only(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})

    response = client.get("/trends")

    assert response.status_code == 200
    assert len(response.json()) == 1


def test_delete_trend_not_found_returns_404(client):
    response = client.delete("/trends/9999")

    assert response.status_code == 404


def test_refresh_invalid_interval_returns_422(client):
    response = client.post("/trends/refresh", json={"codes": [], "interval_minutes": 3})

    assert response.status_code == 422


def test_delete_trend_success_returns_true(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})

    response = client.delete("/trends/7203")

    assert response.status_code == 200
    assert response.json() == {"deleted": True}


def test_refresh_success_returns_updated_trends(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    add_response = client.post("/trends", json={"code": "7203"})
    added = add_response.json()

    # Backdate created_at directly via a short-lived session so refresh_trends
    # considers the interval elapsed, without relying on real wall-clock waits.
    session = client.session_local()
    try:
        row = session.get(models.Trend, added["id"])
        row.created_at = now_jst() - timedelta(minutes=5)
        session.commit()
    finally:
        session.close()

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2950.0}
    )
    response = client.post(
        "/trends/refresh", json={"codes": ["7203"], "interval_minutes": 1}
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert float(body[0]["price_at_fetch"]) == 2950.0

    list_response = client.get("/trends")
    assert float(list_response.json()[0]["price_at_fetch"]) == 2950.0


def test_add_refresh_delete_recreate_cycle(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})

    delete_response = client.delete("/trends/7203")
    assert delete_response.status_code == 200

    list_after_delete = client.get("/trends")
    assert list_after_delete.json() == []

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2950.0}
    )
    recreate_response = client.post("/trends", json={"code": "7203"})
    assert recreate_response.status_code == 201

    list_after_recreate = client.get("/trends")
    assert len(list_after_recreate.json()) == 1


def test_get_trend_detail_returns_detail(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})

    response = client.get("/trends/7203")

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == "7203"
    assert body["detail"] == {}


def test_get_trend_detail_returns_empty_name_when_name_is_unset(client, monkeypatch):
    from sqlalchemy import update

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})
    session = client.session_local()
    try:
        session.execute(update(models.TrendCodeName).values(name=None))
        session.commit()
    finally:
        session.close()

    response = client.get("/trends/7203")

    assert response.status_code == 200
    assert response.json()["name"] == ""


def test_get_trend_detail_not_found_returns_404(client):
    response = client.get("/trends/9999")

    assert response.status_code == 404


def test_get_trend_detail_returns_full_detail_end_to_end(client, monkeypatch):
    raw_candles = _make_raw_candles()
    macro_candles = [{"close": 100.0} for _ in range(20)]

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: raw_candles)
    monkeypatch.setattr(trend_service, "get_industry_label", lambda code: "Auto Manufacturers")
    monkeypatch.setattr(trend_service, "get_price_history", lambda ticker: macro_candles)

    client.post("/trends", json={"code": "7203"})

    response = client.get("/trends/7203")

    assert response.status_code == 200
    detail = response.json()["detail"]
    assert len(detail["history"]["candles"]) > 0
    assert detail["market_analysis"]["sector_label"] == "Auto Manufacturers"
    assert "us10y" in detail["market_analysis"]["macro_correlation"]


def test_get_trend_detail_accepts_interval_and_indicators(client, monkeypatch):
    raw_candles = _make_raw_candles()
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: raw_candles)
    monkeypatch.setattr(trend_service, "get_industry_label", lambda code: "Auto Manufacturers")
    monkeypatch.setattr(trend_service, "get_price_history", lambda ticker: [{"close": 100.0}])

    client.post("/trends", json={"code": "7203"})

    response = client.get("/trends/7203?interval=1wk&indicators=rsi,macd")

    assert response.status_code == 200
    detail = response.json()["detail"]
    assert "rsi" in detail["history"]
    assert "macd" in detail["history"]
    assert "bollinger" not in detail["history"]


def test_get_trend_detail_never_calls_yfinance_on_read(client, monkeypatch):
    # conftest.py's autouse _stub_price_history fixture stubs trend_service's
    # yfinance-calling functions for every test, which would silently mask a
    # future regression where the GET /trends/{code} read-path starts calling
    # yfinance directly. This test bypasses that stub by monkeypatching
    # yfinance_client.yf.Ticker itself to blow up, so any real yfinance call
    # anywhere in the read path fails the test immediately.
    # NOTE: uses _make_raw_candles (real date arithmetic) rather than the
    # "24 + i" string formatting, which overflows past the end of the month
    # (e.g. day 32) once i > 7.
    raw_candles = _make_raw_candles()
    monkeypatch.setattr(trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0})
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: raw_candles)
    monkeypatch.setattr(trend_service, "get_industry_label", lambda code: "Auto Manufacturers")
    monkeypatch.setattr(trend_service, "get_price_history", lambda ticker: [{"close": 100.0} for _ in range(20)])
    client.post("/trends", json={"code": "7203"})

    def raise_if_called(*args, **kwargs):
        raise AssertionError("yfinance must not be called on the read path")

    from app import yfinance_client
    monkeypatch.setattr(yfinance_client.yf, "Ticker", raise_if_called)

    response = client.get("/trends/7203?interval=1wk&indicators=rsi,macd,bollinger")

    assert response.status_code == 200
    assert response.json()["detail"]["history"]["candles"]


def test_get_trend_detail_rejects_invalid_interval(client, monkeypatch):
    # Non-empty candles are required here: build_detail_view/resample_candles
    # both short-circuit on an empty raw_candles list before ever validating
    # the interval, so an empty list would trivially return 200, not 422.
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: _make_raw_candles())
    client.post("/trends", json={"code": "7203"})

    response = client.get("/trends/7203?interval=1m")

    assert response.status_code == 422


def test_get_trend_detail_includes_news(client, monkeypatch):
    raw_candles = _make_raw_candles()
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: raw_candles)
    monkeypatch.setattr(trend_service, "get_industry_label", lambda code: "Auto Manufacturers")
    monkeypatch.setattr(trend_service, "get_price_history", lambda ticker: [{"close": 100.0}])
    monkeypatch.setattr(
        trend_service, "get_news", lambda code: [{"title": "t", "summary": "s", "published_at": "p", "url": "u"}]
    )
    monkeypatch.setattr(
        trend_service,
        "summarize_and_analyze",
        lambda code, items: [{"headline": "見出し", "sentiment": "positive", "url": "u", "published_at": "p"}],
    )

    client.post("/trends", json={"code": "7203"})

    response = client.get("/trends/7203")

    assert response.status_code == 200
    detail = response.json()["detail"]
    assert detail["news"] == [{"headline": "見出し", "sentiment": "positive", "url": "u", "published_at": "p"}]


def test_list_trends_includes_position_fields(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})

    response = client.get("/trends")

    body = response.json()[0]
    assert "nick_name" not in body
    assert body["trend_group_id"] is None
    assert body["buy_category"] == 0
    assert body["buy_price"] is None
    assert body["buy_quantity"] is None


def test_update_name_success(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "Toyota Motor Corp", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})

    response = client.patch("/trends/7203/name", json={"name": " トヨタ "})

    assert response.status_code == 200
    assert response.json()["name"] == "トヨタ"
    assert client.get("/trends").json()[0]["name"] == "トヨタ"
    assert client.get("/trends/7203").json()["name"] == "トヨタ"


def test_update_name_with_empty_string_resets_to_empty_name(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "Toyota Motor Corp", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})

    response = client.patch("/trends/7203/name", json={"name": ""})

    assert response.status_code == 200
    assert response.json()["name"] == ""
    assert client.get("/trends").json()[0]["name"] == ""


def test_update_name_not_found_returns_404(client):
    response = client.patch("/trends/9999/name", json={"name": "x"})

    assert response.status_code == 404


def test_update_name_rejects_name_over_255_chars(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})

    response = client.patch("/trends/7203/name", json={"name": "あ" * 256})

    assert response.status_code == 422


def test_old_nick_name_endpoint_is_gone(client):
    response = client.patch("/trends/7203/nick_name", json={"nick_name": "x"})

    assert response.status_code in (404, 405)


def test_list_trends_still_returns_trend_after_its_group_is_soft_deleted(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})
    group_response = client.post("/trend-groups", json={"name": "成長株"})
    group_id = group_response.json()["id"]
    client.patch("/trend-prices/7203", json={"trend_group_id": group_id, "buy_category": 0, "buy_price": None, "buy_quantity": None})

    client.delete(f"/trend-groups/{group_id}")

    response = client.get("/trends")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["code"] == "7203"
    assert body[0]["trend_group_id"] == group_id  # データ自体は操作しない。フロント側で表示フォールバックする


def _rising_raw_candles(n: int = 40) -> list[dict]:
    start = datetime(2026, 8, 1, 9, 0, 0)
    return [
        {
            "datetime": (start + timedelta(days=i)).strftime("%Y-%m-%dT%H:%M:%S+09:00"),
            "open": 100.0 + i,
            "high": 100.0 + i,
            "low": 100.0 + i,
            "close": 100.0 + i,
            "volume": 1000,
        }
        for i in range(n)
    ]


def _patch_fetch(monkeypatch, raw_candles):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: raw_candles)
    monkeypatch.setattr(trend_service, "get_industry_label", lambda code: "x")
    monkeypatch.setattr(trend_service, "get_price_history", lambda ticker: [])
    monkeypatch.setattr(trend_service, "get_news", lambda code: [])


def test_list_trends_includes_the_daily_trend_name(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles())
    client.post("/trends", json={"code": "7203"})

    response = client.get("/trends")

    assert response.status_code == 200
    assert response.json()[0]["type_daily_trend"] == "up"
    assert "daily_trend" not in response.json()[0]


def test_list_trends_returns_none_for_rows_without_a_judgement(client, monkeypatch):
    _patch_fetch(monkeypatch, [])
    client.post("/trends", json={"code": "7203"})

    response = client.get("/trends")

    assert response.json()[0]["type_daily_trend"] == "none"


def test_list_trends_still_works_when_the_master_is_empty(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles())
    client.post("/trends", json={"code": "7203"})
    session = client.session_local()
    try:
        session.query(models.TrendSystemType).delete()
        session.commit()
    finally:
        session.close()

    response = client.get("/trends")

    assert response.status_code == 200
    assert response.json()[0]["type_daily_trend"] == "none"


def test_add_trend_response_includes_the_daily_trend_name(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles())

    response = client.post("/trends", json={"code": "7203"})

    assert response.status_code == 201
    assert response.json()["type_daily_trend"] == "up"


def test_trend_detail_includes_the_daily_trend_name(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles())
    client.post("/trends", json={"code": "7203"})

    response = client.get("/trends/7203")

    assert response.status_code == 200
    assert response.json()["type_daily_trend"] == "up"


def test_create_perspectives_returns_the_three_perspectives(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles())
    client.post("/trends", json={"code": "7203"})
    perspectives = {"buy": "a1", "sell": "b2", "keep": "c3"}
    monkeypatch.setattr(trend_service, "build_perspectives", lambda code, candles, trend: perspectives)

    response = client.post("/trends/7203/perspectives")

    assert response.status_code == 200
    body = response.json()
    assert {k: body[k] for k in ("buy", "sell", "keep")} == perspectives
    assert body["created_at"]


def test_create_perspectives_returns_404_for_an_unknown_code(client):
    assert client.post("/trends/9999/perspectives").status_code == 404


def test_create_perspectives_returns_422_when_there_is_not_enough_data(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles(10))
    client.post("/trends", json={"code": "7203"})

    response = client.post("/trends/7203/perspectives")

    assert response.status_code == 422


def test_create_perspectives_returns_502_when_the_generation_fails(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles())
    client.post("/trends", json={"code": "7203"})

    def raise_error(code, candles, trend):
        raise ValueError("bad output")

    monkeypatch.setattr(trend_service, "build_perspectives", raise_error)

    response = client.post("/trends/7203/perspectives")

    assert response.status_code == 502
    assert "取得できていません" in response.json()["detail"]


def test_fetching_and_refreshing_a_trend_never_builds_perspectives(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles())

    def fail(*args, **kwargs):
        raise AssertionError("perspectives must not be built on fetch or refresh")

    monkeypatch.setattr(trend_service, "build_perspectives", fail)

    assert client.post("/trends", json={"code": "7203"}).status_code == 201
    refresh = client.post("/trends/refresh", json={"codes": ["7203"], "interval_minutes": 1})
    assert refresh.status_code == 200


def test_perspectives_are_saved_and_reused_without_calling_the_ai_again(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles())
    client.post("/trends", json={"code": "7203"})
    calls = []

    def fake_build(code, candles, trend):
        calls.append(code)
        return {"buy": "a1", "sell": "b2", "keep": "c3"}

    monkeypatch.setattr(trend_service, "build_perspectives", fake_build)

    first = client.post("/trends/7203/perspectives")
    second = client.post("/trends/7203/perspectives")

    assert first.status_code == 200
    assert {"buy", "sell", "keep", "created_at"} <= first.json().keys()
    assert second.json() == first.json()
    assert calls == ["7203"]                      # 2回目は、AIを呼ばない
    listed = client.get("/trends").json()
    assert listed[0]["perspectives"]["buy"] == "a1"
    assert listed[0]["perspectives"]["created_at"] == first.json()["created_at"]


def test_list_trends_returns_null_perspectives_before_any_are_made(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles())
    client.post("/trends", json={"code": "7203"})

    assert client.get("/trends").json()[0]["perspectives"] is None


def test_failed_perspectives_are_not_saved(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles())
    client.post("/trends", json={"code": "7203"})

    def raise_error(code, candles, trend):
        raise ValueError("bad output")

    monkeypatch.setattr(trend_service, "build_perspectives", raise_error)
    assert client.post("/trends/7203/perspectives").status_code == 502
    assert client.get("/trends").json()[0]["perspectives"] is None

    monkeypatch.setattr(
        trend_service, "build_perspectives", lambda code, candles, trend: {"buy": "a1", "sell": "b2", "keep": "c3"}
    )
    assert client.post("/trends/7203/perspectives").status_code == 200   # 失敗の後に、もう一度作れる


def test_too_few_daily_bars_are_not_saved(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles(10))
    client.post("/trends", json={"code": "7203"})

    assert client.post("/trends/7203/perspectives").status_code == 422
    assert client.get("/trends").json()[0]["perspectives"] is None


def test_refresh_creates_a_row_without_the_old_perspectives(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles())
    added = client.post("/trends", json={"code": "7203"}).json()
    monkeypatch.setattr(
        trend_service, "build_perspectives", lambda code, candles, trend: {"buy": "a1", "sell": "b2", "keep": "c3"}
    )
    assert client.post("/trends/7203/perspectives").status_code == 200

    session = client.session_local()               # 「更新」の間隔を過ぎたことにする(既存の refresh のテストと同じ方法)
    try:
        row = session.get(models.Trend, added["id"])
        row.created_at = now_jst() - timedelta(minutes=5)
        session.commit()
    finally:
        session.close()
    refreshed = client.post("/trends/refresh", json={"codes": ["7203"], "interval_minutes": 1})

    assert refreshed.status_code == 200
    assert client.get("/trends").json()[0]["perspectives"] is None   # 新しい行は、空
