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

- **Volunteer accounts need admin approval first** (`profiles.volunteer_approval`: pending / approved / rejected). New volunteers — and anyone who turns volunteering on later — start as **pending**: they can browse events (read only) but can't apply. The admin approves or rejects them in the "Volunteer accounts waiting" queue; rejecting needs a note (`profiles.volunteer_note`) that the volunteer sees, and they can press "Ask for review again". Volunteers who existed before this rule were approved automatically. After approval, **only the event's organization** approves or rejects each event application — admins can't (the database refuses: "Only the event's organization can approve or reject volunteers for an event"; `20261030060000_org_approves_applications.sql`).

- `events.volunteers_needed` is the limit (0 = no limit; the event form should ask for at least 1). Once that many are approved, new applications and approvals are refused: show **"Event full"**.
- Volunteers can **withdraw** a **pending** application (status `withdrawn`, confirm dialog first). Once **approved**, the Withdraw button is shown disabled with the note "Your place is confirmed — please contact the organization if you can't make it"; only the organization can then remove them, which frees the spot. They can **apply again** later (`withdrawn` → `pending`) if the event still has room.
- Organizations can approve or reject pending applications, and remove an approved volunteer (`approved` → `rejected`).

**Core flow:** approved organization posts a request with items → admin approves → AI scores urgency with reasons → donor browses (sorted by urgency) or gets AI recommendations → donor offers against one specific item (never more than remaining) → organization accepts / rejects → marks delivered → request becomes fulfilled automatically.

**Donor dashboard (`donor.html`):** sections Overview · Find needs · My offers (`#overview`, `#find`, `#offers`). Overview: the summary cards (each links to its section), "Ready to drop off" (accepted offers with their drop-off instructions) and the "What can you give?" AI box. Find needs: open requests as pinned notices; Offer opens the request details panel with each item's Offer form (event.html's Donate button, `?request=` / `?org=`, opens it filtered). My offers: Active | History. The "My offers" badge counts accepted offers waiting to be dropped off.

**Volunteer dashboard (`volunteer.html`):** sections Overview · Find events · My applications · My tasks (`#overview`, `#find`, `#applications`, `#tasks`; older `#events-heading`, `#apps-heading` and `#tasks-heading` links still work). The account-approval and consent notes show above every section. Overview: the summary cards (each links to its section) and "Coming up" (the next confirmed event with its tracker). Find events: upcoming events with Apply. My applications and My tasks: Active | History. Badges: My applications = confirmed places for events that haven't ended, My tasks = open tasks.

**Organization dashboard (`organization.html`):** sections Overview · Requests · Offers · Events (`#overview`, `#requests`, `#offers`, `#events`; older `#requests-heading` links still work, and `?new=request` opens the new-request form). Overview: approval status until approved, the 4 summary cards (each links to its section), "Needs your action" (offers to accept or deliver, volunteer applications waiting, items waiting for admin approval) and the organization's details (a summary with "Edit details" once approved). Before approval, Requests, Offers and Events show a locked card. Badges: Offers = offers waiting, Events = volunteer applications waiting.

**Events:** organization creates an event (optionally linked to one of its own donation requests) → admin approves → it appears on the map and can be shared (section 5). Changing an approved event's title, description, place or time sends it back for approval automatically.

**History and cancelling (cancel instead of delete):**

- Every list is split into **Active** and **History** tabs (Alpine). History is newest first, shows the status badge, the date it ended (`closed_at`, `cancelled_at` or `updated_at`) and any reason, and loads **20 at a time** with "Show more". Friendly empty states ("No past donations yet").
  - **Donor:** Active = pending and accepted offers; History = delivered, cancelled, rejected. An offer declined because its request closed shows "Request closed" plus the request's `close_reason`.
  - **Volunteer:** Active = pending and approved applications for upcoming or ongoing events, and open tasks; History = everything else. Cancelled event → "Event cancelled: <reason>"; completed → "Event completed" with the outcome summary.
  - **Organization:** requests Active (pending approval, open) | History (fulfilled, closed, rejected); events Upcoming (upcoming, ongoing) | Past & cancelled (completed, cancelled); offers: the board New · Accepted · Delivered | History (rejected, cancelled) — section 12. Completed events can still have their outcome summary edited; everything else about a past event is read-only.
  - **Admin:** a History section with status filters for requests, events, offers and applications, plus "Recently closed or cancelled" (last 30 days) to spot unusual activity.
