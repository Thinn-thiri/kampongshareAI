// @ts-check
// Sharing approved events (REQUIREMENTS.md section 5): share links, the editable message, a poster
// image for Instagram, copy caption, and the "AI-suggested" caption. We never auto-post anywhere.
// Shared links only contain the event id: https://<site>/e/<id>

/**
 * @typedef {{ id: string, title: string, starts_at: string, ends_at?: string | null, location_name?: string | null }} ShareableEvent
 */

/**
 * The short link that shows a preview in WhatsApp / Facebook (served by the share-event function).
 * @param {string} eventId
 * @returns {string}
 */
function shareLink(eventId) {
  return `${location.origin}/e/${encodeURIComponent(eventId)}`;
}

/**
 * The ready-made message (REQUIREMENTS.md 5.3), editable before sharing.
 * @param {ShareableEvent} event
 * @param {string} orgName
 * @returns {string}
 */
function messageTemplate(event, orgName) {
  const link = shareLink(event.id);
  // in the chosen language; the event's own title and place stay as the organization wrote them
  return [
    t("share.templateTitle", { title: event.title, org: orgName }),
    t("share.templateWhen", { when: formatEventTime(event.starts_at, event.ends_at), place: event.location_name ?? t("share.singapore") }),
    t("share.templateDonate", { link }),
    t("share.templateVolunteer", { link }),
  ].join("\n");
}

/**
 * @param {string} text
 * @returns {string}
 */
function whatsappHref(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * Facebook ignores pre-filled text; the preview comes from the share-event page.
 * @param {string} link
 * @returns {string}
 */
function facebookHref(link) {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`;
}

/**
 * Copies text to the clipboard (with a fallback for older browsers).
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/**
 * Poster colours: downloads and prints are always light, whatever theme the page is in.
 * Same values as the light theme in src/input.css.
 */
const POSTER_COLORS = {
  primary: "#0f766e",
  soft: "#ccfbf1",
  ink: "#0f172a",
  muted: "#64748b",
  accent: "#f59e0b",
  paper: "#ffffff",
};

/**
 * Splits text into lines that fit the given width.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} maxLines
 * @returns {string[]}
 */
function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  /** @type {string[]} */
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s+\S*$/, "")}…`;
    return kept;
  }
  return lines;
}

/**
 * Makes a 1080×1350 poster PNG for Instagram and downloads it (REQUIREMENTS.md 5.3).
 * Instagram captions can't hold clickable links, so the short link is printed on the poster.
 * @param {ShareableEvent} event
 * @param {string} orgName
 * @returns {Promise<void>}
 */
