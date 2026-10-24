// @ts-check
// Public event page (event.html?id=<event id>). Works without logging in.
// Only approved events are returned by the database; anything else shows "isn't available".

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("eventPage", () => ({
    /** @type {VolunteerEvent | null} */
    event: null,
    loading: true,
    notFound: false,
    error: "",
    formatEventTime,
    badges: APPLICATION_BADGE,
    confirmedNote: CONFIRMED_NOTE,

    /** @type {Profile | null} null for visitors */
    profile: null,
    approvedCount: 0,
    /** @type {MyApplication | null} */
    myApplication: null,

    showApply: false,
    applyMessage: "",
    applyError: "",
    busy: false,

    async init() {
      const id = new URLSearchParams(location.search).get("id") ?? "";
      // Event ids are UUIDs; anything else can't be an event.
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        this.notFound = true;
        this.loading = false;
        return;
      }
      try {
        const [event, profile] = await Promise.all([getPublicEvent(id), getProfile().catch(() => null)]);
        this.event = event;
        this.profile = profile;
        this.notFound = !event;
        if (event) await this.loadVolunteering();
      } catch (error) {
        this.error = friendlyError(error);
      } finally {
        this.loading = false;
      }
      if (this.event) {
        const event = this.event;
        document.title = `${event.title} · KampongShare`;
        setTimeout(() => {
          const element = document.getElementById("event-map");
          if (element) createPinMap(element, { lat: event.latitude, lng: event.longitude, label: event.title });
        }, 0);
      }
    },

    async loadVolunteering() {
      if (!this.event) return;
      const counts = await getApprovedCounts([this.event.id]);
      this.approvedCount = counts[this.event.id] ?? 0;
      if (this.profile?.is_volunteer) {
        const mine = await listMyApplications(this.profile.id);
        this.myApplication = mine.find((a) => a.event_id === this.event?.id) ?? null;
      }
    },

    get isOver() {
      return this.event ? !isNotOver(this.event) || this.event.status === "completed" || this.event.status === "cancelled" : false;
    },

    get spots() {
      return this.event ? spotsLeft(this.event, this.approvedCount) : 0;
    },

    get isFull() {
      return this.spots === 0;
    },

    /**
     * Which volunteer message / button to show (REQUIREMENTS.md 5.1 and 6.6a).
     * @returns {'ended' | 'visitor' | 'not_individual' | 'turn_on' | 'account_pending' | 'account_rejected'
     *   | 'consent' | 'applied' | 'full' | 'can_apply'}
     */
    get volunteerState() {
      if (this.isOver) return "ended";
      if (!this.profile) return "visitor";
      if (this.profile.role === "organization" || this.profile.role === "admin") return "not_individual";
      if (!this.profile.is_volunteer) return "turn_on";
      if (this.profile.volunteer_approval === "rejected") return "account_rejected";
      if (!isApprovedVolunteer(this.profile)) return "account_pending";
      if (this.myApplication && this.myApplication.status !== "withdrawn") return "applied";
      if (this.isFull) return "full";
      if (!this.profile.consented_at || !this.profile.age_confirmed) return "consent";
      return "can_apply";
    },

    /** Login link that brings the visitor back to this event (relative path only, REQUIREMENTS.md 5.1). */
    get loginHref() {
      return "/login.html?next=" + encodeURIComponent(location.pathname + location.search);
    },

    /** Donate → the linked request if it's open, otherwise the organization's open requests. */
    get donateHref() {
      if (!this.event) return "/donor.html";
      const request = this.event.request;
      if (request?.id && request.status === "open") return `/donor.html?request=${encodeURIComponent(request.id)}`;
      return `/donor.html?org=${encodeURIComponent(this.event.organization_id)}`;
    },

    async turnOnVolunteering() {
      this.busy = true;
      try {
        this.profile = await enableRole("volunteer");
        window.dispatchEvent(new CustomEvent("profile-changed"));
        toast(
          isApprovedVolunteer(this.profile)
            ? "Volunteering is turned on. You can apply now."
            : "Volunteering is turned on. An admin will approve your volunteer account before you can apply.",
        );
        await this.loadVolunteering();
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.busy = false;
      }
    },

    async askForReview() {
      this.busy = true;
      try {
        this.profile = await requestVolunteerReview();
        toast("Thanks — your volunteer account was sent to the admin for review again.");
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.busy = false;
      }
    },

    openApply() {
      this.showApply = true;
      this.applyMessage = "";
      this.applyError = "";
      setTimeout(() => document.getElementById("apply-message")?.focus(), 0);
    },

    async apply() {
      if (!this.event) return;
      this.applyError = validateApplicationMessage(this.applyMessage);
      if (this.applyError) return;
      this.busy = true;
      try {
        const withdrawn = this.myApplication?.status === "withdrawn" ? this.myApplication : undefined;
        await applyToEvent(this.event.id, this.applyMessage, withdrawn);
        toast("You've applied! The organization will confirm your place.");
        this.showApply = false;
        await this.loadVolunteering();
      } catch (error) {
        this.applyError = friendlyError(error);
      } finally {
        this.busy = false;
      }
    },

    async withdraw() {
      const application = this.myApplication;
      // Only pending applications can be withdrawn; once approved the button is disabled.
      if (!application || application.status !== "pending") return;
      const ok = await confirmDialog("Your application will be withdrawn. You can apply again later if there's room.", {
        title: "Withdraw your application?",
        confirmText: "Withdraw",
        cancelText: "Keep it",
        danger: true,
      });
      if (!ok) return;
      this.busy = true;
      try {
        await withdrawApplication(application.id);
        toast("Your application was withdrawn.");
        await this.loadVolunteering();
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.busy = false;
      }
    },
  }));
});
