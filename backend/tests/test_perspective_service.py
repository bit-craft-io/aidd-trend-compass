import json
from unittest.mock import MagicMock

import pytest

from app import perspective_service


def _candles(closes):
    return [
        {"time": f"2026-08-{(i % 28) + 1:02d}", "open": c, "high": c, "low": c, "close": c, "volume": 1000 + i}
        for i, c in enumerate(closes)
    ]


RISING = _candles([100.0 + i for i in range(40)])


def _fake_client(response_text):
    client = MagicMock()
    message = MagicMock()
    message.content = [MagicMock(text=response_text)]
    client.messages.create.return_value = message
    return client


def _metrics():
    return perspective_service.build_metrics(RISING, "up")


def _valid_output(metrics):
    close = metrics["終値"]
    return {
        "buy": f"終値は{close}で、上昇の途中と読めます。",
        "sell": f"終値は{close}で、高値圏にあるとも読めます。",
        "keep": f"終値は{close}で、様子を見る見方もあります。",
    }


def test_build_metrics_returns_none_when_fewer_than_26_days():
    assert perspective_service.build_metrics(_candles([100.0] * 25), "flat") is None


def test_build_metrics_formats_numbers_without_thousands_separators():
    metrics = perspective_service.build_metrics(_candles([1000.0 + i * 10 for i in range(40)]), "up")

    assert metrics["終値"] == "1390"
    assert "," not in "".join(metrics.values())


def test_build_metrics_contains_the_trend_and_the_main_indicators():
    metrics = _metrics()

    assert metrics["日足のトレンド"] == "上昇"
    for label in ("終値", "5日移動平均", "25日移動平均", "RSI(14日)", "取得期間の高値", "取得期間の安値"):
        assert label in metrics


def test_build_metrics_has_no_volume_metric():
    metrics = _metrics()

    assert not any("出来高" in key for key in metrics)


def test_build_metrics_says_unknown_when_the_trend_is_none():
    metrics = perspective_service.build_metrics(RISING, None)

    assert metrics["日足のトレンド"] == "判定できない"


def test_validate_accepts_text_that_only_uses_the_given_numbers():
    metrics = _metrics()

    result = perspective_service.validate_perspectives(_valid_output(metrics), metrics)

    assert set(result) == {"buy", "sell", "keep"}


def test_validate_accepts_the_period_numbers_used_in_the_labels():
    metrics = _metrics()
    output = _valid_output(metrics)
    output["buy"] = f"終値{metrics['終値']}は、25日移動平均{metrics['25日移動平均']}を上回っていると読めます。"

    perspective_service.validate_perspectives(output, metrics)


def test_validate_rejects_a_number_that_was_not_given():
    metrics = _metrics()
    output = _valid_output(metrics)
    output["sell"] = "終値は99999で、高値圏と読めます。"

    with pytest.raises(ValueError):
        perspective_service.validate_perspectives(output, metrics)


def test_validate_rejects_text_without_any_number():
    metrics = _metrics()
    output = _valid_output(metrics)
    output["keep"] = "様子を見る見方もあります。"

    with pytest.raises(ValueError):
        perspective_service.validate_perspectives(output, metrics)


@pytest.mark.parametrize("word", ["必ず", "絶対", "確実", "間違いない", "べきです", "しましょう", "してください"])
def test_validate_rejects_assertive_wording(word):
    metrics = _metrics()
    output = _valid_output(metrics)
    output["buy"] = f"終値は{metrics['終値']}で、{word}。"

    with pytest.raises(ValueError):
        perspective_service.validate_perspectives(output, metrics)


@pytest.mark.parametrize("word", ["決算", "業績", "材料", "ニュース", "配当", "増益", "減益", "報道"])
def test_validate_rejects_topics_that_are_not_in_the_given_data(word):
    metrics = _metrics()
    output = _valid_output(metrics)
    output["sell"] = f"終値は{metrics['終値']}で、{word}の影響とも読めます。"

    with pytest.raises(ValueError):
        perspective_service.validate_perspectives(output, metrics)


def test_validate_rejects_a_missing_key():
    metrics = _metrics()
    output = _valid_output(metrics)
    del output["keep"]

    with pytest.raises(ValueError):
        perspective_service.validate_perspectives(output, metrics)


def test_validate_rejects_a_non_object():
    with pytest.raises(ValueError):
        perspective_service.validate_perspectives(["buy"], _metrics())


def test_generate_parses_the_json_response(monkeypatch):
    metrics = _metrics()
    fake = _fake_client(json.dumps(_valid_output(metrics), ensure_ascii=False))
    monkeypatch.setattr(perspective_service.anthropic, "Anthropic", lambda **kwargs: fake)

    result = perspective_service.generate_perspectives("7203", metrics)

    assert result == _valid_output(metrics)


def test_generate_accepts_a_json_response_wrapped_in_a_code_fence(monkeypatch):
    metrics = _metrics()
    text = "```json\n" + json.dumps(_valid_output(metrics), ensure_ascii=False) + "\n```"
    fake = _fake_client(text)
    monkeypatch.setattr(perspective_service.anthropic, "Anthropic", lambda **kwargs: fake)

    assert perspective_service.generate_perspectives("7203", metrics) == _valid_output(metrics)


def test_generate_raises_when_the_response_is_not_json(monkeypatch):
    fake = _fake_client("これはJSONではありません")
    monkeypatch.setattr(perspective_service.anthropic, "Anthropic", lambda **kwargs: fake)

    with pytest.raises(ValueError):
        perspective_service.generate_perspectives("7203", _metrics())


def test_generate_puts_every_metric_into_the_prompt(monkeypatch):
    metrics = _metrics()
    fake = _fake_client(json.dumps(_valid_output(metrics), ensure_ascii=False))
    monkeypatch.setattr(perspective_service.anthropic, "Anthropic", lambda **kwargs: fake)

    perspective_service.generate_perspectives("7203", metrics)

    prompt = fake.messages.create.call_args.kwargs["messages"][0]["content"]
    for label, value in metrics.items():
        assert f"{label}: {value}" in prompt


def test_build_perspectives_does_not_call_claude_when_data_is_short(monkeypatch):
    called = []
    monkeypatch.setattr(perspective_service, "generate_perspectives", lambda *a, **k: called.append(1))

    assert perspective_service.build_perspectives("7203", _candles([100.0] * 10), "flat") is None
    assert called == []
