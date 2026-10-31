// @ts-check
// The pinned notice and the request details panel (DESIGN.md 6.1).
// A notice shows only three facts (what, how much is left, when it ends) and one button. Everything
// else is in this panel: urgency and "Why this score?", the description, drop-off, the organization,
// and each item with its own Offer form. Pages spread noticeHelpers() into their Alpine component and
// call openRequest(request, $event); the panel is added to the page once, below. After an offer is sent
// the panel sends "offer-sent", so the page can reload its lists.

/**
 * The category a notice shows: the first item that's still needed (or the first item).
 * @param {DonationRequest} request
 * @returns {string}
 */
function noticeCategory(request) {
  const items = request.request_items ?? [];
  return (items.find((item) => item.quantity_remaining > 0) ?? items[0])?.category ?? "other";
}

/**
 * The urgency badge on a notice: the score and level when it's scored ("82 · High urgency"), otherwise the
 * organization's own level ("High urgency"). "Why this score?" is in the details panel.
 * @param {DonationRequest} request
 * @returns {{ className: string, label: string }}
 */
function noticeUrgency(request) {
  /** @type {Record<Urgency, string>} */
  const classes = { critical: "badge badge-danger", high: "badge badge-warning", medium: "badge badge-info", low: "badge badge-neutral" };
  const level = urgencyWordOf(request);
  const word = enumLabel("urgency", level);
  const label = request.ai_score != null ? t("requests.noticeUrgencyScored", { score: request.ai_score, level: word }) : t("requests.urgencyOwn", { level: word });
  return { className: classes[level] ?? "badge badge-neutral", label };
}

/**
 * "How much is left" on a notice: the words, the bar's two parts (percent) and the bar's label.
 * One item: "6 of 10 bags still needed"; more: "3 of 4 items still needed".
 * @param {DonationRequest} request
 * @returns {{ text: string, received: number, promised: number, label: string }}
 */
function noticeNeed(request) {
  const items = request.request_items ?? [];
  const share = (/** @type {number} */ part, /** @type {number} */ whole) => (whole > 0 ? Math.max(0, Math.min(part / whole, 1)) : 0);
  const received = items.length ? items.reduce((sum, item) => sum + share(item.quantity_received, item.quantity_needed), 0) / items.length : 0;
  const covered = items.length ? items.reduce((sum, item) => sum + share(item.quantity_committed, item.quantity_needed), 0) / items.length : 0;
  const open = items.filter((item) => item.quantity_remaining > 0);
  let text;
  if (open.length === 0) text = t("requests.noticeAllPromised");
  else if (items.length === 1) {
    const item = items[0];
    text = t("requests.noticeOne", { remaining: item.quantity_remaining, needed: item.quantity_needed, unit: item.unit });
  } else text = t("requests.noticeMany", { count: open.length, total: items.length });
  const receivedPercent = Math.round(received * 100);
  const promisedPercent = Math.max(0, Math.round(covered * 100) - receivedPercent);
  return {
    text,
    received: receivedPercent,
    promised: promisedPercent,
    label: t("requests.noticeBarLabel", { received: receivedPercent, promised: promisedPercent }),
  };
}

/**
 * "When it ends" on a notice: "Ends Sat 2 Nov" (or "No end date").
 * @param {DonationRequest} request
 * @returns {string}
 */
function noticeEnds(request) {
  if (!request.deadline) return t("requests.noEndDate");
  // a whole day in Singapore (REQUIREMENTS.md 11): read the date as written, not in the device's time zone
  const day = new Date(`${request.deadline.slice(0, 10)}T00:00:00Z`);
  const text = day.toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return t("requests.endsOn", { date: text });
}

/**
 * Opens the details panel for a request.
 * @param {DonationRequest} request
 * @param {EventTarget | null} [opener] focus goes back here when the panel closes
 * @param {string | null} [itemId] scroll to this item (and open its Offer form for donors)
 */
function openRequestPanel(request, opener = null, itemId = null) {
  window.dispatchEvent(new CustomEvent("open-request", { detail: { request, opener, itemId } }));
}

/**
 * What pages with notices spread into their Alpine component.
 * @returns {Record<string, any>}
 */
