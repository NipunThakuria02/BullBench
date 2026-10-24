import warnings
import numpy as np
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge
from sklearn.ensemble import RandomForestRegressor
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tools.sm_exceptions import ConvergenceWarning
from xgboost import XGBRegressor


def predict_models(train, test, columns):
    """Fit once per quarter; ARIMA filters observed returns without refitting."""
    x, y = train[columns], train["target"]
    models = {
        "Ridge": make_pipeline(StandardScaler(), Ridge(alpha=10.0)),
        "RandomForest": RandomForestRegressor(n_estimators=150, max_depth=6, min_samples_leaf=15, random_state=42, n_jobs=2),
        "XGBoost": XGBRegressor(n_estimators=150, max_depth=3, learning_rate=0.03, min_child_weight=15, subsample=0.8, colsample_bytree=0.8, reg_lambda=10, objective="reg:squarederror", random_state=42, n_jobs=1, tree_method="hist", device="cpu"),
    }
    predictions = {"Naive": np.zeros(len(test))}
    for name, model in models.items():
        model.fit(x, y)
        predictions[name] = model.predict(test[columns])
    # Scaling improves numerical conditioning for small decimal returns.
    with warnings.catch_warnings():
        warnings.simplefilter("error", ConvergenceWarning)
        fitted = ARIMA(y.to_numpy() * 100, order=(1, 0, 1), trend="c").fit(method_kwargs={"maxiter": 300})
    arima = []
    for observed in test["target"]:
        arima.append(float(fitted.forecast(1)[0]) / 100)
        fitted = fitted.append([observed * 100], refit=False)
    predictions["ARIMA"] = np.asarray(arima)
    if any(not np.isfinite(v).all() for v in predictions.values()):
        raise ValueError("A model produced non-finite forecasts")
    return predictions


def model_configuration():
    return {
        'Naive': {'return': 0.0},
        'Ridge': {'alpha': 10.0, 'scaler': 'training-only StandardScaler'},
        'RandomForest': {'n_estimators': 150, 'max_depth': 6, 'min_samples_leaf': 15,
                         'random_state': 42, 'n_jobs': 2},
        'XGBoost': {'n_estimators': 150, 'max_depth': 3, 'learning_rate': .03,
                    'min_child_weight': 15, 'subsample': .8, 'colsample_bytree': .8,
                    'reg_lambda': 10, 'objective': 'reg:squarederror', 'random_state': 42,
                    'n_jobs': 1, 'tree_method': 'hist', 'device': 'cpu'},
        'ARIMA': {'order': [1, 0, 1], 'trend': 'c', 'target_multiplier': 100,
                  'maxiter': 300, 'state_update': 'after outcome, no parameter refit'},
    }
