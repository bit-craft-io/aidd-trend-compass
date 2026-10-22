from datetime import datetime, timedelta

from app.clock import now_jst
from app import trend_service
import pytest


def test_create_trend_first_time(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.code == "7203"
    assert trend.name == "トヨタ自動車"
    assert trend.opinion == "初回取得、履歴データ無し"
    assert float(trend.price_at_fetch) == 2900.0


def test_create_trend_second_time_shows_diff_opinion(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    trend_service.create_trend(db_session, "7203")

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2950.0}
    )
    second = trend_service.create_trend(db_session, "7203")

    assert "上昇傾向" in second.opinion
    assert "+1.7%" in second.opinion


def test_list_active_trends_returns_only_undeleted(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "テスト", "price": 100.0}
    )
    trend_service.create_trend(db_session, "0001")

    active = trend_service.list_active_trends(db_session)

    assert len(active) == 1
    assert active[0].code == "0001"


def test_refresh_skips_when_within_interval(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "テスト", "price": 100.0}
    )
    trend_service.create_trend(db_session, "0001")

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "テスト", "price": 200.0}
    )
    updated = trend_service.refresh_trends(db_session, ["0001"], 5)

    assert updated == []


def test_refresh_updates_when_interval_exceeded(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "テスト", "price": 100.0}
    )
    original = trend_service.create_trend(db_session, "0001")
    original.created_at = now_jst() - timedelta(minutes=10)
    db_session.commit()

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "テスト", "price": 120.0}
    )
    updated = trend_service.refresh_trends(db_session, ["0001"], 5)

    assert len(updated) == 1
    assert float(updated[0].price_at_fetch) == 120.0
    active = trend_service.list_active_trends(db_session)
    assert len(active) == 1
    assert float(active[0].price_at_fetch) == 120.0


def test_refresh_raises_on_invalid_interval(db_session):
    with pytest.raises(ValueError):
        trend_service.refresh_trends(db_session, [], 3)


def test_delete_trend_soft_deletes_active_row(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "テスト", "price": 100.0}
    )
    trend_service.create_trend(db_session, "0001")

    deleted = trend_service.delete_trend(db_session, "0001")

    assert deleted is True
    assert trend_service.list_active_trends(db_session) == []


def test_delete_trend_returns_false_when_not_found(db_session):
    assert trend_service.delete_trend(db_session, "9999") is False


def test_recreating_after_delete_shows_again(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "テスト", "price": 100.0}
    )
    trend_service.create_trend(db_session, "0001")
    trend_service.delete_trend(db_session, "0001")

    trend_service.create_trend(db_session, "0001")

    assert len(trend_service.list_active_trends(db_session)) == 1


def test_create_trend_on_already_active_code_replaces_previous_row(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    trend_service.create_trend(db_session, "7203")

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2950.0}
    )
    trend_service.create_trend(db_session, "7203")

    active = trend_service.list_active_trends(db_session)
    assert len(active) == 1
    assert float(active[0].price_at_fetch) == 2950.0


def test_refresh_skips_code_when_get_quote_raises_invalid_code_error(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "テスト", "price": 100.0}
    )
    trend_service.create_trend(db_session, "0001")
    trend_service.create_trend(db_session, "0002")

    original_0001 = trend_service.get_active_trend(db_session, "0001")
    original_0001.created_at = now_jst() - timedelta(minutes=10)
    original_0002 = trend_service.get_active_trend(db_session, "0002")
    original_0002.created_at = now_jst() - timedelta(minutes=10)
    db_session.commit()

    def flaky_get_quote(code):
        if code == "0001":
            raise trend_service.InvalidCodeError(code)
        return {"name": "テスト", "price": 150.0}

    monkeypatch.setattr(trend_service, "get_quote", flaky_get_quote)

    updated = trend_service.refresh_trends(db_session, ["0001", "0002"], 5)

    assert [t.code for t in updated] == ["0002"]
    assert float(updated[0].price_at_fetch) == 150.0
    active_0001 = trend_service.get_active_trend(db_session, "0001")
    assert float(active_0001.price_at_fetch) == 100.0


