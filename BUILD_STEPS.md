# KampongShare AI — Build Steps

Work through these **in order, one at a time**. For each step:

1. Start a fresh Claude Code chat (`/clear`).
2. Paste the **Prompt**.
3. Run the **Test it** checklist yourself. Tick every box.
4. If something fails, paste the exact error into Claude (F12 → Console, the terminal, or Supabase → Logs). Fix the **first** error first.
5. When every box is ticked, run the **Save** command (it makes a save point on your computer). Only then go to the next step.

If a fix makes things worse: `git restore .` takes you back to your last save.

**Every time you work**, keep two terminals running:

```
npm run dev:css
npx netlify dev
```

and open **http://localhost:8888** (never double-click the HTML files).

---

## Test accounts

Create these during the steps (fictional details only, see REQUIREMENTS.md 4.9). Use the same password for all, e.g. `Test1234!`.

| Email                 | Sign up as                                    | Used for     |
| --------------------- | --------------------------------------------- | ------------ |
| admin@example.com     | Individual → donate (then made admin, step 5) | Admin        |
| org@example.com       | Organization                                  | Organization |
| donor@example.com     | Individual → donate                           | Donor        |
| volunteer@example.com | Individual → volunteer                        | Volunteer    |
| both@example.com      | Individual → donate + volunteer               | Both roles   |

Tip: use a normal window for one account and a private/incognito window for another, so you can test two roles side by side.

---

## Step 0 — The only manual part (about 15 minutes, once)

Everything runs **on your computer only** until the end. GitHub and Netlify come last (Steps 16 and 17).

**Install**

- [ ] **Node.js** (LTS) from nodejs.org
- [ ] **Git** from git-scm.com (used on your computer for save points, so you can undo mistakes)
- [ ] **VS Code** with the **Claude Code** extension
- [ ] Restart VS Code, then in its terminal `node -v` and `git --version` both print a version

**Have ready**

