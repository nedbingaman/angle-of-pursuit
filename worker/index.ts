/**
 * Angle of Pursuit — request handler in front of the static site.
 *
 * Anything not handled here falls through to the static build in ./dist via
 * the ASSETS binding, so the blog stays a plain static site.
 *
 *   GET  /api/comments?post=<slug>   visible comments for a post, as JSON
 *   POST /api/comments               submit a comment
 *   GET  /moderate                   Basic-auth moderation page
 *   POST /moderate                   approve / delete (from that page)
 *   GET  /posts/<draft>/             gated behind ?preview=<PREVIEW_TOKEN>
 *   GET  /drafts.json                404 to the public (read internally)
 *
 * Comments live in the D1 database bound as DB (schema: migrations/).
 */

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  /** Turnstile secret key. */
  TURNSTILE_SECRET: string;
  /** Basic-auth credentials for /moderate. */
  MODERATION_USER: string;
  MODERATION_PASS: string;
  /** Salt so stored IP hashes can't be reversed to addresses. */
  IP_SALT: string;
  /** "true" holds new comments for approval; anything else auto-publishes. */
  COMMENTS_REQUIRE_APPROVAL?: string;
  /** Shared secret that unlocks draft post URLs. Unset ⇒ drafts always 404. */
  PREVIEW_TOKEN?: string;
  /** Optional e-mail notification on new comments (needs the SEND_EMAIL binding). */
  SEND_EMAIL?: { send(msg: unknown): Promise<void> };
  NOTIFY_TO?: string;
  NOTIFY_FROM?: string;
}

interface CommentRow {
  id: number;
  post_slug: string;
  author: string;
  body: string;
  created_at: string;
  approved: number;
  ip_hash: string | null;
  user_agent: string | null;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_AUTHOR = 80;
const MAX_BODY = 4000;
const RATE_WINDOW_MINUTES = 10;
const RATE_MAX_IN_WINDOW = 5;

let draftCache: { at: number; slugs: Set<string> } | null = null;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '').toLowerCase() || '/';

    if (path === '/drafts.json') {
      return new Response('Not found', { status: 404 });
    }

    if (path === '/api/comments') {
      if (request.method === 'GET') return getComments(url, env);
      if (request.method === 'POST') return postComment(request, env, ctx);
      return json({ error: 'method not allowed' }, 405, { Allow: 'GET, POST' });
    }

    if (path === '/moderate') {
      return moderate(request, env);
    }

    // Gate draft post pages (and their share images) behind the preview token.
    const draftMatch =
      path.match(/^\/posts\/([a-z0-9-]+)$/) || path.match(/^\/og\/([a-z0-9-]+)\.png$/);
    if (draftMatch) {
      const slug = draftMatch[1];
      const drafts = await getDraftSlugs(env, url);
      if (drafts.has(slug) && !hasPreviewAccess(request, url, env)) {
        return notFound(env, url);
      }
      if (drafts.has(slug) && url.searchParams.get('preview')) {
        // Valid token in the query — drop a short-lived cookie so in-page
        // links keep working without the query string.
        const res = await env.ASSETS.fetch(request);
        const copy = new Response(res.body, res);
        copy.headers.append(
          'Set-Cookie',
          `preview=${env.PREVIEW_TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`,
        );
        return copy;
      }
    }

    return env.ASSETS.fetch(request);
  },
};

/* -------------------------------------------------------------------------- */
/*  Comments API                                                             */
/* -------------------------------------------------------------------------- */

async function getComments(url: URL, env: Env): Promise<Response> {
  const post = url.searchParams.get('post') ?? '';
  if (!SLUG_RE.test(post)) return json({ error: 'invalid post' }, 400);

  const { results } = await env.DB.prepare(
    `SELECT id, author, body, created_at
       FROM comments
      WHERE post_slug = ?1 AND approved = 1
      ORDER BY created_at ASC, id ASC`,
  )
    .bind(post)
    .all<Pick<CommentRow, 'id' | 'author' | 'body' | 'created_at'>>();

  return json({ comments: results }, 200, { 'Cache-Control': 'no-store' });
}

