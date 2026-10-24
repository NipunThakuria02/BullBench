"""Paired diagnostics; resample date blocks with all assets/models kept together."""
import numpy as np
import pandas as pd
from .config import MODELS, END


def direction_score(actual, predicted):
    product = np.sign(actual) * np.sign(predicted)
    return np.where(product > 0, 1., np.where(product < 0, 0., .5))


def complete_quarters(table):
    end = pd.Timestamp(END)
    return table[table.fold.map(lambda value: pd.Timestamp(value) + pd.DateOffset(months=3)
                               - pd.Timedelta(days=1) <= end)]


def directional_reference(predictions):
    if 'majority_direction' not in predictions:
        return pd.DataFrame(columns=['stock', 'model', 'n', 'direction_score',
                                     'majority_score', 'direction_advantage'])
    rows = []
    for (stock, model), part in predictions.groupby(['stock', 'model']):
        own = direction_score(part.actual_return, part.predicted_return).mean()
        reference = direction_score(part.actual_return, part.majority_direction).mean()
        rows.append(dict(stock=stock, model=model, n=len(part), direction_score=own,
                         majority_score=reference, direction_advantage=own-reference))
    return pd.DataFrame(rows)


def uncertainty(predictions, repetitions=4000, block_length=20, seed=42):
    """Circular moving-block bootstrap; conditional on these assets and fitted forecasts.

    Pointwise 95% intervals plus Bonferroni intervals across four models x available
    endpoints (equal-weight price MAE skill, return RMSE skill, direction advantage). No independent-row assumption.
    These approximate intervals do not correct post-hoc methodology selection.
    """
    p = predictions.copy()
    p['error2'] = (p.predicted_return-p.actual_return)**2
    has_reference = 'majority_direction' in p
    p['direction_delta'] = (direction_score(p.actual_return, p.predicted_return)
        - direction_score(p.actual_return, p.majority_direction)) if has_reference else np.nan
    dates = sorted(p.date.unique())
    n = len(dates)
    if n < 2 * block_length:
        return pd.DataFrame(), {'status': 'insufficient_dates', 'dates': n}
    sums = p.groupby(['date', 'model'])[['error2', 'direction_delta']].sum(min_count=1)
    errors = sums.error2.unstack().reindex(index=dates, columns=MODELS).to_numpy()
    directions = sums.direction_delta.unstack().reindex(index=dates, columns=MODELS).to_numpy()
    counts = p.groupby(['date', 'model']).size().unstack().reindex(index=dates, columns=MODELS).to_numpy()
    if np.isnan(errors).any() or np.isnan(counts).any():
        raise ValueError('Bootstrap requires all five comparators on every included date')
    assets = sorted(p.stock.unique())
    p['price_abs_error'] = (p.predicted_price-p.actual_price).abs()
    grid = pd.MultiIndex.from_product([dates, assets, MODELS], names=['date','stock','model'])
    price_errors = p.set_index(['date','stock','model']).price_abs_error.reindex(grid).to_numpy().reshape(n,len(assets),len(MODELS))
    price_counts = np.isfinite(price_errors).astype(float)
    rng = np.random.default_rng(seed)
    skill_samples, direction_samples, price_samples = [], [], []
    for start in range(0, repetitions, 128):
        batch = min(128, repetitions-start)
        starts = rng.integers(0, n, size=(batch, int(np.ceil(n/block_length))))
        indices = ((starts[..., None] + np.arange(block_length)) % n).reshape(batch, -1)[:, :n]
        denominator = counts[indices].sum(axis=1)
        mse = errors[indices].sum(axis=1) / denominator
        skill_samples.append(1-np.sqrt(mse/mse[:, :1]))
        price_denominator = price_counts[indices].sum(axis=1)
        price_totals = np.nansum(price_errors[indices], axis=1)
        price_mae = np.divide(price_totals, price_denominator,
                              out=np.full_like(price_totals, np.nan), where=price_denominator > 0)
        price_skill = 1-np.divide(price_mae, price_mae[:, :, :1],
                                  out=np.full_like(price_mae,np.nan), where=price_mae[:, :, :1] > 0)
        valid_assets = np.isfinite(price_skill).sum(axis=1)
        price_samples.append(np.divide(np.nansum(price_skill,axis=1), valid_assets,
                             out=np.full((batch,len(MODELS)),np.nan),where=valid_assets>0))
        if has_reference:
            direction_samples.append(directions[indices].sum(axis=1)/denominator)
    samples = {'mean_asset_price_mae_skill': np.concatenate(price_samples), 'rmse_skill': np.concatenate(skill_samples)}
    if has_reference:
        samples['direction_advantage'] = np.concatenate(direction_samples)
    rows = []
    family_size = 4 * len(samples)
    for endpoint, values in samples.items():
        for column, model in enumerate(MODELS):
            if model == 'Naive':
                continue
            usable = values[:, column][np.isfinite(values[:, column])]
            if not len(usable):
                continue
            low, high = np.quantile(usable, [.025, .975])
            adjusted_low, adjusted_high = np.quantile(usable,
                [.05/(2*family_size), 1-.05/(2*family_size)])
            rows.append(dict(model=model, endpoint=endpoint, low_95=low, high_95=high,
                             simultaneous_low_95=adjusted_low, simultaneous_high_95=adjusted_high))
    return pd.DataFrame(rows), dict(status='computed', method='circular moving date-block bootstrap',
        repetitions=repetitions, block_length=block_length, seed=seed, dates=n,
        family_size=family_size, adjustment='Bonferroni across four models and available endpoints',
        limitation='Approximate conditional intervals; assets are fixed, forecasts are not refitted; post-hoc selection is not corrected.')
