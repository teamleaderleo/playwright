import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    browserName: "chromium",
    serviceWorkers: "block",
    trace: "off",
    screenshot: "off",
    video: "off"
  }
});
