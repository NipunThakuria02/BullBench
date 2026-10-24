# Yahoo history availability: 22 October 2026

The user's Windows download failed at `^CNXENERGY: fewer than 500 daily observations`. This was reproduced in the cloud environment with actual yfinance requests. Installation and Yahoo access are working; historical data availability is the blocker.

## Verified live results inside 2021-10-01 through 2026-10-16

| Series | Downloaded rows | Status |
|---|---:|---|
| HDFCBANK.NS | 1247 | Cached |
| ICICIBANK.NS | 1247 | Cached |
| TCS.NS | 1247 | Cached |
| RELIANCE.NS | 1247 | Cached |
| TATASTEEL.NS | 1247 | Cached |
| ^NSEI | 1246 | Cached |
| ^NSEBANK | 1245 | Cached |
| ^CNXIT | 1245 | Cached |
| ^CNXENERGY | 2 | Rejected; only 2026-10-15 and 2026-10-16 |
| ^CNXMETAL | 2 | Rejected; only 2026-10-15 and 2026-10-16 |
| ^INDIAVIX | 1240 | Cached |
| ^GSPC | 1266 | Cached |
| INR=X | 1311 | Cached |
| CL=F | 1268 | Cached |

Additional checks of Energy history using `period=max`, an earlier 2021–2023 window, and a recent window did not recover the required history. Yahoo's metadata identifies the symbol as NIFTY ENERGY; the incomplete history was not solved by changing the request range. The speculative alternate `NIFTY_ENERGY.NS` returned no quote/history and must not be substituted as a verified fix.

## Safe recovery

The updated downloader continues after an individual series fails, saves all other valid downloads, and reports all incomplete inputs together. Rerun without `--refresh` to reuse good caches:

```powershell
.\.venv\Scripts\python.exe -m nse_forecast.cli download
```

An unsuccessful final exit is deliberate when any required series remains unavailable. Do not run evaluation expecting it to bypass missing sector inputs. Keep `data/cache/`; no successful cache needs to be deleted.

The user selected preserving the original indices. The implemented resolution is documented in [IMPORT_SECTOR_CSVS.md](IMPORT_SECTOR_CSVS.md): obtain genuine daily NIFTY ENERGY and NIFTY METAL price-index CSVs, import them with explicit source metadata, and retain Yahoo for the other 12 inputs. No basket proxy has been introduced. The cloud proxy blocks the official download website, so the original CSV files still need to be supplied by the user before a full evaluation can be verified.

Lowering the minimum row count, interpolating years of missing values, replacing sectors with the broad index without disclosure, or supplying synthetic candles does not complete the intended comparison. No real-market model rankings have been claimed.
