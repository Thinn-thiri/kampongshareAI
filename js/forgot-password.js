// @ts-check
// "Forgot password?" page (forgot-password.html). UI state only — the email is sent by sendPasswordReset() in js/auth.js.
// The page always gives the same answer, so it never shows whether an account exists for an email.

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("forgotForm", () => ({
    email: "",
    error: "",
    busy: false,
    sent: false,
    /** @type {string} the email the link went to (shown in "Check your email") */
    sentTo: "",

    init() {
      // the email typed on the login page comes over in sessionStorage, never in the URL (REQUIREMENTS.md 4.5)
      try {
        this.email = sessionStorage.getItem("ks-reset-email") ?? "";
        sessionStorage.removeItem("ks-reset-email");
      } catch {
        // storage blocked: start empty
      }
      setTimeout(() => /** @type {HTMLInputElement | undefined} */ (this.$refs.email)?.focus(), 0);
    },

    async submit() {
      this.error = "";
      const email = this.email.trim();
      if (!email) {
        this.error = t("forgot.missing");
        return;
      }
      this.busy = true;
      try {
        await sendPasswordReset(email);
        this.sentTo = email;
        this.sent = true;
        setTimeout(() => /** @type {HTMLElement | undefined} */ (this.$refs.sentTitle)?.focus(), 0);
      } catch (error) {
        this.error = friendlyError(error);
      } finally {
        this.busy = false;
      }
    },

    /** "Send again": back to the form with the same email. */
    again() {
      this.sent = false;
      this.error = "";
      setTimeout(() => /** @type {HTMLInputElement | undefined} */ (this.$refs.email)?.focus(), 0);
    },
  }));
});
