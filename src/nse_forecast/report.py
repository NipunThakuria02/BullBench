"""Immutable evaluation manifests, with separately regenerable report artifacts."""
import argparse
import hashlib
import html
import importlib.metadata
import json
from pathlib import Path
import platform
import shutil
import pandas as pd
from .config import START, END, ASSETS
from .evaluate import summarize
from .diagnostics import complete_quarters, directional_reference, uncertainty
from .features import TIMING_POLICY
from .models import model_configuration


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_hashes():
    return {p.name: sha256(p) for p in sorted(Path(__file__).parent.glob('*.py'))}


def tables_for(predictions):
    tables = {name: summarize(predictions, groups) for name, groups in {
        'overall': ['model'], 'by_stock': ['stock', 'model'],
        'by_quarter': ['fold', 'model'], 'by_regime': ['regime', 'model'],
        'stock_quarter': ['stock', 'fold', 'model'], 'stock_regime': ['stock', 'regime', 'model'],
    }.items()}
    reference = directional_reference(predictions)
    tables['directional_reference'] = reference
    tables['equal_weight_assets'] = tables['by_stock'].groupby('model', as_index=False).agg(
        mean_asset_rmse_skill=('rmse_skill', 'mean'),
        mean_asset_direction_score=('directional_accuracy', 'mean'))
    per_asset = tables['by_stock'].copy()
    per_asset['price_mae_rank'] = per_asset.groupby('stock').price_mae.rank(method='min').astype(int)
    per_asset['unit'] = per_asset.stock.map(lambda stock: 'index points' if stock == '^NSEI' else 'INR, adjusted close')
    leading = ['stock', 'unit', 'price_mae_rank', 'model', 'n', 'price_mae', 'price_rmse',
               'price_mae_skill', 'price_rmse_skill', 'price_nmae', 'price_bias']
    tables['accuracy_ranking'] = per_asset[leading + [name for name in per_asset if name not in leading]].sort_values(['stock', 'price_mae_rank', 'model'])
    comparison = per_asset.groupby('model', as_index=False).agg(
        mean_asset_price_mae_skill=('price_mae_skill', 'mean'),
        mean_asset_price_rmse_skill=('price_rmse_skill', 'mean'),
        mean_asset_return_rmse_skill=('rmse_skill', 'mean'),
        mean_asset_direction_score=('directional_accuracy', 'mean'),
        assets_compared=('stock', 'nunique'),
        asset_mae_wins=('price_mae_skill', lambda values: int((values > 0).sum())),
        assets_with_defined_mae_skill=('price_mae_skill', 'count'))
    tables['comparison'] = comparison.sort_values(['mean_asset_price_mae_skill', 'model'], ascending=[False, True])
    return tables


