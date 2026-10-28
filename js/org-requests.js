// @ts-check
// "Donation requests" section of organization.html (approved organizations only).
// UI state only — database calls live in js/requests.js.

let itemRowCount = 0;

/**
 * An empty item row for the form.
 * @returns {ItemFormRow}
 */
function blankItemRow() {
  itemRowCount += 1;
  return { key: `new-${itemRowCount}`, name: "", category: "food", unit: "", quantity: "", committed: 0 };
}

/**
 * An empty request form.
 * @returns {RequestForm}
 */
function blankRequestForm() {
  return { title: "", description: "", urgency: "medium", deadline: "", dropoff: "", items: [blankItemRow()] };
}

/**
 * The form filled in from a saved request.
 * @param {DonationRequest} request
 * @returns {RequestForm}
 */
function requestToForm(request) {
  return {
    title: request.title,
    description: request.description ?? "",
    urgency: request.urgency,
    deadline: request.deadline ?? "",
    dropoff: request.dropoff_instructions ?? "",
    items: request.request_items.map((item) => ({
      key: item.id,
      id: item.id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      quantity: item.quantity_needed,
      committed: item.quantity_committed,
    })),
  };
}

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("orgRequests", (/** @type {string} */ orgId) => ({
    categories: ITEM_CATEGORIES,
    urgencies: URGENCY_OPTIONS,
    today: todayIso(),

    /** @type {DonationRequest[]} */
    requests: [],
    loading: true,
    loadError: "",
    /** @type {string | null} id of the request being closed or deleted */
    closingId: null,
    /** Active (pending approval, open) or History (fulfilled, closed, rejected) */
    tab: "active",
    /** @type {HistoryPager<DonationRequest>} */
    history: historyPager((from, to) => listMyRequestHistory(orgId, from, to), () => t("orgDash.pastRequests")),

    showForm: false,
    /** @type {DonationRequest | null} the request being edited, or null for a new one */
    editing: null,
    /** @type {RequestForm} */
    form: blankRequestForm(),
    /** @type {RequestErrors} */
    errors: {},
    formError: "",
    saving: false,

    async init() {
      await this.load();
      // "Post a request" on the home page: /organization.html?new=request opens the form
      const params = new URLSearchParams(location.search);
      if (params.get("new") === "request") {
        params.delete("new");
        history.replaceState(null, "", location.pathname + (params.size ? `?${params}` : "") + location.hash);
        this.newRequest();
      }
    },

    get locked() {
      return this.editing ? isLockedRequest(this.editing) : false;
    },

    async load() {
      this.loading = true;
      this.loadError = "";
      try {
        this.requests = await listMyRequests(orgId);
        if (this.history.loaded) await this.history.load();
      } catch (error) {
        this.loadError = friendlyError(error);
      } finally {
        this.loading = false;
      }
    },

    /** Requests still in progress (the History tab loads finished ones 20 at a time). */
    get activeRequests() {
      return this.requests.filter(isEditableRequest);
    },

    /** @param {'active' | 'history'} tab */
    showTab(tab) {
      this.tab = tab;
      if (tab === "history" && !this.history.loaded) this.history.load();
    },

    requestEndedText,

    /** @param {string} fieldId */
    openForm(fieldId) {
      this.errors = {};
      this.formError = "";
      this.showForm = true;
      setTimeout(() => {
        document.getElementById("request-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
        document.getElementById(fieldId)?.focus({ preventScroll: true });
      }, 0);
    },

    newRequest() {
      this.editing = null;
      this.form = blankRequestForm();
      this.openForm("req-title");
    },

    /** @param {DonationRequest} request */
    edit(request) {
      this.editing = request;
      this.form = requestToForm(request);
      this.openForm(isLockedRequest(request) ? "req-urgency" : "req-title");
    },

    cancelForm() {
      this.showForm = false;
      this.editing = null;
    },

    addItem() {
      const row = blankItemRow();
      this.form.items.push(row);
      setTimeout(() => document.getElementById(`item-name-${row.key}`)?.focus(), 0);
    },

    /** @param {string} key */
    removeItem(key) {
      this.form.items = this.form.items.filter((row) => row.key !== key);
    },

    async save() {
      this.formError = "";
      this.errors = validateRequest(this.form, { locked: this.locked, isNew: !this.editing });
      const firstError = Object.keys(this.errors)[0];
      if (firstError) {
        const [field, key, part] = firstError.split(".");
        const id = field === "items" && key ? `item-${part}-${key}` : `req-${field}`;
        document.getElementById(id)?.focus();
        return;
      }
      this.saving = true;
      try {
        if (this.editing) {
          await updateRequest(this.editing, this.form);
          toast(t("orgDash.requestSaved"));
          // The database clears the urgency score when an open request changes; work it out again.
          if (this.editing.status === "open") await scoreRequest(this.editing.id);
        } else {
          await createRequest(orgId, this.form);
          toast(t("orgDash.requestSent"));
        }
        this.showForm = false;
        this.editing = null;
        await this.load();
      } catch (error) {
        this.formError = friendlyError(error);
      } finally {
        this.saving = false;
      }
    },

    /** @param {DonationRequest} request */
    async close(request) {
      const reason = await reasonDialog(
        t("orgDash.closeRequestText"),
        {
          title: t("orgDash.closeRequestTitle", { title: request.title }),
          label: t("orgDash.closeRequestLabel"),
          maxLength: REASON_MAX_LENGTH,
          confirmText: t("orgDash.closeRequest"),
          danger: true,
        },
      );
      if (reason === null) return;
      this.closingId = request.id;
      try {
        await closeRequest(request.id, reason);
        toast(t("orgDash.requestClosed"));
        focusHeading("requests-heading"); // the card may be gone: keep keyboard users in this section
        if (this.editing?.id === request.id) this.cancelForm();
        await this.load();
        // Closing declines waiting offers in the database: refresh "Incoming offers".
        window.dispatchEvent(new CustomEvent("offers-changed"));
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.closingId = null;
      }
    },

    /**
     * Only requests still waiting for approval can be deleted; approved ones are closed instead.
     * @param {DonationRequest} request
     */
    async remove(request) {
      const ok = await confirmDialog(t("orgDash.deleteRequestText"), {
        title: t("orgDash.deleteRequestTitle", { title: request.title }),
        confirmText: t("orgDash.deleteRequestConfirm"),
        danger: true,
      });
      if (!ok) return;
      this.closingId = request.id;
      try {
        await deleteRequest(request.id);
        toast(t("orgDash.requestDeleted"));
        focusHeading("requests-heading"); // the card may be gone: keep keyboard users in this section
        if (this.editing?.id === request.id) this.cancelForm();
        await this.load();
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.closingId = null;
      }
    },

    isEditable: isEditableRequest,

    /**
     * Widths for the progress bar: received (solid) and promised-but-not-received (striped).
     * @param {RequestItem} item
     * @returns {{ received: string, promised: string }}
     */
    barWidths(item) {
      const needed = Math.max(item.quantity_needed, 1);
      const received = Math.min(item.quantity_received / needed, 1) * 100;
      const promised = Math.min((item.quantity_committed - item.quantity_received) / needed, 1 - received / 100) * 100;
      return { received: `width: ${received}%`, promised: `width: ${Math.max(promised, 0)}%` };
    },

    /**
     * @param {RequestItem} item
     * @returns {string}
     */
    itemDetail(item) {
      return t("orgDash.itemSummary", {
        needed: item.quantity_needed,
        promised: item.quantity_committed,
        received: item.quantity_received,
        remaining: item.quantity_remaining,
      });
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
