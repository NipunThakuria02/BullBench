"""Read-only chart history from checked local caches; never downloads or trains."""
import json
import math
from pathlib import Path
from .config import ASSETS, START, END, cache_path
from .data import read_cached


def history_payload(cache: Path, ticker: str, reports: Path | None = None):
    if ticker not in ASSETS:
        raise ValueError('History is available only for the six study assets')
    path = cache_path(cache, ticker)
    if not path.exists():
        return {'available': False, 'symbol': ticker, 'rows': [],
                'reason': 'Local history cache not found. Only evaluated-session prices can be shown.'}
    frame = read_cached(cache, ticker)
    metadata = json.loads(path.with_suffix('.json').read_text(encoding='utf-8'))
    manifest = reports / 'run.json' if reports is not None else None
    if manifest is not None and manifest.exists():
        run = json.loads(manifest.read_text(encoding='utf-8'))
        reference = next((item for item in run.get('cache_provenance', []) if item.get('ticker') == ticker), None)
        if reference is not None and reference.get('sha256') != metadata['sha256']:
            raise ValueError('History cache differs from the selected forecast run. Use its original cache to keep charts comparable.')
    rows = []
    for day, row in frame.iterrows():
        volume = row.get('Volume')
        volume = float(volume) if volume is not None and math.isfinite(float(volume)) and float(volume) >= 0 else None
        # An index is not a directly traded security; Yahoo zero volume is not an index trading-volume series.
        if ticker == '^NSEI':
            volume = None
        rows.append({'date': day.strftime('%Y-%m-%d'), 'close': float(row.Close), 'volume': volume})
    return {'available': True, 'symbol': ticker, 'rows': rows, 'source': metadata['source'],
            'sha256': metadata['sha256'], 'start': START, 'end': END,
            'price_basis': 'index_points' if ticker == '^NSEI' else 'adjusted_close'}
