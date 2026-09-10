// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';
import { unified } from '@astrojs/markdown-remark';

import { SITE_URL } from './src/consts.js';
import { remarkReadingTime } from './src/lib/remark-reading-time.mjs';
import { rehypeImages } from './src/lib/rehype-images.mjs';
import { draftSlugs } from './src/lib/draft-slugs.mjs';

const drafts = draftSlugs();

// https://astro.build/config
export default defineConfig({
  // Absolute base URL. Required for the sitemap, canonical/OG tags, and
  // generated share images.
  site: SITE_URL,
  integrations: [
    sitemap({
      // Keep noindex pages and unpublished posts out of the sitemap.
      filter: (page) => {
        const path = new URL(page).pathname;
        if (path === '/search/' || path === '/404/') return false;
        const post = path.match(/^\/posts\/([^/]+)\/$/);
        return !(post && drafts.has(decodeURIComponent(post[1]).toLowerCase()));
      },
    }),
    pagefind(),
  ],
  markdown: {
    // Classic unified pipeline (GFM + smartypants) so the custom plugins run;
    // Sätteri is the default otherwise.
    processor: unified({
      remarkPlugins: [remarkReadingTime],
      rehypePlugins: [rehypeImages],
    }),
    shikiConfig: {
      // Both themes are emitted as CSS custom properties; global.css picks
      // one based on prefers-color-scheme.
      themes: { light: 'vitesse-light', dark: 'vitesse-dark' },
      defaultColor: false,
      wrap: false,
    },
  },
});
