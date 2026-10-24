// @ts-check
// "Incoming offers" section of organization.html: accept / reject / mark delivered.
// UI state only — database calls live in js/offers.js.

/** Pending first (needs a decision), then accepted (needs delivery), then the rest. */
const OFFER_ORDER = { pending: 0, accepted: 1, delivered: 2, rejected: 3, cancelled: 4 };

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("orgOffers", (/** @type {string} */ orgId) => ({
    /** @type {IncomingOffer[]} */
    offers: [],
    loading: true,
    error: "",
    /** @type {'action' | 'all'} */
    filter: "action",
    /** @type {string | null} id of the offer being updated */
    busyId: null,

    async init() {
      await this.load();
    },

    async load() {
      this.loading = true;
      this.error = "";
      try {
        const offers = await listIncomingOffers(orgId);
        this.offers = offers.sort((a, b) => OFFER_ORDER[a.status] - OFFER_ORDER[b.status]);
      } catch (error) {
        this.error = friendlyError(error);
      } finally {
        this.loading = false;
      }
    },

    get shown() {
      return this.filter === "all" ? this.offers : this.offers.filter((offer) => offer.status === "pending" || offer.status === "accepted");
    },

    get pendingCount() {
      return this.offers.filter((offer) => offer.status === "pending").length;
    },

    /**
     * "8 bags of Rice 5kg"
     * @param {IncomingOffer} offer
     * @returns {string}
     */
    what(offer) {
      return `${offer.quantity} ${offer.item.unit} of ${offer.item.name}`;
    },

    /**
     * @param {IncomingOffer} offer
     * @param {'accepted' | 'rejected' | 'delivered'} status
     */
    async act(offer, status) {
      const donor = offer.donor?.full_name || "the donor";
      const dialogs = {
        accepted: {
          title: "Accept this offer?",
          message: `Accept ${this.what(offer)} from ${donor}? They'll see your drop-off instructions.`,
          confirmText: "Accept offer",
          danger: false,
          done: "Offer accepted. The donor can now see your drop-off instructions.",
        },
        rejected: {
          title: "Reject this offer?",
          message: `${donor} will see that ${this.what(offer)} wasn't needed.`,
          confirmText: "Reject offer",
          danger: true,
          done: "Offer rejected.",
        },
        delivered: {
          title: "Mark as delivered?",
          message: `Confirm you've received ${this.what(offer)} from ${donor}.`,
          confirmText: "Mark delivered",
          danger: false,
          done: "Marked as delivered. Thank you!",
        },
      };
      const dialog = dialogs[status];
      const ok = await confirmDialog(dialog.message, {
        title: dialog.title,
        confirmText: dialog.confirmText,
        danger: dialog.danger,
      });
      if (!ok) return;

      this.busyId = offer.id;
      try {
        await setOfferStatus(offer.id, status);
        toast(dialog.done);
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.busyId = null;
      }
      await this.load();
      // Item totals changed in the database: refresh the requests' progress bars.
      window.dispatchEvent(new CustomEvent("requests-changed"));
    },
  }));
});
