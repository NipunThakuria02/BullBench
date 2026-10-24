from pathlib import Path

START = "2021-10-01"
END = "2026-10-16"  # Inclusive; Yahoo's API end parameter is exclusive.
ASSETS = ("HDFCBANK.NS", "ICICIBANK.NS", "TCS.NS", "RELIANCE.NS", "TATASTEEL.NS", "^NSEI")
SECTORS = {"HDFCBANK.NS": "^NSEBANK", "ICICIBANK.NS": "^NSEBANK", "TCS.NS": "^CNXIT", "RELIANCE.NS": "^CNXENERGY", "TATASTEEL.NS": "^CNXMETAL", "^NSEI": "^NSEI"}
CONTEXT = ("^NSEBANK", "^CNXIT", "^CNXENERGY", "^CNXMETAL", "^INDIAVIX", "^GSPC", "INR=X", "CL=F")
TICKERS = tuple(dict.fromkeys((*ASSETS, *CONTEXT)))
MODELS = ("Naive", "Ridge", "ARIMA", "RandomForest", "XGBoost")

def cache_path(directory: Path, ticker: str) -> Path:
    return directory / (ticker.replace("^", "INDEX_").replace("=", "_") + ".csv")