async function postComment(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  let data: Record<string, unknown>;
  try {
    data = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }

  const post = String(data.post ?? '');
  const author = String(data.author ?? '').trim();
  const body = String(data.body ?? '').trim();
  const honeypot = String(data.website ?? '');
  const token = String(data.turnstileToken ?? '');

  // A filled honeypot is a bot. Pretend it worked; store nothing.
  if (honeypot) return json({ ok: true, approved: false }, 202);

  if (!SLUG_RE.test(post)) return json({ error: 'invalid post' }, 400);
  if (author.length < 1 || author.length > MAX_AUTHOR) {
    return json({ error: 'Name must be 1–80 characters.' }, 422);
  }
  if (body.length < 1 || body.length > MAX_BODY) {
    return json({ error: 'Comment must be 1–4000 characters.' }, 422);
  }

  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  if (!(await verifyTurnstile(token, ip, env.TURNSTILE_SECRET))) {
    return json({ error: 'Verification failed — reload and try again.' }, 403);
  }

  const ipHash = await sha256Hex(ip + env.IP_SALT);
  const since = sqlTimestamp(Date.now() - RATE_WINDOW_MINUTES * 60_000);
  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM comments WHERE ip_hash = ?1 AND created_at >= ?2`,
  )
    .bind(ipHash, since)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= RATE_MAX_IN_WINDOW) {
    return json({ error: 'You’re posting too fast. Try again in a few minutes.' }, 429);
  }

  const approved = env.COMMENTS_REQUIRE_APPROVAL === 'true' ? 0 : 1;
  const ua = (request.headers.get('User-Agent') ?? '').slice(0, 300);
  await env.DB.prepare(
    `INSERT INTO comments (post_slug, author, body, approved, ip_hash, user_agent)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(post, author, body, approved, ipHash, ua)
    .run();

  ctx.waitUntil(notify(env, { post, author, body, approved: approved === 1 }));

  return json({ ok: true, approved: approved === 1 }, approved === 1 ? 201 : 202);
}

/* -------------------------------------------------------------------------- */
/*  Moderation                                                               */
/* -------------------------------------------------------------------------- */

async function moderate(request: Request, env: Env): Promise<Response> {
  if (!checkBasicAuth(request, env)) {
    return new Response('Authentication required.', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="moderate", charset="UTF-8"',
        'Cache-Control': 'no-store',
      },
    });
  }

  if (request.method === 'POST') {
    const form = await request.formData();
    const id = Number(form.get('id'));
    const action = String(form.get('action') ?? '');
    if (Number.isInteger(id) && id > 0) {
      if (action === 'approve') {
        await env.DB.prepare(`UPDATE comments SET approved = 1 WHERE id = ?1`).bind(id).run();
      } else if (action === 'delete') {
        await env.DB.prepare(`DELETE FROM comments WHERE id = ?1`).bind(id).run();
      }
    }
    return new Response(null, { status: 303, headers: { Location: '/moderate' } });
  }

  const pending = (
    await env.DB.prepare(
      `SELECT * FROM comments WHERE approved = 0 ORDER BY created_at DESC, id DESC`,
    ).all<CommentRow>()
  ).results;
  const recent = (
    await env.DB.prepare(
      `SELECT * FROM comments WHERE approved = 1 ORDER BY created_at DESC, id DESC LIMIT 100`,
    ).all<CommentRow>()
  ).results;

  const mode = env.COMMENTS_REQUIRE_APPROVAL === 'true' ? 'review' : 'auto-publish';
  return new Response(moderationPage(pending, recent, mode), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex',
      'Cache-Control': 'no-store',
    },
  });
}

function checkBasicAuth(request: Request, env: Env): boolean {
  const header = request.headers.get('Authorization') ?? '';
  const expected = 'Basic ' + btoa(`${env.MODERATION_USER}:${env.MODERATION_PASS}`);
  return timingSafeEqual(header, expected);
}

