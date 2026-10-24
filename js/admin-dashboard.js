// @ts-check
// Admin dashboard (admin.html): summary counts and the Organizations review queue.
// Admins review and moderate; the database refuses anything else.

/** @typedef {'organizations' | 'requests' | 'events' | 'applications' | 'offers'} QueueKey */

/** Summary cards (REQUIREMENTS.md 7.1). `built` queues have a review list below. */
const ADMIN_QUEUES = /** @type {{ key: QueueKey, label: string, built: boolean }[]} */ ([
  { key: "organizations", label: "Organizations waiting", built: true },
  { key: "requests", label: "Requests waiting", built: true },
  { key: "events", label: "Events waiting", built: false },
  { key: "applications", label: "Volunteer applications waiting", built: false },
  { key: "offers", label: "Offers in progress", built: false },
]);

const ORG_TABS = /** @type {{ value: Approval, label: string, empty: string }[]} */ ([
  { value: "pending", label: "Waiting", empty: "No organizations waiting for review." },
  { value: "approved", label: "Approved", empty: "No approved organizations yet." },
  { value: "rejected", label: "Rejected", empty: "No rejected organizations." },
]);

/**
 * Counts for the summary cards. Uses head requests, so no rows are downloaded.
 * @returns {Promise<Record<QueueKey, number>>}
 */
