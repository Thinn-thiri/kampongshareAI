// @ts-check
// POST /api/match-items  { text: "5 bags of rice, baby diapers", lang? }  or  { category: "food", lang? }
// lang (en, zh or ms — the site's language) sets the language of the reasons; anything else → 400.
// "What can you give?" (REQUIREMENTS.md 6.4 and 4.6):
//   1. remove anything that looks like personal data from the text
//   2. ask NVIDIA Build to turn the cleaned text into items { name, category, quantity }
//   3. score open request items with a transparent formula and return the top 5, each with a one-line reason
// If the AI isn't available, the page gets { fallback: true } and shows category buttons instead.
// The visitor's text is never stored or logged.
//
// Env: NVIDIA_API_KEY (optional — without it, category buttons are used),
//      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (to read open requests and check a login).

// The model and the personal-data filter live in netlify/lib/ai.js (one MODEL constant for all functions).
import { stripPersonalData } from "../lib/ai.js";
import { isLang } from "../lib/messages.js";
// the matching itself is shared with Pinny's match_items tool (netlify/lib/match.js)
import { CATEGORIES, extractItems, loadOpenRequests, scoreMatches } from "../lib/match.js";

/** @typedef {import("../lib/messages.js").Lang} Lang */

export { stripPersonalData };

/**
 * @typedef {import("../lib/match.js").WantedItem} WantedItem
 * @typedef {import("../lib/match.js").Deps} Deps
 */

const TIMEOUT_MS = 10000;
const MAX_TEXT = 300;

export const config = {
  path: "/api/match-items",
  rateLimit: {
    windowLimit: 10,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};

/**
 * @param {number} status
 * @param {Record<string, unknown>} body
 * @returns {Response}
 */
function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/**
 * Headers for Supabase's REST API with the service key.
 * @param {string} key
 * @returns {Record<string, string>}
 */
function serviceHeaders(key) {
  /** @type {Record<string, string>} */
  const headers = { apikey: key };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  return headers;
}

/**
 * The logged-in caller's area (for the "near you" bonus), or null. Never returned or logged.
 * @param {Request} req
 * @param {Deps} deps
 * @returns {Promise<string | null>}
 */
async function callerArea(req, deps) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const url = deps.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = deps.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!jwt || !url || !key) return null;
  try {
    const userResponse = await deps.fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!userResponse.ok) return null;
    const user = await userResponse.json();
    if (typeof user?.id !== "string") return null;
    const profileResponse = await deps.fetch(
      `${url}/rest/v1/profiles?select=area&id=eq.${encodeURIComponent(user.id)}`,
      { headers: serviceHeaders(key), signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!profileResponse.ok) return null;
    const rows = await profileResponse.json();
    const area = rows?.[0]?.area;
    return typeof area === "string" && area.trim() ? area.trim() : null;
  } catch {
    return null;
  }
}

/**
 * The request handler. `deps` can be swapped out in tests.
 * @param {Request} req
 * @param {Deps} [deps]
 * @returns {Promise<Response>}
 */
export async function handle(req, deps = { env: process.env, fetch, today: new Date() }) {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  /** @type {any} */
  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_request" });
  }

  // the site's language, for the reasons: only en, zh or ms
  const lang = body?.lang ?? "en";
  if (!isLang(lang)) return json(400, { error: "invalid_lang" });

  /** @type {WantedItem[]} */
  let wanted;
  if (typeof body?.category === "string") {
    if (!CATEGORIES.includes(body.category)) return json(400, { error: "invalid_category" });
    wanted = [{ name: "", category: body.category, quantity: null }];
  } else if (typeof body?.text === "string") {
    const text = body.text.trim();
    if (!text || text.length > MAX_TEXT) return json(400, { error: "invalid_text" });
    const items = await extractItems(stripPersonalData(text), deps);
    if (!items) return json(200, { fallback: true, categories: CATEGORIES });
    wanted = items;
  } else {
    return json(400, { error: "invalid_request" });
  }

  try {
    const [requests, area] = await Promise.all([loadOpenRequests(deps, serviceHeaders(deps.env.SUPABASE_SERVICE_ROLE_KEY ?? "")), callerArea(req, deps)]);
    const matches = wanted.length ? scoreMatches(wanted, requests, area, deps.today, lang) : [];
    return json(200, { fallback: false, items: wanted.filter((w) => w.name), matches });
  } catch {
    return json(502, { error: "unavailable" });
  }
}

export default (/** @type {Request} */ req) => handle(req);
