// @ts-check
// The public impact numbers (public_stats), shared by the home page and the admin Overview.

/** Impact numbers from public_stats(), with friendly text when a number is still 0. */
const STAT_CARDS = [
  { key: "items_delivered", label: "Items delivered", empty: "Be the first to give" },
  { key: "completed_donations", label: "Completed donations", empty: "Be the first to give" },
  { key: "open_requests", label: "Open requests", empty: "No needs right now" },
  { key: "upcoming_events", label: "Upcoming events", empty: "Coming soon" },
  { key: "organizations", label: "Organizations", empty: "Be the first to join" },
];

/**
 * Totals for the home page. Returns only counts — never who gave what.
 * @returns {Promise<Record<string, number>>}
 */
async function getPublicStats() {
  const { data, error } = await db().rpc("public_stats").single();
  if (error) throw error;
  /** @type {Record<string, number>} */
  const stats = {};
  for (const card of STAT_CARDS) stats[card.key] = Number(/** @type {any} */ (data)?.[card.key] ?? 0);
  return stats;
}
