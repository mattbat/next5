import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Run `npm run icons` after changing public/favicon.svg to regenerate the PNG icons.
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#0b0f17' } },
    maskable: { ...minimal2023Preset.maskable, padding: 0.1, resizeOptions: { background: '#0b0f17' } },
  },
  images: ['public/favicon.svg'],
});
