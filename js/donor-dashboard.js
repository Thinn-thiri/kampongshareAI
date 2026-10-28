// @ts-check
// Donor dashboard (donor.html): browse open requests, offer items, and manage "My offers".
// Three sections, Overview · Find needs · My offers, linked from the top bar (js/auth.js
// DASHBOARD_SECTIONS) and kept in the URL hash, so reloading and Back / Forward work.
// UI state only — database calls live in js/offers.js.

/** @typedef {'overview' | 'find' | 'offers'} DonorSection */

const DONOR_SECTIONS = /** @type {DonorSection[]} */ (["overview", "find", "offers"]);

/**
 * The section in the hash. The Donate button on event.html (?request= / ?org=) opens Find needs.
 * @returns {DonorSection}
 */
function readDonorSection() {
  const hash = /** @type {DonorSection} */ (location.hash.replace(/^#/, ""));
  if (DONOR_SECTIONS.includes(hash)) return hash;
  const params = new URLSearchParams(location.search);
  return params.get("request") || params.get("org") ? "find" : "overview";
}

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("donorDashboard", () => ({
    /** @type {DonorSection} */
    section: readDonorSection(),

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
    /** "My offers" tab: active (pending, accepted) or history (delivered, cancelled, rejected) */
    offerTab: "active",
    /** Finished offers, 20 at a time — loads the first time the History tab opens */
    /** @type {HistoryPager<DonationOffer>} */
    history: historyPager(),
    deliveredCount: 0,

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
      if (this.filterRequestId) return t("donor.linkedRequest");
      if (this.filterOrgId) {
        const name = this.requests.find((r) => r.organization_id === this.filterOrgId)?.organization?.name;
        return name ? t("donor.orgRequests", { name }) : t("donor.thisOrgRequests");
      }
      return "";
    },

    clearFilter() {
      this.filterRequestId = null;
      this.filterOrgId = null;
      history.replaceState(null, "", location.pathname + location.hash);
    },

    async init() {
      try {
        this.profile = await getProfile();
      } catch {
        this.profile = null;
      }
      if (!this.profile?.is_donor) return; // the page guard is redirecting
      window.addEventListener("hashchange", () => {
        this.section = readDonorSection();
        window.scrollTo({ top: 0 });
      });
      // links from event.html (?request= / ?org=): show the section's own address so the top bar marks it
      if (!location.hash && this.section !== "overview") {
        history.replaceState(null, "", `${location.pathname}${location.search}#${this.section}`);
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      }
      const donorId = this.profile.id;
      this.history = historyPager((from, to) => listMyOfferHistory(donorId, from, to), () => t("donor.pastOffers"));
      await Promise.all([this.loadRequests(), this.loadOffers()]);
    },

    /** Consent and 18+ are needed before the database accepts offers (REQUIREMENTS.md 4.2). */
    get needsConsent() {
      return Boolean(this.profile && (!this.profile.consented_at || !this.profile.age_confirmed));
    },

    get activeOfferCount() {
      return this.offers.filter(isActiveOffer).length;
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
        [this.offers, this.deliveredCount] = await Promise.all([listMyOffers(this.profile.id), countMyDeliveredOffers(this.profile.id)]);
        if (this.history.loaded) await this.history.load();
        // top bar badge on "My offers": accepted offers waiting to be dropped off
        window.dispatchEvent(new CustomEvent("dashboard-counts", { detail: { dropoff: this.readyToDropOff.length } }));
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

    /**
     * "Offer" pressed on an AI-suggested match: open that item's offer form below.
     * @param {string} itemId
     */
    async offerFromMatch(itemId) {
      if (this.filterRequestId || this.filterOrgId) this.clearFilter();
      if (this.section !== "find") location.hash = "#find"; // the offer form lives in Find needs
      let item = this.requests.flatMap((r) => r.request_items).find((i) => i.id === itemId);
      if (!item) {
        await this.loadRequests();
        item = this.requests.flatMap((r) => r.request_items).find((i) => i.id === itemId);
      }
      if (!item || item.quantity_remaining <= 0) {
        toast(t("donor.itemNotOpen"), "error");
        return;
      }
      if (this.activeOfferFor(item)) {
        toast(t("donor.alreadyOffered"), "error");
        return;
      }
      this.openOffer(item);
      setTimeout(() => document.getElementById(`offer-qty-${itemId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
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
        toast(t("donor.offerSent"));
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
      const what = t("donor.offerWhat", { quantity: offer.quantity, unit: offer.item?.unit ?? "", item: offer.item?.name ?? t("donor.thisItem") }).replace(/\s+/g, " ");
      const message = offer.status === "accepted" ? t("donor.cancelAcceptedText", { what }) : t("donor.cancelText", { what });
      const ok = await confirmDialog(message, {
        title: t("donor.cancelTitle"),
        confirmText: t("donor.cancelOffer"),
        cancelText: t("common.keepIt"),
        danger: true,
      });
      if (!ok) return;
      this.cancellingId = offer.id;
      try {
        await cancelOffer(offer.id);
        toast(t("donor.cancelled"));
        focusHeading("offers-heading"); // the card may be gone: keep keyboard users in this section
        await Promise.all([this.loadRequests(), this.loadOffers()]);
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.cancellingId = null;
      }
    },

    /** @param {'active' | 'history'} tab */
    showOfferTab(tab) {
      this.offerTab = tab;
      if (tab === "history" && !this.history.loaded) this.history.load();
    },

    /** Accepted offers: the organization is expecting them, so show where to bring them. */
    get readyToDropOff() {
      return this.offers.filter((offer) => offer.status === "accepted");
    },

    offerDisplay,
    offerEndedText,
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
