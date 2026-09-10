import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Draft post slugs, read straight from the markdown frontmatter. Sync, so it
 * can be used from astro.config.mjs (the sitemap filter) where the content
 * collection API isn't available. The Worker uses drafts.json instead.
 */
export function draftSlugs() {
  const dir = fileURLToPath(new URL('../content/posts/', import.meta.url));
  const out = new Set();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    const fm = readFileSync(dir + file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm || !/^draft:\s*true\s*$/m.test(fm[1])) continue;
    const slugLine = fm[1].match(/^slug:\s*["']?([^"'\n\r]+?)["']?\s*$/m);
    out.add((slugLine?.[1]?.trim() || file.replace(/\.md$/, '')).toLowerCase());
  }
  return out;
}
