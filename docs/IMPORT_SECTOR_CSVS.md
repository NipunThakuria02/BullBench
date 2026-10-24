# Import the original Nifty Energy and Nifty Metal histories

The study keeps the original sector indices. Yahoo supplies the six target assets and the other available context series; real external CSVs supply only **NIFTY ENERGY** and **NIFTY METAL**. The target assets, five models, feature timing, dates, and validation protocol remain unchanged.

## Download the two index histories

Open the official Nifty Indices historical-data page in your browser:

https://www.niftyindices.com/reports/historical-data

Download historical **daily price-index closing values** for:

- **NIFTY ENERGY**, mapped to the existing `^CNXENERGY` feature.
- **NIFTY METAL**, mapped to the existing `^CNXMETAL` feature.

Cover **1 October 2021 through 16 October 2026, inclusive** for both. Choose price-index history, not a total-return/TRI series, ETF, index constituent list, or today's quote. If the site restricts the date range per download, obtain smaller consecutive date ranges and keep all resulting CSVs. The importer merges those files and allows overlaps only when their closing values agree.

The official site could not be inspected from the prepared cloud machine because its proxy denied access. Download availability, form labels, and any current site access requirements must be checked in your browser. No source file has been fabricated or supplied as market data. If the form is confusing, share a screenshot of that page or the downloaded CSV headers.

Create these folders in your existing project and place the downloaded CSVs inside:

```text
STOCK-main/
  imports/
    energy/    # All genuine NIFTY ENERGY history CSVs
    metal/     # All genuine NIFTY METAL history CSVs
  data/cache/  # Keep your existing successful Yahoo caches
  .venv/      # Keep your existing Python environment
```

`imports/` and `data/` are excluded from Git. Preserve your original downloaded files. File names can vary; do not put both indices in the same folder.

## Update the code first

This command requires the latest code from https://github.com/NipunThakuria02/STOCK.

- If your project is a Git clone, update it normally without discarding local changes.
- If it came from Download ZIP, download the latest ZIP and copy its updated `src/nse_forecast/` folder into your current project's `src/nse_forecast/`, replacing matching source files and adding the new files. Keep your current `.venv/` and `data/cache/`. The new files include `import_csv.py` and `provenance.py`.
- The existing editable Python installation uses the updated source directly. No new dependency is needed for CSV import. Restart the Python server after updating so its dashboard source validation also uses the new code.

## Run these commands in Windows PowerShell

Open the terminal in the project root (the folder containing `.venv`, `src`, and `pyproject.toml`). You already need a successful Nifty 50 Yahoo cache; the importer uses its trading dates to detect missing dates in the sector files.

Import Energy:

```powershell
.\.venv\Scripts\python.exe -m nse_forecast.cli import-sector --ticker "^CNXENERGY" --files ".\imports\energy\*.csv"
```

Import Metal:

```powershell
.\.venv\Scripts\python.exe -m nse_forecast.cli import-sector --ticker "^CNXMETAL" --files ".\imports\metal\*.csv"
```

The wildcard patterns are intentionally quoted: Python expands them, so PowerShell does not need to expand native-command wildcards. To import multiple explicitly named files, list their quoted paths after `--files`.

After both imports succeed, fill in any remaining Yahoo inputs and run evaluation:

```powershell
.\.venv\Scripts\python.exe -m nse_forecast.cli download
.\.venv\Scripts\python.exe -m nse_forecast.cli evaluate
```

Do not continue past a failed import. Correct missing ranges or conflicting values in the original CSV collection first. A cache will not be replaced silently; to deliberately replace an existing sector cache with corrected files, repeat its import command with `--replace`.

After evaluation succeeds, restart the Python website server (Ctrl+C in its terminal, then start it again):

```powershell
.\.venv\Scripts\python.exe -m nse_forecast.web --port 8000
```

Reload the site or use **Data & setup → Check for results**. `EVALUATED DATA` should replace `EXAMPLE DATA`. The API supports the mixed Yahoo/CSV provenance; no frontend data needs to be hardcoded.

## Accepted file formats and validation

The import accepts UTF-8 CSVs (including a UTF-8 BOM) with Date and Close columns. It also recognizes official-style headers such as `Index Name`, `Index Date`, and `Closing Index Value`, or `HistoricalDate` and `Closing Value`. Extra columns such as Open/High/Low are ignored because this pipeline uses closing values.

Dates can be `YYYY-MM-DD`, `DD-Mon-YYYY`, `DD Mon YYYY`, `DD/MM/YYYY`, or `DD-MM-YYYY`. Day-first formats are interpreted explicitly; ISO dates are not reinterpreted as day-first. Quoted numbers with thousands separators are accepted. If Index Name is present, every row must match the chosen index.

The importer sorts dates, merges identical overlaps, rejects conflicting overlaps, rejects non-finite/nonpositive closes, requires full range coverage and at least 500 rows, and checks every cached Nifty 50 trading session is represented. It never interpolates or generates missing prices.

Each normalized cache records:

- The selected original index and `price_index` basis.
- `external_csv` as the source, not `yfinance`.
- The public source-page URL and import timestamp.
- Names and SHA-256 hashes of every supplied original file.
- A checksum of the normalized cache used by evaluation.

The source-page URL defaults to the official page above. If genuinely obtaining the same original index from another agreed provider, specify its public HTTPS source page with `--source-url`; do not put credentials or token-bearing URLs there. Provenance records the source you declare and the supplied files; it does not independently authenticate a provider's download.

A later `download --refresh` refreshes Yahoo inputs but preserves validated imported sector caches. Use `import-sector --replace` to update those deliberately. The report lists source provenance for every input, and `reports/run.json` retains the full metadata.

For macOS/Linux, use `.venv/bin/python` instead of `.\.venv\Scripts\python.exe` and forward-slash folder paths. No stock-basket substitution has been introduced.
