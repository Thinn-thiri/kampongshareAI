# KampongShare AI

**The void deck noticeboard, online.** A community donation and volunteer platform for Singapore (hackathon prototype).

Local organizations pin what they need. Neighbours offer items or sign up to volunteer. AI ranks the most urgent needs, checks that a donation really fits before suggesting it, and finds volunteer events that suit you. **Humans always make the final decisions**, and every AI result is labelled "AI-suggested".

The full specification is in [REQUIREMENTS.md](REQUIREMENTS.md), the look and wording rules in [DESIGN.md](DESIGN.md), and the build order in [BUILD_STEPS.md](BUILD_STEPS.md).

## What it does

**For donors**
- Browse open requests as pinned notices, most urgent first, filtered by category, area and urgency.
- Offer against one exact item. The item shows its size, material, accepted condition and details such as "Halal-certified only". Every offer needs 1–3 photos of the real item; location data is removed before upload.
- Follow each offer on a timeline: Offer sent → Accepted (with drop-off instructions) → Delivered.

**For volunteers**
- Find upcoming events on a map and in a list, apply, and see places left ("Event full", "Happening now").
- Track applications and tasks from Applied to Completed.

**For organizations**
- Post requests and events once an admin approves the organization.
- Manage offers on a board (New · Accepted · Delivered) and compare what was needed with what was offered, photos included.
- Approve volunteers, assign tasks, and share events to WhatsApp, Facebook and Instagram (a poster with a QR code).

**For admins**
- Review organizations, requests, events and volunteer accounts.
- Browse everything with history, and handle reported messages.

**Everyone:** private messages with automatic translation, English · 简体中文 · Bahasa Melayu, light and dark mode, and "Pinny", the chat helper.

## How the AI is used

| Feature | What the AI does | What stays with code and people |
| --- | --- | --- |
| Urgency score | Writes a plain-English explanation | A transparent formula sets the score; "Why this score?" shows its factors |
| "What can you give?" | **AI #1** finds requests for each item; **AI #2**, a separate checker, compares each pairing with the general rules and the request's own rules: match / block / ask, with a reason | Code checks the request is open, before its deadline, and how much is still needed. If either AI fails, no plan is shown at all |
| "Find me where to help" | AI #1 picks events from your free time, interests and skills; AI #2 checks each event's written needs ("Driver with licence needed", "Must be able to lift 10 kg") | Your profile is used only if you allowed matching. A "not a fit" must quote your own words |
| Pinny (chat) | Answers questions about KampongShare and uses tools to search requests and events and prepare **drafts** | Nothing is sent until you press Confirm with your own login |
| Message translation | Translates a message into the reader's language | Phone numbers, emails and links are masked first; the original is always one tap away |

**Never sent to the AI:** names, emails, phone numbers or postal codes. Nothing the AI sees is stored or logged.

**The model:** the AI runs on the NVIDIA Build API, called only from Netlify Functions, so keys never reach the browser.

## Tech

- **Pages:** plain HTML and JavaScript (`// @ts-check` + JSDoc, no TypeScript) with Alpine.js.
- **Styling:** Tailwind CSS v4, built with the Tailwind CLI. This is the only build step.
- **Database and logins:** Supabase. Row Level Security and database triggers enforce every rule.
- **Server:** Netlify Functions, for the AI calls, link previews, postal code lookup and account deletion.
- **Maps and icons:** Leaflet + OpenStreetMap; OneMap for postal code → map pin; Phosphor icons.

## Run it on your computer

