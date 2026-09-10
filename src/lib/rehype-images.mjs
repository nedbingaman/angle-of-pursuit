import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

/**
 * For every <img> produced from markdown: add loading="lazy" +
 * decoding="async", and set width/height from the actual file so the
 * browser reserves space (no layout shift). Dependency-free tree walk;
 * failures (missing file, non-raster) are ignored.
 */
export function rehypeImages() {
  const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));

  return async (tree) => {
    const imgs = [];
    const walk = (node) => {
      if (node.type === 'element' && node.tagName === 'img') imgs.push(node);
      if (node.children) node.children.forEach(walk);
    };
    walk(tree);

    await Promise.all(
      imgs.map(async (node) => {
        const p = node.properties ?? (node.properties = {});
        p.loading ??= 'lazy';
        p.decoding ??= 'async';

        const src = typeof p.src === 'string' ? p.src : '';
        if (!src.startsWith('/') || src.startsWith('//') || p.width || p.height) return;
        try {
          const file = publicDir + decodeURIComponent(src).replace(/^\/+/, '');
          const { width, height } = await sharp(file).metadata();
          if (width && height) {
            p.width = width;
            p.height = height;
          }
        } catch {
          /* not a local raster file — leave it */
        }
      }),
    );
  };
}
