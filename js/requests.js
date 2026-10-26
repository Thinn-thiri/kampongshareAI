// @ts-check
// Donation request data: plain Supabase functions shared by organization.html and admin.html.
// The database enforces "Editing after approval" (REQUIREMENTS.md section 1) — these functions
// only send what's allowed and pass its messages on.

/** @typedef {'pending_approval' | 'open' | 'fulfilled' | 'closed' | 'rejected'} RequestStatus */
/** @typedef {'low' | 'medium' | 'high' | 'critical'} Urgency */
/** @typedef {'food' | 'clothing' | 'hygiene' | 'household' | 'baby' | 'education' | 'other'} ItemCategory */

/**
 * A row of public.request_items.
 * @typedef {Object} RequestItem
 * @property {string} id
 * @property {string} request_id
 * @property {string} name
 * @property {ItemCategory} category
 * @property {string} unit
 * @property {number} quantity_needed
 * @property {number} quantity_committed   accepted + delivered offers
 * @property {number} quantity_received    delivered offers
 * @property {number} quantity_remaining   needed − committed (set by the database)
 */

/**
 * A row of public.donation_requests with its items.
 * @typedef {Object} DonationRequest
 * @property {string} id
 * @property {string} organization_id
 * @property {string} title
 * @property {string | null} description
 * @property {Urgency} urgency
 * @property {string | null} deadline              YYYY-MM-DD
 * @property {string | null} dropoff_instructions
 * @property {RequestStatus} status
 * @property {string | null} [admin_note]   not included for visitors
 * @property {string | null} [close_reason]   why the organization or admin closed it (optional)
 * @property {string | null} [closed_at]      set by the database when it's closed or fulfilled
 * @property {string} [updated_at]
 * @property {number | null} ai_score
 * @property {string | null} ai_reasons
 * @property {string} created_at
 * @property {RequestItem[]} request_items
 * @property {{ name: string, address?: string | null } | null} [organization]  in admin and donor lists
 */

/**
 * One item row in the request form. `key` is only for Alpine's list; `id` is set for saved items.
 * @typedef {Object} ItemFormRow
 * @property {string} key
 * @property {string} [id]
 * @property {string} name
 * @property {ItemCategory} category
 * @property {string} unit
 * @property {number | string} quantity
 * @property {number} committed   already promised by donors (0 for new items)
 */

/**
 * What the request form edits.
 * @typedef {Object} RequestForm
 * @property {string} title
 * @property {string} description
 * @property {Urgency} urgency
 * @property {string} deadline   YYYY-MM-DD or ""
 * @property {string} dropoff
 * @property {ItemFormRow[]} items
 */

/** @typedef {Record<string, string>} RequestErrors  keys: "title", "items", "items.<key>.quantity", … */

/** Request columns visitors may read (the database hides admin notes from them). */
const PUBLIC_REQUEST_COLUMNS =
  "id, organization_id, title, description, urgency, deadline, dropoff_instructions, status, ai_score, ai_reasons, created_at";

/** The item_category enum. Medicines were removed on purpose (REQUIREMENTS.md 4.7). */
const ITEM_CATEGORIES = /** @type {{ value: ItemCategory, label: string }[]} */ ([
  { value: "food", label: "Food" },
  { value: "clothing", label: "Clothing" },
  { value: "hygiene", label: "Hygiene" },
  { value: "household", label: "Household" },
  { value: "baby", label: "Baby" },
  { value: "education", label: "Education" },
  { value: "other", label: "Other" },
]);

const URGENCY_OPTIONS = /** @type {{ value: Urgency, label: string }[]} */ ([
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
]);

/**
 * Urgency badge for a request: the AI score as number + word when scored, otherwise the
 * organization's own urgency word. Never colour alone (REQUIREMENTS.md section 3).
 * @param {{ ai_score: number | null, urgency: Urgency }} request
 * @returns {{ className: string, label: string, scored: boolean }}
 */
function requestUrgency(request) {
  if (request.ai_score != null) {
    const level = urgencyLevel(request.ai_score);
    return { className: level.className, label: `${request.ai_score} · ${level.label}`, scored: true };
  }
  /** @type {Record<Urgency, string>} */
  const classes = { critical: "badge badge-danger", high: "badge badge-warning", medium: "badge badge-info", low: "badge badge-neutral" };
  const label = URGENCY_OPTIONS.find((option) => option.value === request.urgency)?.label ?? request.urgency;
  return { className: classes[request.urgency] ?? "badge badge-neutral", label: `${label} urgency`, scored: false };
}

