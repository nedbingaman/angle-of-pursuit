# Angle of Pursuit

A personal blog. Static site built with [Astro](https://astro.build), content
in markdown, deployed to free static hosting. See `PROJECT_SPEC.md` for the
decisions behind all of this.

## Running it

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in ./dist
npm run preview  # serve the built site locally
npm run check    # type-check .astro and .ts files
```

Requires Node 22.12 or newer.

## Writing a post

Add a markdown file to `src/content/posts/`. The filename becomes the URL.

```markdown
---
title: The title of the post
date: 2026-09-08
excerpt: One line shown on the front page and in the RSS feed. Optional.
tags: [optional, free-form]
draft: false
---

Body text in markdown.
```

Frontmatter fields, all validated at build time by `src/content.config.ts`:

| Field | Required | What it does |
| --- | --- | --- |
| `title` | yes | Post heading and link text |
| `date` | yes | Sorts the feed, newest first |
| `excerpt` | no | Preview line on the front page and in RSS |
| `tags` | no | Free-form list; each tag gets a page at `/tags/<tag>/` |
| `slug` | no | Pins the URL so the file can be renamed safely |
| `editedNote` | no | Prints an "Edited: …" line at the foot of the post |
| `draft` | no | `true` hides it from the built site and the feed |

Drafts still render while `npm run dev` is running, so a post in progress can
be previewed at its real URL. They are never built for production and never
appear in the feed.

Dates are calendar days with no time component and are formatted in UTC, so
the printed date does not depend on the timezone of the machine that built the
site.

## Comments

Comments use [Giscus](https://giscus.app), backed by GitHub Discussions.
Nothing renders until it is configured:

1. Enable Discussions on the GitHub repo backing this site.
2. Run giscus.app against that repo to get the four config values.
3. Copy `.env.example` to `.env` and fill them in.
4. Set the same four variables in the host's build environment.

These are public values that ship in the built HTML, not secrets.

## Before deploying

- Set `SITE_URL` in `src/consts.ts` to the real domain, and update the
  `Sitemap:` line in `public/robots.txt` to match. Canonical URLs, Open Graph
  tags, the sitemap, and the RSS feed all derive from it.
- Replace `public/favicon.svg` and `public/favicon.ico`.

## Where things are

```
src/
  consts.ts              site title, tagline, URL — nothing else hardcodes these
  content.config.ts      post frontmatter schema
  content/posts/         the posts
  lib/posts.ts           sorting, draft filtering, date formatting, slugs
  layouts/BaseLayout     head, meta tags, masthead, footer
  components/            Intro (shared by home + about), TagList, Comments
  pages/                 index, about, 404, posts/[...slug], tags/[tag], rss.xml
  styles/global.css      the whole design system
public/                  favicon, robots.txt
```
