// @ts-check
// Postal code → address + map coordinates, via our Netlify Function (which calls OneMap).
// Reusable: organization locations now, event locations in step 9.

/**
 * @typedef {Object} GeocodeResult
 * @property {string} address    e.g. "123 Simei Street 1, Singapore 520123"
 * @property {number} latitude
 * @property {number} longitude
 */

/**
 * Looks up a Singapore postal code. Only the postal code is sent.
 * Returns null when it isn't 6 digits, isn't found, or the lookup can't be reached —
 * the caller shows one kind message and the map still works by tapping.
 * @param {string} postalCode
 * @returns {Promise<GeocodeResult | null>}
 */
async function lookupPostalCode(postalCode) {
  const code = postalCode.trim();
  if (!/^\d{6}$/.test(code)) return null;
  try {
    const {
      data: { session },
    } = await db().auth.getSession();
    if (!session) return null;
    const response = await fetch("/api/geocode-postal", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ postalCode: code }),
    });
    if (!response.ok) return null;
    const result = await response.json();
    if (typeof result.latitude !== "number" || typeof result.longitude !== "number") return null;
    return { address: String(result.address ?? ""), latitude: result.latitude, longitude: result.longitude };
  } catch {
    return null;
  }
}
