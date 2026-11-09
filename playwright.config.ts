import { defineConfig, devices } from '@playwright/test';

// Not Vite's default 4173, which other projects on the same machine often have
// open (strictPort then fails the run). E2E_PORT overrides it.
const PORT = Number(process.env.E2E_PORT ?? 4317);

/**
 * End-to-end tests (REQUIREMENTS.md Q-4) against the production build.
 * Run `npm run build` first; CI does this automatically.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // WebKit on Windows times out intermittently when tests run side by side,
  // so local runs go one at a time. CI (Linux) runs them in parallel.
  workers: process.env.CI ? undefined : 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/next5/`,
    trace: 'retain-on-failure',
    // Start past the first-run intro; e2e/help.spec.ts tests it from a fresh phone.
    storageState: {
      cookies: [],
      origins: [{ origin: `http://localhost:${PORT}`, localStorage: [{ name: 'next5.introSeen', value: '1' }] }],
    },
  },
  projects: [
    {
      // Safari's engine at iPhone 17 size (≈402×874 pt).
      name: 'iphone-webkit',
      testIgnore: /offline\.spec\.ts/,
      use: { ...devices['iPhone 15 Pro'], viewport: { width: 402, height: 874 } },
    },
    {
      // Service-worker (offline) checks run in Chromium, where Playwright can
      // control service workers reliably.
      name: 'offline-chromium',
      testMatch: /offline\.spec\.ts/,
      use: { ...devices['Pixel 7'], viewport: { width: 402, height: 874 } },
    },
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/next5/`,
    reuseExistingServer: !process.env.CI,
  },
});
