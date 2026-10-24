// @ts-check
// Fills the database with FICTIONAL demo data for the hackathon demo (REQUIREMENTS.md 4.9):
// made-up names, @example.com emails, clearly fake phone numbers (9000 00xx / 6000 00xx),
// real Singapore area names and approximate public locations only.
// Run with: node scripts/seed.js   (runs once — it stops if the demo accounts already exist)
// Uses the service role key from .env and never prints it.

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DEMO_PASSWORD = "DemoPass123!";
const MARKER_EMAIL = "demo.donor1@example.com";

// ---------------------------------------------------------------------------
// Demo content (all fictional)
// ---------------------------------------------------------------------------

/** @typedef {{ key: string, email: string, name: string, phone: string, area?: string, postal?: string, roles?: string[], role?: string, volunteer?: Record<string, unknown> }} DemoAccount */

/** @type {DemoAccount[]} */
const ACCOUNTS = [
  { key: "donor1", email: "demo.donor1@example.com", name: "Aisha Tan", phone: "90000001", area: "Tampines", roles: ["donor"] },
  { key: "donor2", email: "demo.donor2@example.com", name: "Ravi Kumar", phone: "90000002", area: "Jurong West", roles: ["donor"] },
  {
    key: "volunteer1", email: "demo.volunteer1@example.com", name: "Mei Ling Goh", phone: "90000003", area: "Toa Payoh", roles: ["volunteer"],
    volunteer: { available_days: ["sat", "sun"], available_times: ["morning"], interests: ["food distribution", "elderly care"], skills: ["first aid"], matching_opt_in: true },
  },
  {
    key: "both1", email: "demo.both1@example.com", name: "Daniel Lim", phone: "90000004", area: "Woodlands", roles: ["donor", "volunteer"],
    volunteer: { available_days: ["wed", "sat"], available_times: ["afternoon"], interests: ["children and education"], skills: ["tutoring", "driving"], matching_opt_in: false },
  },
  { key: "org1", email: "demo.org1@example.com", name: "Farah Ismail", phone: "90000011", role: "organization" },
  { key: "org2", email: "demo.org2@example.com", name: "Kevin Ong", phone: "90000012", role: "organization" },
  { key: "org3", email: "demo.org3@example.com", name: "Priya Nair", phone: "90000013", role: "organization" },
  { key: "org4", email: "demo.org4@example.com", name: "Jason Teo", phone: "90000014", role: "organization" },
];

/** Approximate, public, area-level locations (no unit numbers). */
const ORGANIZATIONS = [
  {
    key: "tampines", owner: "org1", name: "Tampines Kampong Pantry", phone: "60000001",
    address: "Tampines Central, near Tampines Hub, Singapore", latitude: 1.3536, longitude: 103.9447,
    description: "A neighbourhood food pantry run by residents. We pack weekly grocery bags for families who need a little help.",
  },
  {
    key: "westside", owner: "org2", name: "Westside Family Support", phone: "60000002",
    address: "Jurong West Street 52 area, Jurong West, Singapore", latitude: 1.3404, longitude: 103.709,
    description: "We support young families in Jurong West with baby supplies, household basics and school-going essentials.",
  },
  {
    key: "toapayoh", owner: "org3", name: "Toa Payoh Seniors Circle", phone: "60000003",
    address: "Toa Payoh Central, Toa Payoh, Singapore", latitude: 1.3343, longitude: 103.85,
    description: "Volunteers who visit and support seniors living alone — with hygiene kits, warm bedding and friendly company.",
  },
  {
    key: "woodlands", owner: "org4", name: "Woodlands Kids Learning Hub", phone: "60000004",
    address: "Woodlands Avenue 6 area, Woodlands, Singapore", latitude: 1.436, longitude: 103.7865,
    description: "Free after-school study space for primary school children, with books, stationery and healthy snacks.",
  },
];

/** @typedef {{ name: string, category: string, unit: string, needed: number }} DemoItem */
/** @typedef {{ key: string, org: string, title: string, description: string, urgency: string, days: number | null, dropoff: string, items: DemoItem[] }} DemoRequest */

