// @ts-check
// Organization data: plain Supabase functions shared by organization.html and admin.html.
// The database enforces the rules (new organizations start pending, only admins approve,
// the name is locked after approval) — these functions just pass its messages on.

/** @typedef {'pending' | 'approved' | 'rejected'} Approval */

/**
 * A row of public.organizations.
 * @typedef {Object} Organization
 * @property {string} id
 * @property {string} owner_id
 * @property {string} name
 * @property {string | null} description
 * @property {string | null} address
 * @property {string | null} phone
 * @property {number | null} latitude
 * @property {number | null} longitude
 * @property {Approval} approval
 * @property {string | null} admin_note
 * @property {string} created_at
 * @property {{ full_name: string, phone: string | null } | null} [owner]  only in admin review lists
 */

/**
 * What the organization form edits.
 * @typedef {Object} OrganizationDetails
 * @property {string} name
 * @property {string} description
 * @property {string} address
 * @property {string} phone
 * @property {number | null} latitude
 * @property {number | null} longitude
 */

/** @typedef {Partial<Record<'name' | 'description' | 'address' | 'phone' | 'pin', string>>} OrganizationErrors */

/**
 * The organization owned by this account, or null if it hasn't been created yet.
 * @param {string} ownerId
 * @returns {Promise<Organization | null>}
 */
async function getMyOrganization(ownerId) {
  const { data, error } = await db().from("organizations").select("*").eq("owner_id", ownerId).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Turns form values into a database row. The name is left out when it is locked.
 * @param {OrganizationDetails} details
 * @param {boolean} includeName
 * @returns {Record<string, unknown>}
 */
function organizationRow(details, includeName) {
  /** @type {Record<string, unknown>} */
  const row = {
    description: details.description.trim() || null,
    address: details.address.trim(),
    phone: details.phone.trim() ? normalisePhone(details.phone) : null,
    latitude: details.latitude,
    longitude: details.longitude,
  };
  if (includeName) row.name = details.name.trim();
  return row;
}

/**
 * Creates this account's organization. It starts as 'pending' (set by the database).
 * @param {OrganizationDetails} details
 * @returns {Promise<void>}
 */
async function createOrganization(details) {
  const { error } = await db().from("organizations").insert(organizationRow(details, true));
  if (error) throw error;
}

/**
 * Saves changes to an organization.
 * @param {string} id
 * @param {OrganizationDetails} details
 * @param {boolean} includeName false once approved (the name is locked)
 * @returns {Promise<void>}
 */
async function updateOrganization(id, details, includeName) {
  const { data, error } = await db()
    .from("organizations")
    .update(organizationRow(details, includeName))
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw { code: "42501", message: "No organization was updated" };
}

/**
 * Organizations with the given approval status, oldest first, with the owner's name and phone (admins only).
 * @param {Approval} approval
 * @returns {Promise<Organization[]>}
 */
async function listOrganizationsForReview(approval) {
  const { data, error } = await db()
    .from("organizations")
    .select("*, owner:profiles(full_name, phone)")
    .eq("approval", approval)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Approves or rejects an organization (admins only). Rejecting needs a note the organization will see.
 * @param {string} id
 * @param {'approved' | 'rejected'} approval
 * @param {string} [note]
 * @returns {Promise<void>}
 */
async function setOrganizationApproval(id, approval, note = "") {
  const { data, error } = await db()
    .from("organizations")
    .update({ approval, admin_note: approval === "rejected" ? note.trim() : null })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw { code: "42501", message: "No organization was updated" };
}

/**
 * Checks the organization form. Returns an error message per field (empty when everything is fine).
 * @param {OrganizationDetails} form
 * @returns {OrganizationErrors}
 */
function validateOrganization(form) {
  /** @type {OrganizationErrors} */
  const errors = {};
  const name = form.name.trim();
  if (!name) errors.name = "Please enter your organization's name.";
  else if (name.length > 100) errors.name = "Please keep the name under 100 characters.";
  if (form.description.trim().length > 1000) errors.description = "Please keep the description under 1,000 characters.";
  const address = form.address.trim();
  if (!address) errors.address = "Please enter your organization's address.";
  else if (address.length > 200) errors.address = "Please keep the address under 200 characters.";
  if (form.phone.trim() && !isValidSgPhone(form.phone)) {
    errors.phone = "Please enter an 8-digit Singapore number, like 6123 4567.";
  }
  if (form.latitude == null || form.longitude == null) {
    errors.pin = "Please drop a pin on the map so people can find you.";
  }
  return errors;
}
