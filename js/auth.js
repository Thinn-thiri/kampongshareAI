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

/**
 * What the sign-up form collects. Becomes options.data for the handle_new_user() trigger.
 * @typedef {Object} SignUpDetails
 * @property {'individual' | 'organization'} accountType
 * @property {boolean} wantDonate
 * @property {boolean} wantVolunteer
 * @property {string} fullName
 * @property {string} email
 * @property {string} password
 * @property {string} phone            already normalised, or ""
 * @property {string} postalCode
 * @property {string} area
 * @property {string[]} availableDays
 * @property {string[]} availableTimes
 * @property {string[]} interests
 * @property {string[]} skills
 * @property {boolean} matchingOptIn
 * @property {boolean} privacyConsent
 * @property {boolean} ageConfirmed
 */

/** @type {Record<Role, string>} */
const DASHBOARD_PATH = {
  donor: "/donor.html",
  volunteer: "/volunteer.html",
  organization: "/organization.html",
  admin: "/admin.html",
};

/** @type {Promise<Profile | null> | null} */
let profileRequest = null;

/**
 * The logged-in user's profile, or null when nobody is logged in.
 * Fetched once per page; signUpUser() and logIn() clear the cache.
 * @returns {Promise<Profile | null>}
 */
function getProfile() {
  profileRequest ??= fetchProfile();
  return profileRequest;
}

/** @returns {Promise<Profile | null>} */
async function fetchProfile() {
  if (!sb) return null;
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) return null;
  const { data, error } = await sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
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
 * The dashboard that opens first for this profile (admin → admin.html).
 * @param {Profile} profile
 * @returns {string}
 */
function dashboardFor(profile) {
  return DASHBOARD_PATH[profile.role];
}

/**
 * Returns `next` only when it is a relative path on this site (blocks open redirects, REQUIREMENTS.md 5.1).
 * @param {string | null | undefined} next
 * @param {string} [origin] defaults to this site
 * @returns {string | null}
 */
