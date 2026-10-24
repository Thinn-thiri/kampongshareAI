# KampongShare AI — Requirements

Read this whole file before starting any task. If a request conflicts with this file, follow this file and say so.

---

## 1. Project

Community donation and volunteer platform for Singapore. Hackathon prototype.

**Organization onboarding:** organization signs up → creates its organization profile → admin approves the organization → only then can it post requests and events. Rejected organizations see the admin's note.

**Editing after approval:** once a request is approved, the organization can change **item quantities** (never below what's already accepted), the **deadline** and **urgency**, or close it. Title, description and the item list are locked; the edit form must show these as read-only with the note "To change this, close the request and post a new one." The organization's **name** is locked once the organization is approved (other details stay editable). The database enforces all of this; show its error message if an edit is refused.

**Offer rules (enforced by the database):**

- One active (pending or accepted) offer per donor per item. To change the amount, the donor cancels and offers again.
- When a request is closed, fulfilled or rejected, its **pending** offers become `rejected` automatically; on the donor's page show these as "Request closed". **Accepted** offers carry on so promised items can still be delivered. Offers can only be accepted while the request is open.
- Each request can have **drop-off instructions** (`donation_requests.dropoff_instructions`, max 500 characters, e.g. "Blk 123 Tampines St 11, weekdays 10am–5pm"). The request form includes this field; donors see it on the request, and it's shown prominently once their offer is accepted. It stays editable after approval.

**Volunteer rules (enforced by the database):**

- `events.volunteers_needed` is the limit (0 = no limit; the event form should ask for at least 1). Once that many are approved, new applications and approvals are refused: show **"Event full"**.
- Volunteers can **withdraw** a **pending** application (status `withdrawn`, confirm dialog first). Once **approved**, the Withdraw button is shown disabled with the note "Your place is confirmed — please contact the organization if you can't make it"; only the organization can then remove them, which frees the spot. They can **apply again** later (`withdrawn` → `pending`) if the event still has room.
- Organizations can approve or reject pending applications, and remove an approved volunteer (`approved` → `rejected`).

**Core flow:** approved organization posts a request with items → admin approves → AI scores urgency with reasons → donor browses (sorted by urgency) or gets AI recommendations → donor offers against one specific item (never more than remaining) → organization accepts / rejects → marks delivered → request becomes fulfilled automatically.

**Events:** organization creates an event (optionally linked to one of its own donation requests) → admin approves → it appears on the map and can be shared (section 5). Changing an approved event's title, description, place or time sends it back for approval automatically.

**Account types and roles:**

- **Individual** accounts can **donate**, **volunteer**, or **both**. This is stored as `profiles.is_donor` and `profiles.is_volunteer`. `profiles.role` (`donor` or `volunteer`) only decides which dashboard opens first after login.
- **Organization** accounts (`role = 'organization'`) and **admin** accounts (`role = 'admin'`) can never donate or volunteer.
- Check what a user may do with `is_donor` / `is_volunteer`, never with `role` alone. Always read these from the `profiles` table, never from `user_metadata`.

## 2. Tech stack

| Layer            | Choice                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend         | Plain HTML and JavaScript + **Alpine.js** for interactive UI (section 2.3). No other JS framework, no TypeScript. One HTML page per screen.                                                                                                                                                                                               |
| Type checking    | `// @ts-check` + JSDoc comments in every `.js` file (section 2.4)                                                                                                                                                                                                                                                                         |
| Styling          | **Tailwind CSS v4** built with the Tailwind CLI (see section 2.1). The only build step in the project. No other CSS framework.                                                                                                                                                                                                            |
| Database & auth  | Supabase. Client: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`                                                                                                                                                                                                                                                                  |
| Schema           | `supabase/migrations/` — read every file in order before any database code (the first, `…_initial_schema.sql`, is the full schema). Never rename tables or columns in code.                                                                                                                                                               |
| Database changes | Add a **new** file in `supabase/migrations/` (name: `<UTC timestamp>_short_description.sql`), then tell me to paste it into the Supabase SQL Editor and Run (or run `npx supabase db push` if the Supabase CLI has been linked). Never edit a migration that has already been applied. Never print `.env`, keys or the database password. |
| AI               | NVIDIA Build API (OpenAI-compatible chat completions), called **only** from Netlify Functions (`netlify/functions/`). The model is set in one constant, `MODEL`, in `netlify/functions/match-items.js` (currently `nvidia/nemotron-3.5-bolt-e4b`).                                                                                      |
| Hosting          | Netlify (`npx netlify dev` for local testing)                                                                                                                                                                                                                                                                                             |
| Map              | Leaflet + OpenStreetMap tiles (show the required attribution)                                                                                                                                                                                                                                                                             |
| Geocoding        | **OneMap Search API** (Singapore Land Authority): 6-digit postal code → address + latitude/longitude, to place map pins automatically. Called **only** from the Netlify Function `geocode-postal` (logged-in users), never from the browser. Only the postal code is sent. OneMap's Search API now requires a token: set `ONEMAP_EMAIL` / `ONEMAP_PASSWORD` in `.env` and Netlify env (free account at onemap.gov.sg/apidocs/register); the function fetches and caches the 3-day token. OneMap's terms don't require attribution for API data, but show "Address lookup by OneMap (Singapore Land Authority)" next to the field. In the browser, always use `lookupPostalCode()` from `js/geocode.js` — **reuse it for event locations in step 9**. |
| Icons            | Lucide icons (`https://unpkg.com/lucide@latest`)                                                                                                                                                                                                                                                                                          |
| Font             | Plus Jakarta Sans from Google Fonts, fallback `system-ui, sans-serif`                                                                                                                                                                                                                                                                     |

### File layout

```
index.html  signup.html  login.html  donor.html  organization.html  volunteer.html  admin.html
profile.html  privacy.html
event.html  needs.html  org.html   (public pages — work without logging in, section 6)
src/input.css          → Tailwind source: theme tokens + shared components (EDIT THIS)
css/style.css          → generated by Tailwind (NEVER edit by hand; add to .gitignore)
package.json           → Tailwind packages + scripts
js/config.js           → Supabase URL + anon key only
js/supabase.js         → creates the client
js/auth.js             → getProfile(), requireAccess('donor' | 'volunteer' | 'organization' | 'admin'), logout
js/ui.js               → toast(), confirmDialog(), formatDate(), statusBadge(), escapeHtml()
js/share.js            → share links, poster image, copy caption (section 5)
js/geocode.js          → lookupPostalCode(): postal code → { address, latitude, longitude } via geocode-postal
jsconfig.json          → turns on type checking for all .js files
img/og-default.png     → 1200×630 default preview image for shared links
netlify/functions/     → server code: AI scoring, match-items, event-caption, share-event, geocode-postal
supabase/migrations/   → database schema and changes (Supabase CLI)
scripts/               → setup-supabase.js, check-supabase.js, seed.js (run with node)
```

### 2.1 Tailwind setup

- Install: `npm install tailwindcss @tailwindcss/cli`
- `package.json` scripts:
  ```json
  "scripts": {
    "dev:css": "npx @tailwindcss/cli -i ./src/input.css -o ./css/style.css --watch",
    "build": "npx @tailwindcss/cli -i ./src/input.css -o ./css/style.css --minify"
  }
  ```
- While coding, run `npm run dev:css` in one terminal and `npx netlify dev` in another.
- `netlify.toml`: build command `npm run build`, publish directory `.`
- Every HTML page links the generated file: `<link rel="stylesheet" href="/css/style.css">`
- Load the font in each page's `<head>` with a Google Fonts `<link>` (Plus Jakarta Sans 400, 500, 600, 700).
- **Do not** use the Tailwind Play CDN (`@tailwindcss/browser`) — it is for development only, not production.

### 2.2 Tailwind rules

- **Write full class names.** Tailwind only finds classes written out in full in the source files. In JavaScript never build class names from pieces (`'bg-' + color` will not work). Use a lookup object instead:
  ```js
  const STATUS_CLASS = {
    open: "badge badge-info",
    fulfilled: "badge badge-success",
  };
  ```
- Use Tailwind utility classes for **layout and spacing** (`flex`, `grid`, `gap-4`, `md:grid-cols-2`, `p-4`).
- Use the shared component classes from `src/input.css` for **repeated pieces** (`btn`, `card`, `badge`, `input`…). If the same 6+ utility classes appear on 3 or more elements, make a component class instead.
- Only use the theme colors (`bg-primary`, `text-muted`, `bg-danger-soft`…) plus `white`/`black`. Never Tailwind's built-in palette (`bg-blue-500`) or hex codes in HTML.
- No inline `style="..."` attributes, except for dynamic values like a progress bar's width.

### 2.3 Alpine.js

- Load it in each page's `<head>`, **after** your own scripts: `<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js"></script>`
- Use Alpine for **UI state**: showing / hiding sections (e.g. volunteer fields at sign-up), adding and removing item rows, tabs, dialogs, menus, the "Why this score?" panel and the share panel.
- Keep **Supabase calls and business logic in plain functions** in `js/` files. Alpine components call them; they don't contain database code themselves.
- Register reusable components with `Alpine.data('name', () => ({...}))` inside `document.addEventListener('alpine:init', ...)`.
- **Use `x-text`, never `x-html`,** for anything a user typed. `x-html` with user input allows script injection.
- With `:class`, use full Tailwind class names (`:class="open ? 'badge-info' : 'badge-neutral'"`), never pieces.
- Don't use Alpine plugins unless asked.

### 2.4 Type checking (no TypeScript)

- First line of every `.js` file: `// @ts-check`
- Add JSDoc comments for function parameters and return values, e.g. `/** @param {number} score @returns {string} */`
- `jsconfig.json`: `{ "compilerOptions": { "checkJs": true, "target": "ES2022" }, "exclude": ["node_modules", "css"] }`
- Fix the editor's red underlines before calling a task done. Netlify Functions are JavaScript too, so the whole project uses one language.

---

## 3. UI and design system

### Look and feel

Warm, trustworthy, community-focused, calm. Modern but not flashy: think a well-designed public-service app, not a crypto dashboard. Plenty of white space, rounded cards, clear hierarchy, one primary action per screen.

### Theme and shared components — `src/input.css`

Define everything once here. Tailwind turns each `--color-*` into classes, e.g. `--color-primary` → `bg-primary`, `text-primary`, `border-primary`.

```css
@import "tailwindcss";

@theme {
  /* brand */
  --color-primary: #0f766e; /* teal — buttons, links */
  --color-primary-hover: #115e59;
  --color-primary-soft: #ccfbf1; /* tinted backgrounds */
  --color-accent: #f59e0b; /* warm amber — highlights only */

  /* neutrals:  bg-canvas, bg-surface, border-line, text-ink, text-muted */
  --color-canvas: #f8faf9;
  --color-surface: #ffffff;
  --color-line: #e2e8f0;
  --color-ink: #0f172a;
  --color-muted: #64748b;

  /* status */
  --color-success: #15803d;
  --color-success-soft: #dcfce7;
  --color-warning: #b45309;
  --color-warning-soft: #fef3c7;
  --color-danger: #b91c1c;
  --color-danger-soft: #fee2e2;
  --color-info: #1d4ed8;
  --color-info-soft: #dbeafe;

  /* shape */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 20px;
  --shadow-sm: 0 1px 2px rgb(15 23 42 / 0.06);
  --shadow-md: 0 4px 16px rgb(15 23 42 / 0.08);

  /* type */
  --font-sans: "Plus Jakarta Sans", system-ui, sans-serif;
}

@layer base {
  body {
    @apply bg-canvas font-sans text-ink antialiased;
  }
}

@layer components {
  /* buttons — min height 44px */
  .btn {
    @apply inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60;
  }
  .btn-primary {
    @apply bg-primary text-white hover:bg-primary-hover;
  }
  .btn-secondary {
    @apply border border-line bg-surface text-ink hover:bg-canvas;
  }
  .btn-danger {
    @apply bg-danger text-white hover:opacity-90;
  }
  .btn-ghost {
    @apply text-primary hover:bg-primary-soft;
  }

  /* cards */
  .card {
    @apply rounded-lg border border-line bg-surface p-5 shadow-sm transition-shadow duration-200 hover:shadow-md;
  }

  /* badges */
  .badge {
    @apply inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold;
  }
  .badge-success {
    @apply bg-success-soft text-success;
  }
  .badge-warning {
    @apply bg-warning-soft text-warning;
  }
  .badge-danger {
    @apply bg-danger-soft text-danger;
  }
  .badge-info {
    @apply bg-info-soft text-info;
  }
  .badge-neutral {
    @apply border border-line bg-canvas text-muted;
  }

  /* forms */
  .label {
    @apply mb-1 block text-sm font-medium text-ink;
  }
  .input {
    @apply min-h-11 w-full rounded-md border border-line bg-surface px-3 text-base text-ink placeholder:text-muted focus:border-primary focus:outline-2 focus:outline-primary-soft;
  }
  .helper-text {
    @apply mt-1 text-sm text-muted;
  }
  .field-error {
    @apply mt-1 text-sm text-danger;
  }
}

/* respect users who turn off animations */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Use Tailwind's built-in spacing (`p-4`, `gap-6`…) and text sizes (`text-sm`, `text-2xl`…); don't invent new ones.

### Components (classes above, reused everywhere)

- **Buttons:** `btn btn-primary` (main action), `btn btn-secondary` (outline), `btn btn-danger` (only for destructive actions), `btn btn-ghost` (text only). Show a spinner and disable while an action is running so nothing is submitted twice.
- **Cards:** `card` — white surface, large radius, soft shadow, border, lifts slightly on hover.
- **Status badges** (pill shape, soft background + strong text):
  - requests: pending_approval = warning, open = info, fulfilled = success, closed / rejected = neutral / danger
  - offers: pending = warning, accepted = info, delivered = success, rejected / cancelled = neutral
- **Urgency badge:** shows the AI score number **and** a word (Critical 80–100, High 60–79, Medium 40–59, Low 0–39). Never rely on color alone.
- **Item progress bar:** for each request item show "6 of 10 bags", with a bar split into received (solid) and committed-not-yet-received (striped).
- **"Why this score?" panel:** a collapsible section under the urgency badge showing the AI reasons, labelled with a small "AI-suggested" tag.
- **Forms:** visible labels above every input (no placeholder-only labels), helper text under tricky fields, inline error messages in red below the field, required fields marked.
- **Toasts:** bottom-centre on mobile, top-right on desktop; success / error variants; auto-hide after 4 s; announced to screen readers (`aria-live="polite"`).
- **Empty states:** friendly icon + one sentence + the next action (e.g., "No requests yet — Create your first request").
- **Loading:** skeleton placeholders for lists, not blank screens.
- **Confirm dialog:** for reject, cancel, delete and close actions.

### Layout

- **Mobile-first.** Must work at 360px wide with no sideways scrolling. Breakpoints at 640px and 1024px.
- Content max width 1100px, centred, 16px side padding on mobile.
- Top bar: logo, page title, profile menu with logout. On mobile, a bottom navigation bar with the 3–4 main sections for that role.
- Dashboards start with 3–4 summary stat cards (e.g., "Open requests", "Items still needed", "Offers waiting").
- Lists become card grids on desktop, single column on mobile.
- Map pages: map fills the top of the screen, list of events below (mobile) or beside it (desktop).

### Accessibility (WCAG 2.1 AA)

- Text contrast at least 4.5:1. Every interactive element reachable and usable by keyboard, with a visible focus ring.
- `<html lang="en">`, one `<h1>` per page, headings in order, real `<button>` and `<a>` elements.
- Images and icons that carry meaning have text alternatives; decorative icons have `aria-hidden="true"`.
- Respect `prefers-reduced-motion`: keep animations subtle (150–250 ms) and turn them off when requested.
- Touch targets at least 44 × 44 px.

### Tone of voice

Short, kind, plain English. Explain what happens next ("Your offer was sent. The organization will confirm within 2 days."). Error messages say what went wrong and how to fix it. Never blame the user.

---

## 4. Privacy and compliance

This app handles personal data of people in Singapore, so it follows the **Personal Data Protection Act (PDPA)** principles. It also uses AI to rank needs, so it follows the principles of Singapore's **Model AI Governance Framework** (explainable, human-centred). This is a prototype, but build it as if it were real.

### 4.1 Collect only what we need (data minimisation)

- Individuals give **postal code and area only**, never a full home address.
- Phone number is optional for donors and volunteers.
- Do not collect NRIC/FIN numbers, date of birth, race, religion, income, health information, or photos of people.
- Organizations give their organization's address and location (this is public on the map).

### 4.2 Consent and notice

- Sign-up must show a **required checkbox**: "I agree to the Privacy Notice and to KampongShare using my details to coordinate donations and volunteering." Link to `privacy.html`. Sign-up is blocked until it is ticked.
- Volunteers get a **separate, optional** checkbox: "Use my availability, interests and skills to recommend volunteer events." If unticked, do not use their data for AI matching.
- Users must confirm they are **18 or older** (keeps the prototype clear of parental-consent requirements for minors).
- `privacy.html` explains in plain language: what we collect, why, who can see it, that AI is used and how, how long we keep it, and how to access, correct or delete it, plus a contact email for privacy questions (the Data Protection Officer contact).
- **How it's stored:** sign-up passes `privacy_consent: true`, `age_confirmed: true` and (volunteers) `matching_opt_in: true/false` in `options.data`. The database saves `profiles.consented_at` (time set by the database), `age_confirmed` and `matching_opt_in`.
- **The database refuses offers and volunteer applications** until `consented_at` is set and `age_confirmed` is true. If a user is missing either (e.g. after Google sign-in later), send them to `profile.html` to give it first.
- **Withdrawing consent:** `profile.html` has a "Withdraw my consent" option that sets `consented_at` to null (confirm dialog first; explain they can't donate or volunteer until they consent again).
- Only use a volunteer's availability, interests and skills for AI matching when `matching_opt_in` is true.

### 4.3 Who can see what (purpose and access limits)

- The database's Row Level Security rules are the source of truth. Never try to work around them in JavaScript.
- A donor's or volunteer's phone number is shown **only** to the organization they offered to or applied to, and to admins.
- Public pages (map, request lists) show organization details only, never individual donors' or volunteers' names.
- Admin screens show personal data only where needed for moderation.

### 4.4 Access, correction and deletion

- `profile.html` lets users view and edit everything we hold about them.
- Provide a **"Delete my account"** option with a confirmation dialog. It must remove the user's profile and personal data. This requires a Netlify Function using the service role key; the frontend can't do it directly. Their past offers may be kept only in anonymised form for the organization's records.

### 4.5 Protection (security)

- **Secrets:** the Supabase service role key, NVIDIA API key and OneMap account (`ONEMAP_EMAIL` / `ONEMAP_PASSWORD`) live only in `.env` (local) and Netlify environment variables. `.env` is in `.gitignore`. Never put them in HTML or JS, and never commit them.
- Only the Supabase **anon key** may appear in frontend code.
- **Never put personal data in URLs** or query strings (use IDs only).
- **Never `console.log` personal data** (names, emails, phones, postal codes).
- **Escape all user-entered text** before inserting it into the page (use `escapeHtml()` or `textContent`, never `innerHTML` with raw input), to prevent script injection.
- Validate inputs in the frontend for a good experience, but rely on the database for the real checks.
- Netlify Functions check the caller's Supabase login token before doing anything on their behalf.
- HTTPS only (Netlify provides it).
- No third-party analytics, trackers, ads or tracking cookies. Supabase keeps the login session in browser storage, which is necessary for the service.

### 4.6 AI use

- **Never send personal data to the AI.** Requests to NVIDIA Build may contain only: item names, categories, quantities, deadlines, urgency level, request description, area name. No names, emails, phones or postal codes. Strip them out before sending, even if they appear in a free-text description (e.g. mask phone-number and email patterns).
- The **urgency score is calculated by a transparent formula**; the AI only writes the plain-English explanation and normalises item names. Show the formula's factors in the "Why this score?" panel.
- Every AI output is labelled **"AI-suggested"**. Recommendations sort and suggest; **humans decide.** Organizations and admins can always act regardless of the score.
- AI must never use or infer sensitive attributes (race, religion, nationality, health, income) to rank anything.
- If the AI call fails, the app still works: show the formula score with a generic explanation.

### 4.7 Donated goods safety

- For **food** items, the offer form shows a required checkbox: "Items are sealed, unopened and not past their expiry date." It is saved as `donation_offers.food_safety_confirmed`; the database refuses food offers without it. Cooked or home-made food is not accepted.
- No medicines or medical items (that category was removed on purpose).
- Clothing should be clean and in usable condition (shown as guidance text).

### 4.8 Content and misuse

- Admins approve every organization before it can post anything, and every donation request before it becomes public. Rejecting an organization later hides all its requests and events from the public automatically.
- Free-text fields have sensible length limits (title 100 chars, descriptions 1,000, messages 500).
- Organizations should never be able to see a donor's offers to other organizations.
- Admins approve every event before it becomes public or shareable (enforced by the database: only `approval = 'approved'` events are visible to the public).

### 4.9 Demo data

- All sample data must be **fictitious**: made-up names, `@example.com` emails, phone numbers that are clearly fake (e.g., 9000 0001), real Singapore area names and approximate public locations only.
- Never use real people's personal data for testing.

### 4.10 Breach readiness (for the pitch and the README)

- Note in the README that, in a real launch, a data breach likely to cause significant harm must be reported to the PDPC and affected users promptly (within 3 calendar days of assessing it as notifiable), and that a Data Protection Officer would be appointed.

---

## 5. Sharing events (social media)

Goal: when an event is approved, the organization (and anyone viewing the event) can share it to WhatsApp, Facebook and Instagram in one or two taps, with links that lead straight to **Donate** and **Volunteer**.

We do **not** auto-post to social media. Facebook and Instagram auto-posting need Meta app permissions and setup; WhatsApp has no official API for posting to Channels or Status. One-tap sharing works everywhere with no approvals.

### 5.1 Public event page — `event.html?id=<event id>`

- Works without logging in. Shows title, organization name, date and time, place, a small Leaflet map, description and volunteers needed.
- Two big buttons:
  - **Donate** → the linked donation request (`events.donation_request_id`) if set; otherwise the organization's open requests.
  - **Volunteer** → apply for this event (volunteers only; shows "Event full" or "Event ended" when relevant).
- If the visitor isn't logged in, the button goes to `login.html?next=<path>` and returns them to the event afterwards. **`next` must be a relative path starting with `/`** (never a full URL) to block open-redirect attacks.
- If the event isn't approved or doesn't exist, show a friendly "This event isn't available" message.
- Links contain only the event ID — never personal data.

### 5.2 Link previews — Netlify Function `share-event`

WhatsApp and Facebook don't run JavaScript when they read a link, so previews need server-made HTML.

- Shared links use the format `https://<site>/e/<event id>`.
- `netlify.toml` redirect: `/e/:id` → `/.netlify/functions/share-event?id=:id` (status 200).
- The function reads the event using the **anon key** (so only approved events are returned), and replies with a small HTML page containing Open Graph tags: `og:title`, `og:description` (date, place, short description), `og:image` (`/img/og-default.png`), `og:url`, plus `twitter:card`. It then sends the visitor on to `/event.html?id=<id>`.
- **Escape every value** placed into the HTML. Unknown or unapproved IDs return the generic site preview.

### 5.3 Share panel

Shown on approved events in `organization.html` and on `event.html`. Pending events show "Waiting for admin approval" instead, with no share buttons.

- **WhatsApp:** `https://wa.me/?text=<encoded message>` — opens WhatsApp with the message ready; the user picks a chat or group.
- **Facebook:** `https://www.facebook.com/sharer/sharer.php?u=<encoded link>` (Facebook ignores pre-filled text; the preview comes from 5.2).
- **Phone share menu:** if `navigator.share` exists, a "Share…" button opens the phone's own menu (WhatsApp, Instagram, Telegram, Messages…).
- **Instagram:** Instagram has no web share link and captions don't have clickable links. Provide **"Download poster"** (a 1080×1350 PNG made in the browser with `<canvas>`: event title, date, place, organization name, logo, and the short link as text) and **"Copy caption"**.
- **Copy link** button.
- Message template (editable before sharing):
  ```
  <title> by <organization>
  <day, date, time> at <place>
  Donate: https://<site>/e/<id>
  Volunteer: https://<site>/e/<id>
  ```

### 5.4 AI-written caption — Netlify Function `event-caption`

- Generates a short, friendly caption (max 60 words, at most 2 emojis and 3 hashtags) from: event title, description, date, place name, organization name, items needed.
- Follows section 4.6: **no personal data** is sent to the AI.
- Labelled "AI-suggested". The organization can edit it before sharing.
- If the AI call fails, use the message template from 5.3.

### 5.5 Admin

- See section 7 for the full admin dashboard; pending events are one of its review queues.

---

## 6. Visitors (not logged in)

Visitors should understand the app, see real needs and try the AI **before** signing up. Judges should be able to do all of this without an account.

### 6.1 What visitors can and can't see (enforced by the database)

- **Can see:** approved donation requests with their items, remaining quantities, AI score and reasons; approved organizations; approved events; the privacy notice; public totals.
- **Never see:** any donor's or volunteer's name, phone or postal code; pending or rejected requests and events; offers.
- **Must sign up to:** make an offer, apply to volunteer, post requests or events.

### 6.2 Home page — `index.html`

- Hero: one sentence on what KampongShare does + buttons **Browse needs**, **Sign up to donate**, **Volunteer**, **Register your organization** (`signup.html?role=organization` pre-selects the role).
- **Impact numbers** from `supabase.rpc('public_stats').single()`: items delivered, completed donations, open requests, upcoming events, organizations. If a number is 0, show friendly text ("Be the first to give") instead.
- **Most urgent needs:** up to 6 open requests sorted by `ai_score` (highest first, unscored last), as cards with the urgency badge, organization, area, deadline and progress bars.
- **Upcoming events:** small Leaflet map + next 3 events, linking to `event.html`.
- **"What can you give?"** matching box (6.4).
- "How it works" in 3 steps, and a footer link to `privacy.html`.

### 6.3 Browse needs — `needs.html`

- All open requests, with filters: category, area, urgency level, and a text search on title / item name. Filters live in Alpine state; remember them in the URL query (no personal data).
- Each item has an **Offer** button. Logged-in donors offer directly. Visitors go to `login.html?next=/needs.html?item=<item id>`, and come back with that item's offer form open.

### 6.4 Try matching without an account — Netlify Function `match-items`

- A text box (max 300 characters): "What can you give? e.g. 5 bags of rice, baby diapers".
- The function: removes anything that looks like personal data (phone numbers, emails), asks NVIDIA Build to turn the text into items `{ name, category, quantity }`, then scores open request items (category match, remaining quantity, deadline, AI urgency score; area if the user is logged in) and returns the **top 5 matches with a one-line reason each**.
- **Rate limit** with Netlify's built-in config (free plan allows 2 rules — use one here and one on `event-caption`):
  ```js
  export const config = {
    path: "/api/match-items",
    rateLimit: {
      windowLimit: 10,
      windowSize: 60,
      aggregateBy: ["ip", "domain"],
    },
  };
  ```
  On HTTP 429 show: "You've tried a lot of matches — please wait a minute."
- **Don't store or log the visitor's text.**
- If the AI fails, fall back to category buttons (food, clothing, hygiene, household, baby, education) and match by category only.
- Results show "AI-suggested" and an **Offer** button that follows the 6.3 login flow. Logged-in donors use the same function on `donor.html`.

### 6.5 Organization page — `org.html?id=<organization id>`

- Name, description, area / address, small map, its open requests and approved upcoming events. Linked from request cards, event pages and shared links.

### 6.6 Sign-up from a visitor flow

- Keep the `next` path through sign-up and login, so visitors land back where they started (relative paths only — section 5.1).
- Sign-up first asks: **"I'm signing up as…"** → _an individual_ or _an organization_.
- **Individuals** tick one or both: **"I want to donate"** and **"I want to volunteer"** (at least one required). Pass them as `options.data.roles`, e.g. `['donor', 'volunteer']`. Organizations pass `role: 'organization'` instead.
- Required for everyone: name, email, password, privacy consent and 18+ confirmation. Phone, postal code and area are optional (but recommended for nearby matching).
- Volunteer fields (available days and times, interests, skills, and the matching opt-in) appear only when "I want to volunteer" is ticked.
- `signup.html?role=organization` or `?roles=volunteer` pre-selects the choice (used by the home page buttons).

### 6.6a Using both roles on one account

- **Login redirect:** go to the `next` path if there is one; otherwise to the dashboard for `profiles.role`.
- **Role switcher:** if a user has both `is_donor` and `is_volunteer`, the top bar shows a switch between **Donating** (`donor.html`) and **Volunteering** (`volunteer.html`).
- **Turning a role on later:** `profile.html` has toggles for "Donate" and "Volunteer". Turning on volunteering asks for the volunteer fields. At least one toggle must stay on (the database refuses otherwise; show its message).
- If a user who can't donate presses **Offer**, or one who can't volunteer presses **Volunteer**, show: "Turn on donating/volunteering in your profile to do this", with a button that switches it on.
- `donor.html` requires `is_donor`; `volunteer.html` requires `is_volunteer`.

### 6.7 No guest donations

Offers always need an account: the organization needs a way to arrange drop-off, we need PDPA consent, and accounts discourage fake offers. Make sign-up quick instead.

---

## 7. Admin dashboard — `admin.html`

Admins **review and moderate**; they do not create content. Admins cannot create organizations, donation requests or events, cannot edit a request's items, and cannot write AI scores (all enforced by the database).

**Becoming admin:** sign up normally, then run the update at the bottom of the schema file. Nobody can sign up as admin.

### 7.1 Overview

- Summary cards: organizations waiting, requests waiting, events waiting, volunteer applications waiting, offers in progress.
- Each card opens its review queue below. Show the oldest items first.

### 7.2 Review queues (Approve / Reject, reject always asks for an `admin_note`)

1. **Organizations** — `organizations.approval = 'pending'`: name, description, address, map pin, phone, owner's name and phone (emails live in Supabase's auth system and aren't readable from the browser). Approve → it can post requests and events.
2. **Donation requests** — `status = 'pending_approval'`: organization, title, items and quantities, deadline, urgency. Approve → `status = 'open'`; Reject → `status = 'rejected'`.
3. **Events** — `approval = 'pending'`: organization, title, place, date and time, linked request. Approve → appears on the map and can be shared.
4. **Volunteer applications** — `status = 'pending'`: volunteer's name, event, message, availability and interests.

### 7.3 Monitoring

- **Offers:** list all offers with filters by status; admin can cancel a suspicious offer (confirm dialog first).
- **Requests:** admin can close a request or edit its title, description, urgency and deadline.
- **Organizations:** admin can reject an approved organization later (e.g. after a complaint) — this hides its requests and events from the public automatically.
- Show personal data (phones, postal codes) only on screens where admins need it for a review.

### 7.4 Not in the MVP (later)

- Suspending or blocking users, and changing a user's role.
- An activity log of admin actions.

---

## 8. Definition of done for any feature

- Works at 360px and on desktop.
- Styled with the theme and component classes from `src/input.css`; `npm run build` runs without errors.
- Keyboard-usable, labelled, good contrast.
- Shows loading, empty and error states.
- Database errors are shown to the user in friendly words.
- No secrets or personal data in frontend code, URLs or console logs.
- Follows sections 2–7 of this file.
- No `// @ts-check` warnings in changed files.
