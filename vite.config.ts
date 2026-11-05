/// <reference types="vitest/config" />
import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app from /next5/ (see REQUIREMENTS.md T4).
const base = '/next5/';

/** The short commit hash being built, or "unknown" outside a git checkout. */
function commit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/** Unit tests that need no DOM (see `test.projects`). */
const LOGIC_TESTS = ['src/engine/**/*.test.ts', 'src/domain/**/*.test.ts'];

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    // Shown on the diagnostics page so you can confirm a phone has the latest build.
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
    // The commit it was built from, also on the diagnostics page.
    __COMMIT__: JSON.stringify(commit()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'next5 — Lineups & Subs',
        short_name: 'next5',
        description: 'Plan fair basketball rotations and run substitutions on game day.',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b0f17',
        theme_color: '#0b0f17',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
  test: {
    setupFiles: ['src/test/setup.ts'],
    // Screen walkthroughs run alongside the property tests and can exceed the
    // 5s default on busy machines.
    testTimeout: 20_000,
    // The engine and game logic are pure (no DOM), so they skip the cost of
    // starting a browser environment for each file.
    projects: [
      {
        extends: true,
        test: { name: 'logic', environment: 'node', include: [...LOGIC_TESTS, 'scripts/**/*.test.mjs'] },
      },
      {
        extends: true,
        test: { name: 'dom', environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'], exclude: LOGIC_TESTS },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/testUtils.ts', 'src/test/**', 'src/main.tsx', 'src/vite-env.d.ts'],
      thresholds: {
        lines: 80,
        'src/engine/**': { lines: 95 },
      },
    },
  },
});
