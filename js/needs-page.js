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
    requestUrgency,
    itemBarStyles,
    itemBarLabel,

    /** @type {DonationRequest[]} */
    requests: [],
    loading: true,
    error: "",

    /** @type {Profile | null} */
    profile: null,
    /** @type {DonationOffer[]} */
    myOffers: [],

    filters: { q: "", category: "", area: "", urgency: "" },

    /** @type {string | null} the item whose offer form is open */
    offerItemId: null,
    /** @type {OfferForm} */
    offerForm: { quantity: "", message: "", foodSafetyConfirmed: false },
    /** @type {OfferErrors} */
    offerErrors: {},
    offerError: "",
    sending: false,
    turningOn: false,
    /** @type {string | null} item highlighted from ?item= */
    focusItemId: null,

    async init() {
      const params = new URLSearchParams(location.search);
      for (const key of NEEDS_URL_KEYS) this.filters[key] = params.get(key) ?? "";
      this.focusItemId = params.get("item");

      try {
        const [requests, profile] = await Promise.all([listOpenRequests(), getProfile().catch(() => null)]);
        this.requests = requests;
        this.profile = profile;
        if (profile?.is_donor) this.myOffers = await listMyOffers(profile.id);
      } catch (error) {
        this.error = friendlyError(error);
      } finally {
        this.loading = false;
      }
      if (this.focusItemId) this.focusItem(this.focusItemId);
    },

    async reload() {
      this.loading = true;
      this.error = "";
      try {
        this.requests = await listOpenRequests();
        if (this.profile?.is_donor) this.myOffers = await listMyOffers(this.profile.id);
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
     * @returns {'visitor' | 'not_individual' | 'turn_on' | 'consent' | 'donor'}
     */
    get viewer() {
      const profile = this.profile;
      if (!profile) return "visitor";
      if (profile.role === "organization" || profile.role === "admin") return "not_individual";
      if (!profile.is_donor) return "turn_on";
      if (!profile.consented_at || !profile.age_confirmed) return "consent";
      return "donor";
    },

    /**
     * @param {string} itemId
     * @returns {string}
     */
    loginHref(itemId) {
      return `/login.html?next=${encodeURIComponent(`/needs.html?item=${itemId}`)}`;
    },

    /**
     * @param {RequestItem} item
     * @returns {DonationOffer | undefined}
     */
    activeOfferFor(item) {
      return this.myOffers.find((offer) => offer.request_item_id === item.id && isActiveOffer(offer));
    },

    /**
     * Back from login (or from an Offer link elsewhere): show that item and open its form.
     * @param {string} itemId
     */
    focusItem(itemId) {
      const visible = this.filtered.some((r) => r.request_items.some((i) => i.id === itemId));
      if (!visible) this.clearFilters();
      const item = this.requests.flatMap((r) => r.request_items).find((i) => i.id === itemId);
      if (!item) {
        toast("That item isn't open for donations any more.", "error");
        return;
      }
      if (this.viewer === "donor" && item.quantity_remaining > 0 && !this.activeOfferFor(item)) this.openOffer(item);
      setTimeout(() => document.getElementById(`item-${itemId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    },

    /** @param {RequestItem} item */
    openOffer(item) {
      this.offerItemId = item.id;
      this.offerForm = { quantity: "", message: "", foodSafetyConfirmed: false };
      this.offerErrors = {};
      this.offerError = "";
      setTimeout(() => document.getElementById(`offer-qty-${item.id}`)?.focus({ preventScroll: true }), 60);
    },

    closeOffer() {
      this.offerItemId = null;
    },

    /** @param {RequestItem} item */
    async sendOffer(item) {
      this.offerError = "";
      this.offerErrors = validateOffer(this.offerForm, item);
      const firstError = Object.keys(this.offerErrors)[0];
      if (firstError) {
        const ids = { quantity: "offer-qty", message: "offer-msg", foodSafety: "offer-food" };
        document.getElementById(`${ids[/** @type {keyof typeof ids} */ (firstError)]}-${item.id}`)?.focus();
        return;
      }
      this.sending = true;
      try {
        await makeOffer(item.id, this.offerForm);
        toast("Your offer was sent. The organization will confirm within 2 days.");
        this.offerItemId = null;
        await this.reload();
      } catch (error) {
        this.offerError = friendlyError(error);
      } finally {
        this.sending = false;
      }
    },

    async turnOnDonating() {
      this.turningOn = true;
      try {
        this.profile = await enableRole("donor");
        if (this.profile) this.myOffers = await listMyOffers(this.profile.id);
        window.dispatchEvent(new CustomEvent("profile-changed"));
        toast("Donating is turned on. You can offer items now.");
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.turningOn = false;
      }
    },
  }));
});
