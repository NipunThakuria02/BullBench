import hashlib
import json
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
import threading
from urllib.request import urlopen
from urllib.error import HTTPError
import numpy as np
import pandas as pd
import pytest
from nse_forecast.config import START, END, cache_path
from nse_forecast.history import history_payload
from nse_forecast.web import Handler


@pytest.fixture
def cache(tmp_path):
    directory=tmp_path/'cache';directory.mkdir()
    for ticker in ['HDFCBANK.NS','^NSEI']:
        dates=pd.bdate_range(START,END)
        frame=pd.DataFrame({'Close':np.linspace(100,200,len(dates)),'Volume':np.arange(len(dates))*100},index=dates)
        path=cache_path(directory,ticker);frame.to_csv(path,index_label='Date')
        path.with_suffix('.json').write_text(json.dumps(dict(ticker=ticker,source='yfinance',auto_adjust=True,start=START,end_inclusive=END,sha256=hashlib.sha256(path.read_bytes()).hexdigest())))
    return directory


def test_history_reads_full_verified_range_without_writing(cache):
    original={p:p.read_bytes() for p in cache.iterdir()}
    result=history_payload(cache,'HDFCBANK.NS')
    assert result['available'] and len(result['rows'])>1000
    assert result['rows'][0]==dict(date=START,close=100,volume=0)
    assert result['rows'][-1]['date']==END
    assert result['price_basis']=='adjusted_close'
    assert all(p.read_bytes()==content for p,content in original.items())


def test_index_does_not_claim_trading_volume(cache):
    result=history_payload(cache,'^NSEI')
    assert result['price_basis']=='index_points'
    assert all(row['volume'] is None for row in result['rows'])


def test_history_rejects_tampered_cache(cache):
    path=cache_path(cache,'HDFCBANK.NS');path.write_bytes(path.read_bytes()+b'\n')
    with pytest.raises(ValueError,match='checksum'):
        history_payload(cache,'HDFCBANK.NS')


def test_history_rejects_a_different_run_cache(cache,tmp_path):
    reports=tmp_path/'reports';reports.mkdir()
    (reports/'run.json').write_text(json.dumps(dict(cache_provenance=[dict(ticker='HDFCBANK.NS',sha256='a'*64)])))
    with pytest.raises(ValueError,match='differs'):
        history_payload(cache,'HDFCBANK.NS',reports)


def test_missing_history_and_unknown_symbols_are_explicit(cache):
    assert not history_payload(cache,'TCS.NS')['available']
    with pytest.raises(ValueError,match='six study assets'):
        history_payload(cache,'../../private')


def test_history_http_whitelist_and_query_parsing(cache,tmp_path):
    handler=partial(Handler,directory=str(tmp_path),reports=tmp_path/'reports',cache=cache)
    server=ThreadingHTTPServer(('127.0.0.1',0),handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        base=f'http://127.0.0.1:{server.server_port}'
        with urlopen(base+'/api/history?symbol=%5ENSEI') as response:
            assert response.status==200 and json.load(response)['symbol']=='^NSEI'
        with pytest.raises(HTTPError) as error:urlopen(base+'/api/history?symbol=INFY.NS')
        assert error.value.code==400
    finally:
        server.shutdown();server.server_close();thread.join()
