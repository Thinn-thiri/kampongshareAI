// @ts-check
// Private messaging (REQUIREMENTS.md section 10): plain functions, no UI. Loaded on every page,
// because the top bar shows the unread count. The database enforces every rule
// (supabase/migrations/20261028040000_messaging.sql): who may message whom, blocking, limits.
// Conversations are started, blocked and marked read ONLY through its functions; a message is
// inserted with only conversation_id and body. Message text is never logged and never sent to the AI.

/** Longest message (characters), as in the database. */
const MESSAGE_MAX_LENGTH = 1000;
/** Longest report reason (characters), as in the database. */
const REPORT_MAX_LENGTH = 300;
/** Longest conversation topic (characters), as in the database. */
const TOPIC_MAX_LENGTH = 150;
/** Messages loaded at a time in a conversation. */
const MESSAGE_PAGE_SIZE = 50;
/** How often to check for new messages when Realtime isn't available. */
const MESSAGE_POLL_MS = 15_000;

/**
 * One row of my_conversations(): only the logged-in user's own conversations.
 * @typedef {Object} ConversationSummary
 * @property {string} id
 * @property {string} organization_id
 * @property {string | null} topic
 * @property {'person' | 'organization'} side  which side I am
 * @property {string | null} other_name        the organization's name, or the person's name
 * @property {boolean} org_available           the organization is still approved
 * @property {boolean} blocked_by_org
 * @property {boolean} blocked_by_person
 * @property {number} unread                   messages from the other side since I last read
 * @property {string | null} last_body         the first 120 characters of the last message
 * @property {boolean | null} last_mine
 * @property {string | null} last_message_at
 * @property {string} created_at
 * @property {string | null} my_deleted_at  when I deleted it ("Delete conversation"); never the other side's
 */

/**
 * @typedef {Object} Message
 * @property {string} id
 * @property {string} conversation_id
 * @property {string} sender_id
 * @property {string} body
 * @property {string} created_at
 */

/**
 * My conversations, newest first, with the other side's name, unread count and last message.
 * @returns {Promise<ConversationSummary[]>}
 */
async function listMyConversations() {
  const { data, error } = await db().rpc("my_conversations");
  if (error) throw error;
  return /** @type {ConversationSummary[]} */ (data ?? []);
}

/**
 * The number for the top bar: unread messages in all my conversations.
 * @returns {Promise<number>}
 */
async function unreadTotal() {
  const conversations = await listMyConversations();
  return conversations.reduce((sum, c) => sum + (c.unread ?? 0), 0);
}

/**
 * Messages in a conversation, oldest first: the latest page, or the page before `before`.
 * @param {string} conversationId
 * @param {string} [before] created_at of the oldest message already shown
 * @returns {Promise<{ messages: Message[], more: boolean }>}
 */
async function loadMessages(conversationId, before) {
  let query = db()
    .from("messages")
    .select("id, conversation_id, sender_id, body, created_at")
    .eq("conversation_id", conversationId);
  if (before) query = query.lt("created_at", before);
  // one extra row tells us whether there are older messages
  const { data, error } = await query.order("created_at", { ascending: false }).limit(MESSAGE_PAGE_SIZE + 1);
  if (error) throw error;
  const rows = /** @type {Message[]} */ (data ?? []);
  return { messages: rows.slice(0, MESSAGE_PAGE_SIZE).reverse(), more: rows.length > MESSAGE_PAGE_SIZE };
}

/**
 * Sends a message. Only conversation_id and body: the database fills in the sender and time.
 * @param {string} conversationId
 * @param {string} body
 * @returns {Promise<Message>}
 */
async function sendMessage(conversationId, body) {
  const { data, error } = await db()
    .from("messages")
    .insert({ conversation_id: conversationId, body: body.trim() })
    .select("id, conversation_id, sender_id, body, created_at")
    .single();
  if (error) throw error;
  return /** @type {Message} */ (data);
}

/**
 * Starts a conversation, or returns the one this pair already has.
 * Individuals pass only the organization; organizations also pass the donor or volunteer.
 * @param {string} organizationId
 * @param {string | null} personId
 * @param {string | null} topic e.g. "About: Rice for 40 families"
 * @returns {Promise<string>} the conversation id
 */
async function startConversation(organizationId, personId, topic) {
  const { data, error } = await db().rpc("start_conversation", {
    p_org_id: organizationId,
    p_person_id: personId ?? undefined,
    p_topic: topic ? topic.slice(0, TOPIC_MAX_LENGTH) : undefined,
  });
  if (error) throw error;
  return /** @type {string} */ (data);
}