/** @type {DemoRequest[]} */
const REQUESTS = [
  // Tampines Kampong Pantry
  { key: "t-groceries", org: "tampines", title: "Weekly grocery bags for 40 families", urgency: "high", days: 6,
    description: "Our pantry shelves are running low before the school holidays. Every bag feeds a family for about a week.",
    dropoff: "Tampines Central community room, weekdays 10am–5pm. Please call ahead for large drop-offs.",
    items: [{ name: "Rice 5kg", category: "food", unit: "bags", needed: 40 }, { name: "Cooking oil 2L", category: "food", unit: "bottles", needed: 30 }, { name: "Canned sardines", category: "food", unit: "cans", needed: 120 }] },
  { key: "t-breakfast", org: "tampines", title: "Breakfast items for school-going kids", urgency: "medium", days: 14,
    description: "Simple breakfast packs so children don't start the school day hungry.",
    dropoff: "Tampines Central community room, weekdays 10am–5pm.",
    items: [{ name: "Wholemeal bread", category: "food", unit: "loaves", needed: 50 }, { name: "Oat cereal", category: "food", unit: "boxes", needed: 40 }] },
  { key: "t-hygiene", org: "tampines", title: "Hygiene packs for new families", urgency: "low", days: 30,
    description: "Welcome packs for families who have just moved into rental flats in the area.",
    dropoff: "Tampines Central community room, Saturdays 9am–12pm.",
    items: [{ name: "Toothpaste", category: "hygiene", unit: "tubes", needed: 60 }, { name: "Bath soap", category: "hygiene", unit: "bars", needed: 80 }] },
  { key: "t-festive", org: "tampines", title: "Festive hampers for seniors", urgency: "medium", days: null,
    description: "Small festive hampers to bring some cheer to seniors living on their own.",
    dropoff: "Tampines Central community room, weekdays 10am–5pm.",
    items: [{ name: "Biscuit tins", category: "food", unit: "tins", needed: 30 }, { name: "Instant noodles (5-pack)", category: "food", unit: "packs", needed: 40 }] },

  // Westside Family Support
  { key: "w-baby", org: "westside", title: "Baby essentials for young families", urgency: "critical", days: 3,
    description: "Several new parents in our programme are running out of diapers and formula this week.",
    dropoff: "Jurong West community centre lobby, weekdays 9am–6pm.",
    items: [{ name: "Diapers size M", category: "baby", unit: "packs", needed: 30 }, { name: "Baby milk powder", category: "baby", unit: "tins", needed: 20 }, { name: "Baby wipes", category: "baby", unit: "packs", needed: 40 }] },
  { key: "w-household", org: "westside", title: "Household basics for a fresh start", urgency: "high", days: 10,
    description: "Families moving into empty flats need the basics to set up their homes.",
    dropoff: "Jurong West community centre lobby, weekdays 9am–6pm.",
    items: [{ name: "Cooking pots", category: "household", unit: "pieces", needed: 15 }, { name: "Bed sheets (single)", category: "household", unit: "sets", needed: 25 }] },
  { key: "w-uniforms", org: "westside", title: "School shoes and uniforms", urgency: "medium", days: 21,
    description: "New or gently used school shoes and uniforms for the new term.",
    dropoff: "Jurong West community centre lobby, Saturdays 10am–1pm.",
    items: [{ name: "School shoes (children's sizes)", category: "clothing", unit: "pairs", needed: 30 }, { name: "School socks", category: "clothing", unit: "packs", needed: 40 }] },
  { key: "w-cleaning", org: "westside", title: "Cleaning supplies", urgency: "low", days: 40,
    description: "Cleaning supplies for our shared family room and for families who need them at home.",
    dropoff: "Jurong West community centre lobby, weekdays 9am–6pm.",
    items: [{ name: "Laundry detergent", category: "household", unit: "bottles", needed: 30 }, { name: "Floor cleaner", category: "household", unit: "bottles", needed: 20 }] },

  // Toa Payoh Seniors Circle
  { key: "p-care", org: "toapayoh", title: "Care kits for seniors living alone", urgency: "critical", days: 5,
    description: "Monthly care kits for seniors we visit. Some have limited mobility and can't shop easily.",
    dropoff: "Toa Payoh Central activity centre, weekdays 9am–5pm.",
    items: [{ name: "Adult diapers", category: "hygiene", unit: "packs", needed: 25 }, { name: "Wet wipes", category: "hygiene", unit: "packs", needed: 40 }] },
  { key: "p-bedding", org: "toapayoh", title: "Warm bedding for the rainy season", urgency: "high", days: 12,
    description: "Blankets and pillows for seniors whose bedding is old and worn out.",
    dropoff: "Toa Payoh Central activity centre, weekdays 9am–5pm.",
    items: [{ name: "Blankets", category: "household", unit: "pieces", needed: 30 }, { name: "Pillows", category: "household", unit: "pieces", needed: 20 }] },
  { key: "p-nutrition", org: "toapayoh", title: "Nutritious food for seniors", urgency: "medium", days: 18,
    description: "Easy-to-prepare, healthy food for seniors on a tight budget.",
    dropoff: "Toa Payoh Central activity centre, Tuesdays and Thursdays 10am–4pm.",
    items: [{ name: "Oats", category: "food", unit: "packs", needed: 40 }, { name: "Low-sugar milk powder", category: "food", unit: "tins", needed: 25 }] },
  { key: "p-clothes", org: "toapayoh", title: "Comfortable clothes for seniors", urgency: "low", days: null,
    description: "Clean, comfortable everyday clothes in adult sizes M to XL.",
    dropoff: "Toa Payoh Central activity centre, weekdays 9am–5pm.",
    items: [{ name: "Cotton T-shirts (adult)", category: "clothing", unit: "pieces", needed: 40 }] },

  // Woodlands Kids Learning Hub
  { key: "k-books", org: "woodlands", title: "Back-to-school stationery", urgency: "high", days: 8,
    description: "Stationery for the children in our study programme before the new school term.",
    dropoff: "Woodlands Avenue 6 learning hub, weekdays 2pm–7pm.",
    items: [{ name: "Exercise books", category: "education", unit: "books", needed: 120 }, { name: "Colour pencils (12-pack)", category: "education", unit: "packs", needed: 50 }, { name: "School bags", category: "education", unit: "bags", needed: 20 }] },
  { key: "k-snacks", org: "woodlands", title: "Healthy after-school snacks", urgency: "medium", days: 15,
    description: "Snacks for 30 children who come straight from school to study with us.",
    dropoff: "Woodlands Avenue 6 learning hub, weekdays 2pm–7pm.",
    items: [{ name: "Packet drinks (no added sugar)", category: "food", unit: "cartons", needed: 60 }, { name: "Crackers", category: "food", unit: "packs", needed: 60 }] },
  { key: "k-readers", org: "woodlands", title: "Storybooks for our reading corner", urgency: "low", days: 45,
    description: "English and Mother Tongue storybooks for children aged 7 to 12.",
    dropoff: "Woodlands Avenue 6 learning hub, Saturdays 10am–1pm.",
    items: [{ name: "Children's storybooks", category: "education", unit: "books", needed: 80 }] },
];

