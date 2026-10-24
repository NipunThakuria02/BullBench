# BullBench — next-session closing-value forecasting

Compare Naive, Ridge, ARIMA, Random Forest and XGBoost on five NSE stocks plus Nifty 50. The objective is to measure how closely each approach predicts the next session's closing value and whether it improves on the previous-close naive forecast. No model is presumed to win.

**BullBench frontend update:** Read [BULLBENCH_UPDATE.md](BULLBENCH_UPDATE.md) for installation, full-history chart requirements and design details.

**Price-comparison research update:** Read [PRICE_UPDATE.md](PRICE_UPDATE.md). It includes Windows commands, file placement and a workflow using saved forecasts without retraining. [START_HERE.md](START_HERE.md) covers a fresh installation.

## Research contract

- Fixed assets: HDFCBANK.NS, ICICIBANK.NS, TCS.NS, RELIANCE.NS, TATASTEEL.NS and ^NSEI.
- Fixed inclusive data range: 2021-10-01 through 2026-10-16.
- Predict next-session adjusted close-to-close returns internally; reconstruct closing value as `previous observed close * (1 + predicted return)`.
- Primary comparison: closing-value MAE within each asset, with RMSE for large misses and improvement over naive. Stock units are adjusted INR closes; Nifty units are points. Historical adjusted values are not necessarily the original exchange quotes.
- Cross-asset comparison: equal-weight mean of per-asset baseline-relative error improvements. Never pool raw currency/index-point errors across assets.
- Expanding walk-forward validation: two calendar years initially (including feature warmup), three-month tests and quarterly refits; training-only preprocessing and regime thresholds.
- Return errors, direction, quarters, lagged volatility regimes and paired date-block uncertainty are supporting evidence. No combined realism pass/fail flag.

Features include lagged returns, rolling means/volatility, domestic index/sector/VIX context, S&P 500, USD/INR and crude. Context returns are computed on native source calendars before backward availability-time alignment. See [the research revision](docs/RESEARCH_REVISION.md) and [the price update](PRICE_UPDATE.md) for timing and uncertainty assumptions.

## Use saved forecasts now

From the existing project root on Windows:

```cmd
npm --prefix web run build
.\.venv\Scripts\python.exe -m nse_forecast.cli render-report --reports reports-v2-exploratory --output reports-price-comparison
.\.venv\Scripts\python.exe -m nse_forecast.web --port 8000 --reports reports-price-comparison
```

Open http://127.0.0.1:8000 locally. Use a new output directory if one already contains results. No model fitting or network data download occurs during rendering. Original predictions and the training manifest are copied unchanged; presentation metadata goes into `render.json`.

## Data and new evaluations

Use yfinance CSV caches for available histories and genuine Nifty Energy/Metal price-index CSVs for the two unavailable Yahoo histories. Follow [the import guide](docs/IMPORT_SECTOR_CSVS.md). No broker account, paid API or runtime Ponytail/Graphify installation is needed.

Run `python -m nse_forecast.cli audit-data --output audit` before evaluation, using the project Python interpreter. Known cross-source calendar discrepancies need verification. Default evaluation stops on unresolved audit findings. An explicit `--allow-unverified-calendar` enables only a clearly labeled exploratory run into a new output directory. Do not invent missing prices or automatically delete suspicious candles. The already inspected test period remains exploratory; revised reports do not make it an untouched final test.

## Dashboard and outputs

The React/TypeScript site opens on a BullBench homepage with working search limited to the six study assets. Each asset has Overview, Chart, Model comparison, Analysis, Forecast ledger and Methodology sections. Full cached historical charts include hover/touch values, available volume and moving averages; model charts retain price/error/return views and quarter/regime filters. The ledger exports every filtered row. Missing results use prominently labeled examples; invalid results display an error. Nifty levels use points.

The standalone report includes accuracy rankings, equal-weight comparisons, per-stock/quarter/regime diagnostics and uncertainty intervals. This is historical evaluation, not a live feed, recursive multi-day forecast, trading strategy or profitability claim.

## Development

Python 3.12 and Node.js 22 LTS are recommended. Use `python -m pip install -e ".[dev]"` in the project virtual environment; the supplied requirements lock is the earlier Linux snapshot, not a portable Windows lock.

```cmd
.\.venv\Scripts\python.exe -m pytest -q
npm --prefix web ci
npm --prefix web run build
```

Browser tests use the built server and Playwright Chromium; see START_HERE.md. [Ponytail and Graphify](docs/DEVELOPMENT_TOOLS.md) are optional development tools. Do not commit machine environments, market caches, cookies, or generated reports. No automatic push or deployment is part of this update.
