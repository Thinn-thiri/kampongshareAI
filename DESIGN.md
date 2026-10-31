# KampongShare — Design guide

**This file is the rulebook for how KampongShare looks and reads.** If anything in REQUIREMENTS.md section 3 or an earlier step disagrees, this file wins.

---

## 1. The idea: the void deck noticeboard

Every HDB block has a noticeboard where neighbours pin what they need. **KampongShare is that noticeboard, online.**

- **One signature element:** the **pinned notice**, a donation request card with a marigold pin.
- **Everything else is calm paper:** plain, spacious and easy to read.

## 2. Five principles

1. **Clear first.** A person should understand any screen in 5 seconds: what it is, and what to do next.
2. **One special thing per screen.** Usually the pinned notice. Don't decorate anything else.
3. **Space and a soft edge.** Separate things with space. Every box (card, notice, menu, dialog) gets a soft 1.5 px `edge` border so white boxes stand out from the paper; no heavy outlines or extra dividers.
4. **Words are design.** Short, friendly, specific text, written like a helpful neighbour.
5. **Calm motion.** Things move only when someone does something, and never with reduced motion turned on.

---

## 3. Colour

### Tokens (defined in `src/input.css`; never use other colours)

| Token                  | Light                       | Dark ("noticeboard at night") | Use for                                                                 |
| ---------------------- | --------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| canvas                 | `#F7F1E6` paper             | `#1C1612`                     | page background                                                         |
| surface                | `#FFFFFF`                   | `#26201B`                     | cards, inputs, dialogs                                                  |
| board                  | `#E7D3B8` cork              | `#3A2E24`                     | thin strip above "Most needed" only, search box tint, icon hover circle |
| ink                    | `#2B211B` kopi brown        | `#F5EEE6`                     | text                                                                    |
| muted                  | `#6B5D52`                   | `#C2B2A3`                     | helper text, dates, secondary text                                      |
| line                   | `#E9DFD2`                   | `#3A2F27`                     | the few dividers you really need                                        |
| field-border           | `#8A7967`                   | `#8F7F70`                     | text box borders                                                        |
| edge                   | `#D6C4AD`                   | `#54463A`                     | the soft 1.5 px edge around cards, notices, menus and dialogs           |
| primary                | `#1E6B47` noticeboard green | `#7BD3A0`                     | main buttons, links, focus, done steps                                  |
| primary-hover          | `#17573A`                   | `#9BE0B7`                     | hover, button edge                                                      |
| primary-soft           | `#E3F1E8`                   | `#16301F`                     | success backgrounds                                                     |
| on-primary             | `#FFFFFF`                   | `#0E2A1B`                     | text on primary buttons                                                 |
| accent                 | `#F2B705` marigold          | `#F2B705`                     | **only**: pins, the tracker's current step, focus glow                  |
| danger                 | `#B42318`                   | `#F97066`                     | errors, destructive buttons                                             |
| danger-soft            | `#FDECEA`                   | `#3A1714`                     | error field background                                                  |
| on-danger              | `#FFFFFF`                   | `#2A0B08`                     | text on danger buttons                                                  |
| warning / warning-soft | `#8A5A00` / `#FDF3D3`       | `#F2B705` / `#3A2C0A`         | "waiting" states                                                        |
| info / info-soft       | `#1F4E8C` / `#E4EDF8`       | `#9CC3F5` / `#172A44`         | neutral information                                                     |

### Rules

- **Green means "do this".** One main green button per card or screen area.
- **Marigold is a spice.** Only pins, the current tracker step and focus glows. Never text on paper.
- **Red only for errors and destructive actions.** Never decoration.
- **Every status has an icon and words.** Never use colour alone.
- Run `node scripts/check-contrast.js` after any colour change: text needs at least 4.5:1, borders and focus at least 3:1.

---

## 4. Text

### Typefaces

- **Fraunces** (600 and 700, a soft, warm serif): page titles, section titles and card titles **only**.
- **Lexend** (400 and 700): everything else. It's designed to make reading easier.
- **Chinese fallback** after both: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif.

### Type scale

