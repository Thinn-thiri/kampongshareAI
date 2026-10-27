// @ts-check
// Builds the help text the "Ask KampongShare" chat uses for typed questions (REQUIREMENTS.md 6.8).
// One source: the questions and answers in js/chat-questions.js, plus the short "Site rules" below
// (written from REQUIREMENTS.md). Writes two generated files — never edit those by hand:
//   netlify/functions/_lib/chat-help.md   the help text, readable
//   netlify/functions/_lib/chat-help.js   the same text + the questions, for chat-insights to import
// Run with: npm run chat-help   (npm run build runs it too)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import vm from "node:vm";

/** Facts from REQUIREMENTS.md the AI may use. No contact details, numbers or features beyond these. */
const SITE_RULES = `
- KampongShare is a community donation and volunteer platform for Singapore. Local organizations post what they need; people donate items or volunteer at events.
- Individual accounts can donate, volunteer, or both, on one account. Organization and admin accounts can't donate or volunteer. Nobody can sign up as an admin.
- Signing up needs a name, email, password, agreeing to the Privacy Notice and confirming you are 18 or older. Phone, postal code and area are optional. We never ask for NRIC/FIN, date of birth, race, religion, income, health information or photos of people.
- Donating: open Browse needs, press Offer on one item and choose how many (never more than is still needed). One active offer per item; to change the amount, cancel and offer again. The organization accepts or declines. Once accepted, the drop-off instructions show on the donor dashboard under "Ready to drop off". The organization marks it delivered; a request becomes fulfilled when everything is delivered.
- When a request is closed, its waiting offers are declined automatically ("Request closed"); accepted offers still go ahead.
- What can be donated: food, clothing, hygiene, household, baby and education items that organizations ask for. Food must be sealed, unopened and not past its expiry date. No cooked or home-made food and no medicines. Clothing should be clean and usable.
- Volunteering: an admin approves new volunteer accounts first; until then you can only browse events. Then press Volunteer on an event; the organization approves each application. You can withdraw while it is waiting; once approved, contact the organization if you can't make it. When an event has all the volunteers it needs it shows "Event full".
- Organizations: sign up as an organization, fill in the organization details, and wait for an admin to approve it. Then post requests (items, quantities, deadline, drop-off instructions) and events. An admin checks every request and event before the public sees it. After approval, a request's quantities, deadline, urgency and drop-off instructions can still change; its title, description and items can't. Closing a request can include a reason; cancelling an event needs a reason that volunteers will see. Requests still waiting for approval, and events nobody applied to, can be deleted.
- Organizations see a donor's or volunteer's contact details only after that person makes an offer to them or applies to their event. The public never sees donors' or volunteers' names or contact details.
- AI: each request gets an urgency score from a clear formula (deadline, how much is still needed, the organization's own urgency). The AI only explains the score and helps match what people can give. AI results are labelled "AI-suggested", the AI never receives personal details, and people always make the decisions.
- History: past offers, applications, requests and events stay in a History tab for 12 months.
- Accounts: sign up on the Sign up page (/signup.html); log in on the Log in page (/login.html) with email and password; log out from the Account menu at the top right. Forgot, reset or change a password: the site can't reset or change passwords yet (there is no reset link); email the address shown in the Privacy Notice (/privacy.html) and the team will help you get back in. The Profile page (/profile.html) lets you change your name, phone, postal code, area, donating/volunteering, availability, interests and skills (press Save changes), withdraw your consent, and see your data. Your email can't be changed on the site. People who donate or volunteer can delete their own account on the Profile page ("Delete my account", tick "I understand this can't be undone"): it removes the login, details and applications, cancels waiting offers, and keeps past donations without the name. Organization and admin accounts can't be deleted there: email the address shown in the Privacy Notice.
- Pages: Browse needs (/needs.html), Sign up (/signup.html), Log in (/login.html), Profile (/profile.html), How it works (/#how-heading), Privacy Notice (/privacy.html).
`.trim();

/** Reads CHAT_QUESTIONS from the browser file without running it in a page. */
function readQuestions() {
  const source = readFileSync(new URL("../js/chat-questions.js", import.meta.url), "utf8");
  const sandbox = { result: null };
  vm.runInNewContext(`${source}\nresult = CHAT_QUESTIONS;`, sandbox);
  /** @type {any[]} */
  const questions = /** @type {any} */ (sandbox.result) ?? [];
  return questions
    .filter((q) => typeof q.answer === "string")
    .map((q) => ({ id: q.id, label: q.label, answer: q.answer, links: q.links ?? [], followUps: q.followUps ?? [] }));
}

function main() {
  const questions = readQuestions();
  const markdown = [
    "<!-- Generated by scripts/build-chat-help.js — edit js/chat-questions.js (or the rules in that script) instead. -->",
    "# KampongShare help",
    "",
    "## Site rules",
    "",
    SITE_RULES,
    "",
    "## Questions and answers",
    "",
    ...questions.map((q) => `### ${q.label}\n\n${q.answer}\n`),
  ].join("\n");

  const module = `// @ts-check
// Generated by scripts/build-chat-help.js — do not edit. Edit js/chat-questions.js instead, then run npm run chat-help.

/** The help text typed questions are answered from (same as chat-help.md). */
export const HELP_TEXT = ${JSON.stringify(markdown)};

/** The pre-written questions, for matching a typed question to one of them. */
/** @type {{ id: string, label: string, answer: string, links: { label: string, href: string }[], followUps: string[] }[]} */
export const HELP_QUESTIONS = ${JSON.stringify(questions, null, 2)};
`;

  mkdirSync(new URL("../netlify/functions/_lib/", import.meta.url), { recursive: true });
  writeFileSync(new URL("../netlify/functions/_lib/chat-help.md", import.meta.url), `${markdown}\n`);
  writeFileSync(new URL("../netlify/functions/_lib/chat-help.js", import.meta.url), module);
  console.log(`Chat help built: ${questions.length} questions.`);
}

main();
