// @ts-check
// POST /api/delete-account  (Authorization: Bearer <Supabase login token>)
// "Delete my account" (REQUIREMENTS.md 4.4): removes the caller's login, profile and personal data.
//   * waiting / accepted offers are cancelled first (so the organization isn't left expecting items)
//   * offer messages are cleared, then the account is deleted
//   * past offers stay for the organization's records, anonymised (the database sets donor_id to null)
//   * volunteer applications and tasks are removed with the profile
// Only individual accounts (donors / volunteers) can delete themselves here; organization and
// admin accounts are refused with a message, because they own public records.
// Needs the service role key (Netlify env / .env only). Nothing is logged.

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
 * @param {string} key
 * @returns {Record<string, string>}
 */
function serviceHeaders(key) {
  /** @type {Record<string, string>} */
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  return headers;
}

/**
 * The request handler. `deps` can be swapped out in tests.
 * @param {Request} req
 * @param {{ env: Record<string, string | undefined>, fetch: typeof fetch }} [deps]
 * @returns {Promise<Response>}
 */
export async function handle(req, deps = { env: process.env, fetch }) {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const url = deps.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = deps.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return json(500, { error: "not_configured" });

  // 1. Who is asking? (their own login token)
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "login_required" });
  let userId;
  try {
    const userResponse = await deps.fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!userResponse.ok) return json(401, { error: "login_required" });
    userId = (await userResponse.json())?.id;
  } catch {
    return json(502, { error: "unavailable" });
  }
  if (typeof userId !== "string" || !/^[0-9a-f-]{36}$/i.test(userId)) return json(401, { error: "login_required" });

  const rest = `${url}/rest/v1`;
  const headers = serviceHeaders(key);
  const id = encodeURIComponent(userId);

  try {
    // 2. Only individual accounts.
    const profileResponse = await deps.fetch(`${rest}/profiles?select=role&id=eq.${id}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!profileResponse.ok) return json(502, { error: "unavailable" });
    const role = (await profileResponse.json())?.[0]?.role;
    if (role === "organization" || role === "admin") {
      return json(403, {
        error: "not_individual",
        message: "Organization and admin accounts can't be deleted here. Please contact the KampongShare team.",
      });
    }

    // 3. Cancel waiting / accepted offers, then clear messages on all of this person's offers.
    const cancel = await deps.fetch(`${rest}/donation_offers?donor_id=eq.${id}&status=in.(pending,accepted)`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: "cancelled" }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!cancel.ok) return json(502, { error: "unavailable" });
    const clear = await deps.fetch(`${rest}/donation_offers?donor_id=eq.${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ message: null }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!clear.ok) return json(502, { error: "unavailable" });

    // 4. Delete the login. The profile goes with it; offers keep donor_id = null (anonymised).
    const remove = await deps.fetch(`${url}/auth/v1/admin/users/${id}`, {
      method: "DELETE",
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!remove.ok) return json(502, { error: "unavailable" });
  } catch {
    return json(502, { error: "unavailable" });
  }

  return json(200, { deleted: true });
}

export default (/** @type {Request} */ req) => handle(req);

export const config = { path: "/api/delete-account" };
