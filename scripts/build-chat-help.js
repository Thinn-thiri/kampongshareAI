// @ts-check
// Builds the help text the "Ask KampongShare" chat uses for typed questions (REQUIREMENTS.md 6.8).
// One source: the questions in js/chat-questions.js with their words from js/i18n/en.js, zh.js and ms.js,
// plus the short "Site rules" below (written from REQUIREMENTS.md). The help text is English (the AI
// reads it and answers in the needed language); the pre-written answers are kept in all three languages. Writes two generated files — never edit those by hand:
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
- Messages: logged-in donors and volunteers can message any approved organization with the "Message organization" button on its page, its events and its requests (at most 5 new conversations a day). Organizations can message only donors who offered to them ("Message donor") and volunteers who applied to their events ("Message volunteer"). Donors and volunteers can't message each other. Conversations are on the Messages page (/messages.html, the speech-bubble button in the top bar shows the unread number). Text only, up to 1000 characters. Only the two people in a conversation can read it; either side can block it (no new messages) or report a message, and admins read a message only if it is reported. "Delete conversation" (in the conversation's menu) removes it from your own inbox only: the other person keeps their copy, and a new message from them brings it back with only the new messages. Messages are kept for 12 months. A message in a different language from yours is translated automatically by AI (phone numbers, emails and links are removed first; each message is translated once); you can always see the original, and turn automatic translation off on the Messages page. Donations are always free: never send money, bank details or passwords.
- Languages: the site can be used in English, Simplified Chinese (中文) and Malay (Bahasa Melayu). Change it with the globe button in the top bar; the choice is remembered in this browser.
- Pages: Browse needs (/needs.html), Sign up (/signup.html), Log in (/login.html), Profile (/profile.html), Messages (/messages.html), How it works (/#how-heading), Privacy Notice (/privacy.html).
`.trim();

const LANGS = /** @type {const} */ (["en", "zh", "ms"]);

/** Runs browser script files in a sandbox (not in a page) and returns the named global. */
/** @param {string[]} files @param {string} name @returns {any} */
function loadGlobal(files, name) {
  const source = files.map((file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8")).join("\n;\n");
  const sandbox = { result: null };
  vm.runInNewContext(`${source}\nresult = ${name};`, sandbox);
  return /** @type {any} */ (sandbox).result;
}

/**
 * The pre-written questions with their words in every language (from js/i18n/*.js).
 * label / answer / links[].label are English (the help text); labels / answers / links[].labels hold all three.
 */
function readQuestions() {
  const dictionaries = {
    en: loadGlobal(["js/i18n/en.js"], "I18N_EN"),
    zh: loadGlobal(["js/i18n/zh.js"], "I18N_ZH"),
    ms: loadGlobal(["js/i18n/ms.js"], "I18N_MS"),
  };
  /** @param {'en' | 'zh' | 'ms'} lang @param {string} key @returns {string} */
  const text = (lang, key) => key.split(".").reduce((node, part) => node?.[part], dictionaries[lang]) ?? "";
  /** @param {(lang: 'en' | 'zh' | 'ms') => string} pick */
  const inEvery = (pick) => Object.fromEntries(LANGS.map((lang) => [lang, pick(lang)]));
  /** @type {any[]} */
  const questions = loadGlobal(["js/chat-questions.js"], "CHAT_QUESTIONS") ?? [];
  return questions
    .filter((q) => !q.live)
    .map((q) => ({
      id: q.id,
      label: text("en", `chat.q.${q.id}.label`),
      answer: text("en", `chat.q.${q.id}.answer`),
      labels: inEvery((lang) => text(lang, `chat.q.${q.id}.label`)),
      answers: inEvery((lang) => text(lang, `chat.q.${q.id}.answer`)),
      links: (q.links ?? []).map((/** @type {{ labelKey: string, href: string }} */ link) => ({
        href: link.href,
        label: text("en", link.labelKey),
        labels: inEvery((lang) => text(lang, link.labelKey)),
      })),
      followUps: q.followUps ?? [],
    }));
}

function main() {
  const questions = readQuestions();
  const markdown = [
    "<!-- Generated by scripts/build-chat-help.js — edit js/chat-questions.js, js/i18n/en.js (or the rules in that script) instead. -->",
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
// Generated by scripts/build-chat-help.js — do not edit. Edit js/chat-questions.js and js/i18n/*.js instead, then run npm run chat-help.

/** The help text typed questions are answered from (same as chat-help.md). */
export const HELP_TEXT = ${JSON.stringify(markdown)};

/** The pre-written questions, for matching a typed question to one of them (words in en, zh and ms). */
/** @typedef {{ en: string, zh: string, ms: string }} InEveryLanguage */
/** @type {{ id: string, label: string, answer: string, labels: InEveryLanguage, answers: InEveryLanguage, links: { href: string, label: string, labels: InEveryLanguage }[], followUps: string[] }[]} */
export const HELP_QUESTIONS = ${JSON.stringify(questions, null, 2)};
`;

  mkdirSync(new URL("../netlify/functions/_lib/", import.meta.url), { recursive: true });
  writeFileSync(new URL("../netlify/functions/_lib/chat-help.md", import.meta.url), `${markdown}\n`);
  writeFileSync(new URL("../netlify/functions/_lib/chat-help.js", import.meta.url), module);
  console.log(`Chat help built: ${questions.length} questions.`);
}

main();