| Style      | Size / line height       | Font          | Use                          |
| ---------- | ------------------------ | ------------- | ---------------------------- |
| Display    | 40 / 44 (phones 32 / 36) | Fraunces 700 | home page hero only          |
| Title      | 30 / 36 (phones 26 / 32) | Fraunces 700 | one per page                 |
| Section    | 22 / 30                  | Fraunces 600 | section headings             |
| Card title | 19 / 26                  | Fraunces 600 | card and notice titles       |
| Body       | 17 / 27                  | Lexend 400  | normal text, input text      |
| Small      | 16 / 24                  | Lexend 400  | helper text, dates, captions |
| Label      | 16 / 20                  | Lexend 700  | form labels, buttons         |

- **Only two weights per font.** Use size and space for hierarchy, not extra boldness.
- **Lines no longer than about 70 characters.**
- **Numbers for quantities use tabular figures** (`font-variant-numeric: tabular-nums`), so "6 of 10" lines up.
- **Sentence case everywhere.** No ALL CAPS, no Title Case On Every Word.

### How we write

- **Like a helpful neighbour:** short, warm, specific. Singapore English is fine.
- **Buttons say exactly what happens:** "Offer 8 bags", "Accept offer", "Mark delivered". Never "Submit" or "Click here".
- **The same words everywhere:** if the button says "Offer", the toast says "Offer sent".
- **Errors say what happened and how to fix it**, without apologising: "Only 4 bags are still needed. Offer 4 or fewer."
- **Empty screens invite action:** "Nothing pinned here yet. Post your first request."
- **Numbers over adjectives:** "4 of 10 bags still needed", not "Urgent need!"

| Instead of                                              | Write                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| Empowering communities through impactful giving         | What our neighbours need this week                                |
| Submit                                                  | Offer 8 bags                                                      |
| An error occurred                                       | We couldn't send your offer. Check your connection and try again. |
| No data available                                       | No requests in Jurong right now. Try another area.                |
| Your request has been successfully submitted for review | Sent for approval. We'll let you know within 2 days.              |

All text must exist in **English, 中文 and BM** (see the Languages section in REQUIREMENTS.md).

---

## 5. Layout and spacing

- **Spacing steps:** 4, 8, 12, 16, 24, 32, 48, 64 px only.
- **Between sections:** 64 px on desktop, 40 px on phones. **Inside cards:** 20–24 px padding.
- **Content width:** max 1120 px, centred; 16 px side gutter on phones.
- **Grids:** notices and cards are 1 column on phones, 2 at 640 px and 3 at 1024 px.
- **Text is left-aligned.** Centre only the home hero and empty states.
- **Phones first:** test everything at 360 px wide.

---

## 6. Components

### 6.1 Pinned notice (the signature: donation requests only)

```
        📍  ← marigold pin, centred, small soft shadow
  ┌───────────────────────────┐
  │ 🍚 Food    ⏳ 82 · High    │  category icon (duotone) + name, Small; urgency badge right
  │ Rice for 40 families      │  Card title
  │ Tampines Food Bank        │  Small, muted
  │                           │
  │ ▓▓▓▓▓▓▓▓▓▓░░░░░           │  slim progress bar (received + accepted)
  │ 6 of 10 bags still needed │  Body, tabular numbers
  │ Ends Sat 2 Nov            │  Small, muted
  │                           │
  │ [ Offer ]                 │  ONE main button
  └───────────────────────────┘
```

