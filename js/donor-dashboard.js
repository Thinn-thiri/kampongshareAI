// @ts-check
// Donor dashboard (donor.html): browse open requests, offer items, and manage "My offers".
// UI state only — database calls live in js/offers.js.

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("donorDashboard", () => ({
    /** @type {Profile | null} */
    profile: null,

    /** @type {DonationRequest[]} */
    requests: [],
    loadingRequests: true,
    requestsError: "",

    /** @type {DonationOffer[]} */
    offers: [],
    loadingOffers: true,
    offersError: "",
    /** @type {string | null} id of the offer being cancelled */
    cancellingId: null,

    /** @type {string | null} the item whose offer form is open */
    offerItemId: null,
    /** @type {OfferForm} */
    offerForm: { quantity: "", message: "", foodSafetyConfirmed: false },
    /** @type {OfferErrors} */
    offerErrors: {},
    offerError: "",
    sending: false,

    /** Filters from event.html's Donate button: ?request=<id> or ?org=<id> */
    filterRequestId: new URLSearchParams(location.search).get("request"),
    filterOrgId: new URLSearchParams(location.search).get("org"),

    get shownRequests() {
      if (this.filterRequestId) return this.requests.filter((r) => r.id === this.filterRequestId);
      if (this.filterOrgId) return this.requests.filter((r) => r.organization_id === this.filterOrgId);
      return this.requests;
    },

    get filterText() {
      if (this.filterRequestId) return "Showing the request linked to this event.";
      if (this.filterOrgId) {
        const name = this.requests.find((r) => r.organization_id === this.filterOrgId)?.organization?.name;
        return name ? `Showing open requests from ${name}.` : "Showing this organization's open requests.";
      }
      return "";
    },

    clearFilter() {
      this.filterRequestId = null;
      this.filterOrgId = null;
      history.replaceState(null, "", location.pathname);
    },

    async init() {
      try {
        this.profile = await getProfile();
      } catch {
        this.profile = null;
      }
      if (!this.profile?.is_donor) return; // the page guard is redirecting
      await Promise.all([this.loadRequests(), this.loadOffers()]);
    },

    /** Consent and 18+ are needed before the database accepts offers (REQUIREMENTS.md 4.2). */
    get needsConsent() {
      return Boolean(this.profile && (!this.profile.consented_at || !this.profile.age_confirmed));
    },

    get activeOfferCount() {
      return this.offers.filter(isActiveOffer).length;
    },

    get deliveredCount() {
      return this.offers.filter((offer) => offer.status === "delivered").length;
    },

    async loadRequests() {
      this.loadingRequests = true;
      this.requestsError = "";
      try {
        this.requests = await listOpenRequests();
      } catch (error) {
        this.requestsError = friendlyError(error);
      } finally {
        this.loadingRequests = false;
      }
    },

    async loadOffers() {
      if (!this.profile) return;
      this.loadingOffers = true;
      this.offersError = "";
      try {
        this.offers = await listMyOffers(this.profile.id);
      } catch (error) {
        this.offersError = friendlyError(error);
      } finally {
        this.loadingOffers = false;
      }
    },

    /**
     * The donor's active offer on this item, if any (one active offer per item).
     * @param {RequestItem} item
     * @returns {DonationOffer | undefined}
     */
    activeOfferFor(item) {
      return this.offers.find((offer) => offer.request_item_id === item.id && isActiveOffer(offer));
    },

    /** @param {RequestItem} item */
    openOffer(item) {
      this.offerItemId = item.id;
      this.offerForm = { quantity: "", message: "", foodSafetyConfirmed: false };
      this.offerErrors = {};
      this.offerError = "";
      setTimeout(() => document.getElementById(`offer-qty-${item.id}`)?.focus(), 0);
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
        await Promise.all([this.loadRequests(), this.loadOffers()]);
      } catch (error) {
        this.offerError = friendlyError(error);
      } finally {
        this.sending = false;
      }
    },

    /** @param {DonationOffer} offer */
    async cancel(offer) {
      const what = `${offer.quantity} ${offer.item?.unit ?? ""} of ${offer.item?.name ?? "this item"}`.replace(/\s+/g, " ");
      const message =
        offer.status === "accepted"
          ? `The organization has accepted this offer and is expecting ${what}. Cancel only if you can't bring it.`
          : `Your offer of ${what} will be withdrawn.`;
      const ok = await confirmDialog(message, { title: "Cancel this offer?", confirmText: "Cancel offer", cancelText: "Keep it", danger: true });
      if (!ok) return;
      this.cancellingId = offer.id;
      try {
        await cancelOffer(offer.id);
        toast("Your offer was cancelled.");
        await Promise.all([this.loadRequests(), this.loadOffers()]);
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.cancellingId = null;
      }
    },

    offerDisplay,
    isActiveOffer,

    /**
     * Widths for the progress bar: received (solid) and promised-but-not-received (striped).
     * @param {RequestItem} item
     * @returns {{ received: string, promised: string }}
     */
    barWidths(item) {
      const needed = Math.max(item.quantity_needed, 1);
      const received = Math.min(item.quantity_received / needed, 1) * 100;
      const promised = Math.max(Math.min((item.quantity_committed - item.quantity_received) / needed * 100, 100 - received), 0);
      return { received: `width: ${received}%`, promised: `width: ${promised}%` };
    },

    /**
     * @param {string} value
     * @returns {string}
     */
    urgencyLabel(value) {
      return URGENCY_OPTIONS.find((option) => option.value === value)?.label ?? value;
    },
  }));
});
