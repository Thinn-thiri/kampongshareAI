// @ts-check
// Login helpers. What a user may do always comes from the profiles table, never from user_metadata.

/** @typedef {'donor' | 'volunteer' | 'organization' | 'admin'} Role */
/** @typedef {Role} AccessKind */

/**
 * A row of public.profiles.
 * @typedef {Object} Profile
 * @property {string} id
 * @property {string} full_name
 * @property {string | null} phone
 * @property {Role} role             which dashboard opens first after login
 * @property {boolean} is_donor
 * @property {boolean} is_volunteer
 * @property {string | null} postal_code
 * @property {string | null} area
 * @property {string[]} available_days
 * @property {string[]} available_times
 * @property {string[]} interests
 * @property {string[]} skills
 * @property {string | null} consented_at
 * @property {boolean} age_confirmed
 * @property {boolean} matching_opt_in
 * @property {string} created_at
 */

/** @type {Record<Role, string>} */
const DASHBOARD_PATH = {
  donor: "/donor.html",
  volunteer: "/volunteer.html",
  organization: "/organization.html",
  admin: "/admin.html",
};

/**
 * The logged-in user's profile, or null when nobody is logged in.
 * @returns {Promise<Profile | null>}
 */
async function getProfile() {
  if (!sb) return null;
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await sb.from("profiles").select("*").eq("id", user.id).single();
  if (error) throw error;
  return data;
}

/**
 * Whether this profile may use a page of the given kind.
 * Donating and volunteering are checked with is_donor / is_volunteer, never with role alone.
 * @param {Profile} profile
 * @param {AccessKind} kind
 * @returns {boolean}
 */
function canAccess(profile, kind) {
  if (kind === "donor") return profile.is_donor;
  if (kind === "volunteer") return profile.is_volunteer;
  return profile.role === kind;
}

/**
 * Guards a page: sends visitors to log in, and users without access to their own dashboard.
 * @param {AccessKind} kind
 * @returns {Promise<Profile | null>} the profile when access is allowed, otherwise null (while redirecting)
 */
async function requireAccess(kind) {
  const profile = await getProfile();
  if (!profile) {
    // `next` is always a relative path starting with "/" (REQUIREMENTS.md 5.1)
    location.href = "/login.html?next=" + encodeURIComponent(location.pathname + location.search);
    return null;
  }
  if (!canAccess(profile, kind)) {
    location.href = DASHBOARD_PATH[profile.role];
    return null;
  }
  return profile;
}

/**
 * Logs out and returns to the home page.
 * @returns {Promise<void>}
 */
async function logout() {
  if (sb) await sb.auth.signOut();
  location.href = "/";
}
