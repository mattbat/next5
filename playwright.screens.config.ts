import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;

/**
 * Takes the help screenshots (`npm run screenshots`). Not part of
 * `npm run check`: the images are committed, and retaken when screens change.
 */
export default defineConfig({
  testDir: 'scripts/screens',
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}/next5/`,
    // Safari's engine at iPhone 17 size (≈402×874 pt), at 2× for sharp text.
    ...devices['iPhone 15 Pro'],
    viewport: { width: 402, height: 874 },
    deviceScaleFactor: 2,
  },
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/next5/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
