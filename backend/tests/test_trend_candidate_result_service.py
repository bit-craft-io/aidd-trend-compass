from app import models, trend_candidate_condition_service, trend_candidate_result_service


def _bar(price=1000.0):
    return {"date": "2026-09-28", "o": price, "h": price, "l": price, "c": price, "v": 100000}


def test_run_search_matches_only_stocks_meeting_all_enabled_signals(db_session):
    matching = models.TrendCandidate(
        code="7203",
        detail={"history": [_bar(1000.0)] * 25 + [_bar(1100.0)]},
    )
    non_matching = models.TrendCandidate(
        code="6758", detail={"history": [_bar(1000.0)] * 26}
    )
    db_session.add_all([matching, non_matching])
    db_session.commit()

    condition = trend_candidate_condition_service.create_condition(db_session, ["high_break"])

    matched_codes = trend_candidate_result_service.run_search(db_session, condition)

    assert matched_codes == ["7203"]


def test_run_search_persists_results_tied_to_condition_id(db_session):
    db_session.add(
        models.TrendCandidate(code="7203", detail={"history": [_bar()] * 30})
    )
    db_session.commit()
    condition = trend_candidate_condition_service.create_condition(db_session, [])

    trend_candidate_result_service.run_search(db_session, condition)

    from sqlalchemy import select

    rows = db_session.execute(
        select(models.TrendCandidateResult).where(
            models.TrendCandidateResult.condition_id == condition.id
        )
    ).scalars().all()
    assert [r.code for r in rows] == ["7203"]


def test_get_cached_results_returns_items_and_total_without_recompute(db_session):
    from app import trend_code_name_service

    db_session.add(models.TrendCandidate(code="7203", detail={"history": [_bar()] * 30}))
    trend_code_name_service.set_name(db_session, "7203", "トヨタ自動車")
    db_session.commit()
    condition = trend_candidate_condition_service.create_condition(db_session, [])
    trend_candidate_result_service.run_search(db_session, condition)

    items = trend_candidate_result_service.get_cached_results(db_session, condition.id)

    assert len(items) == 1
    assert items[0]["code"] == "7203"
    assert items[0]["name"] == "トヨタ自動車"
    assert items[0]["price"] == 1000.0


def test_get_cached_results_returns_empty_name_when_name_is_unset(db_session):
    db_session.add(models.TrendCandidate(code="7203", detail={"history": [_bar()] * 30}))
    db_session.commit()
    condition = trend_candidate_condition_service.create_condition(db_session, [])
    trend_candidate_result_service.run_search(db_session, condition)

    items = trend_candidate_result_service.get_cached_results(db_session, condition.id)

    assert len(items) == 1
    assert items[0]["name"] == ""


def test_run_search_replaces_previous_results_instead_of_duplicating(db_session):
    from sqlalchemy import select

    db_session.add(
        models.TrendCandidate(code="7203", detail={"history": [_bar()] * 30})
    )
    db_session.commit()
    condition = trend_candidate_condition_service.get_or_create_condition(db_session, [])

    trend_candidate_result_service.run_search(db_session, condition)
    again = trend_candidate_condition_service.get_or_create_condition(db_session, [])
    trend_candidate_result_service.run_search(db_session, again)

    assert again.id == condition.id
    rows = db_session.execute(
        select(models.TrendCandidateResult).where(
            models.TrendCandidateResult.condition_id == condition.id
        )
    ).scalars().all()
    assert [r.code for r in rows] == ["7203"]


def test_get_cached_results_includes_the_daily_trend_name(db_session):
    rising = [_bar(1000.0 + i * 5) for i in range(40)]
    flat = [_bar(1000.0)] * 30
    short = [_bar(1000.0 + i) for i in range(10)]
    db_session.add_all(
        [
            models.TrendCandidate(code="1111", detail={"history": rising}),
            models.TrendCandidate(code="2222", detail={"history": flat}),
            models.TrendCandidate(code="3333", detail={"history": short}),
        ]
    )
    db_session.commit()
    condition = trend_candidate_condition_service.create_condition(db_session, [])
    trend_candidate_result_service.run_search(db_session, condition)

    items = trend_candidate_result_service.get_cached_results(db_session, condition.id)

    by_code = {item["code"]: item["type_daily_trend"] for item in items}
    assert by_code == {"1111": "up", "2222": "flat", "3333": "none"}


def test_get_cached_results_hides_the_trend_when_ma_trend_matched_but_the_trend_is_not_up(db_session):
    # ma_trend は閾値が無く合致するが、差は0.16%で、判定は「横ばい」になるデータ。
    within_band = [_bar(100.0)] * 21 + [_bar(100.0), _bar(100.0), _bar(100.0), _bar(100.0), _bar(101.0)]
    db_session.add(models.TrendCandidate(code="1111", detail={"history": within_band}))
    db_session.commit()
    condition = trend_candidate_condition_service.create_condition(db_session, ["ma_trend"])

    matched = trend_candidate_result_service.run_search(db_session, condition)
    items = trend_candidate_result_service.get_cached_results(db_session, condition.id)

    assert matched == ["1111"]
    assert items[0]["type_daily_trend"] == "none"


def test_get_cached_results_keeps_the_up_trend_when_ma_trend_matched(db_session):
    rising = [_bar(1000.0 + i * 5) for i in range(40)]
    db_session.add(models.TrendCandidate(code="1111", detail={"history": rising}))
    db_session.commit()
    condition = trend_candidate_condition_service.create_condition(db_session, ["ma_trend"])

    trend_candidate_result_service.run_search(db_session, condition)
    items = trend_candidate_result_service.get_cached_results(db_session, condition.id)

    assert items[0]["type_daily_trend"] == "up"


def test_get_cached_results_returns_every_item_without_paging(db_session):
    for i in range(25):
        db_session.add(
            models.TrendCandidate(code=f"code{i:02d}", detail={"history": [_bar()] * 30})
        )
    db_session.commit()
    condition = trend_candidate_condition_service.create_condition(db_session, [])
    trend_candidate_result_service.run_search(db_session, condition)

    items = trend_candidate_result_service.get_cached_results(db_session, condition.id)

    assert len(items) == 25
    assert len({item["code"] for item in items}) == 25


def test_get_cached_results_follows_the_name_in_the_master(db_session):
    db_session.query(models.TrendSystemType).filter_by(
        type_column="type_daily_trend", type_value=1
    ).update({"type_name": "rise"})
    db_session.commit()
    rising = [_bar(1000.0 + i * 5) for i in range(40)]
    db_session.add(models.TrendCandidate(code="1111", detail={"history": rising}))
    db_session.commit()
    condition = trend_candidate_condition_service.create_condition(db_session, [])
    trend_candidate_result_service.run_search(db_session, condition)

    items = trend_candidate_result_service.get_cached_results(db_session, condition.id)

    assert items[0]["type_daily_trend"] == "rise"


def test_get_cached_results_returns_none_when_the_master_is_empty(db_session):
    db_session.query(models.TrendSystemType).delete()
    db_session.commit()
    rising = [_bar(1000.0 + i * 5) for i in range(40)]
    db_session.add(models.TrendCandidate(code="1111", detail={"history": rising}))
    db_session.commit()
    condition = trend_candidate_condition_service.create_condition(db_session, [])
    trend_candidate_result_service.run_search(db_session, condition)

    items = trend_candidate_result_service.get_cached_results(db_session, condition.id)

    assert items[0]["type_daily_trend"] == "none"
