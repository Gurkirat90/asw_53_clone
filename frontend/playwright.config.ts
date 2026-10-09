import { defineConfig, devices } from "@playwright/test";

const BACKEND_PORT = 8001;
const FRONTEND_PORT = 3001;

/**
 * E2E runs against an isolated stack: tests/e2e/start-backend.sh starts FastAPI on :8001 with a
 * fresh temporary SQLite DB, and the frontend is a production build in .next-e2e (so it never
 * touches .next) served on :3001 with its /api rewrite pointed at :8001. Existing servers are
 * never reused, so every run starts from a clean database.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${FRONTEND_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "bash tests/e2e/start-backend.sh",
      url: `http://127.0.0.1:${BACKEND_PORT}/healthz`,
      reuseExistingServer: false,
      // SIGTERM (not the default SIGKILL) lets the script delete its temporary database.
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      timeout: 60_000,
      stdout: "pipe",
      env: { E2E_BACKEND_PORT: String(BACKEND_PORT), E2E_FRONTEND_PORT: String(FRONTEND_PORT) },
    },
    {
      command: `npx next build && npx next start -p ${FRONTEND_PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${FRONTEND_PORT}/login`,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      timeout: 240_000,
      stdout: "pipe",
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        API_INTERNAL_BASE_URL: `http://127.0.0.1:${BACKEND_PORT}`,
        NEXT_TELEMETRY_DISABLED: "1",
        // The E2E demo password differs from the local one; hide the credentials box in E2E.
        NEXT_PUBLIC_DEMO_EMAIL: "",
        NEXT_PUBLIC_DEMO_PASSWORD: "",
      },
    },
  ],
});
