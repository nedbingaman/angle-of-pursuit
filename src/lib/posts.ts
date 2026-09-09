import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

/**
 * Drafts are hidden in production builds but visible while running `astro dev`,
 * so a post in progress can still be previewed.
 */
export const isVisible = (post: Post) => !post.data.draft || import.meta.env.DEV;

/**
 * URL slug for a post: the optional frontmatter override, else the filename.
 * `||` not `??` — an empty `slug:` (which the /admin editor can write when the
 * override field is left blank) must fall through to the filename, not become
 * an empty path segment.
 */
export const slugOf = (post: Post) => post.data.slug || post.id;

/** Site-root-relative path for a post. */
export const pathOf = (post: Post) => `/posts/${slugOf(post)}/`;

/** All visible posts, newest first. */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', isVisible);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/** Every post including drafts, newest first — for routes that build drafts. */
export async function getAllPosts(): Promise<Post[]> {
  const posts = await getCollection('posts');
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/** Other posts sharing the most tags with `post`, best first. */
export function relatedPosts(post: Post, pool: Post[], limit = 4): Post[] {
  const tags = new Set(post.data.tags);
  if (tags.size === 0) return [];
  return pool
    .filter((p) => slugOf(p) !== slugOf(post))
    .map((p) => ({ p, shared: p.data.tags.filter((t) => tags.has(t)).length }))
    .filter((x) => x.shared > 0)
    .sort((a, b) => b.shared - a.shared || b.p.data.date.valueOf() - a.p.data.date.valueOf())
    .slice(0, limit)
    .map((x) => x.p);
}

/**
 * Dates in frontmatter are bare calendar days (2026-09-08) and parse as UTC
 * midnight. Formatting must be pinned to UTC or the rendered date shifts by a
 * day depending on the timezone of whatever machine ran the build.
 */
const formatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

export const formatDate = (date: Date) => formatter.format(date);

/** YYYY-MM-DD, for the <time datetime> attribute. */
export const machineDate = (date: Date) => date.toISOString().slice(0, 10);

/** Slugified form of a tag, used in /tags/ URLs. */
export const tagSlug = (tag: string) =>
  tag
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
