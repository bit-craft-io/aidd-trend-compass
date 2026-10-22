from app import trend_candidate_condition_service


def test_create_condition_generates_timestamp_name_in_jst(db_session, monkeypatch):
    from datetime import datetime

    monkeypatch.setattr(
        trend_candidate_condition_service, "now_jst", lambda: datetime(2026, 9, 29, 23, 32)
    )

    condition = trend_candidate_condition_service.create_condition(db_session, ["volume_surge"])

    assert condition.name == "2026-09-29_2332"


def test_create_condition_merges_defaults_for_enabled_signals_only(db_session):
    condition = trend_candidate_condition_service.create_condition(db_session, ["volume_surge"])

    assert condition.condition["volume_surge"]["enabled"] is True
    assert condition.condition["volume_surge"]["multiplier"] == 1.5
    assert condition.condition["ma_trend"]["enabled"] is False


def test_list_conditions_excludes_soft_deleted(db_session):
    trend_candidate_condition_service.create_condition(db_session, ["volume_surge"])
    to_delete = trend_candidate_condition_service.create_condition(db_session, ["ma_trend"])
    trend_candidate_condition_service.soft_delete_condition(db_session, to_delete.id)

    active = trend_candidate_condition_service.list_conditions(db_session)

    assert len(active) == 1


def test_rename_condition_updates_name(db_session):
    condition = trend_candidate_condition_service.create_condition(db_session, ["volume_surge"])

    renamed = trend_candidate_condition_service.rename_condition(
        db_session, condition.id, "出来高重視セット"
    )

    assert renamed.name == "出来高重視セット"


def test_rename_condition_returns_none_when_not_found(db_session):
    assert trend_candidate_condition_service.rename_condition(db_session, 9999, "x") is None


def test_soft_delete_condition_returns_false_when_not_found(db_session):
    assert trend_candidate_condition_service.soft_delete_condition(db_session, 9999) is False


def test_get_active_condition_returns_condition_when_found(db_session):
    condition = trend_candidate_condition_service.create_condition(db_session, ["volume_surge"])

    found = trend_candidate_condition_service.get_active_condition(db_session, condition.id)

    assert found is not None
    assert found.id == condition.id


def test_get_active_condition_returns_none_when_not_found(db_session):
    assert trend_candidate_condition_service.get_active_condition(db_session, 9999) is None


def test_get_active_condition_returns_none_when_soft_deleted(db_session):
    condition = trend_candidate_condition_service.create_condition(db_session, ["volume_surge"])
    trend_candidate_condition_service.soft_delete_condition(db_session, condition.id)

    assert trend_candidate_condition_service.get_active_condition(db_session, condition.id) is None


def test_get_or_create_condition_reuses_same_signal_set_regardless_of_order(db_session):
    first = trend_candidate_condition_service.get_or_create_condition(
        db_session, ["volume_surge", "ma_trend"]
    )
    second = trend_candidate_condition_service.get_or_create_condition(
        db_session, ["ma_trend", "volume_surge"]
    )

    assert second.id == first.id
    assert len(trend_candidate_condition_service.list_conditions(db_session)) == 1


def test_get_or_create_condition_creates_new_for_different_set(db_session):
    first = trend_candidate_condition_service.get_or_create_condition(db_session, ["volume_surge"])
    second = trend_candidate_condition_service.get_or_create_condition(
        db_session, ["volume_surge", "ma_trend"]
    )

    assert second.id != first.id
    assert len(trend_candidate_condition_service.list_conditions(db_session)) == 2


def test_get_or_create_condition_keeps_renamed_name(db_session):
    first = trend_candidate_condition_service.get_or_create_condition(db_session, ["volume_surge"])
    trend_candidate_condition_service.rename_condition(db_session, first.id, "出来高重視セット")

    again = trend_candidate_condition_service.get_or_create_condition(db_session, ["volume_surge"])

    assert again.id == first.id
    assert again.name == "出来高重視セット"


def test_get_or_create_condition_does_not_reuse_soft_deleted(db_session):
    first = trend_candidate_condition_service.get_or_create_condition(db_session, ["volume_surge"])
    trend_candidate_condition_service.soft_delete_condition(db_session, first.id)

    again = trend_candidate_condition_service.get_or_create_condition(db_session, ["volume_surge"])

    assert again.id != first.id
    assert again.deleted_at is None
    assert [c.id for c in trend_candidate_condition_service.list_conditions(db_session)] == [
        again.id
    ]


def test_get_or_create_condition_empty_set_is_a_condition_too(db_session):
    first = trend_candidate_condition_service.get_or_create_condition(db_session, [])
    second = trend_candidate_condition_service.get_or_create_condition(db_session, [])

    assert second.id == first.id
