// @ts-check
// Summary cards at the top of organization.html (REQUIREMENTS.md section 3: dashboards start with
// 3–4 stat cards). Reuses the same data functions as the sections below; refreshes when they change.

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("orgStats", (/** @type {string} */ orgId) => ({
    /** @type {{ openRequests: number, itemsNeeded: number, offersWaiting: number, upcomingEvents: number } | null} */
    stats: null,
    error: "",

    async init() {
      await this.load();
    },

    async load() {
      this.error = "";
      try {
        const [requests, offers, events] = await Promise.all([listMyRequests(orgId), listIncomingOffers(orgId), listMyEvents(orgId)]);
        const open = requests.filter((r) => r.status === "open");
        this.stats = {
          openRequests: open.length,
          itemsNeeded: open.reduce((sum, r) => sum + r.request_items.reduce((s, i) => s + i.quantity_remaining, 0), 0),
          offersWaiting: offers.filter((o) => o.status === "pending").length,
          upcomingEvents: events.filter((e) => e.approval === "approved" && (e.status === "upcoming" || e.status === "ongoing") && isNotOver(e)).length,
        };
      } catch (error) {
        this.error = friendlyError(error);
      }
    },
  }));
});
