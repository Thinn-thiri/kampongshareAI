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
 * One short line of requirements under a notice's "still needed" line, only when they exist:
 * "24–28 cm · Like new or better" (one item), or "Cooking pot: 24–28 cm · …" (the first item with any).
 * @param {DonationRequest} request
 * @returns {string} "" when no item has a size, material or condition
 */
function noticeSpec(request) {
  const items = (request.request_items ?? []).filter((item) => item.quantity_remaining > 0);
  const item = items.find((i) => itemSpecLine(i));
  if (!item) return "";
  return items.length === 1 ? itemSpecLine(item) : t("requests.noticeSpecNamed", { item: item.name, spec: itemSpecLine(item) });
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
 * @param {number | null} [quantity] fill in "How many?" (from Pinny's draft)
 */
function openRequestPanel(request, opener = null, itemId = null, quantity = null) {
  window.dispatchEvent(new CustomEvent("open-request", { detail: { request, opener, itemId, quantity } }));
}

/**
 * What pages with notices spread into their Alpine component.
 * @returns {Record<string, any>}
 */
function noticeHelpers() {
  return {
    noticeCategory,
    noticeNeed,
    noticeSpec,
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
      <!-- small supporting facts first; the items below are what people come for -->
      <div class="space-y-2 text-sm text-muted">
        <p class="break-words">
          <a class="link" :href="'/org.html?id=' + request.organization_id" x-text="request.organization?.name || $t('common.organization')"></a>
          <span aria-hidden="true">·</span>
          <span x-text="noticeEnds(request)"></span>
        </p>
        <p class="break-words" x-show="request.organization?.address" x-text="request.organization?.address"></p>
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span class="badge-sm" :class="requestUrgency(request).className" x-text="requestUrgency(request).label"></span>
          <span class="badge badge-ai badge-sm" x-show="requestUrgency(request).scored" data-i18n="common.aiSuggested">AI-suggested</span>
          <template x-if="scoreDetails(request)">
            <button type="button" class="btn btn-quiet min-h-11 px-1 text-sm font-normal" :aria-expanded="whyOpen.toString()" aria-controls="request-panel-why" @click="whyOpen = !whyOpen"
              x-text="whyOpen ? $t('requests.hideWhy') : $t('requests.whyScore')"></button>
          </template>
        </div>
        <template x-if="scoreDetails(request)">
          <div id="request-panel-why" class="note space-y-2 text-ink" x-show="whyOpen" x-cloak>
            <p x-text="scoreDetails(request).explanation"></p>
            <ul class="space-y-1" x-show="scoreDetails(request).factors.length">
              <template x-for="factor in scoreDetails(request).factors" :key="factor.key">
                <li class="flex justify-between gap-3"><span x-text="factorLabel(factor)"></span><span class="shrink-0 tabular-nums" x-text="$t('requests.factorPoints', { points: factor.points, max: factor.max })"></span></li>
              </template>
            </ul>
            <p class="text-muted" data-i18n="requests.formulaNote">The number comes from a fixed formula. People always make the decisions.</p>
          </div>
        </template>
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
        <h3 id="request-panel-items" class="section-title" data-i18n="requests.whatsNeeded">What's needed</h3>
        <ul class="space-y-3">
          <template x-for="item in request.request_items" :key="item.id">
            <li :id="'panel-item-' + item.id" class="flex scroll-mt-24 flex-col gap-3 rounded-lg border-[1.5px] border-edge p-4">
              <p class="flex items-center gap-2 font-bold break-words">
                <i class="size-7" :class="categoryIcon(item.category)" aria-hidden="true"></i>
                <span x-text="item.name"></span>
              </p>
              <!-- exactly what's needed, before anyone offers (the organization's own words via x-text) -->
              <dl class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm" x-show="item.size_spec || item.material || needsCondition(item) || item.item_details || item.details_required">
                <template x-if="item.size_spec">
                  <div class="contents"><dt class="text-muted" data-i18n="requests.specSize">Size</dt><dd class="break-words" x-text="item.size_spec"></dd></div>
                </template>
                <template x-if="item.material">
                  <div class="contents"><dt class="text-muted" data-i18n="requests.specMaterial">Material</dt><dd class="break-words" x-text="item.material"></dd></div>
                </template>
                <template x-if="needsCondition(item)">
                  <div class="contents"><dt class="text-muted" data-i18n="requests.specCondition">Condition</dt><dd x-text="enumLabel('minCondition', item.min_condition)"></dd></div>
                </template>
                <template x-if="item.item_details">
                  <div class="contents"><dt class="text-muted" data-i18n="requests.specDetails">Details</dt><dd class="whitespace-pre-line break-words" x-text="item.item_details"></dd></div>
                </template>
                <template x-if="item.details_required">
                  <div class="contents"><dt class="sr-only" data-i18n="requests.specDescribe">Description</dt><dd class="col-span-2 text-muted" data-i18n="requests.specDescribeNote">Donors describe their item when offering.</dd></div>
                </template>
              </dl>
              <div class="need-bar" role="img" :aria-label="itemBarLabel(item)">
                <span class="need-bar-received" :style="'width:' + itemPercent(item).received + '%'"></span>
                <span class="need-bar-promised" :style="'width:' + itemPercent(item).promised + '%'"></span>
              </div>
              <p class="text-[0.9375rem] leading-5 font-bold tabular-nums" x-text="item.quantity_remaining > 0 ? $t('requests.noticeOne', { remaining: item.quantity_remaining, needed: item.quantity_needed, unit: item.unit }) : $t('requests.noticeAllPromised')"></p>
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

              <form class="white-fields space-y-4 rounded-md bg-canvas p-4" novalidate x-show="offerItemId === item.id" x-cloak
                @submit.prevent="sendOffer(item)" :aria-label="$t('common.offerItem', { item: item.name })">
                <div>
                  <!-- "How many?" with the stepper beside it -->
                  <div class="flex items-center justify-between gap-3">
                    <label :for="'offer-qty-' + item.id" class="label mb-0" data-i18n="needs.howMany">How many?</label>
                    <div class="stepper stepper-sm shrink-0">
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
                  </div>
                  <p :id="'offer-qty-help-' + item.id" class="helper-text" x-text="$t('needs.upTo', { count: item.quantity_remaining, unit: item.unit })"></p>
                  <p :id="'offer-qty-err-' + item.id" class="field-error" x-show="offerErrors.quantity" x-text="offerErrors.quantity"></p>
                </div>
                <div>
                  <label :for="'offer-msg-' + item.id" class="label"><span data-i18n="needs.message">Message to the organization</span> <span class="optional" data-i18n="common.optional">(optional)</span></label>
                  <textarea :id="'offer-msg-' + item.id" class="input input-oneline block" rows="1" maxlength="500" x-model="offerForm.message"
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
                      <span class="pt-0.5 text-[0.9375rem] leading-5"><span data-i18n="needs.foodConfirm">Items are sealed, unopened and not past their expiry date.</span>
                        <span class="mt-1 block text-[0.875rem] leading-5 text-muted" data-i18n="needs.foodNote">Cooked or home-made food can't be accepted.</span></span>
                    </label>
                    <p :id="'offer-food-err-' + item.id" class="field-error ml-9" x-show="offerErrors.foodSafety" x-text="offerErrors.foodSafety"></p>
                  </div>
                </template>
                <p class="helper-text mt-0" x-show="item.category === 'clothing'" data-i18n="needs.clothingNote">Clothing should be clean and in usable condition.</p>
                <!-- the condition: only the choices that meet the item's minimum -->
                <template x-if="needsCondition(item)">
                  <fieldset :aria-describedby="'offer-cond-err-' + item.id">
                    <legend class="label" data-i18n="needs.conditionQuestion">What condition is it in?</legend>
                    <div class="flex flex-wrap gap-2" :id="'offer-cond-' + item.id" tabindex="-1">
                      <template x-for="condition in conditionsMeeting(item.min_condition)" :key="condition">
                        <label class="check-pill">
                          <input type="radio" :name="'offer-cond-' + item.id" :value="condition" x-model="offerForm.condition" />
                          <span x-text="enumLabel('condition', condition)"></span>
                        </label>
                      </template>
                    </div>
                    <p :id="'offer-cond-err-' + item.id" class="field-error" x-show="offerErrors.condition" x-text="offerErrors.condition"></p>
                  </fieldset>
                </template>
                <div>
                  <label :for="'offer-details-' + item.id" class="label">
                    <span data-i18n="needs.describeLabel">Describe your item</span>
                    <span class="optional" x-show="!item.details_required" data-i18n="common.optional">(optional)</span>
                  </label>
                  <textarea :id="'offer-details-' + item.id" class="input input-oneline block" rows="1" maxlength="300" x-model="offerForm.details"
                    placeholder="e.g. 26 cm stainless steel pot with lid, used twice" data-i18n-attr="placeholder:needs.describePlaceholder"
                    :aria-invalid="offerErrors.details ? 'true' : null" :aria-describedby="'offer-details-hint-' + item.id + ' offer-details-count-' + item.id + ' offer-details-err-' + item.id"></textarea>
                  <p :id="'offer-details-hint-' + item.id" class="helper-text" x-text="describeHint(item)"></p>
                  <p :id="'offer-details-count-' + item.id" class="counter" :class="offerForm.details.length >= 300 ? 'counter-limit' : ''" x-text="offerForm.details.length + ' / 300'"></p>
                  <p :id="'offer-details-err-' + item.id" class="field-error" x-show="offerErrors.details" x-text="offerErrors.details"></p>
                </div>
                <!-- 1–3 photos of the actual item; location data is removed before upload (js/offer-photos.js) -->
                <div x-data="photoPicker" x-ref="photos" @photos-changed="offerForm.photos = $event.detail.photos" @offer-reset.window="clear()">
                  <p class="label" :id="'offer-photos-label-' + item.id" data-i18n="photos.label">Photos of your item</p>
                  <div class="flex flex-wrap items-center gap-2">
                    <template x-for="photo in photos" :key="photo.key">
                      <div class="relative">
                        <img :src="photo.preview" alt="" class="size-20 rounded-md border-[1.5px] border-edge object-cover" />
                        <button type="button" class="icon-btn absolute -top-2 -right-2 size-8 min-h-0 bg-surface" @click="remove(photo.key)"
                          :aria-label="$t('photos.remove')"><i class="ph ph-x" aria-hidden="true"></i></button>
                      </div>
                    </template>
                    <label class="btn btn-secondary btn-sm cursor-pointer" x-show="photos.length < max" :class="busy ? 'opacity-50' : ''">
                      <i class="ph ph-camera" aria-hidden="true"></i>
                      <span x-text="photos.length ? $t('photos.addMore') : $t('photos.add')"></span>
                      <input :id="'offer-photos-' + item.id" type="file" class="sr-only" accept="image/jpeg,image/png,image/webp" multiple
                        :disabled="busy" @change="pick($event)"
                        :aria-describedby="'offer-photos-label-' + item.id + ' offer-photos-help-' + item.id + ' offer-photos-err-' + item.id" />
                    </label>
                  </div>
                  <p :id="'offer-photos-help-' + item.id" class="helper-text" data-i18n="photos.help">1–3 photos. Location data is removed. Only this organization can see them.</p>
                  <p :id="'offer-photos-err-' + item.id" class="field-error" x-show="error || offerErrors.photos" x-text="error || offerErrors.photos"></p>
                </div>
                <!-- what will be sent, in one sentence -->
                <p class="note text-[0.9375rem] leading-5" x-show="offerSummary(offerForm, item)" x-text="offerSummary(offerForm, item)" aria-live="polite"></p>
                <div role="alert">
                  <p class="note-danger" x-show="offerError" x-text="offerError"></p>
                </div>
                <div class="flex flex-wrap gap-3">
                  <button type="submit" class="btn btn-primary btn-sm" :disabled="sending">
                    <span class="spinner" x-show="sending" aria-hidden="true"></span>
                    <span x-text="sending ? $t('common.sending') : offerButtonText(item)"></span>
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" @click="closeOffer()" :disabled="sending" data-i18n="common.cancel">Cancel</button>
                </div>
              </form>
            </li>
          </template>
        </ul>
      </section>

      <!-- about this request: the organization's own words and where to drop off, in smaller text -->
      <div class="space-y-3 text-sm" x-show="request.description || request.dropoff_instructions">
        <p class="whitespace-pre-line break-words text-muted" x-show="request.description" x-text="request.description"></p>
        <div class="note text-[0.875rem] leading-5" x-show="request.dropoff_instructions">
          <p class="font-bold" data-i18n="requests.dropoff">Drop-off</p>
          <p class="mt-1 whitespace-pre-line break-words" x-text="request.dropoff_instructions"></p>
        </div>
      </div>

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
    needsCondition,
    conditionsMeeting,
    enumLabel,
    offerSummary,
    /** @type {DonationRequest | null} */
    request: null,
    whyOpen: false,
    /** @type {DonationOffer[]} this donor's active offers */
    myOffers: [],
    /** @type {string | null} the item whose offer form is open */
    offerItemId: null,
    /** @type {OfferForm} */
    offerForm: emptyOfferForm(),
    /** @type {OfferErrors} */
    offerErrors: {},
    offerError: "",
    sending: false,

    init() {
      window.addEventListener("open-request", (event) => this.show(/** @type {CustomEvent} */ (event).detail));
    },

    /** @param {{ request: DonationRequest, opener: EventTarget | null, itemId: string | null, quantity?: number | null }} detail */
    async show({ request, opener, itemId, quantity = null }) {
      this.request = request;
      this.offerItemId = null;
      this.whyOpen = false;
      openSidePanel("request-panel", opener);
      if (!this.viewerReady) await this.loadViewer();
      await this.loadMyOffers();
      const item = itemId ? request.request_items.find((i) => i.id === itemId) : null;
      if (!item) return;
      if (this.donorMode() === "donor" && item.quantity_remaining > 0 && !this.activeOfferFor(item)) {
        this.openOffer(item);
        // from Pinny's draft: the amount it prepared (never more than what's left)
        if (quantity && quantity > 0) this.offerForm.quantity = Math.min(quantity, item.quantity_remaining);
      }
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

    /**
     * The hint under "Describe your item", built from what the organization asked for:
     * "Include the size (needed: 24–28 cm) and anything else that helps."
     * @param {RequestItem} item
     */
    describeHint(item) {
      return item.size_spec ? t("needs.describeHintSize", { size: item.size_spec }) : t("needs.describeHint");
    },

    /** @param {RequestItem} item */
    openOffer(item) {
      this.offerItemId = item.id;
      this.offerForm = emptyOfferForm();
      window.dispatchEvent(new CustomEvent("offer-reset"));
      this.offerErrors = {};
      this.offerError = "";
      setTimeout(() => document.getElementById(`offer-qty-${item.id}`)?.focus({ preventScroll: true }), 60);
    },

    closeOffer() {
      this.offerItemId = null;
      window.dispatchEvent(new CustomEvent("offer-reset"));
    },

    /** @param {RequestItem} item */
    async sendOffer(item) {
      this.offerError = "";
      this.offerErrors = validateOffer(this.offerForm, item);
      const firstError = Object.keys(this.offerErrors)[0];
      if (firstError) {
        const ids = { quantity: "offer-qty", message: "offer-msg", foodSafety: "offer-food", condition: "offer-cond", details: "offer-details", photos: "offer-photos" };
        document.getElementById(`${ids[/** @type {keyof typeof ids} */ (firstError)]}-${item.id}`)?.focus();
        return;
      }
      this.sending = true;
      try {
        await makeOffer(item.id, this.offerForm);
        toast(t("needs.offerSent"));
        this.offerItemId = null;
        window.dispatchEvent(new CustomEvent("offer-reset"));
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