/**
 * @typedef {{ key: string, label: string, points: number, max: number }} ScoreFactor
 * @typedef {{ explanation: string, ai: boolean, factors: ScoreFactor[] }} ScoreDetails
 */

/**
 * The "Why this score?" details saved with a request (ai_reasons), or null when not scored yet.
 * @param {{ ai_score: number | null, ai_reasons: string | null }} request
 * @returns {ScoreDetails | null}
 */
function scoreDetails(request) {
  if (request.ai_score == null || !request.ai_reasons) return null;
  try {
    const parsed = JSON.parse(request.ai_reasons);
    if (parsed && typeof parsed.explanation === "string" && Array.isArray(parsed.factors)) {
      return { explanation: parsed.explanation, ai: Boolean(parsed.ai), factors: parsed.factors };
    }
  } catch {
    // older plain-text reasons
  }
  return { explanation: String(request.ai_reasons), ai: true, factors: [] };
}

/**
 * Asks the server to recalculate a request's urgency score (admin or owning organization only).
 * Never throws: scoring is a background extra and must not block the user.
 * @param {string} requestId
 * @returns {Promise<boolean>} true when a new score was saved
 */
async function scoreRequest(requestId) {
  try {
    const {
      data: { session },
    } = await db().auth.getSession();
    if (!session) return false;
    const response = await fetch("/api/score-request", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ requestId }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * The urgency word used for filtering: from the AI score when scored, otherwise the organization's.
 * @param {{ ai_score: number | null, urgency: Urgency }} request
 * @returns {Urgency}
 */
function urgencyWordOf(request) {
  if (request.ai_score == null) return request.urgency;
  return /** @type {Urgency} */ (urgencyLevel(request.ai_score).label.toLowerCase());
}

/**
 * Inline widths for an item's progress bar: received (solid) and promised-but-not-received (striped).
 * @param {RequestItem} item
 * @returns {{ received: string, promised: string }}
 */
function itemBarStyles(item) {
  const needed = Math.max(item.quantity_needed, 1);
  const received = Math.min(item.quantity_received / needed, 1) * 100;
  const promised = Math.max(Math.min(((item.quantity_committed - item.quantity_received) / needed) * 100, 100 - received), 0);
  return { received: `width: ${received}%`, promised: `width: ${promised}%` };
}

/**
 * Screen-reader text for an item's progress bar.
 * @param {RequestItem} item
 * @returns {string}
 */
function itemBarLabel(item) {
  return `${item.quantity_received} received, ${item.quantity_committed - item.quantity_received} promised, ${item.quantity_remaining} still needed`;
}

/**
 * True while the organization can still edit or close the request.
 * @param {DonationRequest} request
 * @returns {boolean}
 */
function isEditableRequest(request) {
  return request.status === "pending_approval" || request.status === "open";
}

/**
 * After approval only quantities, deadline, urgency and drop-off instructions can change.
 * @param {DonationRequest} request
 * @returns {boolean}
 */
function isLockedRequest(request) {
  return request.status !== "pending_approval";
}

/**
 * Sorts a request's items by name so the list doesn't jump around after saving.
 * @param {DonationRequest} request
 * @returns {DonationRequest}
 */
function sortItems(request) {
  request.request_items = [...(request.request_items ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  return request;
}

/**
 * This organization's requests, newest first, with their items.
 * @param {string} orgId
 * @returns {Promise<DonationRequest[]>}
 */
async function listMyRequests(orgId) {
  const { data, error } = await db()
    .from("donation_requests")
    .select("*, request_items(*)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(sortItems);
}

/** Request statuses that are finished and belong in History. */
const PAST_REQUEST_STATUSES = ["fulfilled", "closed", "rejected"];

/**
 * One page of this organization's finished requests (fulfilled, closed, rejected), most recently ended first.
 * @param {string} orgId
 * @param {number} from first row (0-based)
 * @param {number} to last row, inclusive
 * @returns {Promise<DonationRequest[]>}
 */
async function listMyRequestHistory(orgId, from, to) {
  const { data, error } = await db()
    .from("donation_requests")
    .select("*, request_items(*)")
    .eq("organization_id", orgId)
    .in("status", PAST_REQUEST_STATUSES)
    .order("updated_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  return (data ?? []).map(sortItems);
}

/**
 * The "ended" line for a request in History, e.g. "Closed 3 Oct 2026".
 * @param {DonationRequest} request
 * @returns {string}
 */
function requestEndedText(request) {
  const word = { fulfilled: "Fulfilled", closed: "Closed", rejected: "Rejected" }[/** @type {string} */ (request.status)] ?? "Updated";
  return `${word} ${formatDate(request.closed_at ?? request.updated_at ?? request.created_at)}`;
}

/**
 * @param {ItemFormRow} row
 * @returns {{ name: string, category: ItemCategory, unit: string, quantity_needed: number }}
 */
function itemRow(row) {
  return {
    name: row.name.trim(),
    category: row.category,
    unit: row.unit.trim(),
    quantity_needed: Number(row.quantity),
  };
}

/**
 * Creates a request (status pending_approval) with its items.
 * @param {string} orgId
 * @param {RequestForm} form
 * @returns {Promise<void>}
 */
async function createRequest(orgId, form) {
  const client = db();
  const { data, error } = await client
    .from("donation_requests")
    .insert({
      organization_id: orgId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      urgency: form.urgency,
      deadline: form.deadline || null,
      dropoff_instructions: form.dropoff.trim() || null,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: itemsError } = await client
    .from("request_items")
    .insert(form.items.map((row) => ({ ...itemRow(row), request_id: data.id })));
  if (itemsError) {
    // Don't leave a request without items behind (owners may delete unapproved requests).
    await client.from("donation_requests").delete().eq("id", data.id);
    throw itemsError;
  }
}

/**
 * Saves changes. While pending everything can change; after approval only
 * urgency, deadline, drop-off instructions and item quantities are sent.
 * @param {DonationRequest} request the saved version
 * @param {RequestForm} form
 * @returns {Promise<void>}
 */
async function updateRequest(request, form) {
  const client = db();
  const locked = isLockedRequest(request);

  /** @type {Record<string, unknown>} */
  const changes = {
    urgency: form.urgency,
    deadline: form.deadline || null,
    dropoff_instructions: form.dropoff.trim() || null,
  };
  if (!locked) {
    changes.title = form.title.trim();
    changes.description = form.description.trim() || null;
  }
  const { data, error } = await client.from("donation_requests").update(changes).eq("id", request.id).select("id");
  if (error) throw error;
  if (!data?.length) throw { code: "42501", message: "No request was updated" };

  if (locked) {
    for (const row of form.items) {
      const saved = request.request_items.find((item) => item.id === row.id);
      if (!saved || saved.quantity_needed === Number(row.quantity)) continue;
      const { error: itemError } = await client
        .from("request_items")
        .update({ quantity_needed: Number(row.quantity) })
        .eq("id", saved.id);
      if (itemError) throw itemError;
    }
    return;
  }

  const keptIds = new Set(form.items.map((row) => row.id).filter(Boolean));
  const removedIds = request.request_items.filter((item) => !keptIds.has(item.id)).map((item) => item.id);
  if (removedIds.length) {
    const { error: deleteError } = await client.from("request_items").delete().in("id", removedIds);
    if (deleteError) throw deleteError;
  }
  for (const row of form.items.filter((r) => r.id)) {
    const { error: itemError } = await client.from("request_items").update(itemRow(row)).eq("id", /** @type {string} */ (row.id));
    if (itemError) throw itemError;
  }
  const newRows = form.items.filter((row) => !row.id);
  if (newRows.length) {
    const { error: insertError } = await client
      .from("request_items")
      .insert(newRows.map((row) => ({ ...itemRow(row), request_id: request.id })));
    if (insertError) throw insertError;
  }
}

/**
 * Closes a request, with an optional reason donors can see. Waiting offers are declined by the
 * database; accepted ones carry on. The database records when (closed_at).
 * @param {string} id
 * @param {string} [reason]
 * @returns {Promise<void>}
 */
async function closeRequest(id, reason = "") {
  const { data, error } = await db()
    .from("donation_requests")
    .update({ status: "closed", close_reason: reason.trim().slice(0, REASON_MAX_LENGTH) || null })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw { code: "42501", message: "No request was updated" };
}

/**
 * Deletes a request that is still waiting for approval (nobody has seen it yet).
 * Approved requests are closed instead, so donors and the organization keep their history.
 * @param {string} id
 * @returns {Promise<void>}
 */
async function deleteRequest(id) {
  const { data, error } = await db().from("donation_requests").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw { code: "P0001", message: "This request can't be deleted any more — close it instead." };
}

/**
 * One organization's open requests (public — works logged out), most urgent first.
 * @param {string} orgId
 * @returns {Promise<DonationRequest[]>}
 */
async function listOrgOpenRequests(orgId) {
  const { data, error } = await db()
    .from("donation_requests")
    .select(`${PUBLIC_REQUEST_COLUMNS}, request_items(*)`)
    .eq("organization_id", orgId)
    .eq("status", "open")
    .order("ai_score", { ascending: false, nullsFirst: false })
    .order("deadline", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return /** @type {DonationRequest[]} */ (/** @type {unknown} */ (data ?? [])).map(sortItems);
}

/**
 * Admin edit of an open request's text, urgency and deadline (REQUIREMENTS.md 7.3).
 * Items stay untouched (admins can't change them — enforced by the database).
 * @param {string} id
 * @param {{ title: string, description: string, urgency: Urgency, deadline: string }} changes
 * @returns {Promise<void>}
 */
async function adminUpdateRequest(id, changes) {
  const { data, error } = await db()
    .from("donation_requests")
    .update({
      title: changes.title.trim(),
      description: changes.description.trim() || null,
      urgency: changes.urgency,
      deadline: changes.deadline || null,
    })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw { code: "42501", message: "No request was updated" };
}

/**
 * Requests waiting for approval, oldest first, with the organization's name (admins only).
 * @returns {Promise<DonationRequest[]>}
 */
async function listRequestsForReview() {
  const { data, error } = await db()
    .from("donation_requests")
    .select("*, organization:organizations(name), request_items(*)")
    .eq("status", "pending_approval")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(sortItems);
}

/**
 * Approves (→ open) or rejects a request (admins only). Rejecting needs a note the organization will see.
 * @param {string} id
 * @param {'open' | 'rejected'} status
 * @param {string} [note]
 * @returns {Promise<void>}
 */
async function setRequestApproval(id, status, note = "") {
  const { data, error } = await db()
    .from("donation_requests")
    .update({ status, admin_note: status === "rejected" ? note.trim() : null })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw { code: "42501", message: "No request was updated" };
}

/**
 * Today's date as YYYY-MM-DD in the user's time zone.
 * @returns {string}
 */
function todayIso() {
  return new Date().toLocaleDateString("en-CA");
}

/**
 * Checks the request form. Returns an error message per field (empty when everything is fine).
 * @param {RequestForm} form
 * @param {{ locked: boolean, isNew: boolean }} mode
 * @returns {RequestErrors}
 */
function validateRequest(form, mode) {
  /** @type {RequestErrors} */
  const errors = {};
  if (!mode.locked) {
    const title = form.title.trim();
    if (!title) errors.title = "Please give your request a title.";
    else if (title.length > 100) errors.title = "Please keep the title under 100 characters.";
    if (form.description.trim().length > 1000) errors.description = "Please keep the description under 1,000 characters.";
  }
  if (form.dropoff.trim().length > 500) errors.dropoff = "Please keep the drop-off instructions under 500 characters.";
  if (mode.isNew && form.deadline && form.deadline < todayIso()) errors.deadline = "The deadline can't be in the past.";
  if (form.items.length === 0) errors.items = "Add at least one item.";

  for (const row of form.items) {
    if (!mode.locked) {
      const name = row.name.trim();
      if (!name) errors[`items.${row.key}.name`] = "What's the item?";
      else if (name.length > 100) errors[`items.${row.key}.name`] = "Please keep the name under 100 characters.";
      const unit = row.unit.trim();
      if (!unit) errors[`items.${row.key}.unit`] = "Add a unit, like bags or bottles.";
      else if (unit.length > 30) errors[`items.${row.key}.unit`] = "Please keep the unit short.";
    }
    const quantity = Number(row.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      errors[`items.${row.key}.quantity`] = "Enter a whole number, 1 or more.";
    } else if (quantity < row.committed) {
      errors[`items.${row.key}.quantity`] = `Donors have already promised ${row.committed}, so it can't be lower.`;
    }
  }
  return errors;
}
