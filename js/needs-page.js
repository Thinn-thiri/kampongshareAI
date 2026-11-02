// @ts-check
// Browse needs (needs.html): all open requests with filters, and Offer per item (REQUIREMENTS.md 6.3).
// Works without logging in. Visitors who press Offer log in and come back to that item with the
// offer form open (?item=<id>). Category, area and urgency filters live in the URL query;
// the free-text search stays on the page only, so nothing a visitor types ends up in a URL.

const NEEDS_FILTER_KEYS = /** @type {const} */ (["q", "category", "area", "urgency"]);
/** Filters that are safe to keep in the address bar (fixed choices, never typed text). */
const NEEDS_URL_KEYS = /** @type {const} */ (["category", "area", "urgency"]);

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("needsPage", () => ({
    categories: ITEM_CATEGORIES.filter((c) => c.value !== "other"),
    urgencies: URGENCY_OPTIONS,
    areas: SG_AREAS,
    ...noticeHelpers(),

    /** @type {DonationRequest[]} */
    ...publicViewer(),
    ...messageButtons(),
    requests: [],
    loading: true,
    error: "",

    /** @type {Profile | null} */
    profile: null,

    filters: { q: "", category: "", area: "", urgency: "" },

    /** @type {string | null} item highlighted from ?item= */
    focusItemId: null,
    /** @type {number | null} */
    focusQuantity: null,
    /** @type {DonationRequest | null} the linked request, when its deadline has passed */
    expiredRequest: null,
    DEADLINE_BADGE,

    async init() {
      const params = new URLSearchParams(location.search);
      for (const key of NEEDS_URL_KEYS) this.filters[key] = params.get(key) ?? "";
      this.focusItemId = params.get("item");
      // Pinny's draft passes the amount it prepared (a number only)
      this.focusQuantity = Number.parseInt(params.get("qty") ?? "", 10) || null;

      try {
        const [requests, profile] = await Promise.all([listOpenRequests(), getProfile().catch(() => null), this.loadViewer()]);
        this.requests = requests;
        this.profile = profile;
      } catch (error) {
        this.error = friendlyError(error);
      } finally {
        this.loading = false;
      }
      if (this.focusItemId) this.focusItem(this.focusItemId);
      // an offer sent from the details panel: the numbers on the notices change
      window.addEventListener("offer-sent", () => this.reload());
    },

    async reload() {
      this.loading = true;
      this.error = "";
      try {
        this.requests = await listOpenRequests();
      } catch (error) {
        this.error = friendlyError(error);
      } finally {
        this.loading = false;
      }
    },

    get filtered() {
      const q = this.filters.q.trim().toLowerCase();
      const area = this.filters.area.toLowerCase();
      return this.requests.filter((request) => {
        if (this.filters.urgency && urgencyWordOf(request) !== this.filters.urgency) return false;
        if (area && !(request.organization?.address ?? "").toLowerCase().includes(area)) return false;
        if (this.filters.category && !request.request_items.some((item) => item.category === this.filters.category)) return false;
        if (q) {
          const text = [request.title, ...request.request_items.map((item) => item.name)].join(" ").toLowerCase();
          if (!text.includes(q)) return false;
        }
        return true;
      });
    },

    get hasFilters() {
      return NEEDS_FILTER_KEYS.some((key) => this.filters[key]);
    },

    /** Keeps the chosen filters (not the typed search) in the address bar so the view can be shared or reloaded. */
    syncUrl() {
      const params = new URLSearchParams();
      for (const key of NEEDS_URL_KEYS) if (this.filters[key].trim()) params.set(key, this.filters[key].trim());
      const query = params.toString();
      history.replaceState(null, "", query ? `${location.pathname}?${query}` : location.pathname);
    },

    clearFilters() {
      this.filters = { q: "", category: "", area: "", urgency: "" };
      this.syncUrl();
    },

    /**
     * What the Offer button does for whoever is looking (REQUIREMENTS.md 6.3 / 6.6a).
     * "staff" (organizations and admins) see what donors see, without Offer buttons.
     * @returns {'visitor' | 'staff' | 'turn_on' | 'consent' | 'donor'}
     */
    get mode() {
      return this.donorMode();
    },

    /**
     * Back from login (or from an Offer link elsewhere): open that request's panel at the item, with its form open.
     * @param {string} itemId
     */
    async focusItem(itemId) {
      const visible = this.filtered.some((r) => r.request_items.some((i) => i.id === itemId));
      if (!visible) this.clearFilters();
      const item = this.requests.flatMap((r) => r.request_items).find((i) => i.id === itemId);
      if (!item) {
        const request = await getOpenRequest({ itemId }).catch(() => null);
        if (request && isPastDeadline(request)) {
          this.expiredRequest = request;
          setTimeout(() => document.getElementById("expired-request")?.focus(), 50);
        } else {
          toast(t("needs.notOpen"), "error");
        }
        return;
      }
      const request = this.requests.find((r) => r.request_items.some((i) => i.id === itemId));
      if (request) openRequestPanel(request, null, itemId, this.focusQuantity);
    },

    async turnOnDonating() {
      this.turningOn = true;
      try {
        this.viewer = await turnOnRole("donor");
        this.profile = await getProfile();
        toast(t("viewer.donatingOn"));
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.turningOn = false;
      }
    },
  }));
});