- [ ] Your Supabase project, with the tables already created (you've done this)

**Make the folder**

- [ ] Create an empty folder called `kampongshare` and open it in VS Code (File → Open Folder)
- [ ] Drag in the files: `REQUIREMENTS.md`, `BUILD_STEPS.md`, `kampongshare_schema.sql` and `reset_database.sql` (all in the main folder; Step 1 moves the SQL files into place)

**Secret keys rule (for every step)**
Claude must never show your secret keys in the chat. You type secret keys into `.env` yourself. Never paste the service_role key or NVIDIA key into a chat. If Claude ever asks you to, say no.

---

## Step 1 — Project files + local save points

**Prompt**

```
Set up this folder as a local git project. Do NOT connect to GitHub or any remote yet.
I'm a beginner: go one stage at a time, explain each command in one line, and stop and
wait for me whenever I need to do something.

1. Create CLAUDE.md containing exactly one line: @REQUIREMENTS.md
2. Create .gitignore with: node_modules, .env, .env.*, !.env.example, css/style.css,
   .netlify, supabase/.temp, supabase/.branches
3. Move kampongshare_schema.sql to supabase/migrations/ and rename it to
   <current UTC timestamp YYYYMMDDHHMMSS>_initial_schema.sql. Move reset_database.sql to
   supabase/reset_database.sql (NOT into migrations).
4. git init, branch main, and check `git check-ignore .env` prints .env
5. Ask me for my name and email, then set git user.name and user.email
6. First commit. Run git status first and stop if any .env file is listed.
7. Show me git log --oneline, and explain in two lines how I save (commit) and how I
   undo back to the last save (git restore .).
```

**Test it**

- [ ] The folder has `CLAUDE.md`, `.gitignore`, `supabase/reset_database.sql` and `supabase/migrations/…_initial_schema.sql`
- [ ] `git log --oneline` shows one save
- [ ] `git check-ignore .env` prints `.env`

**Save:** already saved by the prompt.

---

## Step 2 — Project skeleton and design system

**Prompt**

```
Set up the project skeleton from REQUIREMENTS.md. Don't build features yet.
Create: package.json with Tailwind CSS v4, netlify-cli and @supabase/supabase-js as dev
dependencies, and the dev:css and build scripts (2.1), then run npm install;
src/input.css with the full theme, base styles and component classes (section 3);
netlify.toml (build command, publish directory, /e/:id redirect from 5.2);
.env.example with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_PASSWORD,
NVIDIA_API_KEY (no real values); jsconfig.json (2.4); js/config.js (placeholders for the
Supabase URL and anon key), js/supabase.js, js/auth.js, js/ui.js, all starting with
// @ts-check; empty placeholder pages for every page in the file layout, each with the
shared head (font, css/style.css, Supabase client, Alpine.js) and a top bar;
styleguide.html showing every component from section 3 with sample data; README.md with
how to run locally and the PDPA breach note (4.10). Keep the existing .gitignore.
Then run npm run build and commit (no push).
```

**Test it** (start `npm run dev:css` and `npx netlify dev` in two terminals)

- [ ] `npm run build` finishes with no errors
- [ ] http://localhost:8888/styleguide.html shows teal buttons, cards, badges, form fields, a toast and a dialog
- [ ] The style guide looks fine at phone width (F12 → device toolbar → 360px), with no sideways scrolling
- [ ] Every page in the file layout opens (even if empty) with the top bar
- [ ] F12 → Console shows no red errors (a "Supabase not configured" warning is fine until Step 3)

**Save:** already saved by the prompt.

---

## Step 3 — Connect your existing Supabase project

You already created the tables in Supabase, so nothing is created here. This step only connects your website to them and checks they're the latest version.

**First, you (2 minutes)**

1. Supabase dashboard → **Project Settings → API**. Keep this page open.
2. In VS Code, if there's no `.env` file yet, copy `.env.example` and rename the copy to `.env`.
3. In `.env`, type these two lines yourself (copy the values from the Supabase page). **Never paste the service_role key into the chat.**
   ```
   SUPABASE_URL=your-project-url
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```
4. In Supabase, check two settings:
   - **Authentication → Sign In / Providers → Email:** "Confirm email" is **off**
   - **Authentication → URL Configuration:** Site URL is `http://localhost:8888`

**Prompt**

```
Connect this project to my existing Supabase project. The tables already exist; don't
create or change anything in the database.

SECRET RULES: never print, cat or echo .env or any key. Only say whether a value exists.

1. Check .env exists, is ignored by git (git check-ignore .env), and has SUPABASE_URL and
   SUPABASE_SERVICE_ROLE_KEY (say yes/no only, never the values). If anything is missing,
   tell me what to add myself and wait.
2. Ask me for the Project URL and the anon (public) key from Project Settings → API
   (the anon key is public by design, so it's fine in chat), and put them in js/config.js.
3. Write scripts/check-supabase.js (run with: node scripts/check-supabase.js) that never
   prints a key and:
   - reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env and the anon key from
     js/config.js, and confirms the URL in .env matches js/config.js
   - checks my database has the LATEST schema by asking the REST API (service role key,
     limit 0) for these columns: profiles.is_donor, profiles.consented_at,
     organizations.approval, events.approval, donation_requests.dropoff_instructions,
     donation_offers.food_safety_confirmed
   - calls the public_stats function with the anon key and prints the totals
   - prints a clear list: OK, or MISSING with what's missing
4. Run it and explain the result in plain words.
5. If anything is MISSING, stop and tell me: my tables are from an older version, so I
   should run supabase/reset_database.sql and then the file in supabase/migrations/ in
   the Supabase SQL Editor (this deletes test data). Wait, then run the check again.
6. When it's all OK: git status (stop if .env is listed), then commit (no push).
```

**If the check says MISSING:** in Supabase → SQL Editor, paste all of `supabase/reset_database.sql` → Run. Then paste all of `supabase/migrations/…_initial_schema.sql` → Run. Then tell Claude "done". This deletes all test accounts and data, which is fine at this stage.

**Test it**

- [ ] `node scripts/check-supabase.js` says everything is **OK** and shows the public totals
- [ ] "Confirm email" is off and the Site URL is `http://localhost:8888` (checked in Supabase)
- [ ] Reload http://localhost:8888/styleguide.html: no Supabase errors in the console (F12)
- [ ] `git status` doesn't list `.env`

**Save:** already saved by the prompt.

**Database changes from now on:** when Claude needs to change the database, it adds a new file in `supabase/migrations/` and tells you. You paste that file into the Supabase SQL Editor and Run. (To do this with one command instead, see "Link the Supabase command-line tool" at the end.)

---

## Step 4 — Sign up, log in, log out

**Prompt**

```
Build signup.html, login.html and js/auth.js following REQUIREMENTS.md sections 1
(account types and roles), 4.2 and 6.6 / 6.6a.
Sign-up: first choose individual or organization. Individuals tick "I want to donate"
and/or "I want to volunteer" (at least one) and pass them as options.data.roles;
organizations pass role: 'organization'. Required: name, email, password, privacy
consent checkbox (link to privacy.html) and 18+ checkbox, passed as privacy_consent and
age_confirmed. Optional: phone, postal code (6 digits), area. If volunteering is ticked,
show available days, available times, interests, skills, and the optional matching
opt-in (matching_opt_in). Support ?role= / ?roles= to pre-select and keep ?next=.
Login: email + password; after login go to ?next= (relative paths starting with / only)
or to the dashboard for profiles.role (admin → admin.html). Add logout to the top bar,
and the Donating / Volunteering switch for users with both roles. Show the database's
error message in friendly words when something is refused. Write privacy.html with the
plain-language notice from 4.2.
```

**Test it**

- [ ] Sign up **donor@example.com** (donate only) → lands on donor.html
- [ ] Sign up **volunteer@example.com** (volunteer only): the volunteer fields appear only when "volunteer" is ticked → lands on volunteer.html
- [ ] Sign up **both@example.com** (both) → the top bar shows the Donating / Volunteering switch, and it works
- [ ] Sign up **org@example.com** as an organization → lands on organization.html
- [ ] Sign up **admin@example.com** (donate only) for now
- [ ] Sign-up is blocked if the privacy or 18+ box isn't ticked; a bad postal code (e.g. `123`) shows an error
- [ ] Supabase → Table Editor → `profiles`: each account has the right `role`, `is_donor`, `is_volunteer`, and `consented_at` filled in
- [ ] Log out, then log in again → back on the right dashboard
- [ ] Logged out, open `login.html?next=/needs.html` and log in → lands on needs.html
- [ ] Logged out, open donor.html directly → sent to the login page

**Save**

```
git add . && git commit -m "step 4: sign up and login"
```

---

## Step 5 — Organization profile + admin approves organizations

**First, make the admin.** Run this in Supabase → SQL Editor:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'admin@example.com');
```

**Prompt**

```
Build the first part of organization.html and admin.html (REQUIREMENTS.md section 7).
organization.html: if the organization account has no organization yet, show a form to
create it (name, description, address, phone, and a small Leaflet map to drop a pin for
latitude/longitude). Then show its approval status: "Waiting for admin approval",
"Approved", or "Rejected" with the admin_note. Hide the request and event sections
until approved. After approval the name field is read-only (other details editable).
admin.html: summary cards from 7.1 (show counts; queues not built yet can say
"coming soon"), and the Organizations review queue from 7.2 with Approve / Reject
(reject asks for a note, with a confirm dialog).
```

**Test it**

- [ ] As **org@**: create the organization with a map pin → shows "Waiting for admin approval"
- [ ] As **admin@**: log in → lands on admin.html; the organization appears in the queue
- [ ] Reject it with a note → as **org@**, the note is shown
- [ ] As **admin@**: approve it (in Supabase you can set `approval` back to `pending` first, or approve directly) → as **org@**, it shows "Approved" and the name can't be edited
- [ ] As **donor@**: admin.html is not accessible

**Save**

```
git add . && git commit -m "step 5: organization profile and approval"
```

---

## Step 6 — Donation requests + admin approves requests

**Prompt**

```
On organization.html (approved organizations only), build "New donation request":
title, description, urgency, deadline, drop-off instructions, and several items added
with Alpine (name, category from the item_category enum, unit, quantity needed).
List the organization's own requests with status badges and each item's needed /
committed / received / remaining as the item progress bar from section 3. Editing
follows REQUIREMENTS.md "Editing after approval": everything editable while
pending_approval; after approval only quantities, deadline, urgency and drop-off
instructions, with the other fields read-only and the note shown. Add a Close button
(confirm dialog). On admin.html add the Donation requests review queue (7.2).
```

**Test it**

- [ ] As **org@**: create a request "Food for families" with 2 items (e.g. Rice 5kg, food, bags, 10; Cooking oil, food, bottles, 5) → status "pending approval"
- [ ] While pending, edit the title and remove/add an item → works
- [ ] As **admin@**: approve it → as **org@**, status is "open"
- [ ] As **org@**: change Rice to 15 → works; the title and items are now read-only
- [ ] Logged out (private window): the request is visible on needs.html or index.html if built, or check in Supabase that status is `open`
- [ ] Create a second request and have **admin@** reject it with a note → **org@** sees the note

**Save**

```
git add . && git commit -m "step 6: donation requests"
```

---

## Step 7 — Donors browse and offer

**Prompt**

```
Build donor.html (requires is_donor). Show open donation requests sorted by ai_score
(highest first, unscored last) then deadline, with organization name, area, deadline,
drop-off instructions and each item's remaining quantity. For each item, an Offer form:
quantity (max = remaining), optional message, and for food items the required food
safety checkbox (food_safety_confirmed). Follow the offer rules in REQUIREMENTS.md
section 1. Below, "My offers" with status badges; pending/accepted offers have a Cancel
button (confirm dialog); offers rejected because the request closed show
"Request closed"; accepted offers show the drop-off instructions prominently.
Show the database's message when an offer is refused.
```

**Test it**

- [ ] As **donor@**: the open request appears with remaining quantities
- [ ] Offer 20 bags when 15 are needed → refused with a clear message
- [ ] Offer rice without ticking the food safety box → refused
- [ ] Offer 8 bags of rice (box ticked) → shows in "My offers" as pending
- [ ] Try a second offer on rice → refused ("You already have an offer…")
- [ ] Cancel it, then offer again → works
- [ ] As **volunteer@** (volunteer only): can't open donor.html, or gets the "turn on donating" message

**Save**

```
git add . && git commit -m "step 7: donor offers"
```

---

## Step 8 — Organization manages offers

**Prompt**

```
On organization.html add "Incoming offers": offers on this organization's requests with
donor name, phone, item, quantity, message and status. Buttons: Accept / Reject for
pending offers, Mark delivered for accepted offers (confirm dialogs). Refresh item
progress bars after each action. Show the database's message if an action is refused.
```

**Test it**

- [ ] As **org@**: donor@'s offer appears with the donor's name and phone
- [ ] Accept it → the remaining quantity drops; as **donor@**, the status shows "accepted" with the drop-off instructions
- [ ] Mark delivered → the progress bar shows the received amount
- [ ] Make offers covering everything left (use **both@** too), accept them and mark them delivered → the request becomes **fulfilled** automatically
- [ ] On another request with a pending offer, Close the request → as the donor, that offer shows "Request closed"

**Save**

```
git add . && git commit -m "step 8: offers accepted and delivered"
```

---

## Step 9 — Events and the map

**Prompt**

```
Events, following REQUIREMENTS.md sections 1 (Events) and 7.2:
organization.html: create / edit events (title, description, place name, map pin,
start and end time, volunteers needed — at least 1, optional linked donation request
from its own requests), showing approval status. Editing an approved event's details
shows a warning that it will need approval again. Mark an event completed with an
outcome summary.
admin.html: the Events review queue.
Add a public events map (on index.html or a map section of needs.html — choose and tell
me) with Leaflet + OpenStreetMap attribution showing approved upcoming events as pins,
each linking to event.html?id=. Build a simple event.html (details + small map; the
Donate / Volunteer buttons can be placeholders until step 10).
```

**Test it**

- [ ] As **org@**: create an event needing 2 volunteers → "waiting for approval"; not on the map (check logged out)
- [ ] As **admin@**: approve it → the pin appears on the map; clicking it opens event.html
- [ ] As **org@**: change the event time → back to "waiting for approval", and the pin disappears until approved again
- [ ] The map works on a phone-width screen

**Save**

```
git add . && git commit -m "step 9: events and map"
```

---

## Step 10 — Volunteers

**Prompt**

```
Volunteering, following REQUIREMENTS.md section 1 (Volunteer rules):
volunteer.html (requires is_volunteer): approved upcoming events with spots left
("Event full" when full), Apply with an optional message, "My applications" with status,
Withdraw (pending or approved, confirm dialog) and Apply again (withdrawn), and
"My tasks" with a status dropdown (todo / in progress / done).
event.html: make the Volunteer button work (login ?next= flow for visitors; "turn on
volunteering" message for accounts without it) and the Donate button go to the linked
request or the organization's open requests.
organization.html: volunteer applications per event with name, phone, availability,
interests and message; Approve / Reject; remove an approved volunteer; assign tasks to
approved volunteers and see their status.
admin.html: the Volunteer applications review queue.
```

**Test it**

- [ ] As **volunteer@**: apply to the event → pending
- [ ] As **org@**: approve → as **volunteer@**, shows approved
- [ ] As **both@**: apply; as **org@**, approve → the event (2 spots) is now full
- [ ] Sign up another volunteer → "Event full", and applying is refused
- [ ] As **volunteer@**: withdraw → the spot frees up; apply again → pending
- [ ] As **org@**: assign a task to both@ → as **both@**, mark it done → **org@** sees "done"
- [ ] As **donor@** (donate only): pressing Volunteer shows the "turn on volunteering" message

**Save**

```
git add . && git commit -m "step 10: volunteers"
```

---

## Step 11 — Profile page

**Prompt**

```
Build profile.html following REQUIREMENTS.md 4.2, 4.4 and 6.6a: view and edit name,
phone, postal code, area; Donate / Volunteer toggles (at least one stays on; turning on
volunteering asks for the volunteer fields); volunteer availability, interests, skills
and matching opt-in; "Withdraw my consent" (confirm dialog) and, for users without
consent, a way to give it. Show the database's message if a change is refused.
Leave "Delete my account" as a disabled button labelled "coming soon".
```

**Test it**

- [ ] As **donor@**: turn on volunteering → fill in the volunteer fields → volunteer.html now opens
- [ ] Try turning both toggles off → refused with a message
- [ ] Withdraw consent → trying to offer is refused; give consent again → offering works
- [ ] Change the area → saved (check `profiles` in Supabase)

**Save**

```
git add . && git commit -m "step 11: profile page"
```

---

## Step 12 — AI donation matching (the MVP's one AI feature)

**First:** get an API key at build.nvidia.com, paste it into `.env` yourself as `NVIDIA_API_KEY` (never into the chat), and restart `npx netlify dev`.

**Prompt**

```
Build the Netlify Function match-items and the "What can you give?" box, following
REQUIREMENTS.md 4.6 and 6.4 exactly: strip personal data, ask NVIDIA Build to turn the
text into items, score open request items (category, remaining quantity, deadline,
urgency; area for logged-in users), return the top 5 with a one-line reason each,
rate limit config, never store or log the text, category-button fallback if the AI
fails. Results are labelled "AI-suggested" with an Offer button. Put the box on
donor.html now (index.html comes in step 13). Use NVIDIA Build's OpenAI-compatible
chat completions API; tell me which model you chose and why, and keep the model name
in one constant so I can change it.
```

**Test it**

- [ ] As **donor@**: type "5 bags of rice and some cooking oil" → matching food requests appear with reasons
- [ ] Type something with no matches (e.g. "a piano") → a friendly "no matches" message
- [ ] Type "call me at 91234567 I have rice" → still works; check the function code to confirm the number is removed before the AI call
- [ ] Remove the NVIDIA key from `.env` and restart → the category buttons appear instead of an error page; then put the key back
- [ ] F12 → Network: the NVIDIA key never appears in the browser

**Save**

```
git add . && git commit -m "step 12: AI matching"
```

---

## Step 13 — Visitor pages

**Prompt**

```
Build the visitor experience from REQUIREMENTS.md section 6: index.html home page
(hero, public_stats impact numbers, most urgent needs, events map preview, the
"What can you give?" box, how it works), needs.html (filters, Offer with the
?next= return to the item), and org.html (public organization page).
```

**Test it** (logged out, private window)

- [ ] The home page shows impact numbers that match what you delivered in step 8
- [ ] The most urgent needs and event pins show; no donor or volunteer names appear anywhere
- [ ] The matching box works without logging in
- [ ] On needs.html, press Offer → log in → you come back with that item's offer form open
- [ ] Filters on needs.html work
- [ ] Clicking an organization name opens org.html
- [ ] Everything works at phone width

**Save**

```
git add . && git commit -m "step 13: visitor pages"
```

---

## Step 14 — Sample data for the demo

**Prompt**

```
Write scripts/seed.js (run with: node scripts/seed.js) that uses the service role key
from .env and supabase.auth.admin.createUser to create fictional demo accounts
(@example.com, clearly fake phone numbers like 9000 0001), 4 approved organizations in
different Singapore areas (approximate public locations only), about 15 open requests
with varied deadlines and categories, 4 approved upcoming events, and a few offers in
different statuses. Follow REQUIREMENTS.md 4.9. The script must refuse to run twice
(check whether a demo account already exists) and print the demo logins at the end.
```

**Test it**

- [ ] `node scripts/seed.js` runs without errors and prints the demo logins
- [ ] Running it again stops with a "already seeded" message
- [ ] The home page, map and needs page look full and realistic
- [ ] AI matching gives sensible results on the seeded data

**Save**

```
git add . && git commit -m "step 14: demo data"
```

---

## Step 15 — Final check before the demo

**Prompt**

```
Review the whole project against REQUIREMENTS.md section 8 (definition of done) and
section 4 (privacy and security). List every problem you find — don't fix anything
yet. Include: secrets in frontend code or git, personal data in URLs or console logs,
innerHTML / x-html with user input, missing loading / empty / error states, pages that
break at 360px, missing labels or keyboard problems, and // @ts-check warnings.
```

Then fix the problems one at a time, testing after each.

**Test it**

- [ ] Run the full demo story twice, start to finish, with no errors:
      visitor tries matching → signs up as donor → offers → org accepts → delivered → fulfilled
- [ ] `git log` shows no commit containing `.env`; search the code for your keys (they should only be in `.env`)
- [ ] Every page works with keyboard only (Tab / Enter)
- [ ] Record a backup demo video

**Save**

```
git add . && git commit -m "step 15: demo ready"
```

---

## Step 16 — Go online, part 1: connect your GitHub repository

**Prompt**

```
Connect this local project to the GitHub repository I ALREADY created (don't create a
new one). I'm a beginner: go one stage at a time, explain each command in one line, and
stop and wait for me whenever I need to do something.

1. Run git status; stop if any .env file is listed or there are unsaved changes (ask me
   whether to commit them first). Confirm `git check-ignore .env` prints .env.
2. Check the GitHub CLI is installed (gh --version). If not, tell me to install it from
   cli.github.com, restart VS Code, and wait.
3. Check gh is logged in (gh auth status). If not, ask me to run `gh auth login` myself
   in the VS Code terminal (GitHub.com, HTTPS, yes, browser) and wait.
4. Ask me for my repository's address (green "Code" button → HTTPS, e.g.
   https://github.com/me/kampongshare.git). Check it's private (gh repo view); if it's
   public, ask me whether to make it private (gh repo edit --visibility private).
5. Add it as origin (if origin already exists, show git remote -v and ask first).
6. If the GitHub repository already has commits (e.g. a README, LICENSE or .gitignore
   GitHub created), pull them first with --allow-unrelated-histories. If .gitignore
   conflicts, keep every line from both versions and make sure .env is still ignored.
7. git push -u origin main, then open the repo in my browser (gh repo view --web).
8. Search everything that was pushed (git ls-files and the history) for .env files or
   anything that looks like a key, and report OK or what to fix. Don't print any key.
```

**Test it**

- [ ] Your GitHub repository (private) shows all your project files and your full save history (Commits)
- [ ] There's no `.env` on GitHub
- [ ] From now on, `git push` uploads new saves

---

## Step 17 — Go online, part 2: Netlify

**Prompt**

```
Deploy this project on Netlify with continuous deployment from my GitHub repository,
using the Netlify CLI (npx netlify). Check each command's flags with --help first.
Go one stage at a time and stop whenever I need to do something.

SECRET RULES: never print, cat or echo .env or any key. When setting environment
variables, read the values from .env inside the command or a small script so they are
never displayed.

1. Check I'm logged in (npx netlify status). If not, ask me to run `npx netlify login`
   myself and wait.
2. Make sure npm run build works and netlify.toml has the build command and publish
   directory. Commit and push if anything changed.
3. Ask me to run `npx netlify init` myself in the VS Code terminal, and before I do,
   tell me exactly what to answer to each question (create & configure a new site,
   my team, site name kampongshare-<something unique>, build command npm run build,
   publish directory ., connect to my GitHub repo). Wait for me to say done.
4. Set the Netlify environment variables SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
   NVIDIA_API_KEY from .env (not the database password). Show only the variable
   names afterwards (npx netlify env:list without values).
5. Trigger a deploy and show me the live URL. If it fails, read the deploy log and fix it.
6. Tell me exactly where to click in Supabase (Authentication → URL Configuration →
   Redirect URLs) to add the live URL, and wait for me to say done.
7. Explain that every git push now updates the live site automatically.
```

**Test it**

- [ ] The live URL (e.g. `kampongshare-xyz.netlify.app/styleguide.html`) shows the style guide
- [ ] Netlify dashboard → your site → Deploys shows a successful deploy linked to GitHub
- [ ] Make a tiny change (e.g. a word in README.md), commit and push → a new deploy starts by itself

**Save:** already pushed.

From now on, after each change: test locally, commit, then `git push`. The live site updates on its own.

**Also test on the live site:** sign up, log in, offer, AI matching (rate limiting only works on Netlify, not locally).

---

## Optional: Link the Supabase command-line tool

Only needed if you want database changes applied with one command (`npx supabase db push`) instead of pasting them into the SQL Editor. Do it any time after your database passes the Step 3 check.

**You first:** add your database password to `.env` yourself as `SUPABASE_DB_PASSWORD=...` (the one you chose when creating the project; if forgotten, reset it in Project Settings → Database). Don't paste it into the chat.

**Prompt**

```
Link the Supabase CLI (npx supabase@latest) to my existing project. Check each command's
flags with --help first; don't guess. One stage at a time; stop when I need to act.
SECRET RULES: never print .env, keys or the database password; pass the password from
.env inside a script, never in the chat or visible output.
1. Check I'm logged in (supabase projects list). If not, ask me to run
   `npx supabase@latest login` myself and wait.
2. supabase init (keep supabase/migrations and .gitignore).
3. Show my projects, ask which one is KampongShare, and link to it.
4. Run node scripts/check-supabase.js; continue only if everything is OK.
5. Mark every file already in supabase/migrations as applied on the remote database
   (supabase migration repair --status applied <version>) and confirm with
   supabase migration list.
6. Commit (stop if .env is listed in git status).
From now on, apply new migration files with npx supabase db push.
```

---

## Later (only if you finish early)

- AI urgency scoring with explanations (REQUIREMENTS.md 4.6)
- Event sharing: share panel, link previews, poster, AI caption (section 5)
- Test link previews on the live Netlify site after Step 17 (WhatsApp and Facebook can't read localhost)
- Delete my account (Netlify Function, section 4.4)
- Suspending users (section 7.4)
