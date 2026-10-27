// @ts-check
// "Ask KampongShare": a help chat on every page (REQUIREMENTS.md 6.8). Tap a suggested question, or
// type your own (max 300 characters) — typed questions go to the chat-insights Netlify Function,
// which removes personal details first and only answers about KampongShare.
// Questions and pre-written answers live in js/chat-questions.js. "Right now" questions ask the
// chat-insights function (public data only), then show real cards from the database.
// The conversation lives only in this page (gone on reload); nothing is stored or logged.

/**
 * @typedef {Object} ChatChip
 * @property {string} key
 * @property {string} label
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
 * @typedef {Object} ChatMessage
 * @property {number} id
 * @property {'user' | 'bot'} from
 * @property {string} text
 * @property {boolean} [ai]        label the answer "AI-suggested"
 * @property {boolean} [thinking]
 * @property {boolean} [error]
 * @property {{ label: string, href: string }[]} [links]
 * @property {ChatItemCard[]} [items]
 * @property {ChatEventCard[]} [events]
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

/**
 * @typedef {Object} ChatAnswer
 * @property {string} summary
 * @property {boolean} ai
 * @property {string[]} request_item_ids
 * @property {string[]} event_ids
 * @property {string[]} [areas]                          area chips (the "my area" question)
 * @property {{ label: string, href: string }[]} [links]  typed questions: buttons to the site's own pages
 * @property {string[]} [chips]                          typed questions: suggested questions to offer next
 */

/**
 * Asks the chat-insights function: a fixed question ({ id, area? }) or a typed one ({ id: "ask", question, previous? }).
 * @param {Record<string, string>} ask
 * @returns {Promise<ChatAnswer>}
 */
async function askChatInsights(ask) {
  /** @type {Response} */
  let response;
  try {
    response = await fetch("/api/chat-insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ask),
    });
  } catch {
    throw new Error("We couldn't reach the server. Check your internet connection and try again.");
  }
  if (response.status === 429) throw new Error("Please wait a minute and try again.");
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "Something went wrong. Please try again.");
  return body;
}