/**
 * Blocks or unblocks the conversation from my side.
 * @param {string} conversationId
 * @param {boolean} blocked
 */
async function setConversationBlocked(conversationId, blocked) {
  const { error } = await db().rpc("set_conversation_blocked", { p_conversation_id: conversationId, p_blocked: blocked });
  if (error) throw error;
}

/**
 * "Delete conversation": hides it, and every message so far, from MY inbox only. Nothing is removed
 * from the database; the other side keeps their copy, and a newer message brings it back.
 * @param {string} conversationId
 */
async function deleteConversationForMe(conversationId) {
  const { error } = await db().rpc("delete_conversation_for_me", { p_conversation_id: conversationId });
  if (error) throw error;
}

/**
 * Deleted by me, with no message since: kept out of my list until a new message arrives.
 * @param {ConversationSummary} c
 * @returns {boolean}
 */
function isHiddenConversation(c) {
  if (!c.my_deleted_at) return false;
  return !c.last_message_at || new Date(c.last_message_at) <= new Date(c.my_deleted_at);
}

/** Marks the conversation as read up to now, from my side. @param {string} conversationId */
async function markConversationRead(conversationId) {
  const { error } = await db().rpc("mark_conversation_read", { p_conversation_id: conversationId });
  if (error) throw error;
}

/**
 * Reports a message from the other side. Admins can then read that one message.
 * @param {string} messageId
 * @param {string} reason
 */
async function reportMessage(messageId, reason) {
  const { error } = await db()
    .from("message_reports")
    .insert({ message_id: messageId, reason: reason.trim().slice(0, REPORT_MAX_LENGTH) });
  if (error?.code === "23505") throw new Error(t("messages.alreadyReported"));
  if (error) throw error;
}

/** The quick reasons in the Report dialog, in the reporter's language (the reason is read by admins). */
function reportQuickReasons() {
  return ["money", "rude", "spam", "other"].map((key) => t(`messages.reportReason.${key}`));
}

/**
 * A saved or new AI translation of someone else's message (netlify/functions/translate-messages.js).
 * @typedef {Object} MessageTranslation
 * @property {string} message_id
 * @property {'translated' | 'same' | 'unavailable'} status   same = already in the reader's language
 * @property {'en' | 'zh' | 'ms' | 'other' | null} detected_lang
 * @property {string | null} translated_text
 */

/** Most messages the translation function takes at once. */
const TRANSLATE_BATCH = 30;
/** localStorage key for the "Translate messages automatically" switch. */
const AUTO_TRANSLATE_KEY = "ks-translate-messages";

/**
 * Translations of other people's messages into `lang`, 30 at a time. The server reads them with my
 * login, so only messages I can see are translated; each is translated by the AI only once.
 * Messages missing from the result (e.g. my own) aren't translated. Throws when the function fails.
 * @param {string[]} ids
 * @param {Lang} lang
 * @returns {Promise<Map<string, MessageTranslation>>}
 */
