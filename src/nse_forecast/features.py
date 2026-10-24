import numpy as np
import pandas as pd
from .config import SECTORS

TIMING_POLICY = {
    'forecast_cutoff': '18:00 Asia/Kolkata on the preceding observed NSE session',
    'domestic_available': '18:00 Asia/Kolkata on source date',
    'sp500_available': '18:00 America/New_York on source date (DST aware)',
    'fx_crude_available': '06:00 UTC on the day after source date',
    'max_age': '7 calendar days',
    'limitation': 'Conservative daily-bar availability assumptions, not provider publication timestamps. Special sessions require calendar review.',
}


def availability(index, name):
    dates = pd.DatetimeIndex(index)
    if name == 'sp500':
        return (dates + pd.Timedelta(hours=18)).tz_localize('America/New_York').tz_convert('UTC')
    if name in ('crude', 'usdinr'):
        return (dates + pd.Timedelta(days=1, hours=6)).tz_localize('UTC')
    return (dates + pd.Timedelta(hours=18)).tz_localize('Asia/Kolkata').tz_convert('UTC')


def align_context(close, origins, name):
    """Calculate native-session returns BEFORE aligning to forecast information time."""
    source = pd.DataFrame({'available': availability(close.index, name),
                           'level': close.to_numpy(),
                           'return': close.pct_change(fill_method=None).to_numpy()})
    source['vol'] = close.pct_change(fill_method=None).rolling(20).std().to_numpy()
    cutoffs = availability(origins, 'domestic')
    result = pd.merge_asof(pd.DataFrame({'cutoff': cutoffs}), source,
                           left_on='cutoff', right_on='available', direction='backward',
                           tolerance=pd.Timedelta(days=7))
    return result


def make_features(data: dict[str, pd.DataFrame], ticker: str) -> pd.DataFrame:
    """Rows are target sessions; predictors are available at the preceding cutoff."""
    close = data[ticker]['Close']
    returns = close.pct_change(fill_method=None)
    out = pd.DataFrame(index=close.index)
    for lag in (1, 2, 3, 5, 10):
        out[f'return_lag_{lag}'] = returns.shift(lag)
    for window in (5, 10, 20, 60):
        out[f'vol_{window}'] = returns.rolling(window).std().shift(1)
        out[f'mean_{window}'] = returns.rolling(window).mean().shift(1)
    for name, symbol in (('index', '^NSEI'), ('sector', SECTORS[ticker]),
                         ('vix', '^INDIAVIX'), ('sp500', '^GSPC'),
                         ('usdinr', 'INR=X'), ('crude', 'CL=F')):
        context = align_context(data[symbol]['Close'], close.index[:-1], name)
        out.loc[close.index[1:], f'{name}_return'] = context['return'].to_numpy()
        if name == 'vix':
            out.loc[close.index[1:], 'vix_level'] = context.level.to_numpy()
        if name == 'index':
            out.loc[close.index[1:], 'market_vol'] = context.vol.to_numpy()
    out['origin_close'] = close.shift(1)
    out['actual_close'] = close
    out['target'] = returns
    return out.replace([np.inf, -np.inf], np.nan).dropna()


def feature_columns(frame: pd.DataFrame) -> list[str]:
    return [c for c in frame if c not in ('target', 'origin_close', 'actual_close')]
