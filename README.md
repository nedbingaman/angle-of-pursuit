# Angle of Pursuit

A personal blog. Static site built with [Astro](https://astro.build), content
in markdown, deployed to Cloudflare Workers (static assets).

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
excerpt: One line shown on the front page. Optional.
tags: [optional, free-form]
draft: false
---

Body text in markdown.
```

Frontmatter fields, all validated at build time by `src/content.config.ts`:

| Field | Required | What it does |
| --- | --- | --- |
| `title` | yes | Post heading and link text |
| `date` | yes | Sorts the post list, newest first |
| `excerpt` | no | Preview line on the front page |
| `tags` | no | Free-form list; each tag gets a page at `/tags/<tag>/` |
| `slug` | no | Pins the URL so the file can be renamed safely |
| `editedNote` | no | Prints an "Edited: …" line at the foot of the post |
| `draft` | no | `true` hides it from the built site |

Drafts still render while `npm run dev` is running, so a post in progress can
be previewed at its real URL. They are never built for production.

Dates are calendar days with no time component and are formatted in UTC, so
the printed date does not depend on the timezone of the machine that built the
site.

## Comments

Comments use [Cusdis](https://cusdis.com) — no reader login, just a name and
an optional email. New comments are held for approval in the Cusdis dashboard.
Nothing renders until it is configured:

1. Sign in at cusdis.com and create a project for this site.
2. Copy the project's App ID (a UUID).
3. Copy `.env.example` to `.env` and set `PUBLIC_CUSDIS_APP_ID`.
4. Set the same variable in the Cloudflare Worker's build environment.

The App ID is a public value that ships in the built HTML, not a secret. Set
`PUBLIC_CUSDIS_HOST` only if self-hosting Cusdis.

## Deploying

Hosted on [Cloudflare Workers](https://developers.cloudflare.com/workers/static-assets/)
as an assets-only Worker (no server code), built from the `main` branch of the
GitHub repo. Config is in `wrangler.jsonc`.

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Assets directory | `./dist` (set in `wrangler.jsonc`) |
| Node version | `22.12.0` (pinned in `.nvmrc`) |

Every push to `main` triggers a production deploy; pushes to other branches
get a preview URL. Set `PUBLIC_CUSDIS_APP_ID` (see Comments) in the Worker's
build-environment settings, matching `.env`.

`npx wrangler deploy` also works from a local checkout once `npm run build`
has produced `dist/`. Security and cache headers are served from
`public/_headers`; unmatched routes render `dist/404.html`
(`not_found_handling` in `wrangler.jsonc`).

## Before deploying

- `SITE_URL` in `src/consts.ts` and the `Sitemap:` line in `public/robots.txt`
  must point at the real domain. Canonical URLs, Open Graph tags, and the
  sitemap all derive from `SITE_URL`. Both are set to
  `https://angleofpursuit.com`.
- Replace `public/favicon.svg` and `public/favicon.ico` with the real mark.

## Where things are

```
src/
  consts.ts              site title and URL — nothing else hardcodes these
  content.config.ts      post frontmatter schema
  content/posts/         the posts
  lib/posts.ts           sorting, draft filtering, date formatting, slugs
  layouts/BaseLayout     head, meta tags, masthead, footer
  components/            Intro (shared by home + about), TagList, Comments
  pages/                 index, about, 404, posts/[...slug], tags/[tag]
  styles/global.css      the whole design system
public/                  favicon, robots.txt
```
