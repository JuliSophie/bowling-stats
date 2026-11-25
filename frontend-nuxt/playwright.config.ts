import { defineConfig } from "@playwright/test";

const baseURL = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4318/").replace(/\/?$/, "/");
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL,
    colorScheme: "light",
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: process.env.PLAYWRIGHT_BASE_URL ? "node test/subpath-server.mjs" : "npm run preview",
    url: `${baseURL}stats/games`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
