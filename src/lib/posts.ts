import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

/**
 * Drafts are hidden in production builds but visible while running `astro dev`,
 * so a post in progress can still be previewed.
 */
export const isVisible = (post: Post) => !post.data.draft || import.meta.env.DEV;

/** URL slug for a post: the optional frontmatter override, else the filename. */
export const slugOf = (post: Post) => post.data.slug ?? post.id;

/** Site-root-relative path for a post. */
export const pathOf = (post: Post) => `/posts/${slugOf(post)}/`;

/** All visible posts, newest first. */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', isVisible);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
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
