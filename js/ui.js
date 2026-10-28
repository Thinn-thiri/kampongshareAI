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
 * @param {Lang} [lang] another language than the page's (the downloaded poster is always English)
 * @returns {string}
 */
function formatDate(value, withTime = false, lang) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  /** @type {Intl.DateTimeFormatOptions} */
  const options = withTime
    ? { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { day: "numeric", month: "short", year: "numeric" };
  return date.toLocaleString(locale(lang), options);
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

/** Singapore areas for pickers and filters (public area names only; shown with areaLabel()). */
// i18n-ignore-start — stored values, not text
const SG_AREAS = [
  "Ang Mo Kio", "Bedok", "Bishan", "Bukit Batok", "Bukit Merah", "Bukit Panjang", "Bukit Timah",
  "Choa Chu Kang", "Clementi", "Geylang", "Hougang", "Jurong East", "Jurong West", "Kallang",
  "Pasir Ris", "Punggol", "Queenstown", "Sembawang", "Sengkang", "Serangoon", "Tampines",
  "Toa Payoh", "Woodlands", "Yishun",
];
// i18n-ignore-end

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
 * Shows a short message. Success messages hide themselves after 4 seconds (paused while the
 * pointer or focus is on them); error messages stay until closed, so nobody misses them
 * (WCAG 2.2.1).
 * @param {string} message
 * @param {'success' | 'error'} [type]
 * @returns {void}
 */
function toast(message, type = "success") {
  const item = document.createElement("div");
  item.className = `${TOAST_CLASS[type]} flex items-start gap-2`;
  const text = document.createElement("p");
  text.className = "flex-1 py-1";
  text.textContent = message;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "toast-close";
  close.setAttribute("aria-label", t("ui.closeMessage"));
  close.textContent = "×";
  close.addEventListener("click", () => item.remove());
  item.append(text, close);
  getToastRegion().append(item);
  if (type === "error") return;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const start = () => (timer = setTimeout(() => item.remove(), 4000));
  const pause = () => clearTimeout(timer);
  item.addEventListener("mouseenter", pause);
  item.addEventListener("mouseleave", start);
  item.addEventListener("focusin", pause);
  item.addEventListener("focusout", start);
  start();
}

/**
 * Tells screen-reader users about a change they can't see happening, e.g. "Showing 12 past offers".
 * Uses its own hidden live region, separate from toasts.
 * @param {string} message
 * @returns {void}
 */
function announce(message) {
  let region = document.getElementById("sr-announcer");
  if (!region) {
    region = document.createElement("div");
    region.id = "sr-announcer";
    region.className = "sr-only";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.append(region);
  }
  // clear first, so the same message twice is still read out
  region.textContent = "";
  const target = region;
  setTimeout(() => (target.textContent = message), 50);
}

/**
 * Moves keyboard focus to a section heading, e.g. after the card someone was working on
 * disappeared (deleted, cancelled, moved to History), so they don't lose their place.
 * @param {string} id the heading's id
 * @returns {void}
 */
function focusHeading(id) {
  const heading = document.getElementById(id);
  if (!heading) return;
  heading.setAttribute("tabindex", "-1");
  heading.focus();
}

/**
 * "Show more": loads the next page, then moves focus to the first new item, because the
 * button itself may disappear when there's nothing more to load.
 * @param {HistoryPager<any>} pager
 * @param {HTMLElement | undefined} list the <ul> holding the items (x-ref)
 * @returns {Promise<void>}
 */
async function showMoreAndFocus(pager, list) {
  const before = pager.items.length;
  await pager.more();
  // wait for Alpine to draw the new rows
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const item = list?.querySelectorAll(":scope > li, :scope > tr")[before];
  if (item instanceof HTMLElement) {
    item.setAttribute("tabindex", "-1");
    item.focus();
  }
}

/**
 * Asks the user to confirm an action. Resolves true on confirm, false on cancel or Escape.
 * @param {string} message
 * note: an optional small line under the message.
 * @param {{ title?: string, confirmText?: string, cancelText?: string, danger?: boolean, note?: string }} [options]
 * @returns {Promise<boolean>}
 */
function confirmDialog(message, options = {}) {
  const { title = t("ui.areYouSure"), confirmText = t("ui.confirm"), cancelText = t("common.cancel"), danger = false, note = "" } = options;
  const dialog = document.createElement("dialog");
  dialog.className = "dialog";
  dialog.setAttribute("aria-labelledby", "confirm-dialog-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="confirm-dialog-title" class="text-lg font-semibold">${escapeHtml(title)}</h2>
      <p class="mt-2 text-muted">${escapeHtml(message)}</p>
      ${note ? `<p class="mt-3 text-sm text-muted">${escapeHtml(note)}</p>` : ""}
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
 * quickReasons: optional one-tap reasons ("Missing details"…) that fill the note; the text box stays editable.
 * @param {{ title?: string, label?: string, required?: boolean, maxLength?: number, confirmText?: string, cancelText?: string, danger?: boolean, warning?: string, quickReasons?: string[] }} [options]
 * @returns {Promise<string | null>}
 */
function reasonDialog(message, options = {}) {
  const {
    title = t("ui.areYouSure"),
    label = t("ui.reason"),
    required = false,
    maxLength = 300,
    confirmText = t("ui.confirm"),
    cancelText = t("common.cancel"),
    danger = false,
    warning = "",
    quickReasons = [],
  } = options;
  const dialog = document.createElement("dialog");
  dialog.className = "dialog";
  dialog.setAttribute("aria-labelledby", "reason-dialog-title");
  const chips = quickReasons.length
    ? `<div class="mt-4 flex flex-wrap gap-2" role="group" aria-label="${escapeHtml(t("ui.quickReasons"))}">${quickReasons
        .map((reason) => `<button type="button" class="chip" data-reason="${escapeHtml(reason)}" aria-pressed="false">${escapeHtml(reason)}</button>`)
        .join("")}</div>`
    : "";
  dialog.innerHTML = `
    <form method="dialog" novalidate>
      <h2 id="reason-dialog-title" class="text-lg font-semibold">${escapeHtml(title)}</h2>
      <p class="mt-2 text-muted">${escapeHtml(message)}</p>
      ${warning ? `<p class="mt-3 rounded-md bg-warning-soft p-3 text-sm text-warning">${escapeHtml(warning)}</p>` : ""}
      ${chips}
      <div class="mt-4">
        <label for="reason-dialog-input" class="label">${escapeHtml(label)}${
          required ? ' <span class="text-danger" aria-hidden="true">*</span>' : ` <span class="font-normal text-muted">${escapeHtml(t("common.optional"))}</span>`
        }</label>
        <textarea id="reason-dialog-input" class="input py-2" rows="3" maxlength="${maxLength}" ${required ? "required" : ""}
          aria-describedby="reason-dialog-count reason-dialog-error"></textarea>
        <p id="reason-dialog-count" class="helper-text">${escapeHtml(t("ui.reasonCount", { count: 0, max: maxLength }))}</p>
        <p id="reason-dialog-error" class="field-error" hidden>${escapeHtml(t("ui.reasonRequired"))}</p>
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
  const updateCount = () => (count.textContent = t("ui.reasonCount", { count: input.value.length, max: maxLength }));
  for (const chip of dialog.querySelectorAll("[data-reason]")) {
    chip.addEventListener("click", () => {
      input.value = (chip.getAttribute("data-reason") ?? "").slice(0, maxLength);
      for (const other of dialog.querySelectorAll("[data-reason]")) other.setAttribute("aria-pressed", String(other === chip));
      input.dispatchEvent(new Event("input"));
      input.focus();
    });
  }
  input.addEventListener("input", () => {
    updateCount();
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
 * After each load it tells screen-reader users what's shown, e.g. "Showing 12 past offers".
 * @template T
 * @param {(from: number, to: number) => Promise<T[]>} [fetchPage]
 * @param {string | (() => string)} [noun] what the items are, e.g. "past offers"
 * @returns {HistoryPager<T>}
 */
function historyPager(fetchPage = async () => [], noun = () => t("ui.pastItems")) {
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
        const what = typeof noun === "function" ? noun() : noun;
        announce(
          this.items.length
            ? t(this.hasMore ? "ui.historyShowingMore" : "ui.historyShowing", { count: this.items.length, what })
            : t("ui.historyNone", { what }),
        );
      } catch (error) {
        this.error = friendlyError(error);
        announce(this.error);
      } finally {
        this.loading = false;
      }
    },
  };
}

/** @typedef {'request' | 'offer' | 'event' | 'application' | 'approval' | 'report'} StatusKind */

/**
 * A badge whose word comes from the translations (enumLabel), so it follows the chosen language.
 * @param {string} className full class names, so Tailwind finds them
 * @param {string} enumKind
 * @param {string} value
 * @returns {{ className: string, readonly label: string }}
 */
function badgeEntry(className, enumKind, value) {
  return {
    className,
    get label() {
      return enumLabel(enumKind, value);
    },
  };
}

/** One badge per status for every kind of record (full class names, so Tailwind finds them). */
/** @type {Record<StatusKind, Record<string, { className: string, readonly label: string }>>} */
const STATUS_BADGE = {
  request: {
    pending_approval: badgeEntry("badge badge-warning", "requestStatus", "pending_approval"),
    open: badgeEntry("badge badge-info", "requestStatus", "open"),
    fulfilled: badgeEntry("badge badge-success", "requestStatus", "fulfilled"),
    closed: badgeEntry("badge badge-neutral", "requestStatus", "closed"),
    rejected: badgeEntry("badge badge-danger", "requestStatus", "rejected"),
  },
  offer: {
    pending: badgeEntry("badge badge-warning", "offerStatus", "pending"),
    accepted: badgeEntry("badge badge-info", "offerStatus", "accepted"),
    delivered: badgeEntry("badge badge-success", "offerStatus", "delivered"),
    rejected: badgeEntry("badge badge-neutral", "offerStatus", "rejected"),
    cancelled: badgeEntry("badge badge-neutral", "offerStatus", "cancelled"),
  },
  event: {
    upcoming: badgeEntry("badge badge-info", "eventStatus", "upcoming"),
    ongoing: badgeEntry("badge badge-success", "eventStatus", "ongoing"),
    completed: badgeEntry("badge badge-neutral", "eventStatus", "completed"),
    cancelled: badgeEntry("badge badge-neutral", "eventStatus", "cancelled"),
  },
  approval: {
    pending: badgeEntry("badge badge-warning", "approval", "pending"),
    approved: badgeEntry("badge badge-success", "approval", "approved"),
    rejected: badgeEntry("badge badge-danger", "approval", "rejected"),
  },
  application: {
    pending: badgeEntry("badge badge-warning", "applicationStatus", "pending"),
    approved: badgeEntry("badge badge-success", "applicationStatus", "approved"),
    rejected: badgeEntry("badge badge-neutral", "applicationStatus", "rejected"),
    withdrawn: badgeEntry("badge badge-neutral", "applicationStatus", "withdrawn"),
  },
  report: {
    open: badgeEntry("badge badge-warning", "reportStatus", "open"),
    resolved: badgeEntry("badge badge-success", "reportStatus", "resolved"),
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
 * @returns {{ level: 'not_scored' | 'critical' | 'high' | 'medium' | 'low', label: string, className: string }}
 */
function urgencyLevel(score) {
  /** @type {'not_scored' | 'critical' | 'high' | 'medium' | 'low'} */
  const level = score == null ? "not_scored" : score >= 80 ? "critical" : score >= 60 ? "high" : score >= 40 ? "medium" : "low";
  /** @type {Record<typeof level, string>} */
  const classes = {
    not_scored: "badge badge-neutral",
    critical: "badge badge-danger",
    high: "badge badge-warning",
    medium: "badge badge-info",
    low: "badge badge-neutral",
  };
  return { level, label: enumLabel("urgency", level), className: classes[level] };
}

/**
 * Every message the database raises on purpose ("raise exception" in supabase/migrations/), plus the
 * two the browser code throws itself, mapped to a translation key. Named groups fill the placeholders;
 * `enums` turns status words into labels. node scripts/check-i18n.js checks every migration message matches.
 * @type {{ pattern: RegExp, key: string, enums?: Record<string, string> }[]}
 */
const DB_ERRORS = [
  { pattern: /^Event not found\.?$/, key: "errors.db.eventNotFound" },
  { pattern: /^This event already has all the volunteers it needs\.?$/, key: "errors.db.eventFull" },
  { pattern: /^Applications cannot be moved to another event or person\.?$/, key: "errors.db.applicationMove" },
  {
    pattern: /^An organization cannot change an application from (?<from>\w+) to (?<to>\w+)\.?$/,
    key: "errors.db.orgApplicationChange",
    enums: { from: "applicationStatus", to: "applicationStatus" },
  },
  { pattern: /^Your place is confirmed, so it can't be withdrawn here\./, key: "errors.db.placeConfirmed" },
  { pattern: /^This event is no longer taking volunteers\.?$/, key: "errors.db.eventClosed" },
  { pattern: /^You can withdraw a pending application, or apply again after withdrawing\.?$/, key: "errors.db.withdrawPending" },
  { pattern: /^You can withdraw your application, or apply again after withdrawing\.?$/, key: "errors.db.withdrawOrApply" },
  { pattern: /^Not allowed\.?$/, key: "errors.db.notAllowed" },
  { pattern: /^Admins can only approve or reject volunteer accounts here\.?$/, key: "errors.db.volunteerApprovalOnly" },
  { pattern: /^Please write a short note so the volunteer knows why\.?$/, key: "errors.db.volunteerNoteNeeded" },
  { pattern: /^Only admins can approve volunteer accounts\.?$/, key: "errors.db.volunteerAdminOnly" },
  { pattern: /^Your volunteer account is waiting for admin approval\./, key: "errors.db.volunteerPending" },
  { pattern: /^Only admins can set the admin note\.?$/, key: "errors.db.adminNoteOnly" },
  { pattern: /^After approval you can only change the deadline, urgency and item quantities\./, key: "errors.db.afterApprovalLimited" },
  {
    pattern: /^You cannot change this request from (?<from>\w+) to (?<to>\w+)\.?$/,
    key: "errors.db.requestStatusChange",
    enums: { from: "requestStatus", to: "requestStatus" },
  },
  { pattern: /^Items can't be added or removed after approval\./, key: "errors.db.itemsLocked" },
  { pattern: /^After approval you can only change an item's quantity\.?$/, key: "errors.db.itemQuantityOnly" },
  { pattern: /^Request item not found\.?$/, key: "errors.db.itemNotFound" },
  { pattern: /^This request is not accepting donations right now\.?$/, key: "errors.db.requestNotOpen" },
  { pattern: /^Only (?<count>\d+) (?<unit>.*?) of "(?<item>.*)" still needed\.?$/, key: "errors.db.onlyStillNeeded" },
  { pattern: /^You already have an offer for "(?<item>.*)"\. Cancel it first/, key: "errors.db.alreadyOffered" },
  { pattern: /^Please confirm the food is sealed, unopened and not past its expiry date\.?$/, key: "errors.db.foodSafety" },
  { pattern: /^Offers cannot be edited\. Cancel it and make a new one\.?$/, key: "errors.db.offerNoEdit" },
  {
    pattern: /^An organization cannot change an offer from (?<from>\w+) to (?<to>\w+)\.?$/,
    key: "errors.db.orgOfferChange",
    enums: { from: "offerStatus", to: "offerStatus" },
  },
  { pattern: /^A donor can only cancel a pending or accepted offer\.?$/, key: "errors.db.donorCancelOnly" },
  { pattern: /^Offers can only be accepted while the request is open\.?$/, key: "errors.db.acceptOnlyOpen" },
  { pattern: /^Cannot accept: only (?<count>\d+) (?<unit>.*?) of "(?<item>.*)" still needed\.?$/, key: "errors.db.cannotAccept" },
  { pattern: /^Only admins can approve or reject organizations\.?$/, key: "errors.db.orgApprovalAdminOnly" },
  { pattern: /^Your organization name can't be changed after approval\./, key: "errors.db.orgNameLocked" },
  { pattern: /^The linked donation request must belong to your organization\.?$/, key: "errors.db.linkedRequestOwn" },
  { pattern: /^Only admins can approve or reject events\.?$/, key: "errors.db.eventApprovalAdminOnly" },
  { pattern: /^Volunteers can only update the status of their tasks\.?$/, key: "errors.db.taskStatusOnly" },
  { pattern: /^Only individual accounts can donate or volunteer\.?$/, key: "errors.db.individualsOnly" },
  { pattern: /^Keep at least one turned on: donating or volunteering\.?$/, key: "errors.db.keepOneRole" },
  // messaging (20261028040000_messaging.sql)
  { pattern: /^Please log in to send messages\.?$/, key: "errors.db.loginToMessage" },
  { pattern: /^This organization isn't available for messages\.?$/, key: "errors.db.orgUnavailableForMessages" },
  { pattern: /^You can only message donors who offered on your requests/, key: "errors.db.orgMessageLimits" },
  { pattern: /^You can only message organizations\.?$/, key: "errors.db.messageOrgsOnly" },
  { pattern: /^Please give your privacy consent in your profile before sending messages\.?$/, key: "errors.db.consentToMessage" },
  { pattern: /^Your account can't start conversations\.?$/, key: "errors.db.cannotStartConversations" },
  { pattern: /^You've started a lot of new conversations today\./, key: "errors.db.tooManyConversations" },
  { pattern: /^Conversation not found\.?$/, key: "errors.db.conversationNotFound" },
  { pattern: /^Please type a message\.?$/, key: "errors.db.typeAMessage" },
  { pattern: /^This conversation is blocked, so no new messages can be sent\.?$/, key: "errors.db.conversationBlocked" },
  { pattern: /^You're sending messages very quickly\./, key: "errors.db.messagingTooFast" },
  { pattern: /^Message not found\.?$/, key: "errors.db.messageNotFound" },
  { pattern: /^You can't report your own message\.?$/, key: "errors.db.ownMessageReport" },
  // thrown by js/events.js and js/requests.js
  { pattern: /^Volunteers have applied, so this event can't be deleted/, key: "errors.db.eventHasApplicants" }, // i18n-ignore (translated by DB_ERRORS)
  { pattern: /^This request can't be deleted any more/, key: "errors.db.requestNoDelete" }, // i18n-ignore (translated by DB_ERRORS)
];

/**
 * A database message in the chosen language, or null when it isn't one we know.
 * Names the database puts in (item names, units) are kept exactly as written.
 * @param {string} message
 * @returns {string | null}
 */
function translateDbMessage(message) {
  for (const entry of DB_ERRORS) {
    const match = entry.pattern.exec(message);
    if (!match) continue;
    /** @type {Record<string, string | number>} */
    const params = { ...(match.groups ?? {}) };
    for (const [name, kind] of Object.entries(entry.enums ?? {})) params[name] = enumLabel(kind, String(params[name]));
    if (params.count !== undefined) params.count = Number(params.count);
    return t(entry.key, params);
  }
  return null;
}

/**
 * Turns a Supabase / database error into a short, kind message (in the chosen language) that says how to fix it.
 * Messages the database raises on purpose go through DB_ERRORS; an unknown one is still shown, in English.
 * @param {unknown} error
 * @returns {string}
 */
function friendlyError(error) {
  const err = /** @type {{ message?: unknown, code?: unknown, status?: unknown }} */ (error ?? {});
  const message = typeof err.message === "string" ? err.message : "";
  const lower = message.toLowerCase();

  if (lower.includes("invalid login credentials")) return t("errors.loginMismatch");
  if (lower.includes("already registered") || err.code === "user_already_exists") return t("errors.alreadyRegistered");
  if (lower.includes("password") && (lower.includes("at least") || err.code === "weak_password")) return t("errors.weakPassword");
  if (lower.includes("email not confirmed")) return t("errors.emailNotConfirmed");
  if (lower.includes("invalid format") || (lower.includes("email address") && lower.includes("invalid"))) return t("errors.invalidEmail");
  if (lower.includes("rate limit") || err.status === 429) return t("errors.rateLimit");
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("load failed")) return t("errors.network");
  if (lower.includes("database error saving new user")) return t("errors.signupFailed");
  if (lower.includes("signups not allowed")) return t("errors.signupsOff");
  if (lower.includes("committed_within_needed")) return t("errors.belowPromised");
  if (lower.includes("quantity_needed")) return t("errors.quantityMin");
  if (/_length\b/.test(lower)) return t("errors.tooLong");
  if (err.code === "23514") return t("errors.format");
  if (err.code === "23505") return t("errors.duplicate");
  if (err.code === "23503") return t("errors.dependents");
  if (err.code === "42501" || lower.includes("row-level security")) return t("errors.permission");
  if (err.code === "PGRST202") return t("errors.dbUpdate");
  if (err.code === "P0001" && message) {
    const known = translateDbMessage(message);
    if (known) return known;
    return getLang() === "en" ? message : t("errors.somethingWrongWith", { message });
  }
  return t("errors.generic");
}

/**
 * The − / + buttons of a quantity stepper (.stepper): changes the number next to them by `delta`,
 * staying within the input's min and max (e.g. what's still needed), then tells x-model.
 * @param {HTMLElement} button
 * @param {number} delta
 */
function stepNumber(button, delta) {
  const input = button.closest(".stepper")?.querySelector("input");
  if (!(input instanceof HTMLInputElement)) return;
  const min = input.min === "" ? -Infinity : Number(input.min);
  const max = input.max === "" ? Infinity : Number(input.max);
  const current = Number(input.value);
  const next = Math.min(max, Math.max(min, (Number.isFinite(current) && input.value !== "" ? current : delta > 0 ? min - 1 : min + 1) + delta));
  if (!Number.isFinite(next) || String(next) === input.value) return;
  input.value = String(next);
  input.dispatchEvent(new Event("input", { bubbles: true }));
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

/**
 * Tab lists scroll sideways on phones (and Malay or Chinese labels can be longer): whenever a tab
 * becomes selected, scroll its list so the selected tab is in view. Only the list moves, never the page.
 * @returns {void}
 */
function revealSelectedTabs() {
  for (const list of document.querySelectorAll(".tablist")) {
    const selected = list.querySelector('[aria-selected="true"]');
    if (!(selected instanceof HTMLElement) || list.scrollWidth <= list.clientWidth) continue;
    const box = list.getBoundingClientRect();
    const tab = selected.getBoundingClientRect();
    if (tab.left < box.left) list.scrollLeft -= box.left - tab.left + 16;
    else if (tab.right > box.right) list.scrollLeft += tab.right - box.right + 16;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  let queued = false;
  const reveal = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      revealSelectedTabs();
    });
  };
  // a tab becomes selected, or its section is shown (Alpine's x-show changes style): the list only has a width once visible
  new MutationObserver(reveal).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["aria-selected", "style"] });
  window.addEventListener("hashchange", reveal);
  window.addEventListener("language-changed", reveal);
  window.addEventListener("resize", reveal);
});

// A screen-reader announcement from before a language switch would be read in the old language: clear it.
window.addEventListener("language-changed", () => {
  const region = document.getElementById("sr-announcer");
  if (region) region.textContent = "";
});

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
