// @ts-check
// Public organization page (org.html?id=<organization id>, REQUIREMENTS.md 6.5).
// Works without logging in; only approved organizations are shown.

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("orgPage", () => ({
    ...publicViewer(),
    ...messageButtons(),
    /** @type {Organization | null} */
    org: null,
    /** @type {DonationRequest[]} */
    requests: [],
    /** @type {VolunteerEvent[]} */
    events: [],
    loading: true,
    notFound: false,
    error: "",
    ...noticeHelpers(),
    formatEventTime,

    async init() {
      const id = new URLSearchParams(location.search).get("id") ?? "";
      // Organization ids are UUIDs; anything else can't be one.
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        this.notFound = true;
        this.loading = false;
        return;
      }
      try {
        const [org, requests, events] = await Promise.all([
          getPublicOrganization(id),
          listOrgOpenRequests(id),
          listOrgUpcomingEvents(id),
          this.loadViewer(),
        ]);
        this.org = org;
        this.notFound = !org;
        this.requests = org ? requests : [];
        this.events = org ? events : [];
        if (org && !["visitor", "staff"].includes(this.volunteerMode())) await this.loadMyApplications().catch(() => {});
      } catch (error) {
        this.error = friendlyError(error);
      } finally {
        this.loading = false;
      }
      const org = this.org;
      if (org) {
        document.title = `${org.name} · KampongShare`;
        // the title is now what the organization wrote, so a language switch mustn't replace it
        document.querySelector("title")?.removeAttribute("data-i18n");
        if (org.latitude != null && org.longitude != null) {
          const lat = org.latitude;
          const lng = org.longitude;
          setTimeout(() => {
            const element = document.getElementById("org-map");
            if (element) createPinMap(element, { lat, lng, label: org.name });
          }, 0);
        }
      }
    },

    /**
     * Offer → needs.html with that item (visitors log in first).
     * @param {string} itemId
     */
    goOffer(itemId) {
      location.href = offerHref(itemId, this.viewer);
    },
  }));
});
