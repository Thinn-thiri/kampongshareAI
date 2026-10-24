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

/** @type {Record<'request' | 'offer', Record<string, { className: string, label: string }>>} */
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
};

/**
 * HTML for a status pill, e.g. statusBadge('open', 'request').
 * @param {string} status
 * @param {'request' | 'offer'} kind
 * @returns {string}
 */
function statusBadge(status, kind) {
  const badge = STATUS_BADGE[kind][status] ?? { className: "badge badge-neutral", label: status };
  return `<span class="${badge.className}">${escapeHtml(badge.label)}</span>`;
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
  if (err.code === "23514") return "Some details aren't in the right format. Please check the form.";
  if (err.code === "23505") return "That already exists, so nothing was changed.";
  if (err.code === "42501" || lower.includes("row-level security")) {
    return "You don't have permission to do that.";
  }
  if (err.code === "P0001" && message) return message;
  return "Something went wrong. Please try again.";
}

// Create the toast area early so screen readers already know about it when the first toast appears.
document.addEventListener("DOMContentLoaded", getToastRegion);
