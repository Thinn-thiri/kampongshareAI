// @ts-check
// Admin dashboard (admin.html, REQUIREMENTS.md section 7): three sections, Overview · To review · Browse,
// reached from the top bar (js/auth.js topLinks).
// UI state only — database calls live in js/admin-data.js and the shared data files.
// The place is kept in the URL hash (#overview, #review/requests, #browse/offers?view=history),
// so reloading keeps it and the browser's back / forward move between tabs.

/** @typedef {'overview' | 'review' | 'browse'} AdminTab */

const ADMIN_TABS = labelledOptions(/** @type {Record<AdminTab, string>} */ ({ overview: "nav.overview", review: "nav.toReview", browse: "nav.browse" }));

const BROWSE_VIEWS = labelledOptions(/** @type {Record<BrowseView, string>} */ ({ active: "common.active", history: "common.history", all: "common.all" }));

/** Days shown in "Recently closed or cancelled". */
const RECENT_DAYS = 7;

/**
 * Reads the hash: "#review/requests?item=<id>" → { tab, sub, params }.
 * Old links (?queue=requests&tab=open, from before the redesign) are turned into hashes.
 * @returns {{ tab: AdminTab, sub: string, params: URLSearchParams }}
 */
function readAdminRoute() {
  const legacy = new URLSearchParams(location.search);
  const queue = legacy.get("queue");
  if (queue && !location.hash) {
    const tab = legacy.get("tab");
    const hash =
      queue === "offers" || (queue === "requests" && tab === "open") || (queue === "organizations" && tab === "approved")
        ? `#browse/${queue}?view=active`
        : `#review/${queue === "applications" ? "volunteers" : queue}`;
    history.replaceState(null, "", location.pathname + hash);
  }
  const [path, query = ""] = location.hash.replace(/^#/, "").split("?");
  const [tab, sub = ""] = path.split("/");
  const known = ADMIN_TABS.some((t) => t.value === tab);
  return { tab: known ? /** @type {AdminTab} */ (tab) : "overview", sub, params: new URLSearchParams(query) };
}

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("adminDashboard", () => {
    // Kept outside Alpine's reactive state: Leaflet doesn't work through proxies.
    /** @type {HTMLElement | null} the button that opened the details panel (focus goes back to it) */
    let panelOpener = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let searchTimer;

    return {
      reviewKinds: REVIEW_KINDS,
      browseKinds: BROWSE_KINDS,
      browseViews: BROWSE_VIEWS,
      statCards: STAT_CARDS,
      urgencies: URGENCY_OPTIONS,

      /** @type {AdminTab} */
      tab: "overview",
      /** @type {ReviewKind} */
      reviewKind: "organizations",
      /** @type {BrowseKind} */
      browseKind: "organizations",
      /** @type {BrowseView} */
      browseView: "active",
      browseSearch: "",

      /** Everything waiting for review, per kind (counts come from these lists). */
      /** @type {Record<ReviewKind, ReviewItem[]>} */
      review: { organizations: [], requests: [], events: [], volunteers: [] },
      reviewLoading: true,
      reviewError: "",

      /** @type {BrowseRow[]} */
      recent: [],
      recentLoading: true,
      recentError: "",

      /** @type {number | null} reported messages waiting (null while loading) */
      openReports: null,

      /** @type {Record<string, number> | null} */
      stats: null,
      statsError: "",

      /** @type {HistoryPager<BrowseRow>} */
      browse: historyPager(),

      /** @type {ReviewItem | null} the item in the details panel */
      panelItem: null,
      /** @type {BrowseRow | null} the request being edited in the panel */
      editRow: null,
      /** @type {{ title: string, description: string, urgency: Urgency, deadline: string }} */
      reqForm: { title: "", description: "", urgency: "medium", deadline: "" },
      /** @type {Record<string, string>} */
      reqFormErrors: {},
      savingReq: false,

      /** @type {string | null} id of the item or row being worked on */
      busyId: null,

      async init() {
        window.addEventListener("hashchange", () => this.applyRoute());
        // the top bar shows the waiting count next to "To review"
        /** @type {any} */ (this).$watch("totalWaiting", (/** @type {number} */ total) => window.dispatchEvent(new CustomEvent("dashboard-counts", { detail: { review: total } })));
        this.applyRoute();
        await Promise.all([this.loadReview(), this.loadRecent(), this.loadStats(), this.loadOpenReports()]);
        window.dispatchEvent(new CustomEvent("dashboard-counts", { detail: { review: this.totalWaiting } }));
        this.openItemFromRoute();
      },

      // ---------- tabs and the URL hash ----------

      /** Shows whatever the hash says (also runs on back / forward). */
      applyRoute() {
        const { tab, sub, params } = readAdminRoute();
        this.tab = tab;
        if (tab === "review" && REVIEW_KINDS.some((k) => k.value === sub)) this.reviewKind = /** @type {ReviewKind} */ (sub);
        if (tab === "browse") {
          // older links: #browse/volunteers?type=applications is now its own sub-tab
          const target = sub === "volunteers" && params.get("type") === "applications" ? "applications" : sub;
          const kind = BROWSE_KINDS.some((k) => k.value === target) ? /** @type {BrowseKind} */ (target) : this.browseKind;
          const view = BROWSE_VIEWS.some((v) => v.value === params.get("view")) ? /** @type {BrowseView} */ (params.get("view")) : "active";
          const search = params.get("q") ?? "";
          const changed = kind !== this.browseKind || view !== this.browseView || search !== this.browseSearch || !this.browse.loaded;
          Object.assign(this, { browseKind: kind, browseView: view, browseSearch: search });
          if (changed) this.reloadBrowse();
        }
        if (tab === "review") this.openItemFromRoute();
      },

      /**
       * Moves to a tab by changing the hash (a new history entry, so Back works).
       * @param {AdminTab} tab
       * @param {string} [sub]
       * @param {Record<string, string>} [params]
       */
      go(tab, sub = "", params = {}) {
        const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
        const hash = `#${tab}${sub ? `/${sub}` : ""}${query ? `?${query}` : ""}`;
        if (location.hash !== hash) location.hash = hash;
        else this.applyRoute();
      },

      browseParams() {
        return { view: this.browseView, q: this.browseSearch.trim() };
      },

      /**
       * Tabs pattern: ← → move and select, Home / End jump to the ends (roving tabindex).
       * @param {KeyboardEvent} event
       */
      onTabKey(event) {
        const keys = ["ArrowLeft", "ArrowRight", "Home", "End"]; // i18n-ignore (key names)
        if (!keys.includes(event.key)) return;
        event.preventDefault();
        const list = /** @type {HTMLElement} */ (event.currentTarget);
        const tabs = /** @type {HTMLElement[]} */ ([...list.querySelectorAll('[role="tab"]')]);
        const at = tabs.indexOf(/** @type {HTMLElement} */ (document.activeElement));
        const next =
          event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (at + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; // i18n-ignore
        tabs[next].focus();
        tabs[next].click();
      },

      // ---------- counts ----------

      /** @param {ReviewKind} kind */
      reviewCount(kind) {
        return this.review[kind].length;
      },

      get totalWaiting() {
        return REVIEW_KINDS.reduce((sum, kind) => sum + this.review[kind.value].length, 0);
      },

      /** The 5 oldest things waiting, of any kind. */
      get waitingLongest() {
        return REVIEW_KINDS.flatMap((kind) => this.review[kind.value])
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          .slice(0, 5);
      },

      waitingText,
      urgencyName,
      categoryName,
      formatAvailability,
      formatEventTime,

      // ---------- loading ----------

      async loadReview() {
        this.reviewLoading = true;
        this.reviewError = "";
        try {
          const lists = await Promise.all(REVIEW_KINDS.map((kind) => loadReviewItems(kind.value)));
          REVIEW_KINDS.forEach((kind, index) => (this.review[kind.value] = lists[index]));
        } catch (error) {
          this.reviewError = friendlyError(error);
        } finally {
          this.reviewLoading = false;
        }
      },

      async loadOpenReports() {
        try {
          this.openReports = await countOpenReports();
        } catch {
          this.openReports = null;
        }
      },

      async loadRecent() {
        this.recentLoading = true;
        this.recentError = "";
        try {
          this.recent = (await listRecentlyClosed(RECENT_DAYS)).slice(0, 10);
        } catch (error) {
          this.recentError = friendlyError(error);
        } finally {
          this.recentLoading = false;
        }
      },

      async loadStats() {
        this.statsError = "";
        try {
          this.stats = await getPublicStats();
        } catch (error) {
          this.statsError = friendlyError(error);
        }
      },

      // ---------- To review ----------

      /** "Waiting longest" links here with ?item=<id>: open that item's panel. */
      openItemFromRoute() {
        const { tab, params } = readAdminRoute();
        const id = params.get("item");
        if (tab !== "review" || !id || this.reviewLoading) return;
        const item = this.review[this.reviewKind].find((i) => i.id === id);
        history.replaceState(null, "", `#review/${this.reviewKind}`);
        if (item) setTimeout(() => this.openPanel(item, document.getElementById(`view-${item.key}`)), 0);
      },

      /**
       * @param {ReviewItem} item
       * @param {HTMLElement | null} opener
       */
      openPanel(item, opener) {
        panelOpener = opener;
        this.editRow = null;
        this.panelItem = item;
        const dialog = /** @type {HTMLDialogElement} */ (document.getElementById("details-panel"));
        if (!dialog.open) dialog.showModal();
        setTimeout(() => {
          document.getElementById("panel-title")?.focus();
          const place = item.raw;
          const element = document.getElementById("panel-map");
          if (element && place.latitude != null && place.longitude != null) {
            createPinMap(element, { lat: place.latitude, lng: place.longitude, label: item.title });
          }
        }, 50);
      },

      closePanel() {
        const dialog = /** @type {HTMLDialogElement} */ (document.getElementById("details-panel"));
        if (dialog.open) dialog.close();
      },

      /** Runs when the panel closes (button, Escape or backdrop): clear it and put focus back. */
      onPanelClosed() {
        this.panelItem = null;
        this.editRow = null;
        if (panelOpener?.isConnected) panelOpener.focus();
        panelOpener = null;
      },

      /** Clicking the dimmed area outside the panel closes it. @param {MouseEvent} event */
      onPanelClick(event) {
        if (event.target === event.currentTarget) this.closePanel();
      },

      /** @param {ReviewItem} item */
      async approve(item) {
        this.busyId = item.id;
        try {
          toast(await approveReviewItem(item));
          this.removeReviewed(item);
        } catch (error) {
          toast(friendlyError(error), "error");
        } finally {
          this.busyId = null;
        }
      },

      /** @param {ReviewItem} item */
      async reject(item) {
        const wording = rejectWording(item);
        let note = "";
        if (item.subkind === "application") {
          // the rules have no note for event applications
          const ok = await confirmDialog(wording.message, { title: wording.title, confirmText: t("common.reject"), danger: true });
          if (!ok) return;
        } else {
          const reason = await reasonDialog(wording.message, {
            title: wording.title,
            label: t("admin.noteLabel"),
            required: true,
            maxLength: ADMIN_NOTE_MAX,
            quickReasons: quickRejectReasons(),
            confirmText: t("common.reject"),
            danger: true,
          });
          if (reason === null) return;
          note = reason;
        }
        this.busyId = item.id;
        try {
          toast(await rejectReviewItem(item, note));
          this.removeReviewed(item);
        } catch (error) {
          toast(friendlyError(error), "error");
        } finally {
          this.busyId = null;
        }
      },

      /**
       * After Approve / Reject: the card goes, counts update, focus moves on.
       * @param {ReviewItem} item
       */
      removeReviewed(item) {
        const list = this.review[item.kind];
        const index = list.findIndex((i) => i.key === item.key);
        this.review[item.kind] = list.filter((i) => i.key !== item.key);
        this.closePanel();
        const left = this.review[item.kind];
        const kind = t(`admin.noun.${item.kind}`);
        announce(left.length ? t("admin.leftIn", { count: left.length, kind }) : t("admin.caughtUpIn", { kind }));
        setTimeout(() => {
          const next = left[Math.min(index, left.length - 1)];
          const button = next ? document.getElementById(`view-${next.key}`) : null;
          if (button) button.focus();
          else focusHeading("review-heading");
        }, 0);
        this.loadRecent();
      },

      // ---------- Browse ----------

      reloadBrowse() {
        this.browse = historyPager(
          (from, to) => listAdminBrowse(this.browseKind, this.browseView, this.browseSearch, from, to),
          () => t(`admin.noun.${this.browseKind}`),
        );
        this.browse.load();
      },

      /** @param {BrowseKind} kind */
      showBrowseKind(kind) {
        this.go("browse", kind, { view: this.browseView, q: "" });
      },

      /** @param {BrowseView} view */
      showBrowseView(view) {
        this.browseView = view;
        this.go("browse", this.browseKind, this.browseParams());
      },

      onSearchInput() {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          // replace, not push: typing shouldn't fill the Back history
          const query = new URLSearchParams(Object.entries(this.browseParams()).filter(([, v]) => v)).toString();
          history.replaceState(null, "", `#browse/${this.browseKind}${query ? `?${query}` : ""}`);
          this.reloadBrowse();
        }, 300);
      },

      /** Which occasional actions a Browse row offers. @param {BrowseRow} row @returns {string[]} */
      rowActions(row) {
        if (this.browseKind === "organizations") return row.status === "approved" ? ["reject-org"] : row.status === "rejected" ? ["approve-org"] : [];
        if (this.browseKind === "requests") return row.status === "open" ? ["edit-request", "close-request"] : [];
        if (this.browseKind === "events") return row.status === "upcoming" || row.status === "ongoing" ? ["cancel-event"] : [];
        if (this.browseKind === "offers") return row.status === "pending" || row.status === "accepted" ? ["cancel-offer"] : [];
        if (this.browseKind === "reports") return row.status === "open" ? ["resolve-report"] : [];
        return [];
      },

      /** @param {string} action */
      actionLabel(action) {
        return t(
          /** @type {Record<string, string>} */ ({
            "reject-org": "admin.action.reject",
            "approve-org": "admin.action.approve",
            "edit-request": "admin.action.edit",
            "close-request": "admin.action.close",
            "cancel-event": "admin.action.cancelEvent",
            "cancel-offer": "admin.action.cancelOffer",
            "resolve-report": "admin.action.resolve",
          })[action],
        );
      },

      /** @param {string} action */
      actionClass(action) {
        return action === "edit-request" ? "btn btn-secondary min-h-11 px-3" : action === "approve-org" || action === "resolve-report" ? "btn btn-primary min-h-11 px-3" : "btn btn-danger min-h-11 px-3";
      },

      /**
       * The occasional actions, each with its confirm dialog (REQUIREMENTS.md 7.3).
       * @param {string} action
       * @param {BrowseRow} row
       * @param {HTMLElement} button
       */
      async runAction(action, row, button) {
        if (action === "edit-request") return this.startEditRequest(row, button);
        /** @type {() => Promise<string>} */
        let work;
        if (action === "reject-org") {
          const note = await reasonDialog(t("admin.rejectOrgText", { title: row.title }), {
            title: t("admin.rejectTitle.organization"),
            label: t("admin.noteLabel"),
            required: true,
            maxLength: ADMIN_NOTE_MAX,
            quickReasons: quickRejectReasons(),
            confirmText: t("admin.rejectOrgConfirm"),
            danger: true,
          });
          if (note === null) return;
          work = async () => (await setOrganizationApproval(row.id, "rejected", note), t("admin.orgRejected", { title: row.title }));
        } else if (action === "approve-org") {
          const ok = await confirmDialog(t("admin.approveOrgText", { title: row.title }), { title: t("admin.approveOrgTitle"), confirmText: t("common.approve") });
          if (!ok) return;
          work = async () => (await setOrganizationApproval(row.id, "approved"), t("admin.orgApproved", { title: row.title }));
        } else if (action === "close-request") {
          const reason = await reasonDialog(t("admin.closeText", { title: row.title }), {
            title: t("admin.closeTitle"),
            label: t("admin.closeLabel"),
            maxLength: REASON_MAX_LENGTH,
            confirmText: t("admin.closeConfirm"),
            danger: true,
          });
          if (reason === null) return;
          work = async () => (await closeRequest(row.id, reason), t("admin.requestClosed"));
        } else if (action === "cancel-event") {
          const reason = await reasonDialog(t("admin.cancelEventText", { title: row.title }), {
            title: t("admin.cancelEventTitle"),
            label: t("admin.cancelEventLabel"),
            required: true,
            maxLength: REASON_MAX_LENGTH,
            warning: t("admin.cancelEventWarning"),
            confirmText: t("admin.action.cancelEvent"),
            cancelText: t("common.keepIt"),
            danger: true,
          });
          if (reason === null) return;
          work = async () => (await cancelEvent(row.id, reason), t("admin.eventCancelledToast"));
        } else if (action === "resolve-report") {
          const ok = await confirmDialog(t("admin.resolveText"), { title: t("admin.resolveTitle"), confirmText: t("admin.action.resolve") });
          if (!ok) return;
          work = async () => {
            await resolveMessageReport(row.id);
            this.loadOpenReports();
            return t("admin.reportResolved");
          };
        } else {
          const ok = await confirmDialog(t("admin.cancelOfferText", { title: row.title }), {
            title: t("admin.cancelOfferTitle"),
            confirmText: t("admin.action.cancelOffer"),
            cancelText: t("common.keepIt"),
            danger: true,
          });
          if (!ok) return;
          work = async () => {
            await cancelOffer(row.id);
            if (row.raw.item?.request_id) await scoreRequest(row.raw.item.request_id); // how much is still needed changed
            return t("admin.offerCancelled");
          };
        }
        this.busyId = row.id;
        try {
          toast(await work());
          focusHeading("browse-heading"); // the row may move to History: keep keyboard users in this section
          await this.browse.load();
          this.loadRecent();
        } catch (error) {
          toast(friendlyError(error), "error");
        } finally {
          this.busyId = null;
        }
      },

      /**
       * Edit an open request's title, description, urgency and deadline in the side panel.
       * @param {BrowseRow} row
       * @param {HTMLElement} button
       */
      startEditRequest(row, button) {
        panelOpener = button;
        this.panelItem = null;
        this.editRow = row;
        this.reqForm = {
          title: row.raw.title,
          description: row.raw.description ?? "",
          urgency: row.raw.urgency,
          deadline: row.raw.deadline ?? "",
        };
        this.reqFormErrors = {};
        /** @type {HTMLDialogElement} */ (document.getElementById("details-panel")).showModal();
        setTimeout(() => document.getElementById("admin-req-title")?.focus(), 50);
      },

      async saveRequestEdit() {
        const row = this.editRow;
        if (!row) return;
        /** @type {Record<string, string>} */
        const errors = {};
        const title = this.reqForm.title.trim();
        if (!title) errors.title = t("admin.errTitle");
        else if (title.length > 100) errors.title = t("admin.errTitleLong");
        if (this.reqForm.description.trim().length > 1000) errors.description = t("admin.errDescLong");
        this.reqFormErrors = errors;
        if (Object.keys(errors).length) {
          document.getElementById(errors.title ? "admin-req-title" : "admin-req-desc")?.focus();
          return;
        }
        this.savingReq = true;
        try {
          await adminUpdateRequest(row.id, this.reqForm);
          toast(t("admin.requestUpdated"));
          this.closePanel();
          await scoreRequest(row.id); // the database cleared the score when the text or deadline changed
          await this.browse.load();
        } catch (error) {
          toast(friendlyError(error), "error");
        } finally {
          this.savingReq = false;
        }
      },
    };
  });
});
