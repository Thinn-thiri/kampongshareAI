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
 * @property {{ title: string, starts_at: string } | null} [event]
 * @property {{ full_name: string } | null} [volunteer]
 */

/** @type {Record<ApplicationStatus, { className: string, label: string }>} */
const APPLICATION_BADGE = {
  pending: { className: "badge badge-warning", label: "Waiting" },
  approved: { className: "badge badge-success", label: "Approved" },
  rejected: { className: "badge badge-neutral", label: "Not selected" },
  withdrawn: { className: "badge badge-neutral", label: "Withdrawn" },
};

/** Shown under the disabled Withdraw button once a volunteer is approved. */
const CONFIRMED_NOTE = "Your place is confirmed — please contact the organization if you can't make it.";

const TASK_STATUS_OPTIONS = /** @type {{ value: TaskStatus, label: string, className: string }[]} */ ([
  { value: "todo", label: "To do", className: "badge badge-neutral" },
  { value: "in_progress", label: "In progress", className: "badge badge-info" },
  { value: "done", label: "Done", className: "badge badge-success" },
]);

const DAY_NAMES = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

/**
 * "Sat, Sun · morning, evening" (or "Not given").
 * @param {string[] | null | undefined} days
 * @param {string[] | null | undefined} times
 * @returns {string}
 */
function formatAvailability(days, times) {
  const dayText = (days ?? []).map((d) => DAY_NAMES[/** @type {keyof typeof DAY_NAMES} */ (d)] ?? d).join(", ");
  const timeText = (times ?? []).join(", ");
  return [dayText, timeText].filter(Boolean).join(" · ") || "Not given";
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
  if (!result.data?.length) throw { code: "42501", message: `No ${what} was updated` };
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
      "*, event:events(id, title, starts_at, ends_at, location_name, status, approval, volunteers_needed, organization:organizations(name))",
    )
    .eq("volunteer_id", volunteerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
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
    .select("*, event:events(title, starts_at)")
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
    .select("*, volunteer:profiles(full_name, phone, available_days, available_times, interests, skills)")
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
    .select("*, volunteer:profiles(full_name)")
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
 * @param {string} message
 * @returns {string} an error message, or "" when fine
 */
function validateApplicationMessage(message) {
  return message.trim().length > 500 ? "Please keep your message under 500 characters." : "";
}

/**
 * @param {{ title: string, description: string }} task
 * @returns {Record<string, string>}
 */
function validateTask(task) {
  /** @type {Record<string, string>} */
  const errors = {};
  if (!task.title.trim()) errors.title = "What should they do?";
  else if (task.title.trim().length > 100) errors.title = "Please keep the title under 100 characters.";
  if (task.description.trim().length > 500) errors.description = "Please keep the details under 500 characters.";
  return errors;
}
