// @ts-check
// Home page (index.html): impact numbers and the most urgent needs (REQUIREMENTS.md 6.2).
// Works without logging in. The events map is js/public-events.js; the matching box is js/match.js;
// the impact numbers come from js/stats.js.

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("homePage", () => ({
    ...publicViewer(),
    statCards: STAT_CARDS,
    /** @type {Record<string, number> | null} */
    stats: null,
    statsError: "",

    /** @type {DonationRequest[]} */
    urgent: [],
    loadingUrgent: true,
    urgentError: "",

    /** @type {number | null} admins only: everything waiting for review */
    adminWaiting: null,

    requestUrgency,
    itemBarStyles,
    itemBarLabel,

    async init() {
      const viewerLoaded = this.loadViewer().then(async () => {
        if (this.isAdmin()) this.adminWaiting = await getAdminWaitingTotal().catch(() => null);
        if (this.volunteerMode() !== "visitor" && this.volunteerMode() !== "staff") await this.loadMyApplications().catch(() => {});
      });
      await Promise.all([viewerLoaded, this.loadStats(), this.loadUrgent()]);
    },

    /**
     * Hero buttons for logged-in people: their dashboard plus one helpful next step per role.
     * @returns {{ href: string, label: string }[]}
     */
    heroLinks() {
      const viewer = this.viewer;
      if (!viewer) return [];
      /** @type {{ href: string, label: string }[]} */
      const links = [{ href: viewer.dashboardUrl, label: "Go to my dashboard" }];
      if (viewer.role === "organization") links.push({ href: "/organization.html?new=request", label: "Post a request" });
      else if (viewer.role === "admin") {
        const waiting = this.adminWaiting;
        const count = waiting === null ? "" : waiting === 0 ? " (nothing waiting)" : ` (${waiting} waiting)`;
        links.push({ href: "/admin.html#review", label: `Review queue${count}` });
      } else {
        if (viewer.isDonor) links.push({ href: "/needs.html", label: "Browse needs" });
        if (viewer.isVolunteer) links.push({ href: "/volunteer.html#events-heading", label: "Find events" });
      }
      return links;
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
      if (this.donorMode() === "turn_on") {
        document.getElementById("turn-on-donating")?.focus();
        toast("Turn on donating first — it's one tap.", "error");
        return;
      }
      location.href = offerHref(itemId, this.viewer);
    },
  }));
});
