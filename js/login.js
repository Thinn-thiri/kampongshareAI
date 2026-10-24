// @ts-check
// Login form (login.html). UI state only — logging in is done by logIn() in js/auth.js.

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("loginForm", () => ({
    email: "",
    password: "",
    error: "",
    busy: false,
    signupHref: "/signup.html",

    async init() {
      const next = nextFromUrl();
      if (next) this.signupHref = "/signup.html?next=" + encodeURIComponent(next);
      // Already logged in: go straight on.
      try {
        const profile = await getProfile();
        if (profile) location.replace(pathAfterLogin(profile));
      } catch {
        // stay on the login page
      }
    },

    async submit() {
      this.error = "";
      if (!this.email.trim() || !this.password) {
        this.error = "Please enter your email and password.";
        return;
      }
      this.busy = true;
      try {
        await logIn(this.email.trim(), this.password);
        const profile = await getProfile();
        if (!profile) {
          this.error = "We couldn't load your account details. Please try again.";
          this.busy = false;
          return;
        }
        location.href = pathAfterLogin(profile);
      } catch (error) {
        this.error = friendlyError(error);
        this.busy = false;
      }
    },
  }));
});
