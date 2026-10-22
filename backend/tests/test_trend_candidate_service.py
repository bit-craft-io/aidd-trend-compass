from datetime import datetime, timedelta

from app.clock import now_jst
from app import trend_candidate_service, trend_system_service


def test_is_cooldown_active_false_when_never_run(db_session):
    assert trend_candidate_service.is_cooldown_active(db_session) is False


def test_is_cooldown_active_true_within_24_hours(db_session):
    recent = (now_jst() - timedelta(hours=1)).isoformat()
    trend_system_service.set_value(db_session, "screening_last_run_at", recent)

    assert trend_candidate_service.is_cooldown_active(db_session) is True


def test_is_cooldown_active_false_after_24_hours(db_session):
    old = (now_jst() - timedelta(hours=25)).isoformat()
    trend_system_service.set_value(db_session, "screening_last_run_at", old)

    assert trend_candidate_service.is_cooldown_active(db_session) is False


def test_remaining_cooldown_seconds_is_positive_within_window(db_session):
    recent = (now_jst() - timedelta(hours=1)).isoformat()
    trend_system_service.set_value(db_session, "screening_last_run_at", recent)

    remaining = trend_candidate_service.remaining_cooldown_seconds(db_session)

    assert 22 * 3600 + 3590 <= remaining <= 23 * 3600


def test_run_scan_truncates_and_reinserts_candidates(db_session, monkeypatch):
    from app import models

    db_session.add(models.TrendCandidate(code="1111", detail={"history": []}))
    db_session.commit()

    monkeypatch.setattr(
        trend_candidate_service.jquants_client,
        "list_prime_stocks",
        lambda: [{"code": "7203", "name": "トヨタ自動車"}],
    )
    monkeypatch.setattr(
        trend_candidate_service.jquants_client,
        "get_daily_bars",
        lambda code, days=90: [{"date": "2026-09-28", "o": 1, "h": 1, "l": 1, "c": 1, "v": 1}],
    )
    monkeypatch.setattr(trend_candidate_service.jquants_client, "pace_requests", lambda: None)

    saved = trend_candidate_service.run_scan(db_session)

    assert saved == 1
    candidates = trend_candidate_service.list_active_candidates(db_session)
    assert len(candidates) == 1
    assert candidates[0].code == "7203"
    assert [c.code for c in candidates] == ["7203"]
    assert "1111" not in [c.code for c in candidates]
    assert trend_system_service.get_value(db_session, "screening_last_run_at") is not None


def test_run_scan_skips_stocks_that_fail_to_fetch(db_session, monkeypatch):
    from app.jquants_client import JQuantsError

    monkeypatch.setattr(
        trend_candidate_service.jquants_client,
        "list_prime_stocks",
        lambda: [{"code": "7203", "name": "トヨタ自動車"}, {"code": "9999", "name": "失敗銘柄"}],
    )

    def fake_get_daily_bars(code, days=90):
        if code == "9999":
            raise JQuantsError("boom")
        return [{"date": "2026-09-28", "o": 1, "h": 1, "l": 1, "c": 1, "v": 1}]

    monkeypatch.setattr(
        trend_candidate_service.jquants_client, "get_daily_bars", fake_get_daily_bars
    )
    monkeypatch.setattr(trend_candidate_service.jquants_client, "pace_requests", lambda: None)

    saved = trend_candidate_service.run_scan(db_session)

    assert saved == 1
    candidates = trend_candidate_service.list_active_candidates(db_session)
    assert [c.code for c in candidates] == ["7203"]


def test_run_scan_clears_previous_results(db_session, monkeypatch):
    from app import models

    condition = models.TrendCandidateCondition(name="x", condition={})
    db_session.add(condition)
    db_session.commit()
    db_session.refresh(condition)
    db_session.add(models.TrendCandidateResult(condition_id=condition.id, code="7203"))
    db_session.commit()

    monkeypatch.setattr(trend_candidate_service.jquants_client, "list_prime_stocks", lambda: [])
    monkeypatch.setattr(trend_candidate_service.jquants_client, "pace_requests", lambda: None)

    trend_candidate_service.run_scan(db_session)

    from sqlalchemy import select

    remaining = db_session.execute(select(models.TrendCandidateResult)).scalars().all()
    assert remaining == []


