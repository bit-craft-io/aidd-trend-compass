from unittest.mock import MagicMock, patch

import pytest
import requests

from app import jquants_client


def _mock_response(json_body, status_code=200):
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = json_body
    return response


def _bar(date, close=1234.0):
    return {"Date": date, "O": 1200.0, "H": 1250.0, "L": 1190.0, "C": close, "Vo": 254000}


@patch("app.jquants_client.requests.get")
def test_list_prime_stocks_filters_to_prime_market(mock_get, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "test-key")
    monkeypatch.setattr(jquants_client, "JQUANTS_MAX_STOCKS", 10)
    mock_get.return_value = _mock_response(
        {
            "data": [
                {"Code": "72030", "CoName": "トヨタ自動車", "MktNm": "プライム"},
                {"Code": "99990", "CoName": "グロース銘柄", "MktNm": "グロース"},
            ]
        }
    )

    result = jquants_client.list_prime_stocks()

    assert result == [{"code": "7203", "name": "トヨタ自動車"}]
    called_headers = mock_get.call_args.kwargs["headers"]
    assert called_headers["x-api-key"] == "test-key"
    assert "/equities/master" in mock_get.call_args.args[0]


@patch("app.jquants_client.requests.get")
def test_list_prime_stocks_normalizes_five_digit_codes(mock_get, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_MAX_STOCKS", 10)
    mock_get.return_value = _mock_response(
        {
            "data": [
                {"Code": "72030", "CoName": "普通株", "MktNm": "プライム"},
                {"Code": "72031", "CoName": "優先株など", "MktNm": "プライム"},
                {"Code": "6758", "CoName": "4桁のまま", "MktNm": "プライム"},
            ]
        }
    )

    result = jquants_client.list_prime_stocks()

    assert result == [
        {"code": "7203", "name": "普通株"},
        {"code": "6758", "name": "4桁のまま"},
    ]


@patch("app.jquants_client.requests.get")
def test_list_prime_stocks_respects_max_stocks(mock_get, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "test-key")
    monkeypatch.setattr(jquants_client, "JQUANTS_MAX_STOCKS", 1)
    mock_get.return_value = _mock_response(
        {
            "data": [
                {"Code": "72030", "CoName": "トヨタ自動車", "MktNm": "プライム"},
                {"Code": "67580", "CoName": "ソニーグループ", "MktNm": "プライム"},
            ]
        }
    )

    result = jquants_client.list_prime_stocks()

    assert len(result) == 1


@patch("app.jquants_client.requests.get")
def test_list_prime_stocks_passes_timeout(mock_get, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "test-key")
    mock_get.return_value = _mock_response({"data": []})

    jquants_client.list_prime_stocks()

    assert mock_get.call_args.kwargs["timeout"] == 30


@patch("app.jquants_client.requests.get")
def test_list_prime_stocks_non_200_raises(mock_get, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "test-key")
    mock_get.return_value = _mock_response({}, status_code=429)

    with pytest.raises(jquants_client.JQuantsError):
        jquants_client.list_prime_stocks()


@patch("app.jquants_client.requests.get")
def test_list_prime_stocks_wraps_connection_error(mock_get, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "test-key")
    mock_get.side_effect = requests.ConnectionError("boom")

    with pytest.raises(jquants_client.JQuantsError):
        jquants_client.list_prime_stocks()


@patch("app.jquants_client.requests.get")
def test_list_prime_stocks_wraps_invalid_json(mock_get, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "test-key")
    response = _mock_response({})
    response.json.side_effect = ValueError("not json")
    mock_get.return_value = response

    with pytest.raises(jquants_client.JQuantsError):
        jquants_client.list_prime_stocks()


@patch("app.jquants_client.requests.get")
def test_list_prime_stocks_wraps_malformed_row(mock_get, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "test-key")
    monkeypatch.setattr(jquants_client, "JQUANTS_MAX_STOCKS", 10)
    mock_get.return_value = _mock_response(
        {"data": [{"Code": "72030", "MktNm": "プライム"}]}  # CoName missing
    )

    with pytest.raises(jquants_client.JQuantsError):
        jquants_client.list_prime_stocks()


@patch("app.jquants_client.requests.get")
def test_get_daily_bars_maps_fields(mock_get, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "test-key")
    mock_get.return_value = _mock_response(
        {
            "data": [
                {"Date": "2026-09-28", "O": 1200.0, "H": 1250.0, "L": 1190.0, "C": 1234.0, "Vo": 254000}
            ]
        }
    )

    result = jquants_client.get_daily_bars("7203", days=90)

    assert result == [
        {"date": "2026-09-28", "o": 1200.0, "h": 1250.0, "l": 1190.0, "c": 1234.0, "v": 254000}
    ]
    called_url = mock_get.call_args.args[0]
    assert "/equities/bars/daily" in called_url
    assert mock_get.call_args.kwargs["headers"]["x-api-key"] == "test-key"
    assert mock_get.call_args.kwargs["params"] == {"code": "7203"}
    assert mock_get.call_args.kwargs["timeout"] == 30


@patch("app.jquants_client.requests.get")
def test_get_daily_bars_follows_pagination(mock_get, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "test-key")
    mock_get.side_effect = [
        _mock_response({"data": [_bar("2026-09-25")], "pagination_key": "next-page"}),
        _mock_response({"data": [_bar("2026-09-28")]}),
    ]

    result = jquants_client.get_daily_bars("7203", days=90)

    assert [row["date"] for row in result] == ["2026-09-25", "2026-09-28"]
    assert mock_get.call_count == 2
    assert mock_get.call_args_list[0].kwargs["params"] == {"code": "7203"}
    assert mock_get.call_args_list[1].kwargs["params"] == {
        "code": "7203",
        "pagination_key": "next-page",
    }


@patch("app.jquants_client.requests.get")
def test_get_daily_bars_keeps_only_most_recent_days(mock_get, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "test-key")
    dates = ["2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-28"]
    mock_get.return_value = _mock_response({"data": [_bar(d) for d in dates]})

    result = jquants_client.get_daily_bars("7203", days=3)

    assert [row["date"] for row in result] == ["2026-09-24", "2026-09-25", "2026-09-28"]


@patch("app.jquants_client.requests.get")
def test_get_daily_bars_non_200_raises(mock_get, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "test-key")
    mock_get.return_value = _mock_response({}, status_code=500)

    with pytest.raises(jquants_client.JQuantsError):
        jquants_client.get_daily_bars("7203")


@patch("app.jquants_client.requests.get")
def test_get_daily_bars_wraps_connection_error(mock_get, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "test-key")
    mock_get.side_effect = requests.ConnectionError("boom")

    with pytest.raises(jquants_client.JQuantsError):
        jquants_client.get_daily_bars("7203")


@patch("app.jquants_client.requests.get")
def test_get_daily_bars_wraps_malformed_row(mock_get, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "test-key")
    row = _bar("2026-09-28")
    del row["O"]
    mock_get.return_value = _mock_response({"data": [row]})

    with pytest.raises(jquants_client.JQuantsError):
        jquants_client.get_daily_bars("7203")


@patch("app.jquants_client.requests.get")
def test_error_message_does_not_leak_api_key(mock_get, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "secret-key-value")
    mock_get.return_value = _mock_response({}, status_code=403)

    with pytest.raises(jquants_client.JQuantsError) as exc_info:
        jquants_client.get_daily_bars("7203")

    assert "secret-key-value" not in str(exc_info.value)


@patch("app.jquants_client.time.sleep")
def test_pace_requests_sleeps_window_divided_by_limit(mock_sleep, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_RATE_LIMIT_PER_64S", 5)

    jquants_client.pace_requests()

    mock_sleep.assert_called_once_with(64 / 5)


@pytest.mark.parametrize("limit", [0, -1])
@patch("app.jquants_client.time.sleep")
def test_pace_requests_noop_when_limit_not_positive(mock_sleep, limit, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_RATE_LIMIT_PER_64S", limit)

    jquants_client.pace_requests()

    mock_sleep.assert_not_called()
