// @ts-check
// "Events" section of organization.html: create / edit events and mark them completed.
// UI state only — database calls live in js/events.js; postal code lookup in js/geocode.js.

/** Form error key → id of the field to focus. */
const EVENT_FIELD_IDS = {
  title: "ev-title",
  description: "ev-description",
  locationName: "ev-place",
  pin: "ev-pin-centre",
  startsAt: "ev-starts",
  endsAt: "ev-ends",
  volunteersNeeded: "ev-volunteers",
};

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data(
    "orgEvents",
    (/** @type {string} */ orgId, /** @type {number | null} */ orgLat, /** @type {number | null} */ orgLng) => {
      // Kept outside Alpine's reactive state: Leaflet doesn't work through proxies.
      /** @type {PinMap | null} */
      let pinMap = null;
      /** @type {ReturnType<typeof setTimeout> | undefined} */
      let lookupTimer;
      let lookupCount = 0;

      /** @returns {EventForm} */
      const blankForm = () => ({
        title: "",
        description: "",
        locationName: "",
        latitude: orgLat,
        longitude: orgLng,
        startsAt: "",
        endsAt: "",
        volunteersNeeded: 1,
        donationRequestId: "",
      });

      return {
        /** @type {VolunteerEvent[]} */
        events: [],
        loading: true,
        loadError: "",
        /** @type {{ id: string, title: string, status: RequestStatus }[]} */
        myRequests: [],

        showForm: false,
        /** @type {VolunteerEvent | null} */
        editing: null,
        /** @type {EventForm} */
        form: blankForm(),
        /** @type {EventErrors} */
        errors: {},
        formError: "",
        saving: false,
        postalCode: "",
        /** @type {'' | 'loading' | 'found' | 'not_found'} */
        lookupStatus: "",
        foundAddress: "",

        /** @type {string | null} event whose outcome form is open */
        completingId: null,
        outcome: "",
        outcomeError: "",
        /** @type {string | null} */
        busyId: null,

        /** Upcoming (upcoming, ongoing) or Past & cancelled (completed, cancelled) */
        tab: "active",
        /** @type {HistoryPager<VolunteerEvent>} */
        history: historyPager((from, to) => listMyEventHistory(orgId, from, to), "past events"),
        /** @type {Record<string, boolean>} active events that already have applications (can't be deleted) */
        hasApplications: {},
        /** @type {string | null} completed event whose outcome is being edited */
        editingOutcomeId: null,

        async init() {
          await this.load();
        },

        async load() {
          this.loading = true;
          this.loadError = "";
          try {
            const [events, requests] = await Promise.all([listMyEvents(orgId), listMyRequests(orgId)]);
            this.hasApplications = await eventsWithApplications(events.filter(isActiveEventStatus).map((e) => e.id));
            this.events = events;
            this.myRequests = requests.map((r) => ({ id: r.id, title: r.title, status: r.status }));
            if (this.history.loaded) await this.history.load();
          } catch (error) {
            this.loadError = friendlyError(error);
          } finally {
            this.loading = false;
          }
        },

        /** Requests that can be linked: not closed or rejected (but keep the one already linked). */
        get linkableRequests() {
          return this.myRequests.filter(
            (r) => !["closed", "rejected"].includes(r.status) || r.id === this.form.donationRequestId,
          );
        },

        get editingApproved() {
          return this.editing?.approval === "approved";
        },

        badges: { status: EVENT_STATUS_BADGE, approval: APPROVAL_BADGE },
        formatEventTime,
        eventEndedText,

        get activeEvents() {
          return this.events.filter(isActiveEventStatus);
        },

        /** @param {'active' | 'history'} tab */
        showTab(tab) {
          this.tab = tab;
          if (tab === "history" && !this.history.loaded) this.history.load();
        },

        /** @param {string} fieldId */
        openForm(fieldId) {
          this.errors = {};
          this.formError = "";
          this.postalCode = "";
          this.lookupStatus = "";
          this.foundAddress = "";
          this.showForm = true;
          setTimeout(() => {
            this.setupMap();
            document.getElementById("event-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
            document.getElementById(fieldId)?.focus({ preventScroll: true });
          }, 0);
        },

        setupMap() {
          const element = document.getElementById("ev-map");
          if (!element) return;
          if (!pinMap) {
            pinMap = createPinMap(element, {
              lat: this.form.latitude,
              lng: this.form.longitude,
              editable: true,
              label: "Event location",
              onPick: (lat, lng) => {
                this.form.latitude = lat;
                this.form.longitude = lng;
                this.errors = { ...this.errors, pin: "" };
              },
            });
          }
          pinMap.refresh();
          if (this.form.latitude != null && this.form.longitude != null) pinMap.focus(this.form.latitude, this.form.longitude);
        },

        newEvent() {
          this.editing = null;
          this.form = blankForm();
          this.openForm("ev-title");
        },

        /** @param {VolunteerEvent} event */
        edit(event) {
          this.editing = event;
          this.form = {
            title: event.title,
            description: event.description ?? "",
            locationName: event.location_name ?? "",
            latitude: event.latitude,
            longitude: event.longitude,
            startsAt: toLocalInput(event.starts_at),
            endsAt: toLocalInput(event.ends_at),
            volunteersNeeded: event.volunteers_needed || 1,
            donationRequestId: event.donation_request_id ?? "",
          };
          this.openForm("ev-title");
        },

        cancelForm() {
          this.showForm = false;
          this.editing = null;
        },

        pinAtCentre() {
          pinMap?.centre();
        },

        onPostalInput() {
          clearTimeout(lookupTimer);
          this.errors = { ...this.errors, postal: "" };
          this.lookupStatus = "";
          this.foundAddress = "";
          const code = this.postalCode.trim();
          if (!code) return;
          lookupTimer = setTimeout(() => this.lookUpPostalCode(code), 500);
        },

        /** @param {string} code */
        async lookUpPostalCode(code) {
          if (!/^\d{6}$/.test(code)) {
            this.errors = { ...this.errors, postal: "A Singapore postal code has 6 digits, like 520123." };
            return;
          }
          const thisLookup = ++lookupCount;
          this.lookupStatus = "loading";
          const result = await lookupPostalCode(code);
          if (thisLookup !== lookupCount || this.postalCode.trim() !== code) return;
          if (!result) {
            this.lookupStatus = "not_found";
            return;
          }
          this.lookupStatus = "found";
          this.foundAddress = result.address;
          this.form.latitude = result.latitude;
          this.form.longitude = result.longitude;
          this.errors = { ...this.errors, pin: "" };
          pinMap?.focus(result.latitude, result.longitude);
          if (!this.form.locationName.trim()) this.useFoundAddress();
        },

        get canUseFoundAddress() {
          return this.lookupStatus === "found" && Boolean(this.foundAddress) && this.form.locationName.trim() !== this.foundAddress;
        },

        useFoundAddress() {
          this.form.locationName = this.foundAddress;
          this.errors = { ...this.errors, locationName: "" };
        },

        async save() {
          this.formError = "";
          this.errors = validateEvent(this.form, { isNew: !this.editing });
          const firstError = /** @type {(keyof typeof EVENT_FIELD_IDS)[]} */ (Object.keys(this.errors))[0];
          if (firstError) {
            document.getElementById(EVENT_FIELD_IDS[firstError])?.focus();
            return;
          }
          this.saving = true;
          try {
            if (this.editing) {
              const wasApproved = this.editing.approval !== "pending";
              const approval = await updateEvent(this.editing.id, this.form);
              toast(
                wasApproved && approval === "pending"
                  ? "Saved — your event was sent back to the admin for approval."
                  : "Changes saved.",
              );
            } else {
              await createEvent(orgId, this.form);
              toast("Your event was sent to the admin for approval.");
            }
            this.showForm = false;
            this.editing = null;
            await this.load();
          } catch (error) {
            this.formError = friendlyError(error);
          } finally {
            this.saving = false;
          }
        },

        /** @param {VolunteerEvent} event */
        canComplete(event) {
          return event.approval === "approved" && (event.status === "upcoming" || event.status === "ongoing");
        },

        /** @param {VolunteerEvent} event */
        startComplete(event) {
          this.completingId = event.id;
          this.outcome = "";
          this.outcomeError = "";
          setTimeout(() => document.getElementById(`outcome-${event.id}`)?.focus(), 0);
        },

        cancelComplete() {
          this.completingId = null;
        },

        /** @param {VolunteerEvent} event */
        async confirmComplete(event) {
          const summary = this.outcome.trim();
          if (!summary) {
            this.outcomeError = "Please write a short summary, e.g. how many people helped and what was done.";
            document.getElementById(`outcome-${event.id}`)?.focus();
            return;
          }
          if (summary.length > 1000) {
            this.outcomeError = "Please keep the summary under 1,000 characters.";
            return;
          }
          const ok = await confirmDialog(`"${event.title}" will be marked completed and won't take new volunteers.`, {
            title: "Mark this event completed?",
            confirmText: "Mark completed",
          });
          if (!ok) return;
          this.busyId = event.id;
          try {
            await completeEvent(event.id, summary);
            toast("Event marked completed. Thank you for running it! You'll find it under Past & cancelled.");
            focusHeading("events-heading"); // the card may be gone: keep keyboard users in this section
            this.completingId = null;
            await this.load();
          } catch (error) {
            toast(friendlyError(error), "error");
          } finally {
            this.busyId = null;
          }
        },

        /**
         * Events with applications are cancelled (volunteers see the reason); others can be deleted.
         * @param {VolunteerEvent} event
         */
        async cancel(event) {
          const reason = await reasonDialog(`"${event.title}" won't take new volunteers and will disappear from the map.`, {
            title: "Cancel this event?",
            label: "Why is it cancelled?",
            required: true,
            maxLength: REASON_MAX_LENGTH,
            warning: "Approved volunteers will see this reason, and so will anyone who opens the event's link.",
            confirmText: "Cancel event",
            cancelText: "Keep it",
            danger: true,
          });
          if (reason === null) return;
          this.busyId = event.id;
          try {
            await cancelEvent(event.id, reason);
            toast("The event was cancelled. Volunteers can see the reason.");
            focusHeading("events-heading"); // the card may be gone: keep keyboard users in this section
            if (this.editing?.id === event.id) this.cancelForm();
            await this.load();
          } catch (error) {
            toast(friendlyError(error), "error");
          } finally {
            this.busyId = null;
          }
        },

        /** @param {VolunteerEvent} event */
        async remove(event) {
          const ok = await confirmDialog("Nobody has applied yet, so it will be removed completely.", {
            title: `Delete "${event.title}"?`,
            confirmText: "Delete event",
            danger: true,
          });
          if (!ok) return;
          this.busyId = event.id;
          try {
            await deleteEvent(event.id);
            toast("The event was deleted.");
            focusHeading("events-heading"); // the card may be gone: keep keyboard users in this section
            if (this.editing?.id === event.id) this.cancelForm();
            await this.load();
          } catch (error) {
            toast(friendlyError(error), "error");
            await this.load(); // someone may have applied meanwhile: show "Cancel event" instead
          } finally {
            this.busyId = null;
          }
        },

        /** @param {VolunteerEvent} event */
        startEditOutcome(event) {
          this.editingOutcomeId = event.id;
          this.outcome = event.outcome_summary ?? "";
          this.outcomeError = "";
          setTimeout(() => document.getElementById(`edit-outcome-${event.id}`)?.focus(), 0);
        },

        /** @param {VolunteerEvent} event */
        async saveOutcome(event) {
          const summary = this.outcome.trim();
          if (!summary) {
            this.outcomeError = "Please write a short summary, e.g. how many people helped and what was done.";
            return;
          }
          if (summary.length > 1000) {
            this.outcomeError = "Please keep the summary under 1,000 characters.";
            return;
          }
          this.busyId = event.id;
          try {
            await updateOutcome(event.id, summary);
            event.outcome_summary = summary;
            this.editingOutcomeId = null;
            toast("Outcome summary saved.");
          } catch (error) {
            this.outcomeError = friendlyError(error);
          } finally {
            this.busyId = null;
          }
        },
      };
    },
  );
});