- **Close request:** dialog with an optional reason (`donation_requests.close_reason`, max 300 characters). The database sets `closed_at`.
- **Cancel event:** dialog with a **required** reason (`events.cancel_reason`, max 300 characters) and a warning that approved volunteers will see it. The database sets `cancelled_at`. Visitors can read the reason (column grant), and `event.html` shows "This event was cancelled: <reason>" and hides the Volunteer button.
- **Delete** only while nothing depends on the row: requests still pending approval, and events nobody has applied to (`event_has_applications()`). Otherwise show Close / Cancel instead.
- Maps and public event lists show only upcoming and ongoing events that haven't ended, and request lists only open requests that aren't past their deadline (section 11).
- History is kept for 12 months (privacy notice); users can ask for it to be deleted sooner.
- The original migration file (`20261026040000_history_and_cancel.sql`) was rebuilt from the live database; see its header.

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
| AI               | NVIDIA Build API (OpenAI-compatible chat completions), called **only** from Netlify Functions (`netlify/functions/`). The model is set in one constant, `MODEL`, in `netlify/lib/ai.js` (currently `nvidia/nemotron-3.5-lightning-30b-a3b`, with its thinking turned off); the urgency formula is in `netlify/lib/urgency.js`.                                                                                      |
| Hosting          | Netlify (`npx netlify dev` for local testing)                                                                                                                                                                                                                                                                                             |
| Map              | Leaflet + OpenStreetMap tiles (show the required attribution)                                                                                                                                                                                                                                                                             |
| Geocoding        | **OneMap Search API** (Singapore Land Authority): 6-digit postal code → address + latitude/longitude, to place map pins automatically. Called **only** from the Netlify Function `geocode-postal` (logged-in users), never from the browser. Only the postal code is sent. OneMap's Search API now requires a token: set `ONEMAP_EMAIL` / `ONEMAP_PASSWORD` in `.env` and Netlify env (free account at onemap.gov.sg/apidocs/register); the function fetches and caches the 3-day token. OneMap's terms don't require attribution for API data, but show "Address lookup by OneMap (Singapore Land Authority)" next to the field. In the browser, always use `lookupPostalCode()` from `js/geocode.js` — **reuse it for event locations in step 9**. |
| Icons            | Phosphor icons (`@phosphor-icons/web@2.1.1` regular + duotone stylesheets from unpkg): `<i class="ph ph-name">`; duotone with a marigold fill only for categories (`categoryIcon()` in js/ui.js) |
| Fonts            | Google Fonts (`display=swap`): **Fraunces** 600 / 700 for titles, **Lexend** 400 / 700 for everything else (made for easier reading); Chinese falls back to the device's Chinese font (DESIGN.md 4) |

### File layout

