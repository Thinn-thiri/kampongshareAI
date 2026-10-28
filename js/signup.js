// @ts-check
// Sign-up form (signup.html). UI state only — the account is created by signUpUser() in js/auth.js.
// The day / time / interest / skill choices come from js/volunteer-options.js.

/** Form error key → id of the field to focus. */
const SIGNUP_FIELD_IDS = {
  accountType: "su-type-individual",
  roles: "su-donate",
  fullName: "su-name",
  email: "su-email",
  password: "su-password",
  phone: "su-phone",
  postalCode: "su-postal",
  privacyConsent: "su-consent",
  ageConfirmed: "su-age",
};

/**
 * Checks the sign-up form. Returns an error message per field (empty when everything is fine).
 * @param {{ accountType: string, wantDonate: boolean, wantVolunteer: boolean, fullName: string, email: string,
 *           password: string, phone: string, postalCode: string, privacyConsent: boolean, ageConfirmed: boolean }} form
 * @returns {Partial<Record<keyof typeof SIGNUP_FIELD_IDS, string>>}
 */
function validateSignup(form) {
  /** @type {Partial<Record<keyof typeof SIGNUP_FIELD_IDS, string>>} */
  const errors = {};
  if (!form.accountType) errors.accountType = t("signup.errType");
  if (form.accountType === "individual" && !form.wantDonate && !form.wantVolunteer) {
    errors.roles = t("signup.errRoles");
  }
  if (!form.fullName.trim()) errors.fullName = t("signup.errName");
  else if (form.fullName.trim().length > 100) errors.fullName = t("signup.errNameLong");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = t("signup.errEmail");
  }
  if (form.password.length < 8) errors.password = t("signup.errPassword");
  if (form.phone.trim() && !isValidSgPhone(form.phone)) {
    errors.phone = t("signup.errPhone");
  }
  if (form.accountType === "individual" && form.postalCode.trim() && !/^\d{6}$/.test(form.postalCode.trim())) {
    errors.postalCode = t("signup.errPostal");
  }
  if (!form.privacyConsent) errors.privacyConsent = t("signup.errConsent");
  if (!form.ageConfirmed) errors.ageConfirmed = t("signup.errAge");
  return errors;
}

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("signupForm", () => ({
    dayOptions: DAY_OPTIONS,
    timeOptions: TIME_OPTIONS,
    interestOptions: INTEREST_OPTIONS,
    skillOptions: SKILL_OPTIONS,

    /** @type {'' | 'individual' | 'organization'} */
    accountType: "",
    wantDonate: false,
    wantVolunteer: false,
    fullName: "",
    email: "",
    password: "",
    phone: "",
    postalCode: "",
    area: "",
    /** @type {string[]} */
    days: [],
    /** @type {string[]} */
    times: [],
    /** @type {string[]} */
    interests: [],
    /** @type {string[]} */
    skills: [],
    matchingOptIn: false,
    privacyConsent: false,
    ageConfirmed: false,

    /** @type {Partial<Record<keyof typeof SIGNUP_FIELD_IDS, string>>} */
    errors: {},
    formError: "",
    notice: "",
    busy: false,
    loginHref: "/login.html",

    init() {
      const params = new URLSearchParams(location.search);
      const role = params.get("role");
      const roles = (params.get("roles") ?? "").split(",");
      if (role === "organization") {
        this.accountType = "organization";
      } else if (role === "donor" || role === "volunteer" || roles.includes("donor") || roles.includes("volunteer")) {
        this.accountType = "individual";
        this.wantDonate = role === "donor" || roles.includes("donor");
        this.wantVolunteer = role === "volunteer" || roles.includes("volunteer");
      }
      const next = nextFromUrl();
      if (next) this.loginHref = "/login.html?next=" + encodeURIComponent(next);
    },

    async submit() {
      this.formError = "";
      this.notice = "";
      this.errors = validateSignup(this);
      const firstError = /** @type {(keyof typeof SIGNUP_FIELD_IDS)[]} */ (Object.keys(this.errors))[0];
      if (firstError) {
        document.getElementById(SIGNUP_FIELD_IDS[firstError])?.focus();
        return;
      }

      this.busy = true;
      try {
        const { session } = await signUpUser({
          accountType: this.accountType === "organization" ? "organization" : "individual",
          wantDonate: this.wantDonate,
          wantVolunteer: this.wantVolunteer,
          fullName: this.fullName.trim(),
          email: this.email.trim(),
          password: this.password,
          phone: this.phone.trim() ? normalisePhone(this.phone) : "",
          postalCode: this.postalCode.trim(),
          area: this.area.trim(),
          availableDays: this.days,
          availableTimes: this.times,
          interests: this.interests,
          skills: this.skills,
          matchingOptIn: this.matchingOptIn,
          privacyConsent: this.privacyConsent,
          ageConfirmed: this.ageConfirmed,
        });
        if (!session) {
          this.notice = t("signup.checkEmail");
          this.busy = false;
          return;
        }
        location.href = pathAfterLogin(await getProfile());
      } catch (error) {
        this.formError = friendlyError(error);
        this.busy = false;
      }
    },
  }));
});