/** @type {{ org: string, title: string, description: string, location: string, days: number, start: string, end: string, needed: number, request?: string }[]} */
const EVENTS = [
  { org: "tampines", title: "Food Packing Morning", days: 9, start: "09:00", end: "12:00", needed: 8, request: "t-groceries",
    location: "Tampines Central community room", description: "Help us sort donations and pack grocery bags for 40 families. No experience needed — we'll show you how." },
  { org: "toapayoh", title: "Senior Home Visits", days: 12, start: "14:00", end: "17:00", needed: 6,
    location: "Toa Payoh Central activity centre", description: "Visit seniors in pairs, deliver care kits and spend some time chatting. A short briefing is given before we start." },
  { org: "woodlands", title: "Back-to-School Book Drive", days: 20, start: "10:00", end: "13:00", needed: 10, request: "k-books",
    location: "Woodlands Avenue 6 learning hub", description: "Sort and wrap stationery packs for our students, then help with a fun reading session." },
  { org: "westside", title: "Community Clothing Sort", days: 28, start: "09:30", end: "12:30", needed: 4,
    location: "Jurong West community centre", description: "Sort donated school shoes and uniforms by size so families can pick what fits." },
];

/** Offers: inserted as pending, then moved to their final status (so the item totals update). */
const OFFERS = [
  { donor: "donor1", request: "t-groceries", item: "Rice 5kg", quantity: 10, status: "delivered", message: "Dropping off on Saturday morning." },
  { donor: "donor2", request: "w-baby", item: "Diapers size M", quantity: 8, status: "delivered", message: null },
  { donor: "donor1", request: "p-care", item: "Adult diapers", quantity: 5, status: "accepted", message: "I can bring them after work on Tuesday." },
  { donor: "both1", request: "k-books", item: "Exercise books", quantity: 30, status: "accepted", message: null },
  { donor: "donor2", request: "t-groceries", item: "Cooking oil 2L", quantity: 6, status: "pending", message: null },
  { donor: "both1", request: "w-baby", item: "Baby milk powder", quantity: 2, status: "pending", message: "Unopened tins, expiry next year." },
  { donor: "donor1", request: "k-books", item: "Colour pencils (12-pack)", quantity: 10, status: "rejected", message: null },
  { donor: "donor2", request: "p-bedding", item: "Blankets", quantity: 3, status: "cancelled", message: null },
];

