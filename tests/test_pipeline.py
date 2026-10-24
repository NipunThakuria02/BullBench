import numpy as np
import pandas as pd
import pytest
from nse_forecast.config import ASSETS, TICKERS
from nse_forecast.features import make_features, feature_columns
from nse_forecast.evaluate import folds, evaluate, metrics, summarize
from nse_forecast.report import write_report
from nse_forecast.data import load, validate


@pytest.fixture
def histories():
    rng = np.random.default_rng(123)
    dates = pd.bdate_range('2021-10-01', '2023-10-10')
    return {symbol: pd.DataFrame({'Close': 100 * np.exp(np.cumsum(rng.normal(0.0002, 0.01, len(dates))))}, index=dates) for symbol in TICKERS}


@pytest.mark.parametrize('ticker', ASSETS)
def test_future_prices_cannot_change_predictors(histories, ticker):
    before = make_features(histories, ticker)
    cutoff = pd.Timestamp('2023-03-01')
    altered = {k: v.copy() for k, v in histories.items()}
    for values in altered.values():
        values.loc[cutoff:, 'Close'] *= 2
    after = make_features(altered, ticker)
    columns = feature_columns(before)
    pd.testing.assert_frame_equal(before.loc[:cutoff, columns], after.loc[:cutoff, columns])
    assert before.loc[cutoff, 'target'] != after.loc[cutoff, 'target']


def test_returns_price_conversion_and_lags(histories):
    ticker = ASSETS[0]
    frame = make_features(histories, ticker)
    close = histories[ticker].Close
    expected = close.pct_change(fill_method=None)
    np.testing.assert_allclose(frame.target, expected.loc[frame.index])
    np.testing.assert_allclose(frame.return_lag_1, expected.shift(1).loc[frame.index])
    np.testing.assert_allclose(frame.origin_close * (1 + frame.target), frame.actual_close)
    sp = histories['^GSPC'].Close.pct_change(fill_method=None).shift(2)
    np.testing.assert_allclose(frame.sp500_return, sp.loc[frame.index])


def test_expanding_quarterly_folds():
    dates = pd.bdate_range('2021-10-01', '2026-10-16')
    result = list(folds(dates))
    assert result[0][0] == pd.Timestamp('2023-10-01')
    assert len(result) == 13
    seen = []
    previous_train = set()
    for boundary, train, test in result:
        assert train.max() < test.min()
        assert previous_train.issubset(set(train))
        assert (test < boundary + pd.DateOffset(months=3)).all()
        seen.extend(test)
        previous_train = set(train)
    assert len(seen) == len(set(seen))
    assert set(seen) == set(dates[dates >= '2023-10-01'])


def test_naive_metrics_and_skill():
    block = pd.DataFrame({'actual_return': [0.1, -0.1], 'predicted_return': [0., 0.]})
    measured = metrics(block)
    assert measured['rmse'] == pytest.approx(0.1)
    assert measured['directional_accuracy'] == .5
    assert measured['direction_coverage'] == 0
    baseline = block.assign(model='Naive')
    perfect = block.assign(model='Perfect', predicted_return=block.actual_return)
    result = summarize(pd.concat([baseline, perfect]), ['model']).set_index('model')
    assert result.loc['Perfect', 'rmse_skill'] == 1
    assert result.loc['Naive', 'rmse_skill'] == 0


def test_all_models_end_to_end_on_synthetic_data(histories, tmp_path):
    # Synthetic input is an integration fixture, never saved as market history.
    predictions = evaluate(histories, ASSETS)
    assert set(predictions.model) == {'Naive', 'Ridge', 'ARIMA', 'RandomForest', 'XGBoost'}
    assert len(predictions) == 210  # Seven sessions x six assets x five models.
    assert np.isfinite(predictions.predicted_return).all()
    assert (predictions.date >= pd.Timestamp('2023-10-01')).all()
    np.testing.assert_allclose(predictions.predicted_price, predictions.origin_close * (1 + predictions.predicted_return))
    for ticker in ASSETS:
        frame = make_features(histories, ticker)
        threshold = frame.loc[frame.index < '2023-10-01', 'market_vol'].quantile(.75)
        np.testing.assert_allclose(predictions.loc[predictions.stock == ticker, 'regime_threshold'], threshold)
    comparison = write_report(predictions, tmp_path)
    assert len(comparison) == 5
    assert (tmp_path / 'report.html').exists()
    assert len(pd.read_csv(tmp_path / 'predictions.csv')) == 210
    assert (tmp_path / 'run.json').exists()


