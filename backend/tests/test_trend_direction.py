import pytest

from app import trend_direction


@pytest.fixture(autouse=True)
def _clear_trend_settings(monkeypatch):
    for name in ("TREND_SHORT_PERIOD", "TREND_LONG_PERIOD", "TREND_FLAT_BAND_PCT"):
        monkeypatch.delenv(name, raising=False)


def _rising(n: int = 40) -> list[float]:
    return [100.0 + i for i in range(n)]


def test_returns_none_when_fewer_than_26_closes():
    assert trend_direction.classify_trend(_rising(25)) is None


def test_returns_none_when_the_long_average_is_zero():
    assert trend_direction.classify_trend([0.0] * 30) is None


def test_up_when_short_is_above_long_and_rising():
    assert trend_direction.classify_trend(_rising()) == "up"


def test_down_when_short_is_below_long_and_falling():
    assert trend_direction.classify_trend(list(reversed(_rising()))) == "down"


def test_flat_when_prices_are_constant():
    assert trend_direction.classify_trend([100.0] * 40) == "flat"


def test_flat_when_short_is_above_long_but_turning_down():
    closes = [float(i) for i in range(1, 31)] + [29.0, 28.0, 27.0]

    assert trend_direction.classify_trend(closes) == "flat"


def test_a_small_gap_is_flat_even_when_short_is_rising():
    # 短期平均 100.2 > 長期平均 100.04、短期は上向きだが、差は0.16%で閾値(1.0%)以内。
    closes = [100.0] * 21 + [100.0, 100.0, 100.0, 100.0, 101.0]

    assert trend_direction.classify_trend(closes) == "flat"


def test_the_band_can_be_widened_to_turn_up_into_flat():
    assert trend_direction.classify_trend(_rising(), flat_band_pct=10.0) == "flat"


def test_a_gap_exactly_on_the_band_is_flat():
    closes = _rising()
    short_now = sum(closes[-5:]) / 5
    long_now = sum(closes[-25:]) / 25
    gap_pct = (short_now - long_now) / long_now * 100

    assert trend_direction.classify_trend(closes, flat_band_pct=gap_pct) == "flat"


def test_classify_candles_reads_the_close_key():
    candles = [{"close": c} for c in _rising()]

    assert trend_direction.classify_candles(candles) == "up"


def test_classify_history_reads_the_c_key():
    history = [{"c": c} for c in _rising()]

    assert trend_direction.classify_history(history) == "up"


def test_classify_history_returns_none_for_empty_history():
    assert trend_direction.classify_history([]) is None


def test_settings_default_to_5_25_and_1_percent():
    assert trend_direction.settings() == (5, 25, 1.0)


def test_settings_are_read_from_the_environment(monkeypatch):
    monkeypatch.setenv("TREND_SHORT_PERIOD", "3")
    monkeypatch.setenv("TREND_LONG_PERIOD", "10")
    monkeypatch.setenv("TREND_FLAT_BAND_PCT", "2.5")

    assert trend_direction.settings() == (3, 10, 2.5)


def test_the_band_comes_from_the_environment(monkeypatch):
    monkeypatch.setenv("TREND_FLAT_BAND_PCT", "10")

    assert trend_direction.classify_trend(_rising()) == "flat"


@pytest.mark.parametrize(
    "env",
    [
        {"TREND_SHORT_PERIOD": "abc"},
        {"TREND_LONG_PERIOD": "0"},
        {"TREND_FLAT_BAND_PCT": "-1"},
        {"TREND_SHORT_PERIOD": "10", "TREND_LONG_PERIOD": "10"},
    ],
)
def test_invalid_settings_raise_value_error(monkeypatch, env):
    for name, value in env.items():
        monkeypatch.setenv(name, value)

    with pytest.raises(ValueError):
        trend_direction.settings()
