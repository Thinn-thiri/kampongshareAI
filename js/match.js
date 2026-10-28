// @ts-check
// "What can you give?" box (REQUIREMENTS.md 6.4). Calls the match-items Netlify Function,
// which removes personal data, asks the AI to read the text, and scores open requests.
// Results are AI-suggested: the donor always chooses what to offer.

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
 * @property {string} reason
 */

/**
 * @typedef {{ status: 'ok', items: { name: string, category: string, quantity: number | null }[], matches: Match[] }
 *   | { status: 'fallback' } | { status: 'rate_limited' } | { status: 'error' }} MatchResult
 */

const MATCH_CATEGORIES = enumOptions("category", ["food", "clothing", "hygiene", "household", "baby", "education"]);

/**
 * Asks the server for matches. Sends the login token when there is one (for the "near you" bonus).
 * @param {{ text: string } | { category: string }} input
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
    // the chosen language, so the reasons come back in it (nothing personal is added)
    const response = await fetch("/api/match-items", { method: "POST", headers, body: JSON.stringify({ ...input, lang: getLang() }) });
    if (response.status === 429) return { status: "rate_limited" };
    if (!response.ok) return { status: "error" };
    const body = await response.json();
    if (body.fallback) return { status: "fallback" };
    return { status: "ok", items: body.items ?? [], matches: body.matches ?? [] };
  } catch {
    return { status: "error" };
  }
}

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("matchBox", () => ({
    text: "",
    busy: false,
    /** @type {'' | 'ok' | 'fallback' | 'fallback_results' | 'rate_limited' | 'error'} 'fallback_results' = category results with the buttons still shown */
    status: "",
    /** @type {{ name: string, category: string, quantity: number | null }[]} */
    understood: [],
    /** @type {Match[]} */
    matches: [],
    /** the category chosen from the fallback buttons, if any */
    pickedCategory: "",
    error: "",
    categories: MATCH_CATEGORIES,

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
      this.pickedCategory = "";
      await this.run({ text });
    },

    /** @param {string} category */
    async searchCategory(category) {
      this.pickedCategory = category;
      await this.run({ category });
      // Keep showing the buttons so the donor can pick another category.
      if (this.status === "ok") this.status = "fallback_results";
    },

    /** @param {{ text: string } | { category: string }} input */
    async run(input) {
      this.busy = true;
      const result = await findMatches(input);
      this.busy = false;
      this.status = result.status;
      if (result.status === "ok") {
        this.understood = result.items;
        this.matches = result.matches;
      } else if (result.status !== "fallback") {
        this.matches = [];
      }
    },

    get showCategories() {
      return this.status === "fallback" || this.status === "fallback_results";
    },

    get showResults() {
      return this.status === "ok" || this.status === "fallback_results";
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
