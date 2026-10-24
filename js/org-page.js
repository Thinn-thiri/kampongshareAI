// @ts-check
// Public organization page (org.html?id=<organization id>, REQUIREMENTS.md 6.5).
// Works without logging in; only approved organizations are shown.

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("orgPage", () => ({
    /** @type {Organization | null} */
    org: null,
    /** @type {DonationRequest[]} */
    requests: [],
    /** @type {VolunteerEvent[]} */
    events: [],
    /** @type {Profile | null} */
    profile: null,
    loading: true,
    notFound: false,
    error: "",
    requestUrgency,
    itemBarStyles,
    itemBarLabel,
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
        const [org, requests, events, profile] = await Promise.all([
          getPublicOrganization(id),
          listOrgOpenRequests(id),
          listOrgUpcomingEvents(id),
          getProfile().catch(() => null),
        ]);
        this.org = org;
        this.notFound = !org;
        this.requests = org ? requests : [];
        this.events = org ? events : [];
        this.profile = profile;
      } catch (error) {
        this.error = friendlyError(error);
      } finally {
        this.loading = false;
      }
      const org = this.org;
      if (org) {
        document.title = `${org.name} · KampongShare`;
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
      location.href = offerHref(itemId, this.profile);
    },
  }));
});
