**Historical v2 revision record:** The current objective, price metrics, ranking and report workflow are described in [PRICE_UPDATE.md](../PRICE_UPDATE.md). Its accuracy comparison supersedes the combined descriptive screening rules discussed below. Timing, audit and evidence-preservation safeguards remain.

# Research revision: implementation plan and decisions

This revision follows review of the user's STOCK-review.zip, including the original cached prices and 22,525 historical forecast rows. The original six assets, five models, 2021-10-01 to 2026-10-16 range, return target, two-calendar-year initial training (including warmup), and quarterly expanding validation remain fixed.

The original test outcomes have already been inspected. Revised-method results are **exploratory**, even when each forecast is generated causally. No statistical interval can undo this research-selection history.

## Implemented changes

| Priority | Change | Files | Expected effect |
|---|---|---|---|
| 1 | Read-only cross-source calendar audit; flat zero-volume stock candle flags | `src/nse_forecast/audit.py`, `cli.py` | Reveals disagreements instead of treating minimum row count as complete coverage |
| 1 | Block evaluation on unresolved audit findings by default; explicit exploratory override | `cli.py` | Prevents silently relabeling an unverified calendar as corrected |
| 1 | Calculate context returns on native dates, then align using availability times | `features.py` | Avoids combining foreign sessions or manufacturing holiday zero returns |
| 1 | Record a training-only majority direction per asset/test block | `evaluate.py` | Adds a directional reference without adding a sixth main model |
| 2 | Equal-weight asset skill summary and directional-reference comparison | `diagnostics.py`, `report.py` | Makes high-volatility assets' influence visible |
| 2 | Exclude the partial final quarter from stability win-rate votes | `diagnostics.py`, `report.py` | Eleven sessions no longer have the same stability vote as a complete quarter |
| 2 | Paired date-block bootstrap, pointwise and Bonferroni-adjusted intervals | `diagnostics.py` | Quantifies uncertainty while keeping assets and models paired |
| 2 | Preserve original predictions and run metadata when rendering reports | `report.py` | Report recovery no longer rewrites training evidence |
| 2 | Source/configuration/platform hashes, prediction checksum, per-fold training records | `report.py`, `evaluate.py`, `models.py` | Improves traceability and output-integrity checking |
| 2 | Explicit CPU histogram and single-thread XGBoost configuration | `models.py` | Makes the new execution configuration explicit; does not guarantee cross-platform equality |
| 2 | Validate price/return identities, common outcomes, quarterly membership, and v2 checksums | `web.py`, `web/src/data.ts` | Detects internally inconsistent API/static results; accommodates legacy float32 reconstruction rounding |
| 3 | Preserve API error reasons; no silent static fallback after an API error | `web/src/data.ts`, `main.tsx` | Makes invalid results distinguishable from missing data |
| 3 | Show evaluation timestamp, source quality, and static-snapshot warning | `main.tsx` | Makes provenance limitations visible |
| 3 | Nifty values in points; naive directional call N/A; mean-model score labeled clearly | `main.tsx`, `data.ts` | Avoids currency and accuracy misinterpretation |
| 3 | Regression tests for calendar, timing, metadata, output integrity, and dashboard states | `tests/`, `web/tests/` | Covers failures missing from the original suite |

## Calendar issues: still require source verification

`audit/data-issues.csv` lists the actual discrepancies found in the supplied data. No raw price file has been altered. Cross-source agreement is not proof of an official session calendar.

Examples requiring investigation:

- 2026-01-15: present as flat zero-volume candles in all five stock caches, absent from Nifty and the imported indices.
- 2025-03-18: flat zero-volume candles in all five stocks.
- Several special-session dates occur in imported Energy/Metal histories but not Yahoo stock/Nifty histories.
- Some VIX/sector dates are missing relative to other domestic sources.

Do not mechanically delete all zero-volume rows, fill missing target prices, or replace adjusted stock prices with incompatible raw closes. Verify the exchange calendar and each disputed observation first. Preserve original source files and document any correction and its adjustment basis.

Until then, default evaluation exits before fitting. An explicit `--allow-unverified-calendar` produces an exploratory run with the audit attached and a visible `review_required` status. This override does not certify data quality.

## Forecast timing contract

The cutoff is 18:00 Asia/Kolkata on the preceding observed NSE session. For each context series, compute native-session returns first. A backward as-of join chooses the latest observation whose assumed availability is at or before the cutoff. No observation more than seven calendar days old is used; rows lacking usable predictors are dropped.

Conservative daily-bar availability assumptions:

- Domestic inputs: 18:00 Asia/Kolkata on their source date.
- S&P 500: 18:00 America/New_York on its source date (DST aware).
- USD/INR and crude: 06:00 UTC on the next calendar day.

These are documented assumptions, not verified Yahoo publication timestamps. Special sessions with different close times require calendar verification. Local return lags still refer to observed target sessions, which is another reason calendar discrepancies cannot be ignored. The pipeline does not claim a historically point-in-time vendor database; adjusted histories may have been revised.

