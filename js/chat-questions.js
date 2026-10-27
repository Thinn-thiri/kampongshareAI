// @ts-check
// Every question the "Ask KampongShare" chat can answer (REQUIREMENTS.md "Chat assistant").
// Edit the wording here: keep answers short (max 80 words), plain and friendly.
//   show(viewer)  which people see the question (viewer = getViewer() from js/auth.js; null = visitor)
//   answer        a pre-written reply (no AI)
//   live          ask the chat-insights function instead ("most_needed", "ending_soon", "upcoming_events", "areas")
//   links         buttons under the answer
//   followUps     2–4 question ids offered next

/**
 * @typedef {Object} ChatQuestion
 * @property {string} id
 * @property {string} label
 * @property {'start' | 'organization' | 'account' | 'about' | 'privacy' | 'live'} group
 * @property {(viewer: Viewer | null) => boolean} show
 * @property {string} [answer]
 * @property {'most_needed' | 'ending_soon' | 'upcoming_events' | 'areas'} [live]
 * @property {{ label: string, href: string }[]} [links]
 * @property {string[]} followUps
 */

/** Section titles for the first set of chips. */
const CHAT_GROUPS = /** @type {Record<ChatQuestion['group'], string>} */ ({
  start: "Getting started",
  organization: "For organizations",
  account: "Your account",
  about: "About KampongShare",
  privacy: "Privacy",
  live: "Right now",
});

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
    label: "How do I donate?",
    group: "start",
    show: individuals,
    answer:
      "Find a request you can help with, then press Offer on one item and say how many you can give. The organization accepts or declines your offer. Once it's accepted, you'll see where and when to drop it off. You need a free account to offer, so organizations can arrange drop-off.",
    links: [
      { label: "Browse needs", href: "/needs.html" },
      { label: "Sign up", href: "/signup.html?roles=donor" },
    ],
    followUps: ["how_offers", "what_donate", "dropoff"],
  },
  {
    id: "how_volunteer",
    label: "How do I volunteer?",
    group: "start",
    show: individuals,
    answer:
      "Sign up and tick \"I want to volunteer\". An admin checks new volunteer accounts first. Once you're approved, open an event and press Volunteer. The organization then confirms your place. While you wait, you can still browse all the events.",
    links: [
      { label: "See upcoming events", href: "/#events-heading" },
      { label: "Sign up to volunteer", href: "/signup.html?roles=volunteer" },
    ],
    followUps: ["both_roles", "upcoming_events", "how_donate"],
  },
  {
    id: "how_offers",
    label: "How do offers work?",
    group: "start",
    show: individuals,
    answer:
      "An offer is your promise to give a number of one item, never more than is still needed. You can have one active offer per item; to change the amount, cancel it and offer again. The organization accepts or declines it. If a request closes, waiting offers are declined automatically, but accepted ones still go ahead.",
    links: [{ label: "Browse needs", href: "/needs.html" }],
    followUps: ["dropoff", "what_donate", "most_needed"],
  },
  {
    id: "what_donate",
    label: "What can I donate?",
    group: "start",
    show: individuals,
    answer:
      "Only what organizations ask for: food, clothing, hygiene, household, baby and education items. Food must be sealed, unopened and not past its expiry date — you'll tick a box to confirm this. Cooked or home-made food isn't accepted, and neither are medicines. Clothing should be clean and in good condition.",
    links: [{ label: "Browse needs", href: "/needs.html" }],
    followUps: ["how_offers", "most_needed", "dropoff"],
  },
  {
    id: "dropoff",
    label: "How does drop-off work?",
    group: "start",
    show: individuals,
    answer:
      "Each request has drop-off instructions from the organization, like an address and opening hours. Once your offer is accepted, they appear clearly on your dashboard under \"Ready to drop off\". Bring the items there, and the organization marks them delivered.",
    links: [{ label: "My offers", href: "/donor.html#offers" }],
    followUps: ["how_offers", "what_donate", "ending_soon"],
  },
  {
    id: "both_roles",
    label: "Can I donate and volunteer with one account?",
    group: "start",
    show: individuals,
    answer:
      "Yes! One account can do both. Tick both when you sign up, or turn the other one on later in your profile. You'll then see a switch in the top bar to move between Donating and Volunteering. Turning on volunteering means an admin checks your volunteer account first.",
    links: [{ label: "My profile", href: "/profile.html" }],
    followUps: ["how_donate", "how_volunteer"],
  },

  // ---------- For organizations (pre-written) ----------
  {
    id: "org_post",
    label: "How do I post a request?",
    group: "organization",
    show: organizations,
    answer:
      "Once an admin has approved your organization, go to Requests and press \"New donation request\". Add a title, the items and quantities you need, a deadline and drop-off instructions. An admin checks every request before donors can see it.",
    links: [{ label: "Post a request", href: "/organization.html?new=request" }],
    followUps: ["org_waiting", "org_accept", "ai_how"],
  },
  {
    id: "org_waiting",
    label: "Why is my request waiting for approval?",
    group: "organization",
    show: organizations,
    answer:
      "An admin checks every new request before it goes public, to keep the platform safe and accurate. This usually doesn't take long. If it's rejected, you'll see the admin's note explaining what to change. While it's waiting, you can still edit or delete it.",
    links: [{ label: "My requests", href: "/organization.html#requests" }],
    followUps: ["org_post", "who_checks"],
  },
  {
    id: "org_accept",
    label: "How do I accept offers?",
    group: "organization",
    show: organizations,
    answer:
      "Open Offers. Each offer shows the item, the amount and the donor's contact details, so you can arrange drop-off. Press Accept or Reject. When the items arrive, press \"Mark delivered\". The request becomes fulfilled automatically once everything has been delivered.",
    links: [{ label: "Offers", href: "/organization.html#offers" }],
    followUps: ["org_post", "org_cancel"],
  },
  {
    id: "org_cancel",
    label: "How do I cancel an event?",
    group: "organization",
    show: organizations,
    answer:
      "Open Events and press \"Cancel event\". You'll need to give a short reason, because approved volunteers and anyone with the event's link will see it. If nobody has applied yet, you can delete the event instead.",
    links: [{ label: "Events", href: "/organization.html#events" }],
    followUps: ["org_accept", "org_post"],
  },

  // ---------- Your account (pre-written; only what the site really does) ----------
  {
    id: "account_signup",
    label: "How do I sign up?",
    group: "account",
    show: visitors,
    answer:
      "Press Sign up and choose whether you're an individual or an organization. Individuals tick \"I want to donate\", \"I want to volunteer\" or both. You'll need your name, email and a password, and you must agree to the Privacy Notice and confirm you're 18 or older. Phone, postal code and area are optional.",
    links: [{ label: "Sign up", href: "/signup.html" }],
    followUps: ["account_login", "both_roles", "how_donate"],
  },
  {
    id: "account_login",
    label: "How do I log in or log out?",
    group: "account",
    show: everyone,
    answer:
      "To log in, press Log in at the top and enter your email and password. To log out, open the Account menu at the top right and press Log out.",
    links: [{ label: "Log in", href: "/login.html" }],
    followUps: ["account_password", "account_change"],
  },
  {
    id: "account_password",
    label: "I forgot my password",
    group: "account",
    show: everyone,
    answer:
      "Sorry — the site can't reset passwords yet, and there's no way to change your password on the site. Please email us using the address in the Privacy Notice, and we'll help you get back in.",
    links: [{ label: "Privacy Notice", href: "/privacy.html" }],
    followUps: ["account_login", "account_change"],
  },
  {
    id: "account_change",
    label: "How do I change my details?",
    group: "account",
    show: loggedIn,
    answer:
      "Open your Profile. You can change your name, phone, postal code and area, turn donating or volunteering on or off, and update when you're free, your interests and skills. Then press Save changes. Your email can't be changed on the site yet.",
    links: [{ label: "My profile", href: "/profile.html" }],
    followUps: ["account_delete", "account_password"],
  },
  {
    id: "account_delete",
    label: "How do I delete my account?",
    group: "account",
    show: everyone,
    answer:
      "If you donate or volunteer: open your Profile, go to \"Delete my account\", tick \"I understand this can't be undone\" and confirm. This removes your login, details and applications; past donations stay with organizations without your name. Organization accounts can't be deleted there — please email us using the address in the Privacy Notice.",
    links: [
      { label: "My profile", href: "/profile.html" },
      { label: "Privacy Notice", href: "/privacy.html" },
    ],
    followUps: ["account_change", "privacy"],
  },

  // ---------- About KampongShare (pre-written) ----------
  {
    id: "ai_how",
    label: "How does the AI work?",
    group: "about",
    show: everyone,
    answer:
      "Each request gets an urgency score from a clear formula: how close the deadline is, how much is still needed, and the organization's own urgency. The AI only explains the score in plain words and helps match what you can give. It never sees anyone's personal details. Everything it suggests is labelled \"AI-suggested\", and people always make the decisions.",
    followUps: ["who_checks", "privacy", "most_needed"],
  },
  {
    id: "who_checks",
    label: "Who checks the requests?",
    group: "about",
    show: everyone,
    answer:
      "Our admins. They approve every organization before it can post anything, and every request and event before the public can see it. If something looks wrong later, they can close it or cancel it.",
    followUps: ["ai_how", "privacy"],
  },

  // ---------- Privacy (fixed reply + link, no AI) ----------
  {
    id: "privacy",
    label: "How is my information protected?",
    group: "privacy",
    show: everyone,
    answer: "You can read how we handle your information in our Privacy Notice.",
    links: [{ label: "Privacy Notice", href: "/privacy.html" }],
    followUps: ["ai_how", "who_checks"],
  },

  // ---------- Right now (live public data + AI summary) ----------
  {
    id: "most_needed",
    label: "What's most needed this week?",
    group: "live",
    show: everyone,
    live: "most_needed",
    followUps: ["ending_soon", "my_area", "upcoming_events"],
  },
  {
    id: "ending_soon",
    label: "Which requests end soon?",
    group: "live",
    show: everyone,
    live: "ending_soon",
    followUps: ["most_needed", "my_area"],
  },
  {
    id: "upcoming_events",
    label: "What events are coming up?",
    group: "live",
    show: everyone,
    live: "upcoming_events",
    followUps: ["how_volunteer", "most_needed"],
  },
  {
    id: "my_area",
    label: "What's needed in my area?",
    group: "live",
    show: everyone,
    live: "areas",
    followUps: ["most_needed", "ending_soon"],
  },
];
