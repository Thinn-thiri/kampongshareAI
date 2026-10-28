// @ts-check
// The public impact numbers (public_stats), shared by the home page and the admin Overview.

/**
 * One impact number: the label and the friendly text for 0 follow the chosen language.
 * @param {string} key  the public_stats column (also its translation key, stats.<key>)
 * @param {string} emptyKey
 */
function statCard(key, emptyKey) {
  return {
    key,
    get label() {
      return t(`stats.${key}`);
    },
    get empty() {
      return t(`stats.${emptyKey}`);
    },
  };
}

/** Impact numbers from public_stats(), with friendly text when a number is still 0. */
const STAT_CARDS = [
  statCard("items_delivered", "beFirstGive"),
  statCard("completed_donations", "beFirstGive"),
  statCard("open_requests", "noNeeds"),
  statCard("upcoming_events", "comingSoon"),
  statCard("organizations", "beFirstJoin"),
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
