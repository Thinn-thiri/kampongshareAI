// @ts-check
// "Ask KampongShare": a help chat on every page (REQUIREMENTS.md 6.8). Tap a suggested question, or
// type your own (max 300 characters) — typed questions go to the chat-insights Netlify Function,
// which removes personal details first and only answers about KampongShare.
// Questions and pre-written answers live in js/chat-questions.js. "Right now" questions ask the
// chat-insights function (public data only), then show real cards from the database.
// Typed questions (and the "Pinny can help" chips) use agent mode: Pinny picks its own tools on the server
// and may prepare DRAFTS (an offer, an application, a message, a page). Nothing is sent until the person
// presses the draft's button, which uses their own login and the normal database rules.
// The conversation lives only in this page (gone on reload); nothing is stored or logged. The one exception:
// a visitor who presses "Log in to confirm" — the reply and its drafts wait in sessionStorage for the return.

/**
 * @typedef {Object} ChatChip
 * @property {string} key
 * @property {string} [questionId]
 * @property {string} [area]
 */

/**
 * @typedef {Object} ChatItemCard
 * @property {string} id
 * @property {string} name
 * @property {string} unit
 * @property {number} quantity_remaining
 * @property {{ title: string, organization: { name: string } | null } | null} request
 */

/**
 * @typedef {Object} ChatEventCard
 * @property {string} id
 * @property {string} title
 * @property {string} starts_at
 * @property {string | null} location_name
 * @property {{ name: string } | null} organization
 */

/**
 * A draft from Pinny's tools (the server only prepares it; nothing is sent until the person confirms).
 * @typedef {Object} ChatDraft
 * @property {'offer' | 'application' | 'message'} kind
 * @property {string} key
 * @property {'ready' | 'sending' | 'sent'} state
 * @property {string} error
 * @property {string} [doneHref]           where to go after it's sent
 * @property {string} [request_item_id]    offer
 * @property {string} [item]
 * @property {string} [unit]
 * @property {number} [quantity]
 * @property {number} [remaining]
 * @property {string} [request_title]
 * @property {boolean} [food]
 * @property {string} [spec]              offer: the item's requirements in one line ("24–28 cm · Like new or better")
 * @property {string} [event_id]           application
 * @property {string} [title]
 * @property {string} [starts_at]
 * @property {string} [place]
 * @property {number | null} [spots_left]
 * @property {string} [message]            application note
 * @property {string} [organization_id]    message
 * @property {string} [text]
 * @property {string} [organization]
 */

/**
 * @typedef {Object} ChatMessage
 * @property {number} id
 * @property {'user' | 'bot'} from
 * @property {string} text
 * @property {boolean} [ai]        label the answer "AI-suggested"
 * @property {boolean} [thinking]
 * @property {boolean} [slow]      still thinking after a while (the AI is busy)
 * @property {boolean} [error]
 * @property {{ label?: string, labelKey?: string, href: string }[]} [links]  labelKey: pre-written answers; label: from the server
 * @property {ChatItemCard[]} [items]
 * @property {ChatEventCard[]} [events]
 * @property {{ tool: string, summary: string }[]} [steps]  agent mode: "What Pinny did" (written by the server's code)
 * @property {ChatDraft[]} [drafts]                          agent mode: drafts to confirm
 */

/**
 * Request items for the answer cards, by id — public columns only.
 * @param {string[]} ids
 * @returns {Promise<ChatItemCard[]>}
 */
async function loadChatItems(ids) {
  if (!ids.length) return [];
  const { data, error } = await db()
    .from("request_items")
    .select("id, name, unit, quantity_remaining, request:donation_requests(title, organization:organizations(name))")
    .in("id", ids);
  if (error) throw error;
  const rows = /** @type {ChatItemCard[]} */ (/** @type {unknown} */ (data ?? []));
  return ids.map((id) => rows.find((row) => row.id === id)).filter((row) => row !== undefined);
}

/**
 * Events for the answer cards, by id — public columns only.
 * @param {string[]} ids
 * @returns {Promise<ChatEventCard[]>}
 */
async function loadChatEvents(ids) {
  if (!ids.length) return [];
  const { data, error } = await db()
    .from("events")
    .select("id, title, starts_at, location_name, organization:organizations(name)")
    .in("id", ids);
  if (error) throw error;
  const rows = /** @type {ChatEventCard[]} */ (/** @type {unknown} */ (data ?? []));
  return ids.map((id) => rows.find((row) => row.id === id)).filter((row) => row !== undefined);
}