async function translateMessages(ids, lang) {
  /** @type {Map<string, MessageTranslation>} */
  const out = new Map();
  if (!ids.length) return out;
  const {
    data: { session },
  } = await db().auth.getSession();
  if (!session) return out;
  for (let start = 0; start < ids.length; start += TRANSLATE_BATCH) {
    const response = await fetch("/api/translate-messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ message_ids: ids.slice(start, start + TRANSLATE_BATCH), target_lang: lang }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`); // i18n-ignore (shown as "Translation unavailable")
    const body = await response.json();
    for (const row of body?.translations ?? []) out.set(row.message_id, row);
  }
  return out;
}

/** The "Translate messages automatically" switch: on unless turned off in this browser. */
function autoTranslateOn() {
  try {
    return localStorage.getItem(AUTO_TRANSLATE_KEY) !== "off";
  } catch {
    return true;
  }
}

/** @param {boolean} on */
function setAutoTranslate(on) {
  try {
    localStorage.setItem(AUTO_TRANSLATE_KEY, on ? "on" : "off");
  } catch {
    // storage blocked: the choice lasts until the page is closed
  }
}

/** The lang attribute for text in a language: Chinese is written in Simplified characters. @param {string | null | undefined} lang */
function htmlLangOf(lang) {
  return lang === "zh" ? "zh-Hans" : lang === "en" || lang === "ms" ? lang : null; // i18n-ignore (language tag)
}

/** @type {Set<(message: Message | null) => void>} */
const messageWatchers = new Set();
/** @type {any} */
let messageChannel = null;
/** @type {ReturnType<typeof setInterval> | null} */
let messagePoll = null;

/** Realtime isn't available: check every 15 seconds instead. */
function startMessagePolling() {
  if (messagePoll) return;
  messagePoll = setInterval(() => {
    if (document.visibilityState === "visible") for (const watcher of messageWatchers) watcher(null);
  }, MESSAGE_POLL_MS);
}

function stopMessageWatching() {
  if (messageChannel) db().removeChannel(messageChannel);
  messageChannel = null;
  if (messagePoll) clearInterval(messagePoll);
  messagePoll = null;
}

/**
 * Calls `onChange` when something changes in my conversations: with the new message (Realtime),
 * or with null when the list should simply be reloaded (a conversation changed, or a poll).
 * One shared channel per page; the database's rules decide which rows reach this user.
 * @param {(message: Message | null) => void} onChange
 * @returns {() => void} stop watching
 */
function watchMessages(onChange) {
  messageWatchers.add(onChange);
  if (!messageChannel && !messagePoll) {
    try {
      messageChannel = db()
        .channel("my-messages")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (/** @type {any} */ payload) => {
          for (const watcher of messageWatchers) watcher(/** @type {Message} */ (payload.new));
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations" }, () => {
          for (const watcher of messageWatchers) watcher(null);
        })
        .subscribe((/** @type {string} */ status) => {
          if (status === "SUBSCRIBED" && messagePoll) {
            clearInterval(messagePoll);
            messagePoll = null;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") startMessagePolling();
        });
    } catch {
      startMessagePolling();
    }
  }
  return () => {
    messageWatchers.delete(onChange);
    if (!messageWatchers.size) stopMessageWatching();
  };
}

// leaving the page: close the live connection
window.addEventListener("pagehide", stopMessageWatching);

/** Tells the top bar to count unread messages again (e.g. after a conversation was read). */
function unreadChanged() {
  window.dispatchEvent(new CustomEvent("unread-changed"));
}

/** @param {string} conversationId */
function conversationUrl(conversationId) {
  return `/messages.html#c=${encodeURIComponent(conversationId)}`;
}

/**
 * What a "Message organization" button does for this viewer: visitors log in first,
 * organizations and admins don't see it, individuals start the conversation.
 * @param {Viewer | null} viewer
 * @returns {'visitor' | 'hidden' | 'person'}
 */
function messageButtonMode(viewer) {
  if (!viewer) return "visitor";
  if (viewer.role === "organization" || viewer.role === "admin") return "hidden";
  return "person";
}

/** The login link for visitors, coming back to this page. */
function messageLoginHref() {
  return `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
}

/**
 * Starts (or reopens) a conversation and goes to it. Errors are shown kindly, e.g. the daily limit.
 * @param {string} organizationId
 * @param {string | null} personId only when an organization messages a donor or volunteer
 * @param {string | null} topic
 * @returns {Promise<void>}
 */
async function openConversationWith(organizationId, personId, topic) {
  try {
    const id = await startConversation(organizationId, personId, topic);
    location.href = conversationUrl(id);
  } catch (error) {
    toast(friendlyError(error), "error");
  }
}

/**
 * "Message organization" from a public page or dashboard (individuals).
 * @param {string} organizationId
 * @param {string | null} [topic]
 */
function messageOrganization(organizationId, topic = null) {
  return openConversationWith(organizationId, null, topic);
}

/**
 * "Message donor" / "Message volunteer" (organizations; only people who offered or applied).
 * @param {string} organizationId
 * @param {string} personId
 * @param {string} topic
 */
function messagePerson(organizationId, personId, topic) {
  return openConversationWith(organizationId, personId, topic);
}

/**
 * "Message …" buttons, spread into a page's Alpine component: `...messageButtons()`.
 * Methods, not getters, so spreading keeps them live.
 */
function messageButtons() {
  return {
    /** the conversation being started, so the button can't be pressed twice */
    messaging: false,

    /** @param {Viewer | null} viewer */
    messageMode(viewer) {
      return messageButtonMode(viewer);
    },

    messageLoginHref,

    /**
     * Individuals: starts (or reopens) the conversation with an organization and opens it.
     * @param {string} organizationId
     * @param {string | null} [topic]
     */
    async messageOrg(organizationId, topic = null) {
      if (this.messaging) return;
      this.messaging = true;
      await messageOrganization(organizationId, topic);
      this.messaging = false;
    },

    /**
     * Organizations: a conversation with a donor who offered or a volunteer who applied.
     * @param {string} organizationId
     * @param {string} personId
     * @param {string} topic
     */
    async messageTo(organizationId, personId, topic) {
      if (this.messaging) return;
      this.messaging = true;
      await messagePerson(organizationId, personId, topic);
      this.messaging = false;
    },
  };
}
