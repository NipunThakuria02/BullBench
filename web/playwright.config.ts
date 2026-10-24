import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:8000",
    headless: true,
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
  reporter: "list",
  webServer: {
    command: "npm run preview -- --port 8000",
    port: 8000,
    reuseExistingServer: true,
  },
});
