import type { APIRoute } from 'astro';
import { getAllPosts, slugOf } from '../lib/posts';

/**
 * Lists the slugs of posts currently in draft. The Worker reads this (via the
 * ASSETS binding) to know which /posts/<slug>/ pages to gate behind
 * ?preview=<PREVIEW_TOKEN>, and returns 404 for /drafts.json to the public.
 */
export const GET: APIRoute = async () => {
  const drafts = (await getAllPosts())
    .filter((p) => p.data.draft)
    .map((p) => slugOf(p));
  return new Response(JSON.stringify({ drafts }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
