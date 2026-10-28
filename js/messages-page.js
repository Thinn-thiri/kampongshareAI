// @ts-check
// messages.html: the conversation list and the open conversation (REQUIREMENTS.md section 10).
// UI only; the database calls are in js/messaging.js. Message text is shown with x-text (links stay
// plain text) and is never logged.

/**
 * @typedef {Object} DayGroup
 * @property {string} key       e.g. "2026-10-28"
 * @property {string} label     "Today", "Yesterday" or the date
 * @property {Message[]} items
 */

/** "2026-10-28" in local time, to group messages by day. @param {string} iso */
function dayKey(iso) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** The open conversation's id from the URL hash (#c=<id>), or null. */
function conversationFromHash() {
  const match = location.hash.match(/^#c=([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("messagesPage", () => {
    /** @type {(() => void) | null} */
    let stopWatching = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    let listTimer = null;
    /** true when the conversation was opened from the list on this page, so Back can go back */
    let openedHere = false;

    return {
      maxLength: MESSAGE_MAX_LENGTH,
      /** @type {string | null} */
      me: null,
      /** @type {Role | null} */
      role: null,

      /** @type {ConversationSummary[]} */
      conversations: [],
      loading: true,
      loadError: "",

      /** @type {string | null} */
      currentId: null,
      /** @type {Message[]} */
      messages: [],
      loadingMessages: false,
      messagesError: "",
      hasEarlier: false,
      loadingEarlier: false,

      draft: "",
      sending: false,
      sendError: "",
      blocking: false,

      async init() {
        const profile = await getProfile().catch(() => null);
        if (!profile) return; // js/auth.js sends visitors to the login page
        this.me = profile.id;
        this.role = profile.role;
        await this.loadList();
        window.addEventListener("hashchange", () => this.applyHash());
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible" && this.current?.unread) this.markRead();
        });
        stopWatching = watchMessages((message) => this.onChange(message));
        window.addEventListener("pagehide", () => stopWatching?.());
        this.applyHash();
      },

      // ---------- the list ----------

      async loadList() {
        try {
          this.conversations = await listMyConversations();
          this.loadError = "";
        } catch (error) {
          this.loadError = friendlyError(error);
        } finally {
          this.loading = false;
        }
      },

      /** Reload the list soon (several changes at once are loaded together). */
      reloadListSoon() {
        if (listTimer) clearTimeout(listTimer);
        listTimer = setTimeout(() => this.loadList(), 300);
      },

      /** The list: conversations I deleted stay out of it until a newer message arrives. */
      get visibleConversations() {
        return this.conversations.filter((c) => !isHiddenConversation(c));
      },

      get isOrganization() {
        return this.role === "organization";
      },

      /** @param {ConversationSummary} c */
      otherName(c) {
        return c.other_name || t("messages.someone");
      },

      /** @param {ConversationSummary} c */
      preview(c) {
        if (!c.last_body) return t("messages.newConversation");
        return c.last_mine ? t("messages.you", { text: c.last_body }) : c.last_body;
      },

      /** Today: the time; otherwise the date. @param {ConversationSummary} c */
      listTime(c) {
        const iso = c.last_message_at ?? c.created_at;
        return dayKey(iso) === dayKey(new Date().toISOString()) ? this.timeOf(iso) : formatDate(iso);
      },

      /** @param {string} iso */
      timeOf(iso) {
        return new Date(iso).toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" });
      },

      /** The list item's label for screen readers: who, unread, the last message and when. @param {ConversationSummary} c */
      itemLabel(c) {
        return [
          this.otherName(c),
          c.topic,
          c.unread ? t("messages.unreadCount", { count: c.unread }) : "",
          this.preview(c),
          this.listTime(c),
        ]
          .filter(Boolean)
          .join(". ");
      },

      // ---------- opening a conversation ----------

      get current() {
        return this.conversations.find((c) => c.id === this.currentId) ?? null;
      },

      /** A conversation was picked from the list (its link changes the hash). */
      noteOpened() {
        openedHere = true;
      },

      applyHash() {
        const id = conversationFromHash();
        if (id === this.currentId) return;
        this.currentId = id;
        document.body.toggleAttribute("data-conversation-open", Boolean(id));
        this.messages = [];
        this.draft = "";
        this.sendError = "";
        if (id) this.openConversation(id);
      },

      /** @param {string} id */
      async openConversation(id) {
        if (!this.conversations.some((c) => c.id === id)) await this.loadList();
        if (!this.current) return; // "This conversation isn't available"
        this.loadingMessages = true;
        this.messagesError = "";
        try {
          const { messages, more } = await loadMessages(id);
          if (this.currentId !== id) return;
          this.messages = messages;
          this.hasEarlier = more;
        } catch (error) {
          this.messagesError = friendlyError(error);
        } finally {
          this.loadingMessages = false;
        }
        await this.$nextTick();
        this.scrollToEnd();
        document.getElementById("conversation-heading")?.focus();
        this.markRead();
      },

      /** Back to the list (phones). Goes back in history when the list is where we came from. */
      back() {
        const id = this.currentId;
        if (openedHere) history.back();
        else {
          history.pushState(null, "", location.pathname);
          this.applyHash();
        }
        // keyboard users land on the conversation they just left
        setTimeout(() => document.getElementById(`conversation-${id}`)?.focus(), 50);
      },

      async markRead() {
        const c = this.current;
        if (!c || document.visibilityState !== "visible") return;
        try {
          await markConversationRead(c.id);
          c.unread = 0;
          unreadChanged();
        } catch {
          // not important enough to bother anyone: it stays unread
        }
      },

      async showEarlier() {
        const first = this.messages[0];
        if (!this.currentId || !first) return;
        this.loadingEarlier = true;
        const log = this.$refs.log;
        const fromBottom = log ? log.scrollHeight - log.scrollTop : 0;
        try {
          const { messages, more } = await loadMessages(this.currentId, first.created_at);
          this.messages = [...messages, ...this.messages];
          this.hasEarlier = more;
          await this.$nextTick();
          // keep the reader's place instead of jumping
          if (log) log.scrollTop = log.scrollHeight - fromBottom;
          announce(t("messages.earlierLoaded", { count: messages.length }));
        } catch (error) {
          toast(friendlyError(error), "error");
        } finally {
          this.loadingEarlier = false;
        }
      },

      scrollToEnd() {
        const log = this.$refs.log;
        if (log) log.scrollTop = log.scrollHeight;
      },

      // ---------- live updates ----------

      /** @param {Message | null} message */
      async onChange(message) {
        this.reloadListSoon();
        if (message) {
          // the open conversation's log reads new messages out by itself (role="log");
          // for the others, say who wrote (not what: the text stays on screen only)
          if (message.conversation_id === this.currentId) this.addMessage(message);
          else if (message.sender_id !== this.me) {
            const c = this.conversations.find((x) => x.id === message.conversation_id);
            announce(t("messages.newFrom", { name: c ? this.otherName(c) : t("messages.someone") }));
          }
          return;
        }
        // polling (no Realtime) or a conversation changed: fetch the latest messages of the open one
        if (!this.currentId) return;
        try {
          const id = this.currentId;
          const { messages } = await loadMessages(id);
          if (this.currentId !== id) return;
          const fresh = messages.filter((m) => !this.messages.some((x) => x.id === m.id));
          for (const m of fresh) this.addMessage(m, false);
          if (fresh.some((m) => m.sender_id !== this.me)) this.markRead();
        } catch {
          // try again on the next change
        }
      },

      /**
       * Adds a message to the open conversation once (Realtime and our own insert can both bring it).
       * @param {Message} message
       * @param {boolean} [markRead]
       */
      addMessage(message, markRead = true) {
        if (this.messages.some((m) => m.id === message.id)) return;
        const log = this.$refs.log;
        const atEnd = !log || log.scrollHeight - log.scrollTop - log.clientHeight < 80;
        this.messages = [...this.messages, message].sort((a, b) => a.created_at.localeCompare(b.created_at));
        if (atEnd || message.sender_id === this.me) this.$nextTick(() => this.scrollToEnd());
        if (markRead && message.sender_id !== this.me) this.markRead();
      },

      /** @param {Message} message */
      mine(message) {
        return message.sender_id === this.me;
      },

      /** Messages grouped by day, with "Today" / "Yesterday" / the date between them. @returns {DayGroup[]} */
      get days() {
        /** @type {DayGroup[]} */
        const groups = [];
        const today = dayKey(new Date().toISOString());
        const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
        for (const message of this.messages) {
          const key = dayKey(message.created_at);
          let group = groups[groups.length - 1];
          if (!group || group.key !== key) {
            const label =
              key === today
                ? t("messages.today")
                : key === yesterday
                  ? t("messages.yesterday")
                  : new Date(message.created_at).toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
            group = { key, label, items: [] };
            groups.push(group);
          }
          group.items.push(message);
        }
        return groups;
      },

      // ---------- sending ----------

      get blockedByMe() {
        const c = this.current;
        return Boolean(c && (c.side === "person" ? c.blocked_by_person : c.blocked_by_org));
      },

      get blockedByThem() {
        const c = this.current;
        return Boolean(c && (c.side === "person" ? c.blocked_by_org : c.blocked_by_person));
      },

      /** Why nothing can be sent right now, or "" when sending works. */
      get cannotSend() {
        const c = this.current;
        if (!c) return "";
        if (!c.org_available) return c.side === "organization" ? t("messages.ownOrgUnavailable") : t("messages.orgUnavailable");
        if (this.blockedByMe && this.blockedByThem) return t("messages.blockedByBoth");
        if (this.blockedByMe) return t("messages.blockedByMe");
        if (this.blockedByThem) return t("messages.blockedByThem", { name: this.otherName(c) });
        return "";
      },

      /** Enter sends; Shift+Enter (or typing Chinese with an input method) adds a new line. @param {KeyboardEvent} event */
      onKeydown(event) {
        if (event.key !== "Enter" || event.shiftKey || event.isComposing) return; // i18n-ignore (key name)
        event.preventDefault();
        this.send();
      },

      async send() {
        const c = this.current;
        if (!c || this.sending || this.cannotSend) return;
        const body = this.draft.trim();
        if (!body) {
          this.sendError = t("errors.db.typeAMessage");
          return;
        }
        this.sending = true;
        this.sendError = "";
        try {
          const message = await sendMessage(c.id, body);
          this.draft = "";
          this.addMessage(message, false);
          this.reloadListSoon();
        } catch (error) {
          this.sendError = friendlyError(error);
          // e.g. blocked or the organization was removed meanwhile: show the right state
          this.loadList();
        } finally {
          this.sending = false;
          await this.$nextTick();
          document.getElementById("message-input")?.focus();
        }
      },

      // ---------- block and report ----------

      async toggleBlock() {
        const c = this.current;
        if (!c) return;
        const blocking = !this.blockedByMe;
        const ok = await confirmDialog(blocking ? t("messages.blockText") : t("messages.unblockText"), {
          title: blocking ? t("messages.blockTitle") : t("messages.unblockTitle"),
          confirmText: blocking ? t("messages.block") : t("messages.unblock"),
          danger: blocking,
        });
        if (!ok) return;
        this.blocking = true;
        try {
          await setConversationBlocked(c.id, blocking);
          await this.loadList();
          toast(blocking ? t("messages.blockedToast") : t("messages.unblockedToast"));
        } catch (error) {
          toast(friendlyError(error), "error");
        } finally {
          this.blocking = false;
        }
      },

      /** "Delete conversation": from my inbox only (the other side keeps theirs and is never told). */
      async deleteConversation() {
        const c = this.current;
        if (!c) return;
        const ok = await confirmDialog(t("messages.deleteText", { name: this.otherName(c) }), {
          title: t("messages.deleteTitle"),
          note: t("messages.deleteNote"),
          confirmText: t("common.delete"),
          danger: true,
        });
        if (!ok) return;
        try {
          await deleteConversationForMe(c.id);
          // close it without leaving a Back step that reopens it
          openedHere = false;
          history.replaceState(null, "", location.pathname);
          this.applyHash();
          await this.loadList();
          toast(t("messages.deleted"));
          unreadChanged();
          focusHeading("list-heading");
        } catch (error) {
          toast(friendlyError(error), "error");
        }
      },

      /** @param {Message} message */
      async report(message) {
        const reason = await reasonDialog(t("messages.reportText"), {
          title: t("messages.reportTitle"),
          label: t("messages.reportLabel"),
          required: true,
          maxLength: REPORT_MAX_LENGTH,
          quickReasons: reportQuickReasons(),
          confirmText: t("messages.reportConfirm"),
          danger: true,
        });
        if (reason === null) return;
        try {
          await reportMessage(message.id, reason);
          toast(t("messages.reported"));
        } catch (error) {
          toast(error instanceof Error && !("code" in error) ? error.message : friendlyError(error), "error");
        }
      },
    };
  });
});