const APPLICATIONS = [
  { volunteer: "volunteer1", event: "Food Packing Morning", status: "pending", message: "Free on weekend mornings — happy to help pack." },
  { volunteer: "both1", event: "Back-to-School Book Drive", status: "approved", message: "I tutor primary school kids and can help with the reading session." },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reads NAME=value lines from .env (tolerates spaces, quotes and # comments).
 * @returns {Record<string, string>}
 */
function readEnv() {
  /** @type {Record<string, string>} */
  const env = {};
  if (!existsSync(".env")) return env;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/);
    if (!match || line.trim().startsWith("#")) continue;
    env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return env;
}

/**
 * Today + n days as YYYY-MM-DD (local date).
 * @param {number} n
 * @returns {string}
 */
function dateIn(n) {
  const date = new Date();
  date.setDate(date.getDate() + n);
  return date.toLocaleDateString("en-CA");
}

/**
 * A Singapore-time timestamp n days from today at HH:MM.
 * @param {number} n
 * @param {string} time
 * @returns {string}
 */
function sgTime(n, time) {
  return `${dateIn(n)}T${time}:00+08:00`;
}

/** What was created so far, for the summary or a failure message. */
const created = { accounts: 0, organizations: 0, requests: 0, items: 0, events: 0, offers: 0, applications: 0 };

/**
 * Throws a readable error when a Supabase call fails.
 * @template T
 * @param {{ data: T, error: { message: string } | null }} result
 * @param {string} what
 * @returns {NonNullable<T>}
 */
function check(result, what) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  if (result.data == null) throw new Error(`${what}: nothing returned`);
  return /** @type {NonNullable<T>} */ (result.data);
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

/**
 * Creates the demo accounts and data once, then prints the demo logins.
 * @returns {Promise<void>}
 */
async function main() {
  const env = readEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env — add them first (see README).");
    process.exitCode = 1;
    return;
  }
  const db = createClient(env.SUPABASE_URL.replace(/\/+$/, ""), env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Run once only: stop if any demo account already exists.
  /** @type {string[]} */
  const existingEmails = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Checking existing accounts: ${error.message}`);
    existingEmails.push(...data.users.map((u) => (u.email ?? "").toLowerCase()));
    if (data.users.length < 1000) break;
  }
  if (existingEmails.includes(MARKER_EMAIL) || existingEmails.some((e) => e.startsWith("demo.") && e.endsWith("@example.com"))) {
    console.log("Demo data already seeded — nothing was changed.");
    console.log("(To start again, run supabase/reset_database.sql and the migrations in the Supabase SQL Editor, then this script.)");
    process.exitCode = 1;
    return;
  }

  console.log("\nSeeding fictional demo data…\n");

  // 2. Accounts (the database builds each profile from user_metadata).
  /** @type {Record<string, string>} account key → user id */
  const userIds = {};
  for (const account of ACCOUNTS) {
    const metadata = {
      full_name: account.name,
      phone: account.phone,
      privacy_consent: true,
      age_confirmed: true,
      ...(account.role ? { role: account.role } : { roles: account.roles, area: account.area }),
      ...(account.volunteer ?? {}),
    };
    const result = await db.auth.admin.createUser({
      email: account.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    });
    userIds[account.key] = check(result, `Creating ${account.email}`).user.id;
    created.accounts++;
  }
  // Demo volunteers are approved straight away (new volunteers normally wait for an admin).
  const volunteerIds = ACCOUNTS.filter((a) => a.roles?.includes("volunteer")).map((a) => userIds[a.key]);
  check(
    await db.from("profiles").update({ volunteer_approval: "approved" }).in("id", volunteerIds).select("id"),
    "Approving the demo volunteer accounts",
  );
  console.log(`  ✓ ${created.accounts} demo accounts (demo volunteers approved)`);

  // 3. Organizations (approved straight away).
  /** @type {Record<string, string>} org key → organization id */
  const orgIds = {};
  for (const org of ORGANIZATIONS) {
    const row = check(
      await db
        .from("organizations")
        .insert({
          owner_id: userIds[org.owner],
          name: org.name,
          description: org.description,
          address: org.address,
          phone: org.phone,
          latitude: org.latitude,
          longitude: org.longitude,
          approval: "approved",
        })
        .select("id")
        .single(),
      `Creating ${org.name}`,
    );
    orgIds[org.key] = row.id;
    created.organizations++;
  }
  console.log(`  ✓ ${created.organizations} approved organizations`);

  // 4. Open requests and their items.
  /** @type {Record<string, { id: string, items: Record<string, { id: string, category: string }> }>} */
  const requests = {};
  for (const request of REQUESTS) {
    const row = check(
      await db
        .from("donation_requests")
        .insert({
          organization_id: orgIds[request.org],
          title: request.title,
          description: request.description,
          urgency: request.urgency,
          deadline: request.days == null ? null : dateIn(request.days),
          dropoff_instructions: request.dropoff,
          status: "open",
        })
        .select("id")
        .single(),
      `Creating request "${request.title}"`,
    );
    const items = check(
      await db
        .from("request_items")
        .insert(request.items.map((item) => ({ request_id: row.id, name: item.name, category: item.category, unit: item.unit, quantity_needed: item.needed })))
        .select("id, name, category"),
      `Adding items to "${request.title}"`,
    );
    requests[request.key] = { id: row.id, items: Object.fromEntries(items.map((i) => [i.name, { id: i.id, category: i.category }])) };
    created.requests++;
    created.items += items.length;
  }
  console.log(`  ✓ ${created.requests} open requests with ${created.items} items`);

  // 5. Approved upcoming events.
  /** @type {Record<string, string>} event title → event id */
  const eventIds = {};
  for (const event of EVENTS) {
    const org = /** @type {(typeof ORGANIZATIONS)[number]} */ (ORGANIZATIONS.find((o) => o.key === event.org));
    const row = check(
      await db
        .from("events")
        .insert({
          organization_id: orgIds[event.org],
          title: event.title,
          description: event.description,
          location_name: event.location,
          latitude: org.latitude,
          longitude: org.longitude,
          starts_at: sgTime(event.days, event.start),
          ends_at: sgTime(event.days, event.end),
          volunteers_needed: event.needed,
          donation_request_id: event.request ? requests[event.request].id : null,
          approval: "approved",
          status: "upcoming",
        })
        .select("id")
        .single(),
      `Creating event "${event.title}"`,
    );
    eventIds[event.title] = row.id;
    created.events++;
  }
  console.log(`  ✓ ${created.events} approved upcoming events`);

  // 6. Offers: insert as pending, then move to the final status so item totals update.
  for (const offer of OFFERS) {
    const item = requests[offer.request].items[offer.item];
    if (!item) throw new Error(`Offer setup: no item "${offer.item}"`);
    const row = check(
      await db
        .from("donation_offers")
        .insert({
          request_item_id: item.id,
          donor_id: userIds[offer.donor],
          quantity: offer.quantity,
          message: offer.message,
          food_safety_confirmed: item.category === "food",
        })
        .select("id")
        .single(),
      `Creating an offer for ${offer.item}`,
    );
    const steps = offer.status === "delivered" ? ["accepted", "delivered"] : offer.status === "pending" ? [] : [offer.status];
    for (const status of steps) {
      check(await db.from("donation_offers").update({ status }).eq("id", row.id).select("id"), `Setting an offer to ${status}`);
    }
    created.offers++;
  }
  console.log(`  ✓ ${created.offers} offers (delivered, accepted, pending, rejected, cancelled)`);

  // 7. Volunteer applications.
  for (const application of APPLICATIONS) {
    check(
      await db
        .from("volunteer_applications")
        .insert({ event_id: eventIds[application.event], volunteer_id: userIds[application.volunteer], message: application.message, status: application.status })
        .select("id"),
      `Creating an application for ${application.event}`,
    );
    created.applications++;
  }
  console.log(`  ✓ ${created.applications} volunteer applications`);

  // 8. Demo logins.
  console.log("\nDone! Demo logins (all fictional, same password):\n");
  /** @type {Record<string, string>} */
  const describe = {
    donor1: "Donor (Tampines)",
    donor2: "Donor (Jurong West)",
    volunteer1: "Volunteer (Toa Payoh)",
    both1: "Donor + volunteer (Woodlands)",
    org1: "Organization — Tampines Kampong Pantry",
    org2: "Organization — Westside Family Support",
    org3: "Organization — Toa Payoh Seniors Circle",
    org4: "Organization — Woodlands Kids Learning Hub",
  };
  for (const account of ACCOUNTS) console.log(`  ${account.email.padEnd(30)} ${describe[account.key]}`);
  console.log(`\n  Password for all: ${DEMO_PASSWORD}`);
  console.log("  Admin: use your existing admin account.");
  console.log("\nRun `node scripts/check-supabase.js` to see the new totals.\n");
}

main().catch((error) => {
  console.log(`\nSeeding stopped: ${error instanceof Error ? error.message : error}`);
  console.log(`Already created: ${JSON.stringify(created)}`);
  console.log("Nothing else was changed. To start again from a clean database, run supabase/reset_database.sql and the migrations in the Supabase SQL Editor.");
  process.exitCode = 1;
});