## Metrics and decision rules

The five model outputs remain Naive, Ridge, ARIMA, RandomForest and XGBoost. The training-majority direction is a diagnostic reference saved with every row, not an additional regression model. Ties in training choose up deterministically; actual zero returns get half-credit.

The mathematical directional score retains half-credit for zero forecasts for backwards compatibility. The dashboard displays naive direction as N/A because it makes no call. The mean of four model scores is not an ensemble accuracy.

Report artifacts:

- `overall.csv`: pooled return errors.
- `equal_weight_assets.csv`: arithmetic average of per-asset skill and direction scores.
- `directional_reference.csv`: each model versus the training-majority direction, by asset.
- `by_quarter.csv`: all quarters, including the final partial quarter.
- `comparison.csv`: descriptive criteria; quarter win rates exclude the partial final quarter.
- `uncertainty.csv`: approximate confidence intervals.

The descriptive rule adds positive average per-asset direction advantage over the training reference. It still requires positive pooled RMSE skill, direction above 50%, at least four asset wins, two thirds of complete-quarter wins, and both regime wins. It is not a significance test or a trading recommendation.

Bootstrap: 4,000 circular moving-block draws, block length 20 observed dates, seed 42. Resample the same date blocks for all models and assets, retain unequal date counts in pooled denominators, and compare RMSE skill with naive and pooled direction score with the training reference. Report 95% pointwise intervals and Bonferroni-adjusted intervals across the four models and available endpoints. These are approximate, conditional on fitted predictions and these selected assets; models are not refitted in each bootstrap. Fewer than 40 dates returns an explicit insufficient-data status. Block lengths such as 10 and 40 should be sensitivity checks in a later preregistered analysis.

Regimes still use lagged 20-session Nifty volatility and a training-only 75th percentile. Call them *lagged market-volatility regimes*, not actual target-day shock labels. Read sample sizes before comparing small subsets.

New price reconstruction explicitly promotes predicted returns to float64 before adding one. Legacy output consistency checks allow a relative tolerance of 1e-7 for old float32 arithmetic. This does not change the saved return forecasts.

## Reproducibility and preserved runs

An evaluation will not overwrite an existing `predictions.csv` or `run.json`. Use a new output directory. The v2 manifest stores source hashes, package versions, platform, model configuration, timing policy, audit status, prediction checksum and per-fold training records.

Rendering an existing report preserves `predictions.csv` and `run.json` byte-for-byte. It writes derived tables, `report.html`, and separate `render.json` metadata. Old runs without saved training-majority references are marked as missing that diagnostic; it is never inferred from test outcomes. Old API outputs remain usable with a legacy/unverified label.

The original Nifty first-quarter forecasts matched this review environment for Naive, Ridge, Random Forest and ARIMA to numerical precision. XGBoost differed by up to about 0.00201 in decimal return despite matching recorded versions; repeated local fits were identical. The historical cross-platform discrepancy remains unresolved. Explicit CPU/thread settings and richer records improve the new protocol but are not evidence that the old discrepancy is solved. Preserve platform-specific environments and compare exported model artifacts before claiming bitwise cross-platform reproducibility.

## Deferred research experiments

Do not quietly introduce these into the corrected implementation:

1. Nested time-ordered tuning: predefined small grids selected only inside each outer training window; refit once per quarter. Retain the fixed-configuration run as a reference.
2. Feature ablations: own return history alone versus domestic context versus full context. This distinguishes algorithm effects from differences in information available to ARIMA and feature-based models.
3. Dependence/block-length and rolling-versus-expanding sensitivity checks.
4. Prospective evaluation: freeze a protocol now and collect genuinely uninspected later data as a separate study; do not rename the already inspected period an untouched test set.
5. Prediction intervals or trading-cost experiments only if the research question is explicitly expanded.

Do not add LSTM, change the fixed universe, amplify forecasts for appearance, or optimize settings against the already inspected outer-test results.

## Verification completed in the review workspace

- 43 Python tests passed, including timing, future-input invariance, ARIMA ordering, training-majority isolation, report immutability, float32 reconstruction, and API checks.
- 7 Chromium browser tests passed, including error handling, static v2 status/reference display, Nifty units, filters, exports, and mobile layout.
- TypeScript and Vite production build passed.
- Default evaluation stopped before fitting on 69 audited series/date issues, as intended.
- A separate explicitly exploratory full run completed all six assets and five models, producing 22,525 forecast rows; the revised API accepted the output and the bootstrap completed.
- Original `data/`, `imports/`, and `reports/` files remain byte-identical to the uploaded ZIP.
- Re-rendering the new report left `predictions.csv` and `run.json` byte-identical.
- The standalone updater was checked for clean installation, backups, idempotence, preservation of data/results, and refusal of conflicting local edits.

These checks validate the implementation, not the disputed exchange dates or economic predictability. The new exploratory run still does not identify a fitted model beating the naive benchmark under the descriptive criteria.
