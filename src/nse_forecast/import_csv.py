"""Import real historical sector-index CSVs without changing the study's indices."""
from datetime import datetime
import glob
import hashlib
import json
from pathlib import Path
import re
import pandas as pd
from .config import START, END, cache_path
from .data import read_cached, validate
from .provenance import SECTOR_NAMES, public_source_url

OFFICIAL_SOURCE = 'https://www.niftyindices.com/reports/historical-data'


def normalized(value):
    return re.sub(r'[^a-z0-9]', '', str(value).strip().lower())


def parse_date(value):
    for pattern in ('%Y-%m-%d', '%d-%b-%Y', '%d %b %Y', '%d/%m/%Y', '%d-%m-%Y'):
        try:
            return datetime.strptime(str(value).strip(), pattern)
        except ValueError:
            pass
    raise ValueError(f'Unsupported date {value!r}; use ISO YYYY-MM-DD or day-first dates such as 01-Oct-2021')


def read_index_csv(path, ticker):
    raw = pd.read_csv(path, dtype=str, encoding='utf-8-sig')
    columns = {normalized(column): column for column in raw.columns}
    if len(columns) != len(raw.columns):
        raise ValueError(f'{path.name}: ambiguous duplicate column names')
    date_column = next((columns[key] for key in ('date', 'indexdate', 'historicaldate', 'pricedate') if key in columns), None)
    close_column = next((columns[key] for key in ('close', 'closingvalue', 'closingindexvalue', 'closeprice', 'closingprice', 'indexvalue') if key in columns), None)
    if date_column is None or close_column is None:
        raise ValueError(f'{path.name}: expected Date and Close (or Closing Value) columns')
    name_column = columns.get('indexname')
    if name_column is not None:
        names = {normalized(name) for name in raw[name_column]}
        if names != {normalized(SECTOR_NAMES[ticker])}:
            raise ValueError(f'{path.name}: index names do not match {SECTOR_NAMES[ticker]}')
    dates = pd.DatetimeIndex(raw[date_column].map(parse_date))
    values = pd.to_numeric(raw[close_column].str.replace(',', '', regex=False).str.strip(), errors='raise')
    return pd.DataFrame({'Close': values.to_numpy()}, index=dates)


def import_sector(files, ticker, directory, source_url=OFFICIAL_SOURCE, replace=False):
    if ticker not in SECTOR_NAMES:
        raise ValueError('Only the original Energy and Metal sector indices can be imported')
    if not public_source_url(source_url):
        raise ValueError('Use a public HTTPS source-page URL without credentials, query parameters, or fragments')
    paths = []
    for pattern in files:
        matched = sorted(glob.glob(str(pattern)))
        if not matched:
            raise FileNotFoundError(f'No CSV files match {pattern}')
        paths.extend(Path(path) for path in matched)
    paths = list(dict.fromkeys(path.resolve() for path in paths))
    if not paths or any(path.suffix.lower() != '.csv' or not path.is_file() for path in paths):
        raise ValueError('Supply at least one existing CSV file')
    combined = pd.concat([read_index_csv(path, ticker) for path in paths]).sort_index()
    if (combined.groupby(level=0).Close.nunique(dropna=False) > 1).any():
        raise ValueError('Conflicting closing values for overlapping dates; correct the source CSVs')
    combined = combined.loc[~combined.index.duplicated(keep='first')]
    frame = validate(combined, ticker)
    # A row-count threshold alone cannot detect missing months inside the range.
    reference = read_cached(directory, '^NSEI')
    missing = reference.index.difference(frame.index)
    if len(missing):
        sample = ', '.join(day.strftime('%Y-%m-%d') for day in missing[:5])
        raise ValueError(f'{ticker}: missing {len(missing)} Nifty trading sessions, including {sample}; download the missing date ranges')
    path = cache_path(directory, ticker)
    if path.exists() and not replace:
        raise ValueError(f'{path} already exists; use --replace to replace this sector cache explicitly')
    metadata = {'ticker': ticker, 'source': 'external_csv', 'source_url': source_url,
                'index_name': SECTOR_NAMES[ticker], 'price_basis': 'price_index',
                'start': START, 'end_inclusive': END,
                'imported_utc': pd.Timestamp.now(tz='UTC').isoformat(), 'rows': len(frame),
                'input_files': [{'filename': file.name, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()} for file in paths]}
    directory.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.csv.tmp')
    frame.to_csv(temporary, index_label='Date')
    metadata['sha256'] = hashlib.sha256(temporary.read_bytes()).hexdigest()
    temporary.replace(path)
    path.with_suffix('.json').write_text(json.dumps(metadata, indent=2))
    print(f'Imported {SECTOR_NAMES[ticker]}: {len(frame)} rows from {len(paths)} CSV file(s). Source: {source_url}', flush=True)