def test_create_trend_stores_raw_candles_and_macro_data(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    raw_candles = [
        {"datetime": "2026-09-18T09:00:00+09:00", "open": 99.0, "high": 101.0, "low": 98.0, "close": 100.0, "volume": 1000}
    ]
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: raw_candles)
    monkeypatch.setattr(trend_service, "get_industry_label", lambda code: "Auto Manufacturers")
    monkeypatch.setattr(trend_service, "get_price_history", lambda ticker: [{"close": 100.0}])

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.detail["raw_candles"] == raw_candles
    assert trend.detail["sector_label"] == "Auto Manufacturers"
    assert trend.detail["macro_candles"]["index"] == [{"close": 100.0}]


def test_create_trend_leaves_detail_empty_when_intraday_fetch_fails(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )

    def raise_error(code):
        raise RuntimeError("yfinance unreachable")

    monkeypatch.setattr(trend_service, "get_intraday_history", raise_error)

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.detail == {}
    assert trend.name == "トヨタ自動車"


def test_create_trend_leaves_detail_empty_when_no_candles_returned(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: [])

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.detail == {}


def test_create_trend_keeps_raw_candles_when_sector_label_fetch_fails(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    raw_candles = [
        {"datetime": "2026-09-18T09:00:00+09:00", "open": 99.0, "high": 101.0, "low": 98.0, "close": 100.0, "volume": 1000}
    ]
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: raw_candles)

    def raise_error(code):
        raise RuntimeError("industry lookup failed")

    monkeypatch.setattr(trend_service, "get_industry_label", raise_error)

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.detail["raw_candles"] == raw_candles
    assert "sector_label" not in trend.detail


def test_refresh_trends_preserves_previous_detail_when_build_detail_fails(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    raw_candles = [
        {"datetime": "2026-08-24T09:00:00+09:00", "open": 99.0, "high": 101.0, "low": 98.0, "close": 100.0, "volume": 1000}
    ]
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: raw_candles)
    monkeypatch.setattr(trend_service, "get_industry_label", lambda code: "Auto Manufacturers")
    monkeypatch.setattr(trend_service, "get_price_history", lambda ticker: [{"close": 100.0}])

    original = trend_service.create_trend(db_session, "7203")
    assert original.detail != {}
    original.created_at = now_jst() - timedelta(minutes=10)
    db_session.commit()

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2950.0}
    )
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: [])

    updated = trend_service.refresh_trends(db_session, ["7203"], 5)

    assert len(updated) == 1
    assert updated[0].detail == original.detail
    assert float(updated[0].price_at_fetch) == 2950.0


def test_refresh_trends_shares_macro_cache_across_codes(db_session, monkeypatch):
    stock_candles = [
        {"datetime": "2026-09-18T09:00:00+09:00", "open": 100.0, "high": 101.0, "low": 99.0, "close": 100.0, "volume": 100}
    ]
    macro_calls: dict[str, int] = {}

    def counting_get_price_history(ticker):
        macro_calls[ticker] = macro_calls.get(ticker, 0) + 1
        return [{"close": 100.0} for _ in range(20)]

    monkeypatch.setattr(trend_service, "get_quote", lambda code: {"name": "テスト", "price": 100.0})
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: stock_candles)
    monkeypatch.setattr(trend_service, "get_industry_label", lambda code: "Test Industry")
    monkeypatch.setattr(trend_service, "get_price_history", counting_get_price_history)

    trend_service.create_trend(db_session, "0001")
    trend_service.create_trend(db_session, "0002")

    for code in ("0001", "0002"):
        row = trend_service.get_active_trend(db_session, code)
        row.created_at = now_jst() - timedelta(minutes=10)
    db_session.commit()

    macro_calls.clear()

    trend_service.refresh_trends(db_session, ["0001", "0002"], 5)

    assert macro_calls == {"^N225": 1, "^TNX": 1, "JPY=X": 1}


def test_build_detail_view_returns_empty_dict_when_no_raw_candles():
    assert trend_service.build_detail_view({}, "1d", []) == {}


