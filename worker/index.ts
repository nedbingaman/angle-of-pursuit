/**
 * Angle of Pursuit — request handler in front of the static site.
 *
 * Everything that isn't handled here falls through to the static assets in
 * ./dist via the ASSETS binding, so the blog stays a plain static build.
 *
 *   GET  /api/comments?post=<slug>   approved comments for a post, as JSON
 *   POST /api/comments               submit a comment (held for moderation)
 *   GET  /moderate                   Basic-auth moderation page
 *   POST /moderate                   approve / delete (from that page)
 *
 * Comments live in the D1 database bound as DB (schema: migrations/).
 */

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  /** Turnstile secret key (dashboard → Turnstile → widget). */
  TURNSTILE_SECRET: string;
  /** Basic-auth credentials for /moderate. */
  MODERATION_USER: string;
  MODERATION_PASS: string;
  /** Salt so stored IP hashes can't be reversed to addresses. */
  IP_SALT: string;
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/comments') {
      if (request.method === 'GET') return getComments(url, env);
      if (request.method === 'POST') return postComment(request, env);
      return json({ error: 'method not allowed' }, 405, { Allow: 'GET, POST' });
    }

    if (url.pathname === '/moderate' || url.pathname === '/moderate/') {
      return moderate(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

/* -------------------------------------------------------------------------- */
/*  Public API                                                               */
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

async function postComment(request: Request, env: Env): Promise<Response> {
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
  if (honeypot) return json({ ok: true, pending: true }, 202);

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

  const ua = (request.headers.get('User-Agent') ?? '').slice(0, 300);
  await env.DB.prepare(
    `INSERT INTO comments (post_slug, author, body, ip_hash, user_agent)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(post, author, body, ipHash, ua)
    .run();

  return json({ ok: true, pending: true }, 201);
}

/* -------------------------------------------------------------------------- */
/*  Moderation                                                               */
/* -------------------------------------------------------------------------- */

async function moderate(request: Request, env: Env): Promise<Response> {
  if (!checkBasicAuth(request, env)) {
    return new Response('Authentication required.', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="moderate", charset="UTF-8"' },
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
  const approved = (
    await env.DB.prepare(
      `SELECT * FROM comments WHERE approved = 1 ORDER BY created_at DESC, id DESC LIMIT 100`,
    ).all<CommentRow>()
  ).results;

  return new Response(moderationPage(pending, approved), {
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

function moderationPage(pending: CommentRow[], approved: CommentRow[]): string {
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
  ul { list-style: none; padding: 0; } li { border: 1px solid #e0e0e0; border-radius: 6px; padding: .8rem 1rem; margin: .6rem 0; background: #fff; }
  .meta { color: #666; font-size: .8rem; } .body { white-space: pre-wrap; margin: .5rem 0; }
  form { display: inline; } button { font: inherit; padding: .3rem .8rem; margin-right: .4rem; cursor: pointer; border: 1px solid #bbb; border-radius: 4px; background: #f0f0f0; }
  button.danger { color: #a11; border-color: #d99; } .empty { color: #999; }
  @media (prefers-color-scheme: dark) { body { background:#151515; color:#e0e0e0 } li{background:#1e1e1e;border-color:#333} button{background:#2a2a2a;border-color:#444;color:#e0e0e0} h2{border-color:#333} }
</style></head><body>
<h1>Moderate comments</h1>
<h2>Pending (${pending.length})</h2>
${pending.length ? `<ul>${pending.map((c) => row(c, approveBtn + deleteBtn)).join('')}</ul>` : `<p class="empty">Nothing waiting.</p>`}
<h2>Approved — most recent ${approved.length}</h2>
${approved.length ? `<ul>${approved.map((c) => row(c, deleteBtn)).join('')}</ul>` : `<p class="empty">None yet.</p>`}
</body></html>`;
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
