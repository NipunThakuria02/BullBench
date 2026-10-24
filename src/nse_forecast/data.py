import hashlib
import json
from pathlib import Path
import pandas as pd
import numpy as np
from .config import START, END, TICKERS, cache_path
from .provenance import valid_provenance


def validate(frame: pd.DataFrame, ticker: str) -> pd.DataFrame:
    if "Close" not in frame or frame.empty:
        raise ValueError(f"{ticker}: missing Close prices or empty history")
    frame = frame.copy()
    frame.index = pd.DatetimeIndex(pd.to_datetime(frame.index)).tz_localize(None).normalize()
    if frame.index.has_duplicates or not frame.index.is_monotonic_increasing:
        raise ValueError(f"{ticker}: dates must be unique and sorted")
    frame = frame.loc[START:END]
    close = pd.to_numeric(frame["Close"], errors="raise")
    if not np.isfinite(close).all() or (close <= 0).any():
        raise ValueError(f"{ticker}: invalid close prices")
    if len(frame) < 500:
        first = str(frame.index.min().date()) if len(frame) else "none"
        last = str(frame.index.max().date()) if len(frame) else "none"
        raise ValueError(f"{ticker}: only {len(frame)} daily observations ({first} through {last}); at least 500 spanning {START} through {END} are required")
    if frame.index.min() > pd.Timestamp(START) + pd.Timedelta(days=10) or frame.index.max() != pd.Timestamp(END):
        raise ValueError(f"{ticker}: cache does not cover the fixed date range")
    frame["Close"] = close
    return frame


def download(directory: Path, refresh: bool = False) -> None:
    import yfinance as yf
    directory.mkdir(parents=True, exist_ok=True)
    yf.set_tz_cache_location(str(directory / ".yfinance"))
    failures = []
    for ticker in TICKERS:
        path = cache_path(directory, ticker)
        try:
            imported = False
            if path.exists() and refresh:
                try:
                    info = json.loads(path.with_suffix(".json").read_text())
                    imported = isinstance(info, dict) and info.get("source") == "external_csv"
                except (ValueError, OSError):
                    pass
            if path.exists() and (not refresh or imported):
                cached = read_cached(directory, ticker)
                print(f"Using cached {ticker}: {len(cached)} rows", flush=True)
                continue
            frame = yf.download(ticker, start=START, end=(pd.Timestamp(END) + pd.Timedelta(days=1)).strftime("%Y-%m-%d"), auto_adjust=True, progress=False, threads=False, multi_level_index=False)
            frame = validate(frame, ticker)
            temporary = path.with_suffix(".csv.tmp")
            frame.to_csv(temporary, index_label="Date")
            temporary.replace(path)
            metadata = {"ticker": ticker, "source": "yfinance", "auto_adjust": True, "start": START, "end_inclusive": END, "downloaded_utc": pd.Timestamp.now(tz="UTC").isoformat(), "rows": len(frame), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
            path.with_suffix(".json").write_text(json.dumps(metadata, indent=2))
            print(f"Cached {ticker}: {len(frame)} rows", flush=True)
        except (ValueError, OSError) as error:
            failures.append(str(error))
            print(f"Unavailable: {error}", flush=True)
    if failures:
        raise ValueError("Download incomplete. Valid caches were retained; evaluation requires every series.\n" + "\n".join(failures))


def read_cached(directory: Path, ticker: str) -> pd.DataFrame:
    path = cache_path(directory, ticker)
    if not path.exists():
        raise FileNotFoundError(f"Missing {path}; run 'nse-forecast download' with network access first.")
    metadata = path.with_suffix(".json")
    if not metadata.exists():
        raise ValueError(f"{ticker}: missing cache provenance metadata; download --refresh")
    info = json.loads(metadata.read_text())
    if not valid_provenance(info, ticker) or info.get("sha256") != hashlib.sha256(path.read_bytes()).hexdigest():
        raise ValueError(f"{ticker}: cache provenance or checksum mismatch; redownload Yahoo data or reimport the original sector CSVs")
    return validate(pd.read_csv(path, index_col=0, parse_dates=True), ticker)


def load(directory: Path) -> dict[str, pd.DataFrame]:
    return {ticker: read_cached(directory, ticker) for ticker in TICKERS}
