// @ts-check
// "Choose a new password" page (reset-password.html), opened from the reset email.
// Supabase reads the one-time link from the URL and logs the person in for this; the page then
// clears the link from the address bar, checks it worked, and lets them set a new password with
// updatePassword() (js/auth.js). UI state only.

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("resetForm", () => ({
    /** @type {'checking' | 'ready' | 'expired' | 'done'} */
    state: "checking",
    password: "",
    confirm: "",
    /** @type {{ password?: string, confirm?: string }} */
    errors: {},
    error: "",
    busy: false,
    continueHref: "/",

    async init() {
      // a link that's too old or already used comes back with an error in the hash (e.g. error_code=otp_expired)
      const params = new URLSearchParams(location.hash.slice(1));
      const linkFailed = params.has("error") || params.has("error_code");
      if (!sb || linkFailed) {
        this.clearLink();
        this.state = "expired";
        return;
      }
      // getSession() waits until Supabase has read the link and started the session
      const { data } = await sb.auth.getSession();
      this.clearLink();
      this.state = data.session ? "ready" : "expired";
    },

    /** Removes the one-time tokens from the address bar (nothing secret stays in the URL or history). */
    clearLink() {
      // Supabase empties the hash itself but can leave a bare "#", so check the whole address
      if (location.href.includes("#") || location.search) history.replaceState(null, "", location.pathname);
    },

    async submit() {
      this.error = "";
      this.errors = validateNewPassword(this.password, this.confirm);
      if (this.errors.password || this.errors.confirm) {
        document.getElementById(this.errors.password ? "rp-password" : "rp-confirm")?.focus();
        return;
      }
      this.busy = true;
      try {
        await updatePassword(this.password);
        this.password = "";
        this.confirm = "";
        const profile = await getProfile().catch(() => null);
        this.continueHref = profile ? pathAfterLogin(profile) : "/login.html";
        this.state = "done";
        toast(t("reset.changed"));
        setTimeout(() => /** @type {HTMLElement | undefined} */ (this.$refs.doneTitle)?.focus(), 0);
      } catch (error) {
        this.error = friendlyError(error);
      } finally {
        this.busy = false;
      }
    },
  }));
});
