// @ts-check
// Data for admin.html (REQUIREMENTS.md section 7): the "To review" items, Approve / Reject,
// "Recently closed or cancelled" and the Browse lists. Plain functions, no UI.
// Every action reuses the existing database functions (js/orgs.js, js/requests.js, js/events.js,
// js/volunteering.js, js/offers.js); the database still enforces every rule.

/** @typedef {'organizations' | 'requests' | 'events' | 'volunteers'} ReviewKind */
/** @typedef {'organizations' | 'requests' | 'events' | 'offers' | 'volunteers' | 'applications'} BrowseKind */
/** @typedef {'active' | 'history' | 'all'} BrowseView */

/** The "To review" sub-tabs. Volunteers holds both volunteer accounts and event applications. */
const REVIEW_KINDS = /** @type {{ value: ReviewKind, label: string, single: string }[]} */ ([
  { value: "organizations", label: "Organizations", single: "Organization" },
  { value: "requests", label: "Requests", single: "Request" },
  { value: "events", label: "Events", single: "Event" },
  { value: "volunteers", label: "Volunteers", single: "Volunteer" },
]);

/** The Browse sub-tabs. */
const BROWSE_KINDS = /** @type {{ value: BrowseKind, label: string }[]} */ ([
  { value: "organizations", label: "Organizations" },
  { value: "requests", label: "Requests" },
  { value: "events", label: "Events" },
  { value: "offers", label: "Offers" },
  { value: "volunteers", label: "Volunteers" },
  { value: "applications", label: "Applications" },
]);

/** One-tap reasons in the Reject dialog (the admin can still edit the note). */
const QUICK_REJECT_REASONS = ["Missing details", "Couldn't verify the organization", "Not suitable for the platform", "Duplicate"];

/** Longest admin note (characters), as before. */
const ADMIN_NOTE_MAX = 500;

/**
 * Something waiting for an admin decision, shaped the same for every kind (one shared review card).
 * @typedef {Object} ReviewItem
 * @property {string} key       unique across kinds, e.g. "request-<id>"
 * @property {string} id
 * @property {ReviewKind} kind
 * @property {'organization' | 'request' | 'event' | 'account' | 'application'} subkind
 * @property {string} typeLabel  "Organization", "Request", "Event", "Account", "Application"
 * @property {string} title
 * @property {string} sender     who sent it
 * @property {string} createdAt
 * @property {{ label: string, value: string }[]} details  2–3 key facts for the card
 * @property {any} raw          the full row, for the details panel
 */

/**
 * "Waiting 2 days" from when it was sent.
 * @param {string} createdAt
 * @returns {string}
 */
function waitingText(createdAt) {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
  if (days <= 0) return "Waiting since today";
  return `Waiting ${days} ${days === 1 ? "day" : "days"}`;
}

