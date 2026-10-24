"""Synthetic validation fixtures; these are never used as market histories."""
import hashlib
import json
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
from nse_forecast.config import START, END, cache_path
from nse_forecast.data import read_cached
from nse_forecast.import_csv import import_sector, OFFICIAL_SOURCE, parse_date
from nse_forecast.provenance import valid_provenance


@pytest.fixture
def index_inputs(tmp_path):
    cache = tmp_path / 'cache'
    cache.mkdir()
    dates = pd.bdate_range(START, END)
    frame = pd.DataFrame({'Close': np.linspace(100, 200, len(dates))}, index=dates)
    path = cache_path(cache, '^NSEI')
    frame.to_csv(path, index_label='Date')
    path.with_suffix('.json').write_text(json.dumps(dict(ticker='^NSEI', source='yfinance', auto_adjust=True, start=START, end_inclusive=END, sha256=hashlib.sha256(path.read_bytes()).hexdigest())))
    return cache, frame


def csv_file(path, frame, name='Nifty Energy'):
    raw = pd.DataFrame({'Index Name': name, 'Index Date': frame.index.strftime('%d %b %Y'), 'Closing Index Value': frame.Close.to_numpy()})
    raw.to_csv(path, index=False)
    return path


def test_merge_year_files_checksums_and_cache_round_trip(index_inputs, tmp_path):
    cache, frame = index_inputs
    csv_file(tmp_path / 'energy-a.csv', frame.iloc[:700].iloc[::-1])
    csv_file(tmp_path / 'energy-b.csv', frame.iloc[699:])
    import_sector([str(tmp_path / 'energy-*.csv')], '^CNXENERGY', cache)
    loaded = read_cached(cache, '^CNXENERGY')
    np.testing.assert_allclose(loaded.Close, frame.Close)
    assert loaded.index.equals(frame.index)
    info = json.loads(cache_path(cache, '^CNXENERGY').with_suffix('.json').read_text())
    assert info['source'] == 'external_csv'
    assert info['source_url'] == OFFICIAL_SOURCE
    assert info['index_name'] == 'NIFTY ENERGY'
    assert len(info['input_files']) == 2
    assert valid_provenance(info, '^CNXENERGY')
    assert not valid_provenance(info, 'RELIANCE.NS')
    assert all('filename' in item and len(item['sha256']) == 64 for item in info['input_files'])


def test_conflicting_overlap_does_not_write_cache(index_inputs, tmp_path):
    cache, frame = index_inputs
    csv_file(tmp_path / 'a.csv', frame)
    changed = frame.iloc[:1].copy()
    changed['Close'] += 1
    csv_file(tmp_path / 'b.csv', changed)
    with pytest.raises(ValueError, match='Conflicting'):
        import_sector([str(tmp_path / 'a.csv'), str(tmp_path / 'b.csv')], '^CNXENERGY', cache)
    assert not cache_path(cache, '^CNXENERGY').exists()


def test_missing_trading_sessions_are_rejected(index_inputs, tmp_path):
    cache, frame = index_inputs
    csv_file(tmp_path / 'gaps.csv', frame.drop(frame.index[100:110]))
    with pytest.raises(ValueError, match='missing 10 Nifty trading sessions'):
        import_sector([str(tmp_path / 'gaps.csv')], '^CNXENERGY', cache)


def test_wrong_index_name_rejected(index_inputs, tmp_path):
    cache, frame = index_inputs
    path = csv_file(tmp_path / 'metal.csv', frame, name='Nifty Metal')
    with pytest.raises(ValueError, match='do not match NIFTY ENERGY'):
        import_sector([str(path)], '^CNXENERGY', cache)


def test_import_cannot_silently_overwrite_existing_cache(index_inputs, tmp_path):
    cache, frame = index_inputs
    path = csv_file(tmp_path / 'energy.csv', frame)
    import_sector([str(path)], '^CNXENERGY', cache)
    before = cache_path(cache, '^CNXENERGY').read_bytes()
    with pytest.raises(ValueError, match='--replace'):
        import_sector([str(path)], '^CNXENERGY', cache)
    assert cache_path(cache, '^CNXENERGY').read_bytes() == before
    import_sector([str(path)], '^CNXENERGY', cache, replace=True)


def test_yahoo_refresh_preserves_imported_sector(index_inputs, tmp_path, monkeypatch):
    import yfinance as yf
    import nse_forecast.data as source
    cache, frame = index_inputs
    path = csv_file(tmp_path / 'energy.csv', frame)
    import_sector([str(path)], '^CNXENERGY', cache)
    before = cache_path(cache, '^CNXENERGY').read_bytes()
    monkeypatch.setattr(source, 'TICKERS', ('^CNXENERGY',))
    monkeypatch.setattr(yf, 'set_tz_cache_location', lambda path: None)
    def forbidden(*args, **kwargs):
        pytest.fail('An imported sector must not be replaced by Yahoo refresh')
    monkeypatch.setattr(yf, 'download', forbidden)
    source.download(cache, refresh=True)
    assert cache_path(cache, '^CNXENERGY').read_bytes() == before


def test_index_closes_support_iso_dates_and_thousands(index_inputs, tmp_path):
    cache, frame = index_inputs
    raw = pd.DataFrame({'Date': frame.index.strftime('%Y-%m-%d'), 'Close': ['1,234.50'] * len(frame)})
    path = tmp_path / 'metal.csv'
    raw.to_csv(path, index=False)
    import_sector([str(path)], '^CNXMETAL', cache)
    assert (read_cached(cache, '^CNXMETAL').Close == 1234.50).all()
    assert parse_date('2021-10-01').month == 10
    assert parse_date('01/10/2021').month == 10


def test_import_rejects_secret_bearing_source_url(index_inputs, tmp_path):
    cache, frame = index_inputs
    path = csv_file(tmp_path / 'energy.csv', frame)
    with pytest.raises(ValueError, match='public HTTPS'):
        import_sector([str(path)], '^CNXENERGY', cache, source_url='https://provider.example/data?token=private')
