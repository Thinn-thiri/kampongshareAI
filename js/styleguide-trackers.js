// @ts-check
// Sample data for the tracker states on styleguide.html (REQUIREMENTS.md 12): every step and every stop.
// Fictitious records only, with times relative to now so "Event day" really is happening.

/**
 * @typedef {{ key: string, build: () => Tracker, stamp?: boolean }} TrackerSample
 */

/** @returns {{ offers: TrackerSample[], applications: TrackerSample[], column: () => Tracker }} */
function trackerSamples() {
  const hour = 3600000;
  const at = (/** @type {number} */ hours) => new Date(Date.now() + hours * hour).toISOString();
  const day = (/** @type {number} */ days) => sgToday(new Date(Date.now() + days * 24 * hour));
  const request = (/** @type {Record<string, any>} */ extra = {}) => ({
    title: "Rice for 40 families", // i18n-ignore (sample data)
    status: "open",
    deadline: day(5),
    dropoff_instructions: "Blk 123 Tampines St 11, weekdays 10am–5pm", // i18n-ignore (sample data)
    close_reason: null,
    closed_at: null,
    organization: { name: "Tampines Kampong Pantry", address: null }, // i18n-ignore (sample data)
    ...extra,
  });
  const offer = (/** @type {Record<string, any>} */ extra, /** @type {Record<string, any>} */ req = {}) =>
    /** @type {DonationOffer} */ (/** @type {unknown} */ ({
      id: "sample", quantity: 5, message: "Can bring them on Saturday.", status: "pending", created_at: at(-50), updated_at: at(-50), // i18n-ignore (sample data)
      item: { name: "Rice 5kg", unit: "bags", category: "food", request: request(req) }, // i18n-ignore (sample data)
      ...extra,
    }));
  const event = (/** @type {Record<string, any>} */ extra = {}) => ({
    starts_at: at(72), ends_at: at(76), location_name: "Tampines Hub", status: "upcoming", cancel_reason: null, cancelled_at: null, outcome_summary: null, // i18n-ignore (sample data)
    organization: { name: "Tampines Kampong Pantry" }, // i18n-ignore (sample data)
    ...extra,
  });
  const application = (/** @type {Record<string, any>} */ extra, /** @type {Record<string, any>} */ ev = {}) =>
    /** @type {MyApplication} */ (/** @type {unknown} */ ({ id: "sample", event_id: "e1", message: null, status: "pending", created_at: at(-30), applied_at: at(-30), event: event(ev), ...extra }));
  const tasks = /** @type {VolunteerTask[]} */ (/** @type {unknown} */ ([{ id: "t1", event_id: "e1", volunteer_id: "v1", title: "Pack food bags at station 2", due_at: at(73), status: "todo" }])); // i18n-ignore (sample data)
  const sampleOffer = (/** @type {Record<string, any>} */ extra, /** @type {Record<string, any>} */ req = {}) => () => offerTracker(offer(extra, req), { viewer: "donor" });
  const sampleApp = (/** @type {Record<string, any>} */ extra, /** @type {Record<string, any>} */ ev = {}) => () => applicationTracker(application(extra, ev), { tasks });
  return {
    offers: [
      { key: "sent", build: sampleOffer({}) },
      { key: "accepted", build: sampleOffer({ status: "accepted", accepted_at: at(-20) }) },
      { key: "delivered", build: sampleOffer({ status: "delivered", accepted_at: at(-20), delivered_at: at(-2) }), stamp: true },
      { key: "rejected", build: sampleOffer({ status: "rejected", rejected_at: at(-10), reject_note: "We have enough rice now — thank you!" }) }, // i18n-ignore (sample data)
      { key: "closed", build: sampleOffer({ status: "rejected", rejected_at: at(-10) }, { status: "closed", closed_at: at(-10), close_reason: "Deadline passed" }) }, // i18n-ignore (sample data)
      { key: "cancelled", build: sampleOffer({ status: "cancelled", cancelled_at: at(-12) }) },
      { key: "deadline", build: sampleOffer({}, { deadline: day(-2) }) },
    ],
    applications: [
      { key: "applied", build: sampleApp({}) },
      { key: "approved", build: sampleApp({ status: "approved", approved_at: at(-5) }) },
      { key: "day", build: sampleApp({ status: "approved", approved_at: at(-5) }, { starts_at: at(-1), ends_at: at(3), status: "ongoing" }) },
      { key: "completed", build: sampleApp({ status: "approved", approved_at: at(-80) }, { starts_at: at(-50), ends_at: at(-46), status: "completed", outcome_summary: "35 volunteers packed 400 food bags." }) }, // i18n-ignore (sample data)
      { key: "rejected", build: sampleApp({ status: "rejected", rejected_at: at(-4) }) },
      { key: "withdrawn", build: sampleApp({ status: "withdrawn", withdrawn_at: at(-4) }) },
      { key: "cancelled", build: sampleApp({ status: "approved", approved_at: at(-6) }, { status: "cancelled", cancelled_at: at(-2), cancel_reason: "Heavy rain warning" }) }, // i18n-ignore (sample data)
      { key: "ended", build: sampleApp({}, { starts_at: at(-6), ends_at: at(-2) }) },
    ],
    column: () => offerTracker(offer({ status: "accepted", accepted_at: at(-20) }), { viewer: "donor" }),
  };
}
