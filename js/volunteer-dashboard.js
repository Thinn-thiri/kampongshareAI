// @ts-check
// Volunteer dashboard (volunteer.html): upcoming events, "My applications" and "My tasks".
// Four sections, Overview · Find events · My applications · My tasks, linked from the top bar
// (js/auth.js DASHBOARD_SECTIONS) and kept in the URL hash, so reloading and Back / Forward work.
// UI state only — database calls live in js/volunteering.js and js/events.js.

/** @typedef {'overview' | 'find' | 'applications' | 'tasks'} VolunteerSection */

const VOLUNTEER_SECTIONS = /** @type {VolunteerSection[]} */ (["overview", "find", "applications", "tasks"]);

/** Older links pointed at the headings of the one long page. */
const OLD_VOLUNTEER_HASHES = /** @type {Record<string, VolunteerSection>} */ ({
  "events-heading": "find",
  "apps-heading": "applications",
  "tasks-heading": "tasks",
});

/**
 * The section in the hash.
 * @returns {VolunteerSection}
 */
function readVolunteerSection() {
  const hash = location.hash.replace(/^#/, "");
  if (VOLUNTEER_SECTIONS.includes(/** @type {VolunteerSection} */ (hash))) return /** @type {VolunteerSection} */ (hash);
  return OLD_VOLUNTEER_HASHES[hash] ?? "overview";
}

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("volunteerDashboard", () => ({
    /** @type {VolunteerSection} */
    section: readVolunteerSection(),

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

    /** Tabs: active (still going) or history (finished), for applications and tasks */
    appTab: "active",
    taskTab: "active",
    /** Past applications / tasks, shown 20 at a time (a volunteer has few, so they're already loaded) */
    /** @type {HistoryPager<MyApplication>} */
    appHistory: historyPager(),
    /** @type {HistoryPager<VolunteerTask>} */
    taskHistory: historyPager(),

    /** @type {string | null} event whose apply form is open */
    applyEventId: null,
    applyMessage: "",
    applyError: "",
    /** @type {string | null} event or application being updated */
    busyId: null,

    badges: APPLICATION_BADGE,
    get confirmedNote() {
      return confirmedNote();
    },
    taskOptions: TASK_STATUS_OPTIONS,
    formatEventTime,
    /** @type {MyApplication | null} the application in the timeline panel */
    panelApp: null,

    /**
     * The application's journey: Applied → Approved → Event day → Completed (REQUIREMENTS.md 12).
     * @param {MyApplication} application
     */
    trackerFor(application) {
      return applicationTracker(application, { tasks: this.tasks, viewer: "volunteer" });
    },

    /**
     * @param {MyApplication} application
     * @param {Event} event
     */
    openTimeline(application, event) {
      this.panelApp = application;
      openSidePanel("app-panel", event.currentTarget);
    },

    async init() {
      try {
        this.profile = await getProfile();
      } catch {
        this.profile = null;
      }
      if (!this.profile?.is_volunteer) return; // the page guard is redirecting
      // older links (#apps-heading…): show the section's own address so the top bar marks it
      const showOldHashAsSection = () => {
        if (!OLD_VOLUNTEER_HASHES[location.hash.replace(/^#/, "")]) return false;
        history.replaceState(null, "", `${location.pathname}${location.search}#${readVolunteerSection()}`);
        window.dispatchEvent(new HashChangeEvent("hashchange"));
        return true;
      };
      window.addEventListener("hashchange", () => {
        if (showOldHashAsSection()) return;
        this.section = readVolunteerSection();
        window.scrollTo({ top: 0 });
      });
      showOldHashAsSection();
      this.appHistory = historyPager(async (from, to) => this.pastApplications.slice(from, to + 1), () => t("volunteer.pastApplications"));
      this.taskHistory = historyPager(async (from, to) => this.pastTasks.slice(from, to + 1), () => t("volunteer.pastTasks"));
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
        toast(t("volunteer.reviewSent"));
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.askingReview = false;
      }
    },

    /** Find events: only events you haven't applied to, or withdrew from (you can apply again). */
    get findEvents() {
      return this.events.filter((event) => {
        const application = this.applicationFor(event.id);
        return !application || application.status === "withdrawn";
      });
    },

    get activeApplications() {
      return this.applications.filter(isActiveApplication);
    },

    /** Newest first: when the event ended or was cancelled, else when they applied. */
    get pastApplications() {
      /** @param {MyApplication} a */
      const when = (a) => new Date(a.event?.cancelled_at ?? (a.event && !isActiveApplication(a) ? a.event.ends_at ?? a.event.starts_at : a.created_at)).getTime();
      return this.applications.filter((a) => !isActiveApplication(a)).sort((a, b) => when(b) - when(a));
    },

    get activeTasks() {
      return this.tasks.filter(isActiveTask);
    },

    get pastTasks() {
      return this.tasks.filter((t) => !isActiveTask(t)).reverse();
    },

    get activeApplicationCount() {
      return this.activeApplications.length;
    },

    get openTaskCount() {
      return this.activeTasks.length;
    },

    /** Confirmed places for events that haven't ended: the "My applications" badge. */
    get confirmedApplications() {
      return this.activeApplications.filter((a) => a.status === "approved");
    },

    /** The soonest confirmed event, for "Coming up" on the Overview. */
    get nextEvent() {
      /** @param {MyApplication} a */
      const start = (a) => new Date(a.event?.starts_at ?? 0).getTime();
      return [...this.confirmedApplications].sort((a, b) => start(a) - start(b))[0] ?? null;
    },

    /** Badges in the top bar and bottom bar. */
    sendCounts() {
      window.dispatchEvent(
        new CustomEvent("dashboard-counts", { detail: { applications: this.confirmedApplications.length, tasks: this.openTaskCount } }),
      );
    },

    /** @param {'active' | 'history'} tab */
    showAppTab(tab) {
      this.appTab = tab;
      if (tab === "history") this.appHistory.load();
    },

    /** @param {'active' | 'history'} tab */
    showTaskTab(tab) {
      this.taskTab = tab;
      if (tab === "history") this.taskHistory.load();
    },

    applicationOutcome,
    applicationEndedText,

    /** "Apply again" only makes sense while the event is still going. */
    /** @param {{ status: EventStatus, starts_at: string, ends_at: string | null }} event */
    isActiveEvent(event) {
      return (event.status === "upcoming" || event.status === "ongoing") && isNotOver(event);
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
        this.sendCounts();
        if (this.appHistory.loaded) await this.appHistory.load();
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
        this.sendCounts();
        if (this.taskHistory.loaded) await this.taskHistory.load();
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
      if (left === Infinity) return t("volunteer.everyoneWelcome");
      if (left === 0) return t("volunteer.eventFull");
      return t("volunteer.spotsLeft", { left, count: event.volunteers_needed });
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
        toast(t("volunteer.applied"));
        this.applyEventId = null;
        await this.reloadAll();
        // the event moves to My applications, so its card is gone: keep keyboard focus on the list's heading
        const heading = document.getElementById("events-heading");
        heading?.setAttribute("tabindex", "-1");
        heading?.focus();
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
        toast(t("volunteer.appliedAgain"));
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
      const title = application.event?.title ?? t("volunteer.thisEvent");
      const ok = await confirmDialog(t("volunteer.withdrawText", { title }), {
        title: t("volunteer.withdrawTitle"),
        confirmText: t("volunteer.withdraw"),
        cancelText: t("common.keepIt"),
        danger: true,
      });
      if (!ok) return;
      this.busyId = application.id;
      try {
        await withdrawApplication(application.id);
        toast(t("volunteer.withdrawn"));
        // the card may be gone: keep keyboard users in the section they're in
        focusHeading(this.section === "find" ? "events-heading" : "apps-heading");
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
        toast(t("volunteer.taskUpdated"));
        this.sendCounts();
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
