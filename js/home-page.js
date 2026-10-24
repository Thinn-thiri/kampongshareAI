// @ts-check
// Home page (index.html): impact numbers and the most urgent needs (REQUIREMENTS.md 6.2).
// Works without logging in. The events map is js/public-events.js; the matching box is js/match.js.

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

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("homePage", () => ({
    statCards: STAT_CARDS,
    /** @type {Record<string, number> | null} */
    stats: null,
    statsError: "",

    /** @type {DonationRequest[]} */
    urgent: [],
    loadingUrgent: true,
    urgentError: "",

    /** @type {Profile | null} */
    profile: null,

    requestUrgency,
    itemBarStyles,
    itemBarLabel,

    async init() {
      getProfile()
        .then((profile) => (this.profile = profile))
        .catch(() => (this.profile = null));
      await Promise.all([this.loadStats(), this.loadUrgent()]);
    },

    async loadStats() {
      this.statsError = "";
      try {
        this.stats = await getPublicStats();
      } catch (error) {
        this.statsError = friendlyError(error);
      }
    },

    async loadUrgent() {
      this.loadingUrgent = true;
      this.urgentError = "";
      try {
        this.urgent = (await listOpenRequests()).slice(0, 6);
      } catch (error) {
        this.urgentError = friendlyError(error);
      } finally {
        this.loadingUrgent = false;
      }
    },

    /**
     * "Offer" from the matching box or a card: visitors log in first, then land on the item.
     * @param {string} itemId
     */
    goOffer(itemId) {
      location.href = offerHref(itemId, this.profile);
    },
  }));
});
