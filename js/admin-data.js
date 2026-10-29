// @ts-check
// Data for admin.html (REQUIREMENTS.md section 7): the "To review" items, Approve / Reject,
// "Recently closed or cancelled" and the Browse lists. Plain functions, no UI.
// Every action reuses the existing database functions (js/orgs.js, js/requests.js, js/events.js,
// js/volunteering.js, js/offers.js); the database still enforces every rule.

/** @typedef {'organizations' | 'requests' | 'events' | 'volunteers'} ReviewKind */
/** @typedef {'organizations' | 'requests' | 'events' | 'offers' | 'volunteers' | 'applications' | 'reports'} BrowseKind */
/** @typedef {'active' | 'history' | 'all'} BrowseView */

/** The "To review" sub-tabs. Volunteers holds both volunteer accounts and event applications. */
const REVIEW_KINDS = labelledOptions(
  /** @type {Record<ReviewKind, string>} */ ({
    organizations: "admin.kind.organizations",
    requests: "admin.kind.requests",
    events: "admin.kind.events",
    volunteers: "admin.kind.volunteers",
  }),
);

/** The Browse sub-tabs. */
const BROWSE_KINDS = labelledOptions(
  /** @type {Record<BrowseKind, string>} */ ({
    organizations: "admin.kind.organizations",
    requests: "admin.kind.requests",
    events: "admin.kind.events",
    offers: "admin.kind.offers",
    volunteers: "admin.kind.volunteers",
    applications: "admin.kind.applications",
    reports: "admin.kind.reports",
  }),
);

/**
 * One-tap reasons in the Reject dialog (the admin can still edit the note). In the admin's language,
 * because the note is saved as text the sender reads.
 * @returns {string[]}
 */
function quickRejectReasons() {
  return ["missing", "unverified", "unsuitable", "duplicate"].map((key) => t(`admin.quickReason.${key}`));
}

/** Longest admin note (characters), as before. */
const ADMIN_NOTE_MAX = 500;

