import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://localhost:3011",
    headless: true,
    viewport: { width: 1360, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3011",
    url: "http://localhost:3011/dashboard",
    reuseExistingServer: false,
    timeout: 120000,
    env: { DATABASE_URL: "file:./e2e.db", APP_URL: "http://localhost:3011" },
  },
});