def test_missing_cache_fails_without_downloading(tmp_path):
    with pytest.raises(FileNotFoundError, match='download'):
        load(tmp_path)


def test_incomplete_history_is_rejected(histories):
    with pytest.raises(ValueError, match='fixed date range'):
        validate(histories[ASSETS[0]], ASSETS[0])


def test_arima_never_observes_a_target_before_predicting(histories):
    from nse_forecast.models import predict_models
    frame = make_features(histories, ASSETS[0])
    train, test = frame.iloc[:-3], frame.iloc[-3:].copy()
    before = predict_models(train, test, feature_columns(frame))
    test.iloc[0, test.columns.get_loc("target")] += .2
    after = predict_models(train, test, feature_columns(frame))
    assert before["ARIMA"][0] == after["ARIMA"][0]
    assert before["ARIMA"][1] != after["ARIMA"][1]
    for model in ("Naive", "Ridge", "RandomForest", "XGBoost"):
        # Parallel tree reductions can differ by machine rounding.
        np.testing.assert_allclose(before[model], after[model], rtol=1e-12, atol=1e-15)


def test_cache_checksum_and_full_range_round_trip(tmp_path):
    import hashlib
    import json
    from nse_forecast.config import START, END, cache_path
    from nse_forecast.data import read_cached
    ticker = ASSETS[0]
    dates = pd.bdate_range(START, END)
    frame = pd.DataFrame({"Close": np.linspace(100, 200, len(dates))}, index=dates)
    path = cache_path(tmp_path, ticker)
    frame.to_csv(path, index_label="Date")
    path.with_suffix(".json").write_text(json.dumps({"ticker": ticker, "source": "yfinance", "auto_adjust": True, "start": START, "end_inclusive": END, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}))
    loaded = read_cached(tmp_path, ticker)
    assert len(loaded) == len(frame)
    path.write_text(path.read_text().replace("100.0", "101.0", 1))
    with pytest.raises(ValueError, match="checksum"):
        read_cached(tmp_path, ticker)


def test_download_continues_after_short_histories_and_reuses_good_caches(tmp_path, monkeypatch):
    import yfinance as yf
    import nse_forecast.data as source
    from nse_forecast.config import START, END, cache_path
    dates = pd.bdate_range(START, END)
    full = pd.DataFrame({'Close': np.linspace(100, 200, len(dates))}, index=dates)
    symbols = ('HDFCBANK.NS', '^CNXENERGY', '^CNXMETAL', '^INDIAVIX')
    calls = []

    def fake_download(symbol, **kwargs):
        calls.append(symbol)
        assert kwargs['auto_adjust'] is True
        assert kwargs['end'] == '2026-10-17'
        return full.iloc[-2:].copy() if symbol in ('^CNXENERGY', '^CNXMETAL') else full.copy()

    monkeypatch.setattr(source, 'TICKERS', symbols)
    monkeypatch.setattr(yf, 'download', fake_download)
    monkeypatch.setattr(yf, 'set_tz_cache_location', lambda path: None)
    with pytest.raises(ValueError, match='Download incomplete') as failure:
        source.download(tmp_path)
    assert calls == list(symbols)
    assert '^CNXENERGY' in str(failure.value) and '^CNXMETAL' in str(failure.value)
    assert 'only 2 daily observations' in str(failure.value)
    assert '2026-10-15 through 2026-10-16' in str(failure.value)
    good = {symbol: cache_path(tmp_path, symbol).read_bytes() for symbol in (symbols[0], symbols[-1])}
    assert not cache_path(tmp_path, '^CNXENERGY').exists()
    assert not cache_path(tmp_path, '^CNXMETAL').exists()
    calls.clear()
    with pytest.raises(ValueError, match='Download incomplete'):
        source.download(tmp_path)
    assert calls == ['^CNXENERGY', '^CNXMETAL']
    assert all(cache_path(tmp_path, symbol).read_bytes() == content for symbol, content in good.items())
