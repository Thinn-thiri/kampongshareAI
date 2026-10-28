// @ts-check
// "Volunteers" panel inside each event card on organization.html: review applications,
// remove approved volunteers, assign tasks and see their status.
// UI state only — database calls live in js/volunteering.js.

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("eventVolunteers", (/** @type {VolunteerEvent} */ event) => ({
    ...messageButtons(),
    open: false,
    loaded: false,
    loading: false,
    error: "",
    /** @type {Application[]} */
    applications: [],
    /** @type {VolunteerTask[]} */
    tasks: [],
    /** @type {string | null} */
    busyId: null,

    /** @type {string | null} volunteer whose task form is open */
    taskFor: null,
    taskForm: { title: "", description: "", dueAt: "" },
    /** @type {Record<string, string>} */
    taskErrors: {},
    taskError: "",
    savingTask: false,

    badges: APPLICATION_BADGE,
    formatAvailability,

    get approvedCount() {
      return this.applications.filter((a) => a.status === "approved").length;
    },

    get pendingCount() {
      return this.applications.filter((a) => a.status === "pending").length;
    },

    get isFull() {
      return event.volunteers_needed > 0 && this.approvedCount >= event.volunteers_needed;
    },

    get summary() {
      if (!event.volunteers_needed) return t("orgDash.approvedCount", { approved: this.approvedCount });
      const counts = { approved: this.approvedCount, needed: event.volunteers_needed };
      return this.isFull ? t("orgDash.fullApprovedOf", counts) : t("orgDash.approvedOf", counts);
    },

    /** Applications worth showing: withdrawn ones are hidden. */
    get shown() {
      const order = { pending: 0, approved: 1, rejected: 2, withdrawn: 3 };
      return this.applications.filter((a) => a.status !== "withdrawn").sort((a, b) => order[a.status] - order[b.status]);
    },

    async toggle() {
      this.open = !this.open;
      if (this.open && !this.loaded) await this.load();
    },

    async load() {
      this.loading = true;
      this.error = "";
      try {
        const [applications, tasks] = await Promise.all([listEventApplications(event.id), listEventTasks(event.id)]);
        this.applications = applications;
        this.tasks = tasks;
        this.loaded = true;
      } catch (error) {
        this.error = friendlyError(error);
      } finally {
        this.loading = false;
      }
    },

    /** "Message volunteer": a private conversation about this application. @param {Application} application */
    messageVolunteer(application) {
      this.messageTo(event.organization_id, application.volunteer_id, t("messages.topicApplication", { title: event.title }));
    },

    /**
     * @param {Application} application
     * @param {'approve' | 'reject' | 'remove'} action
     */
    async decide(application, action) {
      const name = application.volunteer?.full_name || t("orgDash.thisVolunteer");
      const dialogs = {
        approve: {
          title: t("orgDash.approveVolunteerTitle"),
          message: t("orgDash.approveVolunteerText", { name, event: event.title }),
          confirmText: t("common.approve"),
          danger: false,
          done: t("orgDash.volunteerApproved", { name }),
        },
        reject: {
          title: t("orgDash.rejectApplicationTitle"),
          message: t("orgDash.rejectApplicationText", { name }),
          confirmText: t("common.reject"),
          danger: true,
          done: t("orgDash.applicationRejected"),
        },
        remove: {
          title: t("orgDash.removeVolunteerTitle"),
          message: t("orgDash.removeVolunteerText", { name, event: event.title }),
          confirmText: t("orgDash.removeVolunteer"),
          danger: true,
          done: t("orgDash.volunteerRemoved", { name }),
        },
      };
      const dialog = dialogs[action];
      const ok = await confirmDialog(dialog.message, { title: dialog.title, confirmText: dialog.confirmText, danger: dialog.danger });
      if (!ok) return;
      this.busyId = application.id;
      try {
        await setApplicationStatus(application.id, action === "approve" ? "approved" : "rejected");
        toast(dialog.done);
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.busyId = null;
      }
      await this.load();
    },

    /** @param {string} volunteerId */
    openTask(volunteerId) {
      this.taskFor = volunteerId;
      this.taskForm = { title: "", description: "", dueAt: "" };
      this.taskErrors = {};
      this.taskError = "";
      setTimeout(() => document.getElementById(`task-title-${event.id}-${volunteerId}`)?.focus(), 0);
    },

    /** @param {string} volunteerId */
    async saveTask(volunteerId) {
      this.taskError = "";
      this.taskErrors = validateTask(this.taskForm);
      if (Object.keys(this.taskErrors).length) {
        document.getElementById(`task-title-${event.id}-${volunteerId}`)?.focus();
        return;
      }
      this.savingTask = true;
      try {
        await createTask({ eventId: event.id, volunteerId, ...this.taskForm });
        toast(t("orgDash.taskAssigned"));
        this.taskFor = null;
        await this.load();
      } catch (error) {
        this.taskError = friendlyError(error);
      } finally {
        this.savingTask = false;
      }
    },

    /**
     * @param {string} volunteerId
     * @returns {VolunteerTask[]}
     */
    tasksOf(volunteerId) {
      return this.tasks.filter((t) => t.volunteer_id === volunteerId);
    },

    /**
     * @param {TaskStatus} status
     * @returns {{ value: TaskStatus, label: string, className: string }}
     */
    taskBadge(status) {
      return TASK_STATUS_OPTIONS.find((option) => option.value === status) ?? TASK_STATUS_OPTIONS[0];
    },
  }));
});
