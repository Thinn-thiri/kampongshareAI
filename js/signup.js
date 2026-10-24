// @ts-check
// Sign-up form (signup.html). UI state only — the account is created by signUpUser() in js/auth.js.

const DAY_OPTIONS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

const TIME_OPTIONS = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
];

const INTEREST_OPTIONS = [
  { value: "food distribution", label: "Food distribution" },
  { value: "elderly care", label: "Elderly care" },
  { value: "children and education", label: "Children & education" },
  { value: "packing and sorting", label: "Packing & sorting" },
  { value: "environment", label: "Environment" },
  { value: "events and outreach", label: "Events & outreach" },
];

const SKILL_OPTIONS = [
  { value: "driving", label: "Driving" },
  { value: "first aid", label: "First aid" },
  { value: "cooking", label: "Cooking" },
  { value: "tutoring", label: "Tutoring" },
  { value: "languages", label: "Languages" },
  { value: "lifting and moving", label: "Lifting & moving" },
  { value: "photography", label: "Photography" },
  { value: "it support", label: "IT support" },
];

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
 * Removes spaces, dashes and a leading +65 / 65 from a Singapore phone number.
 * @param {string} phone
 * @returns {string}
 */
function normalisePhone(phone) {
  const digits = phone.replace(/[\s-]/g, "");
  return digits.replace(/^(\+65|65)(?=\d{8}$)/, "");
}

/**
 * Checks the sign-up form. Returns an error message per field (empty when everything is fine).
 * @param {{ accountType: string, wantDonate: boolean, wantVolunteer: boolean, fullName: string, email: string,
 *           password: string, phone: string, postalCode: string, privacyConsent: boolean, ageConfirmed: boolean }} form
 * @returns {Partial<Record<keyof typeof SIGNUP_FIELD_IDS, string>>}
 */
function validateSignup(form) {
  /** @type {Partial<Record<keyof typeof SIGNUP_FIELD_IDS, string>>} */
  const errors = {};
  if (!form.accountType) errors.accountType = "Choose whether you're an individual or an organization.";
  if (form.accountType === "individual" && !form.wantDonate && !form.wantVolunteer) {
    errors.roles = "Tick at least one: donate or volunteer.";
  }
  if (!form.fullName.trim()) errors.fullName = "Please enter your name.";
  else if (form.fullName.trim().length > 100) errors.fullName = "Please keep your name under 100 characters.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = "Please enter a valid email address, like name@example.com.";
  }
  if (form.password.length < 8) errors.password = "Your password needs at least 8 characters.";
  if (form.phone.trim() && !/^[3689]\d{7}$/.test(normalisePhone(form.phone))) {
    errors.phone = "Please enter an 8-digit Singapore number, like 9123 4567.";
  }
  if (form.accountType === "individual" && form.postalCode.trim() && !/^\d{6}$/.test(form.postalCode.trim())) {
    errors.postalCode = "A Singapore postal code has 6 digits, like 520123.";
  }
  if (!form.privacyConsent) errors.privacyConsent = "Please agree to the Privacy Notice to create an account.";
  if (!form.ageConfirmed) errors.ageConfirmed = "You need to be 18 or older to use KampongShare.";
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
          this.notice = "Almost done! Check your email to confirm your account, then log in.";
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