/** @param {string} value @returns {string} */
function urgencyName(value) {
  return URGENCY_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

/** @param {string} value @returns {string} */
function categoryName(value) {
  return ITEM_CATEGORIES.find((option) => option.value === value)?.label ?? value;
}

/**
 * Everything of one kind waiting for review, oldest first.
 * @param {ReviewKind} kind
 * @returns {Promise<ReviewItem[]>}
 */
async function loadReviewItems(kind) {
  if (kind === "organizations") {
    const orgs = await listOrganizationsForReview("pending");
    return orgs.map((org) => ({
      key: `organization-${org.id}`,
      id: org.id,
      kind,
      subkind: /** @type {const} */ ("organization"),
      typeLabel: "Organization",
      title: org.name,
      sender: org.owner?.full_name ? `Sent by ${org.owner.full_name}` : "Sent by the organization's owner",
      createdAt: org.created_at,
      details: [
        { label: "Address", value: org.address || "Not given" },
        { label: "Phone", value: org.phone || "Not given" },
      ],
      raw: org,
    }));
  }
  if (kind === "requests") {
    const requests = await listRequestsForReview();
    return requests.map((request) => ({
      key: `request-${request.id}`,
      id: request.id,
      kind,
      subkind: /** @type {const} */ ("request"),
      typeLabel: "Request",
      title: request.title,
      sender: `Sent by ${request.organization?.name || "an organization"}`,
      createdAt: request.created_at,
      details: [
        { label: "Items", value: `${request.request_items.length} ${request.request_items.length === 1 ? "item" : "items"}` },
        { label: "Deadline", value: request.deadline ? formatDate(request.deadline) : "None" },
        { label: "Urgency", value: urgencyName(request.urgency) },
      ],
      raw: request,
    }));
  }
  if (kind === "events") {
    const events = await listEventsForReview();
    return events.map((event) => ({
      key: `event-${event.id}`,
      id: event.id,
      kind,
      subkind: /** @type {const} */ ("event"),
      typeLabel: "Event",
      title: event.title,
      sender: `Sent by ${event.organization?.name || "an organization"}`,
      createdAt: event.created_at,
      details: [
        { label: "When", value: formatEventTime(event.starts_at, event.ends_at) },
        { label: "Place", value: event.location_name || "Not given" },
        { label: "Volunteers needed", value: event.volunteers_needed ? String(event.volunteers_needed) : "No limit" },
      ],
      raw: event,
    }));
  }
  const [accounts, applications] = await Promise.all([listVolunteerAccountsForReview(), listApplicationsForReview()]);
  /** @type {ReviewItem[]} */
  const items = [
    ...accounts.map((account) => ({
      key: `account-${account.id}`,
      id: account.id,
      kind,
      subkind: /** @type {const} */ ("account"),
      typeLabel: "Account",
      title: account.full_name || "Name not given",
      sender: "New volunteer account",
      createdAt: account.created_at,
      details: [
        { label: "Area", value: account.area || "Not given" },
        { label: "Interests", value: account.interests?.join(", ") || "Not given" },
      ],
      raw: account,
    })),
    ...applications.map((application) => ({
      key: `application-${application.id}`,
      id: application.id,
      kind,
      subkind: /** @type {const} */ ("application"),
      typeLabel: "Application",
      title: application.volunteer?.full_name || "Name not given",
      sender: `Applied to ${application.event?.title ?? "an event"}`,
      createdAt: application.created_at,
      details: [
        { label: "Event", value: application.event?.title ?? "Not available" },
        { label: "Organization", value: application.event?.organization?.name ?? "Not available" },
      ],
      raw: application,
    })),
  ];
  return items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/**
 * Approves an item with the existing database functions. Returns the toast message.
 * @param {ReviewItem} item
 * @returns {Promise<string>}
 */
async function approveReviewItem(item) {
  switch (item.subkind) {
    case "organization":
      await setOrganizationApproval(item.id, "approved");
      return `Organization approved: ${item.title} can now post requests and events.`;
    case "request":
      await setRequestApproval(item.id, "open");
      await scoreRequest(item.id); // urgency score for sorting and "Why this score?"
      return `Request approved: donors can see "${item.title}" now.`;
    case "event":
      await setEventApproval(item.id, "approved");
      return `Event approved: "${item.title}" is on the map and can be shared.`;
    case "account":
      await setVolunteerApproval(item.id, "approved");
      return `Volunteer approved: ${item.title} can now apply to events.`;
    default:
      await setApplicationStatus(item.id, "approved");
      return "Application approved.";
  }
}

/**
 * Rejects an item. Everything except event applications needs a note the sender will see.
 * @param {ReviewItem} item
 * @param {string} note
 * @returns {Promise<string>} the toast message
 */
async function rejectReviewItem(item, note) {
  switch (item.subkind) {
    case "organization":
      await setOrganizationApproval(item.id, "rejected", note);
      return `Organization rejected. ${item.title} can see your note.`;
    case "request":
      await setRequestApproval(item.id, "rejected", note);
      return `Request rejected. The organization can see your note.`;
    case "event":
      await setEventApproval(item.id, "rejected", note);
      return `Event rejected. The organization can see your note.`;
    case "account":
      await setVolunteerApproval(item.id, "rejected", note);
      return `Volunteer account rejected. ${item.title} can see your note and ask for another review.`;
    default:
      await setApplicationStatus(item.id, "rejected");
      return "Application rejected.";
  }
}

/**
 * The words for the Reject dialog: what happens, and who sees the note.
 * @param {ReviewItem} item
 * @returns {{ title: string, message: string }}
 */
function rejectWording(item) {
  switch (item.subkind) {
    case "organization":
      return { title: "Reject this organization?", message: `${item.title} won't be able to post requests or events. The organization will see your note.` };
    case "request":
      return { title: "Reject this request?", message: `"${item.title}" won't be shown to donors. The organization will see your note.` };
    case "event":
      return { title: "Reject this event?", message: `"${item.title}" won't appear on the map. The organization will see your note.` };
    case "account":
      return { title: "Reject this volunteer account?", message: `${item.title} won't be able to apply to events. They'll see your note and can ask for another review.` };
    default:
      return { title: "Reject this application?", message: `${item.title} will see they weren't selected for ${item.raw.event?.title ? `"${item.raw.event.title}"` : "the event"}.` };
  }
}

/**
 * One row of any Browse list, shaped the same for the table and the cards.
 * @typedef {Object} BrowseRow
 * @property {string} id
 * @property {string} title
 * @property {string} detail
 * @property {string} status
 * @property {StatusKind} statusKind
 * @property {string} when       ISO date for sorting
 * @property {string} whenText
 * @property {string} reason
 * @property {string} orgName
 * @property {string} type       "Request", "Event", "Offer"… (for the mixed "recent" list)
 * @property {any} raw
 */

/**
 * @param {string} word
 * @param {string | null | undefined} iso
 * @returns {string}
 */
function datedText(word, iso) {
  return iso ? `${word} ${formatDate(iso)}` : word;
}

/** @param {any} row @returns {BrowseRow} */
function orgBrowseRow(row) {
  return {
    id: row.id,
    type: "Organization",
    title: row.name,
    detail: row.address || "",
    status: row.approval,
    statusKind: "approval",
    when: row.created_at,
    whenText: datedText("Joined", row.created_at),
    reason: row.approval === "rejected" ? row.admin_note ?? "" : "",
    orgName: row.name,
    raw: row,
  };
}

/** @param {any} row @returns {BrowseRow} */
function requestBrowseRow(row) {
  const word = { fulfilled: "Fulfilled", closed: "Closed", rejected: "Rejected" }[/** @type {string} */ (row.status)];
  const when = word ? row.closed_at ?? row.updated_at : row.created_at;
  const orgName = row.organization?.name ?? "";
  return {
    id: row.id,
    type: "Request",
    title: row.title,
    detail: orgName,
    status: row.status,
    statusKind: "request",
    when,
    whenText: datedText(word ?? "Posted", when),
    reason: row.status === "rejected" ? row.admin_note ?? "" : row.close_reason ?? "",
    orgName,
    raw: row,
  };
}

/** @param {any} row @returns {BrowseRow} */
function eventRowForBrowse(row) {
  const cancelled = row.status === "cancelled";
  const when = cancelled ? row.cancelled_at ?? row.starts_at : row.starts_at;
  const orgName = row.organization?.name ?? "";
  return {
    id: row.id,
    type: "Event",
    title: row.title,
    detail: [orgName, row.location_name].filter(Boolean).join(" · "),
    status: row.status,
    statusKind: "event",
    when,
    whenText: cancelled ? datedText("Cancelled", when) : formatEventTime(row.starts_at, row.ends_at),
    reason: cancelled ? row.cancel_reason ?? "" : row.status === "completed" ? row.outcome_summary ?? "" : "",
    orgName,
    raw: row,
  };
}

/** @param {any} row @returns {BrowseRow} */
function offerRowForBrowse(row) {
  const orgName = row.item?.request?.organization?.name ?? "";
  const donor = row.donor ? row.donor.full_name || "Name not given" : "Deleted account";
  const active = row.status === "pending" || row.status === "accepted";
  return {
    id: row.id,
    type: "Offer",
    title: row.item ? `${row.quantity} ${row.item.unit} · ${row.item.name}` : `${row.quantity} items`,
    detail: [row.item?.request?.title, orgName, `from ${donor}`].filter(Boolean).join(" · "),
    status: row.status,
    statusKind: "offer",
    when: active ? row.created_at : row.updated_at,
    whenText: active ? datedText("Offered", row.created_at) : offerEndedText(row),
    reason: "",
    orgName,
    raw: row,
  };
}

/** @param {any} row @returns {BrowseRow} */
function accountBrowseRow(row) {
  return {
    id: row.id,
    type: "Account",
    title: row.full_name || "Name not given",
    detail: row.area || "",
    status: row.volunteer_approval ?? "pending",
    statusKind: "approval",
    when: row.created_at,
    whenText: datedText("Signed up", row.created_at),
    reason: row.volunteer_approval === "rejected" ? row.volunteer_note ?? "" : "",
    orgName: "",
    raw: row,
  };
}

/** @param {any} row @returns {BrowseRow} */
function applicationRowForBrowse(row) {
  const orgName = row.event?.organization?.name ?? "";
  return {
    id: row.id,
    type: "Application",
    title: row.volunteer ? row.volunteer.full_name || "Name not given" : "Deleted account",
    detail: [row.event?.title, orgName].filter(Boolean).join(" · "),
    status: row.status,
    statusKind: "application",
    when: row.created_at,
    whenText: datedText("Applied", row.created_at),
    reason: row.event?.status === "cancelled" ? `Event cancelled${row.event.cancel_reason ? `: ${row.event.cancel_reason}` : ""}` : "",
    orgName,
    raw: row,
  };
}

/** Which statuses Active / History / All mean for each Browse list. */
const BROWSE_STATUSES = {
  organizations: { active: ["approved"], history: ["rejected"], all: ["pending", "approved", "rejected"] },
  requests: { active: ["open"], history: ["fulfilled", "closed", "rejected"], all: ["pending_approval", "open", "fulfilled", "closed", "rejected"] },
  events: { active: ["upcoming", "ongoing"], history: ["completed", "cancelled"], all: ["upcoming", "ongoing", "completed", "cancelled"] },
  offers: { active: ["pending", "accepted"], history: ["delivered", "rejected", "cancelled"], all: ["pending", "accepted", "delivered", "rejected", "cancelled"] },
  accounts: { active: ["approved"], history: ["rejected"], all: ["pending", "approved", "rejected"] },
  applications: { active: ["pending", "approved"], history: ["rejected", "withdrawn"], all: ["pending", "approved", "rejected", "withdrawn"] },
};

/**
 * A search word safe for ilike: wildcards typed by the admin are taken literally.
 * @param {string} search
 * @returns {string}
 */
function likePattern(search) {
  return `%${search.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * One page of a Browse list, newest first (admins only).
 * @param {BrowseKind} kind
 * @param {BrowseView} view
 * @param {string} search name or title ("" = everything)
 * @param {number} from
 * @param {number} to inclusive
 * @returns {Promise<BrowseRow[]>}
 */
async function listAdminBrowse(kind, view, search, from, to) {
  const client = db();
  const q = search.trim();
  if (kind === "organizations") {
    let query = client
      .from("organizations")
      .select("id, name, address, approval, admin_note, created_at")
      .in("approval", BROWSE_STATUSES.organizations[view]);
    if (q) query = query.ilike("name", likePattern(q));
    const { data, error } = await query.order("created_at", { ascending: false }).range(from, to);
    if (error) throw error;
    return (data ?? []).map(orgBrowseRow);
  }
  if (kind === "requests") {
    let query = client
      .from("donation_requests")
      .select("id, title, description, urgency, deadline, status, close_reason, closed_at, updated_at, created_at, admin_note, ai_score, organization:organizations(name)")
      .in("status", BROWSE_STATUSES.requests[view]);
    if (q) query = query.ilike("title", likePattern(q));
    const { data, error } = await query.order("created_at", { ascending: false }).range(from, to);
    if (error) throw error;
    return (data ?? []).map(requestBrowseRow);
  }
  if (kind === "events") {
    let query = client
      .from("events")
      .select("id, title, status, approval, starts_at, ends_at, location_name, cancel_reason, cancelled_at, outcome_summary, created_at, organization:organizations(name)")
      .in("status", BROWSE_STATUSES.events[view]);
    // "Active" = approved and still to come; ones waiting for approval are under To review
    if (view === "active") query = query.eq("approval", "approved");
    if (q) query = query.ilike("title", likePattern(q));
    const { data, error } = await query.order("starts_at", { ascending: false }).range(from, to);
    if (error) throw error;
    return (data ?? []).map(eventRowForBrowse);
  }
  if (kind === "offers") {
    // Admins may read donors' names for moderation (REQUIREMENTS.md 7.3)
    const item = q ? "item:request_items!inner" : "item:request_items";
    let query = client
      .from("donation_offers")
      .select(`id, quantity, status, created_at, updated_at, donor:profiles(full_name), ${item}(name, unit, request_id, request:donation_requests(title, organization:organizations(name)))`)
      .in("status", BROWSE_STATUSES.offers[view]);
    if (q) query = query.ilike("item.name", likePattern(q));
    const { data, error } = await query.order("created_at", { ascending: false }).range(from, to);
    if (error) throw error;
    return (data ?? []).map(offerRowForBrowse);
  }
  if (kind === "volunteers") {
    // volunteer accounts; their event applications have their own sub-tab
    let query = client
      .from("profiles")
      .select("id, full_name, area, volunteer_approval, volunteer_note, created_at")
      .eq("is_volunteer", true)
      .in("volunteer_approval", BROWSE_STATUSES.accounts[view]);
    if (q) query = query.ilike("full_name", likePattern(q));
    const { data, error } = await query.order("created_at", { ascending: false }).range(from, to);
    if (error) throw error;
    return (data ?? []).map(accountBrowseRow);
  }
  const volunteer = q ? "volunteer:profiles!inner" : "volunteer:profiles";
  let query = client
    .from("volunteer_applications")
    .select(`id, status, created_at, ${volunteer}(full_name), event:events(title, status, cancel_reason, organization:organizations(name))`)
    .in("status", BROWSE_STATUSES.applications[view]);
  if (q) query = query.ilike("volunteer.full_name", likePattern(q));
  const { data, error } = await query.order("created_at", { ascending: false }).range(from, to);
  if (error) throw error;
  return (data ?? []).map(applicationRowForBrowse);
}

/**
 * Requests closed, events cancelled and offers cancelled in the last few days, newest first.
 * @param {number} days
 * @returns {Promise<BrowseRow[]>}
 */
async function listRecentlyClosed(days) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const client = db();
  const [requests, events, offers] = await Promise.all([
    client
      .from("donation_requests")
      .select("id, title, status, close_reason, closed_at, updated_at, created_at, admin_note, organization:organizations(name)")
      .eq("status", "closed")
      .gte("closed_at", since)
      .limit(50),
    client
      .from("events")
      .select("id, title, status, starts_at, ends_at, location_name, cancel_reason, cancelled_at, outcome_summary, organization:organizations(name)")
      .eq("status", "cancelled")
      .gte("cancelled_at", since)
      .limit(50),
    client
      .from("donation_offers")
      .select("id, quantity, status, created_at, updated_at, donor:profiles(full_name), item:request_items(name, unit, request:donation_requests(title, organization:organizations(name)))")
      .eq("status", "cancelled")
      .gte("updated_at", since)
      .limit(50),
  ]);
  for (const result of [requests, events, offers]) if (result.error) throw result.error;
  return [
    ...(requests.data ?? []).map(requestBrowseRow),
    ...(events.data ?? []).map(eventRowForBrowse),
    ...(offers.data ?? []).map(offerRowForBrowse),
  ].sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
}