```
index.html  signup.html  login.html  donor.html  organization.html  volunteer.html  admin.html
profile.html  privacy.html  messages.html (private messages, section 10)  404.html (Pinny, "We can't find that page")
event.html  needs.html  org.html   (public pages — work without logging in, section 6)
src/input.css          → Tailwind source: theme tokens + shared components (EDIT THIS)
css/style.css          → generated by Tailwind (NEVER edit by hand; add to .gitignore)
package.json           → Tailwind packages + scripts
js/config.js           → Supabase URL + anon key only
js/supabase.js         → creates the client
js/auth.js             → getProfile(), requireAccess('donor' | 'volunteer' | 'organization' | 'admin'), logout
js/ui.js               → toast(), confirmDialog(), formatDate(), statusBadge(), escapeHtml(), the deadline checks (section 11)
js/theme.js            → light / dark mode: sets data-theme first thing in <head>, the theme choices in the account / settings menu (DESIGN.md)
js/i18n/en.js, zh.js, ms.js → every text the site shows, in English, 简体中文 and Bahasa Melayu (section 9)
js/i18n.js             → languages: t(), $t, data-i18n, enumLabel(), areaLabel(), the language menu (section 9)
js/share.js            → share links, poster image with a QR code, copy caption (section 5)
js/request-panel.js    → the pinned notice's helpers and the request details panel (items, Offer forms, urgency, drop-off)
js/chat-questions.js   → every chat question (who sees it, links, follow-ups); the words are in js/i18n/*.js
js/chat.js             → the "Ask KampongShare" chat widget (section 6.8)
js/geocode.js          → lookupPostalCode(): postal code → { address, latitude, longitude } via geocode-postal
js/styleguide-trackers.js → sample records for the tracker states on styleguide.html (section 12)
js/org-deadlines.js    → organization.html's deadline rows in "Needs your action" and "Also close the linked request?" (section 11)
js/messaging.js        → private messages: data functions, Realtime / polling, the top bar's unread count (section 10)
js/messages-page.js    → the messages.html component (UI only)
jsconfig.json          → turns on type checking for all .js files
img/og-default.png     → 1200×630 default preview image for shared links
netlify/functions/     → server code: score-request (AI urgency), match-items, chat-insights, event-caption, share-event, geocode-postal, delete-account, translate-messages (message translation, section 10)
netlify/lib/           → shared server code: ai.js (NVIDIA model + personal-data filter), urgency.js (score formula), score.js, messages.js (the server's own words in 3 languages), dates.js (Singapore dates, section 11)
netlify/functions/_lib/ → chat-help.md / chat-help.js: the chat's help text (generated — see 6.8)
supabase/migrations/   → database schema and changes (Supabase CLI)
scripts/               → check-supabase.js, check-contrast.js, check-i18n.js, seed.js, score-requests.js, build-chat-help.js (run with node)
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
- Load the fonts in each page's `<head>` with one Google Fonts `<link>`: `family=Fraunces:opsz,wght@9..144,600..700&family=Lexend:wght@400;700&display=swap`.
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
- No inline `style="..."` attributes, except for truly dynamic values.

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
- `jsconfig.json`: `{ "compilerOptions": { "checkJs": true, "target": "ES2022", "module": "esnext", "moduleResolution": "bundler", "maxNodeModuleJsDepth": 0, "skipLibCheck": true }, "exclude": ["node_modules", "css"] }` — the module settings let `npx tsc -p jsconfig.json --noEmit` find the Supabase types exactly like VS Code does, without checking library code.
- Fix the editor's red underlines before calling a task done. Netlify Functions are JavaScript too, so the whole project uses one language.

---

## 3. UI and design system

Design: follow DESIGN.md.

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
- **One exception — translating private messages (section 10):** the text of a message is sent to NVIDIA only to translate it for a reader whose language is different. Before sending, links, emails, phone numbers, NRIC/FIN and postal codes are replaced with placeholders (`[[L1]]`, `[[E1]]`, `[[P1]]`, `[[N1]]`) and put back afterwards; names written in the text can't be detected and may be sent. Each message is translated at most once per language (saved in `message_translations`), the reader can always see the original and can switch automatic translation off, the translated bubble has a "See original" button, and the privacy notice says so. Translations are never used for anything else (no ranking, no matching).

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
- The function reads the event using the **anon key** (env `SUPABASE_ANON_KEY`, the same public key as in `js/config.js`, so only approved events are returned), and replies with a small HTML page containing Open Graph tags: `og:title`, `og:description` (date, place, short description), `og:image` (`/img/og-default.png`), `og:url`, plus `twitter:card`. It then sends the visitor on to `/event.html?id=<id>`.
- **Escape every value** placed into the HTML. Unknown or unapproved IDs return the generic site preview.

### 5.3 Share panel

Shown on approved events in `organization.html` and on `event.html`. Pending events show "Waiting for admin approval" instead, with no share buttons.

- **WhatsApp:** `https://wa.me/?text=<encoded message>` — opens WhatsApp with the message ready; the user picks a chat or group.
- **Facebook:** `https://www.facebook.com/sharer/sharer.php?u=<encoded link>` (Facebook ignores pre-filled text; the preview comes from 5.2).
- **Phone share menu:** if `navigator.share` exists, a "Share…" button opens the phone's own menu (WhatsApp, Instagram, Telegram, Messages…).
- **Instagram:** Instagram has no web share link and captions don't have clickable links. Provide **"Download poster"** (a 1080×1350 PNG made in the browser with `<canvas>`, laid out as in DESIGN.md 12, in the chosen language, with a QR code to the short link; the QR library `qrcode-generator@1.4.4` loads from cdnjs only when needed) and **"Copy caption"**.
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
- **Most needed:** up to 6 open requests sorted by `ai_score` (highest first, unscored last), as pinned notices (slightly tilted, like every noticeboard): category, urgency level, title, organization, a progress bar, how much is still needed and when it ends, and one Offer button that opens the request details panel (urgency, "Why this score?", description, drop-off and each item's Offer form).
- **Upcoming events:** small Leaflet map + next 3 events, linking to `event.html`.
- **"What can you give?"** matching box (6.4).
- "How it works" in 3 steps, and a footer link to `privacy.html`.

### 6.3 Browse needs — `needs.html`

- All open requests, with filters: category, area, urgency level, and a text search on title / item name. Filters live in Alpine state; remember them in the URL query (no personal data).
- Each notice has one **Offer** button that opens the request details panel; each item in it has its own Offer form. Logged-in donors offer directly. Visitors go to `login.html?next=/needs.html?item=<item id>`, and come back with the panel open at that item's offer form.

### 6.4 Try matching without an account — Netlify Function `match-items`

- A text box (max 300 characters): "What can you give? e.g. 5 bags of rice, baby diapers".
- The function: removes anything that looks like personal data (phone numbers, emails), asks NVIDIA Build to turn the text into items `{ name, category, quantity }`, then scores open request items (category match, remaining quantity, deadline, AI urgency score; area if the user is logged in) and returns the **top 5 matches with a one-line reason each**.
- **Rate limit** with Netlify's built-in config (the free plan allows 2 rules: one here and one on `chat-insights`, both public. `event-caption` has no rule left; it only answers a logged-in organization owner or admin):
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
- The page also sends `lang` (`en`, `zh` or `ms`; anything else → 400): the one-line reasons come back in that language (from `netlify/lib/messages.js`). The AI writes item names in English even for Chinese or Malay text, so they match the organizations' items.

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

### 6.6b Logged-in viewers on public pages

`index.html`, `needs.html`, `event.html` and `org.html` adapt to who is looking. Logged-in users can always open them and are never redirected away; after login they still go to `?next=` or their dashboard.

- `getViewer()` (js/auth.js) returns `null` for visitors, or `{ role, isDonor, isVolunteer, hasConsent, volunteerApproved, dashboardUrl, orgId }` from the `profiles` table (never `user_metadata`), with no personal details. Public pages mix in `publicViewer()` and show skeletons until `viewerReady`, so the visitor version never flashes.
- **Top bar (desktop, DESIGN.md 6.6):** the logo goes home. Visitors see Browse needs · Log in · Sign up · a settings menu (theme, language); logged in: Browse needs (not admins) · the dashboard's sections (or My dashboard) · Messages · the avatar menu (profile, Donating / Volunteering switch, theme, language, log out). Current page has `aria-current="page"`. Phones and tablets (below 1024px) use the bottom navigation.
- **Home hero:** visitors see the sign-up buttons; logged-in users see "Go to my dashboard" plus Browse needs (donors), Find events (volunteers), Post a request (organizations, opens the form via `organization.html?new=request`) or Review queue with the number waiting (admins).
- **Offer / Donate** (`donorView()`): visitors log in first (`?next=`); donors offer directly; individuals without donating get "Turn on donating in your profile" with a button; organizations and admins see no AI box, Offer or Donate buttons, just "This is what donors see."
- **Volunteer** (`volunteerView()`): visitors log in first; volunteers apply directly (`event.html?id=…&apply=1` opens the form) or see their application status; individuals without volunteering get "Turn on volunteering"; pending accounts see the approval note; organizations and admins see "This is what volunteers see."
- **Own content:** an organization sees "Your organization · Manage" on its own requests, events and org page; admins see "Open in admin" (`admin.html?queue=…&tab=…`).
- Never show anyone's personal data on these pages, logged in or not (6.1); a user only sees their own offers and applications.

### 6.7 No guest donations

Offers always need an account: the organization needs a way to arrange drop-off, we need PDPA consent, and accounts discourage fake offers. Make sign-up quick instead.

---

### 6.8 Chat assistant — "Ask KampongShare"

- A round chat button bottom-right on every page (above the phone bottom bar; icon only, its name "Ask KampongShare" in `aria-label` and a `title` tooltip) opens a panel (full screen on phones) with **suggested questions** (chips) and a **text box** for your own question ("Ask about KampongShare…", max 300 characters with a counter, Enter or Send; hint: "I can only answer questions about KampongShare."). Only questions about KampongShare are answered.
- Questions, follow-ups and links live in `js/chat-questions.js`; their words (labels and pre-written answers, max 80 words) are translation keys `chat.q.<id>.label` / `.answer` in `js/i18n/*.js`; each question's `show(viewer)` uses `getViewer()` so people only see questions that fit them (e.g. organization questions for organizations). Groups: Getting started · For organizations · Your account · Right now · About · Privacy. "Your account" (sign up, log in / out, forgot password, change details, delete account) describes only what the site really does: there is no password reset or password change yet (email the address in the Privacy Notice), the email can't be changed, individuals delete their own account on Profile, organization accounts email the Privacy Notice address. "Start over" returns to the first questions.
- **Right now** questions (most needed, ending soon, upcoming events, needs by area) call the Netlify Function `chat-insights`: it accepts only a question id from a fixed list (and an area from `SG_AREAS`), anything else → 400. It reads **public data only, with the anon key**, and never queries profiles, offers, applications or tasks. **The code picks the results** (max 6); the AI only writes a 2–3 sentence summary (max 60 words) of those facts — item names, categories, quantities, deadlines, area names and event dates, never descriptions or other free text. If the AI fails, a template sentence is used. Every request also carries `lang` (the site's language; anything but `en`, `zh` or `ms` → 400): summaries and template sentences come back in it. Returns `{ summary, ai, request_item_ids, event_ids, areas? }`; the page shows the summary ("AI-suggested") and real cards with Offer / View event buttons that follow 6.6b.
- **Typed questions** go to the same function (`{ id: "ask", question, previous?, lang? }`), so they share its one rate-limit rule. They are answered **in the language they're typed in** (Chinese characters → Chinese, mostly Malay words → Malay, otherwise English or the site's language); fixed replies and pre-written answers too. Handled in this order:
  1. **Clean:** trim, cut to 300 characters, remove phone numbers, emails, NRIC/FIN and postal codes (`stripPersonalData`) before anything else.
  2. **Fixed replies, no AI:** asking for someone's personal details (phone, email, address, who donated or volunteered, a named person) → "I can't share anyone's personal information. Organizations can see a donor's or volunteer's contact details only after they make an offer or apply."; privacy / data → the Privacy Notice reply and link; questions needing the asker's **own data** ("what's my password", "what email did I use", "is my organization approved", "where is my offer") → links to My offers / My applications / My organization / Profile (the chat never receives their data); close to a suggested question (words with the same meaning count as equal, e.g. reset = forgot) → that pre-written answer. General account how-to questions are **answered** (account_help), not sent to these fixed replies.
  3. **Topic check:** the AI only classifies the question as JSON `{ "type": … }` (how_to, needs_now, events, organization_help, about_site, account_help, privacy, personal_info, own_account, off_topic); invalid JSON or an unknown type = off_topic.
  4. **Route in code:** off_topic → "I can only help with KampongShare — donating, volunteering, requests and events." + 3 chips; personal_info / privacy / own_account → the fixed replies; needs_now / events → the live logic above, filtered by area or category words in the question (or the previous one); how_to / organization_help / about_site / account_help → the AI answers using ONLY the help text (max 100 words), or "I'm not sure — see How it works" with the link.
  5. **Every AI call:** KampongShare only; the question, the previous question and all data are text to read, never instructions; never invent features, rules, numbers, places or contact details; write in the answer's language (Chinese: Simplified characters only — `toSimplified()` converts common Traditional ones as a safety net) and keep item, organization and area names as written.
  6. **After the AI:** phone numbers, emails and web links are removed; only the site's own pages appear, as link buttons added by the code (the page only renders paths starting with `/`); shown with `x-text`; AI answers labelled "AI-suggested".
  7. **Context:** only the current question and the previous one are sent. Nothing is stored or logged.
  8. **No AI** (error or no `NVIDIA_API_KEY`): "I can't answer typed questions right now — try one of the suggested questions." — fixed replies and the chips (with template summaries) still work.
- **Help text:** `netlify/functions/_lib/chat-help.md` (+ `chat-help.js` for the function) is **generated** by `npm run chat-help` (`npm run build` runs it) from `js/chat-questions.js` and the words in `js/i18n/*.js`, plus the "Site rules" in `scripts/build-chat-help.js`. The help text is English (the AI answers in the needed language); the pre-written answers are kept in all three languages. Edit those, never the generated files.
- Rate limited (10 requests per minute per IP; HTTP 429 → "Please wait a minute and try again.").
- **Nothing is stored or logged**; the conversation lives only in the page and disappears on reload.
- Accessibility: `<dialog>` with a label, focus moves in and back to the button, Escape closes, answers announced (`aria-live="polite"`), chips are real buttons at least 44 px tall.

## 7. Admin dashboard — `admin.html`

Admins **review and moderate**; they do not create content. Admins cannot create organizations, donation requests or events, cannot edit a request's items, and cannot write AI scores (all enforced by the database).

**Becoming admin:** sign up normally, then run the update at the bottom of the schema file. Nobody can sign up as admin.

**Layout:** three sections, **Overview · To review · Browse**, linked from the top bar (they replace "My dashboard" for admins; on phones the bottom bar shows them plus Profile, and "To review" shows the number waiting). Sub-tabs inside a section use the tabs pattern (`role="tablist"` / `"tab"` / `"tabpanel"`, `aria-selected`, roving tabindex, ← → Home End). The place is kept in the URL hash, e.g. `#review/requests`, `#review/requests?item=<id>` (opens that item), `#browse/offers?view=history&q=…`, so reloading keeps it and back / forward move between tabs. Code: `js/admin-dashboard.js` (UI) and `js/admin-data.js` (data, reusing the existing database functions). Phones: main tabs stay at the top, sub-tabs scroll sideways, one column.

### 7.1 Overview

- Four count cards: Organizations, Requests, Events, Volunteers waiting (volunteer accounts). Each links to its "To review" sub-tab.
- "Waiting longest": the 5 oldest pending items of any kind, each linking to it.
- "Recently closed or cancelled" (last 7 days) and the public impact numbers (`public_stats`).

### 7.2 To review (Approve / Reject; reject asks for an `admin_note`)

- Sub-tabs Organizations · Requests · Events · Volunteers, each with a count; the "To review" tab shows the total waiting. Oldest first.
- **One shared review card** for every kind: type, title, who sent it, "Waiting 2 days", 2–3 key details, and View details · Reject · Approve (primary).
- **View details** opens a side panel (`<dialog class="side-panel">`: a sheet on the right on desktop, full screen on phones) with everything needed to decide, plus Approve / Reject. Closes with the button, Escape or the backdrop; focus returns to the card.
- **Reject** opens a dialog with quick reasons ("Missing details", "Couldn't verify the organization", "Not suitable for the platform", "Duplicate") that fill the note, plus a text box; the note is required.
- After an action: a toast, the card disappears, every count updates. Empty sub-tab: "All caught up ✓".

The kinds and what the panel shows:

1. **Organizations** — `organizations.approval = 'pending'`: name, description, address, map pin, phone, owner's name and phone (emails live in Supabase's auth system and aren't readable from the browser). Approve → it can post requests and events.
2. **Donation requests** — `status = 'pending_approval'`: organization, title, items and quantities, deadline, urgency. Approve → `status = 'open'`; Reject → `status = 'rejected'`.
3. **Events** — `approval = 'pending'`: organization, title, place, date and time, linked request. Approve → appears on the map and can be shared.
4. **Volunteers** — **volunteer accounts** waiting for approval (`profiles.volunteer_approval = 'pending'`: phone, area, availability, interests, skills). Event applications aren't here: each event's organization decides on them (section 1); admins can only see them in Browse → Applications.

### 7.3 Browse (replaces the old monitoring and History sections)

- Sub-tabs Organizations · Requests · Events · Offers · Volunteers (accounts) · Applications (event applications) · Reported (reported messages, section 10), each with the same filter chips **Active · History · All** and a search box (name / title).
- A compact table on wide screens, cards on phones; newest first, 20 at a time with "Show more"; shared status badges.
- The occasional actions, each with a confirm dialog:
  - **Organizations:** reject an approved organization later (e.g. after a complaint) — this hides its requests and events from the public automatically; approve a rejected one again.
  - **Requests:** close a request (optional reason) or edit its title, description, urgency and deadline (in the side panel).
  - **Events:** cancel an event (required reason, volunteers see it).
  - **Offers:** cancel a suspicious offer.
- Show personal data (phones, postal codes) only on screens where admins need it for a review (the details panel, and donor / volunteer names in Browse for moderation).

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
- Follows DESIGN.md and sections 2 and 4–12 of this file.
- Every new text uses a translation key in all three language files; `node scripts/check-i18n.js` passes.
- No `// @ts-check` warnings in changed files.

---

## 9. Languages

The site speaks **English**, **简体中文** (Simplified Chinese, as used in Singapore) and **Bahasa Melayu** (as used in Singapore).

- **Every text the site itself shows uses a translation key in all three files** — `js/i18n/en.js` (the source), `zh.js` and `ms.js` — grouped by page (`common.save`, `signup.title`…): headings, labels, buttons, placeholders, helper text, toasts, dialogs, empty states, loading text, aria-labels and page titles. Never write English straight into HTML or JS again.
- **User-written content is never translated:** request titles and descriptions, item names and units, organization names, descriptions and addresses, messages, cancel and close reasons, admin notes, places. Show them as entered. (Stored AI explanations stay in the language they were written in; "Why this score?" factor names are translated.)
- **In code:** `t("key", { name })` in JS, `x-text="$t('key')"` in Alpine, `data-i18n="key"` on static HTML (only on elements that hold just text), `data-i18n-rich` for text with `**bold**`, and `data-i18n-attr="aria-label:key; placeholder:key"` for attributes. A `{ one, other }` entry is a plural. Missing keys fall back to English (with a console warning only on localhost).
- **Fixed values** (statuses, urgency, categories, roles, days, times, interests, skills) always go through `enumLabel(kind, value)` (or `enumOptions()` for pickers); area names through `areaLabel()` (Chinese uses the official place names; stored values never change).
- **Database messages:** every `raise exception` message in `supabase/migrations/` has a pattern in `DB_ERRORS` (js/ui.js), e.g. `Only % % of "%" still needed` → `errors.db.onlyStillNeeded`; `friendlyError()` uses it. An unknown message shows "Something went wrong" plus the original English. **A new migration message needs a new entry and keys in all three files.**
- **Dates and numbers** use `Intl` with `en-SG`, `zh-SG` or `ms-SG` (`formatDate`, `formatNumber`). The downloaded share poster uses the language the person chose.
- **Language choice** on every page, inside the avatar menu (logged in) or the settings menu (visitors, whose button also shows EN / 中文 / BM): a `menuitemradio` group with each language in its own script and `lang` attribute, no flags; the menu button's label always includes "Language / 语言 / Bahasa — <current>". Saved in `localStorage` (`ks-lang`, try/catch); a first visit follows the browser if it's Chinese or Malay, otherwise English. Switching updates the page without a reload and sets `<html lang>` to `en`, `zh-Hans` or `ms`.
- **AI:** `match-items` and `chat-insights` get the chosen `lang`; summaries, reasons and template sentences come back in it, and typed chat questions are answered in the language they're typed in (6.8). Only the language code is added — no personal data (4.6).
- **Server words** (chat fixed replies, templates, match reasons) live in `netlify/lib/messages.js`, with the same keys in all three languages.
- **Lists that are built once** (review cards, Browse rows, tabs, filters): give their words as getters or translation keys (`labelledOptions()`, `enumOptions()`, `get label() { return t(…) }`), never as fixed strings, so a language switch redraws them without a reload. Lists of stored values (interests, skills, days) are shown with `enumList()`.
- **Check:** `node scripts/check-i18n.js` (also `npm run check:i18n`) covers the **whole app**: same keys and `{placeholders}` in every language, every key used in code exists, every database message is translated, no untranslated text in any page or Alpine expression, and no English text left in `js/` (read with TypeScript's parser). Sample data and code that stay as they are get the standard HTML `translate="no"`; a JS line that is never shown to people (a stored value, a developer error) gets a `// i18n-ignore` comment (or an `i18n-ignore-start` / `i18n-ignore-end` block). The Chinese and Malay translations, especially the privacy notice, still **need review by a native speaker**.
- **Phone width:** keep labels for tabs, chips, buttons and table headers short in every language (Malay is often the longest) and check at 360 px. Tab lists scroll sideways on phones and the selected tab is always scrolled into view (`revealSelectedTabs()` in js/ui.js); no page may scroll sideways.

---

## 10. Messaging

Private messages between **individuals and organizations** (the organization is the hub). The rules live in `supabase/migrations/20261028040000_messaging.sql`; the list comes from `my_conversations()` (`20261028050000_my_conversations.sql`, replaced by `20261028130000_my_conversations_deleted_at.sql`). "Delete conversation" is in `20261028120000_conversation_soft_delete.sql`.

**Who can message whom (enforced by the database):**

- A donor or volunteer (individual account with consent and 18+) → any **approved** organization, at most 5 new conversations per 24 hours ("You've started a lot of new conversations today…" shown kindly).
- An organization → only donors who offered on its requests and volunteers who applied to its events.
- Donors and volunteers never message each other; visitors and admins can't message. One conversation per organization–person pair (starting again reopens it).
- Text only, 1–1,000 characters, at most 20 messages per 5 minutes per sender. Messages can't be edited or deleted.

**In code:**

- Start, block / unblock and mark read **only** with `supabase.rpc('start_conversation' | 'set_conversation_blocked' | 'mark_conversation_read')`. Insert a message with **only** `conversation_id` and `body`; the database fills in the sender and time. The list (other side's name, unread count, last message) comes from `rpc('my_conversations')`: individuals see the organization's name, organizations see the person's name (nothing else from their profile).
- Plain functions in `js/messaging.js`; the page component in `js/messages-page.js`. Show the database's message in friendly words (`friendlyError`, `DB_ERRORS`) whenever something is refused.
- Message text is shown with `x-text` only (links stay plain text, not clickable). **Never `console.log` message text or translations.** Messages go to the AI only for automatic translation (below).

**`messages.html`** (requires login):

- Desktop: conversation list on the left, open conversation on the right; the page fills the screen below the top bar (no visible header; the "Messages" title is for screen readers and the translate switch sits at the bottom of the conversation list), so the text box and Send are always in view, and the chat button is hidden while a conversation is open. Phones: the list first; a conversation opens full screen with a Back button (the bottom bar and chat button are hidden there). The open conversation is kept in the hash (`#c=<id>`, ID only).
- List items: the other side's name, the topic, a preview of the last message ("You: …" for mine), the time (`last_message_at`) and an unread dot. Newest first.
- Conversation: bubbles (mine right, theirs left), dates between days, "Show earlier messages" (50 at a time), a one-line text box that grows as you type (max 1,000 characters, no visible label, hint or counter: the label and the hint are for screen readers; Enter sends, Shift+Enter adds a new line) and an icon-only Send button (paper plane, named "Send" for screen readers), disabled until something is typed; an empty message is never sent and shows no error.
- A safety note at the top of every conversation: "Donations on KampongShare are always free. Never send money, bank details or passwords."
- Opening a conversation (and a new message arriving while it's open and visible) calls `mark_conversation_read`.
- Organization no longer approved: "This organization is no longer available" and sending is disabled.
- **Block / Unblock** in the conversation's menu (confirm: "Neither of you will be able to send new messages"). Blocked conversations show "Blocked", disable the text box and say who can unblock (only the side that blocked).
- **Report** on each message from the other side: quick reasons "Asked for money", "Rude or harassing", "Spam", "Something else" plus details (max 300 characters). Reporting the same message twice is refused kindly.
- **Delete conversation** (danger item in the conversation's menu) removes it from **my inbox only**, using only `supabase.rpc('delete_conversation_for_me', { p_conversation_id })`. **Nothing is ever deleted from the database.** Confirm dialog: "Delete this conversation? It will be removed from your inbox only. <name> will still have their copy. If they send a new message, the conversation will come back with only the new messages." plus "Want to report a message? Report it before deleting." (Cancel · Delete). Afterwards: the conversation closes, leaves the list, a toast "Conversation deleted", and the unread count updates.
  - List rule: hide a conversation when my side's delete time (`my_deleted_at` from `my_conversations()`: `person_deleted_at` for individuals, `org_deleted_at` for organizations) is set and `last_message_at` is empty or not after it (`isHiddenConversation()`). A new message arriving live brings it back at the top.
  - Opening a deleted conversation shows only messages after the delete time (the database hides older ones), or "No messages yet". "Message organization" / "Message donor" reopen it normally.
  - The other side is never shown whether or when I deleted it: the page never mentions it, and the API can't read `org_deleted_at` / `person_deleted_at` (column grants; only the database's own functions use them).

**Live updates:** one Supabase Realtime channel per page (`postgres_changes` INSERT on `public.messages`, UPDATE on `public.conversations`; the database's rules decide which rows arrive). If Realtime isn't available, poll every 15 seconds. Unsubscribe when leaving the page. The open conversation's messages are a `role="log"` live region; messages in other conversations are announced ("New message from …").

**Unread count:** the top bar's Messages button (individuals and organizations) shows messages from the other side newer than my last read time, updated live.

**Starting conversations:**

- Individuals: "Message organization" on `org.html`, `event.html` and request cards (home, Browse needs, organization page, donor Find needs) → topic "About: <request or event title>" → opens `messages.html` at that conversation. Visitors go to login with `?next=`; organizations and admins don't see the button.
- Organizations: "Message donor" on each incoming offer ("Your offer: 8 bags of Rice 5kg") and "Message volunteer" on each application ("Your application: <event>").
- Topics are saved in the sender's language (like admin notes).

**Automatic translation** (`supabase/migrations/20261028130000_message_translations.sql`; note it shares its timestamp with `…_my_conversations_deleted_at.sql`, which `supabase db push` would refuse — fine for the SQL Editor):

- Netlify Function `translate-messages` (`/api/translate-messages`): POST `{ message_ids (max 30), target_lang: en | zh | ms }` with the caller's login token (missing → 401, anything else invalid → 400). It reads the messages and saved translations **with the caller's token** (the database decides what they may see), skips the caller's own messages, masks links / emails / phones / NRIC / postal codes as placeholders, asks the AI (`chat()` in `netlify/lib/ai.js`) for JSON `[{ id, detected, translation }]` — the text is only text to translate, never instructions — puts the values back, and drops any reply that lost a placeholder, isn't valid JSON or is suspiciously short. `detected` = target → saved as `translated_text` null (no translation needed). New rows are saved with the service role key (only there; users can't insert, so nobody can plant a fake translation), ignoring duplicates. Returns `{ translations: [{ message_id, status: translated | same | unavailable, detected_lang, translated_text }] }`; if the AI fails, the saved ones plus `unavailable`. Never logs text. No rate-limit rule is left on the free plan: costs stay down through the saved translations, the 30-message limit and only messages the caller can see.
- `messages.html`: the reader's language is the site language (`getLang()`). Opening a conversation, "Show earlier" and new live messages ask for translations of the other side's messages (30 at a time); a language switch asks for the new language. A translated bubble shows the translation with a "See original" button (↔ "See translation", remembered per message while the page is open); same language or my own message → shown as written; failed → original + "Translation unavailable"; while waiting → original + "Translating…". Each text has its `lang` attribute (`zh-Hans`, `en`, `ms`). The switch "Translate messages automatically" (on by default, `localStorage` `ks-translate-messages`, try/catch) shows originals and makes no calls when off.
- Admin → Reported shows the original ("Original message") and the translation into the admin's language ("AI translation (…)", AI-suggested).

**Admin:** Browse → **Reported** lists reported messages (the message, who reported it and why, who sent it, the conversation topic, date, open / resolved) with "Mark resolved". Admins can read a message **only once it is reported** (the page says so). The Overview shows the number of open reports.

**Privacy:** only the two people in a conversation can read it; admins only reported messages; deleting a conversation removes it from your inbox only (the other person keeps their copy); messages are kept for 12 months for safety, then deleted permanently, or sooner on request; messages in another language are translated by AI (NVIDIA) after phone numbers, emails and links are removed, saved once, and can be switched off (privacy.html, "How we use AI").

---

## 11. Deadlines and event end times

The rules live in `supabase/migrations/20261029040000_deadlines.sql`; the optional `20261029050000_deadline_auto_close.sql` tidies up once a day (needs the `pg_cron` extension).

**The rules (enforced by the database):**

- **Deadlines are whole days in Singapore time.** A request is **past its deadline** when `deadline < today in Asia/Singapore` (`sg_today()` in the database). A request with no deadline never passes it.
- A request past its deadline takes **no new offers** ("The deadline for this request has passed, so it isn't taking new offers"). Offers already made can still be accepted and delivered, and the organization can still extend the deadline or close the request.
- An event has **ended** when its end time (or its start time, if it has no end time) is before now; it is **happening now** when it has started but not ended. An ended event takes no new applications or approvals ("This event has already ended"); withdrawing and rejecting still work.
- `public_stats()` doesn't count past-deadline requests or ended events.
- **Auto-close (optional):** every day at 2 am Singapore time, open requests 7 days past their deadline are closed ("Deadline passed"; their waiting offers become "Request closed"), and upcoming / ongoing events that ended 3 days ago are marked completed.

**In code — one place:** `js/ui.js` has `sgToday()`, `isPastDeadline(request)`, `eventTiming(event)` (`'upcoming' | 'now' | 'ended'`), `hasEnded(event)`, `eventTimingBadge(event)`, `DEADLINE_BADGE` and `notPastDeadlineFilter()` (Supabase `.or()` filter). `isNotOver()` (js/events.js) and `todayIso()` (js/requests.js) use them. On the server, `netlify/lib/dates.js` has the same rules (`sgToday`, `daysUntil`, `notPastDeadlineFilter`, `notEndedFilter`); `urgency.js` counts days in Singapore time too. Never compare dates in the device's own time zone.

**Where it shows:**

- **Public pages:** home, Browse needs, organization pages and donor Find needs show only open requests that aren't past their deadline (`listOpenRequests`, `listOrgOpenRequests`); maps and event lists only events that haven't ended. A request reached through a link (`needs.html?item=`, `donor.html?request=`) after its deadline shows a "Deadline passed" card with no Offer buttons. `event.html`: "Happening now" while it runs; once ended, "This event has ended" (plus "How it went" if completed) and no Volunteer button; Donate skips a linked request that's past its deadline.
- **AI:** `match-items` and `chat-insights` never suggest past-deadline requests or ended events (events happening now still count). The chat explains the rules ("What happens after a deadline?").
- **Donors:** a pending offer on an open request past its deadline shows "Deadline passed — waiting for the organization"; accepted offers keep their drop-off instructions.
- **Volunteers:** ended events leave Find events; their applications move to History with "Event ended".
- **Organizations:** "Needs your action" sits at the top of the Overview and lists open requests past their deadline ("Extend deadline": a date picker, today or later · "Close request": the reason is pre-filled "Deadline passed") and events that have ended but are still upcoming / ongoing ("Mark completed" with an outcome summary · "Cancel event"), with the auto-close note. After marking an event completed or cancelled (here or in Events), if its linked request is still open: "Also close the linked request "<title>"?" → Close it (reason "Event ended") / Keep it open. Linking a request whose deadline is after the event's day shows a gentle warning (allowed). Badges: "Deadline passed" on requests; "Happening now" / "Ended" on events.
- **Admin:** the Overview's "Past their date" cards count open requests past their deadline and events that ended but aren't completed; each opens Browse with a filter (`#browse/requests?view=active&filter=past_deadline`, `#browse/events?view=active&filter=ended`) shown as a "Show all" note.

---

## 12. Tracking timeline

The step times are recorded by the database (`supabase/migrations/20261030040000_status_times.sql`), never by the page: offers `accepted_at`, `rejected_at`, `delivered_at`, `cancelled_at`; applications `applied_at`, `approved_at`, `rejected_at`, `withdrawn_at`. Older records only have the times that were known; a missing time shows "Date not recorded". An organization can add an optional note when it rejects an offer (`donation_offers.reject_note`, max 300 characters, only together with pending → rejected — `20261030050000_offer_reject_note.sql`).

**One shared tracker:** `buildTracker()` and the Alpine component `tracker` in `js/ui.js`, styled in `src/input.css` (`.tracker`, `.tracker-row` on cards, `.tracker-column` in the details panel; the look follows DESIGN.md 6.5). The steps come from `offerTracker()` (js/offers.js) and `applicationTracker()` (js/volunteering.js).

- Done step: filled `primary` circle with a tick; current step: marigold (`accent`) circle with a clock, `ink`-coloured icon (`on-accent`), one gentle pulse when it first appears (none with reduced motion); future step: empty dashed circle. The lines between steps turn green as steps complete.
- Under each step: its name and date (full date and time in the panel). One "what happens next" line under the current step, in the details panel only (cards show just the steps; "See timeline" has the rest).
- A journey that stopped ends at that step with an x (rejected, cancelled, withdrawn) or an archive box (request closed, deadline passed, event cancelled, event ended), its date and reason; later steps are hidden.
- Never colour alone: icon + words on every step; an ordered list with `aria-current="step"` and a hidden summary ("Step 2 of 3: Accepted").
- "See timeline" opens a `<dialog class="side-panel">` with the full timeline (`openSidePanel()` / `closeSidePanel()` / `onSidePanelEvent()`; focus goes back to the button).

**Offers:** Offer sent → Accepted → Delivered. Next: pending "Waiting for <organization> to reply"; accepted "Drop off by <deadline>" plus the drop-off instructions; delivered "Thank you!". Stops: Rejected (with the organization's note), Request closed (with its reason), Cancelled by you / by the donor, Deadline passed (pending offers on past-deadline requests). The panel shows the donor's message under "Offer sent", and the drop-off address plus "Message <organization>" under "Accepted". Delivered offers get the stamp "Delivered · Thank you!"; the first delivered stamp a donor sees also shows Pinny (`localStorage` `ks-pinny-thanks`, try/catch).

**Organization offers board** (`organization.html#offers`): columns New · Accepted · Delivered with counts (tabs with counts on phones); cards show the item, quantity, donor name and how long ago it was offered, plus the button that moves it on (Accept / Reject on New — Reject asks for the optional note — and Mark delivered on Accepted; Delivered shows the date, newest 10 then "Show more"). Buttons only, no drag and drop; moving a card shows a toast, updates the counts and moves focus to its new column. Tapping a card opens its timeline with the donor's details and "Message donor". History holds rejected and cancelled offers.

**Volunteer applications:** Applied → Approved → Event day (the event's start time) → Completed (the event marked completed; shown with its end time). Next: pending "Waiting for <organization>"; approved "See you on <date> at <place>" plus their tasks; event day "Happening now"; completed the outcome summary. Stops: Rejected (or "Removed by the organization" after approval), Withdrawn, Event cancelled (with the reason), Event ended (still pending). Shown on volunteer.html (cards and panel) and in each event's volunteer list on organization.html.

**Style guide:** every step and stop in both themes (sample data in `js/styleguide-trackers.js`).

