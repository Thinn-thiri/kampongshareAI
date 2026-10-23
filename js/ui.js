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

// Create the toast area early so screen readers already know about it when the first toast appears.
document.addEventListener("DOMContentLoaded", getToastRegion);
