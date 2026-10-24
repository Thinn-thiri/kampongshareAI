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

        async init() {
          await this.load();
        },

        async load() {
          this.loading = true;
          this.loadError = "";
          try {
            const [events, requests] = await Promise.all([listMyEvents(orgId), listMyRequests(orgId)]);
            this.events = events;
            this.myRequests = requests.map((r) => ({ id: r.id, title: r.title, status: r.status }));
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
            toast("Event marked completed. Thank you for running it!");
            this.completingId = null;
            await this.load();
          } catch (error) {
            toast(friendlyError(error), "error");
          } finally {
            this.busyId = null;
          }
        },
      };
    },
  );
});
