from app import jquants_client, models
from app.clock import now_jst


def _history(closes):
    return [
        {"date": f"2026-09-{i + 1:02d}", "o": c - 1, "h": c + 2, "l": c - 2, "c": c, "v": 1000 + i}
        for i, c in enumerate(closes)
    ]


def _seed(client, code="7203", name="トヨタ自動車", closes=(10, 20, 30, 40, 50, 60, 70), deleted=False):
    session = client.session_local()
    session.add(
        models.TrendCandidate(
            code=code,
            detail={"history": _history(list(closes))},
            deleted_at=now_jst() if deleted else None,
        )
    )
    if name is not None:
        session.add(models.TrendCodeName(code=code, name=name))
    session.commit()
    session.close()


def test_candles_returns_empty_name_when_name_is_unset(client):
    _seed(client, name=None)

    response = client.get("/screening/candidates/7203/candles")

    assert response.status_code == 200
    assert response.json()["name"] == ""


def test_candles_returns_daily_bars_in_chart_format(client):
    _seed(client)

    response = client.get("/screening/candidates/7203/candles")

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == "7203"
    assert body["name"] == "トヨタ自動車"
    assert body["candles"][0] == {
        "time": "2026-09-01",
        "open": 9,
        "high": 12,
        "low": 8,
        "close": 10,
        "volume": 1000,
    }
    assert len(body["candles"]) == 7


def test_candles_sma5_excludes_periods_with_fewer_than_five_bars(client):
    _seed(client)

    body = client.get("/screening/candidates/7203/candles").json()

    assert body["sma5"] == [
        {"time": "2026-09-05", "value": 30.0},
        {"time": "2026-09-06", "value": 40.0},
        {"time": "2026-09-07", "value": 50.0},
    ]


def test_candles_sma5_empty_when_fewer_than_five_bars(client):
    _seed(client, closes=(10, 20, 30))

    body = client.get("/screening/candidates/7203/candles").json()

    assert len(body["candles"]) == 3
    assert body["sma5"] == []


def test_candles_returns_404_for_unknown_code(client):
    response = client.get("/screening/candidates/9999/candles")

    assert response.status_code == 404


def test_candles_returns_404_for_soft_deleted_candidate(client):
    _seed(client, deleted=True)

    response = client.get("/screening/candidates/7203/candles")

    assert response.status_code == 404


def test_candles_does_not_call_jquants(client, monkeypatch):
    _seed(client)

    def boom(*args, **kwargs):
        raise AssertionError("J-Quants must not be called")

    for attr in dir(jquants_client):
        if attr.startswith("get_") or attr.startswith("list_"):
            monkeypatch.setattr(jquants_client, attr, boom)

    response = client.get("/screening/candidates/7203/candles")

    assert response.status_code == 200
