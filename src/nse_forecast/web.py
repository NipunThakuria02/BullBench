"""Serve the built dashboard and existing evaluation outputs without a database."""
import argparse
import csv
import hashlib
from datetime import date
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import math
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from .config import ASSETS, MODELS, TICKERS
from .provenance import valid_provenance
from .history import history_payload

NUMBERS = ('actual_return', 'predicted_return', 'origin_close', 'actual_price', 'predicted_price')
FIELDS = ('date', 'stock', 'model', *NUMBERS, 'regime', 'fold')


def results_payload(reports: Path) -> dict:
    path = reports / 'predictions.csv'
    if not path.exists():
        return {'available': False, 'rows': [], 'reason': 'Run download and evaluate to connect market results.'}
    rows, seen = [], set()
    with path.open(newline='', encoding='utf-8') as stream:
        reader = csv.DictReader(stream)
        if not set(FIELDS).issubset(reader.fieldnames or []):
            raise ValueError('predictions.csv is missing required columns')
        for source in reader:
            row = {field: source[field] for field in FIELDS}
            for key in NUMBERS:
                row[key] = float(row[key])
                if not math.isfinite(row[key]):
                    raise ValueError(f'Non-finite {key} in predictions.csv')
            target_date = date.fromisoformat(row['date'][:10])
            fold = date.fromisoformat(row['fold'])
            row['date'] = target_date.isoformat()
            if row['stock'] not in ASSETS or row['model'] not in MODELS or row['regime'] not in ('calm', 'volatile'):
                raise ValueError('Unknown asset, model, or regime in predictions.csv')
            if not date(2023, 10, 1) <= target_date <= date(2026, 10, 16) or fold > target_date:
                raise ValueError('Invalid target or training-fold date in predictions.csv')
            if row['origin_close'] <= 0 or row['actual_price'] <= 0 or row['predicted_price'] <= 0:
                raise ValueError('Prices must be positive')
            for field, expected in (
                ('actual_price', row['origin_close'] * (1 + row['actual_return'])),
                ('predicted_price', row['origin_close'] * (1 + row['predicted_return'])),
            ):
                if not math.isclose(row[field], expected, rel_tol=1e-7, abs_tol=1e-8):
                    raise ValueError('Return and price values are inconsistent')
            if row['model'] == 'Naive' and row['predicted_return'] != 0:
                raise ValueError('Naive must forecast zero return')
            if fold.day != 1 or fold.month not in (1, 4, 7, 10):
                raise ValueError('Invalid quarterly fold boundary')
            if (target_date.year, (target_date.month - 1) // 3) != (fold.year, (fold.month - 1) // 3):
                raise ValueError('Target is outside its quarterly test block')
            if source.get('majority_direction'):
                row['majority_direction'] = int(source['majority_direction'])
                if row['majority_direction'] not in (-1, 1):
                    raise ValueError('Invalid training-majority direction')
            identity = (row['date'], row['stock'], row['model'])
            if identity in seen:
                raise ValueError('Duplicate asset/date/model prediction')
            seen.add(identity)
            rows.append(row)
    if not rows:
        raise ValueError('predictions.csv has no evaluated rows')
    if {r['stock'] for r in rows} != set(ASSETS):
        raise ValueError('Evaluation must include all six locked assets')
    per_session = {}
    outcomes = {}
    for row in rows:
        key = (row['stock'], row['date'])
        per_session.setdefault(key, set()).add(row['model'])
        outcome = tuple(row[field] for field in ('actual_return', 'origin_close', 'actual_price', 'regime', 'fold')) + (row.get('majority_direction'),)
        if key in outcomes and outcomes[key] != outcome:
            raise ValueError('Models disagree on the outcome or session metadata')
        outcomes[key] = outcome
    if any(models != set(MODELS) for models in per_session.values()):
        raise ValueError('Every asset/session must contain all five model predictions')
    manifest = reports / 'run.json'
    if not manifest.exists():
        raise ValueError('Missing run.json evaluation manifest')
    run = json.loads(manifest.read_text(encoding='utf-8'))
    if not isinstance(run, dict) or not isinstance(run.get('cache_provenance'), list) or not run['cache_provenance']:
        raise ValueError('The evaluation has no market-cache provenance; synthetic fixtures are not market results')
    version = run.get('schema_version', 1)
    if version >= 2:
        if run.get('predictions_sha256') != hashlib.sha256(path.read_bytes()).hexdigest():
            raise ValueError('Predictions checksum differs from evaluation manifest')
        if any('majority_direction' not in row for row in rows):
            raise ValueError('Missing training-majority reference in version 2 output')
    provenance = run['cache_provenance']
    if any(not isinstance(item, dict) or not valid_provenance(item, item.get('ticker')) for item in provenance) or len(provenance) != len(TICKERS) or {item.get('ticker') for item in provenance} != set(TICKERS):
        raise ValueError('Invalid market-cache provenance in run.json')
    return {'available': True, 'rows': rows, 'source': 'mixed' if any(item['source'] == 'external_csv' for item in provenance) else 'yfinance', 'sources': sorted({item['source'] for item in provenance}), 'generated_utc': run.get('created_utc'), 'schema_version': version, 'data_quality': run.get('data_quality', {'status': 'legacy_run_not_audited'}), 'research_status': run.get('research_status', 'Legacy evaluation; revised diagnostics were not used during training.')}


def export_results(reports: Path, output: Path) -> None:
    payload = results_payload(reports)
    if not payload['available']:
        raise ValueError(payload['reason'])
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(payload, separators=(',', ':'), allow_nan=False))
    temporary.replace(output)


