// @ts-check
// Deadlines on organization.html (REQUIREMENTS.md 11): the "Needs your action" rows for open requests
// past their deadline (Extend deadline / Close request) and events that have ended but aren't marked
// completed (Mark completed / Cancel event), plus "Also close the linked request?" after an event ends.
// Mixed into orgStats (js/org-stats.js), which already loads the requests and events.

/**
 * After an event is marked completed or cancelled: offer to close its linked request if it's still open.
 * @param {{ donation_request_id: string | null, request?: { title: string, status?: RequestStatus } | null }} event
 * @returns {Promise<void>}
 */
async function offerToCloseLinkedRequest(event) {
  const requestId = event.donation_request_id;
  if (!requestId || event.request?.status !== "open") return;
  const close = await confirmDialog(t("deadlines.closeLinkedText"), {
    title: t("deadlines.closeLinkedTitle", { title: event.request.title }),
    confirmText: t("deadlines.closeIt"),
    cancelText: t("deadlines.keepOpen"),
  });
  if (!close) return;
  try {
    await closeRequest(requestId, t("deadlines.reasonEventEnded"));
    toast(t("orgDash.requestClosed"));
    window.dispatchEvent(new CustomEvent("requests-changed"));
  } catch (error) {
    toast(friendlyError(error), "error");
  }
}

/** Requests that are open but past their deadline. @param {DonationRequest[]} requests */
function pastDeadlineRequests(requests) {
  return requests.filter((r) => r.status === "open" && isPastDeadline(r));
}

/** Approved events that have ended but are still upcoming / ongoing. @param {VolunteerEvent[]} events */
function endedOpenEvents(events) {
  return events.filter((e) => e.approval === "approved" && (e.status === "upcoming" || e.status === "ongoing") && hasEnded(e));
}

/** The Alpine state and actions for the deadline rows (spread into orgStats). */
function deadlineActions() {
  return {
    /** @type {DonationRequest[]} */
    pastDeadline: [],
    /** @type {VolunteerEvent[]} */
    endedEvents: [],
    /** @type {string | null} the request whose date picker is open */
    extendingId: null,
    extendDate: "",
    extendError: "",
    /** @type {string | null} the event whose outcome box is open */
    finishingId: null,
    finishOutcome: "",
    finishError: "",
    /** @type {string | null} */
    deadlineBusyId: null,
    sgToday,
    formatDate,

    /** @param {DonationRequest} request */
    startExtend(request) {
      this.extendingId = request.id;
      this.extendDate = "";
      this.extendError = "";
      setTimeout(() => document.getElementById(`extend-${request.id}`)?.focus(), 0);
    },

    /** @param {DonationRequest} request */
    async saveExtend(request) {
      if (!this.extendDate || this.extendDate < sgToday()) {
        this.extendError = t("deadlines.errExtendDate");
        document.getElementById(`extend-${request.id}`)?.focus();
        return;
      }
      this.deadlineBusyId = request.id;
      try {
        await extendDeadline(request.id, this.extendDate);
        await scoreRequest(request.id).catch(() => {}); // the deadline is part of the urgency score
        toast(t("deadlines.extended", { date: formatDate(this.extendDate) }));
        this.extendingId = null;
        focusHeading("action-heading");
        window.dispatchEvent(new CustomEvent("requests-changed"));
      } catch (error) {
        this.extendError = friendlyError(error);
      } finally {
        this.deadlineBusyId = null;
      }
    },

    /** @param {DonationRequest} request */
    async closePastDeadline(request) {
      const reason = await reasonDialog(t("orgDash.closeRequestText"), {
        title: t("orgDash.closeRequestTitle", { title: request.title }),
        label: t("orgDash.closeRequestLabel"),
        maxLength: REASON_MAX_LENGTH,
        initialValue: t("deadlines.reasonDeadlinePassed"),
        confirmText: t("orgDash.closeRequest"),
        danger: true,
      });
      if (reason === null) return;
      this.deadlineBusyId = request.id;
      try {
        await closeRequest(request.id, reason);
        toast(t("orgDash.requestClosed"));
        focusHeading("action-heading");
        window.dispatchEvent(new CustomEvent("requests-changed"));
        window.dispatchEvent(new CustomEvent("offers-changed")); // waiting offers were declined
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        this.deadlineBusyId = null;
      }
    },

    /** @param {VolunteerEvent} event */
    startFinish(event) {
      this.finishingId = event.id;
      this.finishOutcome = "";
      this.finishError = "";
      setTimeout(() => document.getElementById(`finish-${event.id}`)?.focus(), 0);
    },

    /** @param {VolunteerEvent} event */
    async saveFinish(event) {
      const summary = this.finishOutcome.trim();
      if (!summary || summary.length > 1000) {
        this.finishError = t(summary ? "orgDash.errSummaryLong" : "orgDash.errSummary");
        document.getElementById(`finish-${event.id}`)?.focus();
        return;
      }
      this.deadlineBusyId = event.id;
      try {
        await completeEvent(event.id, summary);
        toast(t("orgDash.completed"));
        this.finishingId = null;
        focusHeading("action-heading");
        window.dispatchEvent(new CustomEvent("events-changed"));
      } catch (error) {
        this.finishError = friendlyError(error);
        return;
      } finally {
        this.deadlineBusyId = null;
      }
      await offerToCloseLinkedRequest(event);
    },

    /** @param {VolunteerEvent} event */
    async cancelEnded(event) {
      const reason = await reasonDialog(t("orgDash.cancelText", { title: event.title }), {
        title: t("orgDash.cancelTitle"),
        label: t("orgDash.cancelLabel"),
        required: true,
        maxLength: REASON_MAX_LENGTH,
        warning: t("orgDash.cancelWarning"),
        confirmText: t("orgDash.cancelConfirm"),
        cancelText: t("common.keepIt"),
        danger: true,
      });
      if (reason === null) return;
      this.deadlineBusyId = event.id;
      try {
        await cancelEvent(event.id, reason);
        toast(t("orgDash.cancelled"));
        focusHeading("action-heading");
        window.dispatchEvent(new CustomEvent("events-changed"));
      } catch (error) {
        toast(friendlyError(error), "error");
        return;
      } finally {
        this.deadlineBusyId = null;
      }
      await offerToCloseLinkedRequest(event);
    },
  };
}
