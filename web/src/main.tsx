import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  ChevronDown,
  ExternalLink,
  Link as LinkIcon,
  Search,
  UserRound,
  X,
  Info,
  RefreshCw,
} from "lucide-react";
import {
  ASSETS,
  searchAssets,
  assetFromHash,
  exchangeLink,
  type Asset,
} from "./assets";
import {
  MODELS,
  NAMES,
  COLORS,
  metrics,
  getResults,
  exampleRows,
  assetValue,
  percent,
  displayDate,
  type Payload,
  type Row,
  type Model,
} from "./data";
import {
  getHistory,
  historyFromForecasts,
  rangeStart,
  RANGES,
  movingAverage,
  type History,
  type Range,
} from "./history";
import { InteractiveChart, type ChartSeries } from "./charts";
import "./styles.css";

const SECTIONS = [
  ["overview", "Overview"],
  ["chart", "Chart"],
  ["models", "Model comparison"],
  ["analysis", "Analysis"],
  ["ledger", "Forecast ledger"],
  ["methodology", "Methodology"],
] as const;
type Section = (typeof SECTIONS)[number][0];
const QUARTER = (fold: string) =>
  `Q${Math.floor((Number(fold.slice(5, 7)) - 1) / 3) + 1} ${fold.slice(0, 4)}`;
