// @ts-check
// Scores one open donation request and saves the result (server side, service role key).
// Used by netlify/functions/score-request.js and scripts/score-requests.js.
// The number comes from the transparent formula (urgency.js); the AI only writes the explanation,
// and it never receives the title, names, contacts or anything that looks like personal data.

import { chat, stripPersonalData } from "./ai.js";
import { areaOf, fallbackExplanation, levelOf, scoreRequest } from "./urgency.js";

const TIMEOUT_MS = 10000;

/**
 * @typedef {{ env: Record<string, string | undefined>, fetch: typeof fetch, today?: Date }} ScoreDeps
 * @typedef {{ name: string, category: string, unit: string, quantity_needed: number, quantity_remaining: number }} ItemRow
 * @typedef {{ id: string, organization_id: string, status: string, description: string | null, urgency: string,
 *             deadline: string | null, organization: { address: string | null, owner_id: string } | null,
 *             request_items: ItemRow[] }} RequestRow
 */

/**
 * Supabase REST helpers with the service role key.
 * @param {ScoreDeps} deps
 */
export function supabaseRest(deps) {
  const url = deps.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = deps.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  /** @type {Record<string, string>} */
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  return {
    url,
    /**
     * @param {string} path  e.g. "donation_requests?select=id&status=eq.open"
     * @param {RequestInit} [init]
     */
    async request(path, init = {}) {
      const response = await deps.fetch(`${url}/rest/v1/${path}`, {
        ...init,
        headers: { ...headers, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Supabase HTTP ${response.status}`);
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    },
  };
}

/**
 * Loads a request with what scoring needs.
 * @param {string} requestId
 * @param {ScoreDeps} deps
 * @returns {Promise<RequestRow | null>}
 */
export async function loadRequest(requestId, deps) {
  const rest = supabaseRest(deps);
  const select = "id,organization_id,status,description,urgency,deadline,organization:organizations(address,owner_id),request_items(name,category,unit,quantity_needed,quantity_remaining)";
  const rows = await rest.request(`donation_requests?select=${encodeURIComponent(select)}&id=eq.${encodeURIComponent(requestId)}`);
  return rows?.[0] ?? null;
}

/**
 * Asks the AI for a short explanation of the score. Returns null if the AI isn't available.
 * Only non-personal facts are sent (REQUIREMENTS.md 4.6).
 * @param {RequestRow} request
 * @param {{ score: number, factors: import('./urgency.js').Factor[] }} result
 * @param {ScoreDeps} deps
 * @returns {Promise<string | null>}
 */
async function explain(request, result, deps) {
  const facts = {
    score: result.score,
    level: levelOf(result.score),
    factors: result.factors.map((f) => `${f.label}: ${f.points} of ${f.max} points`),
    items: request.request_items.map((i) => ({ name: i.name, category: i.category, still_needed: i.quantity_remaining, unit: i.unit })),
    deadline: request.deadline,
    organization_urgency: request.urgency,
    area: areaOf(request.organization?.address),
    description: stripPersonalData(request.description ?? "").slice(0, 600),
  };
  const reply = await chat(
    [
      {
        role: "system",
        content:
          "You explain an urgency score for a community donation request in Singapore. The score was already calculated by a fixed formula; " +
          "do not change it or invent new reasons. Write one or two short, kind, plain-English sentences (max 45 words) for donors. " +
          "Never mention or guess race, religion, nationality, health or income. Reply with the sentences only.",
      },
      { role: "user", content: JSON.stringify(facts) },
    ],
    { apiKey: deps.env.NVIDIA_API_KEY, maxTokens: 120, fetch: deps.fetch },
  );
  if (!reply) return null;
  return reply.replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ").slice(0, 300) || null;
}

/**
 * Scores an open request and saves ai_score / ai_reasons / ai_scored_at.
 * @param {RequestRow} request
 * @param {ScoreDeps} deps
 * @returns {Promise<{ score: number, ai: boolean }>}
 */
export async function scoreAndSave(request, deps) {
  const result = scoreRequest(
    { deadline: request.deadline, urgency: request.urgency, items: request.request_items ?? [] },
    deps.today ?? new Date(),
  );
  const aiText = await explain(request, result, deps);
  const reasons = {
    v: 1,
    explanation: aiText ?? fallbackExplanation(result.score, result.factors),
    ai: Boolean(aiText),
    factors: result.factors,
  };
  const rest = supabaseRest(deps);
  await rest.request(`donation_requests?id=eq.${encodeURIComponent(request.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ai_score: result.score, ai_reasons: JSON.stringify(reasons), ai_scored_at: new Date().toISOString() }),
  });
  return { score: result.score, ai: reasons.ai };
}
