import { type Row } from "./data";
export interface Candle {
  date: string;
  close: number;
  volume: number | null;
}
export interface History {
  available: boolean;
  symbol: string;
  rows: Candle[];
  reason?: string;
}
export function validHistory(history: History, symbol: string): boolean {
  return (
    history.symbol === symbol &&
    Array.isArray(history.rows) &&
    history.rows.length > 0 &&
    history.rows.every(
      (r, i) =>
        typeof r.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
        r.date >= "2021-10-01" &&
        r.date <= "2026-10-16" &&
        Number.isFinite(Date.parse(r.date)) &&
        new Date(r.date).toISOString().slice(0, 10) === r.date &&
        Number.isFinite(r.close) &&
        r.close > 0 &&
        (r.volume === null || (Number.isFinite(r.volume) && r.volume >= 0)) &&
        (!i || r.date > history.rows[i - 1].date),
    )
  );
}
/** Map ticker symbol to URL-safe filename, matching cache_path() in config.py. */
function historyFilename(symbol: string): string {
  return symbol.replace("^", "INDEX_").replace("=", "_") + ".json";
}
export async function getHistory(
  symbol: string,
  signal: AbortSignal,
): Promise<History> {
  // Try the live API first; then fall back to a pre-exported static file.
  for (const url of [
    `/api/history?symbol=${encodeURIComponent(symbol)}`,
    `/history/${historyFilename(symbol)}`,
  ]) {
    const isStatic = url.startsWith("/history/");
    try {
      const response = await fetch(url, {
        cache: isStatic ? "default" : "no-store",
        signal,
      });
      if (response.status === 404) continue;
      if (!response.ok) {
        if (isStatic) continue; // static file error — skip, don't surface
        return {
          available: false,
          symbol,
          rows: [],
          reason:
            response.status === 422
              ? "The history cache could not be matched to this forecast run."
              : "Full local price history is unavailable.",
        };
      }
      const type = response.headers.get("content-type") ?? "";
      if (type.includes("text/html")) continue; // SPA fallback, not a data file
      const payload: History = await response.json();
      if (payload.available && validHistory(payload, symbol)) return payload;
      if (!isStatic && !payload.available)
        return {
          available: false,
          symbol,
          rows: [],
          reason: payload.reason || "Full local price history is unavailable.",
        };
      // static file returned invalid data — skip
    } catch {
      if (!isStatic) continue; // API unreachable — try static next
      // Static file also failed — give up
    }
  }
  return {
    available: false,
    symbol,
    rows: [],
    reason: "Full local price history could not be reached.",
  };
}
export function historyFromForecasts(rows: Row[]): Candle[] {
  const seen = new Map<string, Candle>();
  for (const row of rows)
    if (!seen.has(row.date))
      seen.set(row.date, {
        date: row.date,
        close: row.actual_price,
        volume: null,
      });
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
}
export const RANGES = ["1M", "3M", "6M", "1Yr", "3Yr", "5Yr", "Max"] as const;
export type Range = (typeof RANGES)[number];
export function rangeStart(end: string, range: Range): string {
  if (range === "Max") return "2021-10-01";
  const months = (
    { "1M": 1, "3M": 3, "6M": 6, "1Yr": 12, "3Yr": 36, "5Yr": 60 } as const
  )[range];
  const date = new Date(end + "T00:00:00Z");
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const last = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString().slice(0, 10);
}
export function movingAverage(
  rows: Candle[],
  window: number,
): (number | null)[] {
  let sum = 0;
  return rows.map((r, i) => {
    sum += r.close;
    if (i >= window) sum -= rows[i - window].close;
    return i >= window - 1 ? sum / window : null;
  });
}
