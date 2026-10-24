import numpy as np
import pandas as pd
from .config import START
from .features import make_features, feature_columns
from .models import predict_models


def folds(index):
    boundary = pd.Timestamp(START) + pd.DateOffset(years=2)
    while boundary <= index.max():
        stop = boundary + pd.DateOffset(months=3)
        train = index[index < boundary]
        test = index[(index >= boundary) & (index < stop)]
        if len(train) >= 252 and len(test):
            yield boundary, train, test
        boundary = stop


def evaluate(data, assets):
    rows = []
    fold_records = []
    for ticker in assets:
        frame = make_features(data, ticker)
        columns = feature_columns(frame)
        for boundary, train_idx, test_idx in folds(frame.index):
            train, test = frame.loc[train_idx], frame.loc[test_idx]
            # Training-only regime threshold, frozen over the test block.
            threshold = train["market_vol"].quantile(0.75)
            majority = 1 if (train.target > 0).sum() >= (train.target < 0).sum() else -1
            fold_records.append(dict(stock=ticker, fold=str(boundary.date()),
                training_first=str(train.index.min().date()), training_last=str(train.index.max().date()),
                training_rows=len(train), test_rows=len(test), columns=columns,
                regime_threshold=float(threshold), majority_direction=majority))
            try:
                predictions = predict_models(train, test, columns)
            except Exception as error:
                raise RuntimeError(f"Model fit failed for {ticker}, quarter {boundary.date()}: {error}") from error
            for model, values in predictions.items():
                values = np.asarray(values, dtype=np.float64)
                block = pd.DataFrame({"date": test.index, "stock": ticker, "fold": boundary.strftime("%Y-%m-%d"), "model": model, "actual_return": test.target.to_numpy(), "predicted_return": values, "origin_close": test.origin_close.to_numpy(), "actual_price": test.actual_close.to_numpy(), "predicted_price": test.origin_close.to_numpy() * (1 + values), "regime": np.where(test.market_vol.to_numpy() > threshold, "volatile", "calm"), "regime_threshold": threshold})
                block['majority_direction'] = majority
                rows.append(block)
            print(f"Evaluated {ticker} quarter {boundary.date()} ({len(test)} sessions)", flush=True)
    if not rows:
        raise ValueError("No walk-forward folds available")
    result = pd.concat(rows, ignore_index=True)
    result.attrs['fold_records'] = fold_records
    return result


def metrics(frame, include_prices=True):
    actual, pred = frame.actual_return.to_numpy(), frame.predicted_return.to_numpy()
    error = pred - actual
    # Zero forecasts/actuals receive half-credit; report trade direction coverage.
    direction = np.sign(actual) * np.sign(pred)
    result = {"n": len(frame), "mae": np.abs(error).mean(), "rmse": np.sqrt(np.mean(error ** 2)), "directional_accuracy": np.where(direction > 0, 1.0, np.where(direction < 0, 0.0, 0.5)).mean(), "direction_coverage": (pred != 0).mean(), "mean_error": error.mean(), "prediction_std": np.std(pred), "actual_std": np.std(actual)}

    if include_prices and {'actual_price', 'predicted_price', 'origin_close'}.issubset(frame.columns):
        price_error = frame.predicted_price.to_numpy() - frame.actual_price.to_numpy()
        result.update(price_mae=np.abs(price_error).mean(),
                      price_rmse=np.sqrt(np.mean(price_error ** 2)),
                      price_bias=price_error.mean(),
                      price_nmae=np.abs(price_error).mean()/frame.actual_price.mean())
    return result


def summarize(predictions, groups):
    rows = []
    for key, part in predictions.groupby(groups, sort=True):
        key = key if isinstance(key, tuple) else (key,)
        rows.append(dict(zip(groups, key)) | metrics(part, include_prices="stock" in groups))
    result = pd.DataFrame(rows)
    keys = [c for c in groups if c != "model"]
    baseline = result.loc[result.model == "Naive", keys + ["rmse"]].rename(columns={"rmse": "naive_rmse"})
    if keys:
        result = result.merge(baseline, on=keys, validate="many_to_one")
    else:
        result["naive_rmse"] = baseline.naive_rmse.iloc[0]
    result["rmse_skill"] = 1 - result.rmse / result.naive_rmse.where(result.naive_rmse != 0)
    if 'price_mae' in result:
        prices = result.loc[result.model == 'Naive', keys + ['price_mae', 'price_rmse']].rename(
            columns={'price_mae': 'naive_price_mae', 'price_rmse': 'naive_price_rmse'})
        result = result.merge(prices, on=keys, validate='many_to_one')
        result['price_mae_skill'] = 1 - result.price_mae / result.naive_price_mae.where(result.naive_price_mae != 0)
        result['price_rmse_skill'] = 1 - result.price_rmse / result.naive_price_rmse.where(result.naive_price_rmse != 0)
    return result