/**
 * Something waiting for an admin decision, shaped the same for every kind (one shared review card).
 * @typedef {Object} ReviewItem
 * @property {string} key       unique across kinds, e.g. "request-<id>"
 * @property {string} id
 * @property {ReviewKind} kind
 * @property {'organization' | 'request' | 'event' | 'account' | 'application'} subkind
 * @property {string} typeLabel  "Organization", "Request", "Event", "Account", "Application" (a getter: follows the language)
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
  if (days <= 0) return t("admin.waitingToday");
  return t("admin.waitingDays", { count: days });
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
      get typeLabel() {
        return t("admin.type.organization");
      },
      title: org.name,
      get sender() {
        return org.owner?.full_name ? t("admin.sentBy", { name: org.owner.full_name }) : t("admin.sentByOwner");
      },
      createdAt: org.created_at,
      get details() {
        return [
          { label: t("field.address"), value: org.address || t("common.notGiven") },
          { label: t("field.phone"), value: org.phone || t("common.notGiven") },
        ];
      },
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
      get typeLabel() {
        return t("admin.type.request");
      },
      title: request.title,
      get sender() {
        return t("admin.sentBy", { name: request.organization?.name || t("admin.anOrganization") });
      },
      createdAt: request.created_at,
      get details() {
        return [
          { label: t("field.items"), value: t("admin.itemsCount", { count: request.request_items.length }) },
          { label: t("field.deadline"), value: request.deadline ? formatDate(request.deadline) : t("common.none") },
          { label: t("field.urgency"), value: urgencyName(request.urgency) },
        ];
      },
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
      get typeLabel() {
        return t("admin.type.event");
      },
      title: event.title,
      get sender() {
        return t("admin.sentBy", { name: event.organization?.name || t("admin.anOrganization") });
      },
      createdAt: event.created_at,
      get details() {
        return [
          { label: t("field.when"), value: formatEventTime(event.starts_at, event.ends_at) },
          { label: t("field.place"), value: event.location_name || t("common.notGiven") },
          { label: t("field.volunteersNeeded"), value: event.volunteers_needed ? formatNumber(event.volunteers_needed) : t("admin.noLimit") },
        ];
      },
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
      get typeLabel() {
        return t("admin.type.account");
      },
      get title() {
        return account.full_name || t("admin.nameNotGiven");
      },
      get sender() {
        return t("admin.newVolunteerAccount");
      },
      createdAt: account.created_at,
      get details() {
        return [
          { label: t("field.area"), value: account.area ? areaLabel(account.area) : t("common.notGiven") },
          { label: t("field.interests"), value: enumList("interest", account.interests) || t("common.notGiven") },
        ];
      },
      raw: account,
    })),
    ...applications.map((application) => ({
      key: `application-${application.id}`,
      id: application.id,
      kind,
      subkind: /** @type {const} */ ("application"),
      get typeLabel() {
        return t("admin.type.application");
      },
      get title() {
        return application.volunteer?.full_name || t("admin.nameNotGiven");
      },
      get sender() {
        return t("admin.appliedTo", { event: application.event?.title ?? t("admin.anEvent") });
      },
      createdAt: application.created_at,
      get details() {
        return [
          { label: t("field.event"), value: application.event?.title ?? t("admin.notAvailable") },
          { label: t("field.organization"), value: application.event?.organization?.name ?? t("admin.notAvailable") },
        ];
      },
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
      return t("admin.approvedToast.organization", { title: item.title });
    case "request":
      await setRequestApproval(item.id, "open");
      await scoreRequest(item.id); // urgency score for sorting and "Why this score?"
      return t("admin.approvedToast.request", { title: item.title });
    case "event":
      await setEventApproval(item.id, "approved");
      return t("admin.approvedToast.event", { title: item.title });
    case "account":
      await setVolunteerApproval(item.id, "approved");
      return t("admin.approvedToast.account", { title: item.title });
    default:
      await setApplicationStatus(item.id, "approved");
      return t("admin.approvedToast.application");
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
      return t("admin.rejectedToast.organization", { title: item.title });
    case "request":
      await setRequestApproval(item.id, "rejected", note);
      return t("admin.rejectedToast.request");
    case "event":
      await setEventApproval(item.id, "rejected", note);
      return t("admin.rejectedToast.event");
    case "account":
      await setVolunteerApproval(item.id, "rejected", note);
      return t("admin.rejectedToast.account", { title: item.title });
    default:
      await setApplicationStatus(item.id, "rejected");
      return t("admin.rejectedToast.application");
  }
}

/**
 * The words for the Reject dialog: what happens, and who sees the note.
 * @param {ReviewItem} item
 * @returns {{ title: string, message: string }}
 */
