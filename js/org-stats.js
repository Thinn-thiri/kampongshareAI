// @ts-check
// Summary cards and "Needs your action" on organization.html's Overview (REQUIREMENTS.md section 3:
// dashboards start with 3–4 stat cards). Reuses the same data functions as the other sections;
// refreshes when they change, and sends the numbers for the top bar's badges.

/**
 * @typedef {Object} OrgStats
 * @property {number} openRequests
 * @property {number} itemsNeeded
 * @property {number} offersWaiting          pending offers to accept or reject
 * @property {number} offersToDeliver        accepted offers not delivered yet
 * @property {number} upcomingEvents
 * @property {number} applicationsWaiting    volunteer applications to approve or reject
 * @property {number} requestsWaitingApproval
 * @property {number} eventsWaitingApproval
 */

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("orgStats", (/** @type {string} */ orgId) => ({
    /** @type {OrgStats | null} */
    stats: null,
    error: "",

    async init() {
      await this.load();
    },

    async load() {
      this.error = "";
      try {
        const [requests, offers, events, applicationsWaiting] = await Promise.all([
          listMyRequests(orgId),
          listIncomingOffers(orgId),
          listMyEvents(orgId),
          countPendingApplications(orgId),
        ]);
        const open = requests.filter((r) => r.status === "open");
        this.stats = {
          openRequests: open.length,
          itemsNeeded: open.reduce((sum, r) => sum + r.request_items.reduce((s, i) => s + i.quantity_remaining, 0), 0),
          offersWaiting: offers.filter((o) => o.status === "pending").length,
          offersToDeliver: offers.filter((o) => o.status === "accepted").length,
          upcomingEvents: events.filter((e) => e.approval === "approved" && (e.status === "upcoming" || e.status === "ongoing") && isNotOver(e)).length,
          applicationsWaiting,
          requestsWaitingApproval: requests.filter((r) => r.status === "pending_approval").length,
          eventsWaitingApproval: events.filter((e) => e.approval === "pending" && (e.status === "upcoming" || e.status === "ongoing")).length,
        };
        // top bar badges: Offers (waiting for a decision) and Events (applications waiting)
        window.dispatchEvent(
          new CustomEvent("dashboard-counts", { detail: { offers: this.stats.offersWaiting, events: this.stats.applicationsWaiting } }),
        );
      } catch (error) {
        this.error = friendlyError(error);
      }
    },

    /**
     * "Needs your action" lines, each linking to its section.
     * @returns {{ text: string, href: string, info?: boolean }[]}
     */
    actions() {
      const s = this.stats;
      if (!s) return [];
      /** @param {number} n @param {string} one @param {string} many */
      const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
      /** @type {{ text: string, href: string, info?: boolean }[]} */
      const list = [];
      if (s.offersWaiting) list.push({ text: `${plural(s.offersWaiting, "offer", "offers")} to accept or reject`, href: "#offers" });
      if (s.offersToDeliver) list.push({ text: `${plural(s.offersToDeliver, "accepted offer", "accepted offers")} to mark delivered when it arrives`, href: "#offers" });
      if (s.applicationsWaiting) list.push({ text: `${plural(s.applicationsWaiting, "volunteer application", "volunteer applications")} waiting`, href: "#events" });
      if (s.requestsWaitingApproval) list.push({ text: `${plural(s.requestsWaitingApproval, "request", "requests")} waiting for admin approval`, href: "#requests", info: true });
      if (s.eventsWaitingApproval) list.push({ text: `${plural(s.eventsWaitingApproval, "event", "events")} waiting for admin approval`, href: "#events", info: true });
      return list;
    },
  }));
});
