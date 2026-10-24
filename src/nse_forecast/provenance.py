"""Shared source metadata checks for cached inputs and dashboard exports."""
import re
from urllib.parse import urlsplit
from .config import START, END

SECTOR_NAMES = {'^CNXENERGY': 'NIFTY ENERGY', '^CNXMETAL': 'NIFTY METAL'}


def public_source_url(value):
    if not isinstance(value, str):
        return False
    try:
        url = urlsplit(value)
        return url.scheme == 'https' and bool(url.hostname) and not (url.username or url.password or url.query or url.fragment)
    except ValueError:
        return False


def valid_hash(value):
    return isinstance(value, str) and re.fullmatch(r'[0-9a-f]{64}', value) is not None


def valid_provenance(info, ticker):
    if not isinstance(info, dict) or info.get('ticker') != ticker or info.get('start') != START or info.get('end_inclusive') != END or not valid_hash(info.get('sha256')):
        return False
    if info.get('source') == 'yfinance':
        return info.get('auto_adjust') is True
    if info.get('source') != 'external_csv' or ticker not in SECTOR_NAMES:
        return False
    files = info.get('input_files')
    return (info.get('index_name') == SECTOR_NAMES[ticker]
            and info.get('price_basis') == 'price_index'
            and public_source_url(info.get('source_url'))
            and isinstance(files, list) and bool(files)
            and all(isinstance(item, dict) and isinstance(item.get('filename'), str)
                    and bool(item['filename']) and valid_hash(item.get('sha256')) for item in files))