/** Longest typed question (characters). */
const CHAT_MAX_QUESTION = 300;

/** sessionStorage key: a visitor's reply and drafts, kept while they log in to confirm. */
const CHAT_PENDING_KEY = "ks-chat-pending";

/**
 * Turns a draft from the server into one the chat can edit and confirm (only the known fields are kept).
 * @param {Record<string, any>} raw
 * @param {number} index
 * @returns {ChatDraft | null}
 */
function chatDraft(raw, index) {
  const key = `d${Date.now()}-${index}`;
  const base = { key, state: /** @type {'ready'} */ ("ready"), error: "", organization: String(raw.organization ?? "") };
  if (raw.kind === "offer" && typeof raw.request_item_id === "string") {
    return { ...base, kind: "offer", request_item_id: raw.request_item_id, item: String(raw.item ?? ""), unit: String(raw.unit ?? ""),
      quantity: Number(raw.quantity) || 1, remaining: Number(raw.remaining) || 1, request_title: String(raw.request_title ?? ""), food: Boolean(raw.food),
      spec: itemSpecLine({ size_spec: raw.size_spec ?? null, material: raw.material ?? null, min_condition: raw.min_condition ?? "any", category: raw.food ? "food" : "" }) };
  }
  if (raw.kind === "application" && typeof raw.event_id === "string") {
    return { ...base, kind: "application", event_id: raw.event_id, title: String(raw.title ?? ""), starts_at: String(raw.starts_at ?? ""),
      place: String(raw.place ?? ""), spots_left: typeof raw.spots_left === "number" ? raw.spots_left : null, message: String(raw.message ?? "") };
  }
  if (raw.kind === "message" && typeof raw.organization_id === "string") {
    return { ...base, kind: "message", organization_id: raw.organization_id, text: String(raw.text ?? "").slice(0, 500) };
  }
  return null;
}

/**
 * Loads a page script (offers.js / volunteering.js) the first time a draft needs it on a page without it.
 * @param {string} src
 * @param {string} fn a function the script defines
 * @returns {Promise<void>}
 */
function ensureScript(src, fn) {
  if (typeof (/** @type {any} */ (window))[fn] === "function") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(t("chat.errNetwork")));
    document.head.append(script);
  });
}

/**
 * @typedef {Object} ChatAnswer
 * @property {string} summary
 * @property {boolean} ai
 * @property {string[]} request_item_ids
 * @property {string[]} event_ids
 * @property {string[]} [areas]                          area chips (the "my area" question)
 * @property {{ label: string, href: string }[]} [links]  typed questions: buttons to the site's own pages
 * @property {string[]} [chips]                          typed questions: suggested questions to offer next
 * @property {{ tool: string, summary: string }[]} [steps] agent mode
 * @property {Record<string, any>[]} [drafts]              agent mode
 */

/**
 * Asks the chat-insights function: a fixed question ({ id, area? }) or a typed one ({ id: "ask", question, previous? }).
 * @param {Record<string, string>} ask
 * @returns {Promise<ChatAnswer>}
 */
