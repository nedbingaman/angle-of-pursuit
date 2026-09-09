---
title: How this works
date: 2026-09-08
excerpt: A short note on the post format, kept here for reference. Delete it once there's a real first post.
tags:
  - meta
slug: ''
editedNote: ''
draft: false
---

Every post is a markdown file in `src/content/posts/`. The frontmatter at the
top of the file controls everything the site needs to know about it:

- `title` — the post heading, and the link text in the list on the front page
- `date` — sorts the list, newest first, and prints under the title
- `excerpt` — optional; a line of preview text on the front page and in the feed
- `tags` — optional; a free-form list, each one gets its own page at `/tags/`
- `slug` — optional; pins the URL so the file can be renamed without breaking links
- `editedNote` — optional; add it after a substantive revision and an "Edited:"
  line appears at the bottom of the post
- `draft` — `true` keeps the post out of the built site and the feed, but it
  still shows up while running `npm run dev` so it can be read while in progress

Body text is ordinary markdown. Headings, lists, tables, images, and links all
have styles. So do block quotes:

> Which look like this — set in the serif, with a rule down the left.

And code, which scrolls sideways rather than stretching the column:

```js
const posts = await getCollection('posts');
```

Delete this file, or set `draft` to `false` and rewrite it, whenever the first
real post is ready.