def test_build_detail_view_returns_history_and_market_analysis():
    base_date = datetime(2026, 8, 1, 9, 0, 0)
    stored_detail = {
        "raw_candles": [
            {
                "datetime": (base_date + timedelta(days=i)).isoformat() + "+09:00",
                "open": 99.0 + i,
                "high": 102.0 + i,
                "low": 98.0 + i,
                "close": 100.0 + i,
                "volume": 1000,
            }
            for i in range(25)
        ],
        "sector_label": "Auto Manufacturers",
        "macro_candles": {
            "index": [{"close": 100.0 + i} for i in range(20)],
            "us10y": [{"close": 100.0} for _ in range(20)],
            "usdjpy": [{"close": 100.0} for _ in range(20)],
        },
    }

    view = trend_service.build_detail_view(stored_detail, "1d", [])

    assert "history" in view
    assert "market_analysis" in view
    assert view["market_analysis"]["sector_label"] == "Auto Manufacturers"


def test_build_detail_view_history_survives_market_analysis_failure(monkeypatch):
    stored_detail = {
        "raw_candles": [
            {
                "datetime": "2026-08-24T09:00:00+09:00",
                "open": 99.0,
                "high": 102.0,
                "low": 98.0,
                "close": 100.0,
                "volume": 1000,
            }
        ],
        "sector_label": "Auto Manufacturers",
        "macro_candles": {"index": [], "us10y": [], "usdjpy": []},
    }

    def raise_error(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(trend_service, "build_market_analysis_detail", raise_error)

    view = trend_service.build_detail_view(stored_detail, "1d", [])

    assert "history" in view
    assert "market_analysis" not in view


def test_build_detail_view_propagates_value_error_for_invalid_interval():
    stored_detail = {
        "raw_candles": [
            {"datetime": "2026-08-24T09:00:00+09:00", "open": 99.0, "high": 102.0, "low": 98.0, "close": 100.0, "volume": 1000}
        ],
    }

    with pytest.raises(ValueError):
        trend_service.build_detail_view(stored_detail, "invalid", [])


def test_create_trend_stores_news(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    raw_candles = [
        {"datetime": "2026-09-18T09:00:00+09:00", "open": 99.0, "high": 101.0, "low": 98.0, "close": 100.0, "volume": 1000}
    ]
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: raw_candles)
    monkeypatch.setattr(trend_service, "get_industry_label", lambda code: "Auto Manufacturers")
    monkeypatch.setattr(trend_service, "get_price_history", lambda ticker: [{"close": 100.0}])
    raw_news = [{"title": "Toyota news", "summary": "s", "published_at": "2026-09-18T00:00:00Z", "url": "https://example.com/1"}]
    monkeypatch.setattr(trend_service, "get_news", lambda code: raw_news)
    monkeypatch.setattr(
        trend_service,
        "summarize_and_analyze",
        lambda code, items: [{"headline": "トヨタ関連ニュース", "sentiment": "neutral", "url": "https://example.com/1", "published_at": "2026-09-18T00:00:00Z"}],
    )

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.detail["news"] == [
        {"headline": "トヨタ関連ニュース", "sentiment": "neutral", "url": "https://example.com/1", "published_at": "2026-09-18T00:00:00Z"}
    ]


def test_create_trend_keeps_raw_candles_when_news_fetch_fails(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    raw_candles = [
        {"datetime": "2026-09-18T09:00:00+09:00", "open": 99.0, "high": 101.0, "low": 98.0, "close": 100.0, "volume": 1000}
    ]
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: raw_candles)

    def raise_error(code):
        raise RuntimeError("yfinance news unreachable")

    monkeypatch.setattr(trend_service, "get_news", raise_error)

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.detail["raw_candles"] == raw_candles
    assert "news" not in trend.detail


def test_create_trend_keeps_raw_candles_when_sentiment_analysis_fails(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    raw_candles = [
        {"datetime": "2026-09-18T09:00:00+09:00", "open": 99.0, "high": 101.0, "low": 98.0, "close": 100.0, "volume": 1000}
    ]
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: raw_candles)
    monkeypatch.setattr(trend_service, "get_news", lambda code: [{"title": "x", "summary": "y", "published_at": "z", "url": "u"}])

    def raise_error(code, items):
        raise ValueError("Claude API returned invalid JSON")

    monkeypatch.setattr(trend_service, "summarize_and_analyze", raise_error)

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.detail["raw_candles"] == raw_candles
    assert "news" not in trend.detail


def test_build_detail_view_includes_news_from_stored_detail():
    stored_detail = {
        "raw_candles": [
            {"datetime": "2026-08-24T09:00:00+09:00", "open": 99.0, "high": 102.0, "low": 98.0, "close": 100.0, "volume": 1000}
        ],
        "news": [{"headline": "見出し", "sentiment": "positive", "url": "https://example.com/1", "published_at": "2026-08-24T00:00:00Z"}],
    }

    view = trend_service.build_detail_view(stored_detail, "1d", [])

    assert view["news"] == stored_detail["news"]


def test_build_detail_view_returns_empty_news_list_when_not_stored():
    stored_detail = {
        "raw_candles": [
            {"datetime": "2026-08-24T09:00:00+09:00", "open": 99.0, "high": 102.0, "low": 98.0, "close": 100.0, "volume": 1000}
        ],
    }

    view = trend_service.build_detail_view(stored_detail, "1d", [])

    assert view["news"] == []


def test_create_trend_does_not_overwrite_manually_set_name(db_session, monkeypatch):
    from app import trend_code_name_service

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "Toyota Motor Corp", "price": 2900.0}
    )
    trend_service.create_trend(db_session, "7203")
    trend_code_name_service.set_name(db_session, "7203", "トヨタ")
    db_session.commit()

    second = trend_service.create_trend(db_session, "7203")

    assert second.name == "トヨタ"


