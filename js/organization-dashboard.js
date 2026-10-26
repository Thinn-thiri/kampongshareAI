// @ts-check
// Organization dashboard (organization.html): create / edit the organization and see its approval status.
// The page has four sections, Overview · Requests · Offers · Events, linked from the top bar
// (js/auth.js DASHBOARD_SECTIONS) and kept in the URL hash, so reloading and Back / Forward work.
// UI state only — database calls live in js/orgs.js.

/** @typedef {'overview' | 'requests' | 'offers' | 'events'} OrgSection */

const ORG_SECTIONS = /** @type {OrgSection[]} */ (["overview", "requests", "offers", "events"]);

/**
 * The section in the hash. Older links (#requests-heading…) still work.
 * @returns {OrgSection}
 */
function readOrgSection() {
  const hash = location.hash.replace(/^#/, "").replace(/-heading$/, "");
  if (new URLSearchParams(location.search).get("new") === "request") return "requests";
  return ORG_SECTIONS.includes(/** @type {OrgSection} */ (hash)) ? /** @type {OrgSection} */ (hash) : "overview";
}

/** Form error key → id of the field to focus. */
const ORG_FIELD_IDS = {
  name: "org-name",
  description: "org-description",
  address: "org-address",
  postalCode: "org-postal",
  phone: "org-phone",
  pin: "org-pin-centre",
};

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("orgDashboard", () => {
    // Kept outside Alpine's reactive state: Leaflet doesn't work through proxies.
    /** @type {PinMap | null} */
    let pinMap = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let lookupTimer;
    let lookupCount = 0; // only the newest lookup's answer is used

    return {
      loading: true,
      loadError: "",
      /** @type {Organization | null} */
      org: null,
      /** @type {OrganizationDetails} */
      form: { name: "", description: "", address: "", postalCode: "", phone: "", latitude: null, longitude: null },
      /** @type {OrganizationErrors} */
      errors: {},
      formError: "",
      saving: false,
      /** @type {'' | 'loading' | 'found' | 'not_found'} */
      lookupStatus: "",
      foundAddress: "",
      /** @type {OrgSection} */
      section: readOrgSection(),
      /** approved organizations see a summary first; "Edit details" opens the form */
      editingDetails: false,

      async init() {
        // older links (#requests-heading) and "Post a request" (?new=request): show the section's own
        // address, and tell the top bar so the right link is marked as current
        const canonical = `#${this.section}`;
        if (location.hash !== canonical && (location.hash || this.section !== "overview")) {
          history.replaceState(null, "", location.pathname + location.search + canonical);
          window.dispatchEvent(new HashChangeEvent("hashchange"));
        }
        window.addEventListener("hashchange", () => {
          this.section = readOrgSection();
          if (/-heading$/.test(location.hash)) {
            history.replaceState(null, "", location.pathname + location.search + `#${this.section}`);
            window.dispatchEvent(new HashChangeEvent("hashchange"));
            return;
          }
          window.scrollTo({ top: 0 });
        });
        await this.load();
      },

      /** Shows the organization's details form (approved organizations see a summary until then). */
      editDetails() {
        this.editingDetails = true;
        setTimeout(() => {
          pinMap?.refresh();
          document.getElementById("org-name")?.focus();
        }, 0);
      },

      cancelDetails() {
        this.editingDetails = false;
        this.errors = {};
        this.formError = "";
        setTimeout(() => document.getElementById("edit-details")?.focus(), 0);
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
            postalCode: this.org?.postal_code ?? "",
            phone: this.org?.phone ?? "",
            latitude: this.org?.latitude ?? null,
            longitude: this.org?.longitude ?? null,
          };
        } catch (error) {
          this.loadError = friendlyError(error);
        } finally {
          this.loading = false;
        }
        this.lookupStatus = "";
        this.foundAddress = "";
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

      /** Called on every keystroke in the postal code field; looks it up once typing pauses. */
      onPostalInput() {
        clearTimeout(lookupTimer);
        this.errors = { ...this.errors, postalCode: undefined };
        this.lookupStatus = "";
        this.foundAddress = "";
        const code = this.form.postalCode.trim();
        if (!code) return;
        lookupTimer = setTimeout(() => this.lookUpPostalCode(code), 500);
      },

      /** @param {string} code */
      async lookUpPostalCode(code) {
        if (!/^\d{6}$/.test(code)) {
          this.errors = { ...this.errors, postalCode: "A Singapore postal code has 6 digits, like 520123." };
          return;
        }
        const thisLookup = ++lookupCount;
        this.lookupStatus = "loading";
        const result = await lookupPostalCode(code);
        if (thisLookup !== lookupCount || this.form.postalCode.trim() !== code) return; // a newer lookup took over

        if (!result) {
          this.lookupStatus = "not_found";
          return;
        }
        this.lookupStatus = "found";
        this.foundAddress = result.address;
        this.form.latitude = result.latitude;
        this.form.longitude = result.longitude;
        this.errors = { ...this.errors, pin: undefined };
        pinMap?.focus(result.latitude, result.longitude);
        if (!this.form.address.trim()) this.useFoundAddress();
      },

      get canUseFoundAddress() {
        return this.lookupStatus === "found" && Boolean(this.foundAddress) && this.form.address.trim() !== this.foundAddress;
      },

      useFoundAddress() {
        this.form.address = this.foundAddress;
        this.errors = { ...this.errors, address: undefined };
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
            this.editingDetails = false;
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
