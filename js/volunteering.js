// @ts-check
// Volunteer applications and tasks: plain Supabase functions for volunteer.html, event.html,
// organization.html and admin.html. The database enforces the volunteer rules (REQUIREMENTS.md
// section 1) — e.g. "Event full" — and its refusals are shown as they are.

/** @typedef {'pending' | 'approved' | 'rejected' | 'withdrawn'} ApplicationStatus */
/** @typedef {'todo' | 'in_progress' | 'done'} TaskStatus */

/**
 * A volunteer's view of their own application.
 * @typedef {Object} MyApplication
 * @property {string} id
 * @property {string} event_id
 * @property {string | null} message
 * @property {ApplicationStatus} status
 * @property {string} created_at
 * @property {{ id: string, title: string, starts_at: string, ends_at: string | null, location_name: string | null,
 *              status: EventStatus, approval: Approval, volunteers_needed: number,
 *              cancel_reason: string | null, cancelled_at: string | null, outcome_summary: string | null,
 *              organization: { name: string } | null } | null} event   null if the event isn't visible any more
 */

/**
 * An application as the organization (or admin) sees it, with the volunteer's details.
 * @typedef {Object} Application
 * @property {string} id
 * @property {string} event_id
 * @property {string} volunteer_id
 * @property {string | null} message
 * @property {ApplicationStatus} status
 * @property {string} created_at
 * @property {{ full_name: string, phone: string | null, available_days: string[], available_times: string[],
 *              interests: string[], skills: string[] } | null} volunteer
 * @property {{ title: string, starts_at: string, location_name: string | null,
 *              organization: { name: string } | null } | null} [event]   admin queue only
 */

/**
 * A row of public.volunteer_tasks.
 * @typedef {Object} VolunteerTask
 * @property {string} id
 * @property {string} event_id
 * @property {string} volunteer_id
 * @property {string} title
 * @property {string | null} description
 * @property {string | null} due_at
 * @property {TaskStatus} status
 * @property {{ title: string, starts_at: string, ends_at?: string | null, status?: EventStatus } | null} [event]
 * @property {{ full_name: string } | null} [volunteer]
 */

/** Application badges live in STATUS_BADGE (js/ui.js) with every other status. */
/** @type {Record<ApplicationStatus, { className: string, readonly label: string }>} */
const APPLICATION_BADGE = /** @type {any} */ (STATUS_BADGE.application);

/** Shown under the disabled Withdraw button once a volunteer is approved (in the chosen language). */
function confirmedNote() {
  return t("event.confirmedNote");
}

/** @type {Record<TaskStatus, string>} */
const TASK_STATUS_CLASS = { todo: "badge badge-neutral", in_progress: "badge badge-info", done: "badge badge-success" };

const TASK_STATUS_OPTIONS = enumOptions("taskStatus", /** @type {TaskStatus[]} */ (["todo", "in_progress", "done"])).map((option) => ({
  ...option,
  className: TASK_STATUS_CLASS[option.value],
  get label() {
    return enumLabel("taskStatus", option.value);
  },
}));

/**
 * "Sat, Sun · morning, evening" (or "Not given").
 * @param {string[] | null | undefined} days
 * @param {string[] | null | undefined} times
 * @returns {string}
 */
function formatAvailability(days, times) {
  const dayText = enumList("day", days);
  const timeText = enumList("time", times);
  return [dayText, timeText].filter(Boolean).join(" · ") || t("common.notGiven");
}

/**
 * Approved volunteers per event (numbers only), for "spots left" / "Event full".
 * @param {string[]} eventIds
 * @returns {Promise<Record<string, number>>}
 */
async function getApprovedCounts(eventIds) {
  if (eventIds.length === 0) return {};
  const { data, error } = await db().rpc("event_volunteer_counts", { event_ids: eventIds });
  if (error) throw error;
  /** @type {Record<string, number>} */
  const counts = {};
  for (const row of data ?? []) counts[row.event_id] = Number(row.approved);
  return counts;
}

/**
 * Spots left (Infinity when the event has no limit).
 * @param {{ volunteers_needed: number }} event
 * @param {number | undefined} approved
 * @returns {number}
 */
function spotsLeft(event, approved) {
  if (!event.volunteers_needed) return Infinity;
  return Math.max(event.volunteers_needed - (approved ?? 0), 0);
}

/**
 * @param {{ data: unknown[] | null, error: unknown }} result
 * @param {string} what
 */
