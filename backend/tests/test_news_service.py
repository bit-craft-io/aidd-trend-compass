import json
from unittest.mock import MagicMock

import pytest

from app import news_service

NEWS_ITEMS = [
    {"title": "Toyota raises forecast", "summary": "Positive earnings news.", "published_at": "2026-09-18T03:47:37Z", "url": "https://example.com/1"},
    {"title": "Sector stocks fall on rate fears", "summary": "Negative market news.", "published_at": "2026-09-17T08:38:43Z", "url": "https://example.com/2"},
]


def _fake_anthropic_client(response_text):
    client = MagicMock()
    message = MagicMock()
    message.content = [MagicMock(text=response_text)]
    client.messages.create.return_value = message
    return client


def test_summarize_and_analyze_returns_empty_list_for_no_news():
    assert news_service.summarize_and_analyze("7203", []) == []


def test_summarize_and_analyze_parses_valid_json_response(monkeypatch):
    response_text = json.dumps(
        [
            {"headline_ja": "トヨタ、業績見通しを上方修正", "sentiment": "positive"},
            {"headline_ja": "金利懸念でセクター株が下落", "sentiment": "negative"},
        ]
    )
    fake_client = _fake_anthropic_client(response_text)
    monkeypatch.setattr(news_service.anthropic, "Anthropic", lambda **kwargs: fake_client)

    result = news_service.summarize_and_analyze("7203", NEWS_ITEMS)

    assert result == [
        {
            "headline": "トヨタ、業績見通しを上方修正",
            "sentiment": "positive",
            "url": "https://example.com/1",
            "published_at": "2026-09-18T03:47:37Z",
        },
        {
            "headline": "金利懸念でセクター株が下落",
            "sentiment": "negative",
            "url": "https://example.com/2",
            "published_at": "2026-09-17T08:38:43Z",
        },
    ]


def test_summarize_and_analyze_raises_when_count_mismatches(monkeypatch):
    response_text = json.dumps([{"headline_ja": "見出しのみ1件", "sentiment": "neutral"}])
    fake_client = _fake_anthropic_client(response_text)
    monkeypatch.setattr(news_service.anthropic, "Anthropic", lambda **kwargs: fake_client)

    with pytest.raises(ValueError):
        news_service.summarize_and_analyze("7203", NEWS_ITEMS)


def test_summarize_and_analyze_falls_back_to_neutral_for_unknown_sentiment(monkeypatch):
    response_text = json.dumps(
        [
            {"headline_ja": "見出し1", "sentiment": "unknown_value"},
            {"headline_ja": "見出し2", "sentiment": "positive"},
        ]
    )
    fake_client = _fake_anthropic_client(response_text)
    monkeypatch.setattr(news_service.anthropic, "Anthropic", lambda **kwargs: fake_client)

    result = news_service.summarize_and_analyze("7203", NEWS_ITEMS)

    assert result[0]["sentiment"] == "neutral"
    assert result[1]["sentiment"] == "positive"


def test_summarize_and_analyze_raises_on_invalid_json(monkeypatch):
    fake_client = _fake_anthropic_client("this is not json")
    monkeypatch.setattr(news_service.anthropic, "Anthropic", lambda **kwargs: fake_client)

    with pytest.raises(ValueError):
        news_service.summarize_and_analyze("7203", NEWS_ITEMS)


def test_summarize_and_analyze_raises_when_response_is_not_a_list(monkeypatch):
    response_text = json.dumps({"error": "something went wrong"})
    fake_client = _fake_anthropic_client(response_text)
    monkeypatch.setattr(news_service.anthropic, "Anthropic", lambda **kwargs: fake_client)

    with pytest.raises(ValueError):
        news_service.summarize_and_analyze("7203", NEWS_ITEMS)


def test_summarize_and_analyze_raises_when_element_is_not_a_dict(monkeypatch):
    response_text = json.dumps(["not a dict", "also not a dict"])
    fake_client = _fake_anthropic_client(response_text)
    monkeypatch.setattr(news_service.anthropic, "Anthropic", lambda **kwargs: fake_client)

    with pytest.raises(ValueError):
        news_service.summarize_and_analyze("7203", NEWS_ITEMS)
