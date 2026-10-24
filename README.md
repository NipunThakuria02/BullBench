# BullBench

**Next-session closing-value forecasting for NSE equities**

A rigorous walk-forward evaluation framework that compares five forecasting models on six NSE assets. The goal is to measure how closely each approach predicts the next session's closing value and whether it meaningfully improves on the previous-close naive baseline. No model is assumed to win a priori.

---

## Table of Contents

- [Overview](#overview)
- [Research Scope](#research-scope)
- [Models](#models)
- [Features](#features)
- [Project Structure](#project-structure)
- [Requirements](#requirements)
- [Usage](#usage)
- [Dashboard](#dashboard)
- [Development](#development)
- [Limitations](#limitations)

---

## Overview

BullBench evaluates five return-forecasting strategies under a strict expanding walk-forward validation protocol. Predictions are made in next-session adjusted close-to-close return space and then reconstructed to closing price as:

```
predicted_close = previous_observed_close * (1 + predicted_return)
```

Accuracy is measured per asset using closing-value MAE and RMSE, with improvement over the naive (previous-close) baseline as the primary criterion. Cross-asset comparisons use the equal-weight mean of per-asset baseline-relative error improvements. Raw currency and index-point errors are never pooled across assets.

---

## Research Scope

| Parameter | Value |
|---|---|
| Assets | HDFCBANK.NS, ICICIBANK.NS, TCS.NS, RELIANCE.NS, TATASTEEL.NS, ^NSEI |
| Data range | 2021-10-01 through 2026-10-16 (inclusive) |
| Validation | Expanding walk-forward, 2-year initial window, 3-month test blocks, quarterly refits |
| Primary metric | Closing-value MAE per asset, with RMSE and baseline-relative skill score |
| Units | Adjusted INR closes for equities; index points for Nifty 50 |

Supporting diagnostics include return errors, directional accuracy, per-quarter and per-regime breakdowns, lagged volatility regimes, and uncertainty intervals. There is no combined pass/fail realism flag.

---

## Models

| Model | Description |
|---|---|
| **Naive** | Predicts zero return (previous close carried forward). Serves as the baseline. |
| **Ridge** | Regularised linear regression with training-only StandardScaler (`alpha=10`). |
| **ARIMA** | ARIMA(1,0,1) with constant trend. State updated after each observed outcome without parameter refitting. Target multiplied by 100 for numerical conditioning. |
| **Random Forest** | 150 trees, max depth 6, min samples per leaf 15 (`random_state=42`). |
| **XGBoost** | 150 rounds, max depth 3, learning rate 0.03, L2 regularisation 10, histogram method on CPU (`random_state=42`). |

All supervised models are fitted once per quarterly fold on training data only. Preprocessing thresholds (scaler statistics, regime quantiles) are computed exclusively on training partitions and held fixed over each test block.

---

## Features

Predictors are constructed to be available at or before 18:00 IST on the preceding NSE session, reflecting a realistic information cutoff.

**Own-asset features**

- Lagged returns: lags 1, 2, 3, 5, 10
- Rolling volatility: 5, 10, 20, 60-day windows (shifted by one session)
- Rolling mean return: 5, 10, 20, 60-day windows (shifted by one session)

**Context features** (aligned to information-cutoff timestamps)

| Feature | Source | Availability assumption |
|---|---|---|
| Nifty 50 return | ^NSEI | 18:00 IST on source date |
| Sector index return | ^NSEBANK / ^CNXIT / ^CNXENERGY / ^CNXMETAL | 18:00 IST on source date |
| India VIX return and level | ^INDIAVIX | 18:00 IST on source date |
| S&P 500 return | ^GSPC | 18:00 US Eastern (DST-aware) |
| USD/INR return | INR=X | 06:00 UTC next day |
| Crude oil return | CL=F | 06:00 UTC next day |

Context returns are computed on native source calendars before backward availability-time alignment using `merge_asof` with a 7-day tolerance. Market volatility (20-session rolling) from Nifty 50 is used to label each test session's volatility regime (volatile vs. calm), with the regime threshold set from the training fold's 75th percentile.

---

## Project Structure

```
STOCK-main/
├── src/
│   └── nse_forecast/
│       ├── cli.py             # Command-line interface
│       ├── config.py          # Asset list, date range, context tickers
│       ├── data.py            # Download and cache management (yfinance)
│       ├── features.py        # Feature engineering and context alignment
│       ├── models.py          # Model definitions and hyperparameters
│       ├── evaluate.py        # Walk-forward evaluation loop and metrics
│       ├── diagnostics.py     # Per-quarter and per-regime diagnostics
│       ├── report.py          # HTML report generation
│       ├── web.py             # Local web server and JSON export
│       ├── audit.py           # Data quality audit
│       ├── import_csv.py      # Sector index CSV import utility
│       ├── history.py         # Historical chart data
│       └── provenance.py      # Data provenance tracking
├── web/                       # React/TypeScript frontend (Vite)
│   └── src/
│       ├── main.tsx           # Dashboard application
│       ├── charts.tsx         # Chart components
│       ├── data.ts            # Data loading and formatting
│       ├── assets.ts          # Asset metadata
│       ├── history.ts         # Historical chart data handling
│       ├── equations.tsx      # KaTeX equation rendering
│       └── styles.css         # Application styles
├── data/                      # yfinance CSV cache and provenance JSON files
├── reports/                   # Evaluation outputs (predictions, run metadata, HTML report)
├── reports-price-comparison/  # Price-comparison rendered reports
├── reports-v2-exploratory/    # Exploratory evaluation outputs
├── docs/                      # Research documentation
│   ├── RESEARCH_REVISION.md
│   ├── IMPORT_SECTOR_CSVS.md
│   ├── DATA_AVAILABILITY.md
│   └── DEVELOPMENT_TOOLS.md
├── scripts/
│   └── setup.sh               # Unix setup script
├── tests/                     # Python test suite (pytest)
├── pyproject.toml
├── requirements.lock
└── vercel.json
```

---

## Requirements

| Component | Version |
|---|---|
| Python | 3.12 recommended (>=3.11 required) |
| Node.js | 22 LTS recommended (>=20.19.0 required) |
| numpy | >=1.26, <3 |
| pandas | >=2.2, <3 |
| scikit-learn | >=1.5, <2 |
| statsmodels | >=0.14, <0.15 |
| xgboost | >=2.1, <4 |
| yfinance | >=0.2.54, <1 |
| React | 19 |
| Vite | 6 |

---


## Dashboard

The React/TypeScript frontend (built with Vite) provides a BullBench homepage with search limited to the six study assets. Each asset page contains:

- **Overview** -- Summary metrics and model rankings
- **Chart** -- Full cached historical chart with hover/touch values, volume, and moving averages
- **Model comparison** -- Side-by-side accuracy metrics across all five models
- **Analysis** -- Per-quarter and per-regime diagnostics
- **Forecast ledger** -- Filterable and exportable table of all predictions
- **Methodology** -- Description of the validation protocol and feature construction

Model charts include price, error, and return views with quarter and regime filters. The ledger exports every filtered row as CSV. Missing results are prominently labeled as examples; invalid results display an error message. Nifty 50 levels are shown in index points.

---

## Development

### Run Python tests

```cmd
.\.venv\Scripts\python.exe -m pytest -q
```

### Run frontend browser tests

```cmd
npm --prefix web ci
npm --prefix web run build
npm --prefix web test
```

Browser tests use the built frontend and Playwright with Chromium. See [docs/DEVELOPMENT_TOOLS.md](docs/DEVELOPMENT_TOOLS.md) for optional development tooling.

### Contribution guidelines

- Do not commit virtual environments, market data caches, browser cookies, or generated reports.
- Do not trigger automatic push or deployment from local builds.
- All preprocessing (scalers, regime thresholds) must be computed on training data only.
- Do not alter the already-inspected exploratory test period; revised reports do not convert it to an untouched final test set.

---

## Limitations

- This is a historical evaluation, not a live data feed, recursive multi-day forecast, trading strategy, or profitability claim.
- Availability assumptions for context features are conservative daily-bar approximations, not provider-level publication timestamps. Special trading sessions require individual calendar review.
- Historical adjusted values may differ from original exchange quotes due to corporate actions.
- The already-inspected test period is labeled exploratory and cannot be treated as a held-out final test.
- Cross-asset skill comparisons use equal-weight averaging of baseline-relative improvements. Raw price errors across equities and the Nifty index are never aggregated directly.

---

