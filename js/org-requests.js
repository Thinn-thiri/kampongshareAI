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
    /** @type {string | null} id of the request being closed */
    closingId: null,

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
    },

    get locked() {
      return this.editing ? isLockedRequest(this.editing) : false;
    },

    async load() {
      this.loading = true;
      this.loadError = "";
      try {
        this.requests = await listMyRequests(orgId);
      } catch (error) {
        this.loadError = friendlyError(error);
      } finally {
        this.loading = false;
      }
    },

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
          toast("Changes saved.");
        } else {
          await createRequest(orgId, this.form);
          toast("Your request was sent to the admin for approval.");
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
      const message =
        request.status === "open"
          ? "Donors won't be able to offer anything new. Waiting offers will be declined automatically; accepted offers carry on so promised items can still be delivered."
          : "It won't be reviewed or shown to donors.";
      const ok = await confirmDialog(message, {
        title: `Close "${request.title}"?`,
        confirmText: "Close request",
        danger: true,
      });
      if (!ok) return;
      this.closingId = request.id;
      try {
        await closeRequest(request.id);
        toast("The request was closed.");
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
      return `Needed ${item.quantity_needed} · Promised ${item.quantity_committed} · Received ${item.quantity_received} · Still needed ${item.quantity_remaining}`;
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
