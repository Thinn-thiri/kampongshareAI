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
 * @property {string} donor_id
 * @property {number} quantity
 * @property {string | null} message
 * @property {boolean} food_safety_confirmed
 * @property {OfferStatus} status
 * @property {string} created_at
 * @property {{ name: string, unit: string, category: ItemCategory,
 *              request: { title: string, status: RequestStatus, dropoff_instructions: string | null,
 *                         organization: { name: string, address: string | null } | null } | null } | null} item
 */

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
    .select("*, organization:organizations(name, address), request_items(*)")
    .eq("status", "open")
    .order("ai_score", { ascending: false, nullsFirst: false })
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(sortItems);
}

/**
 * This donor's offers, newest first.
 * @param {string} donorId
 * @returns {Promise<DonationOffer[]>}
 */
async function listMyOffers(donorId) {
  const { data, error } = await db()
    .from("donation_offers")
    .select(
      "*, item:request_items(name, unit, category, request:donation_requests(title, status, dropoff_instructions, organization:organizations(name, address)))",
    )
    .eq("donor_id", donorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
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
  if (!data?.length) throw { code: "42501", message: "No offer was updated" };
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
      "*, donor:profiles(full_name, phone), item:request_items!inner(name, unit, category, request_id, request:donation_requests!inner(title, status, organization_id))",
    )
    .eq("item.request.organization_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
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
  if (!data?.length) throw { code: "42501", message: "No offer was updated" };
}

/**
 * Where an "Offer" button outside needs.html should go: straight to the item on needs.html,
 * or via login first for visitors (they come back with the offer form open — REQUIREMENTS.md 6.3).
 * @param {string} itemId
 * @param {Profile | null} profile
 * @returns {string}
 */
function offerHref(itemId, profile) {
  const target = `/needs.html?item=${encodeURIComponent(itemId)}`;
  return profile ? target : `/login.html?next=${encodeURIComponent(target)}`;
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
    errors.quantity = "Enter a whole number, 1 or more.";
  } else if (quantity > item.quantity_remaining) {
    errors.quantity = `Only ${item.quantity_remaining} ${item.unit} still needed.`;
  }
  if (form.message.trim().length > 500) errors.message = "Please keep your message under 500 characters.";
  if (item.category === "food" && !form.foodSafetyConfirmed) {
    errors.foodSafety = "Please confirm the food is sealed, unopened and not past its expiry date.";
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
    return { className: "badge badge-neutral", label: "Request closed" };
  }
  return statusInfo(offer.status, "offer");
}