function expectUpdated(result, what) {
  if (result.error) throw result.error;
  if (!result.data?.length) throw { code: "42501", message: `No ${what} was updated` }; // i18n-ignore (shown via friendlyError by its code)
}

/**
 * This volunteer's applications, newest first.
 * @param {string} volunteerId
 * @returns {Promise<MyApplication[]>}
 */
async function listMyApplications(volunteerId) {
  const { data, error } = await db()
    .from("volunteer_applications")
    .select(
      "*, event:events(id, title, starts_at, ends_at, location_name, status, approval, volunteers_needed, cancel_reason, cancelled_at, outcome_summary, organization:organizations(name))",
    )
    .eq("volunteer_id", volunteerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Active = still going: a pending or approved application for an upcoming or ongoing event that isn't over.
 * Everything else (rejected, withdrawn, or the event was completed, cancelled or has ended) is History.
 * @param {MyApplication} application
 * @returns {boolean}
 */
function isActiveApplication(application) {
  const event = application.event;
  if (!event || (application.status !== "pending" && application.status !== "approved")) return false;
  return (event.status === "upcoming" || event.status === "ongoing") && isNotOver(event);
}

/**
 * What happened to the event, for an application in History.
 * @param {MyApplication} application
 * @returns {{ text: string, detail: string }}
 */
function applicationOutcome(application) {
  const event = application.event;
  if (!event) return { text: t("history.eventGone"), detail: "" };
  if (event.status === "cancelled") {
    return { text: event.cancel_reason ? t("history.eventCancelledReason", { reason: event.cancel_reason }) : t("history.eventCancelled"), detail: "" };
  }
  if (event.status === "completed") return { text: t("history.eventCompleted"), detail: event.outcome_summary ?? "" };
  if (!isNotOver(event)) return { text: t("history.eventEnded"), detail: "" };
  return { text: "", detail: "" };
}

/**
 * The date line for an application in History: when the event was cancelled or ended, else when they applied.
 * @param {MyApplication} application
 * @returns {string}
 */
function applicationEndedText(application) {
  const event = application.event;
  if (event?.status === "cancelled" && event.cancelled_at) return t("history.cancelled", { date: formatDate(event.cancelled_at) });
  if (event && (event.status === "completed" || !isNotOver(event))) return t("history.ended", { date: formatDate(event.ends_at ?? event.starts_at) });
  return t("history.applied", { date: formatDate(application.created_at) });
}

/**
 * Active tasks: not done yet, for an event that hasn't been completed or cancelled.
 * @param {VolunteerTask} task
 * @returns {boolean}
 */
function isActiveTask(task) {
  return task.status !== "done" && task.event?.status !== "completed" && task.event?.status !== "cancelled";
}

/**
 * Applies to an event, or applies again after withdrawing (one application per event).
 * Applying again only re-opens the application: the database lets volunteers change the
 * status of an application, not its message, so the original message is kept.
 * @param {string} eventId
 * @param {string} message
 * @param {MyApplication} [existing] a withdrawn application to re-open
 * @returns {Promise<void>}
 */
async function applyToEvent(eventId, message, existing) {
  if (existing) {
    const result = await db().from("volunteer_applications").update({ status: "pending" }).eq("id", existing.id).select("id");
    expectUpdated(result, "application");
    return;
  }
  const { error } = await db().from("volunteer_applications").insert({ event_id: eventId, message: message.trim() || null });
  if (error) throw error;
}

/**
 * Withdraws a pending or approved application (frees the spot).
 * @param {string} id
 * @returns {Promise<void>}
 */
async function withdrawApplication(id) {
  expectUpdated(await db().from("volunteer_applications").update({ status: "withdrawn" }).eq("id", id).select("id"), "application");
}

/**
 * This volunteer's tasks, soonest first.
 * @param {string} volunteerId
 * @returns {Promise<VolunteerTask[]>}
 */
async function listMyTasks(volunteerId) {
  const { data, error } = await db()
    .from("volunteer_tasks")
    .select("*, event:events(title, starts_at, ends_at, status)")
    .eq("volunteer_id", volunteerId)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * The volunteer updates a task's status (the only thing they may change).
 * @param {string} id
 * @param {TaskStatus} status
 * @returns {Promise<void>}
 */
async function updateTaskStatus(id, status) {
  expectUpdated(await db().from("volunteer_tasks").update({ status }).eq("id", id).select("id"), "task");
}

/**
 * Applications for one of the organization's events, with each volunteer's details.
 * @param {string} eventId
 * @returns {Promise<Application[]>}
 */
async function listEventApplications(eventId) {
  const { data, error } = await db()
    .from("volunteer_applications")
    .select("*, volunteer:profile_contacts(full_name, phone, available_days, available_times, interests, skills)")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * The organization or admin approves, rejects, or removes (approved → rejected) a volunteer.
 * @param {string} id
 * @param {'approved' | 'rejected'} status
 * @returns {Promise<void>}
 */
async function setApplicationStatus(id, status) {
  expectUpdated(await db().from("volunteer_applications").update({ status }).eq("id", id).select("id"), "application");
}

/**
 * Tasks for one event, with the volunteer's name.
 * @param {string} eventId
 * @returns {Promise<VolunteerTask[]>}
 */
async function listEventTasks(eventId) {
  const { data, error } = await db()
    .from("volunteer_tasks")
    .select("*, volunteer:profile_contacts(full_name)")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Assigns a task to an approved volunteer of the event.
 * @param {{ eventId: string, volunteerId: string, title: string, description: string, dueAt: string }} task
 * @returns {Promise<void>}
 */
async function createTask(task) {
  const { error } = await db()
    .from("volunteer_tasks")
    .insert({
      event_id: task.eventId,
      volunteer_id: task.volunteerId,
      title: task.title.trim(),
      description: task.description.trim() || null,
      due_at: fromLocalInput(task.dueAt),
    });
  if (error) throw error;
}

/**
 * How many volunteer applications wait for this organization's decision, across all its events.
 * A head-only count: no rows (and no personal details) are downloaded.
 * @param {string} orgId
 * @returns {Promise<number>}
 */
async function countPendingApplications(orgId) {
  const { count, error } = await db()
    .from("volunteer_applications")
    .select("id, event:events!inner(organization_id)", { count: "exact", head: true })
    .eq("status", "pending")
    .eq("event.organization_id", orgId);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Pending applications for the admin queue, oldest first.
 * @returns {Promise<Application[]>}
 */
async function listApplicationsForReview() {
  const { data, error } = await db()
    .from("volunteer_applications")
    .select(
      "*, volunteer:profiles(full_name, phone, available_days, available_times, interests, skills), event:events(title, starts_at, location_name, organization:organizations(name))",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * A volunteer account waiting for (or reviewed by) the admin.
 * @typedef {Object} VolunteerAccount
 * @property {string} id
 * @property {string} full_name
 * @property {string | null} phone
 * @property {string | null} area
 * @property {string[]} available_days
 * @property {string[]} available_times
 * @property {string[]} interests
 * @property {string[]} skills
 * @property {Approval | null} volunteer_approval
 * @property {string | null} volunteer_note
 * @property {string} created_at
 */

/**
 * Volunteer accounts waiting for admin approval, oldest first (admins only).
 * @returns {Promise<VolunteerAccount[]>}
 */
async function listVolunteerAccountsForReview() {
  const { data, error } = await db()
    .from("profiles")
    .select("id, full_name, phone, area, available_days, available_times, interests, skills, volunteer_approval, volunteer_note, created_at")
    .eq("is_volunteer", true)
    .eq("volunteer_approval", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * The admin approves or rejects a volunteer account. Rejecting needs a note the volunteer will see.
 * @param {string} profileId
 * @param {'approved' | 'rejected'} approval
 * @param {string} [note]
 * @returns {Promise<void>}
 */
async function setVolunteerApproval(profileId, approval, note = "") {
  const result = await db()
    .from("profiles")
    .update({ volunteer_approval: approval, volunteer_note: approval === "rejected" ? note.trim() : null })
    .eq("id", profileId)
    .select("id");
  expectUpdated(result, "volunteer account");
}

/**
 * @param {string} message
 * @returns {string} an error message, or "" when fine
 */
function validateApplicationMessage(message) {
  return message.trim().length > 500 ? t("event.errMessage") : "";
}

/**
 * @param {{ title: string, description: string }} task
 * @returns {Record<string, string>}
 */
function validateTask(task) {
  /** @type {Record<string, string>} */
  const errors = {};
  if (!task.title.trim()) errors.title = t("form.errTaskTitle");
  else if (task.title.trim().length > 100) errors.title = t("form.errTitleLong");
  if (task.description.trim().length > 500) errors.description = t("form.errTaskDetailsLong");
  return errors;
}
