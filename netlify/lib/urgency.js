// @ts-check
// The transparent urgency formula (REQUIREMENTS.md 4.6). The number always comes from here;
// the AI only writes the plain-English explanation. Pure functions — easy to test.
//
//   Deadline (max 40):              ≤3 days 40 · ≤7 days 30 · ≤14 days 20 · ≤30 days 10 · later 5 · none 10 · past 40
//   Shortfall (max 30):             30 × (units still needed ÷ units needed), all items together
//   Organization's urgency (max 30): critical 30 · high 20 · medium 10 · low 0

import { daysUntil } from "./dates.js";

// Whole days until the deadline, counted in Singapore days (shared with match-items and chat-insights)
export { daysUntil };

/** Singapore areas (public area names) — same list as SG_AREAS in js/ui.js. */
export const SG_AREAS = [
  "Ang Mo Kio", "Bedok", "Bishan", "Bukit Batok", "Bukit Merah", "Bukit Panjang", "Bukit Timah",
  "Choa Chu Kang", "Clementi", "Geylang", "Hougang", "Jurong East", "Jurong West", "Kallang",
  "Pasir Ris", "Punggol", "Queenstown", "Sembawang", "Sengkang", "Serangoon", "Tampines",
  "Toa Payoh", "Woodlands", "Yishun",
];

/** @type {Record<string, number>} */
const URGENCY_POINTS = { critical: 30, high: 20, medium: 10, low: 0 };

/**
 * @typedef {{ key: 'deadline' | 'shortfall' | 'urgency', label: string, points: number, max: number }} Factor
 * @typedef {{ quantity_needed: number, quantity_remaining: number }} ScoredItem
 */

/**
 * @param {number | null} days
 * @returns {Factor}
 */
function deadlineFactor(days) {
  if (days == null) return { key: "deadline", label: "No deadline set", points: 10, max: 40 };
  if (days < 0) return { key: "deadline", label: "Deadline has passed", points: 40, max: 40 };
  const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  const points = days <= 3 ? 40 : days <= 7 ? 30 : days <= 14 ? 20 : days <= 30 ? 10 : 5;
  return { key: "deadline", label: `Deadline ${when}`, points, max: 40 };
}

/**
 * @param {ScoredItem[]} items
 * @returns {Factor}
 */
function shortfallFactor(items) {
  const needed = items.reduce((sum, item) => sum + Math.max(item.quantity_needed, 0), 0);
  const remaining = items.reduce((sum, item) => sum + Math.max(item.quantity_remaining, 0), 0);
  const share = needed > 0 ? Math.min(remaining / needed, 1) : 0;
  return {
    key: "shortfall",
    label: `${Math.round(share * 100)}% of items still needed`,
    points: Math.round(30 * share),
    max: 30,
  };
}

/**
 * @param {string} urgency
 * @returns {Factor}
 */
function urgencyFactor(urgency) {
  const points = URGENCY_POINTS[urgency] ?? 0;
  return { key: "urgency", label: `Marked ${urgency} urgency by the organization`, points, max: 30 };
}

/**
 * The urgency score (0–100) and the factors behind it.
 * @param {{ deadline: string | null, urgency: string, items: ScoredItem[] }} request
 * @param {Date} [today]
 * @returns {{ score: number, factors: Factor[] }}
 */
export function scoreRequest(request, today = new Date()) {
  const factors = [deadlineFactor(daysUntil(request.deadline, today)), shortfallFactor(request.items), urgencyFactor(request.urgency)];
  const score = Math.max(0, Math.min(100, factors.reduce((sum, factor) => sum + factor.points, 0)));
  return { score, factors };
}

/**
 * The word for a score, matching the badges in js/ui.js (urgencyLevel).
 * @param {number} score
 * @returns {string}
 */
export function levelOf(score) {
  if (score >= 80) return "Critical";
  if (score >= 60) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

/**
 * The Singapore area named in an address, or null (area names are public, not personal data).
 * @param {string | null | undefined} address
 * @returns {string | null}
 */
export function areaOf(address) {
  const lower = (address ?? "").toLowerCase();
  return SG_AREAS.find((area) => lower.includes(area.toLowerCase())) ?? null;
}

/**
 * Explanation used when the AI isn't available (REQUIREMENTS.md 4.6: the app still works).
 * @param {number} score
 * @param {Factor[]} factors
 * @returns {string}
 */
export function fallbackExplanation(score, factors) {
  const strongest = [...factors].sort((a, b) => b.points / b.max - a.points / a.max)[0];
  return `${levelOf(score)} urgency, scored from its deadline, how much is still needed, and the organization's own urgency. The biggest factor: ${strongest.label.charAt(0).toLowerCase()}${strongest.label.slice(1)}.`;
}
