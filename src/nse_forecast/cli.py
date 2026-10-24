import argparse
import json
from pathlib import Path
from .config import ASSETS, TICKERS, cache_path
from .data import download, load
from .evaluate import evaluate
from .report import write_report, render_report
from .audit import audit_data, save_audit


def main():
    parser = argparse.ArgumentParser(description="Compare next-session closing-value forecasts from five models on six NSE assets")
    parser.add_argument("command", choices=["download", "evaluate", "export-site", "import-sector", "audit-data", "render-report"])
    parser.add_argument("--cache", type=Path, default=Path("data/cache"))
    parser.add_argument("--output", type=Path, help="Output directory; defaults to reports except render-report")
    parser.add_argument("--reports", type=Path, default=Path("reports"), help="Evaluation directory for render-report or export-site")
    parser.add_argument("--refresh", action="store_true", help="Explicitly replace cached downloads")
    parser.add_argument("--ticker", choices=["^CNXENERGY", "^CNXMETAL"], help="Original sector index for import-sector")
    parser.add_argument("--files", nargs="+", help="Historical index CSV paths or quoted wildcard patterns")
    parser.add_argument("--source-url", default="https://www.niftyindices.com/reports/historical-data", help="Public source-page URL for imported historical data")
    parser.add_argument("--replace", action="store_true", help="Explicitly replace an existing imported sector cache")
    parser.add_argument('--allow-unverified-calendar', action='store_true',
                        help='Explicitly allow an exploratory evaluation with unresolved source-calendar issues')
    args = parser.parse_args()
    if args.command != "render-report":
        args.output = args.output or Path("reports")
    if args.allow_unverified_calendar and args.command != 'evaluate':
        parser.error('--allow-unverified-calendar applies only to evaluate')
    if args.command == "import-sector" and (not args.ticker or not args.files):
        parser.error("import-sector requires --ticker and --files")
    if args.replace and args.command != "import-sector":
        parser.error("--replace applies only to import-sector")
    if args.refresh and args.command != "download":
        parser.error("--refresh applies only to download")
    try:
        if args.command == 'audit-data':
            audit = audit_data(load(args.cache))
            save_audit(audit, args.output)
            print(f"Audit saved to {args.output}: {len(audit['issues'])} issues; {audit['status']}")
        elif args.command == 'render-report':
            render_report(args.reports, args.output)
            print(f"Report saved to {(args.output or args.reports) / 'report.html'}")
        elif args.command == "download":
            download(args.cache, args.refresh)
        elif args.command == "import-sector":
            from .import_csv import import_sector
            import_sector(args.files, args.ticker, args.cache, args.source_url, args.replace)
        elif args.command == "export-site":
            from .web import export_results, export_history
            output_dir = args.output
            results_out = output_dir / "results.json"
            export_results(args.reports, results_out)
            print(f"Dashboard results exported to {results_out}")
            if args.cache.exists():
                written = export_history(args.cache, args.reports, output_dir)
                print(f"History exported: {len(written)} asset files")
            else:
                print(f"Skipping history export: cache directory {args.cache} not found.")

        else:
            if (args.output / 'predictions.csv').exists() or (args.output / 'run.json').exists():
                raise ValueError('Output already contains an evaluation. Choose a new --output directory to preserve it.')
            data = load(args.cache)
            audit = audit_data(data)
            save_audit(audit, args.output)
            if audit['issues'] and not args.allow_unverified_calendar:
                raise ValueError(f"Data audit found {len(audit['issues'])} unresolved issues. Review {args.output / 'data-issues.csv'}. Correct verified source errors first, or explicitly use --allow-unverified-calendar for an exploratory run.")
            audit['exploratory_override'] = args.allow_unverified_calendar
            result = evaluate(data, ASSETS)
            provenance = [json.loads(cache_path(args.cache, ticker).with_suffix(".json").read_text()) for ticker in TICKERS]
            print(write_report(result, args.output, provenance, audit).to_string(index=False))
            print(f"Report saved to {args.output / 'report.html'}")
    except (ValueError, FileNotFoundError, RuntimeError) as error:
        parser.exit(1, f"Error: {error}\n")

if __name__ == "__main__":
    main()
