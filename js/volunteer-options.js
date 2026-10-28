// @ts-check
// Volunteer choices shared by the sign-up form and the profile page.
// Days and times must match the values the database accepts (profiles checks).

// Labels follow the chosen language (enumOptions in js/i18n.js); the values never change.

const DAY_OPTIONS = enumOptions("day", ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

const TIME_OPTIONS = enumOptions("time", ["morning", "afternoon", "evening"]);

// i18n-ignore-start — stored values; the labels come from enumOptions
const INTEREST_OPTIONS = enumOptions("interest", /** @type {string[]} */ ([
  "food distribution",
  "elderly care",
  "children and education",
  "packing and sorting",
  "environment",
  "events and outreach",
]));

const SKILL_OPTIONS = enumOptions("skill", /** @type {string[]} */ ([
  "driving",
  "first aid",
  "cooking",
  "tutoring",
  "languages",
  "lifting and moving",
  "photography",
  "it support",
]));
// i18n-ignore-end
