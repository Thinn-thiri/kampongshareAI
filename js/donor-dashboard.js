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
    ...messageButtons(),
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
    /** @type {DonationOffer | null} the offer in the timeline panel */
    panelOffer: null,
    offeredLine,
    /** @type {Record<string, string[]>} offer id → photo addresses (signed, 1 hour) */
    photos: {},

    /**
     * Loads the donor's own photos for the timeline panel, once.
     * @param {DonationOffer} offer
     */
    async loadPhotos(offer) {
      if (!offer.photo_paths?.length || this.photos[offer.id]) return;
      this.photos = { ...this.photos, [offer.id]: await photoUrls(offer.photo_paths) };
    },
    /** @type {string | null} the delivered offer Pinny thanks (only the first time, REQUIREMENTS.md 12) */
    pinnyOfferId: null,
    offerTracker,
    ...noticeHelpers(),

    /** Filters from event.html's Donate button: ?request=<id> or ?org=<id> */
    filterRequestId: new URLSearchParams(location.search).get("request"),
    filterOrgId: new URLSearchParams(location.search).get("org"),
    /** @type {DonationRequest | null} the linked request (?request=), when its deadline has passed */
    expiredRequest: null,
    DEADLINE_BADGE,

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

    /**
     * The tracker for an offer; in the panel, "Message <organization>" sits under Accepted.
     * @param {DonationOffer} offer
     * @param {boolean} [full]
     */
    trackerFor(offer, full = false) {
      const request = offer.item?.request;
      const orgId = request?.organization_id;
      const messageAction =
        full && orgId && offer.status !== "pending"
          ? { label: t("tracker.offer.messageOrg", { org: request?.organization?.name ?? t("common.organization") }), run: () => this.messageOrg(orgId, t("messages.topicAbout", { title: request?.title ?? "" })) }
          : undefined;
      return offerTracker(offer, { viewer: "donor", messageAction });
    },

    /**
     * Opens the full timeline for one offer.
     * @param {DonationOffer} offer
     * @param {Event} event
     */
    openTimeline(offer, event) {
      this.panelOffer = offer;
      openSidePanel("offer-panel", event.currentTarget);
    },

    /** Pinny says thank you next to the first delivered stamp a donor ever sees (remembered in this browser). */
    thankWithPinny() {
      if (this.pinnyOfferId) return;
      const delivered = this.history.items.find((offer) => offer.status === "delivered");
      if (!delivered) return;
      try {
        if (localStorage.getItem("ks-pinny-thanks")) return;
        localStorage.setItem("ks-pinny-thanks", "1");
      } catch {
        // storage blocked: Pinny shows each time, which is fine
      }
      this.pinnyOfferId = delivered.id;
    },

    clearFilter() {
      this.filterRequestId = null;
      this.expiredRequest = null;
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
      /** @type {any} */ (this).$watch("history.items", () => this.thankWithPinny());
      await Promise.all([this.loadRequests(), this.loadOffers()]);
      // an offer sent from the details panel
      window.addEventListener("offer-sent", () => Promise.all([this.loadRequests(), this.loadOffers()]));
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
        const linked = this.filterRequestId;
        if (linked && !this.requests.some((r) => r.id === linked)) {
          const request = await getOpenRequest({ requestId: linked }).catch(() => null);
          this.expiredRequest = request && isPastDeadline(request) ? request : null;
        }
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

    /**
     * "Offer" pressed on an AI-suggested match: open that request's panel with the item's offer form.
     * @param {string} itemId
     */
    async offerFromMatch(itemId) {
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
      const request = this.requests.find((r) => r.request_items.some((i) => i.id === itemId));
      if (request) openRequestPanel(request, document.activeElement, itemId);
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
  }));
});