You need [Node.js](https://nodejs.org) (LTS) and Git.

1. **Install:**
   ```
   npm install
   ```
2. **Secrets:** copy `.env.example` to `.env` and fill in your own values. `.env` is never committed.

   | Variable | Used for |
   | --- | --- |
   | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Reading public data from Netlify Functions (the same public values as `js/config.js`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Server-only tasks (deleting accounts, saving translations, the demo seed). **Never put it in frontend code** |
   | `NVIDIA_API_KEY` | All AI features (build.nvidia.com). Without it the app still works with plain explanations, and the AI boxes say they can't check right now |
   | `ONEMAP_EMAIL`, `ONEMAP_PASSWORD` | Postal code → map pin (a free [OneMap](https://www.onemap.gov.sg/apidocs/register) account) |
   | `DEMO_PASSWORD` | The one password for all demo accounts (at least 8 characters) |

3. **Supabase connection:** put your Supabase Project URL and **anon** key in `js/config.js`. Both are public by design; the database rules protect the data. Never put the service role key there.
4. **Start two terminals:**
   ```
   npm run dev:css      # rebuilds css/style.css whenever you save
   npx netlify dev      # local web server + functions
   ```
5. **Open http://localhost:8888.** Don't double-click the HTML files. To see every shared component, open `/styleguide.html`.

## Database

- **Migrations:** the schema and every later change are in `supabase/migrations/`. Paste each file into **Supabase → SQL Editor → Run**, in order of the timestamp in the file name, or use `npx supabase db push` once the CLI is linked. Never edit a migration that has already been run; add a new one instead.
- **Becoming admin:** sign up normally, then run the `update` at the bottom of the first (schema) migration with your email.
- **Starting over:** `supabase/reset_data_keep_admins.sql` empties all data but keeps admin accounts. `supabase/reset_database.sql` wipes everything (test data only).

## Demo data

`npm run seed` builds a complete fictional demo world, with every action done by logging in as each user so the database rules apply for real:
- **Accounts and requests:** 10 accounts and 17 requests, including the "Make it fail" requests with Halal-only, size, low-salt and nut-free rules.
- **Offers:** 28 offers, each with photos, in every state.
- **Events:** 20 events, past, happening now and upcoming, with written needs.
- **People:** applications, tasks, and messages in English and Chinese.

It also writes **`DEMO.md`**:
- the logins (emails only);
- what to type to make each AI checker block, ask or match;
- what must never appear publicly.

1. Run `supabase/migrations/20261103090000_seed_backdate_times.sql` once, so timelines can show real past dates.
2. Set `DEMO_PASSWORD` in `.env`.
3. Run `npm run seed`. It runs only on an empty database; to start again, run `supabase/reset_data_keep_admins.sql` first.

`npm run seed -- --dry-run` checks the demo data without touching the database.

## Checks

```
npx tsc -p jsconfig.json --noEmit    # type check every .js file
npm run check:i18n                   # every text exists in English, Chinese and Malay
node scripts/check-contrast.js       # colour contrast in light and dark mode
npm run build                        # chat help text + minified CSS (Netlify runs this when deploying)
```

## Deploying (Netlify)

- **Continuous deploy:** the site deploys from this GitHub repository, so every `git push` to `main` updates the live site.
- **Environment variables:** set the same ones as `.env` in **Netlify → Site configuration → Environment variables**, but not `SUPABASE_DB_PASSWORD` or `DEMO_PASSWORD`, which are only needed on your computer.
- **Secrets scan:** `netlify.toml` tells Netlify's secrets scan to skip only `SUPABASE_URL` and `SUPABASE_ANON_KEY`, which are public on purpose. Every real secret is still checked.
- **Password reset links:** in Supabase → Authentication → URL Configuration, add the live site's `/reset-password.html`.
- **Rate limits:** `match-items` and `chat-insights` allow 10 requests per minute per visitor. This only works on Netlify, not locally.

## Folder layout

```
*.html                    one page per screen (home, dashboards, public pages, messages, profile…)
styleguide.html           every shared component with sample data
src/input.css             Tailwind source: theme colours + shared component classes (edit this)
css/style.css             generated by Tailwind (never edit, not committed)
js/                       page logic; js/i18n/ holds every text in 3 languages
netlify/functions/        server code: match-items, chat-insights, score-request, event-caption,
                          share-event, geocode-postal, translate-messages, delete-account
netlify/lib/              shared server code: AI calls, the two AI checkers, Pinny's tools, dates
netlify/functions/_lib/   generated chat help text and the general donation rules (general-rules.md)
supabase/migrations/      database schema and later changes
scripts/                  seed.js (demo data), checks, demo-photos/
```

## Privacy (PDPA)

The app follows Singapore's Personal Data Protection Act:
- it collects only what it needs (postal code and area, never a home address);
- it asks for consent, and separately for AI volunteer matching;
- it never sends personal data to the AI;
- it lets people view, correct and delete their data;
- it keeps history for 12 months.

See REQUIREMENTS.md section 4 and `privacy.html`.

**Data breaches:** in a real launch, a data breach that is likely to cause significant harm to the people affected must be reported to the **Personal Data Protection Commission (PDPC)**, and to the affected users, promptly. This must happen **within 3 calendar days** of assessing the breach as notifiable. A **Data Protection Officer (DPO)** would be appointed and named in the privacy notice as the contact for privacy questions.

All sample data in this project is fictitious: made-up names, `@example.com` emails, phone numbers starting 9000 00.
