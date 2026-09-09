# Angle of Pursuit

A personal blog. Static [Astro](https://astro.build) site, content in
markdown, fronted by a small Cloudflare Worker (comments + moderation + draft
previews). Deployed to Cloudflare Workers.

## Running it

```sh
npm install
npm run dev        # http://localhost:4321 — site only, no Worker
npm run build      # static output in ./dist
npm run check      # astro type-check
npm run check:worker
npm run cf:dev     # build + run the whole stack (Worker + D1) on :8787
```

Requires Node 22.12 or newer. `npm run cf:dev` needs a local D1 first:
`npm run cf:migrate:local`, and a `.dev.vars` (see `.env.example`).

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

Dates are calendar days with no time component and are formatted in UTC, so
the printed date does not depend on the timezone of the machine that built the
site.

### Previewing drafts

A `draft: true` post is built for production but kept out of every listing,
feed, sitemap, and search index, and marked `noindex`. The Worker returns 404
for its URL unless the request carries the preview token:

```
https://angleofpursuit.com/posts/<slug>/?preview=<PREVIEW_TOKEN>
```

That drops a one-hour cookie so links within the draft keep working. Drafts
also render unconditionally under `npm run dev`.

## Navigation, tags, archive, search

`BaseLayout` carries a nav bar: Home · Archive · Tags · Search · About.

- `/archive/` — every post, grouped by year.
- `/tags/` — every tag with a post count; `/tags/<tag>/` lists that tag.
- `/search/` — [Pagefind](https://pagefind.app) full-text search over post
  bodies. The index is built into `dist/pagefind/` and only loads when the
  page is opened. Post `<article>`s are marked `data-pagefind-body`; the nav
  and footer are `data-pagefind-ignore`.

## Share images

`src/pages/og/[...slug].png.ts` renders a 1200×630 PNG per post (plus a
`site` default) at build time — an SVG rasterised with sharp, no browser.
`BaseLayout` points `og:image` / `twitter:image` at `/og/<slug>.png` and sets
`twitter:card` to `summary_large_image`.

## Structured data

`BaseLayout` accepts a `jsonLd` prop and emits it as
`<script type="application/ld+json">`. The homepage passes a `WebSite` object;
post pages pass `BlogPosting` (headline, `datePublished`, author, image).

## Comments

The site's own — no third-party service, no reader login. The list and form
render in `src/components/Comments.astro`; the browser reads published
comments from `/api/comments` and posts new ones there. That endpoint is the
Cloudflare Worker in `worker/index.ts`, storing comments in a D1 database.

**Comments publish immediately.** Set the Worker var
`COMMENTS_REQUIRE_APPROVAL=true` to hold them at `/moderate` for approval
instead. Either way, `/moderate` can delete anything.

Spam defence: a [Turnstile](https://developers.cloudflare.com/turnstile/)
check, an off-screen honeypot field, and a per-IP rate limit (5 / 10 min;
only a salted hash of the IP is stored).

Setup:

1. **D1 database** — `npx wrangler d1 create angle-of-pursuit-comments`, put
   the printed `database_id` in `wrangler.jsonc`, then `npm run cf:migrate`
   (add `:local` for the dev copy).
2. **Turnstile** — dashboard → Turnstile → add a widget for
   `angleofpursuit.com`. Put the **site key** in `.env` as
   `PUBLIC_TURNSTILE_SITEKEY` and as a Worker build variable; set the
   **secret key** as the `TURNSTILE_SECRET` Worker secret.
3. **Worker secrets** — `wrangler secret put` each of `TURNSTILE_SECRET`,
   `MODERATION_USER`, `MODERATION_PASS`, `IP_SALT`, `PREVIEW_TOKEN`.
4. **E-mail on new comments (optional)** — enable Email Routing on the zone
   and verify a destination address, then set the Worker vars `NOTIFY_TO`
   (that address) and `NOTIFY_FROM` (anything `@angleofpursuit.com`). The
   `SEND_EMAIL` binding is already declared in `wrangler.jsonc`; `notify()`
   no-ops until all three are present.

### Moderating

Visit `/moderate` and sign in with `MODERATION_USER` / `MODERATION_PASS`
(HTTP Basic auth). It shows pending comments (if approval is on) and the most
recent published ones, with approve / delete. `noindex`, served only by the
Worker.

## Analytics

Optional and cookieless. Dashboard → Analytics → Web Analytics → add a site →
copy the token into `.env` and the Worker build vars as
`PUBLIC_CF_BEACON_TOKEN`. Blank ⇒ no beacon script.

## Deploying

Hosted on [Cloudflare Workers](https://developers.cloudflare.com/workers/).
`worker/index.ts` runs before the cache for every request
(`assets.run_worker_first`): it handles `/api/comments`, `/moderate`, and
draft gating, and serves everything else from `./dist` via the `ASSETS`
binding. Built from the `main` branch of the GitHub repo; config in
`wrangler.jsonc`.

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Assets directory | `./dist` (set in `wrangler.jsonc`) |
| Node version | `22.12.0` (pinned in `.nvmrc`) |
| Bindings | `DB` (D1), `ASSETS` (static build), `SEND_EMAIL` |

Every push to `main` triggers a production deploy; pushes to other branches
get a preview URL. Set `PUBLIC_TURNSTILE_SITEKEY` and `PUBLIC_CF_BEACON_TOKEN`
as Worker build variables, matching `.env`; set the Worker *secrets*
separately (see Comments). `.env.example` lists every variable and where it
goes.

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
  consts.ts              site title, URL, author — nothing else hardcodes these
  content.config.ts      post frontmatter schema
  content/posts/         the posts
  lib/posts.ts           sorting, draft filtering, dates, slugs, related-posts
  lib/remark-reading-time.mjs   injects minutesRead into each post
  layouts/BaseLayout     head, meta, JSON-LD, share image, nav, analytics
  components/            Intro (home + about), TagList, Comments
  pages/                 index, about, archive, search, 404,
                         posts/[...slug], tags/index, tags/[tag],
                         og/[...slug].png, drafts.json
  styles/fonts.css       @font-face — latin subsets from public/fonts/
  styles/global.css      the whole design system
public/                  favicon, robots.txt, _headers, fonts/
  admin/                 Sveltia CMS — the /admin browser editor + its config
  uploads/               images added through the editor
worker/index.ts          Cloudflare Worker: comments API, /moderate,
                         draft gating; everything else from ./dist
migrations/               D1 schema for comments
```