def render(predictions, directory, metadata):
    tables = tables_for(predictions)
    intervals, bootstrap = uncertainty(predictions)
    tables['uncertainty'] = intervals
    for name, table in tables.items():
        table.to_csv(directory / f'{name}.csv', index=False)
    rendering = dict(rendered_utc=pd.Timestamp.now(tz='UTC').isoformat(),
        renderer_source_hashes=source_hashes(), bootstrap=bootstrap, primary_metric='per-asset closing-value MAE', cross_asset_metric='equal-weight mean per-asset price MAE improvement over naive',
        predictions_sha256=sha256(directory / 'predictions.csv'))
    (directory / 'render.json').write_text(json.dumps(rendering, indent=2), encoding='utf-8')
    quality = metadata.get('data_quality', {'status': 'legacy_run_not_audited'})
    parts = ["<!doctype html><html lang='en'><meta charset='utf-8'><title>NSE closing-value forecast comparison</title><style>body{font:16px system-ui;max-width:1400px;margin:40px auto;padding:0 20px;color:#17283b}table{border-collapse:collapse;font-size:13px;display:block;overflow:auto}td,th{padding:8px;border:1px solid #ddd}th{background:#edf3f8}</style><h1>Next-session closing-value forecast comparison</h1>",
        f"<p>Data quality: <strong>{html.escape(quality['status'])}</strong>. Cross-source checks do not certify an official trading calendar.</p>",
        '<p>Objective: compare five approaches for predicting next-session closing values. Models predict returns internally; the forecast closing value is the observed previous close multiplied by one plus the predicted return. These are historical one-session forecasts, not live quotes or a recursively forecast price path.</p>',
        '<p><strong>Primary metric: closing-value MAE within each asset.</strong> RMSE exposes sensitivity to large misses. Stock values use retrospectively adjusted closes in INR, not the original exchange closing quote; Nifty values use index points. Never pool raw INR and point errors across assets.</p>',
        '<p>Cross-asset comparison uses the equal-weight mean of per-asset error improvement over naive. Positive skill means lower error than predicting the previous closing value. A first-place model may still have no demonstrated improvement; ties share ranks. A zero baseline error makes relative skill undefined.</p>',
        '<p>Return errors, directional scores, quarters and lagged market-volatility regimes are supporting diagnostics. There is no combined realism pass/fail verdict. The final quarter is partial; inspect counts before comparing periods.</p>',
        '<p>Uncertainty uses paired date blocks with all models and assets kept together. The primary price endpoint is equal-weight per-asset MAE improvement over naive. Pointwise and multiplicity-adjusted intervals are approximate and conditional on fitted forecasts. They do not correct post-hoc selection. Naive makes no directional call, even though its mathematical half-credit score is 50%.</p>']
    if 'majority_direction' not in predictions:
        parts.append('<p><strong>Legacy predictions:</strong> training-majority references were not saved. Direction-reference comparison is unavailable; no references were inferred from test outcomes.</p>')
    if metadata.get('timing_policy'):
        parts.append('<h2>Availability assumptions</h2><pre>' + html.escape(json.dumps(metadata['timing_policy'], indent=2)) + '</pre>')
    provenance = metadata.get('cache_provenance')
    if provenance:
        parts.extend(['<h2>Input provenance</h2>', pd.DataFrame([
            {'Input': x['ticker'], 'Source': x['source'], 'Source page': x.get('source_url', 'Yahoo Finance via yfinance')}
            for x in provenance]).to_html(index=False)])
    colors = {'Actual': '#111111', 'Naive': '#888888', 'Ridge': '#1976d2',
              'ARIMA': '#e28c00', 'RandomForest': '#12935b', 'XGBoost': '#923cb5'}
    for view in ('closing_value', 'signed_error'):
        parts.append('<h2>' + ('Actual and predicted closing values' if view == 'closing_value' else 'Signed forecast errors: predicted minus actual') + '</h2><p>Last 60 evaluated sessions per asset. Charts are one-session reconstructions, not recursive paths.</p>')
        for stock, block in predictions.groupby('stock'):
            wide = block.pivot(index='date', columns='model', values='predicted_price').tail(60)
            actual = block.drop_duplicates('date').set_index('date').actual_price.reindex(wide.index)
            if view == 'signed_error':
                wide = wide.subtract(actual, axis=0)
                wide['Actual'] = 0.
            else:
                wide['Actual'] = actual
            low, high = float(wide.min().min()), float(wide.max().max())
            padding = max((high-low)*.1, .01)
            low, high = low-padding, high+padding
            unit = 'index points' if stock == '^NSEI' else 'INR, adjusted close'
            parts.append(f'<h3>{html.escape(stock)} ({unit})</h3><svg viewBox="0 0 900 260" role="img" aria-label="{html.escape(stock)} {view} comparison">')
            parts.append(f'<text x="0" y="15">{high:.2f}</text><text x="0" y="230">{low:.2f}</text>')
            for label in wide:
                points = ' '.join(f'{70+i*805/max(len(wide)-1,1):.2f},{225-(value-low)/(high-low)*205:.2f}' for i, value in enumerate(wide[label]))
                parts.append(f'<polyline fill="none" stroke="{colors[label]}" stroke-width="1.5" points="{points}"/>')
            parts.append(f'<text x="70" y="252">{wide.index.min().date()}</text><text x="785" y="252">{wide.index.max().date()}</text></svg>')
    parts.append('<p>' + ' · '.join(f'<span style="color:{color}">{name}</span>' for name, color in colors.items()) + '</p>')
    order = ['accuracy_ranking', 'comparison', 'uncertainty', 'by_stock', 'stock_quarter', 'stock_regime', 'directional_reference', 'equal_weight_assets', 'overall', 'by_quarter', 'by_regime']
    for name in order:
        table = tables[name]
        parts.extend([f'<h2>{html.escape(name.replace("_", " ").title())}</h2>',
                      table.to_html(index=False, float_format=lambda v: f'{v:.6f}')])
    ledger = predictions.sort_values(['date', 'stock', 'model'], ascending=[False, True, True]).head(100).copy()
    ledger['price_error'] = ledger.predicted_price-ledger.actual_price
    ledger['absolute_price_error'] = ledger.price_error.abs()
    ledger.to_csv(directory / 'recent_forecasts.csv', index=False)
    parts.extend(['<h2>Recent forecast ledger</h2>', ledger.to_html(index=False, float_format=lambda v: f'{v:.6f}')])
    parts.append('</html>')
    temporary = directory / 'report.html.tmp'
    temporary.write_text('\n'.join(parts), encoding='utf-8')
    temporary.replace(directory / 'report.html')
    return tables['comparison']


