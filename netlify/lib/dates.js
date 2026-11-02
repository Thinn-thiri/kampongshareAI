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

/**
 * A time written out in Singapore time for the AI ("Sat, 7 Nov 2026, 9:00 am"), so it never reads UTC.
 * @param {string | null | undefined} iso
 * @returns {string | null}
 */
export function sgWhen(iso) {
  return iso
    ? new Date(iso).toLocaleString("en-SG", {
        timeZone: "Asia/Singapore", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
      })
    : null;
}

/**
 * "Monday, 2 Nov 2026" in Singapore, so the AI knows which days "this weekend" means.
 * @param {Date} now
 * @returns {string}
 */
export function sgTodayWords(now) {
  return now.toLocaleDateString("en-SG", { timeZone: "Asia/Singapore", weekday: "long", day: "numeric", month: "short", year: "numeric" });
}
