// @ts-check
// How many things are waiting for an admin: the admin.html summary cards and the home page's
// "Review queue" button. Only admins get real numbers; the database limits what others can count.

/** @typedef {'organizations' | 'volunteers' | 'requests' | 'events' | 'applications' | 'offers'} QueueKey */

/** The queues where something waits for an admin's decision (offers in progress are monitoring only). */
const REVIEW_QUEUES = /** @type {QueueKey[]} */ (["organizations", "volunteers", "requests", "events", "applications"]);

/**
 * Counts for the summary cards. Uses head requests, so no rows are downloaded.
 * @returns {Promise<Record<QueueKey, number>>}
 */
async function getAdminCounts() {
  const client = db();
  const count = { count: /** @type {const} */ ("exact"), head: true };
  /** @type {[QueueKey, PromiseLike<{ count: number | null, error: unknown }>][]} */
  const queries = [
    ["organizations", client.from("organizations").select("*", count).eq("approval", "pending")],
    ["volunteers", client.from("profiles").select("*", count).eq("is_volunteer", true).eq("volunteer_approval", "pending")],
    ["requests", client.from("donation_requests").select("*", count).eq("status", "pending_approval")],
    ["events", client.from("events").select("*", count).eq("approval", "pending")],
    ["applications", client.from("volunteer_applications").select("*", count).eq("status", "pending")],
    ["offers", client.from("donation_offers").select("*", count).in("status", ["pending", "accepted"])],
  ];
  const results = await Promise.all(
    queries.map(async ([key, query]) => {
      const { count: total, error } = await query;
      if (error) throw error;
      return /** @type {[QueueKey, number]} */ ([key, total ?? 0]);
    }),
  );
  return /** @type {Record<QueueKey, number>} */ (Object.fromEntries(results));
}

/**
 * Everything waiting for an admin decision, added up.
 * @returns {Promise<number>}
 */
async function getAdminWaitingTotal() {
  const counts = await getAdminCounts();
  return REVIEW_QUEUES.reduce((sum, key) => sum + counts[key], 0);
}