def test_run_scan_keeps_existing_data_when_all_fetches_fail(db_session, monkeypatch):
    from sqlalchemy import select

    from app import models
    from app.jquants_client import JQuantsError

    db_session.add(models.TrendCandidate(code="1111", detail={"history": []}))
    condition = models.TrendCandidateCondition(name="x", condition={})
    db_session.add(condition)
    db_session.commit()
    db_session.refresh(condition)
    db_session.add(models.TrendCandidateResult(condition_id=condition.id, code="1111"))
    db_session.commit()

    monkeypatch.setattr(
        trend_candidate_service.jquants_client,
        "list_prime_stocks",
        lambda: [{"code": "7203", "name": "トヨタ自動車"}],
    )

    def always_fail(code, days=90):
        raise JQuantsError("boom")

    monkeypatch.setattr(trend_candidate_service.jquants_client, "get_daily_bars", always_fail)
    monkeypatch.setattr(trend_candidate_service.jquants_client, "pace_requests", lambda: None)

    saved = trend_candidate_service.run_scan(db_session)

    assert saved == 0
    assert [c.code for c in trend_candidate_service.list_active_candidates(db_session)] == ["1111"]
    results = db_session.execute(select(models.TrendCandidateResult)).scalars().all()
    assert [r.code for r in results] == ["1111"]
    assert trend_system_service.get_value(db_session, "screening_last_run_at") is not None


def _stub_jquants(monkeypatch, stocks):
    monkeypatch.setattr(trend_candidate_service.jquants_client, "list_prime_stocks", lambda: stocks)
    monkeypatch.setattr(
        trend_candidate_service.jquants_client,
        "get_daily_bars",
        lambda code, days=90: [{"date": "2026-09-28", "o": 1, "h": 1, "l": 1, "c": 1, "v": 1}],
    )
    monkeypatch.setattr(trend_candidate_service.jquants_client, "pace_requests", lambda: None)


def test_run_scan_saves_names_via_fill_names_without_overwriting(db_session, monkeypatch):
    from app import trend_code_name_service

    trend_code_name_service.set_name(db_session, "7203", "手入力のトヨタ")
    db_session.commit()
    _stub_jquants(
        monkeypatch,
        [{"code": "7203", "name": "トヨタ自動車"}, {"code": "6758", "name": "ソニーグループ"}],
    )

    trend_candidate_service.run_scan(db_session)

    assert trend_code_name_service.get_names(db_session, ["7203", "6758"]) == {
        "7203": "手入力のトヨタ",
        "6758": "ソニーグループ",
    }


def test_run_scan_does_not_save_names_for_stocks_whose_bars_failed(db_session, monkeypatch):
    from app import trend_code_name_service

    _stub_jquants(
        monkeypatch,
        [{"code": "7203", "name": "トヨタ自動車"}, {"code": "6758", "name": "ソニーグループ"}],
    )

    def fail_for_sony(code, days=90):
        if code == "6758":
            raise trend_candidate_service.jquants_client.JQuantsError("boom")
        return [{"date": "2026-09-28", "o": 1, "h": 1, "l": 1, "c": 1, "v": 1}]

    monkeypatch.setattr(trend_candidate_service.jquants_client, "get_daily_bars", fail_for_sony)

    trend_candidate_service.run_scan(db_session)

    assert trend_code_name_service.get_names(db_session, ["7203", "6758"]) == {"7203": "トヨタ自動車"}


def test_run_scan_keeps_old_candidates_when_fill_names_fails(db_session, monkeypatch):
    from app import models

    db_session.add(models.TrendCandidate(code="1111", detail={"history": []}))
    db_session.commit()
    _stub_jquants(monkeypatch, [{"code": "7203", "name": "トヨタ自動車"}])

    def boom(db, names):
        raise RuntimeError("fill_names failed")

    monkeypatch.setattr(trend_candidate_service.trend_code_name_service, "fill_names", boom)

    import pytest

    with pytest.raises(RuntimeError):
        trend_candidate_service.run_scan(db_session)
    db_session.rollback()

    assert [c.code for c in trend_candidate_service.list_active_candidates(db_session)] == ["1111"]
