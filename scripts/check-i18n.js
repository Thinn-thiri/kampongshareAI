// @ts-check
// Checks the translations (REQUIREMENTS.md "Languages"). Run with: node scripts/check-i18n.js
//   1. js/i18n/en.js, zh.js and ms.js have exactly the same keys, with the same {placeholders};
//      the same for the server's words in netlify/lib/messages.js.
//   2. Every key the code uses (t("…"), $t('…'), data-i18n…, labelKey, chat questions) exists in English.
//   3. Every "raise exception" message in supabase/migrations/ has a translation (DB_ERRORS in js/ui.js).
//   4. Text in any page (or Alpine expression) that isn't using a translation key; translate="no" marks sample data.
//   5. English text left in the JavaScript (toasts, dialogs, form errors, labels) instead of t("…").
// Prints what's wrong and exits with 1, so it can run before a commit or a deploy.

import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";
import { MESSAGES } from "../netlify/lib/messages.js";

const ROOT = new URL("../", import.meta.url);
/** @param {string} path */
const read = (path) => readFileSync(new URL(path, ROOT), "utf8");

/** Every page: all the text the site shows must be translated. */
const CHECKED_PAGES = readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();

/** Text that is the same in every language. */
const SAME_EVERYWHERE = new Set(["KampongShare", "WhatsApp", "Facebook", "privacy@kampongshare.example.com", "Language / 语言 / Bahasa"]);

/** @type {string[]} */
const problems = [];

/**
 * Runs browser script files in a sandbox and returns the named global.
 * @param {string[]} files
 * @param {string} name
 * @returns {any}
 */
function loadGlobal(files, name) {
  /** @type {Record<string, any>} */
  const sandbox = { result: undefined };
  vm.runInNewContext(`${files.map(read).join("\n;\n")}\n;result = ${name};`, sandbox);
  return sandbox.result;
}

/**
 * Flattens a dictionary to "a.b.c" → text. Plural entries become "key#one" / "key#other".
 * @param {Record<string, any>} node
 * @param {string} [prefix]
 * @param {Map<string, string>} [out]
 * @returns {Map<string, string>}
 */
function flatten(node, prefix = "", out = new Map()) {
  for (const [name, value] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (typeof value === "string") out.set(key, value);
    else if (value && typeof value === "object" && typeof value.other === "string" && typeof value.one === "string" && Object.keys(value).length === 2) {
      out.set(`${key}#one`, value.one);
      out.set(`${key}#other`, value.other);
    } else if (value && typeof value === "object") flatten(value, key, out);
    else problems.push(`${key}: not text (${typeof value})`);
  }
  return out;
}

/** @param {string} text */
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

/**
 * @param {string} label
 * @param {Record<string, Record<string, any>>} languages  { en, zh, ms }
 * @returns {Map<string, string>} the English keys
 */
function compareLanguages(label, languages) {
  const en = flatten(languages.en);
  for (const [lang, dictionary] of Object.entries(languages)) {
    if (lang === "en") continue;
    const other = flatten(dictionary);
    for (const key of en.keys()) if (!other.has(key)) problems.push(`${label}: ${lang} is missing ${key}`);
    for (const key of other.keys()) if (!en.has(key)) problems.push(`${label}: ${lang} has ${key}, which English doesn't`);
    for (const [key, text] of en) {
      const translated = other.get(key);
      if (translated === undefined) continue;
      if (placeholders(text) !== placeholders(translated)) {
        problems.push(`${label}: ${lang} ${key} has {${placeholders(translated)}} but English has {${placeholders(text)}}`);
      }
      if (text.trim() && !translated.trim()) problems.push(`${label}: ${lang} ${key} is empty`);
    }
  }
  return en;
}

// ---------- 1. same keys and placeholders ----------
const browser = {
  en: loadGlobal(["js/i18n/en.js"], "I18N_EN"),
  zh: loadGlobal(["js/i18n/zh.js"], "I18N_ZH"),
  ms: loadGlobal(["js/i18n/ms.js"], "I18N_MS"),
};
const english = compareLanguages("js/i18n", browser);
compareLanguages("netlify/lib/messages.js", MESSAGES);

/** @param {string} key */
const hasKey = (key) => english.has(key) || english.has(`${key}#other`);

