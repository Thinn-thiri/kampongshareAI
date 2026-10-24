// @ts-check
// Organization dashboard (organization.html): create / edit the organization and see its approval status.
// UI state only — database calls live in js/orgs.js.

/** Form error key → id of the field to focus. */
const ORG_FIELD_IDS = {
  name: "org-name",
  description: "org-description",
  address: "org-address",
  phone: "org-phone",
  pin: "org-pin-centre",
};

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("orgDashboard", () => {
    // Kept outside Alpine's reactive state: Leaflet doesn't work through proxies.
    /** @type {PinMap | null} */
    let pinMap = null;

    return {
      loading: true,
      loadError: "",
      /** @type {Organization | null} */
      org: null,
      /** @type {OrganizationDetails} */
      form: { name: "", description: "", address: "", phone: "", latitude: null, longitude: null },
      /** @type {OrganizationErrors} */
      errors: {},
      formError: "",
      saving: false,

      async init() {
        await this.load();
      },

      get approved() {
        return this.org?.approval === "approved";
      },

      async load() {
        this.loading = true;
        this.loadError = "";
        try {
          const profile = await getProfile();
          if (!profile || profile.role !== "organization") return; // the page guard is redirecting
          this.org = await getMyOrganization(profile.id);
          this.form = {
            name: this.org?.name ?? "",
            description: this.org?.description ?? "",
            address: this.org?.address ?? "",
            phone: this.org?.phone ?? "",
            latitude: this.org?.latitude ?? null,
            longitude: this.org?.longitude ?? null,
          };
        } catch (error) {
          this.loadError = friendlyError(error);
        } finally {
          this.loading = false;
        }
        // Wait for Alpine to show the form, then draw the map into it.
        setTimeout(() => this.setupMap(), 0);
      },

      setupMap() {
        if (pinMap) {
          pinMap.refresh();
          return;
        }
        const element = document.getElementById("org-map");
        if (!element) return;
        pinMap = createPinMap(element, {
          lat: this.form.latitude,
          lng: this.form.longitude,
          editable: true,
          label: "Your organization",
          onPick: (lat, lng) => {
            this.form.latitude = lat;
            this.form.longitude = lng;
            this.errors = { ...this.errors, pin: undefined };
          },
        });
      },

      pinAtCentre() {
        pinMap?.centre();
      },

      async save() {
        this.formError = "";
        this.errors = validateOrganization(this.form);
        const firstError = /** @type {(keyof typeof ORG_FIELD_IDS)[]} */ (Object.keys(this.errors))[0];
        if (firstError) {
          document.getElementById(ORG_FIELD_IDS[firstError])?.focus();
          return;
        }
        this.saving = true;
        try {
          if (this.org) {
            await updateOrganization(this.org.id, this.form, !this.approved);
            toast("Your changes were saved.");
          } else {
            await createOrganization(this.form);
            toast("Thanks! Your organization was sent to the admin for approval.");
          }
          await this.load();
        } catch (error) {
          this.formError = friendlyError(error);
        } finally {
          this.saving = false;
        }
      },
    };
  });
});