async function getAdminCounts() {
  const client = db();
  const count = { count: /** @type {const} */ ("exact"), head: true };
  /** @type {[QueueKey, PromiseLike<{ count: number | null, error: unknown }>][]} */
  const queries = [
    ["organizations", client.from("organizations").select("*", count).eq("approval", "pending")],
    ["requests", client.from("donation_requests").select("*", count).eq("status", "pending_approval")],
    ["events", client.from("events").select("*", count).eq("approval", "pending")],
    ["applications", client.from("volunteer_applications").select("*", count).eq("status", "pending")],
    ["offers", client.from("donation_offers").select("*", count).in("status", ["pending", "accepted"])],
  ];
  const results = await Promise.all(
    queries.map(async ([key, query]) => {
      const { count: total, error } = await query;
      if (error) throw error;
      return /** @type {[QueueKey, number]} */ ([key, total ?? 0]);
    }),
  );
  return /** @type {Record<QueueKey, number>} */ (Object.fromEntries(results));
}

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("adminDashboard", () => ({
    queues: ADMIN_QUEUES,
    orgTabs: ORG_TABS,
    /** @type {Record<QueueKey, number> | null} */
    counts: null,
    countsError: "",
    /** @type {QueueKey} */
    activeQueue: "organizations",

    /** @type {Approval} */
    orgTab: "pending",
    /** @type {Organization[]} */
    orgs: [],
    loadingOrgs: true,
    orgsError: "",
    /** @type {string | null} id of the organization being worked on */
    busyId: null,
    /** @type {string | null} id of the organization whose reject note is open */
    rejectingId: null,
    rejectNote: "",
    rejectError: "",

    /** @type {DonationRequest[]} */
    reqs: [],
    loadingReqs: false,
    reqsLoaded: false,
    reqsError: "",

    async init() {
      await Promise.all([this.loadCounts(), this.loadOrgs()]);
    },

    get activeLabel() {
      return ADMIN_QUEUES.find((queue) => queue.key === this.activeQueue)?.label ?? "";
    },

    get emptyText() {
      return ORG_TABS.find((tab) => tab.value === this.orgTab)?.empty ?? "";
    },

    async loadCounts() {
      this.countsError = "";
      try {
        this.counts = await getAdminCounts();
      } catch (error) {
        this.countsError = friendlyError(error);
      }
    },

    async loadOrgs() {
      this.loadingOrgs = true;
      this.orgsError = "";
      try {
        this.orgs = await listOrganizationsForReview(this.orgTab);
      } catch (error) {
        this.orgsError = friendlyError(error);
      } finally {
        this.loadingOrgs = false;
      }
    },

    /** @param {QueueKey} key */
    openQueue(key) {
      this.activeQueue = key;
      this.cancelReject();
      if (key === "requests" && !this.reqsLoaded) this.loadRequests();
    },

    async loadRequests() {
      this.loadingReqs = true;
      this.reqsError = "";
      try {
        this.reqs = await listRequestsForReview();
        this.reqsLoaded = true;
      } catch (error) {
        this.reqsError = friendlyError(error);
      } finally {
        this.loadingReqs = false;
      }
    },

    /** @param {DonationRequest} request */
    async approveRequest(request) {
      this.busyId = request.id;
      try {
        await setRequestApproval(request.id, "open");
        toast(`"${request.title}" is approved. Donors can see it now.`);
        await Promise.all([this.loadRequests(), this.loadCounts()]);
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.busyId = null;
      }
    },

    /** @param {DonationRequest} request */
    async confirmRejectRequest(request) {
      const note = this.rejectNote.trim();
      if (!note) {
        this.rejectError = "Please write a short note so the organization knows what to change.";
        document.getElementById(`reject-note-${request.id}`)?.focus();
        return;
      }
      if (note.length > 500) {
        this.rejectError = "Please keep the note under 500 characters.";
        return;
      }
      const ok = await confirmDialog(`"${request.title}" won't be shown to donors. The organization will see your note.`, {
        title: "Reject this request?",
        confirmText: "Reject request",
        danger: true,
      });
      if (!ok) return;

      this.busyId = request.id;
      try {
        await setRequestApproval(request.id, "rejected", note);
        toast(`"${request.title}" was rejected. The organization can see your note.`);
        this.cancelReject();
        await Promise.all([this.loadRequests(), this.loadCounts()]);
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.busyId = null;
      }
    },

    /**
     * @param {string} value
     * @returns {string}
     */
    categoryLabel(value) {
      return ITEM_CATEGORIES.find((option) => option.value === value)?.label ?? value;
    },

    /**
     * @param {string} value
     * @returns {string}
     */
    urgencyLabel(value) {
      return URGENCY_OPTIONS.find((option) => option.value === value)?.label ?? value;
    },

    /** @param {Approval} tab */
    async showTab(tab) {
      this.orgTab = tab;
      this.cancelReject();
      await this.loadOrgs();
    },

    /**
     * Draws a small read-only map for one organization (called from x-init).
     * @param {HTMLElement} element
     * @param {Organization} org
     */
    showPin(element, org) {
      if (org.latitude == null || org.longitude == null) return;
      createPinMap(element, { lat: org.latitude, lng: org.longitude, label: org.name });
    },

    /** @param {Organization} org */
    async approve(org) {
      this.busyId = org.id;
      try {
        await setOrganizationApproval(org.id, "approved");
        toast(`${org.name} is approved. It can now post requests and events.`);
        await Promise.all([this.loadOrgs(), this.loadCounts()]);
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.busyId = null;
      }
    },

    /** @param {{ id: string }} item an organization or a request */
    startReject(item) {
      this.rejectingId = item.id;
      this.rejectNote = "";
      this.rejectError = "";
      setTimeout(() => document.getElementById(`reject-note-${item.id}`)?.focus(), 0);
    },

    cancelReject() {
      this.rejectingId = null;
      this.rejectNote = "";
      this.rejectError = "";
    },

    /** @param {Organization} org */
    async confirmReject(org) {
      const note = this.rejectNote.trim();
      if (!note) {
        this.rejectError = "Please write a short note so the organization knows what to fix.";
        document.getElementById(`reject-note-${org.id}`)?.focus();
        return;
      }
      if (note.length > 500) {
        this.rejectError = "Please keep the note under 500 characters.";
        return;
      }
      const ok = await confirmDialog(
        `${org.name} won't be able to post requests or events, and any it has will be hidden from the public. The organization will see your note.`,
        { title: "Reject this organization?", confirmText: "Reject organization", danger: true },
      );
      if (!ok) return;

      this.busyId = org.id;
      try {
        await setOrganizationApproval(org.id, "rejected", note);
        toast(`${org.name} was rejected. The organization can see your note.`);
        this.cancelReject();
        await Promise.all([this.loadOrgs(), this.loadCounts()]);
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.busyId = null;
      }
    },
  }));
});