async function askChatInsights(ask) {
  /** @type {Record<string, string>} */
  const headers = { "Content-Type": "application/json" };
  // agent mode: the login token lets the server work out the role only (visitor / donor / volunteer …)
  if (ask.id === "agent") {
    const token = (await db().auth.getSession().catch(() => null))?.data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  /** @type {Response} */
  let response;
  try {
    response = await fetch("/api/chat-insights", {
      method: "POST",
      headers,
      // the chosen language: chip answers come back in it (typed questions in the language they're typed in)
      body: JSON.stringify({ ...ask, lang: getLang() }),
    });
  } catch {
    throw new Error(t("chat.errNetwork"));
  }
  if (response.status === 429) throw new Error(t("chat.errRateLimit"));
  const body = await response.json().catch(() => ({}));
  if (response.status >= 500) throw new Error(t("chat.errUnavailable"));
  if (!response.ok) throw new Error(t("chat.errGeneric"));
  return body;
}

/** The chat's markup: added once to every page. Static text only — answers are shown with x-text. */
const CHAT_MARKUP = `
<div x-data="chatAssistant">
  <!-- icon only; the name is in aria-label (screen readers) and title (a tooltip on hover) -->
  <button type="button" class="chat-fab" x-ref="fab" aria-label="Ask KampongShare" title="Ask KampongShare" data-i18n-attr="aria-label:chat.open; title:chat.open" aria-haspopup="dialog"
    aria-controls="chat-panel" :aria-expanded="open.toString()" @click="openChat()">
    <i class="ph ph-chat-circle-dots size-6" aria-hidden="true"></i>
  </button>

  <dialog id="chat-panel" class="chat-panel" aria-labelledby="chat-title" @close="onClosed()" @click="if ($event.target === $el) closeChat()">
    <div class="flex h-full flex-col text-[0.9375rem] leading-[1.375rem]">
      <div class="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id="chat-title" class="section-title text-base" data-i18n="chat.title">Ask KampongShare</h2>
        <div class="flex items-center gap-1">
          <button type="button" class="btn btn-quiet min-h-11 px-3 text-[0.875rem]" x-show="messages.length" @click="startOver()" data-i18n="chat.startOver">Start over</button>
          <button type="button" class="icon-btn" aria-label="Close chat" data-i18n-attr="aria-label:chat.close" @click="closeChat()">
            <i class="ph ph-x size-5" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <div id="chat-log" class="flex-1 space-y-3 overflow-y-auto p-4">
        <!-- the conversation: new answers are read out by screen readers -->
        <div class="space-y-3" role="log" aria-live="polite" aria-label="Conversation" data-i18n-attr="aria-label:chat.conversation">
          <p class="chat-bubble-bot" data-i18n="chat.intro">Hi! Tap a question below, or type your own.</p>
          <template x-for="message in messages" :key="message.id">
            <div :class="message.from === 'user' ? 'flex justify-end' : ''">
              <div :class="message.from === 'user' ? 'chat-bubble-user' : message.error ? 'chat-bubble-bot text-danger' : 'chat-bubble-bot'">
                <p class="flex items-center gap-2" x-show="message.thinking"><span class="spinner" aria-hidden="true"></span> <span x-show="!message.slow" data-i18n="chat.thinking">Thinking…</span><span x-show="message.slow" data-i18n="chat.thinkingSlow">The AI is busy right now — still working on it…</span></p>
                <span class="badge badge-ai badge-sm mb-1 text-[0.75rem]" x-show="message.ai" data-i18n="common.aiSuggested">AI-suggested</span>
                <p class="whitespace-pre-line" x-show="!message.thinking" x-text="message.text"></p>
                <!-- what Pinny did: one line per tool it used, written by the server's code from the real results -->
                <details class="mt-1.5" x-show="message.steps?.length">
                  <summary class="cursor-pointer text-[0.75rem] leading-5 text-muted" x-text="$t('chat.whatPinnyDid') + ' (' + (message.steps?.length || 0) + ')'"></summary>
                  <ol class="mt-1 list-decimal space-y-0.5 pl-5 text-[0.75rem] leading-4 text-muted">
                    <template x-for="(step, index) in (message.steps || [])" :key="index"><li x-text="step.summary"></li></template>
                  </ol>
                </details>

                <ul class="mt-2 space-y-2" x-show="message.items?.length">
                  <template x-for="item in (message.items || [])" :key="item.id">
                    <li class="rounded-md border-[1.5px] border-edge bg-surface px-2.5 py-2">
                      <p class="text-[0.875rem] leading-5 font-bold break-words" x-text="item.name"></p>
                      <p class="text-[0.75rem] leading-4 text-muted" x-text="$t('chat.stillNeeded', { count: item.quantity_remaining, unit: item.unit })"></p>
                      <p class="text-[0.75rem] leading-4 break-words" x-text="[item.request?.title, item.request?.organization?.name].filter(Boolean).join(' · ')"></p>
                      <a class="btn btn-secondary mt-1.5 min-h-9 px-3 text-[0.75rem]" x-show="offerHrefFor(item.id)" :href="offerHrefFor(item.id)"
                        :aria-label="$t('chat.offerItem', { item: item.name })" data-i18n="common.offer">Offer</a>
                    </li>
                  </template>
                </ul>
                <ul class="mt-2 space-y-2" x-show="message.events?.length">
                  <template x-for="event in (message.events || [])" :key="event.id">
                    <li class="rounded-md border-[1.5px] border-edge bg-surface px-2.5 py-2">
                      <p class="text-[0.875rem] leading-5 font-bold break-words" x-text="event.title"></p>
                      <p class="text-[0.75rem] leading-4 text-muted" x-text="formatDate(event.starts_at, true)"></p>
                      <p class="text-[0.75rem] leading-4 break-words" x-text="[event.location_name, event.organization?.name].filter(Boolean).join(' · ')"></p>
                      <a class="btn btn-secondary mt-1.5 min-h-9 px-3 text-[0.75rem]" :href="'/event.html?id=' + event.id" :aria-label="$t('chat.viewEvent', { event: event.title })" data-i18n="events.viewEvent">View event</a>
                    </li>
                  </template>
                </ul>
                <!-- drafts: nothing is sent until the person presses the button (their own login, the normal rules) -->
                <template x-for="draft in (message.drafts || [])" :key="draft.key">
                  <form class="white-fields mt-2 space-y-2 rounded-md border-[1.5px] border-primary bg-surface px-2.5 py-2" novalidate @submit.prevent="confirmDraft(draft)">
                    <p class="badge badge-info badge-sm text-[0.75rem]" x-show="draft.state !== 'sent'" data-i18n="chat.draftLabel">Draft — not sent yet</p>
                    <template x-if="draft.kind === 'offer'">
                      <div class="space-y-1.5">
                        <p class="text-[0.875rem] leading-5 font-bold break-words" x-text="$t('chat.draftOffer', { item: draft.item })"></p>
                        <p class="text-[0.75rem] leading-4 break-words text-muted" x-text="$t('chat.draftFor', { title: draft.request_title, organization: draft.organization })"></p>
                        <p class="text-[0.75rem] leading-4 break-words" x-show="draft.spec"><span class="text-muted" data-i18n="orgDash.needed">Needed</span>: <span x-text="draft.spec"></span></p>
                        <label class="block text-[0.75rem] leading-4 font-bold" :for="'draft-qty-' + draft.key" x-text="$t('chat.howMany', { count: draft.remaining, unit: draft.unit })"></label>
                        <input class="input min-h-10 w-28 py-1" type="number" inputmode="numeric" min="1" :max="draft.remaining" :id="'draft-qty-' + draft.key"
                          x-model.number="draft.quantity" />
                        <!-- photos, the condition and a description are added on the offer form itself -->
                        <p class="text-[0.75rem] leading-4 text-muted" data-i18n="chat.completeOfferNote">On the offer form you add 1–3 photos and the condition, then confirm.</p>
                      </div>
                    </template>
                    <template x-if="draft.kind === 'application'">
                      <div class="space-y-1.5">
                        <p class="text-[0.875rem] leading-5 font-bold break-words" x-text="$t('chat.draftApplication', { title: draft.title })"></p>
                        <p class="text-[0.75rem] leading-4 break-words text-muted" x-text="[formatDate(draft.starts_at, true), draft.place, draft.organization].filter(Boolean).join(' · ')"></p>
                        <p class="text-[0.75rem] leading-4 text-muted" x-text="draft.spots_left == null ? $t('chat.noLimit') : $t('chat.spotsLeft', { count: draft.spots_left })"></p>
                        <label class="block text-[0.75rem] leading-4 font-bold" :for="'draft-note-' + draft.key" data-i18n="chat.noteLabel">Message to the organization (optional)</label>
                        <textarea class="input min-h-10 py-1.5 text-[0.875rem]" rows="2" maxlength="500" :id="'draft-note-' + draft.key" x-model="draft.message" :disabled="draft.state !== 'ready'"></textarea>
                      </div>
                    </template>
                    <template x-if="draft.kind === 'message'">
                      <div class="space-y-1.5">
                        <p class="text-[0.875rem] leading-5 font-bold break-words" x-text="$t('chat.draftMessage', { organization: draft.organization })"></p>
                        <label class="sr-only" :for="'draft-text-' + draft.key" data-i18n="chat.messageLabel">Your message</label>
                        <textarea class="input min-h-10 py-1.5 text-[0.875rem]" rows="3" maxlength="500" :id="'draft-text-' + draft.key" x-model="draft.text" :disabled="draft.state !== 'ready'"></textarea>
                      </div>
                    </template>
                    <!-- who may confirm: visitors log in first; people without the role, consent or approval get the usual notes -->
                    <p class="text-[0.75rem] leading-4 text-danger" role="alert" x-show="draft.error" x-text="draft.error"></p>
                    <template x-if="draft.state === 'sent'">
                      <p class="flex flex-wrap items-center gap-2 text-[0.8125rem] font-bold text-primary">
                        <i class="ph ph-check-circle" aria-hidden="true"></i><span x-text="sentLabel(draft)"></span>
                        <a class="link font-normal" :href="draft.doneHref" x-show="draft.doneHref" x-text="doneLabel(draft)"></a>
                      </p>
                    </template>
                    <template x-if="draft.kind === 'offer' && (gate(draft) === 'ok' || gate(draft) === 'visitor')">
                      <a class="btn btn-primary btn-sm min-h-10 px-3 text-[0.8125rem]" :href="completeOfferHref(draft)" x-text="$t('chat.completeOffer')"></a>
                    </template>
                    <template x-if="draft.state !== 'sent' && !(draft.kind === 'offer' && (gate(draft) === 'ok' || gate(draft) === 'visitor'))">
                      <div class="flex flex-wrap items-center gap-2">
                        <template x-if="gate(draft) === 'visitor'">
                          <button type="button" class="btn btn-primary btn-sm min-h-10 px-3 text-[0.8125rem]" @click="logInToConfirm()" data-i18n="chat.logInToConfirm">Log in to confirm</button>
                        </template>
                        <template x-if="gate(draft) === 'turn_on'">
                          <div class="space-y-1.5">
                            <p class="text-[0.75rem] leading-4" x-text="draft.kind === 'offer' ? $t('common.turnOnDonatingToDo') : $t('common.turnOnVolunteeringToDo')"></p>
                            <button type="button" class="btn btn-secondary btn-sm min-h-10 px-3 text-[0.8125rem]" @click="turnOn(draft)"
                              x-text="draft.kind === 'offer' ? $t('common.turnOnDonating') : $t('common.turnOnVolunteering')"></button>
                          </div>
                        </template>
                        <template x-if="gate(draft) === 'consent'">
                          <p class="text-[0.75rem] leading-4"><span data-i18n="common.consentFirst">Please confirm the privacy consent and that you're 18 or older first.</span>
                            <a class="link" href="/profile.html" data-i18n="common.goToProfile">Go to my profile</a></p>
                        </template>
                        <template x-if="gate(draft) === 'pending'"><p class="text-[0.75rem] leading-4" data-i18n="event.accountPending">Your volunteer account is waiting for admin approval.</p></template>
                        <template x-if="gate(draft) === 'rejected'"><p class="text-[0.75rem] leading-4" data-i18n="event.accountRejected">Your volunteer account wasn't approved.</p></template>
                        <template x-if="gate(draft) === 'staff'"><p class="text-[0.75rem] leading-4" data-i18n="chat.staffNoConfirm">Organization and admin accounts can't confirm this.</p></template>
                        <template x-if="gate(draft) === 'ok'">
                          <button type="submit" class="btn btn-primary btn-sm min-h-10 px-3 text-[0.8125rem]" :disabled="draft.state === 'sending'">
                            <span class="spinner" x-show="draft.state === 'sending'" aria-hidden="true"></span>
                            <span x-text="draft.kind === 'offer' ? $t('chat.confirmOffer') : draft.kind === 'application' ? $t('chat.confirmApplication') : $t('chat.sendMessage')"></span>
                          </button>
                        </template>
                      </div>
                    </template>
                  </form>
                </template>
                <div class="mt-2 flex flex-wrap gap-2" x-show="message.links?.length">
                  <template x-for="link in (message.links || [])" :key="link.href">
                    <a class="btn btn-secondary min-h-11 px-3 text-[0.8125rem]" :href="link.href" x-text="link.labelKey ? $t(link.labelKey) : link.label"></a>
                  </template>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- the questions you can tap next -->
        <div class="space-y-3 pt-1" x-show="!busy">
          <template x-for="group in chipGroups" :key="group.key">
            <div>
              <p class="mb-2 text-[0.8125rem] leading-5 font-bold text-muted" x-show="group.titleKey" x-text="group.titleKey ? $t(group.titleKey) : ''"></p>
              <div class="flex flex-wrap gap-2">
                <template x-for="chip in group.chips" :key="chip.key">
                  <button type="button" class="chip chip-sm text-left" @click="tap(chip)" x-text="chipLabel(chip)"></button>
                </template>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- type your own question -->
      <form class="border-t border-line px-4 pt-3" @submit.prevent="send()" novalidate>
        <label for="chat-input" class="sr-only" data-i18n="chat.inputLabel">Ask about KampongShare</label>
        <div class="flex gap-2">
          <input id="chat-input" class="input input-busy message-text" type="text" maxlength="300" autocomplete="off" placeholder="Ask about KampongShare…" data-i18n-attr="placeholder:chat.placeholder"
            x-model="draft" :readonly="busy" aria-describedby="chat-input-hint" />
          <button type="submit" class="btn btn-primary size-12 shrink-0 px-0" :disabled="busy || !draft.trim()" aria-label="Send question" data-i18n-attr="aria-label:chat.send">
            <i class="ph ph-paper-plane-right size-5" aria-hidden="true"></i>
          </button>
        </div>
        <!-- the hint is for screen readers; the box stops at 300 characters -->
        <span id="chat-input-hint" class="sr-only" data-i18n="chat.hint">I can only answer questions about KampongShare.</span>
      </form>

      <p class="px-4 pt-2 pb-3 text-[0.8125rem] leading-5 text-muted">
        <span data-i18n="chat.cantFind">Can't find your question? See</span> <a class="link" href="/#how-heading" data-i18n="chat.howItWorks">How it works</a>
        · <a class="link" href="/privacy.html" data-i18n="common.privacyNotice">Privacy Notice</a>
      </p>
    </div>
  </dialog>
</div>`;

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("chatAssistant", () => {
    let nextId = 1;

    return {
      open: false,
      busy: false,
      /** @type {Viewer | null} */
      viewer: null,
      /** @type {ChatMessage[]} */
      messages: [],
      /** @type {{ key: string, titleKey: string, chips: ChatChip[] }[]} the questions to show now (titles are translation keys) */
      chipGroups: [],
      /** the question being typed */
      draft: "",
      /** the last thing asked (sent with the next typed question, for follow-ups like "what about Jurong?") */
      lastAsked: "",

      async init() {
        this.viewer = await getViewer().catch(() => null);
        this.showStartChips();
        this.restorePending();
        window.addEventListener("profile-changed", async () => {
          forgetViewer();
          this.viewer = await getViewer().catch(() => null);
          if (!this.messages.length) this.showStartChips();
        });
      },

      /** @returns {ChatQuestion[]} */
      visibleQuestions() {
        return CHAT_QUESTIONS.filter((q) => q.show(this.viewer));
      },

      /** The first set of chips, grouped by section. */
      showStartChips() {
        const visible = this.visibleQuestions();
        this.chipGroups = /** @type {ChatQuestion['group'][]} */ (["agent", "start", "organization", "account", "live", "about", "privacy"])
          .map((group) => ({
            key: group,
            titleKey: `chat.group.${group}`,
            chips: visible.filter((q) => q.group === group).map((q) => ({ key: q.id, questionId: q.id })),
          }))
          .filter((group) => group.chips.length);
      },

      /** @param {string[]} ids */
      showFollowUps(ids) {
        const visible = this.visibleQuestions();
        const chips = ids
          .map((id) => visible.find((q) => q.id === id))
          .filter((q) => q !== undefined)
          .map((q) => ({ key: q.id, questionId: q.id }));
        this.chipGroups = chips.length ? [{ key: "next", titleKey: "", chips }] : [];
      },

      openChat() {
        this.open = true;
        /** @type {HTMLDialogElement} */ (document.getElementById("chat-panel")).showModal();
        // focus the first question, so keyboard and screen reader users start in the right place
        setTimeout(() => /** @type {HTMLElement | null} */ (document.querySelector("#chat-panel .chip"))?.focus(), 0);
      },

      closeChat() {
        /** @type {HTMLDialogElement} */ (document.getElementById("chat-panel")).close();
      },

      /** Escape, the Close button or a click outside: focus goes back to the chat button. */
      onClosed() {
        this.open = false;
        /** @type {any} */ (this).$refs.fab.focus();
      },

      startOver() {
        this.messages = [];
        this.showStartChips();
        setTimeout(() => /** @type {HTMLElement | null} */ (document.querySelector("#chat-panel .chip"))?.focus(), 0);
      },

      /**
       * @param {Omit<ChatMessage, 'id'>} message
       * @returns {ChatMessage} the reactive copy, so it can be updated when the answer arrives
       */
      add(message) {
        this.messages.push({ id: nextId++, ...message });
        const added = this.messages[this.messages.length - 1];
        this.scrollToEnd();
        return added;
      },

      /**
       * A chip's words in the chosen language: a question, or an area name.
       * @param {ChatChip} chip
       * @returns {string}
       */
      chipLabel(chip) {
        return chip.area ? areaLabel(chip.area) : t(`chat.q.${chip.questionId}.label`);
      },

      /** @param {ChatChip} chip */
      async tap(chip) {
        const label = this.chipLabel(chip);
        this.add({ from: "user", text: label });
        this.lastAsked = label;
        if (chip.area) return this.answerLive({ id: "area", area: chip.area }, ["most_needed", "ending_soon"], false);
        const question = CHAT_QUESTIONS.find((q) => q.id === chip.questionId);
        if (!question) return;
        if (question.live) return this.answerLive({ id: question.live }, question.followUps, false);
        // "Pinny can help": asked like a typed question, so Pinny chooses its own tools
        if (question.agent) return this.answerLive({ id: "agent", question: label }, question.followUps, false);
        // pre-written: sign-up links make no sense once you're logged in
        const links = (question.links ?? []).filter((link) => !(this.viewer && link.href.startsWith("/signup")));
        this.add({ from: "bot", text: t(`chat.q.${question.id}.answer`), links });
        this.showFollowUps(question.followUps);
        this.focusNewChips();
      },

      /** Sends the typed question. Personal details are removed on the server before anything else. */
      send() {
        const question = this.draft.trim().slice(0, CHAT_MAX_QUESTION);
        if (!question || this.busy) return;
        this.add({ from: "user", text: question });
        const previous = this.lastAsked;
        this.lastAsked = question;
        this.draft = "";
        this.answerLive(previous ? { id: "agent", question, previous } : { id: "agent", question }, [], true);
      },

      /**
       * An answer from chat-insights: the summary, then real cards from the database.
       * @param {Record<string, string>} ask
       * @param {string[]} followUps
       * @param {boolean} typed after a typed question, focus stays in the text box
       */
      async answerLive(ask, followUps, typed) {
        this.busy = true;
        const reply = this.add({ from: "bot", text: "", thinking: true });
        // NVIDIA is sometimes slow: after 8 s say so, so the wait doesn't look broken
        const slowTimer = setTimeout(() => {
          if (reply.thinking) reply.slow = true;
        }, 8000);
        try {
          const result = await askChatInsights(ask);
          const [items, events] = await Promise.all([loadChatItems(result.request_item_ids), loadChatEvents(result.event_ids)]);
          // only the site's own pages, never outside links (a second check after the server's)
          const links = (result.links ?? []).filter((link) => /^\/(?!\/)/.test(link.href));
          // drafts and steps come from the tools the server really ran (never from the AI's text)
          const drafts = (result.drafts ?? []).map(chatDraft).filter((d) => d !== null);
          const steps = (result.steps ?? []).filter((step) => typeof step?.summary === "string").slice(0, 8);
          Object.assign(reply, { thinking: false, text: result.summary, ai: result.ai, items, events, links, steps, drafts });
          if (result.chips) {
            this.showFollowUps(result.chips);
          } else if (result.areas) {
            this.chipGroups = result.areas.length
              ? [{ key: "areas", titleKey: "chat.chooseArea", chips: result.areas.map((area) => ({ key: `area-${area}`, area })) }]
              : [];
            if (!result.areas.length) this.showFollowUps(followUps);
          } else {
            this.showFollowUps(followUps);
          }
        } catch (error) {
          Object.assign(reply, { thinking: false, error: true, text: error instanceof Error && error.message ? error.message : friendlyError(error) });
          this.showFollowUps(followUps);
        } finally {
          clearTimeout(slowTimer);
          this.busy = false;
          if (typed) setTimeout(() => document.getElementById("chat-input")?.focus(), 0);
          else this.focusNewChips();
          this.scrollToEnd();
        }
      },

      /** Keeps the newest message in view. */
      scrollToEnd() {
        setTimeout(() => {
          const log = document.getElementById("chat-log");
          if (log) log.scrollTop = log.scrollHeight;
        }, 0);
      },

      /** After an answer, move focus to the next questions (the answer itself is read out). */
      focusNewChips() {
        setTimeout(() => /** @type {HTMLElement | null} */ (document.querySelector("#chat-panel .chip"))?.focus({ preventScroll: true }), 0);
      },

      /**
       * Where an item's Offer button goes, by who is looking (REQUIREMENTS.md 6.6b), or "" for no button.
       * @param {string} itemId
       * @returns {string}
       */
      offerHrefFor(itemId) {
        const mode = donorView(this.viewer);
        if (mode === "staff") return ""; // organizations and admins can't donate
        const target = `/needs.html?item=${encodeURIComponent(itemId)}`;
        // needs.html shows the consent or "Turn on donating" message when it's needed
        return mode === "visitor" ? `/login.html?next=${encodeURIComponent(target)}` : target;
      },

      // ---------------------------------------------------------------- drafts

      /**
       * Who may confirm this draft right now, by who is looking (REQUIREMENTS.md 6.6b).
       * @param {ChatDraft} draft
       * @returns {'visitor' | 'staff' | 'turn_on' | 'consent' | 'pending' | 'rejected' | 'ok'}
       */
      gate(draft) {
        if (!this.viewer) return "visitor";
        if (draft.kind === "message") {
          if (this.viewer.role === "organization" || this.viewer.role === "admin") return "staff";
          return this.viewer.hasConsent ? "ok" : "consent";
        }
        const mode = draft.kind === "offer" ? donorView(this.viewer) : volunteerView(this.viewer);
        if (mode === "visitor" || mode === "staff" || mode === "turn_on" || mode === "consent" || mode === "pending" || mode === "rejected") return mode;
        return "ok";
      },

      /** @param {ChatDraft} draft */
      async turnOn(draft) {
        draft.error = "";
        try {
          this.viewer = await turnOnRole(draft.kind === "offer" ? "donor" : "volunteer");
        } catch (error) {
          draft.error = friendlyError(error);
        }
      },

      /**
       * The offer form for a draft, with the amount filled in (ids and numbers only, never personal data);
       * visitors log in first and land on it.
       * @param {ChatDraft} draft
       */
      completeOfferHref(draft) {
        const max = draft.remaining ?? 1;
        const quantity = Math.min(Math.max(Number(draft.quantity) || 1, 1), max);
        const form = `/needs.html?item=${encodeURIComponent(draft.request_item_id ?? "")}&qty=${quantity}`;
        return this.viewer ? form : `/login.html?next=${encodeURIComponent(form)}`;
      },

      /**
       * Sends a draft with the person's own login, through the same functions and database rules as the
       * normal Offer / Apply / Send buttons. The database's message is shown if it refuses.
       * @param {ChatDraft} draft
       */
      async confirmDraft(draft) {
        if (draft.state !== "ready" || this.gate(draft) !== "ok") return;
        draft.error = "";
        // offers are completed on the offer form (photos and condition), never confirmed here
        if (draft.kind === "offer") return;
        if (draft.kind === "message" && !(draft.text ?? "").trim()) {
          draft.error = t("chat.errEmptyMessage");
          return;
        }
        draft.state = "sending";
        try {
          if (draft.kind === "application") {
            await ensureScript("/js/volunteering.js", "applyToEvent");
            await /** @type {any} */ (window).applyToEvent(draft.event_id, draft.message ?? "");
            draft.doneHref = "/volunteer.html#applications";
            toast(t("chat.applicationSent"));
          } else {
            const conversation = await startConversation(/** @type {string} */ (draft.organization_id), null, null);
            await sendMessage(conversation, (draft.text ?? "").trim());
            draft.doneHref = `/messages.html#c=${encodeURIComponent(conversation)}`;
            toast(t("chat.messageSent"));
          }
          draft.state = "sent";
        } catch (error) {
          draft.state = "ready";
          draft.error = friendlyError(error);
        }
      },

      /** @param {ChatDraft} draft */
      sentLabel(draft) {
        return draft.kind === "offer" ? t("chat.offerSent") : draft.kind === "application" ? t("chat.applicationSent") : t("chat.messageSent");
      },

      /** @param {ChatDraft} draft */
      doneLabel(draft) {
        return draft.kind === "offer" ? t("chat.seeMyOffers") : draft.kind === "application" ? t("chat.seeMyApplications") : t("chat.openConversation");
      },

      /** Visitors: keep this reply and its drafts while they log in, then come back to the chat (never in the URL). */
      logInToConfirm() {
        try {
          sessionStorage.setItem(CHAT_PENDING_KEY, JSON.stringify(this.messages.filter((m) => !m.thinking)));
        } catch {
          // storage blocked: they come back to an empty chat
        }
        const back = `${location.pathname}${location.search}#chat`;
        location.href = `/login.html?next=${encodeURIComponent(back)}`;
      },

      /** Back from logging in: reopen the chat with the reply and drafts that were waiting. */
      restorePending() {
        // only back on the page they came from (marked #chat) — never on the login page in between
        if (location.hash !== "#chat") return;
        history.replaceState(null, "", `${location.pathname}${location.search}`);
        /** @type {ChatMessage[] | null} */
        let saved = null;
        try {
          saved = JSON.parse(sessionStorage.getItem(CHAT_PENDING_KEY) ?? "null");
          sessionStorage.removeItem(CHAT_PENDING_KEY);
        } catch {
          saved = null;
        }
        if (!Array.isArray(saved) || !saved.length) return;
        this.messages = saved.map((m) => ({ ...m, id: nextId++ }));
        this.chipGroups = [];
        setTimeout(() => {
          this.openChat();
          this.scrollToEnd();
        }, 0);
      },

      formatDate,
    };
  });
});

// Add the chat to the page (once, on every page that loads this file).
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("chat-panel")) return;
  const holder = document.createElement("div");
  holder.innerHTML = CHAT_MARKUP; // static markup only — no user or database text
  document.body.append(...holder.children);
});