- **Paper:** surface colour, radius 6 px, a soft 1.5 px `edge` border, very light shadow.
- **Shows only three facts plus urgency:** what, how much is left, when it ends, and a small urgency badge ("82 · High urgency"; just "High urgency" before it's scored; "Why this score?" is in the details). Everything else is in the details.
- **Tilt (max 0.8°, alternating):** only in the home page's "Most needed" section. Everywhere else it's straight.
- **Hover/focus:** straightens, lifts 2 px, and the pin shadow shrinks (150 ms). No movement with reduced motion.
- **Past deadline:** no pin, muted text, and the label "Deadline passed" instead of the button.

### 6.2 Other cards (events, stats, admin, history)

- Surface colour, radius 14 px, **a soft 1.5 px `edge` border, no shadow**, separated by space. Hover (if clickable): background changes to the slightly darker canvas shade.
- Same three-facts rule; extra actions go in a **More (⋯)** menu.
- **Dashboard summary cards:** the label at 14 px muted, the number in Fraunces 700 at 30 px (phones 26), so the numbers can be read at a glance.

### 6.3 Buttons

| Type      | Look                                                                                    | When                                                        |
| --------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Main      | flat green, white text; a little darker on hover, darker still while pressed            | one per card or area                                        |
| Secondary | flat paper with a 1.5 px field-border border that turns ink on hover                    | alternatives ("Message", "Cancel")                          |
| Quiet     | text only, underline on hover                                                           | small actions in lists                                      |
| Danger    | flat red, same shape as main                                                                 | delete, reject, cancel event (always with a confirm dialog) |

- **Height 48 px** (44 px minimum), radius 10 px, Label text style, icon on the left only if it helps.
- **Focus:** 3 px green outline, 2 px gap. **Disabled:** 50% opacity, plus a reason nearby ("Deadline passed").
- **Loading:** a spinner replaces the icon, and the text changes ("Sending…"). The button can't be clicked twice.

### 6.4 Text boxes and form controls

Every field follows the same anatomy:

```
  Postal code                       ← Label (above, always visible)
  ┌──────────────────────────────┐
  │ e.g. 520123                  │  ← 48 px high, 17 px text, example placeholder
  └──────────────────────────────┘
  We use this to pin you on the map.  ← helper (Small, muted)
```

| State                        | Look                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default                      | light cork-tinted background (board 22% on surface; plain white on the profile page and in filter bars), 2 px field-border, radius 10 px                                                                             |
| Hover                        | border turns ink colour                                                                                                                                          |
| Focus                        | surface background, 2 px green border plus a soft marigold glow (the green border is what meets contrast)                                                         |
| Error                        | danger border, danger-soft background, a message below with an alert icon ("Enter a 6-digit postal code"), `aria-invalid="true"`, linked with `aria-describedby` |
| Disabled                     | canvas background, muted text, dashed border                                                                                                                     |
| Locked (e.g. after approval) | no border, canvas background, a lock icon and the note "To change this, close the request and post a new one."                                                   |

- **17 px input text**, so phones don't zoom in.
- **Mark optional fields, not required ones:** "Phone (optional)". Most fields are required, so this keeps forms clean.
- **Character counters** sit at the bottom right, for example "120 / 300". They turn danger-coloured at the limit.
- **Long text boxes** (request description, messages): faint notepaper lines matching the 27 px line height, the only decorative input.
- **Search:** the same rectangle (10 px corners) as other text boxes, with a magnifier icon and a board-tinted background.
- **Filter bars** (e.g. Browse needs): one slim row with no box around it: search, then the pickers, all with a plain white (surface) background. Each picker's first choice names it ("All categories", "Any urgency"), so the labels are kept only for screen readers. The result count sits underneath.
- **Quantity:** large − and + buttons (48 px) either side of the number, never past the remaining amount.
- **Checkboxes and radios:** 24 px, green tick or dot, label clickable. **Dropdowns:** custom chevron, the same as text boxes.
- **Password:** eye button inside the right edge (Step 15.1).
- **One column of fields**, in the order people think. Group related fields with a section title, not boxes.

### 6.5 Status, tracker and stamp

- **Status badges:** small pill, soft background, icon plus word (for example ⏳ Waiting, ✓ Delivered).
- **Tracker** (Step 15.15): done = green tick circle, current = marigold circle, future = empty circle. Next-step line under the current step.
- **Delivered stamp:** slightly rotated green "ink" mark, hand-heart icon, "Delivered · Thank you!". The only other playful element besides the pin.

### 6.6 Navigation

- **Top bar:** logo · Browse needs · Messages (unread count) · avatar menu (theme, language, profile, Donating/Volunteering switch, log out). Visitors: logo · Browse needs · Log in · Sign up, with a small settings menu.
- **Current page:** bold, with a 2 px green line under it.
- **Chat button:** round, bottom right, above any phone navigation.

### 6.7 Feedback

- **Toast:** short, past tense, matching the button: "Offer sent". Bottom centre on phones, top right on desktop, gone after 4 s.
- **Dialogs:** a title that's a question ("Cancel this event?"), one sentence of consequence, then Cancel and the action ("Cancel event").
- **Empty states:** a Pinny illustration (looking around), one sentence, one button.
- **Loading:** skeleton shapes of the real content, never blank screens or spinners for whole pages.

---

## 7. Icons

- **Phosphor Icons.** Regular weight for interface icons. **Duotone only for category icons** (marigold fill).
- **Sizes:** 20 px in text, 24 px in buttons, 32–40 px for categories and empty states.
- **Categories:** food → bowl · clothing → t-shirt · hygiene → drop · household → house · baby → baby · education → book · other → gift.
- Icons next to text: `aria-hidden="true"`. Icon-only buttons: always an `aria-label`.

## 8. Motion (the only animations allowed)

| What                   | Motion                                   |
| ---------------------- | ---------------------------------------- |
| Notice hover/focus     | straighten + lift, 150 ms                |
| Button hover / press   | 150 ms colour change, no movement        |
| Tracker current step   | one gentle pulse when it first appears   |
| Delivered stamp        | quick "stamp down" (scale 1.1 → 1), once |
| Dialogs, menus, toasts | fade + 4 px slide, 150 ms                |
| Theme switch           | 150 ms colour change                     |

Everything turns off with `prefers-reduced-motion`. No scroll-triggered animations, no animated backgrounds.

## 9. Pinny (the mascot)

Only in: **empty states**, the **thank-you moment** after an offer or application, and the **404 page**. Nowhere else.

## 10. Never do these (they make a site look generic or AI-made)

- ALL-CAPS labels or small "eyebrow" labels above headings
- One word in a headline in a different colour or italics
- Gradient backgrounds, glowing shadows, frosted glass
- Every box as the same rounded card with the same shadow
- "→" on every button; "Learn more" or "Get started" without saying what happens
- Fade-in on every section; emojis instead of icons
- Marketing words: "empower", "seamless", "unlock", "revolutionise"

## 11. Accessibility checklist (every page)

- Text contrast ≥ 4.5:1; borders and focus ≥ 3:1 (`node scripts/check-contrast.js`)
- Everything works by keyboard, with a visible focus ring
- Touch targets ≥ 44 × 44 px
- Labels on every input; errors linked to their field
- Correct `lang` on the page and on mixed-language text
- Works at 360 px, at 200% zoom, in dark mode and in all three languages

---

## 12. Instagram event poster (1080 × 1350)

Made in the browser with `<canvas>` from the share panel ("Download poster"). Always light colours, in the poster maker's chosen language.

```
┌────────────────────────────────┐
│ 📍                             │  marigold pin, top left
│                                │
│  Rice packing day              │  Fraunces 700, 96 px, max 5 words, ink
│                                │
│  Sat 8 Nov · 9am–12pm          │  Lexend 700, 44 px
│  Tampines CC                   │  Lexend 400, 44 px
│                                │
│  We need 10 volunteers         │  Lexend 400, 40 px, green
│  and 40 bags of rice           │  (one line of "what we need")
│                                │
│  ┌────────┐  Scan to           │  QR code (280 px) to the event's share link
│  │ QR     │  join or donate    │
│  └────────┘                    │
│                                │
│  Tampines Food Bank            │  Lexend 700, 32 px
│  on KampongShare               │  Lexend 400, 28 px, muted + small logo
└────────────────────────────────┘
```

- **Paper background** `#FFFDF7`, generous margins (96 px), left-aligned.
- **At most about 25 words.** The title is readable even as a small thumbnail.
- **A QR code instead of a link,** because Instagram links aren't clickable. It points to `https://<site>/e/<event id>`.
- **No photos behind text**, no gradients, one marigold pin only.
- Long titles shrink to fit (down to 72 px), then wrap to two lines; never cut off.
