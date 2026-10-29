// @ts-check
// Donation offers: plain Supabase functions for donor.html.
// The database enforces the offer rules (REQUIREMENTS.md section 1) and its refusals
// are already plain English, so they're shown as they are.

/** @typedef {'pending' | 'accepted' | 'rejected' | 'delivered' | 'cancelled'} OfferStatus */

/**
 * A row of public.donation_offers, with the item and request it belongs to.
 * `item` / `item.request` can be null if the request is no longer visible.
 * @typedef {Object} DonationOffer
 * @property {string} id
 * @property {string} request_item_id
 * @property {string | null} donor_id   null once the donor deleted their account (offer kept anonymised)
 * @property {number} quantity
 * @property {string | null} message
 * @property {boolean} food_safety_confirmed
 * @property {OfferStatus} status
 * @property {string} created_at
 * @property {string} updated_at   when the status last changed (the "ended" date in History)
 * @property {{ name: string, unit: string, category: ItemCategory,
 *              request: { title: string, status: RequestStatus, deadline: string | null, dropoff_instructions: string | null,
 *                         close_reason: string | null, closed_at: string | null,
 *                         organization: { name: string, address: string | null } | null } | null } | null} item
 */

/** What the donor sees of each offer: the item, its request (incl. why it closed) and the organization. */
const MY_OFFER_COLUMNS =
  "*, item:request_items(name, unit, category, request:donation_requests(title, status, deadline, dropoff_instructions, close_reason, closed_at, organization:organizations(name, address)))";

/** Offer statuses that are finished and belong in History. */
const PAST_OFFER_STATUSES = ["delivered", "cancelled", "rejected"];

/**
 * What the offer form edits.
 * @typedef {Object} OfferForm
 * @property {number | string} quantity
 * @property {string} message
 * @property {boolean} foodSafetyConfirmed
 */

/** @typedef {Partial<Record<'quantity' | 'message' | 'foodSafety', string>>} OfferErrors */

/**
 * Open requests for donors: highest AI score first (unscored last), then the soonest deadline.
 * @returns {Promise<DonationRequest[]>}
 */
async function listOpenRequests() {
  const { data, error } = await db()
    .from("donation_requests")
    .select(`${PUBLIC_REQUEST_COLUMNS}, organization:organizations(name, address), request_items(*)`)
    .eq("status", "open")
    .or(notPastDeadlineFilter())
    .order("ai_score", { ascending: false, nullsFirst: false })
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return /** @type {DonationRequest[]} */ (/** @type {unknown} */ (data ?? [])).map(sortItems);
}

/**
 * One open request reached through a link (?request= or ?item=), even when its deadline has
 * passed, so the page can say "Deadline passed" instead of "not open". Null when it isn't open.
 * @param {{ requestId?: string | null, itemId?: string | null }} target
 * @returns {Promise<DonationRequest | null>}
 */
async function getOpenRequest(target) {
  let requestId = target.requestId ?? null;
  if (!requestId && target.itemId) {
    const { data: item, error: itemError } = await db().from("request_items").select("request_id").eq("id", target.itemId).maybeSingle();
    if (itemError) throw itemError;
    requestId = item?.request_id ?? null;
  }
  if (!requestId) return null;
  const { data, error } = await db()
    .from("donation_requests")
    .select(`${PUBLIC_REQUEST_COLUMNS}, organization:organizations(name, address), request_items(*)`)
    .eq("id", requestId)
    .eq("status", "open")
    .maybeSingle();
  if (error) throw error;
  return data ? sortItems(/** @type {DonationRequest} */ (/** @type {unknown} */ (data))) : null;
}

/**
 * This donor's active offers (pending or accepted), newest first.
 * @param {string} donorId
 * @returns {Promise<DonationOffer[]>}
 */
