import csv
from functools import partial
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import threading
from urllib.error import HTTPError
from urllib.request import urlopen
import pytest
from nse_forecast.config import ASSETS, MODELS, TICKERS, START, END
from nse_forecast.web import FIELDS, Handler, export_results, export_history, results_payload



@pytest.fixture
def evaluation(tmp_path):
    rows = []
    for stock in ASSETS:
        for model in MODELS:
            rows.append(dict(date='2026-10-16', stock=stock, model=model, actual_return=.01, predicted_return=0 if model == 'Naive' else .002, origin_close=100, actual_price=101, predicted_price=100 if model == 'Naive' else 100.2, regime='calm', fold='2026-10-01'))
    with (tmp_path / 'predictions.csv').open('w', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    # This is a validation fixture, never a source of market results.
    metadata = dict(cache_provenance=[dict(ticker=ticker, source='yfinance', auto_adjust=True, start=START, end_inclusive=END, sha256='a' * 64) for ticker in TICKERS], created_utc='2026-10-19T00:00:00Z')
    (tmp_path / 'run.json').write_text(json.dumps(metadata))
    return tmp_path


def test_export_preserves_all_asset_model_forecasts(evaluation):
    payload = results_payload(evaluation)
    assert payload['available'] and len(payload['rows']) == 30
    output = evaluation / 'static' / 'results.json'
    export_results(evaluation, output)
    assert json.loads(output.read_text()) == payload
    assert not output.with_suffix('.json.tmp').exists()


def test_absent_results_do_not_become_examples(tmp_path):
    assert results_payload(tmp_path) == dict(available=False, rows=[], reason='Run download and evaluate to connect market results.')
    with pytest.raises(ValueError, match='download and evaluate'):
        export_results(tmp_path, tmp_path / 'results.json')


def test_synthetic_report_cannot_be_labeled_market(evaluation):
    (evaluation / 'run.json').write_text(json.dumps(dict(cache_provenance=None)))
    with pytest.raises(ValueError, match='synthetic fixtures'):
        results_payload(evaluation)


def test_missing_comparator_rejected(evaluation):
    path = evaluation / 'predictions.csv'
    lines = path.read_text().splitlines()
    path.write_text('\n'.join(lines[:-1]) + '\n')
    with pytest.raises(ValueError, match='all five'):
        results_payload(evaluation)


@pytest.mark.parametrize('value', ['nan', 'inf'])
def test_non_finite_predictions_rejected(evaluation, value):
    path = evaluation / 'predictions.csv'
    path.write_text(path.read_text().replace('0.002', value))
    with pytest.raises(ValueError, match='Non-finite'):
        results_payload(evaluation)


def test_http_serves_api_and_site_without_directory_listing(evaluation):
    static = evaluation / 'site'
    static.mkdir()
    (static / 'index.html').write_text('<title>Session test</title>')
    (static / 'private-directory').mkdir()
    handler = partial(Handler, directory=str(static), reports=evaluation)
    server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f'http://127.0.0.1:{server.server_port}'
    try:
        with urlopen(origin + '/api/results') as response:
            assert response.status == 200
            assert len(json.load(response)['rows']) == 30
        with urlopen(origin + '/') as response:
            assert b'Session test' in response.read()
        with pytest.raises(HTTPError) as error:
            urlopen(origin + '/private-directory/')
        assert error.value.code == 404
        (evaluation / 'predictions.csv').write_text('bad,columns\n1,2\n')
        with pytest.raises(HTTPError) as error:
            urlopen(origin + '/api/results')
        assert error.value.code == 422
        assert b'incomplete or invalid' in error.value.read()
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_dashboard_accepts_documented_mixed_sector_sources(evaluation):
    from nse_forecast.provenance import SECTOR_NAMES
    path = evaluation / 'run.json'
    run = json.loads(path.read_text())
    for info in run['cache_provenance']:
        if info['ticker'] in SECTOR_NAMES:
            info.pop('auto_adjust')
            info.update(source='external_csv', source_url='https://www.niftyindices.com/reports/historical-data', index_name=SECTOR_NAMES[info['ticker']], price_basis='price_index', input_files=[dict(filename='official-sector.csv', sha256='b' * 64)])
    path.write_text(json.dumps(run))
    payload = results_payload(evaluation)
    assert payload['available'] and payload['source'] == 'mixed'
    assert payload['sources'] == ['external_csv', 'yfinance']
    output = evaluation / 'site' / 'results.json'
    export_results(evaluation, output)
    assert json.loads(output.read_text())['source'] == 'mixed'


def test_external_csv_cannot_replace_locked_stock_source(evaluation):
    path = evaluation / 'run.json'
    run = json.loads(path.read_text())
    info = run['cache_provenance'][0]
    info.update(source='external_csv', source_url='https://www.niftyindices.com/reports/historical-data', index_name='NIFTY ENERGY', price_basis='price_index', input_files=[dict(filename='wrong.csv', sha256='b' * 64)])
    path.write_text(json.dumps(run))
    with pytest.raises(ValueError, match='Invalid market-cache provenance'):
        results_payload(evaluation)


def test_rejects_inconsistent_price_math(evaluation):
    path = evaluation / 'predictions.csv'
    path.write_text(path.read_text().replace('100.2', '110.2'))
    with pytest.raises(ValueError, match='inconsistent'):
        results_payload(evaluation)


def test_rejects_different_outcomes_between_models(evaluation):
    import pandas as pd
    path = evaluation / 'predictions.csv'
    frame = pd.read_csv(path)
    frame.loc[1, ['actual_return', 'actual_price']] = [.02, 102]
    frame.to_csv(path, index=False)
    with pytest.raises(ValueError, match='disagree'):
        results_payload(evaluation)


def test_version_two_checksums_bind_predictions(evaluation):
    import hashlib
    import pandas as pd
    path = evaluation / 'predictions.csv'
    frame = pd.read_csv(path).assign(majority_direction=1)
    frame.to_csv(path, index=False)
    manifest = evaluation / 'run.json'
    run = json.loads(manifest.read_text())
    run.update(schema_version=2, predictions_sha256=hashlib.sha256(path.read_bytes()).hexdigest(), data_quality={'status':'review_required'})
    manifest.write_text(json.dumps(run))
    assert results_payload(evaluation)['data_quality']['status'] == 'review_required'
    path.write_bytes(path.read_bytes()+b'\n')
    with pytest.raises(ValueError,match='checksum'):
        results_payload(evaluation)


def test_export_history_writes_one_file_per_asset(evaluation, tmp_path):
    """export_history must produce a valid /api/history-schema JSON for each study asset."""
    import hashlib as hl
    import numpy as np
    import pandas as pd
    from nse_forecast.config import cache_path
    # Build a minimal history cache for all six assets.
    cache = tmp_path / 'cache'
    cache.mkdir()
    for ticker in ASSETS:
        dates = pd.bdate_range(START, END)
        frame = pd.DataFrame(
            {'Close': np.linspace(100, 200, len(dates)), 'Volume': np.arange(len(dates)) * 100},
            index=dates,
        )
        p = cache_path(cache, ticker)
        frame.to_csv(p, index_label='Date')
        p.with_suffix('.json').write_text(json.dumps(dict(
            ticker=ticker, source='yfinance', auto_adjust=True,
            start=START, end_inclusive=END,
            sha256=hl.sha256(p.read_bytes()).hexdigest(),
        )))
    out_dir = tmp_path / 'out'
    # Pass None for reports so history_payload skips the cross-run SHA check.
    written = export_history(cache, None, out_dir)

    assert len(written) == len(ASSETS)
    for ticker in ASSETS:
        safe = cache_path(Path(''), ticker).with_suffix('.json').name
        dest = out_dir / 'history' / safe
        assert dest.exists(), f'Missing: {dest}'
        payload = json.loads(dest.read_text())
        assert payload['available'] is True
        assert payload['symbol'] == ticker
        assert len(payload['rows']) > 100
        assert all(r['close'] > 0 for r in payload['rows'])
        assert not dest.with_suffix('.json.tmp').exists()

