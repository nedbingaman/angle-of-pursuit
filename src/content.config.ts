import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
// Imported from zod directly — the `z` re-export from astro:content is deprecated.
import * as z from 'zod';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    // coerce so both `2026-09-08` and `"2026-09-08"` parse.
    date: z.coerce.date(),
    excerpt: z.string().optional(),
    // Optional URL override. Without it the URL is the filename, which means
    // renaming a file breaks its links. Set this to keep a URL stable.
    slug: z.string().optional(),
    // Free-form. Not a fixed category list — whatever you type becomes a tag.
    tags: z.array(z.string()).default([]),
    // Set on a post you've edited substantively after publishing.
    // Pairs with the "edited" note rendered on the post page.
    editedNote: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts };
