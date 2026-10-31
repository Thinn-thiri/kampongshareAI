// @ts-check
// Profile page (profile.html): view and correct your details, choose donate / volunteer,
// manage consent (REQUIREMENTS.md 4.2, 4.4, 6.6a). UI state only — saving is done by
// updateMyProfile(), giveConsent() and withdrawConsent() in js/auth.js.

/** Form error key → id of the field to focus. */
const PROFILE_FIELD_IDS = {
  fullName: "pf-name",
  phone: "pf-phone",
  postalCode: "pf-postal",
  area: "pf-area",
  roles: "pf-donate",
};

/** The account type, in the chosen language. @param {Role} role @returns {string} */
function roleLabel(role) {
  return t(`profile.role.${role}`);
}

/**
 * @typedef {Object} ProfileForm
 * @property {string} fullName
 * @property {string} phone
 * @property {string} postalCode
 * @property {string} area
 * @property {boolean} isDonor
 * @property {boolean} isVolunteer
 * @property {string[]} days
 * @property {string[]} times
 * @property {string[]} interests
 * @property {string[]} skills
 * @property {boolean} matchingOptIn
 */

/**
 * @param {Profile} profile
 * @returns {ProfileForm}
 */
function profileToForm(profile) {
  return {
    fullName: profile.full_name,
    phone: profile.phone ?? "",
    postalCode: profile.postal_code ?? "",
    area: profile.area ?? "",
    isDonor: profile.is_donor,
    isVolunteer: profile.is_volunteer,
    days: [...profile.available_days],
    times: [...profile.available_times],
    interests: [...profile.interests],
    skills: [...profile.skills],
    matchingOptIn: profile.matching_opt_in,
  };
}

/**
 * Checks the profile form. Returns an error message per field (empty when everything is fine).
 * @param {ProfileForm} form
 * @param {boolean} isIndividual
 * @returns {Partial<Record<keyof typeof PROFILE_FIELD_IDS, string>>}
 */
function validateProfile(form, isIndividual) {
  /** @type {Partial<Record<keyof typeof PROFILE_FIELD_IDS, string>>} */
  const errors = {};
  const name = form.fullName.trim();
  if (!name) errors.fullName = t("signup.errName");
  else if (name.length > 100) errors.fullName = t("signup.errNameLong");
  if (form.phone.trim() && !isValidSgPhone(form.phone)) errors.phone = t("signup.errPhone");
  if (form.postalCode.trim() && !/^\d{6}$/.test(form.postalCode.trim())) errors.postalCode = t("signup.errPostal");
  if (form.area.trim().length > 50) errors.area = t("profile.errAreaLong");
  if (isIndividual && !form.isDonor && !form.isVolunteer) errors.roles = t("errors.db.keepOneRole");
  return errors;
}

/**
 * Options plus any saved values that aren't in the list (so nothing saved is hidden).
 * @param {{ value: string, label: string }[]} options
 * @param {string[]} saved
 * @returns {{ value: string, label: string }[]}
 */