function rejectWording(item) {
  const event = item.raw.event?.title ? `"${item.raw.event.title}"` : t("admin.theEvent");
  return {
    title: t(`admin.rejectTitle.${item.subkind}`),
    message: t(`admin.rejectText.${item.subkind}`, { title: item.title, event }),
  };
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
 * "Joined 3 Oct 2026" — key is one of admin.dated.* (a {date} line).
 * @param {string} key
 * @param {string | null | undefined} iso
 * @returns {string}
 */
function datedText(key, iso) {
  return t(`admin.dated.${key}`, { date: iso ? formatDate(iso) : "" }).trim();
}

/** @param {any} row @returns {BrowseRow} */
function orgBrowseRow(row) {
  return {
    id: row.id,
    get type() {
      return t("admin.type.organization");
    },
    title: row.name,
    detail: row.address || "",
    status: row.approval,
    statusKind: "approval",
    when: row.created_at,
    get whenText() {
      return datedText("joined", row.created_at);
    },
    reason: row.approval === "rejected" ? row.admin_note ?? "" : "",
    orgName: row.name,
    raw: row,
  };
}

/** @param {any} row @returns {BrowseRow} */
function requestBrowseRow(row) {
  const ended = ["fulfilled", "closed", "rejected"].includes(row.status);
  const when = ended ? row.closed_at ?? row.updated_at : row.created_at;
  const orgName = row.organization?.name ?? "";
  return {
    id: row.id,
    get type() {
      return t("admin.type.request");
    },
    title: row.title,
    detail: orgName,
    status: row.status,
    statusKind: "request",
    when,
    get whenText() {
      return datedText(ended ? row.status : "posted", when);
    },
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
    get type() {
      return t("admin.type.event");
    },
    title: row.title,
    detail: [orgName, row.location_name].filter(Boolean).join(" · "),
    status: row.status,
    statusKind: "event",
    when,
    get whenText() {
      return cancelled ? datedText("cancelled", when) : formatEventTime(row.starts_at, row.ends_at);
    },
    reason: cancelled ? row.cancel_reason ?? "" : row.status === "completed" ? row.outcome_summary ?? "" : "",
    orgName,
    raw: row,
  };
}

/** @param {any} row @returns {BrowseRow} */
function offerRowForBrowse(row) {
  const orgName = row.item?.request?.organization?.name ?? "";
  const active = row.status === "pending" || row.status === "accepted";
  return {
    id: row.id,
    get type() {
      return t("admin.type.offer");
    },
    get title() {
      return row.item
        ? t("admin.offerTitle", { quantity: row.quantity, unit: row.item.unit, item: row.item.name })
        : t("admin.offerItems", { count: row.quantity });
    },
    get detail() {
      const donor = row.donor ? row.donor.full_name || t("admin.nameNotGiven") : t("admin.deletedAccount");
      return [row.item?.request?.title, orgName, t("admin.fromDonor", { name: donor })].filter(Boolean).join(" · ");
    },
    status: row.status,
    statusKind: "offer",
    when: active ? row.created_at : row.updated_at,
    get whenText() {
      return active ? datedText("offered", row.created_at) : offerEndedText(row);
    },
    reason: "",
    orgName,
    raw: row,
  };
}

/** @param {any} row @returns {BrowseRow} */
function accountBrowseRow(row) {
  return {
    id: row.id,
    get type() {
      return t("admin.type.account");
    },
    get title() {
      return row.full_name || t("admin.nameNotGiven");
    },
    get detail() {
      return row.area ? areaLabel(row.area) : "";
    },
    status: row.volunteer_approval ?? "pending",
    statusKind: "approval",
    when: row.created_at,
    get whenText() {
      return datedText("signedUp", row.created_at);
    },
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
    get type() {
      return t("admin.type.application");
    },
    get title() {
      return row.volunteer ? row.volunteer.full_name || t("admin.nameNotGiven") : t("admin.deletedAccount");
    },
    detail: [row.event?.title, orgName].filter(Boolean).join(" · "),
    status: row.status,
    statusKind: "application",
    when: row.created_at,
    get whenText() {
      return datedText("applied", row.created_at);
    },
    get reason() {
      if (row.event?.status !== "cancelled") return "";
      return row.event.cancel_reason ? t("admin.eventCancelledReason", { reason: row.event.cancel_reason }) : t("admin.eventCancelled");
    },
    orgName,
    raw: row,
  };
}

/** @param {any} row @returns {BrowseRow} */
function reportBrowseRow(row) {
  const message = row.message;
  const orgName = message?.conversation?.organization?.name ?? "";
  return {
    id: row.id,
    get type() {
      return t("admin.type.report");
    },
    // the reported message, shown as written (x-text)
    get title() {
      return message?.body ?? t("admin.messageGone");
    },
    get detail() {
      const name = (/** @type {any} */ person) => (person ? person.full_name || t("admin.nameNotGiven") : t("admin.deletedAccount"));
      return [
        t("admin.reportedBy", { name: name(row.reporter) }),
        message ? t("admin.sentBy", { name: name(message.sender) }) : "",
        message?.conversation?.topic ?? "",
        orgName,
      ]
        .filter(Boolean)
        .join(" · ");
    },
    status: row.status,
    statusKind: "report",
    when: row.created_at,
    get whenText() {
      return datedText("reported", row.created_at);
    },
    get reason() {
      return t("admin.reasonLine", { reason: row.reason });
    },
    orgName,
    raw: row,
  };
}

/**
 * Marks a reported message as dealt with (admins only).
 * @param {string} reportId
 */
async function resolveMessageReport(reportId) {
  const { data, error } = await db().from("message_reports").update({ status: "resolved" }).eq("id", reportId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error(t("errors.permission"));
}

/** Reported messages nobody has dealt with yet, for the Overview. @returns {Promise<number>} */
async function countOpenReports() {
  const { count, error } = await db().from("message_reports").select("*", { count: "exact", head: true }).eq("status", "open");
  if (error) throw error;
  return count ?? 0;
}

/**
 * Supabase .or() filter for events that have ended (end time, or start time when there's none, before now).
 * @returns {string}
 */
function endedEventFilter() {
  const now = new Date().toISOString();
  return `ends_at.lt.${now},and(ends_at.is.null,starts_at.lt.${now})`; // i18n-ignore (a database filter)
}

/**
 * For the Overview (REQUIREMENTS.md 11): open requests past their deadline, and approved events
 * that have ended but are still upcoming / ongoing (not marked completed or cancelled).
 * @returns {Promise<{ pastDeadline: number, endedEvents: number }>}
 */
async function countDeadlineAttention() {
  const [requests, events] = await Promise.all([
    db().from("donation_requests").select("*", { count: "exact", head: true }).eq("status", "open").lt("deadline", sgToday()),
    db()
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("approval", "approved")
      .in("status", ["upcoming", "ongoing"])
      .or(endedEventFilter()),
  ]);
  if (requests.error) throw requests.error;
  if (events.error) throw events.error;
  return { pastDeadline: requests.count ?? 0, endedEvents: events.count ?? 0 };
}

/** Extra Browse filters from the Overview links (#browse/requests?filter=past_deadline). */
/** @type {Partial<Record<BrowseKind, string>>} */
const BROWSE_FILTERS = { requests: "past_deadline", events: "ended" };

/** Which statuses Active / History / All mean for each Browse list. */
const BROWSE_STATUSES = {
  organizations: { active: ["approved"], history: ["rejected"], all: ["pending", "approved", "rejected"] },
  requests: { active: ["open"], history: ["fulfilled", "closed", "rejected"], all: ["pending_approval", "open", "fulfilled", "closed", "rejected"] },
  events: { active: ["upcoming", "ongoing"], history: ["completed", "cancelled"], all: ["upcoming", "ongoing", "completed", "cancelled"] },
  offers: { active: ["pending", "accepted"], history: ["delivered", "rejected", "cancelled"], all: ["pending", "accepted", "delivered", "rejected", "cancelled"] },
  accounts: { active: ["approved"], history: ["rejected"], all: ["pending", "approved", "rejected"] },
  applications: { active: ["pending", "approved"], history: ["rejected", "withdrawn"], all: ["pending", "approved", "rejected", "withdrawn"] },
  reports: { active: ["open"], history: ["resolved"], all: ["open", "resolved"] },
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
 * @param {string} [filter] "past_deadline" (requests) or "ended" (events), from BROWSE_FILTERS
 * @returns {Promise<BrowseRow[]>}
 */
async function listAdminBrowse(kind, view, search, from, to, filter = "") {
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
    if (filter === "past_deadline") query = query.eq("status", "open").lt("deadline", sgToday());
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
    if (filter === "ended") query = query.eq("approval", "approved").in("status", ["upcoming", "ongoing"]).or(endedEventFilter());
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
  if (kind === "reports") {
    // Admins can read a message only once someone reported it (the database's rule)
    let query = client
      .from("message_reports")
      .select("id, reason, status, created_at, reporter:profiles(full_name), message:messages(id, body, created_at, sender:profiles(full_name), conversation:conversations(topic, organization:organizations(name)))")
      .in("status", BROWSE_STATUSES.reports[view]);
    if (q) query = query.ilike("reason", likePattern(q));
    const { data, error } = await query.order("created_at", { ascending: false }).range(from, to);
    if (error) throw error;
    return (data ?? []).map(reportBrowseRow);
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