def export_history(cache: Path, reports: Path, output_dir: Path) -> list[str]:
    """Export one history/<symbol>.json per study asset for static deployment.

    The emitted JSON is identical to the /api/history response schema so that
    the frontend validHistory() and getHistory() fallback code works without
    modification.  The export is keyed by URL-safe filenames; the frontend
    must resolve them via /history/<symbol>.json.

    Only the six locked study assets are exported.  Returns the list of
    written filenames.
    """
    from .config import ASSETS as ASSET_SYMBOLS, cache_path
    written: list[str] = []
    for ticker in ASSET_SYMBOLS:
        try:
            payload = history_payload(cache, ticker, reports)
        except (ValueError, OSError, KeyError, TypeError) as exc:
            raise ValueError(f'Cannot export history for {ticker}: {exc}') from exc
        if not payload.get('available'):
            raise ValueError(f'History cache unavailable for {ticker}: {payload.get("reason")}')
        # URL-safe filename: replace ^ with INDEX_ and = with _ (mirrors cache_path).
        safe = cache_path(Path(''), ticker).with_suffix('.json').name
        dest = output_dir / 'history' / safe
        dest.parent.mkdir(parents=True, exist_ok=True)
        temporary = dest.with_suffix('.json.tmp')
        temporary.write_text(json.dumps(payload, separators=(',', ':'), allow_nan=False))
        temporary.replace(dest)
        written.append(str(dest))
    return written


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, reports: Path, cache: Path | None = None, **kwargs):
        self.reports = reports
        self.cache = cache or Path("data/cache")
        super().__init__(*args, **kwargs)

    def do_GET(self):
        if urlsplit(self.path).path == '/api/history':
            query = parse_qs(urlsplit(self.path).query)
            symbol = query.get('symbol', [''])[0]
            if symbol not in ASSETS:
                payload, status = {'available': False, 'rows': [], 'reason': 'Choose one of the six study assets.'}, 400
            else:
                try:
                    payload, status = history_payload(self.cache, symbol, self.reports), 200
                except (ValueError, OSError, KeyError, TypeError):
                    payload, status = {'available': False, 'rows': [], 'reason': 'History cache is invalid or differs from this evaluation. Full history was not loaded.'}, 422
            encoded = json.dumps(payload, allow_nan=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
        elif urlsplit(self.path).path == '/api/results':
            try:
                payload, status = results_payload(self.reports), 200
            except (ValueError, OSError, KeyError, TypeError):
                payload = {'available': False, 'rows': [], 'reason': 'Evaluation outputs are incomplete or invalid. Rerun evaluate.'}
                status = 422
            encoded = json.dumps(payload, allow_nan=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
        elif urlsplit(self.path).path.startswith('/api/'):
            self.send_error(404)
        else:
            super().do_GET()

    def list_directory(self, path):
        self.send_error(404)
        return None


def main():
    parser = argparse.ArgumentParser(description='Serve BullBench and evaluated predictions with local historical charts')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', default=8000, type=int)
    parser.add_argument('--directory', type=Path, default=Path('web/dist'))
    parser.add_argument('--reports', type=Path, default=Path('reports'))
    parser.add_argument('--cache', type=Path, default=Path('data/cache'), help='Verified local history cache for charts')
    args = parser.parse_args()
    if not (args.directory / 'index.html').exists():
        parser.error('Build the site first: cd web && npm ci && npm run build')
    handler = partial(Handler, directory=str(args.directory.resolve()), reports=args.reports.resolve(), cache=args.cache.resolve())
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f'BullBench listening on port {args.port}. Ctrl-C to stop.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
