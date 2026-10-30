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
 * @property {Approval | null} volunteer_approval   admin approval of the volunteer account (null = not a volunteer)
 * @property {string | null} volunteer_note        the admin's reason when rejected
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
  if (!sb) throw new Error("Supabase not configured"); // i18n-ignore (developer message; shown via friendlyError)
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
  if (!sb) throw new Error("Supabase not configured"); // i18n-ignore (developer message; shown via friendlyError)
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
  if (!profile) throw new Error("Not logged in"); // i18n-ignore (developer message; shown via friendlyError)
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
 *   | 'available_days' | 'available_times' | 'interests' | 'skills' | 'consented_at' | 'age_confirmed' | 'matching_opt_in'
 *   | 'volunteer_approval'>>} changes
 * @returns {Promise<Profile>}
 */
async function updateMyProfile(changes) {
  const profile = await getProfile();
  if (!profile) throw new Error("Not logged in"); // i18n-ignore (developer message; shown via friendlyError)
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
 * After a rejection, asks the admin to review the volunteer account again (rejected → pending).
 * @returns {Promise<Profile>}
 */
function requestVolunteerReview() {
  return updateMyProfile({ volunteer_approval: "pending" });
}

/**
 * True when this account may apply to volunteer events (admin-approved volunteer account).
 * @param {Profile | null} profile
 * @returns {boolean}
 */
function isApprovedVolunteer(profile) {
  return Boolean(profile?.is_volunteer && profile.volunteer_approval === "approved");
}

/**
 * Who is looking at a public page, without any personal details (REQUIREMENTS.md 6.1).
 * @typedef {Object} Viewer
 * @property {Role} role
 * @property {boolean} isDonor
 * @property {boolean} isVolunteer
 * @property {boolean} hasConsent         privacy consent + 18 or older
 * @property {boolean} volunteerApproved  the admin approved their volunteer account
 * @property {'pending' | 'approved' | 'rejected'} volunteerApproval
 * @property {string} dashboardUrl
 * @property {string | null} orgId       the organization this account runs (organizations only)
 */

/** @type {Promise<Viewer | null> | null} */
let viewerRequest = null;

/**
 * The logged-in viewer for public pages, or null for visitors. Read from the profiles table
 * (never user_metadata) and cached per page. Public pages never redirect logged-in users.
 * @returns {Promise<Viewer | null>}
 */
function getViewer() {
  viewerRequest ??= (async () => {
    const profile = await getProfile().catch(() => null);
    if (!profile) return null;
    let orgId = null;
    if (profile.role === "organization") {
      const { data } = await db().from("organizations").select("id").eq("owner_id", profile.id).maybeSingle();
      orgId = data?.id ?? null;
    }
    return {
      role: profile.role,
      isDonor: profile.is_donor,
      isVolunteer: profile.is_volunteer,
      hasConsent: Boolean(profile.consented_at && profile.age_confirmed),
      volunteerApproved: isApprovedVolunteer(profile),
      volunteerApproval: profile.volunteer_approval ?? "pending",
      dashboardUrl: dashboardFor(profile),
      orgId,
    };
  })();
  return viewerRequest;
}

/** Forget the cached viewer, e.g. after turning on donating or volunteering. */
function forgetViewer() {
  viewerRequest = null;
}

/**
 * What the donating parts of a public page show for this viewer.
 * "staff" = organization or admin accounts: they see what donors see, without Offer buttons.
 * @param {Viewer | null} viewer
 * @returns {'visitor' | 'staff' | 'turn_on' | 'consent' | 'donor'}
 */
function donorView(viewer) {
  if (!viewer) return "visitor";
  if (viewer.role === "organization" || viewer.role === "admin") return "staff";
  if (!viewer.isDonor) return "turn_on";
  if (!viewer.hasConsent) return "consent";
  return "donor";
}

/**
 * What the volunteering parts of a public page show for this viewer.
 * @param {Viewer | null} viewer
 * @returns {'visitor' | 'staff' | 'turn_on' | 'rejected' | 'pending' | 'consent' | 'volunteer'}
 */
function volunteerView(viewer) {
  if (!viewer) return "visitor";
  if (viewer.role === "organization" || viewer.role === "admin") return "staff";
  if (!viewer.isVolunteer) return "turn_on";
  if (viewer.volunteerApproval === "rejected") return "rejected";
  if (!viewer.volunteerApproved) return "pending";
  if (!viewer.hasConsent) return "consent";
  return "volunteer";
}

/**
 * Turns on donating or volunteering from a public page, then tells the rest of the page.
 * @param {'donor' | 'volunteer'} kind
 * @returns {Promise<Viewer | null>}
 */
async function turnOnRole(kind) {
  await enableRole(kind);
  forgetViewer();
  window.dispatchEvent(new CustomEvent("profile-changed"));
  return getViewer();
}

/**
 * Shared state for the public pages (index, needs, event, org), spread into their Alpine
 * components: `Alpine.data("homePage", () => ({ ...publicViewer(), ... }))`, then `await this.loadViewer()`.
 * Methods, not getters, so spreading keeps them live. Nothing personal is kept (REQUIREMENTS.md 6.1).
 */
function publicViewer() {
  return {
    /** @type {Viewer | null} */
    viewer: null,
    /** false until we know who is looking, so the visitor version never flashes for logged-in users */
    viewerReady: false,
    turningOn: false,
    /** @type {MyApplication[]} this volunteer's own applications (for "Waiting" / "Approved" on event cards) */
    myApplications: [],

    async loadViewer() {
      this.viewer = await getViewer();
      this.viewerReady = true;
    },

    /** @returns {ReturnType<typeof donorView>} */
    donorMode() {
      return donorView(this.viewer);
    },

    /** @returns {ReturnType<typeof volunteerView>} */
    volunteerMode() {
      return volunteerView(this.viewer);
    },

    /** True when the logged-in organization runs this content. @param {string | null | undefined} organizationId */
    ownsContent(organizationId) {
      return Boolean(this.viewer?.orgId && organizationId && this.viewer.orgId === organizationId);
    },

    isAdmin() {
      return this.viewer?.role === "admin";
    },

    /** Loads the volunteer's own applications (only for volunteers). */
    async loadMyApplications() {
      const profile = this.viewer?.isVolunteer ? await getProfile() : null;
      this.myApplications = profile ? await listMyApplications(profile.id) : [];
    },

    /**
     * The volunteer's application for an event, unless they withdrew it.
     * @param {string} eventId
     * @returns {MyApplication | undefined}
     */
    applicationFor(eventId) {
      return this.myApplications.find((a) => a.event_id === eventId && a.status !== "withdrawn");
    },

    /** @param {'donor' | 'volunteer'} kind */
    async turnOn(kind) {
      this.turningOn = true;
      try {
        this.viewer = await turnOnRole(kind);
        if (kind === "volunteer") await this.loadMyApplications();
        toast(
          kind === "donor"
            ? t("viewer.donatingOn")
            : this.viewer?.volunteerApproved
              ? t("viewer.volunteeringOn")
              : t("viewer.volunteeringOnPending"),
        );
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.turningOn = false;
      }
    },
  };
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
 * Deletes the logged-in individual account and its personal data (REQUIREMENTS.md 4.4),
 * via the delete-account Netlify Function (it needs the service role key). Then logs out locally.
 * @returns {Promise<void>}
 * @throws {Error} with a friendly message when it can't be done
 */
async function deleteMyAccount() {
  if (!sb) throw new Error("Supabase not configured"); // i18n-ignore (developer message; shown via friendlyError)
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) throw new Error(t("errors.loginAgain"));
  /** @type {Response} */
  let response;
  try {
    response = await fetch("/api/delete-account", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
  } catch {
    throw new Error(t("errors.network"));
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(response.status === 403 ? t("profile.deleteNotAllowed") : t("profile.deleteFailed"));
  }
  await sb.auth.signOut({ scope: "local" });
  profileRequest = null;
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

/**
 * Dashboards split into sections (REQUIREMENTS.md section 3): the top bar (and the phone bottom bar)
 * links straight to them. `countKey` shows a badge from the "dashboard-counts" event the page sends.
 * @type {Partial<Record<Role, { href: string, labelKey: string, icon: string, countKey?: string }[]>>}
 */
const DASHBOARD_SECTIONS = {
  donor: [
    { href: "/donor.html#overview", labelKey: "nav.overview", icon: "layout-dashboard" },
    { href: "/donor.html#find", labelKey: "nav.findNeeds", icon: "package-open" },
    { href: "/donor.html#offers", labelKey: "nav.myOffers", icon: "hand-heart", countKey: "dropoff" },
  ],
  volunteer: [
    { href: "/volunteer.html#overview", labelKey: "nav.overview", icon: "layout-dashboard" },
    { href: "/volunteer.html#find", labelKey: "nav.findEvents", icon: "calendar" },
    { href: "/volunteer.html#applications", labelKey: "nav.myApplications", icon: "clipboard-list", countKey: "applications" },
    { href: "/volunteer.html#tasks", labelKey: "nav.myTasks", icon: "list-checks", countKey: "tasks" },
  ],
  admin: [
    { href: "/admin.html#overview", labelKey: "nav.overview", icon: "layout-dashboard" },
    { href: "/admin.html#review", labelKey: "nav.toReview", icon: "inbox", countKey: "review" },
    { href: "/admin.html#browse", labelKey: "nav.browse", icon: "list" },
  ],
  organization: [
    { href: "/organization.html#overview", labelKey: "nav.overview", icon: "layout-dashboard" },
    { href: "/organization.html#requests", labelKey: "nav.requests", icon: "package-open" },
    { href: "/organization.html#offers", labelKey: "nav.offers", icon: "inbox", countKey: "offers" },
    { href: "/organization.html#events", labelKey: "nav.events", icon: "calendar", countKey: "events" },
  ],
};

// Top bar: login state, account menu, unread messages and the Donating / Volunteering switch.
document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("topBar", () => ({
    /** @type {Profile | null} */
    profile: null,
    ready: false,
    open: false,
    /** the URL hash, so a dashboard's section links know which is current */
    hash: location.hash,
    /** @type {Record<string, number>} badge numbers sent by the dashboard page ("dashboard-counts" event) */
    counts: {},
    /** unread messages from the other side, in all my conversations */
    unread: 0,

    async init() {
      window.addEventListener("hashchange", () => (this.hash = location.hash));
      window.addEventListener("dashboard-counts", (event) => {
        this.counts = { ...this.counts, .../** @type {CustomEvent<Record<string, number>>} */ (event).detail };
      });
      await this.refresh();
      this.ready = true;
      // e.g. profile.html adds a role: show the Donating / Volunteering switch straight away.
      window.addEventListener("profile-changed", () => this.refresh());
      if (this.showMessages) {
        this.countUnread();
        // live: a new message (or a conversation read in another tab) updates the number
        watchMessages(() => this.countUnread());
        window.addEventListener("unread-changed", () => this.countUnread());
      }
    },

    /** Individuals and organizations have messages; admins only see reported ones (admin.html). */
    get showMessages() {
      return Boolean(this.profile && this.profile.role !== "admin");
    },

    async countUnread() {
      try {
        this.unread = await unreadTotal();
      } catch {
        // keep the last number; the page still works without it
      }
    },

    async refresh() {
      try {
        this.profile = await getProfile();
      } catch {
        this.profile = null;
      }
    },

    get canSwitch() {
      return Boolean(this.profile?.is_donor && this.profile?.is_volunteer);
    },

    /**
     * The dashboard sections to show in the bars, if any: admins and organizations always;
     * donors and volunteers always, or — for people who do both — while they're on that dashboard.
     */
    get sections() {
      const profile = this.profile;
      if (!profile) return null;
      if (profile.role === "admin" || profile.role === "organization") return DASHBOARD_SECTIONS[profile.role] ?? null;
      if (profile.is_donor && (!profile.is_volunteer || location.pathname === "/donor.html")) return DASHBOARD_SECTIONS.donor ?? null;
      if (profile.is_volunteer && (!profile.is_donor || location.pathname === "/volunteer.html")) return DASHBOARD_SECTIONS.volunteer ?? null;
      return null;
    },

    /**
     * Desktop top bar links. Visitors: Home · Browse needs. Logged in: Home · My dashboard
     * (people who both donate and volunteer get the Donating / Volunteering switch instead).
     * Admins and organizations get their dashboard's sections instead of "My dashboard".
     * @returns {{ href: string, labelKey: string, badge?: number | null }[]}
     */
    get topLinks() {
      const home = { href: "/", labelKey: "nav.home" };
      if (!this.profile) return [home, { href: "/needs.html", labelKey: "nav.browseNeeds" }];
      const sections = this.sections;
      if (sections) {
        return [home, ...sections.map((s) => ({ href: s.href, labelKey: s.labelKey, badge: s.countKey ? this.counts[s.countKey] : null }))];
      }
      if (this.canSwitch) return [home];
      return [home, { href: dashboardFor(this.profile), labelKey: "nav.myDashboard" }];
    },

    /**
     * The 3–4 main sections for this person, for the mobile bottom navigation (REQUIREMENTS.md section 3).
     * @returns {{ href: string, labelKey: string, icon: string }[]}
     */
    get bottomLinks() {
      const profile = this.profile;
      const needs = { href: "/needs.html", labelKey: "nav.needs", icon: "package-open" };
      const profileLink = { href: "/profile.html", labelKey: "nav.profile", icon: "user-round" };
      if (!profile) {
        return [{ href: "/", labelKey: "nav.home", icon: "house" }, needs, { href: "/login.html", labelKey: "nav.logIn", icon: "log-in" }];
      }
      if (profile.role === "organization") return DASHBOARD_SECTIONS.organization ?? [];
      if (profile.role === "admin") return [...(DASHBOARD_SECTIONS.admin ?? []), profileLink];
      const donating = { href: "/donor.html", labelKey: "nav.donating", icon: "hand-heart" };
      const volunteering = { href: "/volunteer.html", labelKey: "nav.volunteering", icon: "users" };
      const donorSections = DASHBOARD_SECTIONS.donor ?? [];
      const volunteerSections = DASHBOARD_SECTIONS.volunteer ?? [];
      if (profile.is_donor && profile.is_volunteer) {
        // on a dashboard: its sections, plus a way over to the other one
        if (location.pathname === "/donor.html") return [...donorSections, volunteering];
        if (location.pathname === "/volunteer.html") return [...volunteerSections, donating];
        return [donating, volunteering, needs, profileLink];
      }
      if (profile.is_donor && !profile.is_volunteer) return [...donorSections, profileLink];
      if (profile.is_volunteer) return volunteerSections;
      return [donating, needs, profileLink];
    },

    /**
     * True when the link points at the page being shown (for aria-current).
     * @param {string} href
     * @returns {boolean}
     */
    isCurrent(href) {
      const [path, section] = href.split("#");
      // a dashboard's sections: current when the hash starts with it (no hash = its first section)
      const sections = Object.values(DASHBOARD_SECTIONS).find((list) => list?.some((s) => s.href === href));
      if (section && sections) {
        if (location.pathname !== path) return false;
        const first = sections[0].href.split("#")[1];
        const hash = this.hash.replace(/^#/, "") || first;
        return hash === section || hash.startsWith(`${section}/`) || hash.startsWith(`${section}?`);
      }
      if (section) return false; // other shortcuts into a page section aren't "the current page"
      return href === location.pathname || (href === "/" && location.pathname === "/index.html");
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
