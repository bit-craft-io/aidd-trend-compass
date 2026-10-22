from app import jquants_client
from app.routers import screening as screening_router


def test_status_reports_api_key_not_configured(client, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "")

    response = client.get("/screening/status")

    assert response.status_code == 200
    assert response.json()["api_key_configured"] is False


def test_scan_rejected_when_api_key_missing(client, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "")

    response = client.post("/screening/scan")

    assert response.status_code == 400


def test_scan_rejected_during_cooldown(client, monkeypatch):
    from datetime import datetime

    from app import trend_candidate_service

    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "test-key")
    monkeypatch.setattr(trend_candidate_service, "is_cooldown_active", lambda db: True)

    response = client.post("/screening/scan")

    assert response.status_code == 423


def test_scan_starts_background_task_when_allowed(client, monkeypatch):
    from app import trend_candidate_service

    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "test-key")
    monkeypatch.setattr(trend_candidate_service, "is_cooldown_active", lambda db: False)
    calls = []
    monkeypatch.setattr(
        screening_router, "_run_scan_with_own_session", lambda: calls.append(1)
    )

    response = client.post("/screening/scan")

    assert response.status_code == 200
    assert response.json() == {"started": True}
    assert len(calls) == 1


def test_run_scan_with_own_session_opens_and_closes_its_session(client, monkeypatch):
    from app import trend_candidate_service

    monkeypatch.setattr(screening_router, "SessionLocal", client.session_local)
    received = []

    def fake_run_scan(db):
        received.append(db)
        return 0

    monkeypatch.setattr(trend_candidate_service, "run_scan", fake_run_scan)

    screening_router._run_scan_with_own_session()

    assert len(received) == 1
    assert received[0] is not None


def test_status_reports_cooldown_and_free_mode(client, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "test-key")
    monkeypatch.setattr(jquants_client, "JQUANTS_RATE_LIMIT_PER_64S", 5)
    monkeypatch.setattr(jquants_client, "JQUANTS_MAX_STOCKS", 10)

    response = client.get("/screening/status")

    assert response.status_code == 200
    body = response.json()
    assert body["api_key_configured"] is True
    assert body["cooldown_active"] is False
    assert body["remaining_cooldown_seconds"] == 0
    assert body["rate_limit_per_64s"] == 5
    assert body["max_stocks"] == 10
    assert body["is_free_mode"] is True


def test_status_not_free_mode_when_rate_limit_above_five(client, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "test-key")
    monkeypatch.setattr(jquants_client, "JQUANTS_RATE_LIMIT_PER_64S", 60)
    monkeypatch.setattr(jquants_client, "JQUANTS_MAX_STOCKS", 10)

    response = client.get("/screening/status")

    assert response.status_code == 200
    assert response.json()["is_free_mode"] is False


def test_scan_stamps_last_run_before_dispatch_and_blocks_immediate_second_scan(
    client, monkeypatch
):
    from app import trend_candidate_service, trend_system_service

    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "test-key")
    # 背景タスクは実行させない(スタンプがリクエスト内で書かれることの証明のため)。
    ran = []
    monkeypatch.setattr(trend_candidate_service, "run_scan", lambda db: ran.append(1) or 0)
    monkeypatch.setattr(screening_router, "_run_scan_with_own_session", lambda: None)

    first = client.post("/screening/scan")

    assert first.status_code == 200
    assert ran == []
    db = client.session_local()
    try:
        assert (
            trend_system_service.get_value(db, trend_candidate_service.LAST_RUN_KEY) is not None
        )
    finally:
        db.close()

    second = client.post("/screening/scan")

    assert second.status_code == 423


def test_status_reports_last_run_at_null_then_stamp(client, monkeypatch):
    from app import trend_candidate_service, trend_system_service

    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "test-key")

    assert client.get("/screening/status").json()["last_run_at"] is None

    db = client.session_local()
    try:
        trend_system_service.set_value(
            db, trend_candidate_service.LAST_RUN_KEY, "2026-09-29T01:02:03"
        )
    finally:
        db.close()

    assert client.get("/screening/status").json()["last_run_at"] == "2026-09-29T01:02:03"
