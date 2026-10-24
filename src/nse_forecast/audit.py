"""Read-only diagnostics. Cross-source agreement is not an official calendar."""
import json
from pathlib import Path
import pandas as pd
from .config import ASSETS, SECTORS


def audit_data(data):
    domestic = tuple(dict.fromkeys((*ASSETS, *SECTORS.values(), '^INDIAVIX')))
    union = pd.DatetimeIndex(sorted(set().union(*(set(data[s].index) for s in domestic))))
    issues = []
    for symbol in domestic:
        frame = data[symbol]
        for day in union.difference(frame.index):
            issues.append(dict(ticker=symbol, date=day.strftime('%Y-%m-%d'),
                               kind='date_absent_from_series',
                               detail='Present in another domestic input; verify against exchange session records.'))
        if symbol in ASSETS and {'Volume', 'High', 'Low'}.issubset(frame.columns):
            for day in frame[(frame.Volume == 0) & (frame.High == frame.Low)].index:
                issues.append(dict(ticker=symbol, date=day.strftime('%Y-%m-%d'),
                                   kind='zero_volume_flat_candle',
                                   detail='Investigate source; do not automatically remove or fill.'))
    return dict(status='review_required' if issues else 'cross_source_checks_passed',
                official_calendar_verified=False,
                note='Cross-source checks do not independently verify the exchange calendar or source authenticity.',
                counts={symbol: len(data[symbol]) for symbol in domestic}, issues=issues)


def save_audit(audit, directory: Path):
    directory.mkdir(parents=True, exist_ok=True)
    (directory / 'data-audit.json').write_text(json.dumps(audit, indent=2), encoding='utf-8')
    pd.DataFrame(audit['issues'], columns=['ticker', 'date', 'kind', 'detail']).to_csv(
        directory / 'data-issues.csv', index=False)
