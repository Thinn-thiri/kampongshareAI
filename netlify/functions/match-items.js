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
import { chat, stripPersonalData } from "../lib/ai.js";
import { isLang, serverT } from "../lib/messages.js";
import { daysUntil, notPastDeadlineFilter } from "../lib/dates.js";

/** @typedef {import("../lib/messages.js").Lang} Lang */

export { stripPersonalData };

const TIMEOUT_MS = 10000;
const MAX_TEXT = 300;
const TOP_N = 5;

/** Categories donors can give (the item_category enum without "other"). */
const CATEGORIES = ["food", "clothing", "hygiene", "household", "baby", "education"];
const ALL_CATEGORIES = [...CATEGORIES, "other"];

/**
 * @typedef {{ name: string, category: string, quantity: number | null }} WantedItem
 * @typedef {{ id: string, name: string, category: string, unit: string, quantity_needed: number, quantity_remaining: number }} OpenItem
 * @typedef {{ id: string, title: string, deadline: string | null, urgency: string, ai_score: number | null,
 *             organization: { name: string, address: string | null }, request_items: OpenItem[] }} OpenRequest
 * @typedef {{ env: Record<string, string | undefined>, fetch: typeof fetch, today: Date }} Deps
 */

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
 * Asks NVIDIA Build to turn the (already cleaned) text into items. Returns null if the AI isn't available.
 * @param {string} cleanText
 * @param {Deps} deps
 * @returns {Promise<WantedItem[] | null>}
 */
async function extractItems(cleanText, deps) {
  const content = await chat(
    [
      {
        role: "system",
        content:
          "You turn a short note about donations into a list of items. " +
          `Reply with JSON only, no other text: {"items":[{"name":string,"category":one of ${JSON.stringify(ALL_CATEGORIES)},"quantity":integer or null}]}. ` +
          "Use short item names in English (e.g. \"rice\", \"baby diapers\"), even when the note is in Chinese or Malay. Ignore anything that isn't an item. " +
          'If there are no items, reply {"items":[]}.',
      },
      { role: "user", content: cleanText },
    ],
    { apiKey: deps.env.NVIDIA_API_KEY, maxTokens: 300, fetch: deps.fetch },
  );
  if (!content) return null;
  try {
    const jsonText = content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1);
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed?.items)) return null;
    return parsed.items
      .slice(0, 10)
      .map((/** @type {any} */ item) => ({
        name: String(item?.name ?? "").trim().slice(0, 60),
        category: ALL_CATEGORIES.includes(String(item?.category)) ? String(item.category) : "other",
        quantity: Number.isInteger(item?.quantity) && item.quantity > 0 ? item.quantity : null,
      }))
      .filter((/** @type {WantedItem} */ item) => item.name);
  } catch {
    return null;
  }
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
 * Open requests of approved organizations that aren't past their deadline, with the items still needed
 * (same as what the public sees).
 * @param {Deps} deps
 * @returns {Promise<OpenRequest[]>}
 */
async function loadOpenRequests(deps) {
  const url = deps.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = deps.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const params = new URLSearchParams({
    select:
      "id,title,deadline,urgency,ai_score,organization:organizations!inner(name,address,approval),request_items(id,name,category,unit,quantity_needed,quantity_remaining)",
    status: "eq.open",
    "organization.approval": "eq.approved",
    or: notPastDeadlineFilter(deps.today), // never suggest a request past its deadline
  });
  const response = await deps.fetch(`${url}/rest/v1/donation_requests?${params}`, {
    headers: serviceHeaders(key),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Supabase HTTP ${response.status}`);
  return response.json();
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
 * Lower-case words of 3+ letters, with a simple plural trim ("bags" → "bag", "boxes" → "box").
 * @param {string} text
 * @returns {Set<string>}
 */
function words(text) {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length >= 3)
      .map((w) => w.replace(/(xes|ches|shes)$/, (m) => m.slice(0, -2)).replace(/s$/, "")),
  );
}

/**
 * @param {number} score
 * @returns {string}
 */
function urgencyWord(score) {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

/** @type {Record<string, number>} */
const URGENCY_POINTS = { critical: 15, high: 10, medium: 5, low: 0 };

/**
 * Scores every open item against what the donor can give, and returns the top 5 with reasons.
 * Transparent formula (REQUIREMENTS.md 4.6): category, name, remaining quantity, deadline, urgency, area.
 * @param {WantedItem[]} wanted
 * @param {OpenRequest[]} requests
 * @param {string | null} area
 * @param {Date} today
 * @param {Lang} lang  the language of the reasons
 */
function scoreMatches(wanted, requests, area, today, lang) {
  /** @type {Map<string, { score: number, match: Record<string, unknown> }>} */
  const best = new Map();
  const areaLower = area?.toLowerCase() ?? null;

  for (const request of requests) {
    const days = daysUntil(request.deadline, today);
    const urgencyLevel = request.ai_score != null ? urgencyWord(request.ai_score) : request.urgency;
    const urgencyScore = request.ai_score != null ? (request.ai_score / 100) * 15 : URGENCY_POINTS[request.urgency] ?? 0;
    const deadlineScore = days == null || days < 0 ? 0 : days <= 3 ? 15 : days <= 7 ? 10 : days <= 14 ? 5 : 0;
    const nearby = Boolean(areaLower && request.organization.address?.toLowerCase().includes(areaLower));

    for (const item of request.request_items ?? []) {
      if (item.quantity_remaining <= 0) continue;
      for (const want of wanted) {
        const categoryMatch = want.category === item.category;
        const itemWords = words(item.name);
        const nameMatch = [...words(want.name)].some((w) => itemWords.has(w));
        if (!categoryMatch && !nameMatch) continue;

        const share = want.quantity ? Math.min(want.quantity, item.quantity_remaining) / item.quantity_remaining : null;
        const score =
          (categoryMatch ? 40 : 0) +
          (nameMatch ? 25 : 0) +
          (share == null ? 7 : 15 * share) +
          deadlineScore +
          urgencyScore +
          (nearby ? 10 : 0);

        // in the chosen language; the item name and unit stay as the organization wrote them
        const reason = [
          serverT(lang, "reasonNeeds", { count: item.quantity_remaining, unit: item.unit, item: item.name }),
          days != null && days >= 0 && days <= 14
            ? days === 0
              ? serverT(lang, "dueToday")
              : serverT(lang, days === 1 ? "dueInOne" : "dueInMany", { days })
            : null,
          urgencyLevel === "critical" ? serverT(lang, "urgencyCritical") : urgencyLevel === "high" ? serverT(lang, "urgencyHigh") : null,
          nearby && area ? serverT(lang, "nearYou", { area }) : null,
        ]
          .filter(Boolean)
          .join(serverT(lang, "separator"));

        const previous = best.get(item.id);
        if (!previous || score > previous.score) {
          best.set(item.id, {
            score,
            match: {
              itemId: item.id,
              requestId: request.id,
              requestTitle: request.title,
              organization: request.organization.name,
              itemName: item.name,
              unit: item.unit,
              category: item.category,
              remaining: item.quantity_remaining,
              deadline: request.deadline,
              reason,
            },
          });
        }
      }
    }
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_N)
    .map((entry) => entry.match);
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
    const [requests, area] = await Promise.all([loadOpenRequests(deps), callerArea(req, deps)]);
    const matches = wanted.length ? scoreMatches(wanted, requests, area, deps.today, lang) : [];
    return json(200, { fallback: false, items: wanted.filter((w) => w.name), matches });
  } catch {
    return json(502, { error: "unavailable" });
  }
}

export default (/** @type {Request} */ req) => handle(req);
