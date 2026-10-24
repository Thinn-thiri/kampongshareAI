// @ts-check
// GET /e/<event id>  (netlify.toml redirects it to /.netlify/functions/share-event?id=<id>)
// WhatsApp and Facebook don't run JavaScript when they read a link, so this returns a small HTML page
// with Open Graph tags for the link preview, then sends the visitor on to /event.html?id=<id>
// (REQUIREMENTS.md 5.2). Reads with the public anon key, so only approved events can ever be shown.
// Every value placed into the HTML is escaped. Nothing is logged.
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY (the same public key as in js/config.js).

const TIMEOUT_MS = 8000;
const SITE_TITLE = "KampongShare";
const SITE_DESCRIPTION = "Give where it's needed most — donate items and volunteer with local organizations in Singapore.";

/**
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

/**
 * "Sat, 7 Nov, 9:00 am – 12:00 pm" in Singapore time.
 * @param {string} start
 * @param {string | null} end
 * @returns {string}
 */
function formatWhen(start, end) {
  const date = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const time = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", hour: "numeric", minute: "2-digit" });
  const from = date.format(new Date(start));
  return end ? `${from} – ${time.format(new Date(end))}` : from;
}

/**
 * The site's public address, e.g. https://kampongshare.netlify.app
 * @param {Request} req
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
function siteOrigin(req, env) {
  const host = req.headers.get("x-forwarded-host");
  if (host) return `${req.headers.get("x-forwarded-proto") ?? "https"}://${host}`;
  return env.URL?.replace(/\/+$/, "") || new URL(req.url).origin;
}

/**
 * @param {{ title: string, description: string, url: string, image: string, redirect: string }} page
 * @returns {Response}
 */
function previewPage(page) {
  const t = escapeHtml(page.title);
  const d = escapeHtml(page.description);
  const redirect = escapeHtml(page.redirect);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${t}</title>
<meta name="description" content="${d}" />
<meta property="og:site_name" content="${SITE_TITLE}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:url" content="${escapeHtml(page.url)}" />
<meta property="og:image" content="${escapeHtml(page.image)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
<meta name="twitter:image" content="${escapeHtml(page.image)}" />
<meta http-equiv="refresh" content="0; url=${redirect}" />
</head>
<body>
<p>Opening <a href="${redirect}">${t}</a>…</p>
<script>location.replace(${JSON.stringify(page.redirect)});</script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}

/**
 * The request handler. `deps` can be swapped out in tests.
 * @param {Request} req
 * @param {{ env: Record<string, string | undefined>, fetch: typeof fetch }} [deps]
 * @returns {Promise<Response>}
 */
export async function handle(req, deps = { env: process.env, fetch }) {
  const origin = siteOrigin(req, deps.env);
  const image = `${origin}/img/og-default.png`;
  const generic = () => previewPage({ title: SITE_TITLE, description: SITE_DESCRIPTION, url: origin, image, redirect: "/" });

  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return generic();

  const url = deps.env.SUPABASE_URL?.replace(/\/+$/, "");
  const anonKey = deps.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return generic();

  try {
    const params = new URLSearchParams({
      select: "id,title,description,location_name,starts_at,ends_at,organization:organizations(name)",
      id: `eq.${id}`,
      approval: "eq.approved",
    });
    const response = await deps.fetch(`${url}/rest/v1/events?${params}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return generic();
    const event = (await response.json())?.[0];
    if (!event) return generic();

    const about = String(event.description ?? "").replace(/\s+/g, " ").trim();
    const short = about.length > 140 ? `${about.slice(0, 137).trimEnd()}…` : about;
    const description = [formatWhen(event.starts_at, event.ends_at), event.location_name, short].filter(Boolean).join(" · ");
    const by = event.organization?.name ? ` by ${event.organization.name}` : "";
    return previewPage({
      title: `${event.title}${by} · ${SITE_TITLE}`,
      description,
      url: `${origin}/e/${id}`,
      image,
      redirect: `/event.html?id=${id}`,
    });
  } catch {
    return generic();
  }
}

export default (/** @type {Request} */ req) => handle(req);
