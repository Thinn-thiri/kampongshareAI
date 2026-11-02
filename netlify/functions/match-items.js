// @ts-check
// POST /api/match-items  { text: "5 bags of rice, baby diapers", lang?, answers? }
// lang (en, zh or ms — the site's language) sets the language of the reasons and questions; anything else → 400.
// "What can you give?" (REQUIREMENTS.md 6.4 and 4.6):
//   1. remove anything that looks like personal data from the text
//   2. the donation-plan check (netlify/lib/guardrail.js): AI #1 finds candidate request items by what each item is,
//      code checks them (open, approved, not past the deadline, still needed), and a SEPARATE AI #2 checks each item
//      against the general rules and each candidate's own rules → match / block / ask
//   3. reply { checked, items, plan, blocked, questions, unmatched }. If either AI fails or runs out of time:
//      { checked: false } and NO plan — the page says "We couldn't check your items right now".
// answers: the donor's yes/no answers to the checker's questions ({ item, request_item_id, rule, question, answer }, max 3).
//
// POST /api/match-items  { mode: "volunteer", text?, use_profile?, answers?, lang? }  — "Find me where to help" on
// volunteer.html (netlify/lib/volunteer-match.js), a mode here so it shares this function's one rate-limit rule.
// use_profile: the caller's own available days, times, interests, skills and area, read with their login token and
// used ONLY when they allowed matching (profiles.matching_opt_in): no login → 401, not allowed → 403.
// answers: { event_id, need, question, answer } (max 3). Reply { checked, events, questions, not_fit }.
// The visitor's text is never stored or logged.
//
// Env: NVIDIA_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (to read open requests), SUPABASE_ANON_KEY (events
// and the caller's own profile, read like a visitor / as the caller).

// The model and the personal-data filter live in netlify/lib/ai.js (one MODEL constant for all functions).
import { stripPersonalData } from "../lib/ai.js";
import { isLang } from "../lib/messages.js";
import { loadOpenRequests } from "../lib/match.js";
import { checkedPlan } from "../lib/guardrail.js";
import { personText, volunteerPlan } from "../lib/volunteer-match.js";
import { callerMatchingProfile } from "../lib/public-data.js";

export { stripPersonalData };

/** @typedef {import("../lib/match.js").Deps} Deps */

const MAX_TEXT = 300;
/** The whole check (AI #1, AI #2, maybe once more) finishes within this; Netlify allows 60 s. */
const CHECK_BUDGET_MS = 30000;
const MAX_ANSWERS = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The donor's yes/no answers to the checker's questions: at most 3, short, cleaned. Anything else is dropped.
 * @param {unknown} raw
 * @returns {import("../lib/guardrail.js").DonorAnswer[]}
 */
function cleanAnswers(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_ANSWERS)
    .filter((a) => a && typeof a.question === "string" && (a.answer === "yes" || a.answer === "no"))
    .map((a) => ({
      item: typeof a.item === "string" ? stripPersonalData(a.item).slice(0, 60) : "",
      request_item_id: typeof a.request_item_id === "string" && UUID.test(a.request_item_id) ? a.request_item_id : null,
      rule: typeof a.rule === "string" ? stripPersonalData(a.rule).slice(0, 300) : "",
      question: stripPersonalData(a.question).slice(0, 200),
      answer: a.answer,
    }));
}

/**
 * The person's yes/no answers about an event's needs: at most 3, short, cleaned. Anything else is dropped.
 * @param {unknown} raw
 * @returns {import("../lib/volunteer-match.js").PersonAnswer[]}
 */
function cleanEventAnswers(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_ANSWERS)
    .filter((a) => a && typeof a.event_id === "string" && UUID.test(a.event_id) && typeof a.question === "string" && (a.answer === "yes" || a.answer === "no"))
    .map((a) => ({
      event_id: a.event_id,
      need: typeof a.need === "string" ? stripPersonalData(a.need).slice(0, 200) : "",
      question: stripPersonalData(a.question).slice(0, 200),
      answer: a.answer,
    }));
}

/**
 * "Find me where to help": the volunteer mode.
 * @param {Request} req
 * @param {any} body
 * @param {import("../lib/messages.js").Lang} lang
 * @param {number} started
 * @param {Deps} deps
 * @returns {Promise<Response>}
 */
async function handleVolunteer(req, body, lang, started, deps) {
  const typed = typeof body?.text === "string" ? body.text.trim() : "";
  if (typed.length > MAX_TEXT) return json(400, { error: "invalid_text" });
  const useProfile = body?.use_profile === true;
  if (!typed && !useProfile) return json(400, { error: "invalid_request" });
  /** @type {import("../lib/volunteer-match.js").MatchingProfile | null} */
  let profile = null;
  if (useProfile) {
    const mine = await callerMatchingProfile(req, deps);
    if (mine.status !== "ok") return mine.status === "no_consent" ? json(403, { error: "no_matching_consent" }) : json(401, { error: "login_required" });
    profile = mine.profile;
  }
  try {
    const person = personText({ text: typed ? stripPersonalData(typed) : "", profile });
    const result = await volunteerPlan({ person, lang, answers: cleanEventAnswers(body?.answers), deadline: started + CHECK_BUDGET_MS }, deps);
    return json(200, { ...result });
  } catch {
    return json(502, { error: "unavailable" });
  }
}

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
 * The request handler. `deps` can be swapped out in tests.
 * @param {Request} req
 * @param {Deps} [deps]
 * @returns {Promise<Response>}
 */
export async function handle(req, deps = { env: process.env, fetch, today: new Date() }) {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const started = Date.now();

  /** @type {any} */
  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_request" });
  }

  // the site's language, for the reasons and questions: only en, zh or ms
  const lang = body?.lang ?? "en";
  if (!isLang(lang)) return json(400, { error: "invalid_lang" });
  if (body?.mode === "volunteer") return handleVolunteer(req, body, lang, started, deps);
  if (typeof body?.text !== "string") return json(400, { error: "invalid_request" });
  const text = body.text.trim();
  if (!text || text.length > MAX_TEXT) return json(400, { error: "invalid_text" });

  try {
    const requests = await loadOpenRequests(deps, serviceHeaders(deps.env.SUPABASE_SERVICE_ROLE_KEY ?? ""));
    const result = await checkedPlan(
      { text: stripPersonalData(text), requests, lang, answers: cleanAnswers(body?.answers), deadline: started + CHECK_BUDGET_MS },
      deps,
    );
    return json(200, { ...result });
  } catch {
    return json(502, { error: "unavailable" });
  }
}

export default (/** @type {Request} */ req) => handle(req);