def test_create_trend_saves_quote_name_via_fill_names(db_session, monkeypatch):
    from app import trend_code_name_service

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "Toyota Motor Corp", "price": 2900.0}
    )

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.name == "Toyota Motor Corp"
    assert trend_code_name_service.get_names(db_session, ["7203"]) == {"7203": "Toyota Motor Corp"}


def test_create_trend_leaves_no_new_trend_row_when_fill_names_fails(db_session, monkeypatch):
    from app import models

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    first = trend_service.create_trend(db_session, "7203")

    def boom(db, names):
        raise RuntimeError("fill_names failed")

    monkeypatch.setattr(trend_service.trend_code_name_service, "fill_names", boom)

    with pytest.raises(RuntimeError):
        trend_service.create_trend(db_session, "7203")
    db_session.rollback()

    rows = db_session.query(models.Trend).filter(models.Trend.code == "7203").all()
    assert [(r.id, r.deleted_at) for r in rows] == [(first.id, None)]


def test_create_trend_restores_soft_deleted_trend_price(db_session, monkeypatch):
    from app import trend_price_service

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    trend_service.create_trend(db_session, "7203")
    trend_price_service.upsert_price(
        db_session, "7203", trend_group_id=None, buy_category=1, buy_price=2900.0, buy_quantity=100
    )
    trend_service.delete_trend(db_session, "7203")
    assert trend_price_service.get_active_price(db_session, "7203") is None

    recreated = trend_service.create_trend(db_session, "7203")

    assert recreated.buy_quantity == 100
    assert trend_price_service.get_active_price(db_session, "7203") is not None


def test_delete_trend_soft_deletes_trend_price(db_session, monkeypatch):
    from app import trend_price_service

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    trend_service.create_trend(db_session, "7203")
    trend_price_service.upsert_price(
        db_session, "7203", trend_group_id=None, buy_category=1, buy_price=2900.0, buy_quantity=100
    )

    trend_service.delete_trend(db_session, "7203")

    assert trend_price_service.get_active_price(db_session, "7203") is None
    assert trend_price_service.get_price_row(db_session, "7203") is not None


def test_list_watchlist_attaches_position_fields(db_session, monkeypatch):
    from app import trend_price_service

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    trend_service.create_trend(db_session, "7203")
    trend_price_service.upsert_price(
        db_session, "7203", trend_group_id=5, buy_category=1, buy_price=2900.0, buy_quantity=100
    )

    watchlist = trend_service.list_watchlist(db_session)

    assert watchlist[0].trend_group_id == 5
    assert watchlist[0].buy_category == 1
    assert float(watchlist[0].buy_price) == 2900.0
    assert watchlist[0].buy_quantity == 100


