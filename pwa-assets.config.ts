import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Run `npm run icons` after changing public/favicon.svg to regenerate the PNG icons.
// The icon is full-bleed and keeps its 5 and chevron inside the maskable safe zone, so no padding.
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#0b1636' } },
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: '#0b1636' } },
  },
  images: ['public/favicon.svg'],
});