function safeNextPath(next, origin = location.origin) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  try {
    const url = new URL(next, origin);
    if (url.origin !== origin) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

/**
 * The safe ?next= path of the current page, if any.
 * @returns {string | null}
 */
function nextFromUrl() {
  return safeNextPath(new URLSearchParams(location.search).get("next"));
}

/**
 * Where to go after logging in or signing up: ?next= if safe, otherwise the user's dashboard.
 * @param {Profile | null} profile
 * @returns {string}
 */
function pathAfterLogin(profile) {
  return nextFromUrl() ?? (profile ? dashboardFor(profile) : "/");
}

/**
 * Creates the account. The database turns options.data into the profile row.
 * @param {SignUpDetails} details
 * @returns {Promise<{ session: unknown }>} session is null when email confirmation is switched on
 */
async function signUpUser(details) {
  if (!sb) throw new Error("Supabase not configured");
  const isIndividual = details.accountType === "individual";

  /** @type {Record<string, unknown>} */
  const data = {
    full_name: details.fullName,
    phone: details.phone,
    privacy_consent: details.privacyConsent,
    age_confirmed: details.ageConfirmed,
  };
  if (!isIndividual) {
    data.role = "organization";
  } else {
    data.roles = [details.wantDonate && "donor", details.wantVolunteer && "volunteer"].filter(Boolean);
    data.postal_code = details.postalCode;
    data.area = details.area;
    if (details.wantVolunteer) {
      data.available_days = details.availableDays;
      data.available_times = details.availableTimes;
      data.interests = details.interests;
      data.skills = details.skills;
      data.matching_opt_in = details.matchingOptIn;
    }
  }

  const { data: result, error } = await sb.auth.signUp({
    email: details.email,
    password: details.password,
    options: { data },
  });
  if (error) throw error;
  profileRequest = null;
  return { session: result.session };
}

/**
 * Logs in with email and password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<void>}
 */
async function logIn(email, password) {
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  profileRequest = null;
}

/**
 * Sends visitors who aren't logged in to the login page, then back here afterwards.
 * @returns {void}
 */
function redirectToLogin() {
  // `next` is always a relative path starting with "/" (REQUIREMENTS.md 5.1)
  location.href = "/login.html?next=" + encodeURIComponent(location.pathname + location.search);
}

/**
 * Guards a page: sends visitors to log in, and users without access to their own dashboard.
 * @param {AccessKind} kind
 * @returns {Promise<Profile | null>} the profile when access is allowed, otherwise null (while redirecting)
 */
async function requireAccess(kind) {
  const profile = await getProfile();
  if (!profile) {
    redirectToLogin();
    return null;
  }
  if (!canAccess(profile, kind)) {
    location.href = dashboardFor(profile);
    return null;
  }
  return profile;
}

/**
 * Guards a page that any logged-in user may open (e.g. profile.html).
 * @returns {Promise<Profile | null>}
 */
async function requireLogin() {
  const profile = await getProfile();
  if (!profile) redirectToLogin();
  return profile;
}

/**
 * Turns donating or volunteering on for the logged-in individual account.
 * The database refuses this for organization and admin accounts.
 * @param {'donor' | 'volunteer'} role
 * @returns {Promise<Profile>} the updated profile
 */
async function enableRole(role) {
  const profile = await getProfile();
  if (!profile) throw new Error("Not logged in");
  const { data, error } = await db()
    .from("profiles")
    .update(role === "donor" ? { is_donor: true } : { is_volunteer: true })
    .eq("id", profile.id)
    .select("*")
    .single();
  if (error) throw error;
  profileRequest = Promise.resolve(data);
  return data;
}

/**
 * Saves changes to the logged-in user's own profile and returns the updated row.
 * Only these columns can be changed from the browser (the database refuses others).
 * @param {Partial<Pick<Profile, 'full_name' | 'phone' | 'postal_code' | 'area' | 'is_donor' | 'is_volunteer'
 *   | 'available_days' | 'available_times' | 'interests' | 'skills' | 'consented_at' | 'age_confirmed' | 'matching_opt_in'>>} changes
 * @returns {Promise<Profile>}
 */
async function updateMyProfile(changes) {
  const profile = await getProfile();
  if (!profile) throw new Error("Not logged in");
  const { data, error } = await db().from("profiles").update(changes).eq("id", profile.id).select("*").single();
  if (error) throw error;
  profileRequest = Promise.resolve(data);
  return data;
}

/**
 * Gives the privacy consent and 18+ confirmation (REQUIREMENTS.md 4.2). The database sets the time.
 * @returns {Promise<Profile>}
 */
function giveConsent() {
  return updateMyProfile({ consented_at: new Date().toISOString(), age_confirmed: true });
}

/**
 * Withdraws the privacy consent: no offers or applications until it is given again.
 * @returns {Promise<Profile>}
 */
function withdrawConsent() {
  return updateMyProfile({ consented_at: null });
}

/**
 * The logged-in user's email (kept by Supabase Auth, not in profiles).
 * @returns {Promise<string>}
 */
async function getMyEmail() {
  if (!sb) return "";
  const {
    data: { session },
  } = await sb.auth.getSession();
  return session?.user.email ?? "";
}

/**
 * Logs out and returns to the home page.
 * @returns {Promise<void>}
 */
async function logout() {
  if (sb) await sb.auth.signOut();
  location.href = "/";
}

// Page guard: <body data-require="donor | volunteer | organization | admin | login">.
// The page's <main> stays hidden (see src/input.css) until access is confirmed.
document.addEventListener("DOMContentLoaded", async () => {
  const kind = document.body.dataset.require;
  if (!kind) return;
  try {
    const profile =
      kind === "login" ? await requireLogin() : await requireAccess(/** @type {AccessKind} */ (kind));
    if (profile) document.body.dataset.accessOk = "";
  } catch (error) {
    document.body.dataset.accessOk = "";
    toast(friendlyError(error), "error");
  }
});

// Top bar: login state, account menu and the Donating / Volunteering switch.
document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("topBar", () => ({
    /** @type {Profile | null} */
    profile: null,
    ready: false,
    open: false,

    async init() {
      try {
        this.profile = await getProfile();
      } catch {
        this.profile = null;
      }
      this.ready = true;
    },

    get canSwitch() {
      return Boolean(this.profile?.is_donor && this.profile?.is_volunteer);
    },

    get dashboard() {
      return this.profile ? dashboardFor(this.profile) : "/";
    },

    /**
     * @param {string} path
     * @returns {boolean}
     */
    here(path) {
      return location.pathname === path;
    },

    logout,
  }));
});
