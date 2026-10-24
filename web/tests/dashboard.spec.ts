import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { ASSETS, searchAssets } from "../src/assets";
import { rangeStart, movingAverage } from "../src/history";
const symbols = ASSETS.map((a) => a.symbol);
const models = ["Naive", "Ridge", "ARIMA", "RandomForest", "XGBoost"];
const rows = symbols.flatMap((stock, a) =>
  models.flatMap((model) =>
    [0, 1].map((i) => {
      const scale = [1, 2, 30, 10, 1.5, 200][a],
        origin = (i === 0 ? 100 : 110) * scale,
        actual = (i === 0 ? 110 : 99) * scale;
      const predicted =
        model === "Naive" ? origin : model === "Ridge" ? origin * 1.05 : actual;
      return {
        stock,
        model,
        date: i === 0 ? "2026-10-15" : "2026-10-16",
        fold: "2026-10-01",
        regime: i === 0 ? "calm" : "volatile",
        origin_close: origin,
        actual_price: actual,
        predicted_price: predicted,
        actual_return: actual / origin - 1,
        predicted_return: predicted / origin - 1,
        majority_direction: 1,
      };
    }),
  ),
);
async function mockMarket(page: Page) {
  await page.route("**/api/results", (r) =>
    r.fulfill({
      json: {
        available: true,
        schema_version: 2,
        source: "mixed",
        generated_utc: "2026-10-23T12:00:00Z",
        data_quality: { status: "review_required" },
        rows,
      },
    }),
  );
  await page.route("**/api/history?*", (route) => {
    const symbol = new URL(route.request().url()).searchParams.get("symbol")!;
    const scale = [1, 2, 30, 10, 1.5, 200][symbols.indexOf(symbol)];
    const history = [];
    let i = 0;
    for (
      let d = new Date("2021-10-01T00:00:00Z");
      d <= new Date("2026-10-16T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + 1)
    )
      if (![0, 6].includes(d.getUTCDay())) {
        const date = d.toISOString().slice(0, 10),
          evaluated = rows.find((r) => r.stock === symbol && r.date === date);
        history.push({
          date,
          close: evaluated?.actual_price ?? (100 + i++ * 0.01) * scale,
          volume: symbol === "^NSEI" ? null : 123456,
        });
      }
    return route.fulfill({ json: { available: true, symbol, rows: history } });
  });
}
async function openAsset(page: Page, slug = "hdfc-bank", section = "overview") {
  await mockMarket(page);
  await page.goto(`/#/asset/${slug}/${section}`);
  await expect(
    page.getByRole("heading", {
      name: ASSETS.find((a) => a.slug === slug)!.name,
      exact: true,
    }),
  ).toBeVisible();
}

test("homepage matches the agreed navigation and working six-asset search", async ({
  page,
}) => {
  await mockMarket(page);
  await page.goto("/");
  await expect(page.locator(".brand-large")).toHaveText("BullBench");
  await expect(
    page.getByRole("link", { name: "SCREENS", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "TOOLS", exact: true }),
  ).toHaveCount(0);
  const input = page.getByRole("combobox", { name: "Search for a company" });
  await input.fill("hdfc");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option")).toContainText("HDFC Bank");
  await input.press("Enter");
  await expect(
    page.getByRole("heading", { name: "HDFC Bank Ltd", exact: true }),
  ).toBeVisible();
  await page
    .locator(".site-header")
    .getByRole("link", { name: "BullBench home" })
    .click();
  await expect(page.locator(".brand-large")).toBeVisible();
  await page.getByRole("link", { name: "TCS", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Tata Consultancy Services Ltd",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "HOME", exact: true }).click();
  await expect(page.locator(".brand-large")).toBeVisible();
});

test("all six pages have the correct content and section navigation", async ({
  page,
}) => {
  await mockMarket(page);
  for (const a of ASSETS) {
    await page.goto(`/#/asset/${a.slug}/overview`);
    await expect(
      page.getByRole("heading", { name: a.name, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".official-links a").first()).toHaveAttribute(
      "href",
      a.website,
    );
    await expect(
      page
        .locator(".section-nav")
        .getByRole("link", { name: "Model comparison", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator(".section-nav")
        .getByRole("link", { name: "Peers", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".data-notice")).toHaveCount(0);
    const logo = page.locator(".company-title .asset-mark");
    await expect(logo).toHaveAttribute("src", `/logos/${a.slug}.svg`);
    await expect(logo).toBeVisible();
    await expect
      .poll(() =>
        logo.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      )
      .toBe(true);
    if (a.symbol === "^NSEI") {
      await expect(page.locator(".quote strong")).toContainText("pts");
      await expect(
        page.getByRole("checkbox", { name: "Volume unavailable" }),
      ).toBeDisabled();
      await expect(page.locator(".official-links")).not.toContainText("BSE:");
    }
  }
});

test("header search supports ticker aliases, no results and keyboard selection", async ({
  page,
}) => {
  await openAsset(page);
  const search = page.getByRole("combobox", { name: "Search for a company" });
  await search.fill("INFOSYS");
  await expect(
    page.getByText("No matching study asset.", { exact: false }),
  ).toBeVisible();
  await search.fill("TATASTEEL.NS");
  await search.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Tata Steel Ltd", exact: true }),
  ).toBeVisible();
  await search.fill("^NSEI");
  await search.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Nifty 50", exact: true }),
  ).toBeVisible();
  await search.click();
  await expect(search).toHaveAttribute("aria-expanded", "true");
  await search.press("Escape");
  await expect(search).toHaveAttribute("aria-expanded", "false");
});

test("historical ranges, DMA and hover/touch values work", async ({ page }) => {
  await openAsset(page, "hdfc-bank", "chart");
  const chart = page.getByRole("img", {
    name: /HDFC Bank historical price chart/,
  });
  await expect(page.locator(".history-note")).not.toContainText("Loading");
  await page.getByRole("button", { name: "Max", exact: true }).click();
  await expect(page.locator("#chart>.subtle-note")).toContainText(
    "01 Oct 2021",
  );
  await page.getByRole("checkbox", { name: "50 DMA", exact: true }).check();
  await page.getByRole("checkbox", { name: "200 DMA", exact: true }).check();
  const box = await chart.boundingBox();
  await chart.hover({
    position: { x: box!.width * 0.55, y: box!.height * 0.4 },
  });
  await expect(page.locator("#chart .chart-tip")).toContainText("50 DMA");
  await expect(page.locator("#chart .chart-tip")).toContainText(
    "Volume: 1,23,456",
  );
  await chart.focus();
  await chart.press("ArrowRight");
  await expect(page.locator("#chart .chart-tip")).toBeVisible();
  await page.getByRole("button", { name: "1M", exact: true }).click();
  await expect(page.locator("#chart>.subtle-note")).toContainText(
    "16 Sept 2026",
  );
});

test("closing-value metrics, forecast hover and exported ledger agree", async ({
  page,
}) => {
  await openAsset(page, "hdfc-bank", "models");
  const table = page.locator(".accuracy-table");
  const ridge = table.locator("tbody tr").filter({ hasText: "Ridge" });
  await expect(ridge).toContainText("₹10.75");
  await expect(ridge).toContainText("₹12.19");
  await expect(ridge).toContainText("-2.38%");
  await expect(ridge.locator("td").first()).toHaveText("5");
  const valueChart = page.getByRole("img", {
    name: "HDFC Bank forecast closing value comparison",
  });
  const box = await valueChart.boundingBox();
  await valueChart.hover({
    position: { x: (box!.width * 76) / 1200, y: box!.height * 0.5 },
  });
  await expect(page.locator("#models .chart-tip")).toContainText("15 Oct 2026");
  await expect(page.locator("#models .chart-tip")).toContainText("₹110.00");
  await valueChart.hover({
    position: { x: (box!.width * 1115) / 1200, y: box!.height * 0.5 },
  });
  await expect(page.locator("#models .chart-tip")).toContainText("16 Oct 2026");
  await expect(page.locator("#models .chart-tip")).toContainText("₹99.00");
  await page.getByRole("button", { name: "Errors", exact: true }).click();
  const chart = page.getByRole("img", {
    name: "HDFC Bank forecast error comparison",
  });
  await chart.focus();
  await chart.press("ArrowRight");
  await expect(page.locator("#models .chart-tip")).toContainText("₹16.50");
  await page.getByRole("button", { name: "Ridge", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ridge", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(table.locator("tbody tr")).toHaveCount(5);
  await page.getByLabel("Market regime").selectOption("volatile");
  await expect(page.locator(".scope-note")).toContainText(
    "Table: all 1 sessions",
  );
  await page
    .locator(".section-nav")
    .getByRole("link", { name: "Forecast ledger", exact: true })
    .click();
  await expect(page.locator("#ledger thead")).toContainText("Previous close");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "EXPORT CSV", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("HDFCBANK.NS-forecasts.csv");
  const [head, ...lines] = (await readFile((await file.path())!, "utf8")).split(
      "\n",
    ),
    fields = head.split(",");
  const record = lines
    .map((l) => l.split(","))
    .find((r) => r[fields.indexOf("model")] === "Ridge")!;
  expect(Number(record[fields.indexOf("price_error")])).toBeCloseTo(16.5);
  expect(Number(record[fields.indexOf("absolute_price_error")])).toBeCloseTo(
    16.5,
  );
});

test("no evaluation displays labeled examples and example export", async ({
  page,
}) => {
  await page.route("**/api/results", (r) =>
    r.fulfill({
      json: { available: false, rows: [], reason: "No evaluation connected." },
    }),
  );
  await page.goto("/#/asset/tcs/ledger");
  await expect(page.locator(".data-notice")).toContainText("EXAMPLE DATA");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "EXPORT CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe(
    "EXAMPLE-TCS.NS-forecasts.csv",
  );
});

test("invalid results retain the explicit error and do not use static snapshots", async ({
  page,
}) => {
  let staticRequested = false;
  await page.route("**/api/results", (r) =>
    r.fulfill({
      status: 422,
      json: { available: false, reason: "Prediction checksum mismatch" },
    }),
  );
  await page.route("**/results.json", (r) => {
    staticRequested = true;
    return r.fulfill({ json: { available: true, rows } });
  });
  await page.goto("/#/asset/hdfc-bank/overview");
  await expect(page.getByRole("alert")).toContainText(
    "Prediction checksum mismatch",
  );
  expect(staticRequested).toBe(false);
});

test("history unavailable falls back explicitly to evaluated sessions", async ({
  page,
}) => {
  await mockMarket(page);
  await page.route("**/api/history?*", (r) =>
    r.fulfill({ status: 422, json: { available: false, rows: [] } }),
  );
  await page.goto("/#/asset/hdfc-bank/overview");
  await expect(page.locator(".history-note")).toContainText(
    "Showing evaluated-session closing values only",
  );
  await expect(
    page.getByRole("checkbox", { name: "Volume unavailable" }),
  ).toBeDisabled();
});

test("login and signup explain local account availability without collecting credentials", async ({
  page,
}) => {
  await mockMarket(page);
  await page.goto("/");
  await page.getByRole("button", { name: "LOGIN", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Accounts are not enabled",
  );
  await page.getByRole("button", { name: "Close account dialog" }).click();
  await page
    .getByRole("button", { name: "Get free account", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Get a free account");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("mobile home, stock pages and all sections fit without page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockMarket(page);
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "HDFC Bank", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "HDFC Bank Ltd", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".section-nav")
    .getByRole("link", { name: "Model comparison", exact: true })
    .click();
  await expect(page.locator(".accuracy-table")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("pure search, range and moving-average calculations handle edge cases", () => {
  expect(searchAssets("HDFC")).toHaveLength(1);
  expect(searchAssets("^NSEI")[0].short).toBe("Nifty 50");
  expect(searchAssets("INFY")).toHaveLength(0);
  expect(rangeStart("2024-03-31", "1M")).toBe("2024-02-29");
  expect(rangeStart("2026-10-16", "Max")).toBe("2021-10-01");
  const history = [1, 2, 3, 4].map((close, i) => ({
    date: `2026-10-${10 + i}`,
    close,
    volume: null,
  }));
  expect(movingAverage(history, 3)).toEqual([null, null, 2, 3]);
});

test("methodology renders model and statistical equations with local fonts", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openAsset(page);
  await page
    .locator(".section-nav")
    .getByRole("link", { name: "Methodology", exact: true })
    .click();
  const methodology = page.locator("#methodology");
  await expect(methodology.locator(".method-equation")).toHaveCount(16);
  await expect(methodology.locator("math")).toHaveCount(16);
  await expect(methodology.locator(".katex-error")).toHaveCount(0);
  await expect(
    methodology.getByText("Regularized linear regression", { exact: true }),
  ).toBeVisible();
  await expect(
    methodology.getByText("Backward alignment of context data", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      document.fonts.load("16px KaTeX_Main").then((fonts) => fonts.length > 0),
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
