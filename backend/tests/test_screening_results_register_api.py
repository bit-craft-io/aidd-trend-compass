from app import models
from app.yfinance_client import InvalidCodeError


def _seed_candidate_and_search(client) -> int:
    session = client.session_local()
    session.add(
        models.TrendCandidate(
            code="7203",
            detail={"history": [{"date": "2026-09-28", "o": 1, "h": 1, "l": 1, "c": 1, "v": 1}] * 30},
        )
    )
    session.commit()
    session.close()

    search_response = client.post("/screening/search", json={"enabled_signals": []})
    return search_response.json()["condition_id"]


def test_get_results_returns_cached_items(client):
    session = client.session_local()
    session.add(
        models.TrendCandidate(
            code="7203",
            detail={"history": [{"date": "2026-09-28", "o": 1, "h": 1, "l": 1, "c": 1, "v": 1}] * 30},
        )
    )
    session.commit()
    session.close()

    search_response = client.post("/screening/search", json={"enabled_signals": []})
    condition_id = search_response.json()["condition_id"]

    response = client.get(f"/screening/results/{condition_id}")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["code"] == "7203"
    assert body["items"][0]["type_daily_trend"] == "flat"


def test_get_results_returns_all_items_in_one_response(client):
    session = client.session_local()
    for i in range(25):
        session.add(
            models.TrendCandidate(
                code=f"c{i:02d}",
                detail={"history": [{"date": "2026-09-28", "o": 1, "h": 1, "l": 1, "c": 1, "v": 1}] * 30},
            )
        )
    session.commit()
    session.close()
    condition_id = client.post("/screening/search", json={"enabled_signals": []}).json()["condition_id"]

    body = client.get(f"/screening/results/{condition_id}").json()

    assert body["total"] == 25
    assert len(body["items"]) == 25
    assert "page" not in body and "page_size" not in body
    assert "daily_trend" not in body["items"][0]
    assert body["items"][0]["type_daily_trend"] == "flat"


def test_get_results_ignores_the_old_paging_query(client):
    condition_id = _seed_candidate_and_search(client)

    response = client.get(f"/screening/results/{condition_id}?page=2&page_size=1")

    assert response.status_code == 200
    assert len(response.json()["items"]) == 1


def test_get_results_unknown_condition_returns_404(client):
    response = client.get("/screening/results/9999")

    assert response.status_code == 404


def test_get_results_soft_deleted_condition_returns_404(client):
    condition_id = _seed_candidate_and_search(client)
    assert client.delete(f"/screening/conditions/{condition_id}").status_code == 200

    response = client.get(f"/screening/results/{condition_id}")

    assert response.status_code == 404


def test_register_adds_new_codes_and_skips_existing(client, monkeypatch):
    from app import trend_service

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})

    response = client.post("/screening/register", json={"codes": ["7203", "6758"]})

    assert response.status_code == 200
    body = response.json()
    assert body["registered"] == ["6758"]
    assert body["skipped_count"] == 1


def _patch_get_quote_invalid_for_0000(monkeypatch):
    from app import trend_service

    def fake_get_quote(code):
        if code == "0000":
            raise InvalidCodeError(code)
        return {"name": "ソニーグループ", "price": 13000.0}

    monkeypatch.setattr(trend_service, "get_quote", fake_get_quote)


def test_register_reports_invalid_code_in_failed_and_continues(client, monkeypatch):
    _patch_get_quote_invalid_for_0000(monkeypatch)

    response = client.post("/screening/register", json={"codes": ["0000", "6758"]})

    assert response.status_code == 200
    body = response.json()
    assert body["registered"] == ["6758"]
    assert body["failed"] == ["0000"]
    assert body["skipped_count"] == 0

    codes = [t["code"] for t in client.get("/trends").json()]
    assert "6758" in codes
    assert "0000" not in codes


def test_register_dedupes_repeated_codes(client, monkeypatch):
    _patch_get_quote_invalid_for_0000(monkeypatch)

    response = client.post("/screening/register", json={"codes": ["6758", "6758"]})

    assert response.status_code == 200
    body = response.json()
    assert body["registered"] == ["6758"]
    assert body["skipped_count"] == 0


def test_register_unexpected_error_for_one_code_does_not_500_the_batch(client, monkeypatch):
    from app import trend_service

    real_create_trend = trend_service.create_trend

    def flaky_create_trend(db, code):
        if code == "1301":
            raise RuntimeError("Invalid JSON text in column detail")
        return real_create_trend(db, code)

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "ソニーグループ", "price": 13000.0}
    )
    monkeypatch.setattr(trend_service, "create_trend", flaky_create_trend)

    response = client.post("/screening/register", json={"codes": ["1301", "6758"]})

    assert response.status_code == 200
    body = response.json()
    assert body["registered"] == ["6758"]
    assert body["failed"] == ["1301"]
    codes = [t["code"] for t in client.get("/trends").json()]
    assert codes == ["6758"]
