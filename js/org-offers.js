// @ts-check
// "Incoming offers" section of organization.html: a board New · Accepted · Delivered with the button
// that moves each offer on (accept / reject / mark delivered), History for rejected and cancelled
// offers, and the offer's full timeline (REQUIREMENTS.md 12). UI state only — database calls live in js/offers.js.

/** Pending first (needs a decision), then accepted (needs delivery), then the rest. */
const OFFER_ORDER = { pending: 0, accepted: 1, delivered: 2, rejected: 3, cancelled: 4 };

/** @typedef {'pending' | 'accepted' | 'delivered'} BoardColumn */

/** The board's columns, in order (words as getters, so a language switch redraws them). */
const BOARD_COLUMNS = labelledOptions(/** @type {Record<BoardColumn, string>} */ ({ pending: "orgDash.boardNew", accepted: "orgDash.boardAccepted", delivered: "orgDash.boardDelivered" }));

/** Delivered offers shown before "Show more". */
const DELIVERED_PAGE = 10;

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("orgOffers", (/** @type {string} */ orgId) => ({
    ...messageButtons(),
    /** @type {IncomingOffer[]} */
    offers: [],
    loading: true,
    error: "",
    /** Active (the board: new, accepted, delivered) or History (rejected, cancelled) */
    /** @type {'active' | 'history'} */
    filter: "active",
    /** @type {HistoryPager<IncomingOffer>} rejected and cancelled offers, newest first, 20 at a time */
    history: historyPager(),
    /** @type {string | null} id of the offer being updated */
    busyId: null,
    columns: BOARD_COLUMNS,
    /** @type {BoardColumn} the column shown on phones (the columns become tabs) */
    boardTab: "pending",
    deliveredShown: DELIVERED_PAGE,
    /** @type {IncomingOffer | null} the offer in the timeline panel */
    panelOffer: null,
    timeAgo,

    async init() {
      this.history = historyPager(async (from, to) => this.pastOffers.slice(from, to + 1), () => t("orgDash.pastOffers"));
      await this.load();
    },

    async load() {
      this.loading = true;
      this.error = "";
      try {
        const offers = await listIncomingOffers(orgId);
        this.offers = offers.sort((a, b) => OFFER_ORDER[a.status] - OFFER_ORDER[b.status]);
        if (this.history.loaded) await this.history.load();
      } catch (error) {
        this.error = friendlyError(error);
      } finally {
        this.loading = false;
      }
    },

    get activeOffers() {
      return this.offers.filter((offer) => offer.status === "pending" || offer.status === "accepted");
    },

    get pastOffers() {
      return this.offers
        .filter((offer) => offer.status === "rejected" || offer.status === "cancelled")
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    },

    /**
     * One column of the board: new and accepted oldest first (first come, first served), delivered newest first.
     * @param {BoardColumn} key
     * @returns {IncomingOffer[]}
     */
    columnOffers(key) {
      const list = this.offers.filter((offer) => offer.status === key);
      if (key !== "delivered") return list.sort((a, b) => a.created_at.localeCompare(b.created_at));
      return list.sort((a, b) => (b.delivered_at ?? b.updated_at).localeCompare(a.delivered_at ?? a.updated_at)).slice(0, this.deliveredShown);
    },

    /** @param {BoardColumn} key */
    columnCount(key) {
      return this.offers.filter((offer) => offer.status === key).length;
    },

    showMoreDelivered() {
      this.deliveredShown += DELIVERED_PAGE;
    },

    /**
     * Phones: the columns are tabs — ← → move between them, Home / End jump to the ends.
     * @param {KeyboardEvent} event
     */
    onBoardKey(event) {
      const keys = ["ArrowLeft", "ArrowRight", "Home", "End"]; // i18n-ignore (key names)
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const order = BOARD_COLUMNS.map((c) => c.value);
      const at = order.indexOf(this.boardTab);
      const next = event.key === "Home" ? 0 : event.key === "End" ? order.length - 1 : (at + (event.key === "ArrowRight" ? 1 : -1) + order.length) % order.length; // i18n-ignore
      this.boardTab = order[next];
      /** @type {any} */ (this).$nextTick(() => document.getElementById(`board-tab-${order[next]}`)?.focus());
    },

    /**
     * The offer's tracker as the organization sees it.
     * @param {IncomingOffer} offer
     */
    trackerFor(offer) {
      return offerTracker(offer, { viewer: "org" });
    },

    /**
     * @param {IncomingOffer} offer
     * @param {Event} event
     */
    openTimeline(offer, event) {
      this.panelOffer = offer;
      openSidePanel("org-offer-panel", event.currentTarget);
    },

    /** @param {'active' | 'history'} filter */
    showFilter(filter) {
      this.filter = filter;
      if (filter === "history") this.history.load();
    },

    offerEndedText,

    get pendingCount() {
      return this.offers.filter((offer) => offer.status === "pending").length;
    },

    /**
     * "8 bags of Rice 5kg"
     * @param {IncomingOffer} offer
     * @returns {string}
     */
    what(offer) {
      return t("orgDash.offerWhat", { quantity: offer.quantity, unit: offer.item.unit, item: offer.item.name });
    },

    /**
     * Sends the rejection note to the donor as a message. If messaging fails, the rejection still stands
     * (the note is on their timeline anyway) and a toast says so.
     * @param {IncomingOffer} offer
     * @param {string} note
     */
    async tellDonor(offer, note) {
      try {
        const conversationId = await startConversation(orgId, offer.donor_id, t("messages.topicOffer", { what: this.what(offer) }));
        await sendMessage(conversationId, t("orgDash.rejectMessage", { what: this.what(offer), note }));
      } catch {
        toast(t("orgDash.rejectMessageFailed"), "error");
      }
    },

    /**
     * Needed vs offered, side by side on the card: "Needed: 24–28 cm · Like new or better".
     * @param {IncomingOffer} offer
     */
    neededLine(offer) {
      return itemSpecLine(offer.item);
    },

    /** "Like new · 26 cm pot with lid" @param {IncomingOffer} offer */
    offeredLine(offer) {
      return offeredLine(offer);
    },

    /** @type {Record<string, string[]>} offer id → photo addresses (signed, 1 hour) */
    photos: {},

    /**
     * Loads an offer's photos once (private: signed addresses only this organization can get).
     * @param {IncomingOffer} offer
     */
    async loadPhotos(offer) {
      if (!offer.photo_paths?.length || this.photos[offer.id]) return;
      this.photos = { ...this.photos, [offer.id]: await photoUrls(offer.photo_paths) };
    },

    /** "Message donor": a private conversation about this offer. @param {IncomingOffer} offer */
    messageDonor(offer) {
      if (offer.donor_id) this.messageTo(orgId, offer.donor_id, t("messages.topicOffer", { what: this.what(offer) }));
    },

    /**
     * @param {IncomingOffer} offer
     * @param {'accepted' | 'rejected' | 'delivered'} status
     */
    async act(offer, status) {
      const donor = offer.donor?.full_name || t("orgDash.theDonor");
      const dialogs = {
        accepted: {
          title: t("orgDash.acceptTitle"),
          message: t("orgDash.acceptText", { what: this.what(offer), donor }),
          confirmText: t("orgDash.acceptConfirm"),
          danger: false,
          done: t("orgDash.accepted"),
        },
        rejected: {
          title: t("orgDash.rejectTitle"),
          message: t("orgDash.rejectText", { what: this.what(offer), donor }),
          confirmText: t("orgDash.rejectConfirm"),
          danger: true,
          done: t("orgDash.offerRejected"),
        },
        delivered: {
          title: t("orgDash.deliveredTitle"),
          message: t("orgDash.deliveredText", { what: this.what(offer), donor }),
          confirmText: t("orgDash.markDelivered"),
          danger: false,
          done: t("orgDash.delivered"),
        },
      };
      const dialog = dialogs[status];
      let note = "";
      const mismatch = t("orgDash.rejectMismatch");
      if (status === "rejected") {
        // an optional note the donor sees on their offer's timeline; one tap for the usual reasons
        const answer = await reasonDialog(dialog.message, {
          title: dialog.title,
          label: t("orgDash.rejectNoteLabel"),
          maxLength: REASON_MAX_LENGTH,
          confirmText: dialog.confirmText,
          danger: true,
          quickReasons: [mismatch, t("orgDash.rejectEnough"), t("orgDash.rejectFood")],
        });
        if (answer === null) return;
        note = answer;
      } else {
        const ok = await confirmDialog(dialog.message, {
          title: dialog.title,
          confirmText: dialog.confirmText,
          danger: dialog.danger,
        });
        if (!ok) return;
      }

      this.busyId = offer.id;
      let moved = false;
      try {
        await setOfferStatus(offer.id, status, note);
        toast(dialog.done);
        // "Doesn't match the size or condition": also tell the donor in a message, so they know why
        if (status === "rejected" && note.startsWith(mismatch) && offer.donor_id) {
          await this.tellDonor(offer, note);
        }
        if (this.panelOffer?.id === offer.id) closeSidePanel("org-offer-panel");
        if (status !== "rejected") this.boardTab = status;
        moved = true;
        await scoreRequest(offer.item.request_id); // how much is still needed changed
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.busyId = null;
      }
      await this.load();
      // the card moved to another column (or History): keep keyboard users where it went
      if (moved) /** @type {any} */ (this).$nextTick(() => focusHeading(status === "rejected" ? "offers-heading" : `board-${status}-heading`));
      // Item totals changed in the database: refresh the requests' progress bars.
      window.dispatchEvent(new CustomEvent("requests-changed"));
    },
  }));
});
