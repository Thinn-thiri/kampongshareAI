// @ts-check
// POST /api/event-caption  { eventId }   (Authorization: Bearer <Supabase login token>)
// Writes a short, friendly social media caption for an approved event (REQUIREMENTS.md 5.4):
// max 60 words, at most 2 emojis and 3 hashtags. Only the event's organization (or an admin) may ask.
// The AI only gets event facts — never people's data (4.6). If the AI fails: { fallback: true },
// and the page uses the ready-made message template instead. Nothing is logged.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NVIDIA_API_KEY.

import { chat, stripPersonalData } from "../lib/ai.js";

const TIMEOUT_MS = 10000;

// No Netlify rate-limit rule: the free plan allows two, used by match-items and chat-insights
// (both public). This function only answers a logged-in organization owner or admin (checked below).
export const config = {
  path: "/api/event-caption",
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
 * Enforces the caption rules on whatever the AI wrote: ≤ 3 hashtags, ≤ 2 emojis, ≤ 60 words.
 * @param {string} text
 * @returns {string}
 */
export function tidyCaption(text) {
  let hashtags = 0;
  let emojis = 0;
  const cleaned = text
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/https?:\/\/\S+/g, "") // the page adds the real link
    .replace(/#[\p{L}\p{N}_]+/gu, (tag) => (++hashtags <= 3 ? tag : ""))
    .replace(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*/gu, (emoji) => (++emojis <= 2 ? emoji : ""));
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.slice(0, 60).join(" ");
}

/**
 * "Saturday 7 November, 9:00 am" in Singapore time.
 * @param {string} iso
 * @returns {string}
 */
function formatWhen(iso) {
  return new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/**
 * The request handler. `deps` can be swapped out in tests.
 * @param {Request} req
 * @param {{ env: Record<string, string | undefined>, fetch: typeof fetch }} [deps]
 * @returns {Promise<Response>}
 */
export async function handle(req, deps = { env: process.env, fetch }) {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  /** @type {unknown} */
  let eventId;
  try {
    eventId = (await req.json())?.eventId;
  } catch {
    eventId = undefined;
  }
  if (typeof eventId !== "string" || !/^[0-9a-f-]{36}$/i.test(eventId)) return json(400, { error: "invalid_request" });

  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const url = deps.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = deps.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!jwt || !url || !key) return json(401, { error: "login_required" });

  /** @type {Record<string, string>} */
  const service = { apikey: key };
  if (key.startsWith("eyJ")) service.Authorization = `Bearer ${key}`;

  /**
   * @param {string} path
   * @returns {Promise<any>}
   */
  const get = async (path) => {
    const response = await deps.fetch(`${url}/rest/v1/${path}`, { headers: service, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error(`Supabase HTTP ${response.status}`);
    return response.json();
  };

  try {
    const userResponse = await deps.fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!userResponse.ok) return json(401, { error: "login_required" });
    const userId = (await userResponse.json())?.id;
    if (typeof userId !== "string") return json(401, { error: "login_required" });

    const select = "title,description,location_name,starts_at,approval,donation_request_id,organization:organizations(name,owner_id)";
    const event = (await get(`events?select=${encodeURIComponent(select)}&id=eq.${encodeURIComponent(eventId)}`))?.[0];
    if (!event) return json(404, { error: "not_found" });
    const role = (await get(`profiles?select=role&id=eq.${encodeURIComponent(userId)}`))?.[0]?.role;
    if (event.organization?.owner_id !== userId && role !== "admin") return json(403, { error: "not_allowed" });
    if (event.approval !== "approved") return json(409, { error: "not_approved" });

    /** @type {{ name: string, still_needed: number, unit: string }[]} */
    let items = [];
    if (event.donation_request_id) {
      const rows = await get(`request_items?select=name,unit,quantity_remaining&request_id=eq.${encodeURIComponent(event.donation_request_id)}&quantity_remaining=gt.0`);
      items = (rows ?? []).slice(0, 6).map((/** @type {any} */ i) => ({ name: i.name, still_needed: i.quantity_remaining, unit: i.unit }));
    }

    // Event facts only (REQUIREMENTS.md 4.6 / 5.4).
    const facts = {
      title: stripPersonalData(String(event.title ?? "")),
      description: stripPersonalData(String(event.description ?? "")).slice(0, 600),
      when: formatWhen(event.starts_at),
      place: stripPersonalData(String(event.location_name ?? "")),
      organization: event.organization?.name ?? "",
      items_needed: items,
    };
    const reply = await chat(
      [
        {
          role: "system",
          content:
            "You write a short, warm social media caption inviting people in Singapore to donate to and volunteer at a community event. " +
            "Rules: at most 60 words, at most 2 emojis, at most 3 hashtags, plain friendly English, no links, no made-up facts. " +
            "Never mention or guess race, religion, nationality, health or income. Reply with the caption only.",
        },
        { role: "user", content: JSON.stringify(facts) },
      ],
      { apiKey: deps.env.NVIDIA_API_KEY, maxTokens: 160, fetch: deps.fetch },
    );
    const caption = reply ? tidyCaption(reply) : "";
    return caption ? json(200, { caption }) : json(200, { fallback: true });
  } catch {
    return json(200, { fallback: true });
  }
}

export default (/** @type {Request} */ req) => handle(req);
