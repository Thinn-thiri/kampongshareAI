// @ts-check
// Small UI helpers shared by every page. Class names are written out in full so Tailwind finds them.

/** @type {Record<string, string>} */
const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/**
 * Makes user-entered text safe to put inside HTML.
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * Formats a date for Singapore, e.g. "23 Oct 2026" or "Fri, 23 Oct 2026, 2:30 pm".
 * @param {string | Date | null | undefined} value
 * @param {boolean} [withTime]
 * @returns {string}
 */
function formatDate(value, withTime = false) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  /** @type {Intl.DateTimeFormatOptions} */
  const options = withTime
    ? { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { day: "numeric", month: "short", year: "numeric" };
  return date.toLocaleString("en-SG", options);
}

/**
 * Removes spaces, dashes and a leading +65 / 65 from a Singapore phone number.
 * @param {string} phone
 * @returns {string}
 */
function normalisePhone(phone) {
  const digits = phone.replace(/[\s-]/g, "");
  return digits.replace(/^(\+65|65)(?=\d{8}$)/, "");
}

/**
 * True for an 8-digit Singapore phone number (spaces and +65 allowed).
 * @param {string} phone
 * @returns {boolean}
 */
function isValidSgPhone(phone) {
  return /^[3689]\d{7}$/.test(normalisePhone(phone));
}

/** Singapore areas for pickers and filters (public area names only). */
const SG_AREAS = [
  "Ang Mo Kio", "Bedok", "Bishan", "Bukit Batok", "Bukit Merah", "Bukit Panjang", "Bukit Timah",
  "Choa Chu Kang", "Clementi", "Geylang", "Hougang", "Jurong East", "Jurong West", "Kallang",
  "Pasir Ris", "Punggol", "Queenstown", "Sembawang", "Sengkang", "Serangoon", "Tampines",
  "Toa Payoh", "Woodlands", "Yishun",
];

/** @type {Record<'success' | 'error', string>} */
const TOAST_CLASS = {
  success: "toast toast-success",
  error: "toast toast-error",
};

/**
 * The screen-reader-announced area that holds toasts (created once per page).
 * @returns {HTMLElement}
 */
function getToastRegion() {
  let region = document.getElementById("toast-region");
  if (!region) {
    region = document.createElement("div");
    region.id = "toast-region";
    region.className = "toast-region";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.append(region);
  }
  return region;
}

/**
 * Shows a short message that hides itself after 4 seconds.
 * @param {string} message
 * @param {'success' | 'error'} [type]
 * @returns {void}
 */
function toast(message, type = "success") {
  const item = document.createElement("div");
  item.className = TOAST_CLASS[type];
  item.textContent = message;
  getToastRegion().append(item);
  setTimeout(() => item.remove(), 4000);
}

/**
 * Asks the user to confirm an action. Resolves true on confirm, false on cancel or Escape.
 * @param {string} message
 * @param {{ title?: string, confirmText?: string, cancelText?: string, danger?: boolean }} [options]
 * @returns {Promise<boolean>}
 */
