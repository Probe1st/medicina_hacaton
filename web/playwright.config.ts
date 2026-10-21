import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    timezoneId: "Europe/Moscow",
    locale: "ru-RU",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm --prefix ../server run start",
    url: "http://127.0.0.1:4173/api/health",
    reuseExistingServer: false,
    timeout: 30000,
    gracefulShutdown: {
      signal: "SIGTERM",
      timeout: 5000,
    },
    env: {
      DATABASE_PATH: process.env.DATABASE_PATH || "/tmp/marshrut-playwright-default.sqlite",
      PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN || "http://127.0.0.1:4173",
      PORT: process.env.PORT || "4173",
      NODE_ENV: process.env.NODE_ENV || "test",
    },
  },
});
