// @ts-check
// "What can you give?" box (REQUIREMENTS.md 6.4 and 4.6). Calls the match-items Netlify Function, which removes
// personal data, lets one AI find candidate requests and a SEPARATE AI check them against the general rules and
// each request's own rules. The page shows three groups: Your donation plan · Needs your answer · Not matched.
// If the check couldn't run there is no plan at all. Results are AI-suggested: the donor always chooses what to offer.

/**
 * @typedef {Object} Match
 * @property {string} itemId
 * @property {string} requestId
 * @property {string} requestTitle
 * @property {string} organization
 * @property {string} itemName
 * @property {string} unit
 * @property {string} category
 * @property {number} remaining
 * @property {string | null} deadline
 * @property {string | null} [sizeSpec]
 * @property {string | null} [material]
 * @property {ItemCondition} [minCondition]
 * @property {boolean} [detailsRequired]
 * @property {string | null} [itemDetails]
 */

/**
 * @typedef {Match & { item: string, quantity: number | null, why: string }} PlanEntry   one matched item, with the checker's reason
 * @typedef {{ item: string, scope: 'general' | 'request', requestTitle: string | null, itemName: string | null, rule: string, reason: string, foundOther: boolean }} Blocked
 * @typedef {{ item: string, request_item_id: string | null, requestTitle: string | null, question: string, rule: string, reason: string }} Question
 * @typedef {{ item: string, request_item_id: string | null, rule: string, question: string, answer: 'yes' | 'no' }} DonorAnswer
 * @typedef {{ status: 'ok', items: { name: string, quantity: number | null }[], plan: PlanEntry[], blocked: Blocked[], questions: Question[], unmatched: string[] }
 *   | { status: 'unchecked' } | { status: 'rate_limited' } | { status: 'error' }} MatchResult
 */

/**
 * A match's requirements in one short line: "24–28 cm · Like new or better" ("" when none).
 * @param {Match} match
 * @returns {string}
 */
function matchSpec(match) {
  return itemSpecLine({ size_spec: match.sizeSpec, material: match.material, min_condition: match.minCondition, category: match.category });
}

/** @param {unknown} v @returns {any[]} */
const list = (v) => (Array.isArray(v) ? v : []);

/**
 * Asks the server for a checked plan. Sends the login token when there is one.
 * @param {{ text: string, answers?: DonorAnswer[] }} input
 * @returns {Promise<MatchResult>}
 */
async function findMatches(input) {
  try {
    /** @type {Record<string, string>} */
    const headers = { "Content-Type": "application/json" };
    if (sb) {
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (session) headers.Authorization = `Bearer ${session.access_token}`;
    }
    // the chosen language, so the reasons and questions come back in it (nothing personal is added)
    const response = await fetch("/api/match-items", { method: "POST", headers, body: JSON.stringify({ ...input, lang: getLang() }) });
    if (response.status === 429) return { status: "rate_limited" };
    if (!response.ok) return { status: "error" };
    const body = await response.json();
    // never show a plan the AI didn't check
    if (body.checked !== true) return { status: "unchecked" };
    return {
      status: "ok",
      items: list(body.items),
      plan: list(body.plan),
      blocked: list(body.blocked),
      questions: list(body.questions).filter((q) => typeof q?.question === "string" && q.question),
      unmatched: list(body.unmatched).filter((u) => typeof u === "string"),
    };
  } catch {
    return { status: "error" };
  }
}

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("matchBox", () => ({
    matchSpec,
    text: "",
    busy: false,
    /** @type {'' | 'ok' | 'unchecked' | 'rate_limited' | 'error'} 'unchecked' = the AI check couldn't run, so no plan */
    status: "",
    /** @type {{ name: string, quantity: number | null }[]} */
    understood: [],
    /** @type {PlanEntry[]} */
    plan: [],
    /** @type {Blocked[]} */
    blocked: [],
    /** @type {Question[]} */
    questions: [],
    /** @type {string[]} items with nowhere to go right now */
    unmatched: [],
    /** @type {DonorAnswer[]} the donor's answers so far (sent with the next check) */
    answers: [],
    /** @type {string[]} questions answered "Not sure" (they show "Check the label, then try again") */
    notSure: [],
    /** the text that was checked (answers rerun it) */
    searchedText: "",
    error: "",

    async search() {
      this.error = "";
      const text = this.text.trim();
      if (!text) {
        this.error = t("match.empty");
        return;
      }
      if (text.length > 300) {
        this.error = t("match.tooLong");
        return;
      }
      this.answers = [];
      this.searchedText = text;
      await this.run();
    },

    /** "Try again" after the check couldn't run: the same text and answers. */
    async retry() {
      if (this.busy || !this.searchedText) return;
      await this.run();
    },

    /**
     * The donor answers the checker's question. Yes → checked again with the answer; No → that request is left out;
     * Not sure → "Check the label, then try again" (nothing is sent).
     * @param {Question} q
     * @param {'yes' | 'no' | 'not_sure'} answer
     */
    async answer(q, answer) {
      if (this.busy || !this.searchedText) return;
      if (answer === "not_sure") {
        if (!this.notSure.includes(q.question)) this.notSure = [...this.notSure, q.question];
        return;
      }
      const given = { item: q.item, request_item_id: q.request_item_id, rule: q.rule, question: q.question, answer };
      this.answers = [...this.answers.filter((a) => a.question !== q.question), given].slice(-3);
      await this.run();
    },

    async run() {
      this.busy = true;
      const result = await findMatches({ text: this.searchedText, answers: this.answers });
      this.busy = false;
      this.status = result.status;
      this.notSure = [];
      if (result.status === "ok") {
        this.understood = result.items;
        this.plan = result.plan;
        this.blocked = result.blocked;
        this.questions = result.questions;
        this.unmatched = result.unmatched;
      } else {
        this.understood = [];
        this.plan = [];
        this.blocked = [];
        this.questions = [];
        this.unmatched = [];
      }
    },

    /**
     * One "Not matched" line: "Pork luncheon meat → not sent to “Canned meat…” (Halal-certified only)."
     * @param {Blocked} b
     */
    blockedText(b) {
      if (b.scope === "general") return t("match.cantDonate", { item: b.item, rule: b.rule });
      const line = t(b.rule ? "match.notSentRule" : "match.notSent", { item: b.item, request: b.requestTitle ?? b.itemName ?? "", rule: b.rule });
      return b.foundOther ? `${line} ${t("match.foundOther")}` : line;
    },

    /** @param {PlanEntry} entry */
    planLine(entry) {
      return entry.quantity
        ? t("match.planLine", { count: entry.quantity, item: entry.item, request: entry.requestTitle })
        : t("match.planLineNoCount", { item: entry.item, request: entry.requestTitle });
    },

    /** @param {Match} match */
    offer(match) {
      window.dispatchEvent(new CustomEvent("offer-item", { detail: { itemId: match.itemId } }));
    },

    /**
     * @param {string | null} deadline
     * @returns {string}
     */
    deadlineText(deadline) {
      return deadline ? t("common.neededBy", { date: formatDate(deadline) }) : t("common.noDeadline");
    },
  }));
});
