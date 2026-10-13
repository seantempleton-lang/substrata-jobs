import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./test/e2e", workers: 1, fullyParallel: false,
  use: { baseURL: "http://localhost:18080", viewport: { width: 390, height: 844 }, trace: "retain-on-failure" },
  webServer: { command: "node test/fixtures/field-server.mjs", url: "http://localhost:18081/health", reuseExistingServer: !process.env.CI },
});