def test_list_watchlist_defaults_position_fields_when_no_price_row(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    trend_service.create_trend(db_session, "7203")

    watchlist = trend_service.list_watchlist(db_session)

    assert watchlist[0].trend_group_id is None
    assert watchlist[0].buy_category == 0
    assert watchlist[0].buy_price is None
    assert watchlist[0].buy_quantity is None


def test_update_name_updates_active_trend(db_session, monkeypatch):
    from app import trend_price_service

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    trend_service.create_trend(db_session, "7203")
    trend_price_service.upsert_price(
        db_session, "7203", trend_group_id=5, buy_category=1, buy_price=2900.0, buy_quantity=100
    )

    updated = trend_service.update_name(db_session, "7203", " トヨタ ")

    assert updated.name == "トヨタ"
    assert updated.trend_group_id == 5
    assert updated.buy_category == 1
    assert float(updated.buy_price) == 2900.0
    assert updated.buy_quantity == 100


def test_update_name_returns_none_when_not_found(db_session):
    assert trend_service.update_name(db_session, "9999", "x") is None


def test_refresh_trends_attaches_name_and_price_fields(db_session, monkeypatch):
    from app import trend_code_name_service, trend_price_service

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "Toyota Motor Corp", "price": 2900.0}
    )
    trend_service.create_trend(db_session, "7203")
    trend_code_name_service.set_name(db_session, "7203", "トヨタ")
    db_session.commit()

    trend_price_service.upsert_price(
        db_session, "7203", trend_group_id=None, buy_category=1, buy_price=2900.0, buy_quantity=100
    )

    row = trend_service.get_active_trend(db_session, "7203")
    row.created_at = now_jst() - timedelta(minutes=5)
    db_session.commit()

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "Toyota Motor Corp", "price": 2950.0}
    )
    updated = trend_service.refresh_trends(db_session, ["7203"], 1)

    assert len(updated) == 1
    assert updated[0].name == "トヨタ"
    assert updated[0].buy_category == 1
    assert float(updated[0].buy_price) == 2900.0
    assert updated[0].buy_quantity == 100


def test_list_watchlist_returns_empty_name_when_name_is_unset(db_session, monkeypatch):
    from sqlalchemy import update

    from app import models

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    trend_service.create_trend(db_session, "7203")
    db_session.execute(update(models.TrendCodeName).values(name=None))
    db_session.commit()

    watchlist = trend_service.list_watchlist(db_session)

    assert [t.code for t in watchlist] == ["7203"]
    assert watchlist[0].name == ""


def test_list_watchlist_returns_empty_name_when_no_code_name_row(db_session):
    from app import models

    db_session.add(
        models.Trend(code="7203", opinion="x", detail={}, price_at_fetch=2900.0)
    )
    db_session.commit()

    watchlist = trend_service.list_watchlist(db_session)

    assert watchlist[0].name == ""


def _daily_raw_candles(closes: list[float]) -> list[dict]:
    start = datetime(2026, 8, 1, 9, 0, 0)
    return [
        {
            "datetime": (start + timedelta(days=i)).strftime("%Y-%m-%dT%H:%M:%S+09:00"),
            "open": c,
            "high": c,
            "low": c,
            "close": c,
            "volume": 1000,
        }
        for i, c in enumerate(closes)
    ]


def _patch_fetch(monkeypatch, raw_candles):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "テスト", "price": 100.0}
    )
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: raw_candles)
    monkeypatch.setattr(trend_service, "get_industry_label", lambda code: "x")
    monkeypatch.setattr(trend_service, "get_price_history", lambda ticker: [])
    monkeypatch.setattr(trend_service, "get_news", lambda code: [])


def test_create_trend_stores_the_daily_trend(db_session, monkeypatch):
    _patch_fetch(monkeypatch, _daily_raw_candles([100.0 + i for i in range(40)]))

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.type_daily_trend == 1


