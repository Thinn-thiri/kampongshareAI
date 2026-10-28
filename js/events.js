// @ts-check
// Volunteer events: plain Supabase functions shared by organization.html, admin.html,
// index.html and event.html. The database enforces the rules: new events wait for an admin,
// and changing what the public sees on an approved event sends it back for approval.

/** @typedef {'upcoming' | 'ongoing' | 'completed' | 'cancelled'} EventStatus */

/**
 * A row of public.events (plus optional joined names).
 * @typedef {Object} VolunteerEvent
 * @property {string} id
 * @property {string} organization_id
 * @property {string} title
 * @property {string | null} description
 * @property {string | null} location_name
 * @property {number} latitude
 * @property {number} longitude
 * @property {string} starts_at
 * @property {string | null} ends_at
 * @property {number} volunteers_needed     0 = no limit
 * @property {EventStatus} status
 * @property {string | null} outcome_summary
 * @property {string | null} [cancel_reason]   why the organization cancelled it (required when cancelling)
 * @property {string | null} [cancelled_at]    set by the database when it's cancelled
 * @property {string | null} donation_request_id
 * @property {Approval} approval
 * @property {string | null} [admin_note]   not included for visitors
 * @property {string} created_at
 * @property {{ name: string } | null} [organization]
 * @property {{ title: string, id?: string, status?: RequestStatus } | null} [request]
 */

/**
 * What the event form edits. Times are `datetime-local` values (local time, no zone).
 * @typedef {Object} EventForm
 * @property {string} title
 * @property {string} description
 * @property {string} locationName
 * @property {number | null} latitude
 * @property {number | null} longitude
 * @property {string} startsAt
 * @property {string} endsAt
 * @property {number | string} volunteersNeeded
 * @property {string} donationRequestId   "" = none
 */

/** @typedef {Record<string, string>} EventErrors */

/** Event columns visitors may read (the database hides admin notes from them). */
const PUBLIC_EVENT_COLUMNS =
  "id, organization_id, title, description, location_name, latitude, longitude, starts_at, ends_at, volunteers_needed, status, outcome_summary, donation_request_id, approval, created_at";

/** Event status badges live in STATUS_BADGE (js/ui.js) with every other status. */
/** @type {Record<EventStatus, { className: string, readonly label: string }>} */
const EVENT_STATUS_BADGE = /** @type {any} */ (STATUS_BADGE.event);

/** @type {Record<Approval, { className: string, readonly label: string }>} */
const APPROVAL_BADGE = {
  pending: badgeEntry("badge badge-warning", "eventApproval", "pending"),
  approved: badgeEntry("badge badge-success", "eventApproval", "approved"),
  rejected: badgeEntry("badge badge-danger", "eventApproval", "rejected"),
};

/**
 * ISO time → value for <input type="datetime-local"> in the user's time zone.
 * @param {string | null | undefined} iso
 * @returns {string}
 */
function toLocalInput(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * <input type="datetime-local"> value → ISO time (or null when empty).
 * @param {string} value
 * @returns {string | null}
 */
function fromLocalInput(value) {
  return value ? new Date(value).toISOString() : null;
}

/**
 * "Sat, 7 Nov 2026, 9:00 am – 12:00 pm" (end time only when it's the same day).
 * @param {string} start
 * @param {string | null | undefined} end
 * @param {Lang} [lang] another language than the page's (the downloaded poster is always English)
 * @returns {string}
 */
function formatEventTime(start, end, lang) {
  const from = formatDate(start, true, lang);
  if (!end) return from;
  const startDate = new Date(start);
  const endDate = new Date(end);
  const sameDay = startDate.toDateString() === endDate.toDateString();
  const to = sameDay ? endDate.toLocaleTimeString(locale(lang), { hour: "numeric", minute: "2-digit" }) : formatDate(end, true, lang);
  return t("events.timeRange", { from, to }, lang);
}

/**
 * True until the event has finished (end time, or start time when there's no end).
 * @param {{ starts_at: string, ends_at?: string | null }} event
 * @returns {boolean}
 */
function isNotOver(event) {
  return new Date(event.ends_at ?? event.starts_at).getTime() >= Date.now();
}

/**
 * @param {EventForm} form
 * @returns {Record<string, unknown>}
 */
function eventRow(form) {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    location_name: form.locationName.trim(),
    latitude: form.latitude,
    longitude: form.longitude,
    starts_at: fromLocalInput(form.startsAt),
    ends_at: fromLocalInput(form.endsAt),
    volunteers_needed: Number(form.volunteersNeeded),
    donation_request_id: form.donationRequestId || null,
  };
}

