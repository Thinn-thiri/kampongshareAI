// @ts-check
// Light / dark mode. Loaded first in every page's <head>, before the stylesheets, so the right
// theme is set before anything is drawn (no white flash). The choice is "system" (follow the
// device), "light" or "dark", remembered in localStorage under "ks-theme". If storage is blocked
// the page still works and simply follows the device.

/** @typedef {'system' | 'light' | 'dark'} ThemeChoice */

const THEME_KEY = "ks-theme";

/** The three choices in the account / settings menu (Phosphor icon classes). */
// the labels shown are theme.system / theme.light / theme.dark in js/i18n/*.js
// i18n-ignore-start
const THEME_OPTIONS = /** @type {{ value: ThemeChoice, label: string, icon: string }[]} */ ([
  { value: "system", label: "System", icon: "ph ph-monitor" },
  { value: "light", label: "Light", icon: "ph ph-sun" },
  { value: "dark", label: "Dark", icon: "ph ph-moon" },
]);
// i18n-ignore-end

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

/** @returns {ThemeChoice} */
function getThemeChoice() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // storage blocked: follow the device
  }
  return "system";
}

/**
 * Sets data-theme on <html> from the choice (and the device setting for "system").
 * @param {ThemeChoice} choice
 */
function applyTheme(choice) {
  const dark = choice === "dark" || (choice === "system" && systemDark.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

/**
 * Saves and applies a new choice, with a short colour transition (none on first load).
 * @param {ThemeChoice} choice
 */
function setTheme(choice) {
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // storage blocked: the choice lasts until the page is closed
  }
  const root = document.documentElement;
  root.classList.add("theme-changing");
  applyTheme(choice);
  setTimeout(() => root.classList.remove("theme-changing"), 200);
  window.dispatchEvent(new CustomEvent("theme-changed", { detail: choice }));
}

/** The choice made on this page (kept here too, so it works when storage is blocked). */
let currentThemeChoice = getThemeChoice();
applyTheme(currentThemeChoice);

// "System": follow the device live, without a reload.
systemDark.addEventListener("change", () => {
  if (currentThemeChoice === "system") applyTheme("system");
});
window.addEventListener("theme-changed", (event) => {
  currentThemeChoice = /** @type {CustomEvent<ThemeChoice>} */ (event).detail;
});

