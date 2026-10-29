// @ts-check
// Deadlines and event end times on the server (REQUIREMENTS.md 11) — the same rules as js/ui.js:
//   a request is past its deadline when deadline < today in Singapore (whole days);
//   an event has ended when its end time (or its start time, if it has none) is before now.

const DAY_MS = 86_400_000;

/**
 * Today's date in Singapore as YYYY-MM-DD, whatever the server's time zone.
 * @param {Date} [now]
 * @returns {string}
 */
export function sgToday(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
}

/**
 * Whole days from today (in Singapore) until a YYYY-MM-DD deadline (negative if past), or null.
 * @param {string | null | undefined} deadline
 * @param {Date} [now]
 * @returns {number | null}
 */
export function daysUntil(deadline, now = new Date()) {
  if (!deadline) return null;
  const due = Date.parse(`${deadline}T00:00:00Z`);
  const today = Date.parse(`${sgToday(now)}T00:00:00Z`);
  return Math.round((due - today) / DAY_MS);
}

/**
 * Supabase REST filter value for "no deadline, or a deadline today or later": use as or=…
 * @param {Date} [now]
 * @returns {string}
 */
export function notPastDeadlineFilter(now = new Date()) {
  return `(deadline.is.null,deadline.gte.${sgToday(now)})`;
}

/**
 * Supabase REST filter value for "hasn't ended": use as or=…
 * @param {Date} [now]
 * @returns {string}
 */
export function notEndedFilter(now = new Date()) {
  const iso = now.toISOString();
  return `(ends_at.gte.${iso},and(ends_at.is.null,starts_at.gte.${iso}))`;
}
