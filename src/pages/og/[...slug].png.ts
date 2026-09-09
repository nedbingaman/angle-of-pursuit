import type { APIRoute, GetStaticPaths } from 'astro';
import sharp from 'sharp';
import { getCollection } from 'astro:content';
import { slugOf } from '../../lib/posts';
import { SITE_TITLE } from '../../consts';

/**
 * Build-time 1200×630 share images. One per post plus a `site` default.
 * Rendered as an SVG and rasterised with sharp — no headless browser, no wasm.
 * BaseLayout points og:image / twitter:image here.
 */

const WIDTH = 1200;
const HEIGHT = 630;

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getCollection('posts');
  const pages = await getCollection('pages');
  return [
    { params: { slug: 'site' }, props: { title: SITE_TITLE, kicker: '' } },
    ...posts.map((p) => ({
      params: { slug: slugOf(p) },
      props: { title: p.data.title, kicker: SITE_TITLE },
    })),
    ...pages.map((p) => ({
      params: { slug: (p.data.slug ?? p.id).toLowerCase() },
      props: { title: p.data.title, kicker: SITE_TITLE },
    })),
  ];
};

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&#39;' : '&quot;',
  );
}

/** Greedy wrap by approximate character budget; caps lines, ellipsises overflow. */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && next.length > maxChars) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]}…`;
    return kept;
  }
  return lines;
}

export const GET: APIRoute = async ({ props }) => {
  const { title, kicker } = props as { title: string; kicker: string };

  const fontSize = title.length > 48 ? 64 : 76;
  const lineHeight = Math.round(fontSize * 1.18);
  const lines = wrap(title, title.length > 48 ? 26 : 22, 4);
  const blockHeight = lines.length * lineHeight;
  const startY = Math.round((HEIGHT - blockHeight) / 2) + fontSize;

  const titleTspans = lines
    .map(
      (l, i) =>
        `<tspan x="90" y="${startY + i * lineHeight}">${escapeXml(l)}</tspan>`,
    )
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#16181a"/>
  <rect x="0" y="0" width="14" height="${HEIGHT}" fill="#93b8a9"/>
  ${
    kicker
      ? `<text x="90" y="96" font-family="ui-sans-serif, 'Helvetica Neue', Arial, sans-serif" font-size="26" letter-spacing="3" fill="#9aa09d">${escapeXml(
          kicker.toUpperCase(),
        )}</text>`
      : ''
  }
  <text font-family="ui-serif, Georgia, 'Times New Roman', serif" font-weight="600" font-size="${fontSize}" fill="#e7e5df">${titleTspans}</text>
  <text x="90" y="${HEIGHT - 64}" font-family="ui-sans-serif, 'Helvetica Neue', Arial, sans-serif" font-size="24" fill="#9aa09d">angleofpursuit.com</text>
</svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