const shortNumber = (v: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(v);
const score = (v: number | null) =>
  v === null ? "N/A" : `${v > 0 ? "+" : ""}${percent(v, 2)}`;
function navigate(asset: Asset | null, section: Section = "overview") {
  window.location.hash = asset ? `/asset/${asset.slug}/${section}` : "/";
}
function Brand({ large = false }: { large?: boolean }) {
  return (
    <a
      href="#/"
      className={`brand ${large ? "brand-large" : ""}`}
      aria-label="BullBench home"
    >
      BullBench
      <span className="brand-bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </a>
  );
}
function AssetMark({ asset }: { asset: Asset }) {
  return (
    <img
      className="asset-mark"
      src={`/logos/${asset.slug}.svg`}
      alt={
        asset.symbol === "^NSEI"
          ? "Nifty 50 benchmark badge"
          : `${asset.short} logo`
      }
      width={48}
      height={48}
    />
  );
}
function AssetSearch({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState(""),
    [open, setOpen] = useState(false),
    [index, setIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null),
    id = useId();
  const options = searchAssets(query);
  const pick = (asset: Asset) => {
    navigate(asset);
    setQuery("");
    setOpen(false);
  };
  useEffect(() => {
    const outside = (e: globalThis.PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") setOpen(false);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setIndex((i) => (options.length ? (i + 1) % options.length : 0));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setIndex((i) =>
        options.length ? (i - 1 + options.length) % options.length : 0,
      );
    }
    if (e.key === "Enter" && options.length) {
      e.preventDefault();
      pick(options[Math.min(index, options.length - 1)]);
    }
  };
  return (
    <div
      ref={ref}
      className={`asset-search ${compact ? "search-compact" : ""}`}
    >
      <div className="search-field">
        <Search size={compact ? 20 : 27} aria-hidden="true" />
        <input
          type="search"
          aria-label="Search for a company"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={id}
          aria-expanded={open}
          aria-activedescendant={
            open && options.length
              ? `${id}-${Math.min(index, options.length - 1)}`
              : undefined
          }
          placeholder="Search for a company"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={key}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setIndex(0);
              ref.current?.querySelector("input")?.focus();
            }}
            aria-label="Clear search"
          >
            <X size={18} />
          </button>
        )}
      </div>
      {open && (
        <div
          id={id}
          role="listbox"
          className="search-options"
          aria-label="Study assets"
        >
          {options.length ? (
            options.map((a, i) => (
              <button
                type="button"
                role="option"
                aria-selected={i === index}
                id={`${id}-${i}`}
                key={a.symbol}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setIndex(i)}
                onClick={() => pick(a)}
              >
                <span>
                  <strong>{a.short}</strong>
                  <small>{a.sector}</small>
                </span>
                <span className="search-symbol">
                  {a.nse}
                  <ArrowUpRight size={15} />
                </span>
              </button>
            ))
          ) : (
            <div className="search-no-results">
              No matching study asset. Search one of the five stocks or Nifty
              50.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
function AccountDialog({
  mode,
  onClose,
}: {
  mode: "login" | "signup";
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog className="account-dialog" ref={ref} onCancel={onClose}>
      <button
        className="dialog-close"
        onClick={onClose}
        aria-label="Close account dialog"
      >
        <X size={20} />
      </button>
      <Brand />
      <h2>{mode === "login" ? "Login" : "Get a free account"}</h2>
      <p>
        Accounts are not enabled in this local research build. All six asset
        pages and their comparisons are available without an account.
      </p>
      <button className="primary-button" onClick={onClose}>
        Continue to BullBench
      </button>
    </dialog>
  );
}
function Header({
  asset,
  onAccount,
}: {
  asset: Asset | null;
  onAccount: (mode: "login" | "signup") => void;
}) {
  return (
    <header className={`site-header ${asset ? "" : "header-home"}`}>
      <div className="header-inner">
        {asset && <Brand />}
        <a className="home-link" href="#/">
          HOME
        </a>
        <div className="header-spacer" />
        {asset && <AssetSearch compact />}
        <div className="account-actions">
          <button
            className="login-button"
            aria-label="LOGIN"
            onClick={() => onAccount("login")}
          >
            <UserRound size={17} />
            <span>LOGIN</span>
          </button>
          <button
            className="signup-button"
            onClick={() => onAccount("signup")}
            aria-label="Get free account"
          >
            <span className="desktop-label">GET FREE ACCOUNT</span>
            <span className="mobile-label">SIGN UP</span>
          </button>
        </div>
      </div>
    </header>
  );
}
function Home({ payload, loading }: { payload: Payload; loading: boolean }) {
  return (
    <main className="homepage">
      <div className="home-hero">
        <h1>
          <Brand large />
        </h1>
        <p className="home-tagline">
          Stock forecasts and model comparisons for investors in India.
        </p>
        <AssetSearch />
        <div className="home-shortcuts">
          <span>Or analyse:</span>
          {ASSETS.map((a) => (
            <a href={`#/asset/${a.slug}/overview`} key={a.symbol}>
              {a.short}
            </a>
          ))}
        </div>
        <p className="home-research-note">
          Five forecasting approaches. Five stocks and Nifty 50.
        </p>
      </div>
      <footer className="home-footer">
        {loading
          ? "Checking local evaluation…"
          : payload.available
            ? "Historical research · data through 16 October 2026"
            : "Example mode · connect your saved evaluation for market results"}
        <span>Next-session forecasts, examined against what happened.</span>
      </footer>
    </main>
  );
}
function DataNotice({
  payload,
  loading,
}: {
  payload: Payload;
  loading: boolean;
}) {
  if (loading)
    return (
      <div className="data-notice">
        <RefreshCw size={14} className="spin" />
        Loading saved evaluation…
      </div>
    );
  if (payload.available) return null;
  return (
    <div className="data-notice notice-example">
      <Info size={15} />
      <span>
        EXAMPLE DATA · Generated interface examples, not market observations.
      </span>
      <a
        href="#methodology"
        onClick={(e) => {
          e.preventDefault();
          document
            .getElementById("methodology")
            ?.scrollIntoView({ behavior: "smooth" });
        }}
      >
        Data &amp; methodology
      </a>
    </div>
  );
}
function rowsForModels(rows: Row[]) {
  return MODELS.map((model) => ({
    model,
    ...metrics(rows.filter((r) => r.model === model)),
  }))
    .map((r, _i, all) => ({
      ...r,
      rank: 1 + all.filter((other) => other.priceMae < r.priceMae).length,
    }))
    .sort((a, b) => a.priceMae - b.priceMae || a.model.localeCompare(b.model));
}
function Overview({
  asset,
  history,
  rows,
  historyNote,
}: {
  asset: Asset;
  history: History["rows"];
  rows: Row[];
  historyNote: string;
}) {
  const latest = history.at(-1),
    previous = history.at(-2),
    change = latest && previous ? latest.close / previous.close - 1 : null;
  const summary = rowsForModels(rows),
    best = summary[0],
    naive = summary.find((r) => r.model === "Naive");
  const lastYear = latest
    ? history.filter((r) => r.date >= rangeStart(latest.date, "1Yr"))
    : [];
  const low = lastYear.length
      ? Math.min(...lastYear.map((r) => r.close))
      : null,
    high = lastYear.length ? Math.max(...lastYear.map((r) => r.close)) : null;
  const stats: [string, string][] = [
    [
      "Last cached close",
      latest ? assetValue(latest.close, asset.symbol) : "—",
    ],
    ["Sector", asset.sector],
    [
      "52W closing range",
      low !== null && high !== null
        ? `${shortNumber(low)} / ${shortNumber(high)}`
        : "—",
    ],
    ["Forecast sessions", String(new Set(rows.map((r) => r.date)).size)],
    ["Models compared", "5"],
    ["History begins", history[0] ? displayDate(history[0].date) : "—"],
    ["Lowest MAE model", best?.n ? NAMES[best.model] : "—"],
    [
      "Lowest value MAE",
      best?.n ? assetValue(best.priceMae, asset.symbol) : "—",
    ],
    [
      "Naive value MAE",
      naive?.n ? assetValue(naive.priceMae, asset.symbol) : "—",
    ],
  ];
  return (
    <section
      id="overview"
      className="panel overview-panel"
      aria-labelledby="asset-title"
    >
      <div className="overview-title-row">
        <div className="company-title">
          <AssetMark asset={asset} />
          <h1 id="asset-title">{asset.name}</h1>
          <div className="quote">
            <strong>
              {latest ? assetValue(latest.close, asset.symbol) : "—"}
            </strong>
            {change !== null && (
              <span className={change >= 0 ? "positive" : "negative"}>
                {change >= 0 ? "+" : ""}
                {percent(change)}
              </span>
            )}
            <small>
              {latest ? displayDate(latest.date) : "No history"} ·{" "}
              {asset.symbol === "^NSEI"
                ? "cached index level"
                : "cached adjusted close"}
            </small>
          </div>
        </div>
        <a
          className="outline-button overview-cta"
          href={`#/asset/${asset.slug}/models`}
        >
          COMPARE MODELS <ArrowUpRight size={17} />
        </a>
      </div>
      <div className="official-links">
        <a href={asset.website} target="_blank" rel="noopener noreferrer">
          <LinkIcon size={19} />
          {asset.websiteLabel}
        </a>
        {asset.bse && (
          <a href={asset.bse} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={17} />
            BSE: {asset.bseCode}
          </a>
        )}
        <a href={exchangeLink(asset)} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={17} />
          NSE: {asset.nse}
        </a>
      </div>
      <div className="overview-grid">
        <div className="stats-box">
          <dl>
            {stats.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p>
            {asset.symbol === "^NSEI"
              ? "Closing levels and errors use index points."
              : "Stock values and errors use adjusted INR closes, which can differ from original exchange quotes."}
          </p>
        </div>
        <aside className="company-about">
          <h3>ABOUT</h3>
          <p>{asset.description}</p>
          <h3>RESEARCH CONTEXT</h3>
          <p>
            Five parallel forecasts. One next-session target. Every model is
            compared with the same observed closing values.
          </p>
          <a href={`#/asset/${asset.slug}/methodology`}>
            READ METHODOLOGY <ArrowUpRight size={15} />
          </a>
        </aside>
      </div>
      {historyNote && (
        <p className="history-note">
          <Info size={14} />
          {historyNote}
        </p>
      )}
    </section>
  );
}
function HistoryChart({
  asset,
  history,
}: {
  asset: Asset;
  history: History["rows"];
}) {
  const [range, setRange] = useState<Range>("1Yr"),
    [price, setPrice] = useState(true),
    [dma50, setDma50] = useState(false),
    [dma200, setDma200] = useState(false),
    [volume, setVolume] = useState(true);
  const availableVolume = history.some(
    (r) => r.volume !== null && r.volume > 0,
  );
  const last = history.at(-1)?.date ?? "2026-10-16",
    start = rangeStart(last, range);
  const ma50 = useMemo(() => movingAverage(history, 50), [history]),
    ma200 = useMemo(() => movingAverage(history, 200), [history]);
  const indices = history
      .map((_r, i) => i)
      .filter((i) => history[i].date >= start),
    shown = indices.map((i) => history[i]);
  const series: ChartSeries[] = [];
  if (price)
    series.push({
      name: "Price",
      color: "#6355ff",
      values: shown.map((r) => r.close),
    });
  if (dma50)
    series.push({
      name: "50 DMA",
      color: "#f0a04b",
      values: indices.map((i) => ma50[i]),
    });
  if (dma200)
    series.push({
      name: "200 DMA",
      color: "#2b9e80",
      values: indices.map((i) => ma200[i]),
    });
  return (
    <section
      id="chart"
      className="panel chart-panel"
      aria-label="Historical price chart"
    >
      <div className="chart-controls">
        <div
          className="range-buttons"
          role="group"
          aria-label="Historical chart range"
        >
          {RANGES.map((r) => (
            <button
              key={r}
              className={range === r ? "active" : ""}
              aria-pressed={range === r}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
        <span className="chart-kind">
          {asset.symbol === "^NSEI" ? "Index level" : "Price"}
        </span>
      </div>
      <InteractiveChart
        dates={shown.map((r) => r.date)}
        series={series}
        symbol={asset.symbol}
        volume={
          volume && availableVolume ? shown.map((r) => r.volume) : undefined
        }
        label={`${asset.short} historical price chart — ${range}`}
      />
      <div className="chart-checkboxes">
        <label>
          <input
            type="checkbox"
            checked={price}
            onChange={(e) => setPrice(e.target.checked)}
          />{" "}
          {asset.symbol === "^NSEI" ? "Index level" : "Adjusted price on NSE"}
        </label>
        <label>
          <input
            type="checkbox"
            checked={dma50}
            onChange={(e) => setDma50(e.target.checked)}
          />
          50 DMA
        </label>
        <label>
          <input
            type="checkbox"
            checked={dma200}
            onChange={(e) => setDma200(e.target.checked)}
          />
          200 DMA
        </label>
        <label className={!availableVolume ? "disabled" : ""}>
          <input
            type="checkbox"
            checked={volume && availableVolume}
            disabled={!availableVolume}
            onChange={(e) => setVolume(e.target.checked)}
          />
          Volume{!availableVolume ? " unavailable" : ""}
        </label>
      </div>
      <p className="subtle-note">
        {shown[0]
          ? `${displayDate(shown[0].date)} – ${displayDate(last)}. `
          : ""}
        Ranges end at the latest cached session, not today. Moving averages use
        all preceding available history.
      </p>
    </section>
  );
}
function FilterControls({
  fold,
  setFold,
  regime,
  setRegime,
  rows,
}: {
  fold: string;
  setFold: (s: string) => void;
  regime: string;
  setRegime: (s: string) => void;
  rows: Row[];
}) {
  const folds = [...new Set(rows.map((r) => r.fold))].sort();
  return (
    <div className="filter-controls">
      <label>
        Test period
        <select
          aria-label="Test period"
          value={fold}
          onChange={(e) => setFold(e.target.value)}
        >
          <option value="all">All test blocks</option>
          {folds.map((f) => (
            <option key={f} value={f}>
              {QUARTER(f)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Market regime
        <select
          aria-label="Market regime"
          value={regime}
          onChange={(e) => setRegime(e.target.value)}
        >
          <option value="all">All conditions</option>
          <option value="calm">Calm</option>
          <option value="volatile">Volatile</option>
        </select>
      </label>
    </div>
  );
}
function ModelComparison({
  asset,
  rows,
  filtered,
  fold,
  setFold,
  regime,
  setRegime,
}: {
  asset: Asset;
  rows: Row[];
  filtered: Row[];
  fold: string;
  setFold: (s: string) => void;
  regime: string;
  setRegime: (s: string) => void;
}) {
  const [view, setView] = useState<"price" | "errors" | "returns">("price"),
    [visible, setVisible] = useState<Model[]>([...MODELS]),
    [allDates, setAllDates] = useState(false);
  const summary = rowsForModels(filtered),
    dates = [...new Set(filtered.map((r) => r.date))].sort(),
    chartDates = allDates ? dates : dates.slice(-60);
  const map = new Map(filtered.map((r) => [`${r.date}:${r.model}`, r]));
  const actual = new Map(filtered.map((r) => [r.date, r]));
  const series: ChartSeries[] = [
    {
      name: "Actual",
      color: COLORS.Actual,
      values: chartDates.map((d) =>
        view === "errors"
          ? 0
          : view === "returns"
            ? actual.get(d)!.actual_return
            : actual.get(d)!.actual_price,
      ),
    },
    ...visible.map((model) => ({
      name: NAMES[model],
      color: COLORS[model],
      dashed: model === "Naive",
      values: chartDates.map((d) => {
        const r = map.get(`${d}:${model}`);
        return !r
          ? null
          : view === "errors"
            ? r.predicted_price - r.actual_price
            : view === "returns"
              ? r.predicted_return
              : r.predicted_price;
      }),
    })),
  ];
  return (
    <section id="models" className="panel model-panel">
      <div className="section-title">
        <div>
          <h2>Model comparison</h2>
          <p>
            How close did each approach get to {asset.short}’s next-session
            closing value?
          </p>
        </div>
        <FilterControls
          rows={rows}
          fold={fold}
          setFold={setFold}
          regime={regime}
          setRegime={setRegime}
        />
      </div>
      <div className="model-chart-toolbar">
        <div className="segmented" aria-label="Forecast chart display">
          {(["price", "errors", "returns"] as const).map((v) => (
            <button
              className={view === v ? "active" : ""}
              aria-pressed={view === v}
              key={v}
              onClick={() => setView(v)}
            >
              {v === "price" ? "Price" : v === "errors" ? "Errors" : "Returns"}
            </button>
          ))}
        </div>
        <label className="all-dates-toggle">
          <input
            type="checkbox"
            checked={allDates}
            onChange={(e) => setAllDates(e.target.checked)}
          />
          All selected sessions
        </label>
      </div>
      <InteractiveChart
        dates={chartDates}
        series={series}
        symbol={asset.symbol}
        returns={view === "returns"}
        label={`${asset.short} ${view === "errors" ? "forecast error" : view === "returns" ? "return" : "forecast closing value"} comparison`}
      />
      <div className="model-legend">
        <span>
          <i style={{ background: COLORS.Actual }} />
          Actual{view === "errors" ? " (zero error)" : ""}
        </span>
        {MODELS.map((m) => (
          <button
            key={m}
            aria-pressed={visible.includes(m)}
            className={!visible.includes(m) ? "legend-off" : ""}
            onClick={() =>
              setVisible((prev) =>
                prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
              )
            }
          >
            <i style={{ background: COLORS[m] }} />
            {NAMES[m]}
          </button>
        ))}
      </div>
      <p className="scope-note">
        Chart: {chartDates.length} sessions. Table: all {dates.length} sessions
        matching the filters. Legend controls affect only the chart.{" "}
        {view === "errors"
          ? "Signed error = predicted minus actual."
          : "Forecasts use each observed previous close; this is not a recursive price path."}
      </p>
      <div className="table-scroll">
        <table className="accuracy-table">
          <thead>
            <tr>
              <th>MAE rank</th>
              <th>Model</th>
              <th>Value MAE</th>
              <th>Value RMSE</th>
              <th>MAE vs naive</th>
              <th>Sessions</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((r) => (
              <tr key={r.model}>
                <td>{r.n ? r.rank : "—"}</td>
                <td>
                  <i
                    className="model-dot"
                    style={{ background: COLORS[r.model] }}
                  />
                  {NAMES[r.model]}
                  {r.model === "Naive" && (
                    <small className="reference-tag">REF</small>
                  )}
                </td>
                <td>{r.n ? assetValue(r.priceMae, asset.symbol) : "—"}</td>
                <td>{r.n ? assetValue(r.priceRmse, asset.symbol) : "—"}</td>
                <td
                  className={
                    r.priceSkill !== null && r.priceSkill > 0
                      ? "positive"
                      : r.priceSkill !== null && r.priceSkill < 0
                        ? "negative"
                        : ""
                  }
                >
                  {r.model === "Naive" ? "Baseline" : score(r.priceSkill)}
                </td>
                <td>{r.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="subtle-note">
        Lowest MAE ranks first within this asset and selection. Positive
        improvement beats naive. Ties share ranks before display rounding.
        Units:{" "}
        {asset.symbol === "^NSEI" ? "index points" : "adjusted INR closes"}.
      </p>
      <details className="supporting-details">
        <summary>
          Return and directional diagnostics <ChevronDown size={15} />
        </summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Return MAE</th>
                <th>Return RMSE</th>
                <th>Direction score</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((r) => (
                <tr key={r.model}>
                  <td>{NAMES[r.model]}</td>
                  <td>{r.n ? percent(r.mae) : "—"}</td>
                  <td>{r.n ? percent(r.rmse) : "—"}</td>
                  <td>
                    {r.n && r.model !== "Naive"
                      ? percent(r.direction, 1)
                      : "N/A"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Naive makes no directional call. Zero outcomes get half-credit.{" "}
          {summary[0]?.reference !== null && summary[0]?.n
            ? `Training-majority direction reference: ${percent(summary[0].reference!, 2)}.`
            : "Training-majority reference is unavailable for this run."}
        </p>
      </details>
    </section>
  );
}
function Analysis({
  asset,
  rows,
  filtered,
}: {
  asset: Asset;
  rows: Row[];
  filtered: Row[];
}) {
  const summary = rowsForModels(filtered),
    best = summary[0],
    improved = summary.filter(
      (r) => r.model !== "Naive" && r.priceSkill !== null && r.priceSkill > 0,
    );
  const groups = (key: "fold" | "regime") =>
    [...new Set(rows.map((r) => r[key]))].sort().map((value) => ({
      value,
      summary: rowsForModels(rows.filter((r) => r[key] === value)),
    }));
  const [breakdown, setBreakdown] = useState<"fold" | "regime">("fold");
  return (
    <section id="analysis" className="panel analysis-panel">
      <div className="section-title">
        <div>
          <h2>Analysis</h2>
          <p>Forecast findings, with their limits alongside them.</p>
        </div>
      </div>
      <div className="finding-grid">
        <article className="finding-card finding-positive">
          <h3>FORECAST FINDINGS</h3>
          <ul>
            <li>
              {best?.n
                ? `${NAMES[best.model]} has the lowest MAE in the selected filters: ${assetValue(best.priceMae, asset.symbol)}.`
                : "No sessions match the selected filters."}
            </li>
            <li>
              {improved.length
                ? `${improved.length} fitted model${improved.length === 1 ? "" : "s"} improve on naive MAE in this selection.`
                : "No fitted model improves on naive MAE in this selection."}
            </li>
            <li>
              All five models are evaluated on the same{" "}
              {new Set(filtered.map((r) => r.date)).size} target sessions for
              this asset.
            </li>
          </ul>
        </article>
        <article className="finding-card finding-limit">
          <h3>LIMITATIONS</h3>
          <ul>
            <li>
              Historical evaluation, not an upcoming-session forecast or a live
              quote feed.
            </li>
            <li>
              Source-calendar discrepancies remain subject to review. Rankings
              do not establish statistical significance.
            </li>
            <li>
              {asset.symbol === "^NSEI"
                ? "Nifty is an index level, not a directly traded share price."
                : "Adjusted closing values can differ from the original exchange closing quotes."}
            </li>
          </ul>
        </article>
      </div>
      <p className="subtle-note">
        Findings are calculated from the selected model-comparison filters. They
        describe forecasting results, not investment pros or cons.
      </p>
      <div className="breakdown-heading">
        <h3>Accuracy across time and conditions</h3>
        <div className="segmented">
          <button
            className={breakdown === "fold" ? "active" : ""}
            onClick={() => setBreakdown("fold")}
          >
            Quarters
          </button>
          <button
            className={breakdown === "regime" ? "active" : ""}
            onClick={() => setBreakdown("regime")}
          >
            Volatility regimes
          </button>
        </div>
      </div>
      <p className="subtle-note">
        This supporting breakdown uses the full evaluated asset history,
        independently of the comparison filters. The final quarter is partial.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>
                {breakdown === "fold"
                  ? "Test quarter"
                  : "Lagged volatility regime"}
              </th>
              <th>Sessions</th>
              {MODELS.map((m) => (
                <th key={m}>{NAMES[m]} MAE</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups(breakdown).map((g) => (
              <tr key={g.value}>
                <td>
                  {breakdown === "fold"
                    ? `${QUARTER(g.value)}${g.value === "2026-10-01" ? " · partial" : ""}`
                    : g.value === "volatile"
                      ? "Volatile"
                      : "Calm"}
                </td>
                <td>{g.summary[0]?.n ?? 0}</td>
                {MODELS.map((m) => {
                  const r = g.summary.find((r) => r.model === m)!;
                  return (
                    <td key={m}>
                      {r.n ? assetValue(r.priceMae, asset.symbol) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function exportLedger(rows: Row[], asset: Asset, example: boolean) {
  const header = [
    "date",
    "stock",
    "model",
    "previous_close",
    "predicted_close",
    "actual_close",
    "price_error",
    "absolute_price_error",
    "predicted_return",
    "actual_return",
    "regime",
    "fold",
    "value_unit",
  ];
  const lines = rows.map((r) =>
    [
      r.date,
      r.stock,
      r.model,
      r.origin_close,
      r.predicted_price,
      r.actual_price,
      r.predicted_price - r.actual_price,
      Math.abs(r.predicted_price - r.actual_price),
      r.predicted_return,
      r.actual_return,
      r.regime,
      r.fold,
      asset.symbol === "^NSEI" ? "index_points" : "INR_adjusted_close",
    ].join(","),
  );
  const url = URL.createObjectURL(
    new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${example ? "EXAMPLE-" : ""}${asset.symbol}-forecasts.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Ledger({
  asset,
  rows,
  example,
}: {
  asset: Asset;
  rows: Row[];
  example: boolean;
}) {
  const [page, setPage] = useState(0),
    size = 25;
  useEffect(() => setPage(0), [rows]);
  const ordered = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          MODELS.indexOf(a.model) - MODELS.indexOf(b.model),
      ),
    [rows],
  );
  const pages = Math.max(1, Math.ceil(rows.length / size)),
    current = Math.min(page, pages - 1),
    shown = ordered.slice(current * size, (current + 1) * size);
  return (
    <section id="ledger" className="panel ledger-panel">
      <div className="section-title">
        <div>
          <h2>Forecast ledger</h2>
          <p>Individual next-session forecasts and the values that followed.</p>
        </div>
        <button
          className="outline-button"
          disabled={!rows.length}
          onClick={() => exportLedger(ordered, asset, example)}
        >
          <ArrowDownToLine size={17} />
          EXPORT CSV
        </button>
      </div>
      <p className="subtle-note">
        Uses the period and regime filters in Model comparison. Export includes
        all {rows.length} matching rows.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Target session</th>
              <th>Model</th>
              <th>Previous close</th>
              <th>Predicted close</th>
              <th>Actual close</th>
              <th>Error</th>
              <th>Abs. error</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.date + r.model}>
                <td>{displayDate(r.date)}</td>
                <td>{NAMES[r.model]}</td>
                <td>{assetValue(r.origin_close, asset.symbol)}</td>
                <td>{assetValue(r.predicted_price, asset.symbol)}</td>
                <td>{assetValue(r.actual_price, asset.symbol)}</td>
                <td>
                  {assetValue(r.predicted_price - r.actual_price, asset.symbol)}
                </td>
                <td>
                  {assetValue(
                    Math.abs(r.predicted_price - r.actual_price),
                    asset.symbol,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <p className="empty-message">No forecasts match these filters.</p>
      )}
      <div className="pagination">
        <span>
          {rows.length
            ? `${current * size + 1}–${Math.min((current + 1) * size, rows.length)} of ${rows.length}`
            : "0 rows"}
        </span>
        <button disabled={current === 0} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <button
          disabled={current >= pages - 1}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}
const EquationContent = lazy(() =>
  import("./equations").then((module) => ({ default: module.Equations })),
);
function Equations({ section }: { section: string }) {
  return (
    <Suspense fallback={<p>Loading equations…</p>}>
      <EquationContent section={section} />
    </Suspense>
  );
}
function Methodology({
  payload,
  onReload,
  loading,
}: {
  payload: Payload;
  onReload: () => void;
  loading: boolean;
}) {
  return (
    <section id="methodology" className="panel methodology-panel">
      <div className="section-title">
        <div>
          <h2>Methodology</h2>
          <p>The same research contract for all six assets.</p>
        </div>
        <button
          className="outline-button"
          onClick={onReload}
          disabled={loading}
        >
          <RefreshCw size={16} />
          RELOAD RESULTS
        </button>
      </div>
      <div className="method-grid">
        <article>
          <h3>TARGET &amp; COMPARISON</h3>
          <p>
            Models predict next-session returns internally. Predicted close =
            observed previous close × (1 + predicted return). Primary metric:
            closing-value MAE per asset; RMSE emphasizes large misses. Positive
            baseline-relative skill means lower error than naive. A zero naive
            error makes relative skill undefined.
          </p>
          <p>
            Raw rupee and index-point errors are never pooled. The full report
            also contains equal-weight per-asset comparisons and paired
            date-block uncertainty intervals. First-place ranks are descriptive,
            not significance tests.
          </p>
          <Equations section="target" />
        </article>
        <article>
          <h3>CHRONOLOGICAL VALIDATION</h3>
          <p>
            Fixed history: 1 Oct 2021–16 Oct 2026. Two-calendar-year initial
            training, including feature warmup; expanding training and quarterly
            refits. Held-out forecasts begin in Oct 2023. The last test quarter
            is partial.
          </p>
          <p>
            Predictors use only preceding information. Daily context returns are
            aligned to an 18:00 IST cutoff using conservative availability
            assumptions. Regimes use lagged Nifty volatility and training-only
            thresholds.
          </p>
          <Equations section="validation" />
        </article>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Inputs and configuration</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Naive baseline</td>
              <td>
                Zero return; tomorrow’s closing value equals the observed
                previous close.
                <Equations section="Naive" />
              </td>
            </tr>
            <tr>
              <td>Ridge</td>
              <td>
                All features; training-only standardization and a regularized
                linear fit, alpha 10.
                <Equations section="Ridge" />
              </td>
            </tr>
            <tr>
              <td>ARIMA</td>
              <td>
                Own return history; (1,0,1) with constant. Updates state after
                each observed outcome; parameters refit quarterly.
                <Equations section="ARIMA" />
              </td>
            </tr>
            <tr>
              <td>Random Forest</td>
              <td>
                All features; 150 trees, depth 6, minimum leaf size 15.{" "}
                <Equations section="RandomForest" />
              </td>
            </tr>
            <tr>
              <td>XGBoost</td>
              <td>
                All features; 150 trees, depth 3, learning rate 0.03,
                regularized CPU histogram implementation.
                <Equations section="XGBoost" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="data-record">
        <h3>COMPARISON STATISTICS</h3>
        <Equations section="metrics" />
      </div>
      <div className="data-record">
        <h3>DATA RECORD</h3>
        <p>
          {payload.available
            ? `Evaluation generated: ${payload.generated_utc || "timestamp unavailable"}. Source: ${payload.source || "recorded market inputs"}.`
            : "Example data is generated only for the interface. It is not used for research or placed in market caches."}
        </p>
        <p>
          Quality:{" "}
          {payload.data_quality?.status || "not independently verified"}.{" "}
          {payload.research_status ||
            "The selected historical period has already been inspected; revised comparisons remain exploratory."}
        </p>
        {payload.warning && <p>{payload.warning}</p>}
        <p>
          Yahoo adjusted histories may be revised. Original Energy/Metal sector
          histories are imported from genuine CSVs. Full-price charts require
          the local history cache matching the chosen forecast run.
          Company/exchange links lead to official external sites; their current
          quotes may use a different date or adjustment basis.
        </p>
        <Equations section="data" />
      </div>
    </section>
  );
}
function App() {
  const [asset, setAsset] = useState<Asset | null>(assetFromHash),
    [section, setSection] = useState<Section>("overview"),
    [activeTab, setActiveTab] = useState<Section>("overview"),
    [account, setAccount] = useState<"login" | "signup" | null>(null);
  const [payload, setPayload] = useState<Payload>({
      available: false,
      rows: [],
    }),
    [loading, setLoading] = useState(true),
    [history, setHistory] = useState<History | null>(null),
    [historyLoading, setHistoryLoading] = useState(false),
    [fold, setFold] = useState("all"),
    [regime, setRegime] = useState("all");
  const demo = useMemo(exampleRows, []),
    reload = async () => {
      setLoading(true);
      try {
        setPayload(await getResults());
      } finally {
        setLoading(false);
      }
    };
  useEffect(() => {
    void reload();
  }, []);
  useEffect(() => {
    const route = () => {
      const next = assetFromHash();
      setAsset(next);
      const id = window.location.hash.split("/")[3] as Section;
      setSection(SECTIONS.some(([s]) => s === id) ? id : "overview");
      setActiveTab(SECTIONS.some(([s]) => s === id) ? id : "overview");
      if (!next) window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", route);
    route();
    return () => window.removeEventListener("hashchange", route);
  }, []);
  useEffect(() => {
    if (asset) {
      const timer = setTimeout(
        () =>
          section === "overview"
            ? window.scrollTo({ top: 0, behavior: "smooth" })
            : document
                .getElementById(section)
                ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        100,
      );
      return () => clearTimeout(timer);
    }
  }, [asset, section]);
  useEffect(() => {
    if (!asset) return;
    let scheduled = false;
    const update = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        const threshold = window.innerWidth <= 760 ? 185 : 165;
        let current: Section = "overview";
        for (const [id] of SECTIONS) {
          const el = document.getElementById(id);
          if (el && el.getBoundingClientRect().top <= threshold) current = id;
        }
        setActiveTab(current);
      });
    };
    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => window.removeEventListener("scroll", update);
  }, [asset]);
  useEffect(() => {
    document.title = asset
      ? `${asset.short} · BullBench`
      : "BullBench — Stock forecasts & model comparison";
  }, [asset]);
  useEffect(() => {
    setFold("all");
    setRegime("all");
  }, [asset?.symbol]);
  useEffect(() => {
    setHistory(null);
    if (!asset || loading || !payload.available) {
      setHistoryLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setHistoryLoading(true);
    const timer = setTimeout(() => controller.abort(), 12000);
    void getHistory(asset.symbol, controller.signal)
      .then((value) => {
        if (active) setHistory(value);
      })
      .finally(() => {
        clearTimeout(timer);
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [asset?.symbol, loading, payload]);
  const rows = useMemo(
    () =>
      loading
        ? []
        : (payload.available ? payload.rows : demo).filter(
            (r) => r.stock === asset?.symbol,
          ),
    [loading, payload, demo, asset],
  );
  const candles = useMemo(
    () =>
      history?.available && history.symbol === asset?.symbol
        ? history.rows
        : historyFromForecasts(rows),
    [history, rows, asset],
  );
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (fold === "all" || r.fold === fold) &&
          (regime === "all" || r.regime === regime),
      ),
    [rows, fold, regime],
  );
  const historyNote = historyLoading
    ? "Loading verified full history…"
    : payload.available && !history?.available
      ? `${history?.reason || "Full history is unavailable."} Showing evaluated-session closing values only; volume is not available.`
      : !payload.available
        ? "Example history is illustrative and covers only the example dates."
        : "";
  return (
    <>
      <Header asset={asset} onAccount={setAccount} />
      {asset ? (
        <>
          <nav className="section-nav" aria-label="Asset sections">
            <div className="section-nav-inner">
              {SECTIONS.map(([id, label], i) => (
                <a
                  key={id}
                  href={`#/asset/${asset.slug}/${id}`}
                  className={activeTab === id ? "active" : ""}
                >
                  {i === 0 ? asset.short : label}
                </a>
              ))}
            </div>
          </nav>
          <main className="asset-page">
            <DataNotice payload={payload} loading={loading} />
            {payload.connection_error && (
              <div className="results-error" role="alert">
                Results error: {payload.reason} Labeled examples are shown until
                valid results can be loaded.
              </div>
            )}
            <Overview
              asset={asset}
              history={candles}
              rows={rows}
              historyNote={historyNote}
            />
            <HistoryChart key={asset.symbol} asset={asset} history={candles} />
            <ModelComparison
              key={`models-${asset.symbol}`}
              asset={asset}
              rows={rows}
              filtered={filtered}
              fold={fold}
              setFold={setFold}
              regime={regime}
              setRegime={setRegime}
            />
            <Analysis asset={asset} rows={rows} filtered={filtered} />
            <Ledger
              asset={asset}
              rows={filtered}
              example={!payload.available}
            />
            <Methodology
              payload={payload}
              onReload={() => void reload()}
              loading={loading}
            />
            <footer className="asset-footer">
              <Brand />
              <span>
                Historical research · Five models, six assets · Not a trading
                recommendation
              </span>
              <a href="#/">Back to Home</a>
            </footer>
          </main>
        </>
      ) : (
        <Home payload={payload} loading={loading} />
      )}{" "}
      {account && (
        <AccountDialog mode={account} onClose={() => setAccount(null)} />
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