/**
 * This organization's events, latest first, with the linked request's title.
 * @param {string} orgId
 * @returns {Promise<VolunteerEvent[]>}
 */
async function listMyEvents(orgId) {
  const { data, error } = await db()
    .from("events")
    .select("*, request:donation_requests(title)")
    .eq("organization_id", orgId)
    .order("starts_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Creates an event. It waits for admin approval (set by the database).
 * @param {string} orgId
 * @param {EventForm} form
 * @returns {Promise<void>}
 */
async function createEvent(orgId, form) {
  const { error } = await db().from("events").insert({ ...eventRow(form), organization_id: orgId });
  if (error) throw error;
}

/**
 * Saves changes and returns the approval afterwards — the database sets it back to
 * 'pending' if the title, description, place, time or linked request changed.
 * @param {string} id
 * @param {EventForm} form
 * @returns {Promise<Approval>}
 */
async function updateEvent(id, form) {
  const { data, error } = await db().from("events").update(eventRow(form)).eq("id", id).select("approval");
  if (error) throw error;
  if (!data?.length) throw { code: "42501", message: "No event was updated" }; // i18n-ignore (shown via friendlyError by its code)
  return data[0].approval;
}

/**
 * Marks an event completed with a short summary of what happened.
 * @param {string} id
 * @param {string} summary
 * @returns {Promise<void>}
 */
async function completeEvent(id, summary) {
  const { data, error } = await db()
    .from("events")
    .update({ status: "completed", outcome_summary: summary.trim() })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw { code: "42501", message: "No event was updated" }; // i18n-ignore (shown via friendlyError by its code)
}

/**
 * Upcoming or ongoing (the "Upcoming" tab); completed and cancelled events are History.
 * @param {{ status: EventStatus }} event
 * @returns {boolean}
 */
function isActiveEventStatus(event) {
  return event.status === "upcoming" || event.status === "ongoing";
}

/**
 * One page of this organization's past events (completed or cancelled), latest first.
 * @param {string} orgId
 * @param {number} from first row (0-based)
 * @param {number} to last row, inclusive
 * @returns {Promise<VolunteerEvent[]>}
 */
async function listMyEventHistory(orgId, from, to) {
  const { data, error } = await db()
    .from("events")
    .select("*, request:donation_requests(title)")
    .eq("organization_id", orgId)
    .in("status", ["completed", "cancelled"])
    .order("starts_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  return data ?? [];
}

/**
 * Which of these events already have applications (any status). Events with applications are
 * cancelled, not deleted, so volunteers can see what happened.
 * @param {string[]} eventIds
 * @returns {Promise<Record<string, boolean>>}
 */
async function eventsWithApplications(eventIds) {
  const answers = await Promise.all(
    eventIds.map(async (id) => {
      const { data, error } = await db().rpc("event_has_applications", { ev_id: id });
      if (error) throw error;
      return /** @type {[string, boolean]} */ ([id, Boolean(data)]);
    }),
  );
  return Object.fromEntries(answers);
}

/**
 * Cancels an event with a reason that volunteers and visitors see. The database records when.
 * @param {string} id
 * @param {string} reason
 * @returns {Promise<void>}
 */
async function cancelEvent(id, reason) {
  const { data, error } = await db()
    .from("events")
    .update({ status: "cancelled", cancel_reason: reason.trim().slice(0, REASON_MAX_LENGTH) })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw { code: "42501", message: "No event was updated" }; // i18n-ignore (shown via friendlyError by its code)
}

/**
 * Deletes an event nobody has applied to. Events with applications are cancelled instead.
 * @param {string} id
 * @returns {Promise<void>}
 */
async function deleteEvent(id) {
  const { data, error } = await db().from("events").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) {
    throw { code: "P0001", message: "Volunteers have applied, so this event can't be deleted — cancel it instead." }; // i18n-ignore (translated by DB_ERRORS)
  }
}

/**
 * Updates the outcome summary of a completed event (the only thing that changes after it's over).
 * @param {string} id
 * @param {string} summary
 * @returns {Promise<void>}
 */
async function updateOutcome(id, summary) {
  const { data, error } = await db().from("events").update({ outcome_summary: summary.trim() }).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw { code: "42501", message: "No event was updated" }; // i18n-ignore (shown via friendlyError by its code)
}

/**
 * Why a cancelled event was cancelled, for event.html. Asked separately so the page still works
 * if visitors can't read the reason yet (the grant migration hasn't been run): then it's "".
 * @param {string} id
 * @returns {Promise<string>}
 */
async function getEventCancelReason(id) {
  const { data, error } = await db().from("events").select("cancel_reason").eq("id", id).maybeSingle();
  if (error) return "";
  return data?.cancel_reason ?? "";
}

/**
 * The "ended" line for a past event, e.g. "Cancelled 3 Oct 2026".
 * @param {VolunteerEvent} event
 * @returns {string}
 */
function eventEndedText(event) {
  if (event.status === "cancelled") return t("history.cancelled", { date: formatDate(event.cancelled_at ?? event.starts_at) });
  return t("history.ended", { date: formatDate(event.ends_at ?? event.starts_at) });
}

/**
 * Events waiting for approval, oldest first (admins only).
 * @returns {Promise<VolunteerEvent[]>}
 */
async function listEventsForReview() {
  const { data, error } = await db()
    .from("events")
    .select("*, organization:organizations(name), request:donation_requests(title)")
    .eq("approval", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Approves or rejects an event (admins only). Rejecting needs a note the organization will see.
 * @param {string} id
 * @param {'approved' | 'rejected'} approval
 * @param {string} [note]
 * @returns {Promise<void>}
 */
async function setEventApproval(id, approval, note = "") {
  const { data, error } = await db()
    .from("events")
    .update({ approval, admin_note: approval === "rejected" ? note.trim() : null })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw { code: "42501", message: "No event was updated" }; // i18n-ignore (shown via friendlyError by its code)
}

/**
 * Approved events that haven't finished yet, soonest first (public — works logged out).
 * @returns {Promise<VolunteerEvent[]>}
 */
async function listUpcomingPublicEvents() {
  const { data, error } = await db()
    .from("events")
    .select(`${PUBLIC_EVENT_COLUMNS}, organization:organizations(name)`)
    .eq("approval", "approved")
    .in("status", ["upcoming", "ongoing"])
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return /** @type {VolunteerEvent[]} */ (/** @type {unknown} */ (data ?? [])).filter(isNotOver);
}

/**
 * One organization's approved events that haven't finished yet (public).
 * @param {string} orgId
 * @returns {Promise<VolunteerEvent[]>}
 */
async function listOrgUpcomingEvents(orgId) {
  const { data, error } = await db()
    .from("events")
    .select(PUBLIC_EVENT_COLUMNS)
    .eq("organization_id", orgId)
    .eq("approval", "approved")
    .in("status", ["upcoming", "ongoing"])
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return /** @type {VolunteerEvent[]} */ (/** @type {unknown} */ (data ?? [])).filter(isNotOver);
}

/**
 * One approved event for event.html, or null if it doesn't exist or isn't public.
 * @param {string} id
 * @returns {Promise<VolunteerEvent | null>}
 */
async function getPublicEvent(id) {
  const { data, error } = await db()
    .from("events")
    .select(`${PUBLIC_EVENT_COLUMNS}, organization:organizations(name), request:donation_requests(id, title, status)`)
    .eq("id", id)
    .eq("approval", "approved")
    .maybeSingle();
  if (error) throw error;
  return /** @type {VolunteerEvent | null} */ (/** @type {unknown} */ (data));
}

/**
 * Checks the event form. Returns an error message per field (empty when everything is fine).
 * @param {EventForm} form
 * @param {{ isNew: boolean }} mode
 * @returns {EventErrors}
 */
function validateEvent(form, mode) {
  /** @type {EventErrors} */
  const errors = {};
  const title = form.title.trim();
  if (!title) errors.title = t("form.errEventTitle");
  else if (title.length > 100) errors.title = t("form.errTitleLong");
  if (form.description.trim().length > 1000) errors.description = t("form.errDescLong");
  const place = form.locationName.trim();
  if (!place) errors.locationName = t("form.errPlace");
  else if (place.length > 150) errors.locationName = t("form.errPlaceLong");
  if (form.latitude == null || form.longitude == null) errors.pin = t("form.errPin");

  if (!form.startsAt) errors.startsAt = t("form.errStart");
  else if (mode.isNew && new Date(form.startsAt).getTime() < Date.now()) errors.startsAt = t("form.errStartPast");
  if (form.startsAt && form.endsAt && new Date(form.endsAt) < new Date(form.startsAt)) {
    errors.endsAt = t("form.errEnd");
  }

  const needed = Number(form.volunteersNeeded);
  if (!Number.isInteger(needed) || needed < 1) errors.volunteersNeeded = t("form.errVolunteersMin");
  else if (needed > 1000) errors.volunteersNeeded = t("form.errVolunteersMax");
  return errors;
}
