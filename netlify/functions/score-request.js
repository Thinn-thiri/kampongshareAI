// @ts-check
// POST /api/score-request  { requestId }   (Authorization: Bearer <Supabase login token>)
// Recalculates the urgency score of one open request (REQUIREMENTS.md 4.6) and saves it.
// Only an admin or the organization that owns the request may ask. Nothing is logged.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NVIDIA_API_KEY (optional — without it a plain explanation is used).

import { loadRequest, scoreAndSave, supabaseRest } from "../lib/score.js";

const TIMEOUT_MS = 10000;

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
 * The request handler. `deps` can be swapped out in tests.
 * @param {Request} req
 * @param {import('../lib/score.js').ScoreDeps} [deps]
 * @returns {Promise<Response>}
 */
export async function handle(req, deps = { env: process.env, fetch }) {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  /** @type {unknown} */
  let requestId;
  try {
    requestId = (await req.json())?.requestId;
  } catch {
    requestId = undefined;
  }
  if (typeof requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(requestId)) return json(400, { error: "invalid_request" });

  // Who is asking?
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const url = deps.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = deps.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!jwt || !url || !key) return json(401, { error: "login_required" });

  try {
    const userResponse = await deps.fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!userResponse.ok) return json(401, { error: "login_required" });
    const userId = (await userResponse.json())?.id;
    if (typeof userId !== "string") return json(401, { error: "login_required" });

    const request = await loadRequest(requestId, deps);
    if (!request) return json(404, { error: "not_found" });

    const profiles = await supabaseRest(deps).request(`profiles?select=role&id=eq.${encodeURIComponent(userId)}`);
    const isAdmin = profiles?.[0]?.role === "admin";
    const isOwner = request.organization?.owner_id === userId;
    if (!isAdmin && !isOwner) return json(403, { error: "not_allowed" });

    if (request.status !== "open") return json(200, { skipped: true });
    const result = await scoreAndSave(request, deps);
    return json(200, result);
  } catch {
    return json(502, { error: "unavailable" });
  }
}

export default (/** @type {Request} */ req) => handle(req);

export const config = { path: "/api/score-request" };