async function listMyOffers(donorId) {
  const { data, error } = await db()
    .from("donation_offers")
    .select(MY_OFFER_COLUMNS)
    .eq("donor_id", donorId)
    .in("status", ["pending", "accepted"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return /** @type {DonationOffer[]} */ (/** @type {unknown} */ (data ?? []));
}

/**
 * One page of this donor's finished offers (delivered, cancelled, rejected), most recently ended first.
 * @param {string} donorId
 * @param {number} from first row (0-based)
 * @param {number} to last row, inclusive
 * @returns {Promise<DonationOffer[]>}
 */
async function listMyOfferHistory(donorId, from, to) {
  const { data, error } = await db()
    .from("donation_offers")
    .select(MY_OFFER_COLUMNS)
    .eq("donor_id", donorId)
    .in("status", PAST_OFFER_STATUSES)
    .order("updated_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  return /** @type {DonationOffer[]} */ (/** @type {unknown} */ (data ?? []));
}

/**
 * How many of this donor's offers were delivered (for the summary card).
 * @param {string} donorId
 * @returns {Promise<number>}
 */
async function countMyDeliveredOffers(donorId) {
  const { count, error } = await db()
    .from("donation_offers")
    .select("id", { count: "exact", head: true })
    .eq("donor_id", donorId)
    .eq("status", "delivered");
  if (error) throw error;
  return count ?? 0;
}

/**
 * Offers items against one request item. The database sets the donor and the status (pending).
 * @param {string} itemId
 * @param {OfferForm} form
 * @returns {Promise<void>}
 */
async function makeOffer(itemId, form) {
  const { error } = await db()
    .from("donation_offers")
    .insert({
      request_item_id: itemId,
      quantity: Number(form.quantity),
      message: form.message.trim() || null,
      food_safety_confirmed: form.foodSafetyConfirmed,
    });
  if (error) throw error;
}

/**
 * Cancels a pending or accepted offer.
 * @param {string} id
 * @returns {Promise<void>}
 */
async function cancelOffer(id) {
  const { data, error } = await db().from("donation_offers").update({ status: "cancelled" }).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw { code: "42501", message: "No offer was updated" }; // i18n-ignore (shown via friendlyError by its code)
}

/**
 * An offer as the receiving organization sees it, with the donor's name and phone
 * (visible only to this organization and admins — enforced by the database).
 * @typedef {Object} IncomingOffer
 * @property {string} id
 * @property {number} quantity
 * @property {string | null} message
 * @property {boolean} food_safety_confirmed
 * @property {OfferStatus} status
 * @property {string} created_at
 * @property {string} updated_at
 * @property {string | null} donor_id   null once the donor deleted their account
 * @property {{ full_name: string, phone: string | null } | null} donor
 * @property {{ name: string, unit: string, category: ItemCategory, request_id: string,
 *              request: { title: string, status: RequestStatus, organization_id: string } }} item
 */

/**
 * Offers on this organization's requests, newest first.
 * @param {string} orgId
 * @returns {Promise<IncomingOffer[]>}
 */
async function listIncomingOffers(orgId) {
  const { data, error } = await db()
    .from("donation_offers")
    .select(
      "*, donor:profile_contacts(full_name, phone), item:request_items!inner(name, unit, category, request_id, request:donation_requests!inner(title, status, organization_id))",
    )
    .eq("item.request.organization_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * An offer as the admin sees it in the monitoring list (REQUIREMENTS.md 7.3).
 * @typedef {Object} AdminOffer
 * @property {string} id
 * @property {number} quantity
 * @property {OfferStatus} status
 * @property {string} created_at
 * @property {{ full_name: string } | null} donor   null when the donor deleted their account
 * @property {{ name: string, unit: string, request_id: string,
 *              request: { title: string, organization: { name: string } | null } | null } | null} item
 */

/**
 * Offers for the admin monitor, newest first (max 100). Admins may read donors' names for moderation.
 * @param {'active' | OfferStatus | 'all'} filter  'active' = pending + accepted
 * @returns {Promise<AdminOffer[]>}
 */
async function listAllOffersForAdmin(filter) {
  let query = db()
    .from("donation_offers")
    .select("id, quantity, status, created_at, donor:profiles(full_name), item:request_items(name, unit, request_id, request:donation_requests(title, organization:organizations(name)))")
    .order("created_at", { ascending: false })
    .limit(100);
  if (filter === "active") query = query.in("status", ["pending", "accepted"]);
  else if (filter !== "all") query = query.eq("status", filter);
  const { data, error } = await query;
  if (error) throw error;
  return /** @type {AdminOffer[]} */ (/** @type {unknown} */ (data ?? []));
}

/**
 * The organization accepts, rejects or marks an offer delivered.
 * The database checks the move is allowed and updates the item totals.
 * @param {string} id
 * @param {'accepted' | 'rejected' | 'delivered'} status
 * @returns {Promise<void>}
 */
async function setOfferStatus(id, status) {
  const { data, error } = await db().from("donation_offers").update({ status }).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw { code: "42501", message: "No offer was updated" }; // i18n-ignore (shown via friendlyError by its code)
}

/**
 * Where an "Offer" button outside needs.html should go: straight to the item on needs.html,
 * or via login first for visitors (they come back with the offer form open — REQUIREMENTS.md 6.3).
 * @param {string} itemId
 * @param {object | null} viewer  the logged-in profile or viewer, or null for visitors
 * @returns {string}
 */
function offerHref(itemId, viewer) {
  const target = `/needs.html?item=${encodeURIComponent(itemId)}`;
  return viewer ? target : `/login.html?next=${encodeURIComponent(target)}`;
}

/**
 * Checks the offer form against the item. Returns an error message per field.
 * @param {OfferForm} form
 * @param {RequestItem} item
 * @returns {OfferErrors}
 */
function validateOffer(form, item) {
  /** @type {OfferErrors} */
  const errors = {};
  const quantity = Number(form.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    errors.quantity = t("needs.errQuantity");
  } else if (quantity > item.quantity_remaining) {
    errors.quantity = t("needs.errTooMany", { count: item.quantity_remaining, unit: item.unit });
  }
  if (form.message.trim().length > 500) errors.message = t("needs.errMessage");
  if (item.category === "food" && !form.foodSafetyConfirmed) {
    errors.foodSafety = t("needs.errFood");
  }
  return errors;
}

/**
 * True while an offer still counts (pending or accepted).
 * @param {DonationOffer} offer
 * @returns {boolean}
 */
function isActiveOffer(offer) {
  return offer.status === "pending" || offer.status === "accepted";
}

/**
 * Badge for the donor's view. A waiting offer that was declined because the
 * request stopped taking donations shows "Request closed".
 * @param {DonationOffer} offer
 * @returns {{ className: string, label: string }}
 */
function offerDisplay(offer) {
  const requestStatus = offer.item?.request?.status;
  if (offer.status === "rejected" && requestStatus !== "open") {
    return { className: "badge badge-neutral", label: enumLabel("offerStatus", "request_closed") };
  }
  return statusInfo(offer.status, "offer");
}

/**
 * The "ended" line for an offer in History, e.g. "Delivered 3 Oct 2026".
 * @param {{ status: OfferStatus, updated_at: string }} offer
 * @returns {string}
 */
function offerEndedText(offer) {
  const key = { delivered: "delivered", cancelled: "cancelled", rejected: "ended" }[/** @type {string} */ (offer.status)] ?? "updated";
  return t(`history.${key}`, { date: formatDate(offer.updated_at) });
}
