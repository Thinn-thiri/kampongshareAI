// @ts-check
// "History" section of admin.html: past requests, events, offers and applications with status
// filters, plus "Recently closed or cancelled" (last 30 days) to spot unusual activity.
// Admins may read everything here (enforced by the database); names are shown only for moderation.

/** @typedef {'requests' | 'events' | 'offers' | 'applications'} HistoryKind */

/**
 * One row of any kind, shaped the same so a single list can show it.
 * @typedef {Object} HistoryRow
 * @property {string} id
 * @property {string} type        "Request", "Event", "Offer", "Application"
 * @property {string} title
 * @property {string} detail      organization, and the donor or volunteer where moderation needs it
 * @property {string} status
 * @property {StatusKind} statusKind
 * @property {string} when        ISO date it ended (closed, cancelled, delivered…)
 * @property {string} whenText
 * @property {string} reason
 * @property {string} orgName
 */

/** Status filters per kind; the first one is the default ("all" = every finished status). */
const HISTORY_FILTERS = /** @type {Record<HistoryKind, { value: string, label: string }[]>} */ ({
  requests: [
    { value: "all", label: "All past" },
    { value: "fulfilled", label: "Fulfilled" },
    { value: "closed", label: "Closed" },
    { value: "rejected", label: "Rejected" },
  ],
  events: [
    { value: "all", label: "All past" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
  ],
  offers: [
    { value: "all", label: "All past" },
    { value: "delivered", label: "Delivered" },
    { value: "rejected", label: "Rejected" },
    { value: "cancelled", label: "Cancelled" },
  ],
  applications: [
    { value: "all", label: "All" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Not selected" },
    { value: "withdrawn", label: "Withdrawn" },
  ],
});

/** The statuses "all" stands for, per kind. */
const HISTORY_ALL = /** @type {Record<HistoryKind, string[]>} */ ({
  requests: ["fulfilled", "closed", "rejected"],
  events: ["completed", "cancelled"],
  offers: ["delivered", "rejected", "cancelled"],
  applications: ["approved", "rejected", "withdrawn"],
});

/**
 * @param {HistoryKind} kind
 * @param {string} filter
 * @returns {string[]}
 */
function historyStatuses(kind, filter) {
  return filter === "all" ? HISTORY_ALL[kind] : [filter];
}

/**
 * @param {string} word
 * @param {string | null | undefined} iso
 * @returns {string}
 */
function datedText(word, iso) {
  return iso ? `${word} ${formatDate(iso)}` : word;
}

/** @param {any} row @returns {HistoryRow} */
function requestRow(row) {
  const word = { fulfilled: "Fulfilled", closed: "Closed", rejected: "Rejected" }[/** @type {string} */ (row.status)] ?? "Updated";
  const when = row.closed_at ?? row.updated_at;
  const orgName = row.organization?.name ?? "";
  return {
    id: row.id,
    type: "Request",
    title: row.title,
    detail: orgName,
    status: row.status,
    statusKind: "request",
    when,
    whenText: datedText(word, when),
    reason: row.status === "rejected" ? row.admin_note ?? "" : row.close_reason ?? "",
    orgName,
  };
}

/** @param {any} row @returns {HistoryRow} */
function eventRowForHistory(row) {
  const cancelled = row.status === "cancelled";
  const when = cancelled ? row.cancelled_at ?? row.starts_at : row.ends_at ?? row.starts_at;
  const orgName = row.organization?.name ?? "";
  return {
    id: row.id,
    type: "Event",
    title: row.title,
    detail: orgName,
    status: row.status,
    statusKind: "event",
    when,
    whenText: datedText(cancelled ? "Cancelled" : "Ended", when),
    reason: cancelled ? row.cancel_reason ?? "" : row.outcome_summary ?? "",
    orgName,
  };
}

/** @param {any} row @returns {HistoryRow} */
function offerRowForHistory(row) {
  const orgName = row.item?.request?.organization?.name ?? "";
  const donor = row.donor ? row.donor.full_name || "Name not given" : "Deleted account";
  return {
    id: row.id,
    type: "Offer",
    title: row.item ? `${row.quantity} ${row.item.unit} · ${row.item.name}` : `${row.quantity} items`,
    detail: [row.item?.request?.title, orgName, `from ${donor}`].filter(Boolean).join(" · "),
    status: row.status,
    statusKind: "offer",
    when: row.updated_at,
    whenText: offerEndedText(row),
    reason: "",
    orgName,
  };
}

/** @param {any} row @returns {HistoryRow} */
function applicationRowForHistory(row) {
  const orgName = row.event?.organization?.name ?? "";
  const volunteer = row.volunteer ? row.volunteer.full_name || "Name not given" : "Deleted account";
  return {
    id: row.id,
    type: "Application",
    title: row.event?.title ?? "Event no longer available",
    detail: [orgName, volunteer].filter(Boolean).join(" · "),
    status: row.status,
    statusKind: "application",
    when: row.created_at,
    whenText: datedText("Applied", row.created_at),
    reason: row.event?.status === "cancelled" ? `Event cancelled${row.event.cancel_reason ? `: ${row.event.cancel_reason}` : ""}` : "",
    orgName,
  };
}

/**
 * One page of past records of one kind, newest first (admins only).
 * @param {HistoryKind} kind
 * @param {string} filter a status, or "all"
 * @param {number} from
 * @param {number} to inclusive
 * @returns {Promise<HistoryRow[]>}
 */
async function listAdminHistory(kind, filter, from, to) {
  const statuses = historyStatuses(kind, filter);
  const client = db();
  if (kind === "requests") {
    const { data, error } = await client
      .from("donation_requests")
      .select("id, title, status, close_reason, closed_at, updated_at, admin_note, organization:organizations(name)")
      .in("status", statuses)
      .order("updated_at", { ascending: false })
      .range(from, to);
    if (error) throw error;
    return (data ?? []).map(requestRow);
  }
  if (kind === "events") {
    const { data, error } = await client
      .from("events")
      .select("id, title, status, starts_at, ends_at, cancel_reason, cancelled_at, outcome_summary, organization:organizations(name)")
      .in("status", statuses)
      .order("starts_at", { ascending: false })
      .range(from, to);
    if (error) throw error;
    return (data ?? []).map(eventRowForHistory);
  }
  if (kind === "offers") {
    const { data, error } = await client
      .from("donation_offers")
      .select("id, quantity, status, updated_at, donor:profiles(full_name), item:request_items(name, unit, request:donation_requests(title, organization:organizations(name)))")
      .in("status", statuses)
      .order("updated_at", { ascending: false })
      .range(from, to);
    if (error) throw error;
    return (data ?? []).map(offerRowForHistory);
  }
  const { data, error } = await client
    .from("volunteer_applications")
    .select("id, status, created_at, volunteer:profile_contacts(full_name), event:events(title, status, cancel_reason, organization:organizations(name))")
    .in("status", statuses)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  return (data ?? []).map(applicationRowForHistory);
}

/** How far back "Recently closed or cancelled" looks. */
const RECENT_DAYS = 30;

/**
 * Requests closed, events cancelled and offers cancelled in the last 30 days, newest first.
 * @returns {Promise<HistoryRow[]>}
 */
async function listRecentlyClosed() {
  const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const client = db();
  const [requests, events, offers] = await Promise.all([
    client
      .from("donation_requests")
      .select("id, title, status, close_reason, closed_at, updated_at, admin_note, organization:organizations(name)")
      .eq("status", "closed")
      .gte("closed_at", since)
      .limit(200),
    client
      .from("events")
      .select("id, title, status, starts_at, ends_at, cancel_reason, cancelled_at, outcome_summary, organization:organizations(name)")
      .eq("status", "cancelled")
      .gte("cancelled_at", since)
      .limit(200),
    client
      .from("donation_offers")
      .select("id, quantity, status, updated_at, donor:profiles(full_name), item:request_items(name, unit, request:donation_requests(title, organization:organizations(name)))")
      .eq("status", "cancelled")
      .gte("updated_at", since)
      .limit(200),
  ]);
  for (const result of [requests, events, offers]) if (result.error) throw result.error;
  return [
    ...(requests.data ?? []).map(requestRow),
    ...(events.data ?? []).map(eventRowForHistory),
    ...(offers.data ?? []).map(offerRowForHistory),
  ].sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
}

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("adminHistory", () => ({
    kinds: /** @type {{ value: HistoryKind, label: string }[]} */ ([
      { value: "requests", label: "Requests" },
      { value: "events", label: "Events" },
      { value: "offers", label: "Offers" },
      { value: "applications", label: "Applications" },
    ]),
    /** @type {HistoryKind} */
    kind: "requests",
    filter: "all",
    /** @type {HistoryPager<HistoryRow>} */
    history: historyPager(),

    /** @type {HistoryRow[]} */
    recent: [],
    loadingRecent: true,
    recentError: "",
    /** @type {HistoryPager<HistoryRow>} the recent list, 20 at a time */
    recentPage: historyPager(),

    async init() {
      this.history = historyPager((from, to) => listAdminHistory(this.kind, this.filter, from, to));
      this.recentPage = historyPager(async (from, to) => this.recent.slice(from, to + 1));
      await Promise.all([this.history.load(), this.loadRecent()]);
    },

    get filters() {
      return HISTORY_FILTERS[this.kind];
    },

    /** @param {HistoryKind} kind */
    showKind(kind) {
      this.kind = kind;
      this.filter = "all";
      this.history.load();
    },

    /** @param {string} filter */
    showFilter(filter) {
      this.filter = filter;
      this.history.load();
    },

    async loadRecent() {
      this.loadingRecent = true;
      this.recentError = "";
      try {
        this.recent = await listRecentlyClosed();
        await this.recentPage.load();
      } catch (error) {
        this.recentError = friendlyError(error);
      } finally {
        this.loadingRecent = false;
      }
    },

    /** Counts per type for the last 30 days. */
    get recentCounts() {
      /** @param {string} type */
      const count = (type) => this.recent.filter((row) => row.type === type).length;
      return [
        { label: "Requests closed", value: count("Request") },
        { label: "Events cancelled", value: count("Event") },
        { label: "Offers cancelled", value: count("Offer") },
      ];
    },

    /** Organizations with the most closures and cancellations (3 or more stand out). */
    get topOrgs() {
      /** @type {Record<string, number>} */
      const totals = {};
      for (const row of this.recent) if (row.orgName) totals[row.orgName] = (totals[row.orgName] ?? 0) + 1;
      return Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, total]) => ({ name, total, unusual: total >= 3 }));
    },

    statusInfo,
  }));
});
