import { defineConfig, devices } from '@playwright/test';

// Override with DOCS_PREVIEW_PORT when 4321 is taken (e.g. a dev server is
// already running). The suite serves the built `dist/`, so a reused dev server
// on the default port would 404 build-only artifacts like the sitemap.
const PORT = Number(process.env.DOCS_PREVIEW_PORT ?? 4321);
const URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: URL,
    trace: 'on-first-retry'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Serves the already-built site — run `pnpm build:docs` (repo root) first.
  webServer: {
    command: `pnpm preview --port ${PORT}`,
    url: URL,
    reuseExistingServer: !process.env.CI
  }
});