def write_report(predictions, directory: Path, provenance=None, data_quality=None):
    directory.mkdir(parents=True, exist_ok=True)
    if (directory / 'predictions.csv').exists() or (directory / 'run.json').exists():
        raise ValueError('Evaluation output already exists. Use a new --output directory; render-report regenerates presentation without retraining.')
    predictions.to_csv(directory / 'predictions.csv', index=False)
    metadata = dict(schema_version=2, cache_provenance=provenance,
        data_start=START, data_end_inclusive=END, assets=ASSETS,
        python=platform.python_version(), platform=platform.platform(), machine=platform.machine(),
        packages={p: importlib.metadata.version(p) for p in ('pandas', 'numpy', 'scikit-learn', 'statsmodels', 'xgboost', 'yfinance')},
        created_utc=pd.Timestamp.now(tz='UTC').isoformat(), first_test=str(predictions.date.min()), last_test=str(predictions.date.max()),
        predictions_sha256=sha256(directory / 'predictions.csv'), source_hashes=source_hashes(),
        model_configuration=model_configuration(), timing_policy=TIMING_POLICY,
        fold_records=predictions.attrs.get('fold_records', []),
        data_quality=data_quality or {'status': 'not_audited'},
        research_status='exploratory revised methodology; original test period already inspected')
    (directory / 'run.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
    return render(predictions, directory, metadata)


def render_report(directory, output=None):
    metadata = json.loads((directory / 'run.json').read_text(encoding='utf-8'))
    path = directory / 'predictions.csv'
    if metadata.get('predictions_sha256') and metadata['predictions_sha256'] != sha256(path):
        raise ValueError('Predictions checksum differs from the original evaluation manifest')
    predictions = pd.read_csv(path, parse_dates=['date'], float_precision='round_trip')
    if output is not None and output.resolve() != directory.resolve():
        if (output / 'predictions.csv').exists() or (output / 'run.json').exists():
            raise ValueError('Destination already contains an evaluation; choose a new --output directory')
        output.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, output / 'predictions.csv')
        shutil.copyfile(directory / 'run.json', output / 'run.json')
        directory = output
    return render(predictions, directory, metadata)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Regenerate derived reports; preserve predictions and training manifest')
    parser.add_argument('--reports', type=Path, default=Path('reports'))
    parser.add_argument('--output', type=Path, help='Copy unchanged evidence into a new report directory')
    args = parser.parse_args()
    render_report(args.reports, args.output)
    print(f'Report saved to {(args.output or args.reports) / "report.html"}')
