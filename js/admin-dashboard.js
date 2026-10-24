// @ts-check
// Admin dashboard (admin.html): summary counts and the Organizations review queue.
// Admins review and moderate; the database refuses anything else.

/** @typedef {'organizations' | 'volunteers' | 'requests' | 'events' | 'applications' | 'offers'} QueueKey */

/** Summary cards (REQUIREMENTS.md 7.1). `built` queues have a review list below. */
const ADMIN_QUEUES = /** @type {{ key: QueueKey, label: string, built: boolean }[]} */ ([
  { key: "organizations", label: "Organizations waiting", built: true },
  { key: "volunteers", label: "Volunteer accounts waiting", built: true },
  { key: "requests", label: "Requests waiting", built: true },
  { key: "events", label: "Events waiting", built: true },
  { key: "applications", label: "Volunteer applications waiting", built: true },
  { key: "offers", label: "Offers in progress", built: true },
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
    ["volunteers", client.from("profiles").select("*", count).eq("is_volunteer", true).eq("volunteer_approval", "pending")],
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

    /** @type {VolunteerEvent[]} */
    evs: [],
    loadingEvs: false,
    evsLoaded: false,
    evsError: "",
    formatEventTime,

    /** Requests queue tab: waiting for approval, or open (monitoring, 7.3). */
    /** @type {'waiting' | 'open'} */
    reqTab: "waiting",
    /** @type {DonationRequest[]} */
    openReqs: [],
    loadingOpenReqs: false,
    openReqsError: "",
    /** @type {string | null} open request being edited */
    editingReqId: null,
    /** @type {{ title: string, description: string, urgency: Urgency, deadline: string }} */
    reqForm: { title: "", description: "", urgency: "medium", deadline: "" },
    /** @type {Record<string, string>} */
    reqFormErrors: {},
    savingReq: false,
    urgencies: URGENCY_OPTIONS,

    /** Offers monitor (7.3) */
    /** @type {AdminOffer[]} */
    adminOffers: [],
    /** @type {'active' | OfferStatus | 'all'} */
    offerFilter: "active",
    loadingOffers: false,
    offersLoaded: false,
    offersError: "",
    offerFilters: [
      { value: "active", label: "In progress" },
      { value: "delivered", label: "Delivered" },
      { value: "rejected", label: "Rejected" },
      { value: "cancelled", label: "Cancelled" },
      { value: "all", label: "All" },
    ],

    /** @type {VolunteerAccount[]} */
    vols: [],
    loadingVols: false,
    volsLoaded: false,
    volsError: "",

    /** @type {Application[]} */
    apps: [],
    loadingApps: false,
    appsLoaded: false,
    appsError: "",
    formatAvailability,

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
      if (key === "events" && !this.evsLoaded) this.loadEvents();
      if (key === "applications" && !this.appsLoaded) this.loadApplications();
      if (key === "volunteers" && !this.volsLoaded) this.loadVolunteers();
      if (key === "offers" && !this.offersLoaded) this.loadAdminOffers();
    },

    // ---- Offers monitor (7.3) ----

    async loadAdminOffers() {
      this.loadingOffers = true;
      this.offersError = "";
      try {
        this.adminOffers = await listAllOffersForAdmin(this.offerFilter);
        this.offersLoaded = true;
      } catch (error) {
        this.offersError = friendlyError(error);
      } finally {
        this.loadingOffers = false;
      }
    },

    /** @param {'active' | OfferStatus | 'all'} filter */
    async showOfferFilter(filter) {
      this.offerFilter = filter;
      await this.loadAdminOffers();
    },

    /** @param {AdminOffer} offer */
    async cancelSuspiciousOffer(offer) {
      const what = offer.item ? `${offer.quantity} ${offer.item.unit} of ${offer.item.name}` : `this offer`;
      const ok = await confirmDialog(
        `Cancel ${what}${offer.donor ? ` from ${offer.donor.full_name}` : ""}? The donor and the organization will see it as cancelled, and the item is needed again.`,
        { title: "Cancel this offer?", confirmText: "Cancel offer", cancelText: "Keep it", danger: true },
      );
      if (!ok) return;
      this.busyId = offer.id;
      try {
        await cancelOffer(offer.id);
        toast("The offer was cancelled.");
        if (offer.item?.request_id) await scoreRequest(offer.item.request_id);
        await Promise.all([this.loadAdminOffers(), this.loadCounts()]);
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.busyId = null;
      }
    },

    // ---- Open requests: close or edit (7.3) ----

    /** @param {'waiting' | 'open'} tab */
    async showReqTab(tab) {
      this.reqTab = tab;
      this.cancelReject();
      this.editingReqId = null;
      if (tab === "open") await this.loadOpenRequests();
      else await this.loadRequests();
    },

    async loadOpenRequests() {
      this.loadingOpenReqs = true;
      this.openReqsError = "";
      try {
        this.openReqs = await listOpenRequests();
      } catch (error) {
        this.openReqsError = friendlyError(error);
      } finally {
        this.loadingOpenReqs = false;
      }
    },

    /** @param {DonationRequest} request */
    startEditRequest(request) {
      this.editingReqId = request.id;
      this.reqForm = {
        title: request.title,
        description: request.description ?? "",
        urgency: request.urgency,
        deadline: request.deadline ?? "",
      };
      this.reqFormErrors = {};
      setTimeout(() => document.getElementById(`admin-req-title-${request.id}`)?.focus(), 0);
    },

    /** @param {DonationRequest} request */
    async saveRequestEdit(request) {
      /** @type {Record<string, string>} */
      const errors = {};
      const title = this.reqForm.title.trim();
      if (!title) errors.title = "Please keep a title.";
      else if (title.length > 100) errors.title = "Please keep the title under 100 characters.";
      if (this.reqForm.description.trim().length > 1000) errors.description = "Please keep the description under 1,000 characters.";
      this.reqFormErrors = errors;
      if (Object.keys(errors).length) return;
      this.savingReq = true;
      try {
        await adminUpdateRequest(request.id, this.reqForm);
        toast("The request was updated.");
        this.editingReqId = null;
        await scoreRequest(request.id); // the database cleared the score when the text or deadline changed
        await this.loadOpenRequests();
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.savingReq = false;
      }
    },

    /** @param {DonationRequest} request */
    async closeRequestAsAdmin(request) {
      const ok = await confirmDialog(
        `"${request.title}" will stop taking donations. Waiting offers are declined automatically; accepted offers carry on.`,
        { title: "Close this request?", confirmText: "Close request", danger: true },
      );
      if (!ok) return;
      this.busyId = request.id;
      try {
        await closeRequest(request.id);
        toast("The request was closed.");
        await Promise.all([this.loadOpenRequests(), this.loadCounts()]);
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.busyId = null;
      }
    },

    async loadVolunteers() {
      this.loadingVols = true;
      this.volsError = "";
      try {
        this.vols = await listVolunteerAccountsForReview();
        this.volsLoaded = true;
      } catch (error) {
        this.volsError = friendlyError(error);
      } finally {
        this.loadingVols = false;
      }
    },

    /** @param {VolunteerAccount} account */
    async approveVolunteer(account) {
      this.busyId = account.id;
      try {
        await setVolunteerApproval(account.id, "approved");
        toast(`${account.full_name || "The volunteer"} can now apply to events.`);
        await Promise.all([this.loadVolunteers(), this.loadCounts()]);
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.busyId = null;
      }
    },

    /** @param {VolunteerAccount} account */
    async confirmRejectVolunteer(account) {
      const note = this.rejectNote.trim();
      if (!note) {
        this.rejectError = "Please write a short note so the volunteer knows why.";
        document.getElementById(`reject-note-${account.id}`)?.focus();
        return;
      }
      if (note.length > 500) {
        this.rejectError = "Please keep the note under 500 characters.";
        return;
      }
      const name = account.full_name || "This volunteer";
      const ok = await confirmDialog(`${name} won't be able to apply to events. They'll see your note and can ask for another review.`, {
        title: "Reject this volunteer account?",
        confirmText: "Reject",
        danger: true,
      });
      if (!ok) return;
      this.busyId = account.id;
      try {
        await setVolunteerApproval(account.id, "rejected", note);
        toast(`${name} was not approved. They can see your note.`);
        this.cancelReject();
        await Promise.all([this.loadVolunteers(), this.loadCounts()]);
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.busyId = null;
      }
    },

    async loadApplications() {
      this.loadingApps = true;
      this.appsError = "";
      try {
        this.apps = await listApplicationsForReview();
        this.appsLoaded = true;
      } catch (error) {
        this.appsError = friendlyError(error);
      } finally {
        this.loadingApps = false;
      }
    },

    /**
     * @param {Application} application
     * @param {'approved' | 'rejected'} status
     */
    async decideApplication(application, status) {
      const name = application.volunteer?.full_name || "This volunteer";
      const title = application.event?.title ?? "the event";
      const ok = await confirmDialog(
        status === "approved" ? `${name} will be confirmed for "${title}".` : `${name} will see they weren't selected for "${title}".`,
        {
          title: status === "approved" ? "Approve this application?" : "Reject this application?",
          confirmText: status === "approved" ? "Approve" : "Reject",
          danger: status === "rejected",
        },
      );
      if (!ok) return;
      this.busyId = application.id;
      try {
        await setApplicationStatus(application.id, status);
        toast(status === "approved" ? "Application approved." : "Application rejected.");
        await Promise.all([this.loadApplications(), this.loadCounts()]);
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.busyId = null;
      }
    },

    async loadEvents() {
      this.loadingEvs = true;
      this.evsError = "";
      try {
        this.evs = await listEventsForReview();
        this.evsLoaded = true;
      } catch (error) {
        this.evsError = friendlyError(error);
      } finally {
        this.loadingEvs = false;
      }
    },

    /** @param {VolunteerEvent} event */
    async approveEvent(event) {
      this.busyId = event.id;
      try {
        await setEventApproval(event.id, "approved");
        toast(`"${event.title}" is approved. It's now on the map and can be shared.`);
        await Promise.all([this.loadEvents(), this.loadCounts()]);
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.busyId = null;
      }
    },

    /** @param {VolunteerEvent} event */
    async confirmRejectEvent(event) {
      const note = this.rejectNote.trim();
      if (!note) {
        this.rejectError = "Please write a short note so the organization knows what to change.";
        document.getElementById(`reject-note-${event.id}`)?.focus();
        return;
      }
      if (note.length > 500) {
        this.rejectError = "Please keep the note under 500 characters.";
        return;
      }
      const ok = await confirmDialog(`"${event.title}" won't appear on the map. The organization will see your note.`, {
        title: "Reject this event?",
        confirmText: "Reject event",
        danger: true,
      });
      if (!ok) return;

      this.busyId = event.id;
      try {
        await setEventApproval(event.id, "rejected", note);
        toast(`"${event.title}" was rejected. The organization can see your note.`);
        this.cancelReject();
        await Promise.all([this.loadEvents(), this.loadCounts()]);
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.busyId = null;
      }
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
        await scoreRequest(request.id); // urgency score for sorting and "Why this score?"
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
     * Draws a small read-only map for one organization or event (called from x-init).
     * @param {HTMLElement} element
     * @param {{ latitude: number | null, longitude: number | null, name?: string, title?: string }} place
     */
    showPin(element, place) {
      if (place.latitude == null || place.longitude == null) return;
      createPinMap(element, { lat: place.latitude, lng: place.longitude, label: place.name ?? place.title ?? "Location" });
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