async function downloadPoster(event, orgName) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  // i18n-ignore-start — the poster is a downloaded image and always uses English
  const font = '"Plus Jakarta Sans", system-ui, sans-serif';
  try {
    await document.fonts.load(`700 64px ${font}`);
  } catch {
    // system font fallback is fine
  }
  const { primary, soft, ink, muted, accent, paper } = POSTER_COLORS;

  // Background and header band
  ctx.fillStyle = soft;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, W, 260);

  // Logo: white rounded square with "K"
  ctx.fillStyle = paper;
  ctx.beginPath();
  ctx.roundRect(80, 80, 100, 100, 24);
  ctx.fill();
  ctx.fillStyle = primary;
  ctx.font = `700 64px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("K", 130, 134);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = paper;
  ctx.font = `700 52px ${font}`;
  ctx.fillText("KampongShare", 210, 148);

  // Card
  ctx.fillStyle = paper;
  ctx.beginPath();
  ctx.roundRect(60, 320, W - 120, 860, 40);
  ctx.fill();

  let y = 430;
  ctx.fillStyle = accent;
  ctx.font = `700 34px ${font}`;
  ctx.fillText("VOLUNTEER & DONATE", 120, y);

  ctx.fillStyle = ink;
  ctx.font = `700 76px ${font}`;
  y += 100;
  for (const line of wrapLines(ctx, event.title, W - 240, 4)) {
    ctx.fillText(line, 120, y);
    y += 92;
  }

  ctx.font = `600 40px ${font}`;
  ctx.fillStyle = primary;
  y += 30;
  for (const line of wrapLines(ctx, `by ${orgName}`, W - 240, 2)) {
    ctx.fillText(line, 120, y);
    y += 54;
  }

  ctx.font = `500 40px ${font}`;
  ctx.fillStyle = ink;
  y += 30;
  for (const line of wrapLines(ctx, formatEventTime(event.starts_at, event.ends_at, "en"), W - 240, 2)) {
    ctx.fillText(line, 120, y);
    y += 54;
  }
  ctx.fillStyle = muted;
  for (const line of wrapLines(ctx, event.location_name ?? "Singapore", W - 240, 2)) {
    ctx.fillText(line, 120, y);
    y += 54;
  }

  // Short link inside the card: shrink the text until it fits (links can be long), wrap as a last resort
  const linkText = shareLink(event.id).replace(/^https?:\/\//, "");
  const linkWidth = W - 240;
  let size = 44;
  ctx.font = `700 ${size}px ${font}`;
  while (ctx.measureText(linkText).width > linkWidth && size > 26) {
    size -= 2;
    ctx.font = `700 ${size}px ${font}`;
  }
  const linkLines = ctx.measureText(linkText).width > linkWidth ? [linkText.slice(0, Math.ceil(linkText.length / 2)), linkText.slice(Math.ceil(linkText.length / 2))] : [linkText];
  let linkY = 1150 - (linkLines.length - 1) * (size + 10);
  ctx.fillStyle = muted;
  ctx.font = `600 32px ${font}`;
  ctx.fillText("Donate or volunteer at", 120, linkY - size - 22);
  ctx.fillStyle = primary;
  ctx.font = `700 ${size}px ${font}`;
  for (const line of linkLines) {
    ctx.fillText(line, 120, linkY);
    linkY += size + 10;
  }

  ctx.fillStyle = ink;
  ctx.font = `500 30px ${font}`;
  ctx.textAlign = "center";
  ctx.fillText("Open the link to donate or sign up to volunteer", W / 2, 1270);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not make the poster");
  // i18n-ignore-end
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "kampongshare-event.png";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
}

/**
 * Asks the event-caption function for an AI-suggested caption (the event's organization only).
 * @param {string} eventId
 * @returns {Promise<string | null>} null when the AI isn't available (use the template instead)
 */
async function fetchCaption(eventId) {
  try {
    const {
      data: { session },
    } = await db().auth.getSession();
    if (!session) return null;
    const response = await fetch("/api/event-caption", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ eventId }),
    });
    if (!response.ok) return null;
    const body = await response.json();
    return typeof body.caption === "string" && body.caption ? body.caption : null;
  } catch {
    return null;
  }
}

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data(
    "sharePanel",
    (/** @type {ShareableEvent} */ event, /** @type {string} */ orgName, /** @type {boolean} */ canUseAi) => ({
      link: shareLink(event.id),
      message: messageTemplate(event, orgName),
      caption: messageTemplate(event, orgName),
      captionIsAi: false,
      loadingCaption: false,
      makingPoster: false,
      canUseAi,
      canNativeShare: typeof navigator.share === "function",

      get whatsapp() {
        return whatsappHref(this.message);
      },

      get facebook() {
        return facebookHref(this.link);
      },

      async nativeShare() {
        try {
          await navigator.share({ title: event.title, text: this.message, url: this.link });
        } catch {
          // the person closed the share sheet
        }
      },

      async copyLink() {
        toast((await copyText(this.link)) ? t("share.linkCopied") : t("share.copyFailed"), "success");
      },

      async copyCaption() {
        const text = this.captionIsAi ? `${this.caption}\n\n${this.link}` : this.caption;
        toast((await copyText(text)) ? t("share.captionCopied") : t("share.copyFailed"));
      },

      async poster() {
        this.makingPoster = true;
        try {
          await downloadPoster(event, orgName);
          toast(t("share.posterDone"));
        } catch {
          toast(t("share.posterFailed"), "error");
        } finally {
          this.makingPoster = false;
        }
      },

      async writeCaption() {
        this.loadingCaption = true;
        const caption = await fetchCaption(event.id);
        this.loadingCaption = false;
        if (caption) {
          this.caption = caption;
          this.captionIsAi = true;
        } else {
          this.caption = messageTemplate(event, orgName);
          this.captionIsAi = false;
          toast(t("share.captionFailed"), "error");
        }
      },
    }),
  );
});