function moderationPage(pending: CommentRow[], recent: CommentRow[], mode: string): string {
  const row = (c: CommentRow, actions: string) => `
    <li>
      <div class="meta"><strong>${esc(c.author)}</strong> · ${esc(c.post_slug)} · ${esc(c.created_at)} UTC · #${c.id}</div>
      <div class="body">${esc(c.body)}</div>
      <form method="post">
        <input type="hidden" name="id" value="${c.id}" />
        ${actions}
      </form>
    </li>`;

  const approveBtn = `<button name="action" value="approve">Approve</button>`;
  const deleteBtn = `<button name="action" value="delete" class="danger">Delete</button>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Moderate comments</title>
<style>
  body { font: 15px/1.5 -apple-system, BlinkMacSystemFont, sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; background: #fafafa; }
  h1 { font-size: 1.2rem; } h2 { font-size: 1rem; margin-top: 2.5rem; border-bottom: 1px solid #ddd; padding-bottom: .3rem; }
  .mode { color: #666; font-size: .85rem; }
  ul { list-style: none; padding: 0; } li { border: 1px solid #e0e0e0; border-radius: 6px; padding: .8rem 1rem; margin: .6rem 0; background: #fff; }
  .meta { color: #666; font-size: .8rem; } .body { white-space: pre-wrap; margin: .5rem 0; }
  form { display: inline; } button { font: inherit; padding: .3rem .8rem; margin-right: .4rem; cursor: pointer; border: 1px solid #bbb; border-radius: 4px; background: #f0f0f0; }
  button.danger { color: #a11; border-color: #d99; } .empty { color: #999; }
  @media (prefers-color-scheme: dark) { body { background:#151515; color:#e0e0e0 } li{background:#1e1e1e;border-color:#333} button{background:#2a2a2a;border-color:#444;color:#e0e0e0} h2{border-color:#333} }
</style></head><body>
<h1>Moderate comments</h1>
<p class="mode">Mode: <strong>${mode}</strong>${
    mode === 'auto-publish'
      ? ' — comments appear immediately; delete anything unwanted below.'
      : ' — comments wait here until approved.'
  }</p>
<h2>Pending (${pending.length})</h2>
${pending.length ? `<ul>${pending.map((c) => row(c, approveBtn + deleteBtn)).join('')}</ul>` : `<p class="empty">Nothing waiting.</p>`}
<h2>Published — most recent ${recent.length}</h2>
${recent.length ? `<ul>${recent.map((c) => row(c, deleteBtn)).join('')}</ul>` : `<p class="empty">None yet.</p>`}
</body></html>`;
}

/* -------------------------------------------------------------------------- */
/*  Draft preview gating                                                     */
/* -------------------------------------------------------------------------- */

async function getDraftSlugs(env: Env, url: URL): Promise<Set<string>> {
  if (draftCache && Date.now() - draftCache.at < 60_000) return draftCache.slugs;
  try {
    const res = await env.ASSETS.fetch(new Request(new URL('/drafts.json', url.origin)));
    if (!res.ok) return new Set();
    const data = (await res.json()) as { drafts?: string[] };
    const slugs = new Set(data.drafts ?? []);
    draftCache = { at: Date.now(), slugs };
    return slugs;
  } catch {
    return new Set();
  }
}

/** The site's 404 page, but with a real 404 status. */
async function notFound(env: Env, url: URL): Promise<Response> {
  const page = await env.ASSETS.fetch(new Request(new URL('/404.html', url.origin)));
  return new Response(page.body, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function hasPreviewAccess(request: Request, url: URL, env: Env): boolean {
  const token = env.PREVIEW_TOKEN;
  if (!token) return false;
  if (url.searchParams.get('preview') === token) return true;
  const cookie = request.headers.get('Cookie') ?? '';
  return cookie.split(/;\s*/).some((c) => c === `preview=${token}`);
}

/* -------------------------------------------------------------------------- */
/*  Notifications                                                            */
/* -------------------------------------------------------------------------- */

async function notify(
  env: Env,
  c: { post: string; author: string; body: string; approved: boolean },
): Promise<void> {
  if (!env.SEND_EMAIL || !env.NOTIFY_TO || !env.NOTIFY_FROM) return;
  const subject = `New comment on ${c.post}`.replace(/[^\x20-\x7E]/g, '');
  const text =
    `${c.author} commented on "${c.post}"` +
    `${c.approved ? '' : ' (held for review)'}:\n\n${c.body}\n\n` +
    `Moderate: https://angleofpursuit.com/moderate`;
  const raw = [
    `From: ${env.NOTIFY_FROM}`,
    `To: ${env.NOTIFY_TO}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="utf-8"',
    '',
    text,
  ].join('\r\n');
  try {
    const { EmailMessage } = await import('cloudflare:email');
    await env.SEND_EMAIL.send(new EmailMessage(env.NOTIFY_FROM, env.NOTIFY_TO, raw));
  } catch {
    /* best effort — binding missing, address unverified, etc. */
  }
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                  */
/* -------------------------------------------------------------------------- */

async function verifyTurnstile(token: string, ip: string, secret: string): Promise<boolean> {
  if (!token) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const out = (await res.json()) as { success?: boolean };
    return out.success === true;
  } catch {
    return false;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** D1's datetime('now') stores "YYYY-MM-DD HH:MM:SS" in UTC; match that. */
function sqlTimestamp(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}
