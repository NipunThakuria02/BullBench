from pathlib import Path
import numpy as np
import pandas as pd
import pytest
from nse_forecast.evaluate import summarize
from nse_forecast.report import tables_for, write_report, render_report
from nse_forecast.diagnostics import uncertainty
from test_research_revision import predictions


def price_fixture():
    return pd.DataFrame([
        dict(stock=stock,model=model,actual_return=r,predicted_return=v,
             origin_close=origin,actual_price=origin*(1+r),predicted_price=origin*(1+v))
        for stock,scale in [('HDFCBANK.NS',1),('^NSEI',100)]
        for model,values in [('Naive',[0.,0.]),('Ridge',[.05,.05])]
        for origin,r,v in zip([100*scale,200*scale],[.1,-.1],values)
    ])


def test_price_error_values_and_baseline_skills():
    result=summarize(price_fixture(),['stock','model']).set_index(['stock','model'])
    naive=result.loc[('HDFCBANK.NS','Naive')]
    ridge=result.loc[('HDFCBANK.NS','Ridge')]
    assert naive.price_mae == pytest.approx(15)
    assert naive.price_rmse == pytest.approx(np.sqrt(250))
    assert ridge.price_mae == pytest.approx(17.5)
    assert ridge.price_rmse == pytest.approx(np.sqrt(462.5))
    assert ridge.price_mae_skill == pytest.approx(1-17.5/15)
    assert ridge.price_rmse_skill == pytest.approx(1-np.sqrt(462.5)/np.sqrt(250))
    assert result.loc[('^NSEI','Ridge'),'price_mae'] == pytest.approx(1750)
    assert result.loc[('^NSEI','Ridge'),'price_mae_skill'] == pytest.approx(ridge.price_mae_skill)


def test_raw_price_errors_are_never_pooled_across_assets():
    pooled=summarize(price_fixture(),['model'])
    assert 'price_mae' not in pooled
    assert 'price_rmse' not in pooled


def test_zero_naive_error_has_undefined_relative_skill():
    p=price_fixture()
    p['actual_return']=0.
    p['actual_price']=p.origin_close
    result=summarize(p,['stock','model'])
    assert result.price_mae_skill.isna().all()
    assert result.price_rmse_skill.isna().all()
    assert np.isfinite(result.price_mae).all()


def test_rankings_ties_and_cross_asset_summary_have_no_screening_flag():
    p=predictions(2)
    tables=tables_for(p)
    ranking=tables['accuracy_ranking']
    assert (ranking[ranking.model!='Naive'].price_mae_rank==1).all()
    assert (ranking[ranking.model=='Naive'].price_mae_rank==5).all()
    assert 'index points' in set(ranking.unit)
    assert not any('criteria' in name or 'screen' in name for name in tables['comparison'].columns)
    assert tables['comparison'].set_index('model').loc['Ridge','mean_asset_price_mae_skill']==pytest.approx(1)


def test_new_report_output_preserves_original_training_evidence(tmp_path):
    source=tmp_path/'original';target=tmp_path/'price-report'
    write_report(predictions(2),source)
    evidence={name:(source/name).read_bytes() for name in ['predictions.csv','run.json']}
    render_report(source,target)
    for name,content in evidence.items():
        assert (source/name).read_bytes()==content
        assert (target/name).read_bytes()==content
    assert (target/'accuracy_ranking.csv').exists()
    assert 'closing-value' in (target/'report.html').read_text(encoding='utf-8')
    ledger=pd.read_csv(target/'recent_forecasts.csv')
    np.testing.assert_allclose(ledger.price_error,ledger.predicted_price-ledger.actual_price)
    np.testing.assert_allclose(ledger.absolute_price_error,ledger.price_error.abs())
    with pytest.raises(ValueError,match='already contains'):
        render_report(source,target)


def test_bootstrap_price_endpoint_is_scale_invariant_across_assets():
    p=predictions(80)
    baseline,info=uncertainty(p,repetitions=100,block_length=5)
    p.loc[p.stock=='^NSEI',['actual_price','predicted_price','origin_close']] *= 1000
    changed,_=uncertainty(p,repetitions=100,block_length=5)
    endpoint='mean_asset_price_mae_skill'
    pd.testing.assert_frame_equal(baseline[baseline.endpoint==endpoint],changed[changed.endpoint==endpoint])
    assert info['family_size']==12
