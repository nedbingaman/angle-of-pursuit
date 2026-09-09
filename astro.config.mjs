// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import { SITE_URL } from './src/consts.js';

// https://astro.build/config
export default defineConfig({
  // Absolute base URL. Required for RSS, sitemap, and canonical/OG tags.
  site: SITE_URL,
  integrations: [sitemap()],
  markdown: {
    shikiConfig: {
      // Both themes are emitted as CSS custom properties; global.css picks
      // one based on prefers-color-scheme.
      themes: { light: 'vitesse-light', dark: 'vitesse-dark' },
      defaultColor: false,
      wrap: false,
    },
  },
});
