// @ts-check
// Languages: English, 简体中文 and Bahasa Melayu (REQUIREMENTS.md "Languages").
// Loaded in every page's <head> right after js/theme.js and the three dictionaries
// (js/i18n/en.js, zh.js, ms.js), so <html lang> is right and text is translated before anything is drawn.
//   t("signup.title")                 the text for the current language (English if a key is missing)
//   t("needs.count", { count: 3 })    {name} placeholders; a { one, other } entry picks the plural form
//   x-text="$t('common.offer')"       the same in Alpine; redraws when the language changes
//   <h1 data-i18n="signup.title">     static HTML (only on elements that hold just text)
//   data-i18n-rich="key"              like data-i18n, but **bold** becomes <strong> (built with the DOM, never innerHTML)
//   data-i18n-attr="aria-label:key; placeholder:key2"   attributes
// Never translate what people wrote (titles, descriptions, names, messages, reasons): show it as entered.

/** @typedef {'en' | 'zh' | 'ms'} Lang */

const LANG_KEY = "ks-lang";

/** The three languages, each named in its own script (no flags). */
const LANGUAGES = /** @type {{ code: Lang, htmlLang: string, locale: string, name: string, short: string }[]} */ ([
  { code: "en", htmlLang: "en", locale: "en-SG", name: "English", short: "EN" },
  { code: "zh", htmlLang: "zh-Hans", locale: "zh-SG", name: "中文（简体）", short: "中文" },
  { code: "ms", htmlLang: "ms", locale: "ms-SG", name: "Bahasa Melayu", short: "BM" },
]);

/** @type {Record<Lang, Record<string, any>>} */
const DICTIONARIES = { en: I18N_EN, zh: I18N_ZH, ms: I18N_MS };

/** @param {unknown} value @returns {value is Lang} */
function isLang(value) {
  return value === "en" || value === "zh" || value === "ms";
}

/** The saved choice, else the browser's language if it's Chinese or Malay, else English. @returns {Lang} */
function initialLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (isLang(saved)) return saved;
  } catch {
    // storage blocked: use the browser language
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const lower = String(tag).toLowerCase();
    if (lower.startsWith("zh")) return "zh";
    if (lower.startsWith("ms")) return "ms";
    if (lower.startsWith("en")) return "en";
  }
  return "en";
}

let currentLang = initialLang();

/** The chosen language. Inside Alpine, expressions that ask for it redraw on a switch. @returns {Lang} */
function getLang() {
  const store = /** @type {any} */ (window).Alpine?.store?.("i18n");
  if (store) void store.lang;
  return currentLang;
}

/** @param {Lang} [lang] */
function languageInfo(lang = currentLang) {
  return LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];
}

/**
 * "en-SG", "zh-SG" or "ms-SG", for Intl dates and numbers. Without a language it asks getLang(),
 * so dates and numbers shown by Alpine redraw on a language switch too.
 * @param {Lang} [lang]
 */
function locale(lang) {
  return languageInfo(lang ?? getLang()).locale;
}

/** 1234 → "1,234" in the current language. @param {number} value */
function formatNumber(value) {
  return new Intl.NumberFormat(locale()).format(value);
}

/** Warn about missing keys only while developing (never in production, and never with personal data). */
const I18N_DEV = ["localhost", "127.0.0.1"].includes(location.hostname);

/**
 * @param {Record<string, any>} dictionary
 * @param {string} key
 * @returns {any}
 */
