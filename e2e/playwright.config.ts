import { defineConfig, devices } from "@playwright/test";

/**
 * Single top-level Playwright project covering all three EduLearn web
 * surfaces (frontend, admin, mobile-web). Chosen over three separate
 * per-app Playwright installs because:
 *   - all three targets are already-running Docker containers (not apps
 *     this suite builds/starts), so there is no per-app dev-server wiring
 *     to gain from separate configs;
 *   - one `npx playwright test` run and one HTML report covers the whole
 *     platform, which is easier to run in CI and easier to reason about
 *     than stitching together three independent Playwright installs;
 *   - a project-per-app split still gives full isolation (own baseURL,
 *     own test directory, can be run/filtered independently via
 *     `--project=admin|frontend|mobile`).
 *
 * Run with (from the e2e/ directory):
 *   npm install
 *   npx playwright test
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  timeout: 30_000,
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "admin",
      testDir: "./tests/admin",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3001",
      },
    },
    {
      name: "frontend",
      testDir: "./tests/frontend",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3002",
      },
    },
    {
      name: "mobile",
      testDir: "./tests/mobile",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:8081",
      },
    },
  ],
});