/** The chat's markup: added once to every page. Static text only — answers are shown with x-text. */
const CHAT_MARKUP = `
<div x-data="chatAssistant">
  <button type="button" class="chat-fab" x-ref="fab" aria-label="Ask KampongShare" aria-haspopup="dialog"
    aria-controls="chat-panel" :aria-expanded="open.toString()" @click="openChat()">
    <i data-lucide="message-circle-question" class="size-6" aria-hidden="true"></i>
    <span class="hidden sm:inline">Ask KampongShare</span>
  </button>

  <dialog id="chat-panel" class="chat-panel" aria-labelledby="chat-title" @close="onClosed()" @click="if ($event.target === $el) closeChat()">
    <div class="flex h-full flex-col">
      <div class="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id="chat-title" class="text-base font-semibold">Ask KampongShare</h2>
        <div class="flex items-center gap-1">
          <button type="button" class="btn btn-ghost px-3 text-sm" x-show="messages.length" @click="startOver()">Start over</button>
          <button type="button" class="btn btn-ghost size-11 px-0" aria-label="Close chat" @click="closeChat()">
            <i data-lucide="x" class="size-5" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <div id="chat-log" class="flex-1 space-y-3 overflow-y-auto p-4">
        <!-- the conversation: new answers are read out by screen readers -->
        <div class="space-y-3" role="log" aria-live="polite" aria-label="Conversation">
          <p class="chat-bubble-bot">Hi! Tap a question below.</p>
          <template x-for="message in messages" :key="message.id">
            <div :class="message.from === 'user' ? 'flex justify-end' : ''">
              <div :class="message.from === 'user' ? 'chat-bubble-user' : message.error ? 'chat-bubble-bot text-danger' : 'chat-bubble-bot'">
                <p class="flex items-center gap-2" x-show="message.thinking"><span class="spinner" aria-hidden="true"></span> Thinking…</p>
                <span class="badge badge-ai mb-1" x-show="message.ai">AI-suggested</span>
                <p class="whitespace-pre-line" x-show="!message.thinking" x-text="message.text"></p>

                <ul class="mt-2 space-y-2" x-show="message.items?.length">
                  <template x-for="item in (message.items || [])" :key="item.id">
                    <li class="rounded-md border border-line bg-surface p-3">
                      <p class="font-semibold break-words" x-text="item.name"></p>
                      <p class="text-sm text-muted" x-text="item.quantity_remaining + ' ' + item.unit + ' still needed'"></p>
                      <p class="text-sm break-words" x-text="[item.request?.title, item.request?.organization?.name].filter(Boolean).join(' · ')"></p>
                      <a class="btn btn-secondary mt-2 min-h-11 px-3 text-sm" x-show="offerHrefFor(item.id)" :href="offerHrefFor(item.id)"
                        :aria-label="'Offer ' + item.name">Offer</a>
                    </li>
                  </template>
                </ul>
                <ul class="mt-2 space-y-2" x-show="message.events?.length">
                  <template x-for="event in (message.events || [])" :key="event.id">
                    <li class="rounded-md border border-line bg-surface p-3">
                      <p class="font-semibold break-words" x-text="event.title"></p>
                      <p class="text-sm text-muted" x-text="formatDate(event.starts_at, true)"></p>
                      <p class="text-sm break-words" x-text="[event.location_name, event.organization?.name].filter(Boolean).join(' · ')"></p>
                      <a class="btn btn-secondary mt-2 min-h-11 px-3 text-sm" :href="'/event.html?id=' + event.id" :aria-label="'View event: ' + event.title">View event</a>
                    </li>
                  </template>
                </ul>
                <div class="mt-2 flex flex-wrap gap-2" x-show="message.links?.length">
                  <template x-for="link in (message.links || [])" :key="link.href">
                    <a class="btn btn-secondary min-h-11 px-3 text-sm" :href="link.href" x-text="link.label"></a>
                  </template>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- the questions you can tap next -->
        <div class="space-y-3 pt-1" x-show="!busy">
          <template x-for="group in chipGroups" :key="group.title">
            <div>
              <p class="mb-2 text-xs font-semibold tracking-wide text-muted uppercase" x-show="group.title" x-text="group.title"></p>
              <div class="flex flex-wrap gap-2">
                <template x-for="chip in group.chips" :key="chip.key">
                  <button type="button" class="chip text-left" @click="tap(chip)" x-text="chip.label"></button>
                </template>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- type your own question -->
      <form class="border-t border-line px-4 pt-3" @submit.prevent="send()" novalidate>
        <label for="chat-input" class="sr-only">Ask about KampongShare</label>
        <div class="flex gap-2">
          <input id="chat-input" class="input" type="text" maxlength="300" autocomplete="off" placeholder="Ask about KampongShare…"
            x-model="draft" :readonly="busy" aria-describedby="chat-input-hint chat-input-count" />
          <button type="submit" class="btn btn-primary size-11 shrink-0 px-0" :disabled="busy || !draft.trim()" aria-label="Send question">
            <i data-lucide="send-horizontal" class="size-5" aria-hidden="true"></i>
          </button>
        </div>
        <div class="mt-1 flex justify-between gap-2 text-xs text-muted">
          <span id="chat-input-hint">I can only answer questions about KampongShare.</span>
          <span id="chat-input-count" x-text="draft.length + ' / 300'"></span>
        </div>
      </form>

      <p class="px-4 pt-2 pb-3 text-xs text-muted">
        Can't find your question? See <a class="font-semibold text-primary underline" href="/#how-heading">How it works</a>
        · <a class="font-semibold text-primary underline" href="/privacy.html">Privacy Notice</a>
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
      /** @type {{ title: string, chips: ChatChip[] }[]} the questions to show now */
      chipGroups: [],
      /** the question being typed */
      draft: "",
      /** the last thing asked (sent with the next typed question, for follow-ups like "what about Jurong?") */
      lastAsked: "",

      async init() {
        this.viewer = await getViewer().catch(() => null);
        this.showStartChips();
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
        this.chipGroups = /** @type {ChatQuestion['group'][]} */ (["start", "organization", "account", "live", "about", "privacy"])
          .map((group) => ({
            title: CHAT_GROUPS[group],
            chips: visible.filter((q) => q.group === group).map((q) => ({ key: q.id, label: q.label, questionId: q.id })),
          }))
          .filter((group) => group.chips.length);
      },

      /** @param {string[]} ids */
      showFollowUps(ids) {
        const visible = this.visibleQuestions();
        const chips = ids
          .map((id) => visible.find((q) => q.id === id))
          .filter((q) => q !== undefined)
          .map((q) => ({ key: q.id, label: q.label, questionId: q.id }));
        this.chipGroups = chips.length ? [{ title: "", chips }] : [];
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

      /** @param {ChatChip} chip */
      async tap(chip) {
        this.add({ from: "user", text: chip.label });
        this.lastAsked = chip.label;
        if (chip.area) return this.answerLive({ id: "area", area: chip.area }, ["most_needed", "ending_soon"], false);
        const question = CHAT_QUESTIONS.find((q) => q.id === chip.questionId);
        if (!question) return;
        if (question.live) return this.answerLive({ id: question.live }, question.followUps, false);
        // pre-written: sign-up links make no sense once you're logged in
        const links = (question.links ?? []).filter((link) => !(this.viewer && link.href.startsWith("/signup")));
        this.add({ from: "bot", text: question.answer ?? "", links });
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
        this.answerLive(previous ? { id: "ask", question, previous } : { id: "ask", question }, [], true);
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
        try {
          const result = await askChatInsights(ask);
          const [items, events] = await Promise.all([loadChatItems(result.request_item_ids), loadChatEvents(result.event_ids)]);
          // only the site's own pages, never outside links (a second check after the server's)
          const links = (result.links ?? []).filter((link) => /^\/(?!\/)/.test(link.href));
          Object.assign(reply, { thinking: false, text: result.summary, ai: result.ai, items, events, links });
          if (result.chips) {
            this.showFollowUps(result.chips);
          } else if (result.areas) {
            this.chipGroups = result.areas.length
              ? [{ title: "Choose an area", chips: result.areas.map((area) => ({ key: `area-${area}`, label: area, area })) }]
              : [];
            if (!result.areas.length) this.showFollowUps(followUps);
          } else {
            this.showFollowUps(followUps);
          }
        } catch (error) {
          Object.assign(reply, { thinking: false, error: true, text: error instanceof Error && error.message ? error.message : friendlyError(error) });
          this.showFollowUps(followUps);
        } finally {
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
