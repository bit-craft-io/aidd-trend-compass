import pytest

from app import market_analysis_service


def test_relative_strength_5d_positive_when_stock_outperforms():
    stock = [{"close": v} for v in [100.0, 102.0, 104.0, 108.0, 110.0, 112.0]]
    index = [{"close": v} for v in [200.0, 201.0, 202.0, 203.0, 204.0, 200.0]]

    result = market_analysis_service._relative_strength_5d(stock, index)

    stock_change = (112.0 - 102.0) / 102.0 * 100
    index_change = (200.0 - 201.0) / 201.0 * 100
    assert result == pytest.approx(round(stock_change - index_change, 1))


def test_relative_strength_5d_returns_zero_when_insufficient_data():
    result = market_analysis_service._relative_strength_5d(
        [{"close": 100.0}], [{"close": 200.0}]
    )

    assert result == 0.0


def test_correlation_20d_perfect_positive():
    stock = [{"close": float(v)} for v in range(1, 21)]
    other = [{"close": float(v) * 2} for v in range(1, 21)]

    result = market_analysis_service._correlation_20d(stock, other)

    assert result == pytest.approx(1.0)


def test_correlation_20d_perfect_negative():
    stock = [{"close": float(v)} for v in range(1, 21)]
    other = [{"close": float(-v)} for v in range(1, 21)]

    result = market_analysis_service._correlation_20d(stock, other)

    assert result == pytest.approx(-1.0)


def test_correlation_20d_returns_zero_when_insufficient_data():
    result = market_analysis_service._correlation_20d(
        [{"close": 100.0}], [{"close": 200.0}]
    )

    assert result == 0.0


def test_build_market_analysis_detail_assembles_all_fields():
    stock_candles = [{"close": float(v)} for v in range(1, 21)]
    index_candles = [{"close": float(v) * 2} for v in range(1, 21)]
    us10y_candles = [{"close": float(v)} for v in range(1, 21)]
    usdjpy_candles = [{"close": float(-v)} for v in range(1, 21)]

    detail = market_analysis_service.build_market_analysis_detail(
        stock_candles, index_candles, us10y_candles, usdjpy_candles, "Auto Manufacturers"
    )

    assert detail["sector_label"] == "Auto Manufacturers"
    assert detail["relative_strength_5d_pt"] == 0.0
    assert detail["macro_correlation"]["us10y"] == pytest.approx(1.0)
    assert detail["macro_correlation"]["usdjpy"] == pytest.approx(-1.0)


def test_build_market_analysis_detail_handles_missing_macro_series():
    stock_candles = [{"close": float(v)} for v in range(1, 21)]

    detail = market_analysis_service.build_market_analysis_detail(
        stock_candles, [], [], [], ""
    )

    assert detail["sector_label"] == ""
    assert detail["macro_correlation"]["us10y"] == 0.0
    assert detail["macro_correlation"]["usdjpy"] == 0.0