function withSavedValues(options, saved) {
  const extra = saved.filter((value) => !options.some((option) => option.value === value));
  return [...options, ...extra.map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }))];
}

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  // "Password" card: a new password for the person who is logged in (js/auth.js updatePassword)
  Alpine.data("changePassword", () => ({
    password: "",
    confirm: "",
    /** @type {{ password?: string, confirm?: string }} */
    errors: {},
    error: "",
    busy: false,

    async submit() {
      this.error = "";
      this.errors = validateNewPassword(this.password, this.confirm);
      if (this.errors.password || this.errors.confirm) {
        document.getElementById(this.errors.password ? "pf-new-password" : "pf-confirm-password")?.focus();
        return;
      }
      this.busy = true;
      try {
        await updatePassword(this.password);
        this.password = "";
        this.confirm = "";
        toast(t("reset.changed"));
      } catch (error) {
        this.error = friendlyError(error);
      } finally {
        this.busy = false;
      }
    },
  }));

  Alpine.data("profilePage", () => ({
    /** @type {Profile | null} */
    profile: null,
    email: "",
    loading: true,
    loadError: "",

    /** @type {ProfileForm | null} */
    form: null,
    /** @type {Partial<Record<keyof typeof PROFILE_FIELD_IDS, string>>} */
    errors: {},
    formError: "",
    saving: false,

    consentChecked: false,
    ageChecked: false,
    consentBusy: false,

    dayOptions: DAY_OPTIONS,
    timeOptions: TIME_OPTIONS,
    interestOptions: INTEREST_OPTIONS,
    skillOptions: SKILL_OPTIONS,
    roleLabel,

    async init() {
      try {
        const [profile, email] = await Promise.all([getProfile(), getMyEmail()]);
        if (!profile) return; // the page guard is redirecting
        this.setProfile(profile);
        this.email = email;
      } catch (error) {
        this.loadError = friendlyError(error);
      } finally {
        this.loading = false;
      }
    },

    /** @param {Profile} profile */
    setProfile(profile) {
      this.profile = profile;
      this.form = profileToForm(profile);
      this.interestOptions = withSavedValues(INTEREST_OPTIONS, profile.interests);
      this.skillOptions = withSavedValues(SKILL_OPTIONS, profile.skills);
    },

    get isIndividual() {
      return this.profile?.role === "donor" || this.profile?.role === "volunteer";
    },

    /** The role a single-role individual can add ("donor" or "volunteer"), or null. */
    get missingRole() {
      if (!this.isIndividual || !this.profile) return null;
      if (this.profile.is_donor && !this.profile.is_volunteer) return "volunteer";
      if (this.profile.is_volunteer && !this.profile.is_donor) return "donor";
      return null;
    },

    addingRole: false,
    /** @type {'' | 'donor' | 'volunteer'} the role that was just added, for the follow-up message */
    justAdded: "",

    /** Adds the other role to this same account, straight away (REQUIREMENTS.md 6.6a). */
    async addRole() {
      const role = this.missingRole;
      if (!role || !this.form) return;
      this.addingRole = true;
      try {
        const profile = await enableRole(role);
        // Keep any unsaved edits in the form; only take the new role flags from the database.
        this.profile = profile;
        this.form.isDonor = profile.is_donor;
        this.form.isVolunteer = profile.is_volunteer;
        this.justAdded = role;
        window.dispatchEvent(new CustomEvent("profile-changed"));
        toast(
          role === "donor"
            ? t("profile.donatingAdded")
            : isApprovedVolunteer(profile)
              ? t("profile.volunteeringAdded")
              : t("profile.volunteeringAddedPending"),
        );
        if (role === "volunteer") this.onVolunteerToggle();
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.addingRole = false;
      }
    },

    /** Volunteer account status shown on the page (admin approval). */
    get volunteerStatus() {
      if (!this.profile?.is_volunteer) return null;
      /** @type {Record<string, { className: string, label: string }>} */
      const badges = {
        approved: { className: "badge badge-success", label: t("profile.approvedByAdmin") },
        pending: { className: "badge badge-warning", label: t("profile.waitingApproval") },
        rejected: { className: "badge badge-danger", label: t("profile.notApproved") },
      };
      return badges[this.profile.volunteer_approval ?? "pending"];
    },

    reviewBusy: false,

    async askForReview() {
      this.reviewBusy = true;
      try {
        this.profile = await requestVolunteerReview();
        toast(t("volunteer.reviewSent"));
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.reviewBusy = false;
      }
    },

    deleteUnderstood: false,
    deleting: false,
    deleteError: "",

    /** "Delete my account" (REQUIREMENTS.md 4.4): checkbox, then a confirm dialog, then the server does it. */
    async deleteAccount() {
      this.deleteError = "";
      if (!this.deleteUnderstood) {
        this.deleteError = t("profile.tickToDelete");
        return;
      }
      const ok = await confirmDialog(t("profile.deleteText"), {
        title: t("profile.deleteDialogTitle"),
        confirmText: t("profile.deleteTitle"),
        cancelText: t("profile.keepAccount"),
        danger: true,
      });
      if (!ok) return;
      this.deleting = true;
      try {
        await deleteMyAccount();
        location.href = "/";
      } catch (error) {
        this.deleteError = error instanceof Error ? error.message : t("profile.deleteFailed");
        this.deleting = false;
      }
    },

    get hasConsent() {
      return Boolean(this.profile?.consented_at && this.profile?.age_confirmed);
    },

    /** Turning volunteering on asks for the volunteer details (REQUIREMENTS.md 6.6a). */
    onVolunteerToggle() {
      this.errors = { ...this.errors, roles: undefined };
      if (this.form?.isVolunteer) {
        setTimeout(() => {
          document.getElementById("volunteer-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
          /** @type {HTMLInputElement | null} */ (document.querySelector("#volunteer-section input"))?.focus({ preventScroll: true });
        }, 0);
      }
    },

    async save() {
      if (!this.form || !this.profile) return;
      this.formError = "";
      this.errors = validateProfile(this.form, this.isIndividual);
      const firstError = /** @type {(keyof typeof PROFILE_FIELD_IDS)[]} */ (Object.keys(this.errors))[0];
      if (firstError) {
        document.getElementById(PROFILE_FIELD_IDS[firstError])?.focus();
        return;
      }
      const form = this.form;
      /** @type {Parameters<typeof updateMyProfile>[0]} */
      const changes = {
        full_name: form.fullName.trim(),
        phone: form.phone.trim() ? normalisePhone(form.phone) : null,
        postal_code: form.postalCode.trim() || null,
        area: form.area.trim() || null,
      };
      if (this.isIndividual) {
        Object.assign(changes, {
          is_donor: form.isDonor,
          is_volunteer: form.isVolunteer,
          available_days: form.days,
          available_times: form.times,
          interests: form.interests,
          skills: form.skills,
          matching_opt_in: form.isVolunteer && form.matchingOptIn,
        });
      }
      this.saving = true;
      try {
        this.setProfile(await updateMyProfile(changes));
        window.dispatchEvent(new CustomEvent("profile-changed"));
        toast(t("profile.saved"));
      } catch (error) {
        this.formError = friendlyError(error);
      } finally {
        this.saving = false;
      }
    },

    async submitConsent() {
      if (!this.consentChecked || !this.ageChecked) return;
      this.consentBusy = true;
      try {
        this.setProfile(await giveConsent());
        this.consentChecked = false;
        this.ageChecked = false;
        toast(t("profile.consentThanks"));
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.consentBusy = false;
      }
    },

    async confirmWithdrawConsent() {
      const ok = await confirmDialog(t("profile.withdrawText"), {
        title: t("profile.withdrawTitle"),
        confirmText: t("profile.withdrawConfirm"),
        cancelText: t("profile.keepConsent"),
        danger: true,
      });
      if (!ok) return;
      this.consentBusy = true;
      try {
        this.setProfile(await withdrawConsent());
        toast(t("profile.consentWithdrawn"));
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.consentBusy = false;
      }
    },
  }));
});