function confirmDialog(message, options = {}) {
  const { title = "Are you sure?", confirmText = "Confirm", cancelText = "Cancel", danger = false } = options;
  const dialog = document.createElement("dialog");
  dialog.className = "dialog";
  dialog.setAttribute("aria-labelledby", "confirm-dialog-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="confirm-dialog-title" class="text-lg font-semibold">${escapeHtml(title)}</h2>
      <p class="mt-2 text-muted">${escapeHtml(message)}</p>
      <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button class="btn btn-secondary" value="cancel">${escapeHtml(cancelText)}</button>
        <button class="${danger ? "btn btn-danger" : "btn btn-primary"}" value="confirm">${escapeHtml(confirmText)}</button>
      </div>
    </form>`;
  document.body.append(dialog);
  return new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () => {
        resolve(dialog.returnValue === "confirm");
        dialog.remove();
      },
      { once: true },
    );
    dialog.showModal();
  });
}

/**
 * Like confirmDialog, but also asks for a reason (e.g. why a request is closed or an event cancelled).
 * Resolves with the trimmed reason ("" when optional and left empty), or null when cancelled.
 * @param {string} message
 * @param {{ title?: string, label?: string, required?: boolean, maxLength?: number, confirmText?: string, cancelText?: string, danger?: boolean, warning?: string }} [options]
 * @returns {Promise<string | null>}
 */
function reasonDialog(message, options = {}) {
  const {
    title = "Are you sure?",
    label = "Reason",
    required = false,
    maxLength = 300,
    confirmText = "Confirm",
    cancelText = "Cancel",
    danger = false,
    warning = "",
  } = options;
  const dialog = document.createElement("dialog");
  dialog.className = "dialog";
  dialog.setAttribute("aria-labelledby", "reason-dialog-title");
  dialog.innerHTML = `
    <form method="dialog" novalidate>
      <h2 id="reason-dialog-title" class="text-lg font-semibold">${escapeHtml(title)}</h2>
      <p class="mt-2 text-muted">${escapeHtml(message)}</p>
      ${warning ? `<p class="mt-3 rounded-md bg-warning-soft p-3 text-sm text-warning">${escapeHtml(warning)}</p>` : ""}
      <div class="mt-4">
        <label for="reason-dialog-input" class="label">${escapeHtml(label)}${
          required ? ' <span class="text-danger" aria-hidden="true">*</span>' : ' <span class="font-normal text-muted">(optional)</span>'
        }</label>
        <textarea id="reason-dialog-input" class="input py-2" rows="3" maxlength="${maxLength}" ${required ? "required" : ""}
          aria-describedby="reason-dialog-count reason-dialog-error"></textarea>
        <p id="reason-dialog-count" class="helper-text">0 / ${maxLength} characters</p>
        <p id="reason-dialog-error" class="field-error" hidden>Please give a reason.</p>
      </div>
      <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button class="btn btn-secondary" value="cancel" formnovalidate>${escapeHtml(cancelText)}</button>
        <button class="${danger ? "btn btn-danger" : "btn btn-primary"}" value="confirm">${escapeHtml(confirmText)}</button>
      </div>
    </form>`;
  document.body.append(dialog);
  const input = /** @type {HTMLTextAreaElement} */ (dialog.querySelector("textarea"));
  const count = /** @type {HTMLElement} */ (dialog.querySelector("#reason-dialog-count"));
  const error = /** @type {HTMLElement} */ (dialog.querySelector("#reason-dialog-error"));
  input.addEventListener("input", () => {
    count.textContent = `${input.value.length} / ${maxLength} characters`;
    if (input.value.trim()) {
      error.hidden = true;
      input.removeAttribute("aria-invalid");
    }
  });
  const confirmButton = /** @type {HTMLButtonElement} */ (dialog.querySelector('button[value="confirm"]'));
  confirmButton.addEventListener("click", (event) => {
    if (required && !input.value.trim()) {
      event.preventDefault();
      error.hidden = false;
      input.setAttribute("aria-invalid", "true");
      input.focus();
    }
  });
  return new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () => {
        resolve(dialog.returnValue === "confirm" ? input.value.trim().slice(0, maxLength) : null);
        dialog.remove();
      },
      { once: true },
    );
    dialog.showModal();
    input.focus();
  });
}

/** Longest reason for closing a request or cancelling an event (characters). */
const REASON_MAX_LENGTH = 300;

/** How many past records a History tab loads at a time. */
const HISTORY_PAGE_SIZE = 20;

/**
 * A History list that loads 20 at a time with a "Show more" button.
 * @template T
 * @typedef {Object} HistoryPager
 * @property {T[]} items
 * @property {boolean} loading
 * @property {boolean} loaded   true once the first page has been asked for
 * @property {string} error
 * @property {boolean} hasMore
 * @property {() => Promise<void>} load   (re)loads the first page
 * @property {() => Promise<void>} more   adds the next page
 */

/**
 * State for a History list. Put it in Alpine state, e.g. once the user is known:
 * `this.history = historyPager((from, to) => listSomething(id, from, to))`, then call `history.load()`.
 * fetchPage(from, to) returns rows from..to inclusive; we ask for one extra row to know if there's more.
 * Without fetchPage it stays empty (a placeholder until the page knows who is logged in).
 * @template T
 * @param {(from: number, to: number) => Promise<T[]>} [fetchPage]
 * @returns {HistoryPager<T>}
 */
function historyPager(fetchPage = async () => []) {
  return {
    /** @type {T[]} */
    items: [],
    loading: false,
    loaded: false,
    error: "",
    hasMore: false,

    async load() {
      this.items = [];
      await this.more();
      this.loaded = true;
    },

    async more() {
      if (this.loading) return;
      this.loading = true;
      this.error = "";
      try {
        const from = this.items.length;
        const rows = await fetchPage(from, from + HISTORY_PAGE_SIZE);
        this.hasMore = rows.length > HISTORY_PAGE_SIZE;
        this.items = [...this.items, ...rows.slice(0, HISTORY_PAGE_SIZE)];
      } catch (error) {
        this.error = friendlyError(error);
      } finally {
        this.loading = false;
      }
    },
  };
}

/** @typedef {'request' | 'offer' | 'event' | 'application'} StatusKind */

/** One badge per status for every kind of record (full class names, so Tailwind finds them). */
/** @type {Record<StatusKind, Record<string, { className: string, label: string }>>} */
const STATUS_BADGE = {
  request: {
    pending_approval: { className: "badge badge-warning", label: "Waiting for approval" },
    open: { className: "badge badge-info", label: "Open" },
    fulfilled: { className: "badge badge-success", label: "Fulfilled" },
    closed: { className: "badge badge-neutral", label: "Closed" },
    rejected: { className: "badge badge-danger", label: "Rejected" },
  },
  offer: {
    pending: { className: "badge badge-warning", label: "Pending" },
    accepted: { className: "badge badge-info", label: "Accepted" },
    delivered: { className: "badge badge-success", label: "Delivered" },
    rejected: { className: "badge badge-neutral", label: "Rejected" },
    cancelled: { className: "badge badge-neutral", label: "Cancelled" },
  },
  event: {
    upcoming: { className: "badge badge-info", label: "Upcoming" },
    ongoing: { className: "badge badge-success", label: "Happening now" },
    completed: { className: "badge badge-neutral", label: "Completed" },
    cancelled: { className: "badge badge-neutral", label: "Cancelled" },
  },
  application: {
    pending: { className: "badge badge-warning", label: "Waiting" },
    approved: { className: "badge badge-success", label: "Approved" },
    rejected: { className: "badge badge-neutral", label: "Not selected" },
    withdrawn: { className: "badge badge-neutral", label: "Withdrawn" },
  },
};

/**
 * HTML for a status pill, e.g. statusBadge('open', 'request').
 * @param {string} status
 * @param {StatusKind} kind
 * @returns {string}
 */
function statusBadge(status, kind) {
  const badge = statusInfo(status, kind);
  return `<span class="${badge.className}">${escapeHtml(badge.label)}</span>`;
}

/**
 * The badge classes and word for a status — for Alpine (:class + x-text, never x-html).
 * @param {string} status
 * @param {StatusKind} kind
 * @returns {{ className: string, label: string }}
 */
function statusInfo(status, kind) {
  return STATUS_BADGE[kind][status] ?? { className: "badge badge-neutral", label: status };
}

/**
 * The word and badge classes for an AI urgency score (never colour alone).
 * @param {number | null | undefined} score 0–100, or null when not scored yet
 * @returns {{ label: string, className: string }}
 */
function urgencyLevel(score) {
  if (score == null) return { label: "Not scored", className: "badge badge-neutral" };
  if (score >= 80) return { label: "Critical", className: "badge badge-danger" };
  if (score >= 60) return { label: "High", className: "badge badge-warning" };
  if (score >= 40) return { label: "Medium", className: "badge badge-info" };
  return { label: "Low", className: "badge badge-neutral" };
}

/**
 * Turns a Supabase / database error into a short, kind message that says how to fix it.
 * Messages the database raises on purpose (raise exception) are already plain English, so they pass through.
 * @param {unknown} error
 * @returns {string}
 */
function friendlyError(error) {
  const err = /** @type {{ message?: unknown, code?: unknown, status?: unknown }} */ (error ?? {});
  const message = typeof err.message === "string" ? err.message : "";
  const lower = message.toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return "That email and password don't match. Please check them and try again.";
  }
  if (lower.includes("already registered") || err.code === "user_already_exists") {
    return "There's already an account with this email. Try logging in instead.";
  }
  if (lower.includes("password") && (lower.includes("at least") || err.code === "weak_password")) {
    return "Your password needs at least 8 characters.";
  }
  if (lower.includes("email not confirmed")) {
    return "Please confirm your email first, using the link we sent you.";
  }
  if (lower.includes("invalid format") || (lower.includes("email address") && lower.includes("invalid"))) {
    return "Please enter a valid email address, like name@example.com.";
  }
  if (lower.includes("rate limit") || err.status === 429) {
    return "Too many tries. Please wait a minute and try again.";
  }
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("load failed")) {
    return "We couldn't reach the server. Check your internet connection and try again.";
  }
  if (lower.includes("database error saving new user")) {
    return "We couldn't create your account. Please check your details and try again.";
  }
  if (lower.includes("signups not allowed")) {
    return "Sign-ups are switched off right now. Please try again later.";
  }
  if (lower.includes("committed_within_needed")) {
    return "The quantity can't be lower than what donors have already promised.";
  }
  if (lower.includes("quantity_needed")) return "Each item needs a quantity of at least 1.";
  if (/_length\b/.test(lower)) return "Some text is too long. Please shorten it and try again.";
  if (err.code === "23514") return "Some details aren't in the right format. Please check the form.";
  if (err.code === "23505") return "That already exists, so nothing was changed.";
  if (err.code === "23503") return "Other records still depend on this, so it can't be deleted. Close or cancel it instead.";
  if (err.code === "42501" || lower.includes("row-level security")) {
    return "You don't have permission to do that.";
  }
  if (err.code === "PGRST202") {
    return "The database needs an update: run the newest file in supabase/migrations/ in the Supabase SQL Editor.";
  }
  if (err.code === "P0001" && message) return message;
  return "Something went wrong. Please try again.";
}

/**
 * Turns <i data-lucide="name"> placeholders into Lucide icons, now and whenever Alpine adds more.
 * Icons are decorative (aria-hidden), so if Lucide fails to load the page still works.
 * @returns {void}
 */
function startIcons() {
  const lucide = /** @type {any} */ (window).lucide;
  if (!lucide?.createIcons) return;
  const draw = () => {
    lucide.createIcons({ attrs: { "aria-hidden": "true", focusable: "false" } });
    // Lucide keeps data-lucide on the <svg> it draws. Remove it, so a drawn icon is never
    // drawn again: redrawing swapped the icon under the pointer and could swallow clicks,
    // and each redraw looked like a "new icon" to the observer below (an endless loop).
    for (const svg of document.querySelectorAll("svg[data-lucide]")) svg.removeAttribute("data-lucide");
  };
  draw();
  let queued = false;
  /** Only <i data-lucide> placeholders still need drawing. @param {Node} node */
  const hasPlaceholder = (node) => node instanceof Element && (node.matches("i[data-lucide]") || node.querySelector("i[data-lucide]") !== null);
  new MutationObserver((mutations) => {
    if (queued) return;
    const added = mutations.some((m) => [...m.addedNodes].some(hasPlaceholder));
    if (!added) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      draw();
    });
  }).observe(document.body, { childList: true, subtree: true });
}

document.addEventListener("DOMContentLoaded", startIcons);

// Create the toast area early so screen readers already know about it when the first toast appears.
document.addEventListener("DOMContentLoaded", getToastRegion);

// Show / hide button for password fields: <div class="password-field" x-data="passwordToggle">.
// Only switches the input's type; it never reads, logs or stores the password itself.
document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("passwordToggle", () => ({
    shown: false,

    init() {
      const self = /** @type {any} */ (this);
      // hide it again whenever the form is sent
      self.$el.closest("form")?.addEventListener("submit", () => (self.shown = false));
    },

    /** @param {MouseEvent} event */
    toggle(event) {
      const self = /** @type {any} */ (this);
      /** @type {HTMLInputElement} */
      const input = self.$refs.input;
      const start = input.selectionStart;
      const end = input.selectionEnd;
      self.shown = !self.shown;
      // a tap or click (detail > 0) keeps the cursor in the field; Enter / Space leaves focus on the button
      if (event.detail > 0) {
        self.$nextTick(() => {
          input.focus();
          if (start !== null && end !== null) input.setSelectionRange(start, end);
        });
      }
    },
  }));
});