function noticeHelpers() {
  return {
    noticeCategory,
    noticeNeed,
    noticeEnds,
    noticeUrgency,
    categoryIcon,
    /**
     * @param {DonationRequest} request
     * @param {Event | HTMLElement} from the click, or the element focus goes back to
     */
    openRequest(request, from) {
      openRequestPanel(request, from instanceof Event ? from.currentTarget : from);
    },
  };
}

const REQUEST_PANEL_MARKUP = `
<dialog id="request-panel" class="side-panel" aria-labelledby="request-panel-title" x-data="requestPanel"
  @close="onSidePanelEvent($event)" @click="onSidePanelEvent($event)">
  <div class="sticky top-0 z-10 flex items-start justify-between gap-3 bg-surface p-4 shadow-sm">
    <h2 id="request-panel-title" class="card-title pt-2" tabindex="-1" data-panel-title x-text="request ? request.title : ''"></h2>
    <button type="button" class="icon-btn" @click="closeSidePanel('request-panel')" aria-label="Close" data-i18n-attr="aria-label:common.close">
      <i class="ph ph-x" aria-hidden="true"></i>
    </button>
  </div>
  <template x-if="request">
    <div class="space-y-6 p-6">
      <div class="space-y-1">
        <a class="text-primary" :href="'/org.html?id=' + request.organization_id" x-text="request.organization?.name || $t('common.organization')"></a>
        <p class="text-sm text-muted break-words" x-show="request.organization?.address" x-text="request.organization?.address"></p>
        <p class="text-sm text-muted" x-text="noticeEnds(request)"></p>
      </div>

      <div class="space-y-2">
        <div class="flex flex-wrap items-center gap-2">
          <span :class="requestUrgency(request).className" x-text="requestUrgency(request).label"></span>
          <span class="badge badge-ai" x-show="requestUrgency(request).scored" data-i18n="common.aiSuggested">AI-suggested</span>
        </div>
        <template x-if="scoreDetails(request)">
          <div x-data="{ why: false }">
            <button type="button" class="btn btn-quiet -ml-3" :aria-expanded="why.toString()" aria-controls="request-panel-why" @click="why = !why"
              x-text="why ? $t('requests.hideWhy') : $t('requests.whyScore')"></button>
            <div id="request-panel-why" class="note space-y-2" x-show="why" x-cloak>
              <p x-text="scoreDetails(request).explanation"></p>
              <ul class="space-y-1" x-show="scoreDetails(request).factors.length">
                <template x-for="factor in scoreDetails(request).factors" :key="factor.key">
                  <li class="flex justify-between gap-3"><span x-text="factorLabel(factor)"></span><span class="shrink-0 tabular-nums" x-text="$t('requests.factorPoints', { points: factor.points, max: factor.max })"></span></li>
                </template>
              </ul>
              <p class="text-muted" data-i18n="requests.formulaNote">The number comes from a fixed formula. People always make the decisions.</p>
            </div>
          </div>
        </template>
      </div>

      <p class="whitespace-pre-line break-words" x-show="request.description" x-text="request.description"></p>

      <div class="note" x-show="request.dropoff_instructions">
        <p class="font-bold" data-i18n="requests.dropoff">Drop-off</p>
        <p class="whitespace-pre-line break-words" x-text="request.dropoff_instructions"></p>
      </div>

      <!-- who is looking -->
      <p class="note" x-show="viewerReady && donorMode() === 'staff'" data-i18n="common.donorsSee">This is what donors see.</p>
      <div class="note flex flex-wrap items-center gap-3" x-show="viewerReady && donorMode() === 'turn_on'">
        <p class="flex-1" data-i18n="common.turnOnDonatingToOffer">Turn on donating in your profile to offer items.</p>
        <button type="button" class="btn btn-primary" :disabled="turningOn" @click="turnOnDonating()">
          <span class="spinner" x-show="turningOn" aria-hidden="true"></span>
          <span data-i18n="common.turnOnDonating">Turn on donating</span>
        </button>
      </div>
      <p class="note-warning" x-show="viewerReady && donorMode() === 'consent'">
        <span data-i18n="common.consentFirst">Please confirm the privacy consent and that you're 18 or older first.</span>
        <a href="/profile.html" class="link" data-i18n="common.goToProfile">Go to my profile</a>
      </p>

      <section class="space-y-4" aria-labelledby="request-panel-items">
        <h3 id="request-panel-items" class="card-title" data-i18n="requests.whatsNeeded">What's needed</h3>
        <ul class="space-y-6">
          <template x-for="item in request.request_items" :key="item.id">
            <li :id="'panel-item-' + item.id" class="space-y-2 scroll-mt-24">
              <p class="flex items-center gap-2 font-bold break-words">
                <i class="size-6" :class="categoryIcon(item.category)" aria-hidden="true"></i>
                <span x-text="item.name"></span>
              </p>
              <div class="need-bar" role="img" :aria-label="itemBarLabel(item)">
                <span class="need-bar-received" :style="'width:' + itemPercent(item).received + '%'"></span>
                <span class="need-bar-promised" :style="'width:' + itemPercent(item).promised + '%'"></span>
              </div>
              <p class="tabular-nums" x-text="item.quantity_remaining > 0 ? $t('requests.noticeOne', { remaining: item.quantity_remaining, needed: item.quantity_needed, unit: item.unit }) : $t('requests.noticeAllPromised')"></p>
              <p class="text-sm text-muted tabular-nums" x-show="ownsContent(request.organization_id)"
                x-text="$t('orgDash.itemSummary', { needed: item.quantity_needed, promised: item.quantity_committed, received: item.quantity_received, remaining: item.quantity_remaining })"></p>
              <template x-if="activeOfferFor(item)">
                <p class="text-sm text-muted" x-text="$t('needs.youOffered', { count: activeOfferFor(item).quantity, status: statusInfo(activeOfferFor(item).status, 'offer').label })"></p>
              </template>
              <template x-if="item.quantity_remaining > 0 && !activeOfferFor(item) && offerItemId !== item.id && viewerReady">
                <div>
                  <a class="btn btn-primary" x-show="donorMode() === 'visitor'" :href="loginHref(item)"
                    :aria-label="$t('common.offerItem', { item: item.name })" data-i18n="common.offer">Offer</a>
                  <button type="button" class="btn btn-primary" x-show="donorMode() === 'donor'" @click="openOffer(item)"
                    :aria-label="$t('common.offerItem', { item: item.name })" data-i18n="common.offer">Offer</button>
                </div>
              </template>

              <form class="space-y-4 rounded-md bg-canvas p-4" novalidate x-show="offerItemId === item.id" x-cloak
                @submit.prevent="sendOffer(item)" :aria-label="$t('common.offerItem', { item: item.name })">
                <div>
                  <label :for="'offer-qty-' + item.id" class="label" data-i18n="needs.howMany">How many?</label>
                  <div class="stepper">
                    <button type="button" class="stepper-btn" @click="stepNumber($el, -1)" aria-label="Decrease" data-i18n-attr="aria-label:common.decrease">
                      <i class="ph ph-minus" aria-hidden="true"></i>
                    </button>
                    <input :id="'offer-qty-' + item.id" class="input" type="number" inputmode="numeric" step="1" min="1" :max="item.quantity_remaining"
                      x-model.number="offerForm.quantity" :aria-invalid="offerErrors.quantity ? 'true' : null"
                      :aria-describedby="'offer-qty-help-' + item.id + ' offer-qty-err-' + item.id" />
                    <button type="button" class="stepper-btn" @click="stepNumber($el, 1)" aria-label="Increase" data-i18n-attr="aria-label:common.increase">
                      <i class="ph ph-plus" aria-hidden="true"></i>
                    </button>
                  </div>
                  <p :id="'offer-qty-help-' + item.id" class="helper-text" x-text="$t('needs.upTo', { count: item.quantity_remaining, unit: item.unit })"></p>
                  <p :id="'offer-qty-err-' + item.id" class="field-error" x-show="offerErrors.quantity" x-text="offerErrors.quantity"></p>
                </div>
                <div>
                  <label :for="'offer-msg-' + item.id" class="label"><span data-i18n="needs.message">Message to the organization</span> <span class="optional" data-i18n="common.optional">(optional)</span></label>
                  <textarea :id="'offer-msg-' + item.id" class="input input-ruled" rows="3" maxlength="500" x-model="offerForm.message"
                    placeholder="e.g. I can drop it off on Saturday morning." data-i18n-attr="placeholder:needs.messagePlaceholder"
                    :aria-invalid="offerErrors.message ? 'true' : null" :aria-describedby="'offer-msg-count-' + item.id + ' offer-msg-err-' + item.id"></textarea>
                  <p :id="'offer-msg-count-' + item.id" class="counter" :class="offerForm.message.length >= 500 ? 'counter-limit' : ''" x-text="offerForm.message.length + ' / 500'"></p>
                  <p :id="'offer-msg-err-' + item.id" class="field-error" x-show="offerErrors.message" x-text="offerErrors.message"></p>
                </div>
                <template x-if="item.category === 'food'">
                  <div>
                    <label class="flex items-start gap-3">
                      <input :id="'offer-food-' + item.id" type="checkbox" x-model="offerForm.foodSafetyConfirmed"
                        :aria-invalid="offerErrors.foodSafety ? 'true' : null" :aria-describedby="'offer-food-err-' + item.id" />
                      <span><span data-i18n="needs.foodConfirm">Items are sealed, unopened and not past their expiry date.</span>
                        <span class="block text-sm text-muted" data-i18n="needs.foodNote">Cooked or home-made food can't be accepted.</span></span>
                    </label>
                    <p :id="'offer-food-err-' + item.id" class="field-error ml-9" x-show="offerErrors.foodSafety" x-text="offerErrors.foodSafety"></p>
                  </div>
                </template>
                <p class="helper-text mt-0" x-show="item.category === 'clothing'" data-i18n="needs.clothingNote">Clothing should be clean and in usable condition.</p>
                <div role="alert">
                  <p class="note-danger" x-show="offerError" x-text="offerError"></p>
                </div>
                <div class="flex flex-wrap gap-3">
                  <button type="submit" class="btn btn-primary" :disabled="sending">
                    <span class="spinner" x-show="sending" aria-hidden="true"></span>
                    <span x-text="sending ? $t('common.sending') : offerButtonText(item)"></span>
                  </button>
                  <button type="button" class="btn btn-secondary" @click="closeOffer()" :disabled="sending" data-i18n="common.cancel">Cancel</button>
                </div>
              </form>
            </li>
          </template>
        </ul>
      </section>

      <div class="flex flex-wrap gap-3" x-show="viewerReady">
        <template x-if="messageMode(viewer) === 'visitor'">
          <a class="btn btn-secondary" :href="messageLoginHref()"><i class="ph ph-chat-circle" aria-hidden="true"></i><span data-i18n="messages.messageOrg">Message organization</span></a>
        </template>
        <template x-if="messageMode(viewer) === 'person'">
          <button type="button" class="btn btn-secondary" :disabled="messaging"
            @click="messageOrg(request.organization_id, $t('messages.topicAbout', { title: request.title }))">
            <i class="ph ph-chat-circle" aria-hidden="true"></i><span data-i18n="messages.messageOrg">Message organization</span>
          </button>
        </template>
        <a class="btn btn-quiet" x-show="ownsContent(request.organization_id)" href="/organization.html#requests" data-i18n="common.manageOwn">Your organization · Manage</a>
        <a class="btn btn-quiet" x-show="isAdmin()" href="/admin.html#browse/requests?view=active" data-i18n="common.openInAdmin">Open in admin</a>
      </div>
    </div>
  </template>
</dialog>`;

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("requestPanel", () => ({
    ...publicViewer(),
    ...messageButtons(),
    requestUrgency,
    scoreDetails,
    factorLabel,
    itemBarLabel,
    noticeEnds,
    categoryIcon,
    statusInfo,
    /** @type {DonationRequest | null} */
    request: null,
    /** @type {DonationOffer[]} this donor's active offers */
    myOffers: [],
    /** @type {string | null} the item whose offer form is open */
    offerItemId: null,
    /** @type {OfferForm} */
    offerForm: { quantity: "", message: "", foodSafetyConfirmed: false },
    /** @type {OfferErrors} */
    offerErrors: {},
    offerError: "",
    sending: false,

    init() {
      window.addEventListener("open-request", (event) => this.show(/** @type {CustomEvent} */ (event).detail));
    },

    /** @param {{ request: DonationRequest, opener: EventTarget | null, itemId: string | null }} detail */
    async show({ request, opener, itemId }) {
      this.request = request;
      this.offerItemId = null;
      openSidePanel("request-panel", opener);
      if (!this.viewerReady) await this.loadViewer();
      await this.loadMyOffers();
      const item = itemId ? request.request_items.find((i) => i.id === itemId) : null;
      if (!item) return;
      if (this.donorMode() === "donor" && item.quantity_remaining > 0 && !this.activeOfferFor(item)) this.openOffer(item);
      setTimeout(() => document.getElementById(`panel-item-${item.id}`)?.scrollIntoView({ block: "center" }), 50);
    },

    async loadMyOffers() {
      if (this.donorMode() !== "donor") return;
      const profile = await getProfile().catch(() => null);
      this.myOffers = profile ? await listMyOffers(profile.id).catch(() => []) : [];
    },

    /** @param {RequestItem} item */
    itemPercent(item) {
      const whole = Math.max(item.quantity_needed, 1);
      const received = Math.round((Math.min(item.quantity_received, whole) / whole) * 100);
      const covered = Math.round((Math.min(item.quantity_committed, whole) / whole) * 100);
      return { received, promised: Math.max(0, covered - received) };
    },

    /**
     * Visitors log in first and come back to this item on Browse needs, with its form open.
     * @param {RequestItem} item
     */
    loginHref(item) {
      return `/login.html?next=${encodeURIComponent(`/needs.html?item=${item.id}`)}`;
    },

    /** @param {RequestItem} item */
    activeOfferFor(item) {
      return this.myOffers.find((offer) => offer.request_item_id === item.id && isActiveOffer(offer));
    },

    /**
     * The send button says exactly what happens: "Offer 8 bags".
     * @param {RequestItem} item
     */
    offerButtonText(item) {
      const count = Number(this.offerForm.quantity);
      return Number.isInteger(count) && count > 0 ? t("needs.offerCount", { count, unit: item.unit }) : t("needs.sendOffer");
    },

    /** @param {RequestItem} item */
    openOffer(item) {
      this.offerItemId = item.id;
      this.offerForm = { quantity: "", message: "", foodSafetyConfirmed: false };
      this.offerErrors = {};
      this.offerError = "";
      setTimeout(() => document.getElementById(`offer-qty-${item.id}`)?.focus({ preventScroll: true }), 60);
    },

    closeOffer() {
      this.offerItemId = null;
    },

    /** @param {RequestItem} item */
    async sendOffer(item) {
      this.offerError = "";
      this.offerErrors = validateOffer(this.offerForm, item);
      const firstError = Object.keys(this.offerErrors)[0];
      if (firstError) {
        const ids = { quantity: "offer-qty", message: "offer-msg", foodSafety: "offer-food" };
        document.getElementById(`${ids[/** @type {keyof typeof ids} */ (firstError)]}-${item.id}`)?.focus();
        return;
      }
      this.sending = true;
      try {
        await makeOffer(item.id, this.offerForm);
        toast(t("needs.offerSent"));
        this.offerItemId = null;
        const fresh = this.request ? await getOpenRequest({ requestId: this.request.id }).catch(() => null) : null;
        if (fresh) this.request = fresh;
        await this.loadMyOffers();
        window.dispatchEvent(new CustomEvent("offer-sent", { detail: { itemId: item.id } }));
      } catch (error) {
        this.offerError = friendlyError(error);
      } finally {
        this.sending = false;
      }
    },

    async turnOnDonating() {
      await this.turnOn("donor");
      await this.loadMyOffers();
    },
  }));
});

// Add the panel to the page (once, on every page that loads this file).
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("request-panel")) return;
  const holder = document.createElement("div");
  holder.innerHTML = REQUEST_PANEL_MARKUP; // static markup only — no user or database text
  document.body.append(...holder.children);
});