// ---------- 2. every key used exists ----------
/** @param {string} dir @returns {string[]} */
const jsFiles = (dir) => readdirSync(new URL(dir, ROOT)).filter((f) => f.endsWith(".js")).map((f) => `${dir}${f}`);
const htmlFiles = readdirSync(ROOT).filter((f) => f.endsWith(".html"));
const KEY_PATTERNS = [
  /(?:^|[^\w$.])\$?t\(\s*(["'`])([\w.]+)\1/g, // t("key") and $t('key') (static keys only)
  /data-i18n(?:-rich)?="([\w.]+)"/g,
  /labelKey: "([\w.]+)"/g,
];
for (const file of [...jsFiles("js/").filter((f) => f !== "js/i18n.js"), ...htmlFiles]) {
  const source = read(file);
  for (const pattern of KEY_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const key = match[match.length - 1];
      if (!hasKey(key)) problems.push(`${file}: uses ${key}, which isn't in js/i18n/en.js`);
    }
  }
  for (const match of source.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const pair of match[1].split(";")) {
      const key = pair.split(":")[1]?.trim() ?? "";
      if (!hasKey(key)) problems.push(`${file}: data-i18n-attr uses ${key}, which isn't in js/i18n/en.js`);
    }
  }
}
// chat questions: every question has a label (and pre-written ones an answer), every group a title
const questions = loadGlobal(["js/chat-questions.js"], "CHAT_QUESTIONS");
for (const question of questions) {
  if (!hasKey(`chat.q.${question.id}.label`)) problems.push(`chat question ${question.id}: no chat.q.${question.id}.label`);
  if (!question.live && !english.get(`chat.q.${question.id}.answer`)) problems.push(`chat question ${question.id}: no answer`);
  if (!hasKey(`chat.group.${question.group}`)) problems.push(`chat group ${question.group}: no chat.group.${question.group}`);
}

// ---------- 3. database messages ----------
const uiSource = read("js/ui.js");
const dbStart = uiSource.indexOf("const DB_ERRORS = [");
const dbEnd = uiSource.indexOf("\n];\n", dbStart);
/** @type {{ pattern: RegExp, key: string }[]} */
const dbErrors = vm.runInNewContext(`${uiSource.slice(dbStart, dbEnd + 3)}\nDB_ERRORS`);
for (const entry of dbErrors) if (!hasKey(entry.key)) problems.push(`DB_ERRORS: ${entry.key} isn't in js/i18n/en.js`);
const FILLERS = ["3", "bags", "Rice", "pending", "accepted"];
for (const file of readdirSync(new URL("supabase/migrations/", ROOT)).filter((f) => f.endsWith(".sql"))) {
  for (const match of read(`supabase/migrations/${file}`).matchAll(/raise exception '((?:[^']|'')*)'/gi)) {
    const message = match[1].replace(/''/g, "'");
    const parts = message.split("%");
    // try sample values for each % (numbers, units, names, statuses)
    let samples = [parts[0]];
    for (const part of parts.slice(1)) samples = samples.flatMap((start) => FILLERS.map((filler) => `${start}${filler}${part}`));
    if (!samples.some((sample) => dbErrors.some((entry) => entry.pattern.test(sample)))) {
      problems.push(`${file}: no translation for the database message "${message}" (add it to DB_ERRORS in js/ui.js)`);
    }
  }
}

// ---------- 4. untranslated text in every page ----------
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const TRANSLATED_ATTRS = ["aria-label", "placeholder", "title", "alt"];

