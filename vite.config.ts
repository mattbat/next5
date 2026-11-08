/// <reference types="vitest/config" />
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { betaInfo, isBetaBuild, readPendingNotes } from './scripts/beta-lib.mjs';

// A preview build of a branch on Cloudflare Pages (REL5), or null for production.
const beta = isBetaBuild(process.env) ? betaInfo(process.env, readPendingNotes()) : null;

// GitHub Pages serves the app from /next5/ (see REQUIREMENTS.md T4). Beta
// previews have a host of their own.
const base = beta ? '/' : '/next5/';
const appName = beta ? 'next5 β' : 'next5';

// Read from package.json, since Cloudflare runs `npx vite build`, not npm.
const version: string = JSON.parse(readFileSync('package.json', 'utf8')).version;

/** The short commit hash being built, or "unknown" outside a git checkout. */
function commit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  if (process.env.CF_PAGES_COMMIT_SHA) return process.env.CF_PAGES_COMMIT_SHA.slice(0, 7);
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Marks a beta build so nobody mistakes it for the real app: its own Home
 * Screen name, and kept out of search engines (REL5).
 */
function betaPage(): Plugin {
  return {
    name: 'next5-beta',
    apply: 'build',
    transformIndexHtml(html) {
      if (!beta) return html;
      return html
        .replace('<title>next5</title>', `<title>${appName}</title>`)
        .replace('content="next5" />', `content="${appName}" />`)
        .replace('<meta charset="UTF-8" />', '<meta charset="UTF-8" />\n    <meta name="robots" content="noindex, nofollow" />');
    },
    generateBundle() {
      if (beta) this.emitFile({ type: 'asset', fileName: 'robots.txt', source: 'User-agent: *\nDisallow: /\n' });
    },
  };
}

/** Unit tests that need no DOM (see `test.projects`). */
const LOGIC_TESTS = ['src/engine/**/*.test.ts', 'src/domain/**/*.test.ts'];

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(version),
    // A beta build's branch and waiting notes, or null (REL5).
    __BETA__: JSON.stringify(beta),
    // Shown on the diagnostics page so you can confirm a phone has the latest build.
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
    // The commit it was built from, also on the diagnostics page.
    __COMMIT__: JSON.stringify(commit()),
  },
  plugins: [
    react(),
    betaPage(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: `${appName} — Lineups & Subs`,
        short_name: appName,
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
