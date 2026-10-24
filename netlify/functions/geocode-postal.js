// @ts-check
// POST /api/geocode-postal  { postalCode: "520123" }  →  { address, latitude, longitude }
// Turns a Singapore postal code into an address and map coordinates using OneMap (Singapore Land Authority).
// Only the postal code is sent to OneMap. Logged-in users only. Nothing is logged.
//
// Env (.env locally, Netlify environment variables online):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   – to check the caller's login
//   ONEMAP_EMAIL, ONEMAP_PASSWORD             – optional OneMap account (onemap.gov.sg/apidocs/register).
//                                               Without them the search is called without a token,
//                                               which OneMap still allows for now.

const ONEMAP = "https://www.onemap.gov.sg";
const TIMEOUT_MS = 8000;

/** @type {{ token: string, expiresAt: number } | null} */
let cachedToken = null;

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
 * True when the request carries a valid Supabase login token.
 * @param {Request} req
 * @returns {Promise<boolean>}
 */
async function isLoggedIn(req) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!jwt || !url || !serviceKey) return false;
  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * A OneMap access token (cached until an hour before it expires), or null when no account is set up.
 * @returns {Promise<string | null>}
 */
async function getOneMapToken() {
  const email = process.env.ONEMAP_EMAIL;
  const password = process.env.ONEMAP_PASSWORD;
  if (!email || !password) return null;
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
  try {
    const response = await fetch(`${ONEMAP}/api/auth/post/getToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = await response.json();
    if (typeof body.access_token !== "string") return null;
    const expirySeconds = Number(body.expiry_timestamp) || Date.now() / 1000 + 3 * 24 * 3600;
    cachedToken = { token: body.access_token, expiresAt: (expirySeconds - 3600) * 1000 };
    return cachedToken.token;
  } catch {
    return null;
  }
}

/**
 * "123 SIMEI STREET 1 SINGAPORE 520123" → "123 Simei Street 1, Singapore 520123"
 * @param {string} address
 * @returns {string}
 */
function tidyAddress(address) {
  const titled = address
    .trim()
    .split(/\s+/)
    .map((word) => (/\d/.test(word) ? word : word.charAt(0) + word.slice(1).toLowerCase()))
    .join(" ");
  return titled.replace(/\s+Singapore\s+(\d{6})$/, ", Singapore $1");
}

/**
 * Looks the postal code up on OneMap.
 * @param {string} postalCode 6 digits
 * @returns {Promise<{ address: string, latitude: number, longitude: number } | null>} null when not found
 * @throws when OneMap can't be reached
 */
async function searchOneMap(postalCode) {
  const params = new URLSearchParams({ searchVal: postalCode, returnGeom: "Y", getAddrDetails: "Y", pageNum: "1" });
  const token = await getOneMapToken();
  const response = await fetch(`${ONEMAP}/api/common/elastic/search?${params}`, {
    headers: token ? { Authorization: token } : {},
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`OneMap HTTP ${response.status}`);
  const body = await response.json();
  /** @type {{ POSTAL?: string, ADDRESS?: string, LATITUDE?: string, LONGITUDE?: string }[]} */
  const results = Array.isArray(body.results) ? body.results : [];
  const match = results.find((result) => result.POSTAL === postalCode);
  if (!match) return null;
  const latitude = Number(match.LATITUDE);
  const longitude = Number(match.LONGITUDE);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { address: tidyAddress(match.ADDRESS ?? ""), latitude, longitude };
}

/**
 * The request handler. `checkLogin` can be swapped out in tests.
 * @param {Request} req
 * @param {(req: Request) => Promise<boolean>} [checkLogin]
 * @returns {Promise<Response>}
 */
export async function handle(req, checkLogin = isLoggedIn) {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!(await checkLogin(req))) return json(401, { error: "login_required" });

  /** @type {unknown} */
  let postalCode;
  try {
    postalCode = (await req.json())?.postalCode;
  } catch {
    postalCode = undefined;
  }
  if (typeof postalCode !== "string" || !/^\d{6}$/.test(postalCode)) {
    return json(400, { error: "invalid_postal_code" });
  }

  try {
    const result = await searchOneMap(postalCode);
    return result ? json(200, result) : json(404, { error: "not_found" });
  } catch {
    return json(502, { error: "unavailable" });
  }
}

export default (/** @type {Request} */ req) => handle(req);

export const config = { path: "/api/geocode-postal" };
