// @ts-check
// "Find me where to help" on volunteer.html (REQUIREMENTS.md 4.6). Calls match-items in its volunteer mode: one AI
// picks events that suit what the person said, a SEPARATE AI checks each one against the event's written needs.
// Three groups: Events that fit you · Needs your answer · Not a fit. If the check couldn't run there is no list.
// Apply opens the normal application form on the event's card below (the usual rules and messages apply).
// Lives inside volunteerDashboard, so it uses its profile, applicationFor(), openApply() and applyAgain().

/**
 * @typedef {{ event_id: string, title: string, organization: string, place: string | null, area: string | null,
 *   starts_at: string, ends_at: string | null, spots_left: number | null }} MatchedEvent
 * @typedef {MatchedEvent & { why: string }} FitEvent
 * @typedef {MatchedEvent & { need: string, question: string, reason: string }} EventQuestion
 * @typedef {MatchedEvent & { need: string, reason: string }} NotFit
 * @typedef {{ event_id: string, need: string, question: string, answer: 'yes' | 'no' }} EventAnswer
 * @typedef {{ status: 'ok', events: FitEvent[], questions: EventQuestion[], notFit: NotFit[] }
 *   | { status: 'unchecked' } | { status: 'rate_limited' } | { status: 'no_consent' } | { status: 'error' }} VolunteerMatchResult
 */

/** @param {unknown} v @returns {any[]} */
const listOf = (v) => (Array.isArray(v) ? v : []);

/**
 * Asks the server for checked events. Sends the login token (needed for "Use my profile").
 * @param {{ text?: string, use_profile?: boolean, answers?: EventAnswer[] }} input
 * @returns {Promise<VolunteerMatchResult>}
 */
async function findVolunteerMatches(input) {
  try {
    /** @type {Record<string, string>} */
    const headers = { "Content-Type": "application/json" };
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (session) headers.Authorization = `Bearer ${session.access_token}`;
    const response = await fetch("/api/match-items", { method: "POST", headers, body: JSON.stringify({ ...input, mode: "volunteer", lang: getLang() }) });
    if (response.status === 429) return { status: "rate_limited" };
    if (response.status === 403) return { status: "no_consent" };
    if (!response.ok) return { status: "error" };
    const body = await response.json();
    // never show a list the AI didn't check
    if (body.checked !== true) return { status: "unchecked" };
    return {
      status: "ok",
      events: listOf(body.events),
      questions: listOf(body.questions).filter((q) => typeof q?.question === "string" && q.question),
      notFit: listOf(body.not_fit),
    };
  } catch {
    return { status: "error" };
  }
}

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("volunteerMatch", () => ({
    text: "",
    error: "",
    busy: false,
    /** @type {'' | 'ok' | 'unchecked' | 'rate_limited' | 'no_consent' | 'error'} */
    status: "",
    /** @type {FitEvent[]} */
    fits: [],
    /** @type {EventQuestion[]} */
    questions: [],
    /** @type {NotFit[]} */
    notFit: [],
    /** @type {EventAnswer[]} answers so far (sent with the next check) */
    answers: [],
    /** what was checked last (answers and Try again rerun it) @type {{ text?: string, use_profile?: boolean } | null} */
    last: null,
    examples: ["volMatch.example1", "volMatch.example2"],

    /** "Use my profile" only when the person allowed matching (REQUIREMENTS.md 4.2); the server checks it too. */
    get canUseProfile() {
      return /** @type {any} */ (this).profile?.matching_opt_in === true;
    },

    /** @param {string} key */
    useExample(key) {
      this.text = t(key);
      this.error = "";
      document.getElementById("vm-text")?.focus();
    },

    async search() {
      this.error = "";
      const text = this.text.trim();
      if (!text) {
        this.error = t("volMatch.empty");
        return;
      }
      if (text.length > 300) {
        this.error = t("match.tooLong");
        return;
      }
      this.answers = [];
      this.last = { text };
      await this.run();
    },

    async searchProfile() {
      this.error = "";
      this.answers = [];
      // the typed words go along too, when there are any
      const text = this.text.trim().slice(0, 300);
      this.last = text ? { text, use_profile: true } : { use_profile: true };
      await this.run();
    },

    async retry() {
      if (this.busy || !this.last) return;
      await this.run();
    },

    /**
     * Yes → checked again with the answer; No → that event is left out.
     * @param {EventQuestion} q
     * @param {'yes' | 'no'} answer
     */
    async answer(q, answer) {
      if (this.busy || !this.last) return;
      const given = { event_id: q.event_id, need: q.need, question: q.question, answer };
      this.answers = [...this.answers.filter((a) => a.question !== q.question), given].slice(-3);
      await this.run();
    },

    async run() {
      if (!this.last) return;
      this.busy = true;
      const result = await findVolunteerMatches({ ...this.last, answers: this.answers });
      this.busy = false;
      this.status = result.status;
      this.fits = result.status === "ok" ? result.events : [];
      this.questions = result.status === "ok" ? result.questions : [];
      this.notFit = result.status === "ok" ? result.notFit : [];
    },

    /** @param {MatchedEvent} e */
    whenText(e) {
      return formatEventTime(e.starts_at, e.ends_at);
    },

    /** @param {MatchedEvent} e */
    spotsWords(e) {
      return e.spots_left === null ? t("volunteer.everyoneWelcome") : t("volMatch.spotsLeft", { count: e.spots_left });
    },

    /** Already applied (and not withdrawn): no Apply here. @param {MatchedEvent} e */
    applied(e) {
      const application = /** @type {any} */ (this).applicationFor(e.event_id);
      return Boolean(application && application.status !== "withdrawn");
    },

    /**
     * Apply: the event's own card in the list below opens its normal application form (or "Apply again").
     * @param {MatchedEvent} e
     */
    apply(e) {
      const self = /** @type {any} */ (this);
      const card = document.getElementById(`event-${e.event_id}`);
      if (!card) {
        window.location.href = `/event.html?id=${encodeURIComponent(e.event_id)}&apply=1`;
        return;
      }
      const application = self.applicationFor(e.event_id);
      if (application?.status === "withdrawn") self.applyAgain(application);
      else self.openApply(e.event_id);
      card.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    },
  }));
});