/** @param {string} text */
function needsKey(text) {
  const plain = text.replace(/&\w+;|&#\d+;/g, " ").replace(/\s+/g, " ").trim();
  if (!plain || SAME_EVERYWHERE.has(plain)) return false;
  return /\p{L}/u.test(plain); // only text with letters (not "·", "*", numbers)
}

for (const page of CHECKED_PAGES) {
  const html = read(page)
    .replace(/<!--[\s\S]*?-->|<!doctype[^>]*>/gi, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
  /** @type {{ tag: string, covered: boolean }[]} */
  const stack = [];
  const tokens = html.matchAll(/<\/?([a-zA-Z][\w-]*)((?:[^<>"']|"[^"]*"|'[^']*')*)\/?>|([^<]+)/g);
  for (const token of tokens) {
    const [whole, tagName, attrs = "", text] = token;
    if (text !== undefined) {
      if (stack.some((element) => element.covered)) continue;
      if (needsKey(text)) problems.push(`${page}: text without a translation key: "${text.replace(/\s+/g, " ").trim().slice(0, 80)}"`);
      continue;
    }
    const tag = tagName.toLowerCase();
    if (whole.startsWith("</")) {
      const at = stack.map((element) => element.tag).lastIndexOf(tag);
      if (at >= 0) stack.length = at;
      continue;
    }
    // translate="no" (standard HTML) marks sample data, names and code that stay as they are
    const covered = /\s(data-i18n|data-i18n-rich|x-text|x-html)=|\stranslate="no"/.test(attrs);
    for (const name of /\stranslate="no"/.test(attrs) ? [] : TRANSLATED_ATTRS) {
      const value = attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
      if (value === undefined || !needsKey(value)) continue;
      const translated = new RegExp(`data-i18n-attr="[^"]*\\b${name}:`).test(attrs) || new RegExp(`(?:^|\\s)(?::|x-bind:)${name}=`).test(attrs);
      if (!translated) problems.push(`${page}: ${name}="${value}" without a translation key`);
    }
    if (!VOID.has(tag) && !whole.endsWith("/>")) stack.push({ tag, covered });
  }
  // data-i18n replaces the element's whole text, so it must not hold other elements
  for (const match of read(page).matchAll(/<(\w+)[^<>]*\sdata-i18n(?:-rich)?="([\w.]+)"[^<>]*>([^]*?)<\/\1>/g)) {
    if (/<[a-z]/i.test(match[3]) && !/^(?:\s|<strong>[^<]*<\/strong>|[^<])*$/.test(match[3])) {
      problems.push(`${page}: data-i18n="${match[2]}" is on an element that holds other elements (they would be removed)`);
    }
  }
}

// ---------- 5. English left in Alpine expressions and in the JavaScript ----------
/**
 * True for a string that reads like English for people (not a class name, key, path, value or code).
 * @param {string} literal the text between the quotes
 */
function looksLikeEnglish(literal) {
  const text = literal.replace(/\$\{[^}]*\}/g, " ").replace(/KampongShare/g, " ").trim();
  if (!/[A-Za-z]{2,}/.test(text)) return false;
  if (/\w\(|\)\s*[.?:]|===|!==|=>|\?\.|\|\||&&|\$\w|^\w+ in \(?\w/.test(text)) return false; // code inside a string
  if (/^[\w.]+$/.test(text) && !/^[A-Z][a-z]+$/.test(text)) return false; // keys, ids, values ("pending", "common.save")
  if (/^[a-z0-9:/_\-.\s[\]()!>*]+$/.test(text) && /-|:/.test(text)) return false; // class names, selectors ("badge badge-info")
  if (/^(\/|#|https?:|mailto:|data:|[a-z]+\/[a-z+]+|Content-Type|Bearer\b|\d+ \d+px)/.test(text)) return false; // paths, links, headers
  if (/^[a-z_]+(,\s*[a-z_.()!:*]+)+$/.test(text)) return false; // database column lists ("id, title, status")
  return /[A-Z][a-z]|\s[a-z]{2,}/.test(text);
}

// Alpine expressions in the HTML: string literals that aren't inside $t(…)
for (const page of CHECKED_PAGES) {
  const html = read(page).replace(/<script\b[\s\S]*?<\/script>/gi, "");
  for (const match of html.matchAll(/\s(?:x-text|x-html|:aria-label|:title|:placeholder|:alt|x-bind:aria-label)="([^"]*)"/g)) {
    for (const literal of match[1].matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
      const before = match[1].slice(0, literal.index);
      if (/(?:\$t|\bt|enumLabel|areaLabel)\(\s*$/.test(before)) continue;
      if (looksLikeEnglish(literal[2])) problems.push(`${page}: English in an Alpine expression: ${literal[0].slice(0, 70)}`);
    }
  }
}

// The JavaScript, read with TypeScript's parser (it's installed with the tools; skipped if it isn't).
/** Functions whose string arguments are keys, selectors, values or matching — never text for people. */
const NOT_TEXT_CALLS = new Set(
  ("t enumLabel enumOptions hasKey areaLabel statCard badgeEntry includes startsWith endsWith test match replace split " +
    "querySelector querySelectorAll getElementById closest matches getAttribute removeAttribute hasAttribute addEventListener " +
    "removeEventListener CustomEvent createElement from select eq neq in is order or not rpc filter fetch getItem setItem " +
    "removeItem expectUpdated warn log info debug matchMedia toLocaleString toLocaleDateString toLocaleTimeString data store magic load fillText font").split(" "),
);
let ts = null;
try {
  ts = (await import("typescript")).default;
} catch {
  console.warn("(TypeScript isn't installed, so English left in the JavaScript wasn't checked.)");
}
if (ts) {
  for (const file of jsFiles("js/").filter((f) => f !== "js/i18n.js")) {
    const source = read(file);
    const lines = source.split("\n");
    const ignored = new Set();
    let skipping = false;
    lines.forEach((line, index) => {
      if (line.includes("i18n-ignore-start")) skipping = true;
      if (skipping || line.includes("i18n-ignore")) ignored.add(index);
      if (line.includes("i18n-ignore-end")) skipping = false;
    });
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    /** @param {any} node */
    const visit = (node) => {
      const isText = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node);
      if (isText) {
        const text = ts.isTemplateExpression(node) ? node.getText().slice(1, -1) : node.text;
        const line = tree.getLineAndCharacterOfPosition(node.getStart()).line;
        const parent = node.parent;
        const callee = parent && ts.isCallExpression(parent) ? parent.expression : parent && ts.isNewExpression(parent) ? parent.expression : null;
        const calleeName = callee ? (ts.isPropertyAccessExpression(callee) ? callee.name.text : callee.getText()) : "";
        const isPropertyName = parent && (ts.isPropertyAssignment(parent) || ts.isPropertyAccessExpression(parent)) && parent.name === node;
        const isMarkup = /<\w/.test(text);
        if (!ignored.has(line) && !NOT_TEXT_CALLS.has(calleeName) && !isPropertyName && !isMarkup && looksLikeEnglish(text)) {
          problems.push(`${file}:${line + 1}: English text not using t(): ${node.getText().slice(0, 70)}`);
        }
        if (!ts.isTemplateExpression(node)) return;
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
}

if (problems.length) {
  console.error(`Translation check: ${problems.length} problem(s)\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`Translation check passed: ${english.size} keys in English, Chinese and Malay; every page and script translated.`);
