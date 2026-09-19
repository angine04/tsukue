import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

/**
 * A value from the `.dev.vars` local development already uses.
 *
 * Read here rather than in a test so the authenticated suite can skip with a
 * reason when there is no token, instead of failing for a reason that looks
 * like a broken endpoint.
 */
function devVar(name: string): string | undefined {
  try {
    const path = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../.dev.vars",
    );
    const line = readFileSync(path, "utf8")
      .split("\n")
      .find((entry) => entry.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * End-to-end tests (AGENTS 20.2).
 *
 * They run against the real deployment shape — the built site served by
 * `wrangler pages dev`, so the Pages Functions and a local D1 are in the
 * request path. A dev server would exercise neither.
 *
 * The API needs the same `.dev.vars` local development uses (Turnstile's
 * documented test pair, a hash salt, an admin token); without it the comment
 * and admin suites cannot pass, and the server refuses submissions closed
 * rather than open.
 */
const PORT = Number(process.env.E2E_PORT ?? 8788);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // The build and the local D1 are shared state; running suites in parallel
  // would have them write comments into each other's queues.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  // Readable in a spec as `test.info().config.metadata.adminToken`, for the one
  // suite that needs to prove the protected path works, not only that it refuses.
  metadata: { adminToken: devVar("ADMIN_TOKEN") },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Built first, because these tests are about what ships: the article
    // markup, the desk island and the bundled Functions.
    command: `pnpm --filter web build && npx wrangler pages dev apps/web/dist --port ${PORT}`,
    cwd: "../..",
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