def test_create_trend_leaves_daily_trend_zero_when_fewer_than_26_days(db_session, monkeypatch):
    _patch_fetch(monkeypatch, _daily_raw_candles([100.0 + i for i in range(10)]))

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.type_daily_trend == 0


def test_create_trend_leaves_daily_trend_zero_when_history_is_unavailable(db_session, monkeypatch):
    _patch_fetch(monkeypatch, [])

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.type_daily_trend == 0


def test_refresh_recomputes_the_daily_trend(db_session, monkeypatch):
    _patch_fetch(monkeypatch, _daily_raw_candles([100.0 + i for i in range(40)]))
    original = trend_service.create_trend(db_session, "7203")
    original.created_at = now_jst() - timedelta(minutes=10)
    db_session.commit()

    falling = list(reversed([100.0 + i for i in range(40)]))
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: _daily_raw_candles(falling))
    updated = trend_service.refresh_trends(db_session, ["7203"], 5)

    assert updated[0].type_daily_trend == 2


def test_generate_perspectives_for_returns_none_without_raw_candles(db_session, monkeypatch):
    _patch_fetch(monkeypatch, [])
    trend = trend_service.create_trend(db_session, "7203")

    assert trend_service.generate_perspectives_for(trend) is None


def test_generate_perspectives_for_passes_the_daily_candles_and_the_trend(db_session, monkeypatch):
    _patch_fetch(monkeypatch, _daily_raw_candles([100.0 + i for i in range(40)]))
    trend = trend_service.create_trend(db_session, "7203")
    seen = {}

    def spy(code, candles, trend_value):
        seen.update(code=code, bars=len(candles), trend=trend_value)
        return {"buy": "a1", "sell": "b2", "keep": "c3"}

    monkeypatch.setattr(trend_service, "build_perspectives", spy)

    result = trend_service.generate_perspectives_for(trend)

    assert seen == {"code": "7203", "bars": 40, "trend": "up"}
    assert result == {"buy": "a1", "sell": "b2", "keep": "c3"}


def test_create_trend_attaches_the_trend_name(db_session, monkeypatch):
    _patch_fetch(monkeypatch, _daily_raw_candles([100.0 + i for i in range(40)]))

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.type_daily_trend_name == "up"


def test_list_watchlist_attaches_the_trend_name_from_the_master(db_session, monkeypatch):
    _patch_fetch(monkeypatch, _daily_raw_candles([100.0 + i for i in range(40)]))
    trend_service.create_trend(db_session, "7203")

    listed = trend_service.list_watchlist(db_session)

    assert listed[0].type_daily_trend_name == "up"


def test_list_watchlist_names_a_trend_without_a_judgement_none(db_session, monkeypatch):
    _patch_fetch(monkeypatch, [])
    trend_service.create_trend(db_session, "7203")

    listed = trend_service.list_watchlist(db_session)

    assert listed[0].type_daily_trend == 0
    assert listed[0].type_daily_trend_name == "none"


def test_refresh_attaches_the_trend_name(db_session, monkeypatch):
    _patch_fetch(monkeypatch, _daily_raw_candles([100.0 + i for i in range(40)]))
    original = trend_service.create_trend(db_session, "7203")
    original.created_at = now_jst() - timedelta(minutes=10)
    db_session.commit()
    falling = list(reversed([100.0 + i for i in range(40)]))
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: _daily_raw_candles(falling))

    updated = trend_service.refresh_trends(db_session, ["7203"], 5)

    assert updated[0].type_daily_trend_name == "down"


def test_list_watchlist_attaches_the_sale_price_target(db_session, monkeypatch):
    from app import trend_price_service

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    trend_service.create_trend(db_session, "7203")
    trend_price_service.upsert_price(
        db_session, "7203", trend_group_id=None, buy_category=1, buy_price=2900.0,
        buy_quantity=100, sale_price_target=3300.5,
    )

    listed = trend_service.list_watchlist(db_session)

    assert listed[0].sale_price_target == 3300.5


def test_list_watchlist_sale_price_target_is_none_without_a_price_row(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    trend_service.create_trend(db_session, "7203")

    listed = trend_service.list_watchlist(db_session)

    assert listed[0].sale_price_target is None

