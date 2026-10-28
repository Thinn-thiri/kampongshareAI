// @ts-check
// Every question the "Ask KampongShare" chat can answer (REQUIREMENTS.md "Chat assistant").
// The words live in the language files (js/i18n/en.js, zh.js, ms.js): chat.q.<id>.label and .answer
// (a pre-written reply, max 80 words, plain and friendly), chat.group.<group>, chat.link.<name>.
//   show(viewer)  which people see the question (viewer = getViewer() from js/auth.js; null = visitor)
//   live          ask the chat-insights function instead ("most_needed", "ending_soon", "upcoming_events", "areas")
//   links         buttons under the answer (labelKey = a chat.link.* translation key)
//   followUps     2–4 question ids offered next

/**
 * @typedef {Object} ChatQuestion
 * @property {string} id
 * @property {'start' | 'organization' | 'account' | 'about' | 'privacy' | 'live'} group
 * @property {(viewer: Viewer | null) => boolean} show
 * @property {'most_needed' | 'ending_soon' | 'upcoming_events' | 'areas'} [live]
 * @property {{ labelKey: string, href: string }[]} [links]
 * @property {string[]} followUps
 */

/** Shown to everyone, logged in or not. */
const everyone = () => true;
/** Visitors and individuals (people who can donate or volunteer). @param {Viewer | null} viewer */
const individuals = (viewer) => !viewer || (viewer.role !== "organization" && viewer.role !== "admin");
/** @param {Viewer | null} viewer */
const organizations = (viewer) => viewer?.role === "organization";
/** @param {Viewer | null} viewer */
const visitors = (viewer) => !viewer;
/** @param {Viewer | null} viewer */
const loggedIn = (viewer) => Boolean(viewer);

/** @type {ChatQuestion[]} */
const CHAT_QUESTIONS = [
  // ---------- Getting started (pre-written) ----------
  {
    id: "how_donate",
    group: "start",
    show: individuals,
    links: [
      { labelKey: "chat.link.browseNeeds", href: "/needs.html" },
      { labelKey: "chat.link.signUp", href: "/signup.html?roles=donor" },
    ],
    followUps: ["how_offers", "what_donate", "dropoff"],
  },
  {
    id: "how_volunteer",
    group: "start",
    show: individuals,
    links: [
      { labelKey: "chat.link.upcomingEvents", href: "/#events-heading" },
      { labelKey: "chat.link.signUpVolunteer", href: "/signup.html?roles=volunteer" },
    ],
    followUps: ["both_roles", "upcoming_events", "how_donate"],
  },
  {
    id: "how_offers",
    group: "start",
    show: individuals,
    links: [{ labelKey: "chat.link.browseNeeds", href: "/needs.html" }],
    followUps: ["dropoff", "what_donate", "most_needed"],
  },
  {
    id: "what_donate",
    group: "start",
    show: individuals,
    links: [{ labelKey: "chat.link.browseNeeds", href: "/needs.html" }],
    followUps: ["how_offers", "most_needed", "dropoff"],
  },
  {
    id: "dropoff",
    group: "start",
    show: individuals,
    links: [{ labelKey: "chat.link.myOffers", href: "/donor.html#offers" }],
    followUps: ["how_offers", "what_donate", "ending_soon"],
  },
  {
    id: "both_roles",
    group: "start",
    show: individuals,
    links: [{ labelKey: "chat.link.myProfile", href: "/profile.html" }],
    followUps: ["how_donate", "how_volunteer"],
  },

  // ---------- For organizations (pre-written) ----------
  {
    id: "org_post",
    group: "organization",
    show: organizations,
    links: [{ labelKey: "chat.link.postRequest", href: "/organization.html?new=request" }],
    followUps: ["org_waiting", "org_accept", "ai_how"],
  },
  {
    id: "org_waiting",
    group: "organization",
    show: organizations,
    links: [{ labelKey: "chat.link.myRequests", href: "/organization.html#requests" }],
    followUps: ["org_post", "who_checks"],
  },
  {
    id: "org_accept",
    group: "organization",
    show: organizations,
    links: [{ labelKey: "chat.link.offers", href: "/organization.html#offers" }],
    followUps: ["org_post", "org_cancel"],
  },
  {
    id: "org_cancel",
    group: "organization",
    show: organizations,
    links: [{ labelKey: "chat.link.events", href: "/organization.html#events" }],
    followUps: ["org_accept", "org_post"],
  },

  // ---------- Your account (pre-written; only what the site really does) ----------
  {
    id: "account_signup",
    group: "account",
    show: visitors,
    links: [{ labelKey: "chat.link.signUp", href: "/signup.html" }],
    followUps: ["account_login", "both_roles", "how_donate"],
  },
  {
    id: "account_login",
    group: "account",
    show: everyone,
    links: [{ labelKey: "chat.link.logIn", href: "/login.html" }],
    followUps: ["account_password", "account_change"],
  },
  {
    id: "account_password",
    group: "account",
    show: everyone,
    links: [{ labelKey: "chat.link.privacy", href: "/privacy.html" }],
    followUps: ["account_login", "account_change"],
  },
  {
    id: "account_change",
    group: "account",
    show: loggedIn,
    links: [{ labelKey: "chat.link.myProfile", href: "/profile.html" }],
    followUps: ["account_delete", "account_password"],
  },
  {
    id: "account_delete",
    group: "account",
    show: everyone,
    links: [
      { labelKey: "chat.link.myProfile", href: "/profile.html" },
      { labelKey: "chat.link.privacy", href: "/privacy.html" },
    ],
    followUps: ["account_change", "privacy"],
  },

  // ---------- About KampongShare (pre-written) ----------
  {
    id: "ai_how",
    group: "about",
    show: everyone,
    followUps: ["who_checks", "privacy", "most_needed"],
  },
  {
    id: "who_checks",
    group: "about",
    show: everyone,
    followUps: ["ai_how", "privacy"],
  },

  // ---------- Privacy (fixed reply + link, no AI) ----------
  {
    id: "privacy",
    group: "privacy",
    show: everyone,
    links: [{ labelKey: "chat.link.privacy", href: "/privacy.html" }],
    followUps: ["ai_how", "who_checks"],
  },

  // ---------- Right now (live public data + AI summary) ----------
  {
    id: "most_needed",
    group: "live",
    show: everyone,
    live: "most_needed",
    followUps: ["ending_soon", "my_area", "upcoming_events"],
  },
  {
    id: "ending_soon",
    group: "live",
    show: everyone,
    live: "ending_soon",
    followUps: ["most_needed", "my_area"],
  },
  {
    id: "upcoming_events",
    group: "live",
    show: everyone,
    live: "upcoming_events",
    followUps: ["how_volunteer", "most_needed"],
  },
  {
    id: "my_area",
    group: "live",
    show: everyone,
    live: "areas",
    followUps: ["most_needed", "ending_soon"],
  },
];
