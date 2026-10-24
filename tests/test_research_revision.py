import hashlib
import json
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
from nse_forecast.audit import audit_data
from nse_forecast.config import ASSETS, TICKERS, MODELS
from nse_forecast.features import align_context, availability
from nse_forecast.diagnostics import uncertainty, complete_quarters, directional_reference
from nse_forecast.report import write_report, render_report


def predictions(n=80):
    rows = []
    for i, day in enumerate(pd.bdate_range('2024-01-01', periods=n)):
        actual = .01 if i % 2 else -.01
        for stock in ASSETS:
            for model in MODELS:
                pred = 0 if model == 'Naive' else actual
                rows.append(dict(date=day, stock=stock, model=model, actual_return=actual,
                    predicted_return=pred, origin_close=100., actual_price=100*(1+actual),
                    predicted_price=100*(1+pred), fold=day.to_period('Q').start_time.strftime('%F'),
                    regime='calm', majority_direction=1))
    return pd.DataFrame(rows)


def test_audit_flags_calendar_disagreement_and_flat_candles_without_editing():
    idx = pd.bdate_range('2024-01-01', periods=3)
    data = {s: pd.DataFrame({'Close': [100.,101.,102.]}, index=idx) for s in TICKERS}
    data['^NSEI'] = data['^NSEI'].drop(idx[1])
    data[ASSETS[0]]['Volume'] = [100,0,100]
    data[ASSETS[0]]['High'] = [101,101,103]
    data[ASSETS[0]]['Low'] = [99,101,101]
    before = data[ASSETS[0]].copy()
    audit = audit_data(data)
    assert audit['status'] == 'review_required'
    assert not audit['official_calendar_verified']
    assert {i['kind'] for i in audit['issues']} == {'date_absent_from_series','zero_volume_flat_candle'}
    pd.testing.assert_frame_equal(before, data[ASSETS[0]])


def test_native_returns_survive_indian_holiday_and_never_use_unavailable_close():
    # Source traded on Jan 15 while the target calendar need not have done so.
    close = pd.Series([100.,110.,132.,264.], index=pd.to_datetime(['2024-01-12','2024-01-15','2024-01-16','2024-01-17']))
    aligned = align_context(close, pd.to_datetime(['2024-01-16','2024-01-17']), 'sp500')
    np.testing.assert_allclose(aligned['return'], [.1,.2])
    assert (aligned.available <= aligned.cutoff).all()
    assert aligned.iloc[-1]['return'] != 1.0  # Jan 17 US outcome was not available.


def test_availability_dst_and_stale_context():
    times = availability(pd.to_datetime(['2024-01-10','2024-07-10']), 'sp500')
    assert [t.hour for t in times] == [23,22]
    close = pd.Series([100.,101.], index=pd.to_datetime(['2024-01-01','2024-01-02']))
    assert align_context(close, pd.to_datetime(['2024-01-20']), 'sp500')['return'].isna().all()


def test_paired_bootstrap_perfect_forecast_and_reproducibility():
    p = predictions()
    first, info = uncertainty(p, repetitions=200, block_length=5)
    second, _ = uncertainty(p, repetitions=200, block_length=5)
    pd.testing.assert_frame_equal(first, second)
    assert info['family_size'] == 12
    skill = first[first.endpoint == 'rmse_skill']
    np.testing.assert_allclose(skill.low_95, 1)
    np.testing.assert_allclose(skill.high_95, 1)
    assert (first.simultaneous_low_95 <= first.low_95).all()
    assert (first.simultaneous_high_95 >= first.high_95).all()
    reference = directional_reference(p)
    assert (reference[reference.model != 'Naive'].direction_advantage == .5).all()


def test_partial_quarter_is_not_a_stability_vote():
    table = pd.DataFrame({'fold':['2026-07-01','2026-10-01']})
    assert complete_quarters(table).fold.tolist() == ['2026-07-01']


def test_render_preserves_training_evidence_and_rejects_tampering(tmp_path):
    p = predictions(2)
    write_report(p, tmp_path, data_quality={'status':'review_required'})
    original = {name: (tmp_path/name).read_bytes() for name in ['predictions.csv','run.json']}
    render_report(tmp_path)
    assert all((tmp_path/name).read_bytes() == content for name,content in original.items())
    with pytest.raises(ValueError, match='already exists'):
        write_report(p,tmp_path)
    with (tmp_path/'predictions.csv').open('a') as stream: stream.write('\n')
    with pytest.raises(ValueError,match='checksum'):
        render_report(tmp_path)


def test_majority_reference_is_frozen_from_training(monkeypatch):
    from nse_forecast.evaluate import evaluate
    import nse_forecast.evaluate as module
    dates = pd.bdate_range('2021-10-01','2023-10-10')
    prices = 100 * np.cumprod(np.full(len(dates),1.001))
    data = {s:pd.DataFrame({'Close':prices},index=dates) for s in TICKERS}
    # The test outcomes turn negative, but no test outcome can choose the reference.
    for frame in data.values():
        mask=frame.index >= '2023-10-01'
        frame.loc[mask,'Close']=frame.loc[~mask,'Close'].iloc[-1]*np.cumprod(np.full(mask.sum(),.99))
    monkeypatch.setattr(module,'predict_models',lambda train,test,columns:{m:np.zeros(len(test)) for m in MODELS})
    result=evaluate(data,ASSETS)
    assert (result.actual_return<0).all()
    assert (result.majority_direction==1).all()
    assert all(r['training_last']<'2023-10-01' for r in result.attrs['fold_records'])


def test_float32_predictions_reconstruct_prices_in_double_precision(monkeypatch):
    from nse_forecast.evaluate import evaluate
    import nse_forecast.evaluate as module
    dates = pd.bdate_range('2021-10-01','2023-10-10')
    data = {s:pd.DataFrame({'Close':100*np.cumprod(np.full(len(dates),1.001))},index=dates) for s in TICKERS}
    monkeypatch.setattr(module,'predict_models',lambda train,test,columns:{m:np.full(len(test),0 if m=='Naive' else .001234567,dtype=np.float32) for m in MODELS})
    result=evaluate(data,ASSETS)
    expected=result.origin_close*(1+result.predicted_return)
    np.testing.assert_allclose(result.predicted_price,expected,rtol=1e-14)
