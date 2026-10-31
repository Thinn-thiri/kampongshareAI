// @ts-check
// Sharing approved events (REQUIREMENTS.md section 5): share links, the editable message, a poster
// image for Instagram, copy caption, and the "AI-suggested" caption. We never auto-post anywhere.
// Shared links only contain the event id: https://<site>/e/<id>

/**
 * @typedef {{ id: string, title: string, starts_at: string, ends_at?: string | null, location_name?: string | null, volunteers_needed?: number | null }} ShareableEvent
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
// The poster is an image people download, so it uses the fixed light palette (DESIGN.md 12).
const POSTER_COLORS = {
  paper: "#fffdf7",
  primary: "#1e6b47",
  ink: "#2b211b",
  muted: "#6b5d52",
  accent: "#f2b705", // marigold: the one pin only, never text
};

/** The QR code library, loaded only when someone downloads a poster. */
const QR_SCRIPT = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";

/** @returns {Promise<any>} the qrcode() function */
function loadQrCode() {
  const existing = /** @type {any} */ (window).qrcode;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = QR_SCRIPT;
    script.onload = () => resolve(/** @type {any} */ (window).qrcode);
    script.onerror = () => reject(new Error("QR code library didn't load")); // i18n-ignore (shown through friendlyError)
    document.head.append(script);
  });
}

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
 * Makes a 1080×1350 poster PNG for Instagram and downloads it (DESIGN.md 12): paper background, one marigold
 * pin, the title, when and where, one line of what's needed, a QR code to the event's share link (Instagram
 * links aren't clickable) and the organization. In the language the person is using.
 * @param {ShareableEvent} event
 * @param {string} orgName
 * @returns {Promise<void>}
 */
async function downloadPoster(event, orgName) {
  const W = 1080;
  const H = 1350;
  const M = 96; // generous margins, left-aligned
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  // i18n-ignore-start (font names and canvas font strings)
  const display = '"Fraunces", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", serif';
  const font = '"Lexend", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';
  // i18n-ignore-end
  const [qrcode] = await Promise.all([
    loadQrCode(),
    Promise.all([document.fonts.load(`700 96px ${display}`), document.fonts.load(`700 44px ${font}`), document.fonts.load(`400 44px ${font}`)]).catch(() => null),
  ]);
  const { paper, primary, ink, muted, accent } = POSTER_COLORS;
  const link = shareLink(event.id);

  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);

  // the marigold pin, top left
  ctx.save();
  ctx.shadowColor = "rgba(43, 33, 27, 0.3)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(M + 22, M + 22, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // the title: 96px, shrinking to 72px before it wraps (two lines at most, never cut off mid-word)
  let size = 96;
  const titleFont = () => `700 ${size}px ${display}`; // i18n-ignore
  ctx.font = titleFont();
  while (ctx.measureText(event.title).width > W - 2 * M && size > 72) {
    size -= 4;
    ctx.font = titleFont();
  }
  ctx.fillStyle = ink;
  ctx.textBaseline = "alphabetic";
  let y = M + 80 + size;
  for (const line of wrapLines(ctx, event.title, W - 2 * M, 3)) {
    ctx.fillText(line, M, y);
    y += size * 1.1;
  }

  // when and where
  y += 40;
  ctx.font = `700 44px ${font}`;
  for (const line of wrapLines(ctx, formatEventTime(event.starts_at, event.ends_at), W - 2 * M, 2)) {
    ctx.fillText(line, M, y);
    y += 58;
  }
  ctx.font = `400 44px ${font}`;
  for (const line of wrapLines(ctx, event.location_name ?? "", W - 2 * M, 2)) {
    ctx.fillText(line, M, y);
    y += 58;
  }

  // one line of what's needed, in green
  if (event.volunteers_needed) {
    y += 40;
    ctx.fillStyle = primary;
    ctx.font = `400 40px ${font}`;
    for (const line of wrapLines(ctx, t("share.posterNeed", { count: event.volunteers_needed }), W - 2 * M, 2)) {
      ctx.fillText(line, M, y);
      y += 54;
    }
  }

  // the QR code (280px) and "Scan to join or donate"
  const qr = qrcode(0, "M");
  qr.addData(link);
  qr.make();
  const count = qr.getModuleCount();
  const cell = Math.floor(280 / count);
  const qrSize = cell * count;
  const qrTop = H - M - 150 - qrSize;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(M - 12, qrTop - 12, qrSize + 24, qrSize + 24);
  ctx.fillStyle = ink;
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) ctx.fillRect(M + col * cell, qrTop + row * cell, cell, cell);
    }
  }
  ctx.font = `700 40px ${font}`;
  let scanY = qrTop + qrSize / 2 - 10;
  for (const line of wrapLines(ctx, t("share.posterScan"), W - 2 * M - qrSize - 48, 2)) {
    ctx.fillText(line, M + qrSize + 48, scanY);
    scanY += 52;
  }

  // the organization, then "on KampongShare"
  ctx.fillStyle = ink;
  ctx.font = `700 32px ${font}`;
  ctx.fillText(wrapLines(ctx, orgName, W - 2 * M, 1)[0] ?? "", M, H - M - 50);
  ctx.fillStyle = muted;
  ctx.font = `400 28px ${font}`;
  ctx.fillText(t("share.posterOn"), M, H - M);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not make the poster"); // i18n-ignore (a developer error)
  const download = document.createElement("a");
  download.href = URL.createObjectURL(blob);
  download.download = "kampongshare-event.png";
  document.body.append(download);
  download.click();
  download.remove();
  setTimeout(() => URL.revokeObjectURL(download.href), 5000);
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
