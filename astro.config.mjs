// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';
import { unified } from '@astrojs/markdown-remark';

import { SITE_URL } from './src/consts.js';
import { remarkReadingTime } from './src/lib/remark-reading-time.mjs';

// https://astro.build/config
export default defineConfig({
  // Absolute base URL. Required for the sitemap, canonical/OG tags, and
  // generated share images.
  site: SITE_URL,
  integrations: [sitemap(), pagefind()],
  markdown: {
    // Classic unified pipeline (GFM + smartypants) so the reading-time
    // remark plugin runs; Sätteri is the default otherwise.
    processor: unified({ remarkPlugins: [remarkReadingTime] }),
    shikiConfig: {
      // Both themes are emitted as CSS custom properties; global.css picks
      // one based on prefers-color-scheme.
      themes: { light: 'vitesse-light', dark: 'vitesse-dark' },
      defaultColor: false,
      wrap: false,
    },
  },
});
