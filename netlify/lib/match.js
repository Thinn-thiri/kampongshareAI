// @ts-check
// "What can you give?" matching, shared by the match-items function and Pinny's match_items tool
// (REQUIREMENTS.md 6.4 and 6.8): the AI turns a short note into items; a transparent formula scores open
// request items and gives a one-line reason for each. Callers remove personal data from the text first.

import { chat } from "./ai.js";
import { serverT } from "./messages.js";
import { daysUntil, notPastDeadlineFilter } from "./dates.js";

/** @typedef {import("./messages.js").Lang} Lang */

const TIMEOUT_MS = 10000;
const TOP_N = 5;

/** Categories donors can give (the item_category enum without "other"). */
export const CATEGORIES = ["food", "clothing", "hygiene", "household", "baby", "education"];
export const ALL_CATEGORIES = [...CATEGORIES, "other"];

/**
 * @typedef {{ name: string, category: string, quantity: number | null }} WantedItem
 * @typedef {{ id: string, name: string, category: string, unit: string, quantity_needed: number, quantity_remaining: number,
 *             size_spec?: string | null, material?: string | null, min_condition?: string, details_required?: boolean,
 *             item_details?: string | null }} OpenItem
 * @typedef {{ id: string, title: string, deadline: string | null, urgency: string, ai_score: number | null,
 *             organization: { name: string, address: string | null }, request_items: OpenItem[] }} OpenRequest
 * @typedef {{ env: Record<string, string | undefined>, fetch: typeof fetch, today: Date }} Deps
 * @typedef {Record<string, unknown>} Match
 */

/**
 * Asks NVIDIA Build to turn the (already cleaned) text into items. Returns null if the AI isn't available.
 * @param {string} cleanText
 * @param {Deps} deps
 * @returns {Promise<WantedItem[] | null>}
 */
export async function extractItems(cleanText, deps) {
  const content = await chat(
    [
      {
        role: "system",
        content:
          "You turn a short note about donations into a list of items. " +
          `Reply with JSON only, no other text: {"items":[{"name":string,"category":one of ${JSON.stringify(ALL_CATEGORIES)},"quantity":integer or null}]}. ` +
          "Always translate the item name into short English, even when the note is in Chinese or Malay " +
          '(e.g. "beras" / "大米" → "rice", "susu tepung" / "奶粉" → "milk powder", "lampin" / "尿布" → "baby diapers"), ' +
          'without containers or amounts ("2 tin susu tepung" → name "milk powder", quantity 2), ' +
          'but keep words the note uses that say exactly what it is: size, meat type, halal, material, condition ' +
          '(e.g. "size 2 diapers", "pork luncheon meat", "halal chicken sausages", "used 20 cm pot"). ' +
          "Categories: milk powder, formula, diapers and baby wipes → baby; packed food and drinks → food; " +
          "soap, toothpaste, sanitary pads → hygiene; bedsheets, pots, fans → household; books, stationery → education. " +
          "Never add words that aren't in the note (\"luncheon meat\" stays \"luncheon meat\"). Ignore anything that isn't an item. " +
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
 * Open requests of approved organizations that aren't past their deadline, with the items still needed
 * (same as what the public sees).
 * @param {Deps} deps
 * @param {Record<string, string>} headers  the service key (match-items) or the anon key (Pinny's tool)
 * @returns {Promise<OpenRequest[]>}
 */
export async function loadOpenRequests(deps, headers) {
  const url = deps.env.SUPABASE_URL?.replace(/\/+$/, "");
  const params = new URLSearchParams({
    select:
      "id,title,deadline,urgency,ai_score,organization:organizations!inner(name,address,approval),request_items(id,name,category,unit,quantity_needed,quantity_remaining,size_spec,material,min_condition,details_required,item_details)",
    status: "eq.open",
    "organization.approval": "eq.approved",
    or: notPastDeadlineFilter(deps.today), // never suggest a request past its deadline
  });
  const response = await deps.fetch(`${url}/rest/v1/donation_requests?${params}`, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Supabase HTTP ${response.status}`);
  return response.json();
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
 * @param {number} [limit]  how many to return (match-items asks for more, as candidates for the AI plan)
 */
export function scoreMatches(wanted, requests, area, today, lang, limit = TOP_N) {
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
              // exactly what's needed (public facts, as the organization wrote them)
              sizeSpec: item.size_spec ?? null,
              material: item.material ?? null,
              minCondition: item.category === "food" ? "any" : item.min_condition ?? "any",
              detailsRequired: Boolean(item.details_required),
              itemDetails: item.item_details ?? null,
              // which of the donor's items this is for (the plan and the checker need it)
              wantedIndex: wanted.indexOf(want),
              nameMatch,
              reason,
            },
          });
        }
      }
    }
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.match);
}
