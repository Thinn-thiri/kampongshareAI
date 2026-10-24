// @ts-check
// Volunteer dashboard (volunteer.html): upcoming events, "My applications" and "My tasks".
// UI state only — database calls live in js/volunteering.js and js/events.js.

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("volunteerDashboard", () => ({
    /** @type {Profile | null} */
    profile: null,

    /** @type {VolunteerEvent[]} */
    events: [],
    /** @type {Record<string, number>} approved volunteers per event */
    counts: {},
    loadingEvents: true,
    eventsError: "",

    /** @type {MyApplication[]} */
    applications: [],
    loadingApplications: true,
    applicationsError: "",

    /** @type {VolunteerTask[]} */
    tasks: [],
    loadingTasks: true,
    tasksError: "",

    /** @type {string | null} event whose apply form is open */
    applyEventId: null,
    applyMessage: "",
    applyError: "",
    /** @type {string | null} event or application being updated */
    busyId: null,

    badges: APPLICATION_BADGE,
    confirmedNote: CONFIRMED_NOTE,
    taskOptions: TASK_STATUS_OPTIONS,
    formatEventTime,

    async init() {
      try {
        this.profile = await getProfile();
      } catch {
        this.profile = null;
      }
      if (!this.profile?.is_volunteer) return; // the page guard is redirecting
      await Promise.all([this.loadEvents(), this.loadApplications(), this.loadTasks()]);
    },

    /** Consent and 18+ are needed before the database accepts applications (REQUIREMENTS.md 4.2). */
    get needsConsent() {
      return Boolean(this.profile && (!this.profile.consented_at || !this.profile.age_confirmed));
    },

    /** The admin must approve the volunteer account before applying (read-only until then). */
    get accountApproved() {
      return isApprovedVolunteer(this.profile);
    },

    get accountStatus() {
      return this.profile?.volunteer_approval ?? "pending";
    },

    /** Applying is blocked until consent is given and the account is approved. */
    get cannotApply() {
      return this.needsConsent || !this.accountApproved;
    },

    askingReview: false,

    async askForReview() {
      this.askingReview = true;
      try {
        this.profile = await requestVolunteerReview();
        toast("Thanks — your volunteer account was sent to the admin for review again.");
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.askingReview = false;
      }
    },

    get activeApplicationCount() {
      return this.applications.filter((a) => a.status === "pending" || a.status === "approved").length;
    },

    get openTaskCount() {
      return this.tasks.filter((t) => t.status !== "done").length;
    },

    async loadEvents() {
      this.loadingEvents = true;
      this.eventsError = "";
      try {
        const events = await listUpcomingPublicEvents();
        this.counts = await getApprovedCounts(events.map((e) => e.id));
        this.events = events;
      } catch (error) {
        this.eventsError = friendlyError(error);
      } finally {
        this.loadingEvents = false;
      }
    },

    async loadApplications() {
      if (!this.profile) return;
      this.loadingApplications = true;
      this.applicationsError = "";
      try {
        this.applications = await listMyApplications(this.profile.id);
      } catch (error) {
        this.applicationsError = friendlyError(error);
      } finally {
        this.loadingApplications = false;
      }
    },

    async loadTasks() {
      if (!this.profile) return;
      this.loadingTasks = true;
      this.tasksError = "";
      try {
        this.tasks = await listMyTasks(this.profile.id);
      } catch (error) {
        this.tasksError = friendlyError(error);
      } finally {
        this.loadingTasks = false;
      }
    },

    async reloadAll() {
      await Promise.all([this.loadEvents(), this.loadApplications(), this.loadTasks()]);
    },

    /**
     * @param {string} eventId
     * @returns {MyApplication | undefined}
     */
    applicationFor(eventId) {
      return this.applications.find((a) => a.event_id === eventId);
    },

    /**
     * @param {{ id: string, volunteers_needed: number }} event
     * @returns {number}
     */
    spots(event) {
      return spotsLeft(event, this.counts[event.id]);
    },

    /**
     * "3 of 10 spots left", "No limit" or "Event full"
     * @param {{ id: string, volunteers_needed: number }} event
     * @returns {string}
     */
    spotsText(event) {
      const left = this.spots(event);
      if (left === Infinity) return "Everyone welcome";
      if (left === 0) return "Event full";
      return `${left} of ${event.volunteers_needed} spots left`;
    },

    /** @param {string} eventId */
    openApply(eventId) {
      this.applyEventId = eventId;
      this.applyMessage = "";
      this.applyError = "";
      setTimeout(() => document.getElementById(`apply-msg-${eventId}`)?.focus(), 0);
    },

    closeApply() {
      this.applyEventId = null;
    },

    /** @param {string} eventId */
    async sendApplication(eventId) {
      this.applyError = validateApplicationMessage(this.applyMessage);
      if (this.applyError) return;
      this.busyId = eventId;
      try {
        await applyToEvent(eventId, this.applyMessage, this.withdrawnFor(eventId));
        toast("You've applied! The organization will confirm your place.");
        this.applyEventId = null;
        await this.reloadAll();
      } catch (error) {
        this.applyError = friendlyError(error);
      } finally {
        this.busyId = null;
      }
    },

    /**
     * A withdrawn application for this event, which "Apply again" re-opens.
     * @param {string} eventId
     * @returns {MyApplication | undefined}
     */
    withdrawnFor(eventId) {
      const application = this.applicationFor(eventId);
      return application?.status === "withdrawn" ? application : undefined;
    },

    /** @param {MyApplication} application */
    async applyAgain(application) {
      this.busyId = application.id;
      try {
        await applyToEvent(application.event_id, "", application);
        toast("You've applied again. The organization will confirm your place.");
        await this.reloadAll();
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.busyId = null;
      }
    },

    /** @param {MyApplication} application */
    async withdraw(application) {
      // Only pending applications can be withdrawn; once approved the button is disabled.
      if (application.status !== "pending") return;
      const title = application.event?.title ?? "this event";
      const ok = await confirmDialog(`Your application for "${title}" will be withdrawn. You can apply again later if there's room.`, { title: "Withdraw your application?", confirmText: "Withdraw", cancelText: "Keep it", danger: true });
      if (!ok) return;
      this.busyId = application.id;
      try {
        await withdrawApplication(application.id);
        toast("Your application was withdrawn. You can apply again if there's room.");
        await this.reloadAll();
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.busyId = null;
      }
    },

    /**
     * @param {VolunteerTask} task
     * @param {string} status
     */
    async changeTaskStatus(task, status) {
      const previous = task.status;
      task.status = /** @type {TaskStatus} */ (status);
      try {
        await updateTaskStatus(task.id, task.status);
        toast("Task updated.");
      } catch (error) {
        task.status = previous;
        toast(friendlyError(error), "error");
      }
    },

    /**
     * @param {TaskStatus} status
     * @returns {{ value: TaskStatus, label: string, className: string } | undefined}
     */
    taskBadge(status) {
      return TASK_STATUS_OPTIONS.find((option) => option.value === status);
    },
  }));
});