function lookupKey(dictionary, key) {
  /** @type {any} */
  let node = dictionary;
  for (const part of key.split(".")) {
    if (node == null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return node;
}

/** @param {any} value @returns {boolean} a { one, other } plural entry */
function isPlural(value) {
  return value != null && typeof value === "object" && typeof value.other === "string";
}

/** True when the key exists in English (the source). @param {string} key */
function hasKey(key) {
  const value = lookupKey(I18N_EN, key);
  return typeof value === "string" || isPlural(value);
}

/**
 * The text for a key in the current language, with {name} placeholders filled in.
 * Numbers are formatted for the language. A missing key falls back to English.
 * @param {string} key
 * @param {Record<string, string | number | null | undefined>} [params]
 * @param {Lang} [lang] another language than the page's (e.g. the language a chat question was typed in)
 * @returns {string}
 */
function t(key, params = {}, lang) {
  // Inside Alpine, reading the store makes every expression that calls t() redraw on a language switch.
  const store = /** @type {any} */ (window).Alpine?.store?.("i18n");
  if (store) void store.lang;
  const use = lang ?? currentLang;
  let value = lookupKey(DICTIONARIES[/** @type {Lang} */ (use)] ?? I18N_EN, key);
  if (value == null || (typeof value !== "string" && !isPlural(value))) {
    if (I18N_DEV) console.warn(`[i18n] missing ${use}: ${key}`);
    value = lookupKey(I18N_EN, key);
    if (value == null) return key;
  }
  if (isPlural(value)) {
    const form = new Intl.PluralRules(locale(use)).select(Number(params.count ?? 0));
    value = value[form] ?? value.other;
  }
  return String(value).replace(/\{(\w+)\}/g, (match, name) => {
    const param = params[name];
    if (param == null) return match;
    return typeof param === "number" ? new Intl.NumberFormat(locale(use)).format(param) : String(param);
  });
}

/**
 * The label for a fixed value (statuses, urgency, categories, roles, days, times, interests, skills),
 * e.g. enumLabel("offerStatus", "pending"). Unknown values are shown as they are.
 * @param {string} kind
 * @param {string | null | undefined} value
 * @returns {string}
 */
function enumLabel(kind, value) {
  if (value == null) return "";
  const key = `enum.${kind}.${String(value).replace(/[^A-Za-z0-9]+/g, "_")}`;
  return hasKey(key) ? t(key) : String(value);
}

/**
 * A list of fixed values as words, e.g. enumList("interest", ["elderly care", "environment"]) → "Elderly care, Environment".
 * @param {string} kind
 * @param {string[] | null | undefined} values
 * @returns {string} "" when empty
 */
function enumList(kind, values) {
  return (values ?? []).map((value) => enumLabel(kind, value)).join(t("common.listSeparator"));
}

/**
 * Picker options whose labels follow the chosen language, e.g. enumOptions("category", ["food", "baby"])
 * → [{ value: "food", label: "Food" }, …]. The label is a getter, so pickers redraw on a switch.
 * @template {string} V
 * @param {string} kind
 * @param {readonly V[]} values
 * @returns {{ value: V, readonly label: string }[]}
 */
function enumOptions(kind, values) {
  return values.map((value) => ({
    value,
    get label() {
      return enumLabel(kind, value);
    },
  }));
}

/**
 * Tabs, filters and other choices whose labels are translation keys, e.g.
 * labelledOptions({ active: "common.active", history: "common.history" }) → [{ value: "active", label: "Active" }, …].
 * The label is a getter, so it follows the chosen language.
 * @template {string} V
 * @param {Record<V, string>} keys value → translation key
 * @returns {{ value: V, readonly label: string }[]}
 */
function labelledOptions(keys) {
  return /** @type {[V, string][]} */ (Object.entries(keys)).map(([value, key]) => ({
    value,
    get label() {
      return t(key);
    },
  }));
}

/**
 * A Singapore area name in the current language (Chinese uses the official place names).
 * The stored value never changes; names we don't know are shown as entered.
 * @param {string | null | undefined} area
 * @returns {string}
 */
function areaLabel(area) {
  if (!area) return "";
  const key = `area.${area.replace(/[^A-Za-z0-9]+/g, "_")}`;
  return hasKey(key) ? t(key) : area;
}

/**
 * Puts text with **bold** parts into an element, building <strong> nodes (no HTML parsing).
 * @param {Element} element
 * @param {string} text
 */
function setRichText(element, text) {
  element.textContent = "";
  text.split("**").forEach((part, index) => {
    if (!part) return;
    if (index % 2 === 1) {
      const strong = document.createElement("strong");
      strong.textContent = part;
      element.append(strong);
    } else {
      element.append(part);
    }
  });
}

/** @param {Element} element */
function translateElement(element) {
  const key = element.getAttribute("data-i18n");
  if (key) element.textContent = t(key);
  const richKey = element.getAttribute("data-i18n-rich");
  if (richKey) setRichText(element, t(richKey));
  const attrs = element.getAttribute("data-i18n-attr");
  if (attrs) {
    for (const pair of attrs.split(";")) {
      const [name, attrKey] = pair.split(":").map((part) => part.trim());
      if (name && attrKey) element.setAttribute(name, t(attrKey));
    }
  }
}

const I18N_SELECTOR = "[data-i18n], [data-i18n-rich], [data-i18n-attr]";

/** Translates an element and everything inside it. @param {Node} root */
function translateTree(root) {
  if (!(root instanceof Element)) return;
  if (root.matches(I18N_SELECTOR)) translateElement(root);
  for (const element of root.querySelectorAll(I18N_SELECTOR)) translateElement(element);
}

/**
 * Switches language without a reload: saves it, updates <html lang>, every data-i18n element and
 * every Alpine $t(), then tells hand-built parts (e.g. map popups) with a "language-changed" event.
 * @param {Lang} lang
 */
function setLang(lang) {
  if (!isLang(lang)) return;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // storage blocked: the choice lasts until the page is closed
  }
  currentLang = lang;
  document.documentElement.lang = languageInfo(lang).htmlLang;
  translateTree(document.documentElement);
  const store = /** @type {any} */ (window).Alpine?.store?.("i18n");
  if (store) store.lang = lang;
  window.dispatchEvent(new CustomEvent("language-changed", { detail: lang }));
}

document.documentElement.lang = languageInfo().htmlLang;

// Translate elements as soon as the page (or Alpine) adds them, so the other language never flashes in.
new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) translateTree(node);
  }
}).observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener("DOMContentLoaded", () => translateTree(document.documentElement));

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.store("i18n", { lang: currentLang });
  Alpine.magic("t", () => t);

  // The language switcher in the top bar: a menu of the three languages (same pattern as themeMenu).
  Alpine.data("langMenu", () => ({
    open: false,
    options: LANGUAGES,

    get lang() {
      return Alpine.store("i18n").lang;
    },

    get current() {
      return languageInfo(this.lang);
    },

    /** Always in all three languages, plus the visible name (WCAG 2.5.3 label in name). */
    get buttonLabel() {
      return `Language / 语言 / Bahasa — ${this.current.name}`;
    },

    toggle() {
      this.open = !this.open;
      // focus the checked item so arrow keys work straight away
      if (this.open) setTimeout(() => this.items()[LANGUAGES.findIndex((l) => l.code === this.lang)]?.focus(), 0);
    },

    /** @param {Lang} lang */
    pick(lang) {
      setLang(lang);
      this.close(true);
    },

    /** @param {boolean} refocus return focus to the button (Escape or after picking) */
    close(refocus) {
      if (!this.open) return;
      this.open = false;
      if (refocus) /** @type {any} */ (this).$refs.langButton.focus();
    },

    /** @returns {HTMLElement[]} */
    items() {
      return [.../** @type {any} */ (this).$root.querySelectorAll('[role="menuitemradio"]')];
    },

    /** Up / Down move between the languages. @param {number} step */
    move(step) {
      const items = this.items();
      const at = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
      items[(at + step + items.length) % items.length]?.focus();
    },
  }));
});
