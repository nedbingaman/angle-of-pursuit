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

### In the browser

Go to [`/admin`](https://angleofpursuit.com/admin) — the [Sveltia CMS](https://sveltiacms.app)
editor. First visit per browser: click **Sign In with Token**, follow the link
to GitHub (the right scopes are pre-selected), create a fine-grained token
scoped to this repo with **Contents: Read and write**, and paste it back. The
token is stored only in that browser.

The editor writes markdown to `src/content/posts/` and pushes to `main`, which
triggers a deploy. **Save as draft** keeps a post off the live site (`draft:
true`); **Publish** puts it live. Image uploads go to `public/uploads/` and are
referenced as `/uploads/<file>`. Config: `public/admin/config.yml`.

### By hand

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

Comments are the site's own — no third-party service, no reader login. The
list and form render in `src/components/Comments.astro`; the browser reads
approved comments from `/api/comments` and posts new ones there. That endpoint
is the Cloudflare Worker in `worker/index.ts`, storing comments in a D1
database. New comments are held until approved.

Spam defence: a [Turnstile](https://developers.cloudflare.com/turnstile/)
check, an off-screen honeypot field, and a per-IP rate limit (5 / 10 min;
only a salted hash of the IP is stored).

Setup:

1. **D1 database** — `npx wrangler d1 create angle-of-pursuit-comments`, put
   the printed `database_id` in `wrangler.jsonc`, then apply the schema:
   `npm run cf:migrate` (add `:local` for the dev copy).
2. **Turnstile** — dashboard → Turnstile → add a widget for
   `angleofpursuit.com`. Put the **site key** in `.env` as
   `PUBLIC_TURNSTILE_SITEKEY` and as a Worker build variable; set the
   **secret key** as the `TURNSTILE_SECRET` Worker secret.
3. **Worker secrets** — `wrangler secret put` each of `TURNSTILE_SECRET`,
   `MODERATION_USER`, `MODERATION_PASS`, `IP_SALT` (or add them in the
   dashboard as encrypted variables).

### Moderating

Visit `/moderate` and sign in with `MODERATION_USER` / `MODERATION_PASS`
(HTTP Basic auth). Approve or delete pending comments; delete approved ones.
The page is `noindex` and served only by the Worker.

## Deploying

Hosted on [Cloudflare Workers](https://developers.cloudflare.com/workers/).
`worker/index.ts` runs in front of the static build: it handles
`/api/comments` and `/moderate` and serves everything else from `./dist` via
the `ASSETS` binding. Built from the `main` branch of the GitHub repo; config
in `wrangler.jsonc`.

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Assets directory | `./dist` (set in `wrangler.jsonc`) |
| Node version | `22.12.0` (pinned in `.nvmrc`) |
| Bindings | `DB` (D1), `ASSETS` (static build) |

Every push to `main` triggers a production deploy; pushes to other branches
get a preview URL. Set `PUBLIC_TURNSTILE_SITEKEY` (see Comments) as a Worker
build variable, matching `.env`; set the Worker *secrets* separately.

`npx wrangler deploy` also works from a local checkout once `npm run build`
has produced `dist/`. `npm run cf:dev` builds and runs the whole thing
(Worker + assets + local D1) at `localhost:8787`. Security and cache headers
are served from `public/_headers`; unmatched routes render `dist/404.html`
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
public/                  favicon, robots.txt, _headers
  admin/                 Sveltia CMS — the /admin browser editor + its config
  uploads/               images added through the editor
worker/index.ts          Cloudflare Worker: /api/comments + /moderate, else ./dist
migrations/               D1 schema for comments
```
