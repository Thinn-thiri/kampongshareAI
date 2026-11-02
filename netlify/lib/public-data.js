// @ts-check
// Reading PUBLIC data for the chat (REQUIREMENTS.md 6.8): always with the anon key, so the database's own
// rules decide what may be seen — the same as a visitor. Never profiles, offers, applications or tasks,
// except the caller's own role (callerRole) and the caller's own matching details (callerMatchingProfile),
// read with the caller's own login token.

const TIMEOUT_MS = 10000;

/**
 * @typedef {{ env: Record<string, string | undefined>, fetch: typeof fetch }} DataDeps
 * @typedef {'visitor' | 'donor' | 'volunteer' | 'both' | 'organization' | 'admin'} ViewerRole
 */

/** @param {DataDeps} deps */
function anon(deps) {
  const url = deps.env.SUPABASE_URL?.replace(/\/+$/, "");
  const anonKey = deps.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("not configured");
  return { url, anonKey, headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } };
}

/**
 * Reads a public table with the anon key, so the database only returns what visitors may see.
 * @param {DataDeps} deps
 * @param {string} table
 * @param {URLSearchParams} params
 * @param {number} [timeoutMs]
 * @returns {Promise<any[]>}
 */
export async function readPublic(deps, table, params, timeoutMs = TIMEOUT_MS) {
  const { url, headers } = anon(deps);
  const response = await deps.fetch(`${url}/rest/v1/${table}?${params}`, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error("read failed");
  return response.json();
}

/**
 * Spots left per event, from the public event_spots() function (numbers only, never who applied).
 * spots_left is null when an event has no limit.
 * @param {DataDeps} deps
 * @param {string[]} eventIds
 * @returns {Promise<Map<string, number | null>>}
 */
export async function eventSpots(deps, eventIds) {
  /** @type {Map<string, number | null>} */
  const spots = new Map();
  if (!eventIds.length) return spots;
  const { url, headers } = anon(deps);
  const response = await deps.fetch(`${url}/rest/v1/rpc/event_spots`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ p_event_ids: eventIds }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("spots failed");
  for (const row of await response.json()) spots.set(row.event_id, row.spots_left ?? null);
  return spots;
}

/**
 * The caller's ROLE only (visitor / donor / volunteer / both / organization / admin), worked out from their
 * login token with the anon key: the database lets people read only their own profile. Nothing else from
 * the profile is read, and any problem means "visitor".
 * @param {Request} req
 * @param {DataDeps} deps
 * @returns {Promise<ViewerRole>}
 */
export async function callerRole(req, deps) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return "visitor";
  try {
    const { url, anonKey } = anon(deps);
    const asCaller = { apikey: anonKey, Authorization: `Bearer ${jwt}` };
    const userResponse = await deps.fetch(`${url}/auth/v1/user`, { headers: asCaller, signal: AbortSignal.timeout(4000) });
    if (!userResponse.ok) return "visitor";
    const userId = (await userResponse.json())?.id;
    if (typeof userId !== "string") return "visitor";
    const profileResponse = await deps.fetch(`${url}/rest/v1/profiles?select=role,is_donor,is_volunteer&id=eq.${encodeURIComponent(userId)}`, {
      headers: asCaller,
      signal: AbortSignal.timeout(4000),
    });
    if (!profileResponse.ok) return "visitor";
    const profile = (await profileResponse.json())?.[0];
    if (!profile) return "visitor";
    if (profile.role === "admin") return "admin";
    if (profile.role === "organization") return "organization";
    if (profile.is_donor && profile.is_volunteer) return "both";
    if (profile.is_volunteer) return "volunteer";
    return "donor";
  } catch {
    return "visitor";
  }
}

/**
 * The caller's OWN volunteer matching details, read with their login token (the database lets people read only
 * their own profile): available days and times, interests, skills and area — never name, email or phone.
 * Only returned when they allowed matching (profiles.matching_opt_in, REQUIREMENTS.md 4.2).
 * @param {Request} req
 * @param {DataDeps} deps
 * @returns {Promise<{ status: 'ok', profile: { available_days: string[], available_times: string[], interests: string[], skills: string[], area: string | null } }
 *   | { status: 'no_login' | 'no_consent' }>}
 */
export async function callerMatchingProfile(req, deps) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return { status: "no_login" };
  try {
    const { url, anonKey } = anon(deps);
    const asCaller = { apikey: anonKey, Authorization: `Bearer ${jwt}` };
    const userResponse = await deps.fetch(`${url}/auth/v1/user`, { headers: asCaller, signal: AbortSignal.timeout(4000) });
    if (!userResponse.ok) return { status: "no_login" };
    const userId = (await userResponse.json())?.id;
    if (typeof userId !== "string") return { status: "no_login" };
    const select = "is_volunteer,matching_opt_in,available_days,available_times,interests,skills,area";
    const profileResponse = await deps.fetch(`${url}/rest/v1/profiles?select=${select}&id=eq.${encodeURIComponent(userId)}`, {
      headers: asCaller,
      signal: AbortSignal.timeout(4000),
    });
    if (!profileResponse.ok) return { status: "no_login" };
    const p = (await profileResponse.json())?.[0];
    if (!p) return { status: "no_login" };
    if (!p.is_volunteer || p.matching_opt_in !== true) return { status: "no_consent" };
    /** @param {unknown} v */
    const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
    return {
      status: "ok",
      profile: {
        available_days: list(p.available_days),
        available_times: list(p.available_times),
        interests: list(p.interests),
        skills: list(p.skills),
        area: typeof p.area === "string" && p.area.trim() ? p.area.trim() : null,
      },
    };
  } catch {
    return { status: "no_login" };
  }
}
