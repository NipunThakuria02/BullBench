import { ASSETS } from "./assets";
export { ASSETS } from "./assets";
export const MODELS = [
  "Naive",
  "Ridge",
  "ARIMA",
  "RandomForest",
  "XGBoost",
] as const;
export type Model = (typeof MODELS)[number];
export const COLORS: Record<string, string> = {
  Actual: "#6355ff",
  Naive: "#8c8f8a",
  Ridge: "#547aa4",
  ARIMA: "#bf8447",
  RandomForest: "#9482ab",
  XGBoost: "#be6655",
};
export const NAMES: Record<string, string> = {
  Naive: "Naive baseline",
  Ridge: "Ridge",
  ARIMA: "ARIMA",
  RandomForest: "Random Forest",
  XGBoost: "XGBoost",
};
export interface Row {
  date: string;
  stock: string;
  model: Model;
  actual_return: number;
  predicted_return: number;
  origin_close: number;
  actual_price: number;
  predicted_price: number;
  regime: "calm" | "volatile";
  fold: string;
  majority_direction?: number;
}
export interface Payload {
  available: boolean;
  rows: Row[];
  reason?: string;
  generated_utc?: string;
  source?: string;
  transport?: "api" | "static";
  warning?: string;
  connection_error?: boolean;
  schema_version?: number;
  data_quality?: { status: string };
  research_status?: string;
}
export function metrics(rows: Row[]) {
  if (!rows.length)
    return {
      n: 0,
      rmse: 0,
      mae: 0,
      direction: 0,
      coverage: 0,
      skill: 0,
      reference: null as number | null,
      priceMae: 0,
      priceRmse: 0,
      priceSkill: null as number | null,
      priceRmseSkill: null as number | null,
    };
  const rmse = Math.sqrt(
    rows.reduce(
      (sum, r) => sum + (r.predicted_return - r.actual_return) ** 2,
      0,
    ) / rows.length,
  );
  const baseline = Math.sqrt(
    rows.reduce((sum, r) => sum + r.actual_return ** 2, 0) / rows.length,
  );
  const priceError = rows.map((r) => r.predicted_price - r.actual_price);
  const priceMae =
    priceError.reduce((sum, v) => sum + Math.abs(v), 0) / rows.length;
  const priceRmse = Math.sqrt(
    priceError.reduce((sum, v) => sum + v * v, 0) / rows.length,
  );
  const naiveMae =
    rows.reduce(
      (sum, r) => sum + Math.abs(r.origin_close - r.actual_price),
      0,
    ) / rows.length;
  const naiveRmse = Math.sqrt(
    rows.reduce((sum, r) => sum + (r.origin_close - r.actual_price) ** 2, 0) /
      rows.length,
  );
  return {
    n: rows.length,
    priceMae,
    priceRmse,
    priceSkill: naiveMae > 0 ? 1 - priceMae / naiveMae : null,
    priceRmseSkill: naiveRmse > 0 ? 1 - priceRmse / naiveRmse : null,
    reference: rows.every(
      (r) => r.majority_direction === 1 || r.majority_direction === -1,
    )
      ? rows.reduce((sum, r) => {
          const product = Math.sign(r.actual_return) * r.majority_direction!;
          return sum + (product > 0 ? 1 : product < 0 ? 0 : 0.5);
        }, 0) / rows.length
      : null,
    rmse,
    mae:
      rows.reduce(
        (sum, r) => sum + Math.abs(r.predicted_return - r.actual_return),
        0,
      ) / rows.length,
    direction:
      rows.reduce((sum, r) => {
        const s = Math.sign(r.actual_return) * Math.sign(r.predicted_return);
        return sum + (s > 0 ? 1 : s < 0 ? 0 : 0.5);
      }, 0) / rows.length,
    coverage: rows.filter((r) => r.predicted_return !== 0).length / rows.length,
    skill: baseline ? 1 - rmse / baseline : 0,
  };
}
export const percent = (v: number, digits = 2) =>
  new Intl.NumberFormat("en-IN", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
export const assetValue = (v: number, symbol: string) =>
  symbol === "^NSEI"
    ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(v) +
      " pts"
    : money(v);
export const money = (v: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(v);
export const displayDate = (s: string) =>
  new Date(s + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

// Deterministic interface fixtures. Not Yahoo prices and never used for research.
export function exampleRows(): Row[] {
  const rows: Row[] = [];
  let seed = 42;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const dates: string[] = [];
  for (
    let d = new Date("2026-04-01T00:00:00Z");
    d <= new Date("2026-10-16T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1)
  )
    if (![0, 6].includes(d.getUTCDay()))
      dates.push(d.toISOString().slice(0, 10));
  ASSETS.forEach((asset, a) => {
    let close = [1000, 800, 3000, 1200, 150, 20000][a];
    dates.forEach((date, i) => {
      const volatile = i % 37 > 25;
      const actual = (random() - 0.48) * (volatile ? 0.065 : 0.025);
      const origin = close;
      close *= 1 + actual;
      MODELS.forEach((model) => {
        const pred =
          model === "Naive"
            ? 0
            : (random() - 0.48) *
              {
                Ridge: 0.008,
                ARIMA: 0.005,
                RandomForest: 0.012,
                XGBoost: 0.015,
              }[model];
        rows.push({
          date,
          stock: asset.symbol,
          model,
          actual_return: actual,
          predicted_return: pred,
          origin_close: origin,
          actual_price: close,
          predicted_price: origin * (1 + pred),
          regime: volatile ? "volatile" : "calm",
          fold:
            date < "2026-07-01"
              ? "2026-04-01"
              : date < "2026-10-01"
                ? "2026-07-01"
                : "2026-10-01",
        });
      });
    });
  });
  return rows;
}
export function validRows(rows: Row[]): boolean {
  const seen = new Set<string>();
  const sessions = new Map<string, Set<string>>();
  const outcomes = new Map<string, string>();
  const near = (a: number, b: number) =>
    Math.abs(a - b) <= 1e-8 + 1e-7 * Math.abs(b);
  for (const row of rows) {
    if (!row || typeof row !== "object") return false;
    if (
      !ASSETS.some((a) => a.symbol === row.stock) ||
      !MODELS.includes(row.model) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      !/^\d{4}-(01|04|07|10)-01$/.test(row.fold) ||
      row.date < "2023-10-01" ||
      row.date > "2026-10-16" ||
      !Number.isFinite(Date.parse(row.date)) ||
      new Date(row.date).toISOString().slice(0, 10) !== row.date ||
      row.date.slice(0, 4) !== row.fold.slice(0, 4) ||
      Math.floor((Number(row.date.slice(5, 7)) - 1) / 3) !==
        Math.floor((Number(row.fold.slice(5, 7)) - 1) / 3) ||
      !["calm", "volatile"].includes(row.regime) ||
      ![
        row.actual_return,
        row.predicted_return,
        row.origin_close,
        row.actual_price,
        row.predicted_price,
      ].every((v) => typeof v === "number" && Number.isFinite(v)) ||
      row.origin_close <= 0 ||
      row.actual_price <= 0 ||
      row.predicted_price <= 0 ||
      !near(row.actual_price, row.origin_close * (1 + row.actual_return)) ||
      !near(
        row.predicted_price,
        row.origin_close * (1 + row.predicted_return),
      ) ||
      (row.model === "Naive" && row.predicted_return !== 0) ||
      (row.majority_direction !== undefined &&
        ![-1, 1].includes(row.majority_direction))
    )
      return false;
    const key = row.stock + ":" + row.date;
    const identity = key + ":" + row.model;
    if (seen.has(identity)) return false;
    seen.add(identity);
    const outcome = JSON.stringify([
      row.actual_return,
      row.origin_close,
      row.actual_price,
      row.regime,
      row.fold,
      row.majority_direction,
    ]);
    if (outcomes.has(key) && outcomes.get(key) !== outcome) return false;
    outcomes.set(key, outcome);
    sessions.set(key, (sessions.get(key) ?? new Set()).add(row.model));
  }
  return (
    rows.length > 0 &&
    new Set(rows.map((r) => r.stock)).size === ASSETS.length &&
    [...sessions.values()].every((models) => models.size === MODELS.length)
  );
}

export async function getResults(): Promise<Payload> {
  let apiFailure = "";
  for (const path of ["/api/results", "/results.json"]) {
    const transport = path === "/api/results" ? "api" : "static";
    try {
      const response = await fetch(path, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (response.status === 404) continue;
      if (!response.ok) {
        let reason = `Results request failed (${response.status}).`;
        try {
          reason = (await response.json()).reason || reason;
        } catch {
          /* Non-JSON server error. */
        }
        return { available: false, rows: [], connection_error: true, reason };
      }
      const type = response.headers.get("content-type") ?? "";
      if (type.includes("text/html")) continue; // Static SPA fallback, not an API response.
      const payload: Payload = await response.json();
      if (!payload.available)
        return {
          available: false,
          rows: [],
          reason: payload.reason || "No evaluation is connected.",
        };
      if (
        !Array.isArray(payload.rows) ||
        !validRows(payload.rows) ||
        ((payload.schema_version ?? 1) >= 2 &&
          payload.rows.some((r) => r.majority_direction === undefined))
      )
        return {
          available: false,
          rows: [],
          connection_error: true,
          reason:
            "Results failed consistency checks. The dataset was not loaded.",
        };
      return {
        ...payload,
        transport,
        warning:
          transport === "static"
            ? `Static snapshot. ${apiFailure} Re-export and rebuild to update it.`
            : undefined,
      };
    } catch (error) {
      if (transport === "api") {
        apiFailure = "The API could not be reached.";
      } else {
        return {
          available: false,
          rows: [],
          connection_error: true,
          reason:
            "Evaluation outputs could not be read. Check the server and exported file.",
        };
      }
    }
  }
  return {
    available: false,
    rows: [],
    reason: apiFailure || "No evaluated market data is connected.",
    connection_error: !!apiFailure,
  };
}
