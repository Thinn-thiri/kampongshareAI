// @ts-check
// Fills a freshly reset database with a FICTIONAL demo world for the hackathon (REQUIREMENTS.md 4.9):
// made-up people and organizations, @example.com emails, clearly fake phone numbers (9000 00xx),
// real Singapore area names and approximate, public, area-level locations only.
//
// How it works
// - Accounts are created with the service role (auth.admin.createUser) with the same user_metadata
//   the sign-up form sends, so the database's sign-up trigger builds each profile.
// - Every NORMAL action (posting, offering, accepting, delivering, applying, approving volunteers,
//   withdrawing, tasks, messages, reports) is done AS THAT USER: each one signs in with the anon key,
//   so every database rule and trigger applies exactly as in the app.
// - The service role is used only for admin steps (approving or rejecting organizations, requests,
//   events and volunteer accounts) and, AFTER the normal actions, to move dates into the past
//   (event times, a deadline, "offered 6 days ago"). Step times such as accepted_at are never
//   written: the database sets them.
// - Requests are scored with the app's own formula (netlify/lib/score.js); the AI writes the
//   explanation when NVIDIA_API_KEY is set.
//
// Run:   npm run seed               (needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY and
//                                    DEMO_PASSWORD in .env — the password is never printed)
//        npm run seed -- --dry-run  (checks the demo data below without touching the database)
// It runs once: if any non-admin @example.com account exists it stops. To start again, run
// supabase/reset_data_keep_admins.sql in the Supabase SQL Editor first.

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadRequest, scoreAndSave } from "../netlify/lib/score.js";
import { scoreRequest } from "../netlify/lib/urgency.js";

// ===========================================================================================
// The demo world (all fictional)
// ===========================================================================================

/**
 * @typedef {{ key: string, email: string, name: string, phone: string, kind: 'organization' | 'individual',
 *   roles?: string[], area?: string, postal?: string, volunteer?: Record<string, unknown>, show: string }} Person
 */

/** @type {Person[]} */
const PEOPLE = [
  // organization accounts (the person who runs it; the organization itself is in ORGANIZATIONS)
  { key: "pantry", email: "tampines.pantry@example.com", name: "Joanne Teo", phone: "90000001", kind: "organization",
    show: "Tampines Kampung Pantry: offers board (accept, deliver), chats with Siti and Ahmad (Malay), a closed request" },
  { key: "hearts", email: "jurong.hearts@example.com", name: "Kelvin Goh", phone: "90000002", kind: "organization",
    show: "Jurong Hearts Community Hub: 5 applications to approve (E12), an event ended but not completed (E3), a rejected offer" },
  { key: "circle", email: "toapayoh.care@example.com", name: "Mary Lee", phone: "90000003", kind: "organization",
    show: "Toa Payoh Care Circle: a request past its deadline in “Needs your action”, an event happening now, Chinese messages" },
  { key: "woodlands", email: "woodlands.neighbours@example.com", name: "Suresh Pillai", phone: "90000004", kind: "organization",
    show: "Woodlands Neighbours Network: an event waiting for approval, a rejected request, the test “suspicious message”" },
  { key: "bedok", email: "bedok.bright@example.com", name: "Hafiz Rahim", phone: "90000005", kind: "organization",
    show: "Bedok Bright Futures Club: an organization waiting for admin approval (everything else is locked)" },
  // individuals
  { key: "siti", email: "siti.rahman@example.com", name: "Siti Rahman", phone: "90000006", kind: "individual",
    roles: ["donor"], area: "Tampines", postal: "521201",
    show: "Donor: accepted offer with drop-off, delivered stamps, a pending offer past its deadline, chat with the pantry" },
  { key: "daniel", email: "daniel.tan@example.com", name: "Daniel Tan", phone: "90000007", kind: "individual",
    roles: ["donor"], area: "Jurong West", postal: "640501",
    show: "Donor: a rejected offer (and the reply in Messages), a cancelled offer, reported a suspicious message" },
  { key: "ahmad", email: "ahmad.ismail@example.com", name: "Ahmad Ismail", phone: "90000008", kind: "individual",
    roles: ["donor"], area: "Bedok", postal: "460210",
    show: "Donor who writes in Malay: the pantry sees his messages translated" },
  { key: "kavitha", email: "kavitha.raj@example.com", name: "Kavitha Raj", phone: "90000009", kind: "individual",
    roles: ["donor"], area: "Clementi", postal: "120301",
    show: "Brand-new donor with no activity: every empty state (no offers, no messages)" },
  { key: "priya", email: "priya.nair@example.com", name: "Priya Nair", phone: "90000010", kind: "individual",
    roles: ["volunteer"], area: "Tampines", postal: "521305",
    volunteer: { available_days: ["sat", "sun"], available_times: ["morning"], interests: ["food_distribution", "elderly_care"], skills: ["driving"], matching_opt_in: true },
    show: "Volunteer: confirmed places on full events, tasks (some done), two completed events" },
  { key: "marcus", email: "marcus.lim@example.com", name: "Marcus Lim", phone: "90000011", kind: "individual",
    roles: ["volunteer"], area: "Toa Payoh", postal: "310190",
    volunteer: { available_days: ["mon", "tue", "wed", "thu", "fri"], available_times: ["evening"], interests: ["elderly_care", "events_and_outreach"], skills: ["first_aid"], matching_opt_in: false },
    show: "Volunteer: pending, withdrawn and cancelled-event applications, an event happening now" },
  { key: "farah", email: "farah.aziz@example.com", name: "Farah Aziz", phone: "90000012", kind: "individual",
    roles: ["volunteer"], area: "Woodlands", postal: "731888",
    volunteer: { available_days: ["sat", "sun"], available_times: ["morning", "afternoon"], interests: ["environment", "packing_and_sorting"], skills: ["lifting_and_moving"], matching_opt_in: true },
    show: "Volunteer: took the last spot on a full event (E10), a cancelled event" },
  { key: "jason", email: "jason.koh@example.com", name: "Jason Koh", phone: "90000013", kind: "individual",
    roles: ["volunteer"], area: "Jurong West", postal: "640735",
    volunteer: { available_days: ["wed", "sat"], available_times: ["afternoon"], interests: ["children_and_education"], skills: ["tutoring", "it_support"], matching_opt_in: false },
    show: "Volunteer: a rejected application (E6), an event that ended yesterday" },
  { key: "weiling", email: "weiling.chen@example.com", name: "Wei Ling Chen", phone: "90000014", kind: "individual",
    roles: ["donor", "volunteer"], area: "Ang Mo Kio", postal: "560215",
    volunteer: { available_days: ["sat"], available_times: ["morning", "afternoon"], interests: ["children_and_education", "food_distribution"], skills: ["languages"], matching_opt_in: true },
    show: "Donor and volunteer who writes in Chinese: switch between Donating and Volunteering" },
  { key: "ravi", email: "ravi.kumar@example.com", name: "Ravi Kumar", phone: "90000015", kind: "individual",
    roles: ["donor", "volunteer"], area: "Toa Payoh", postal: "310215",
    volunteer: { available_days: ["sun"], available_times: ["morning"], interests: ["packing_and_sorting"], skills: ["cooking", "driving"], matching_opt_in: true },
    show: "Donor and volunteer: many offers in different states, an event happening now, a completed event" },
];

/**
 * Approximate, public, area-level locations (no unit numbers).
 * @typedef {{ key: string, name: string, description: string, address: string, postal: string,
 *   phone: string, lat: number, lng: number, approve: boolean }} Org
 */
/** @type {Org[]} */
const ORGANIZATIONS = [
  { key: "pantry", name: "Tampines Kampung Pantry", phone: "90000021", postal: "521201",
    address: "Tampines Street 21 area, Tampines, Singapore", lat: 1.3545, lng: 103.9432, approve: true,
    description: "A resident-run food pantry. Every Saturday we pack grocery bags for about 40 families in Tampines." },
  { key: "hearts", name: "Jurong Hearts Community Hub", phone: "90000022", postal: "640501",
    address: "Jurong West Street 52 area, Jurong West, Singapore", lat: 1.3496, lng: 103.7186, approve: true,
    description: "We help young families in Jurong West settle in: baby supplies, household basics and a children's reading corner." },
  { key: "circle", name: "Toa Payoh Care Circle", phone: "90000023", postal: "310190",
    address: "Toa Payoh Lorong 1 area, Toa Payoh, Singapore", lat: 1.3366, lng: 103.8472, approve: true,
    description: "Neighbours who visit seniors living alone, with hygiene supplies, warm bedding and a friendly chat." },
  { key: "woodlands", name: "Woodlands Neighbours Network", phone: "90000024", postal: "731888",
    address: "Woodlands Avenue 6 area, Woodlands, Singapore", lat: 1.4363, lng: 103.7862, approve: true,
    description: "Volunteers who keep Woodlands green and friendly: clean-ups, a community garden and help for families nearby." },
  { key: "bedok", name: "Bedok Bright Futures Club", phone: "90000025", postal: "460210",
    address: "Bedok North Street 1 area, Bedok, Singapore", lat: 1.3274, lng: 103.9301, approve: false,
    description: "Free weekend tuition and school supplies for primary school children in Bedok." },
];

/**
 * @typedef {{ key: string, name: string, category: string, unit: string, qty: number }} Item
 * @typedef {{ key: string, org: string, title: string, description: string, urgency: 'low' | 'medium' | 'high' | 'critical',
 *   deadline: number, dropoff: string, items: Item[], postedDaysAgo: number,
 *   review: 'approve' | 'wait' | 'reject', adminNote?: string, close?: string, moveDeadlineTo?: number, situation: string }} Req
 */
const DROPOFF = {
  pantry: "Void deck of Blk 201 Tampines St 21, Saturdays 9am–12pm (next to the letter boxes).",
  hearts: "Jurong West Street 52 activity room, weekdays 10am–6pm.",
  circle: "Toa Payoh Lorong 1 senior activity centre, weekdays 10am–5pm.",
  woodlands: "Woodlands Avenue 6 community garden shed, weekends 8am–12pm.",
};
/**
 * Exactly what's needed for each item, by item name (20261102090000_item_details.sql). Every item has a size:
 * the database requires one for new items. cond = the worst condition accepted (left out = any condition),
 * describe = donors must describe their item.
 * @type {Record<string, { size: string, material?: string, cond?: 'new' | 'like_new' | 'good' | 'fair', details?: string, describe?: boolean }>}
 */
const ITEM_DETAILS = {
  "Breakfast cereal 500g": { size: "500 g boxes" },
  "UHT milk 1L": { size: "1 L cartons", details: "Long-life (UHT) milk only" },
  "Instant noodles (5-pack)": { size: "5-packs" },
  "Rice 5kg": { size: "5 kg bags" },
  "Adult diapers (size L)": { size: "Size L (waist 100–150 cm)", cond: "new", details: "Sealed packs only" },
  "Exercise books": { size: "A4, 80 pages", cond: "new" },
  "Fleece blankets": { size: "Single, about 150 × 200 cm", cond: "good" },
  "Rice 10kg": { size: "10 kg bags" },
  "Umbrellas": { size: "Foldable, adult size", cond: "good" },
  "Raincoats": { size: "Adult, M–XL", cond: "like_new" },
  "Garden gloves": { size: "Adult, M–L", cond: "new" },
  "Hand trowels": { size: "About 30 cm", material: "Metal blade", cond: "good" },
  "Bedsheets (single)": { size: "Single, 90 × 190 cm", details: "Fitted sheet with a pillowcase", cond: "like_new" },
  "Cooking pots": { size: "24–28 cm", material: "Stainless steel", cond: "like_new", details: "With a lid, for family meals", describe: true },
  "Rice cookers": { size: "1–1.8 L (5–10 cups)", cond: "like_new", describe: true },
  "Bottled water 1.5L": { size: "1.5 L bottles" },
  "Litter pickers": { size: "About 80 cm", cond: "good" },
  "Cooking oil 2L": { size: "2 L bottles" },
  "Canned sardines": { size: "155 g cans", details: "Halal-certified only" },
  "Diapers (size 4)": { size: "Size 4 (9–14 kg)", cond: "new", details: "Sealed packs only" },
  "Milk powder 800g": { size: "800 g tins, stage 2 (1–3 years)", cond: "new", details: "Sealed, at least 3 months before expiry" },
  "Toothpaste": { size: "100 g tubes", cond: "new" },
  "Bath soap": { size: "Bars of 90 g or more", cond: "new" },
  "Children's storybooks": { size: "Ages 6–10, English or Malay", cond: "good" },
  "T-shirts (M, L)": { size: "Size M–L, adult", material: "Cotton", cond: "good" },
  "Track pants": { size: "Size M–XL, elastic waist", cond: "good" },
  "Canned meat": { size: "400 g cans", details: "Halal-certified only" },
  "Rice": { size: "5 kg bags" },
  "Diapers": { size: "Size 4", cond: "new", details: "Sealed packs only" },
  "Instant noodles": { size: "Single packs", details: "Low-salt, soft and easy to chew (for seniors)" },
  "School shoes": { size: "EU 30–36 (Primary 1–6)", cond: "good", details: "Black, with Velcro or laces", describe: true },
};
/** Real photos for the offers that have one (fictional, no location data). */
const PHOTO_DIR = "scripts/demo-photos";

/** @param {Item} i */
const detailsOf = (i) => ITEM_DETAILS[i.name] ?? { size: "" };

/** @type {Req[]} */
const REQUESTS = [
  { key: "R1", org: "pantry", urgency: "medium", deadline: 7, postedDaysAgo: 12, review: "approve", dropoff: DROPOFF.pantry,
    situation: "Fully covered: everything promised, nothing delivered yet (no more offers needed)",
    title: "Breakfast cereal and milk for the Saturday bags",
    description: "A simple breakfast in every grocery bag helps the children start the school week well.",
    items: [{ key: "cereal", name: "Breakfast cereal 500g", category: "food", unit: "boxes", qty: 20 }, { key: "milk", name: "UHT milk 1L", category: "food", unit: "cartons", qty: 24 }] },
  { key: "R2", org: "pantry", urgency: "medium", deadline: 5, postedDaysAgo: 13, review: "approve", dropoff: DROPOFF.pantry,
    situation: "Fulfilled: everything delivered (in History; donors see Delivered stamps)",
    title: "Instant noodles for the weekend food bank",
    description: "Quick meals for students and shift workers who drop by on weekends.",
    items: [{ key: "noodles", name: "Instant noodles (5-pack)", category: "food", unit: "packs", qty: 10 }] },
  { key: "R3", org: "hearts", urgency: "high", deadline: 10, postedDaysAgo: 11, review: "approve", dropoff: DROPOFF.hearts,
    situation: "Partly covered: 6 of 10 bags (some accepted, some delivered)",
    title: "Rice for families in Jurong West",
    description: "Ten families on our list have run out of rice this month.",
    items: [{ key: "rice", name: "Rice 5kg", category: "food", unit: "bags", qty: 10 }] },
  { key: "R4", org: "pantry", urgency: "critical", deadline: 2, postedDaysAgo: 3, review: "approve", dropoff: DROPOFF.pantry,
    situation: "Urgent, nothing offered yet, deadline in 2 days (tops “Most needed”)",
    title: "Adult diapers for bedbound seniors",
    description: "Several seniors on our grocery list are bedbound, and their families are struggling with the cost of adult diapers.",
    items: [{ key: "adult", name: "Adult diapers (size L)", category: "hygiene", unit: "packs", qty: 40 }] },
  { key: "R5", org: "woodlands", urgency: "low", deadline: 0, postedDaysAgo: 6, review: "approve", dropoff: DROPOFF.woodlands,
    situation: "Deadline is today",
    title: "Exercise books for the homework club",
    description: "Our homework club starts a new term tomorrow. Any lined exercise books help.",
    items: [{ key: "books", name: "Exercise books", category: "education", unit: "books", qty: 60 }] },
  { key: "R6", org: "circle", urgency: "high", deadline: 5, moveDeadlineTo: -1, postedDaysAgo: 14, review: "approve", dropoff: DROPOFF.circle,
    situation: "Past its deadline (yesterday) with a pending offer (“Needs your action”)",
    title: "Warm blankets for the monsoon season",
    description: "Older flats get cold and damp at night during the monsoon season.",
    items: [{ key: "blankets", name: "Fleece blankets", category: "household", unit: "pieces", qty: 25 }] },
  { key: "R7", org: "pantry", urgency: "low", deadline: 14, postedDaysAgo: 10, review: "approve", dropoff: DROPOFF.pantry,
    close: "Got enough from a school drive",
    situation: "Closed with a reason; its waiting offer shows “Request closed”",
    title: "Rice for Deepavali hampers",
    description: "Extra rice for the festive hampers we pack with the residents' committee.",
    items: [{ key: "rice10", name: "Rice 10kg", category: "food", unit: "bags", qty: 15 }] },
  { key: "R8", org: "hearts", urgency: "medium", deadline: 10, postedDaysAgo: 1, review: "wait", dropoff: DROPOFF.hearts,
    situation: "Waiting for admin approval",
    title: "Umbrellas and raincoats for our home-visit volunteers",
    description: "Our volunteers walk between blocks in all weather during the monsoon season.",
    items: [{ key: "umbrellas", name: "Umbrellas", category: "other", unit: "pieces", qty: 20 }, { key: "raincoats", name: "Raincoats", category: "other", unit: "pieces", qty: 10 }] },
  { key: "R9", org: "woodlands", urgency: "medium", deadline: 10, postedDaysAgo: 4, review: "reject", adminNote: "Please add how many families this helps",
    dropoff: DROPOFF.woodlands, situation: "Rejected by the admin, with a note",
    title: "Gardening tools for the community garden",
    description: "For our garden.",
    items: [{ key: "gloves", name: "Garden gloves", category: "other", unit: "pairs", qty: 20 }, { key: "trowels", name: "Hand trowels", category: "other", unit: "pieces", qty: 10 }] },
  { key: "R10", org: "hearts", urgency: "high", deadline: 7, postedDaysAgo: 9, review: "approve", dropoff: DROPOFF.hearts,
    situation: "Three items: one fully covered, one partly covered, one with no offers yet",
    title: "Starter kits for families moving into rental flats",
    description: "Families moving into empty rental flats need the basics to set up home.",
    items: [{ key: "bedsheets", name: "Bedsheets (single)", category: "household", unit: "sets", qty: 20 },
      { key: "pots", name: "Cooking pots", category: "household", unit: "pieces", qty: 15 },
      { key: "ricecookers", name: "Rice cookers", category: "household", unit: "pieces", qty: 6 }] },
  { key: "R11", org: "woodlands", urgency: "medium", deadline: 9, postedDaysAgo: 5, review: "approve", dropoff: DROPOFF.woodlands,
    situation: "Linked to event E11 (the event's Donate button opens it)",
    title: "Water and litter pickers for the Woodlands clean-up day",
    description: "Bottled water for our clean-up volunteers, and litter pickers so everyone can help.",
    items: [{ key: "water", name: "Bottled water 1.5L", category: "food", unit: "bottles", qty: 48 }, { key: "pickers", name: "Litter pickers", category: "other", unit: "pieces", qty: 20 }] },
  { key: "R12", org: "pantry", urgency: "medium", deadline: 4, postedDaysAgo: 8, review: "approve", dropoff: DROPOFF.pantry,
    situation: "Open, deadline in 4 days",
    title: "Cooking oil and canned food",
    description: "Staples that keep well, for families who can't come every week.",
    items: [{ key: "oil", name: "Cooking oil 2L", category: "food", unit: "bottles", qty: 20 }, { key: "sardines", name: "Canned sardines", category: "food", unit: "cans", qty: 40 }] },
  { key: "R13", org: "hearts", urgency: "high", deadline: 7, postedDaysAgo: 7, review: "approve", dropoff: DROPOFF.hearts,
    situation: "Open, deadline in 7 days (baby items)",
    title: "Diapers and milk powder for young families",
    description: "Five new families joined us this month, three with babies under one year old.",
    items: [{ key: "diapers", name: "Diapers (size 4)", category: "baby", unit: "packs", qty: 30 }, { key: "milk", name: "Milk powder 800g", category: "baby", unit: "tins", qty: 12 }] },
  { key: "R14", org: "pantry", urgency: "medium", deadline: 10, postedDaysAgo: 9, review: "approve", dropoff: DROPOFF.pantry,
    situation: "Open, deadline in 10 days",
    title: "Hygiene kits for seniors living alone",
    description: "We add a small hygiene kit to every grocery bag that goes to a senior living alone.",
    items: [{ key: "toothpaste", name: "Toothpaste", category: "hygiene", unit: "tubes", qty: 30 }, { key: "soap", name: "Bath soap", category: "hygiene", unit: "bars", qty: 30 }] },
  { key: "R15", org: "hearts", urgency: "low", deadline: 14, postedDaysAgo: 10, review: "approve", dropoff: DROPOFF.hearts,
    situation: "Open, deadline in 14 days (education items)",
    title: "Storybooks and exercise books for our reading corner",
    description: "Our Saturday reading corner is growing. Children aged 6 to 10 come every week.",
    items: [{ key: "storybooks", name: "Children's storybooks", category: "education", unit: "books", qty: 50 }, { key: "exercise", name: "Exercise books", category: "education", unit: "books", qty: 100 },
      { key: "shoes", name: "School shoes", category: "clothing", unit: "pairs", qty: 12 }] },
  { key: "R16", org: "circle", urgency: "low", deadline: 21, postedDaysAgo: 6, review: "approve", dropoff: DROPOFF.circle,
    situation: "Open, deadline in 21 days (clothing)",
    title: "Comfortable clothes for seniors",
    description: "Soft, loose clothes that are easy to put on. New or gently used, washed and in good condition.",
    items: [{ key: "tshirts", name: "T-shirts (M, L)", category: "clothing", unit: "pieces", qty: 30 }, { key: "pants", name: "Track pants", category: "clothing", unit: "pieces", qty: 20 }] },
  // the matching guardrail (REQUIREMENTS.md 4.6): a Halal-only item, an exact diaper size and a plain item next to them
  { key: "R17", org: "pantry", urgency: "medium", deadline: 18, postedDaysAgo: 3, review: "approve", dropoff: DROPOFF.pantry,
    situation: "Halal-only canned meat next to plain rice (the AI check blocks pork luncheon meat here)",
    title: "Canned meat and rice for Hari Raya hampers",
    description: "Hampers for 30 Muslim families. All meat must be Halal-certified.",
    items: [{ key: "meat", name: "Canned meat", category: "food", unit: "cans", qty: 30 }, { key: "rice5", name: "Rice", category: "food", unit: "bags", qty: 15 }] },
  { key: "R18", org: "circle", urgency: "low", deadline: 20, postedDaysAgo: 2, review: "approve", dropoff: DROPOFF.circle,
    situation: "Diapers in exactly size 4 (the AI check blocks size 2 diapers here)",
    title: "Diapers for grandparents caring for babies",
    description: "Some of our seniors look after their grandchildren during the day.",
    items: [{ key: "diapers4", name: "Diapers", category: "baby", unit: "packs", qty: 20 }] },
  { key: "R19", org: "circle", urgency: "low", deadline: 25, postedDaysAgo: 1, review: "approve", dropoff: DROPOFF.circle,
    situation: "Low-salt food for seniors (the AI check asks donors of instant noodles about the salt)",
    title: "Easy meals for seniors living alone",
    description: "Simple meals our seniors can make at home. Many are watching their salt.",
    items: [{ key: "noodles1", name: "Instant noodles", category: "food", unit: "packs", qty: 40 }] },
];

/**
 * @typedef {{ donor: string, item: string, qty: number, message?: string, final: 'pending' | 'accepted' | 'delivered' | 'rejected' | 'cancelled',
 *   rejectNote?: string, daysAgo: number, condition?: 'new' | 'like_new' | 'good' | 'fair', details?: string, photo?: string }} Offer
 * photo: a file in scripts/demo-photos/ — the offer is made by the donor with that photo, as on the site.
 * Offers without a photo stand for older offers, made before photos were required.
 * item is "<request key>.<item key>". Offers on a request that gets closed should be 'pending' (they become "Request closed").
 */
/** @type {Offer[]} */
const OFFERS = [
  { donor: "ravi", item: "R1.cereal", qty: 20, final: "accepted", daysAgo: 6 },
  { donor: "weiling", item: "R1.milk", qty: 24, final: "accepted", daysAgo: 5 },
  { donor: "siti", item: "R2.noodles", qty: 6, final: "delivered", daysAgo: 10 },
  { donor: "ahmad", item: "R2.noodles", qty: 4, final: "delivered", daysAgo: 9 },
  { donor: "daniel", item: "R3.rice", qty: 4, final: "delivered", daysAgo: 8, photo: "rice-5kg.jpg", details: "Sealed 5 kg bags, expiry next year" },
  { donor: "ravi", item: "R3.rice", qty: 2, final: "accepted", daysAgo: 3 },
  { donor: "siti", item: "R6.blankets", qty: 5, final: "pending", daysAgo: 3, message: "I can bring them on a weekday evening." },
  { donor: "ravi", item: "R6.blankets", qty: 8, final: "accepted", daysAgo: 7 },
  { donor: "weiling", item: "R7.rice10", qty: 3, final: "pending", daysAgo: 4 },
  { donor: "ahmad", item: "R10.bedsheets", qty: 12, final: "delivered", daysAgo: 7 },
  { donor: "daniel", item: "R10.bedsheets", qty: 8, final: "accepted", daysAgo: 4 },
  { donor: "weiling", item: "R10.pots", qty: 5, final: "accepted", daysAgo: 3, condition: "like_new", photo: "cooking-pot.jpg",
    details: "26 cm stainless steel pots with lids, used a few times" },
  { donor: "ravi", item: "R11.water", qty: 24, final: "delivered", daysAgo: 4 },
  { donor: "ahmad", item: "R12.oil", qty: 6, final: "pending", daysAgo: 1, message: "Saya boleh hantar pada hari Sabtu.", photo: "cooking-oil.jpg" },
  { donor: "siti", item: "R12.sardines", qty: 12, final: "delivered", daysAgo: 6 },
  { donor: "weiling", item: "R12.oil", qty: 4, final: "delivered", daysAgo: 7 },
  { donor: "weiling", item: "R13.milk", qty: 5, final: "pending", daysAgo: 2 },
  { donor: "daniel", item: "R13.diapers", qty: 10, final: "delivered", daysAgo: 6 },
  { donor: "siti", item: "R13.diapers", qty: 5, final: "accepted", daysAgo: 2, condition: "new", photo: "diapers-size4.jpg", details: "Size 4 packs, still sealed" },
  { donor: "siti", item: "R14.soap", qty: 10, final: "accepted", daysAgo: 3, message: "I can drop them off on Saturday morning." },
  { donor: "ahmad", item: "R14.toothpaste", qty: 10, final: "delivered", daysAgo: 8 },
  { donor: "ravi", item: "R14.toothpaste", qty: 6, final: "pending", daysAgo: 1 },
  { donor: "daniel", item: "R15.storybooks", qty: 20, final: "rejected", daysAgo: 7,
    rejectNote: "Thank you, Daniel! Our corner only takes books in English or Malay for now — we've sent you a message." },
  { donor: "siti", item: "R15.exercise", qty: 30, final: "delivered", daysAgo: 9, condition: "new", photo: "exercise-books.jpg" },
  { donor: "daniel", item: "R16.pants", qty: 2, final: "cancelled", daysAgo: 5 },
  { donor: "ravi", item: "R16.tshirts", qty: 10, final: "accepted", daysAgo: 4 },
  { donor: "weiling", item: "R16.pants", qty: 6, final: "delivered", daysAgo: 5 },
  { donor: "ahmad", item: "R16.tshirts", qty: 5, final: "pending", daysAgo: 1 },
  // exact item details: needed vs offered on Jurong Hearts' board
  { donor: "ahmad", item: "R15.shoes", qty: 2, final: "pending", daysAgo: 1, condition: "good", photo: "school-shoes.jpg",
    details: "Black school shoes, EU 33 and EU 34, worn for one term" },
  { donor: "siti", item: "R10.pots", qty: 2, final: "rejected", daysAgo: 4, condition: "like_new", photo: "cooking-pot.jpg",
    details: "20 cm pot with lid", rejectNote: "Doesn't match the size or condition — we need 24–28 cm pots for family meals. Thank you, Siti!" },
];

/**
 * start: days from today when created (everything starts in the future, except 'now'); moveTo: where the
 * event's times are moved afterwards (days from today, negative = past).
 * @typedef {{ key: string, org: string, title: string, description: string, place: string, lat: number, lng: number,
 *   start: number | 'now', time: string, hours: number, needed: number, linkRequest?: string, moveTo?: number,
 *   review: 'approve' | 'wait' | 'reject', adminNote?: string, complete?: string, cancel?: string, situation: string }} DemoEvent
 */
/** @type {DemoEvent[]} */
const EVENTS = [
  { key: "E1", org: "pantry", start: 2, moveTo: -14, time: "09:00", hours: 3, needed: 6, review: "approve", complete: "120 food packs for 40 families",
    situation: "Completed 14 days ago, with an outcome and finished tasks",
    title: "Weekend food distribution", place: "Void deck, Blk 201 Tampines St 21", lat: 1.3543, lng: 103.9425,
    description: "Hand out grocery bags to the families on our list." },
  { key: "E2", org: "circle", start: 3, moveTo: -7, time: "10:00", hours: 3, needed: 6, review: "approve", complete: "Visited 18 seniors living alone and fixed 4 broken fans",
    situation: "Completed 7 days ago (Ravi and Priya took part)",
    title: "Befriender home visits", place: "Toa Payoh Lorong 1 senior activity centre", lat: 1.3369, lng: 103.8476,
    description: "Visit seniors who live alone, in pairs. A short briefing comes first; no experience needed." },
  { key: "E3", org: "hearts", start: 4, moveTo: -1, time: "14:00", hours: 3, needed: 5, review: "approve",
    situation: "Ended yesterday but not marked completed (“Needs your action”)",
    title: "Reading corner open day", place: "Jurong West Street 52 activity room", lat: 1.3499, lng: 103.7181,
    description: "Read aloud with the children and help them pick books to borrow." },
  { key: "E4", org: "woodlands", start: 5, time: "08:00", hours: 3, needed: 8, review: "approve", cancel: "Heavy rain forecast",
    situation: "Cancelled after volunteers were approved",
    title: "Park connector clean-up", place: "Woodlands Waterfront park connector", lat: 1.4484, lng: 103.7798,
    description: "Pick up litter along the park connector. Gloves and bags provided." },
  { key: "E5", org: "circle", start: "now", time: "", hours: 4, needed: 4, review: "approve",
    situation: "Happening now (started an hour ago)",
    title: "Tea and chat with seniors", place: "Toa Payoh Lorong 1 senior activity centre", lat: 1.3363, lng: 103.8469,
    description: "An afternoon of kopi, kueh and board games with the seniors we visit." },
  { key: "E6", org: "pantry", start: 2, time: "09:00", hours: 3, needed: 3, review: "approve",
    situation: "In 2 days and full (3 of 3), one application rejected",
    title: "Rice packing morning", place: "Void deck, Blk 201 Tampines St 21", lat: 1.3541, lng: 103.9427,
    description: "Pack rice and oil into grocery bags for 40 families. Gloves and aprons provided." },
  { key: "E7", org: "hearts", start: 3, time: "09:30", hours: 3, needed: 4, review: "approve",
    situation: "In 3 days, one spot left (3 of 4)",
    title: "Saturday food packing", place: "Jurong West Street 52 activity room", lat: 1.3494, lng: 103.7192,
    description: "Pack food bags with us, then help drive them to families in the nearby blocks." },
  { key: "E8", org: "woodlands", start: 5, time: "08:30", hours: 3, needed: 10, review: "approve",
    situation: "In 5 days, many spots left (2 of 10)",
    title: "Community garden planting day", place: "Woodlands Avenue 6 community garden", lat: 1.4357, lng: 103.7871,
    description: "Plant vegetables and herbs that our families can harvest next month. Must be able to lift 10 kg bags of soil." },
  { key: "E9", org: "circle", start: 6, time: "15:00", hours: 2, needed: 5, review: "approve",
    situation: "In 6 days, no applications yet",
    title: "Christmas card making with seniors", place: "Toa Payoh Lorong 1 senior activity centre", lat: 1.3367, lng: 103.8480,
    description: "Make and write Christmas cards together with the seniors." },
  { key: "E10", org: "pantry", start: 8, time: "14:00", hours: 3, needed: 2, review: "approve",
    situation: "In 8 days and full (Farah took the last spot; Marcus withdrew earlier)",
    title: "Grocery bag delivery run", place: "Tampines Street 21 community room", lat: 1.3548, lng: 103.9439,
    description: "Deliver grocery bags to families who can't come down to collect them. Drivers especially welcome." },
  { key: "E11", org: "woodlands", start: 9, time: "08:00", hours: 4, needed: 12, review: "approve", linkRequest: "R11",
    situation: "In 9 days, linked to request R11 (Donate opens it)",
    title: "Woodlands clean-up day", place: "Woodlands Avenue 6 neighbourhood park", lat: 1.4371, lng: 103.7855,
    description: "Our big clean-up of the neighbourhood park and nearby blocks. Families welcome." },
  { key: "E12", org: "hearts", start: 11, time: "10:00", hours: 3, needed: 8, review: "approve",
    situation: "In 11 days, 5 applications waiting for the organization",
    title: "Back-to-school book wrapping", place: "Jurong West Street 52 activity room", lat: 1.3501, lng: 103.7178,
    description: "Wrap and label donated textbooks so every child starts the school year ready." },
  { key: "E13", org: "circle", start: 13, time: "10:00", hours: 2, needed: 4, review: "approve",
    situation: "In 13 days, half full (2 of 4), Marcus waiting",
    title: "Grocery shopping with seniors", place: "Toa Payoh Central supermarket", lat: 1.3327, lng: 103.8478,
    description: "Accompany seniors on their monthly grocery trip and help carry the bags home. Driver with licence needed: you'll drive two seniors to the supermarket and back in our van." },
  { key: "E14", org: "woodlands", start: 10, time: "09:00", hours: 3, needed: 6, review: "wait",
    situation: "Waiting for admin approval",
    title: "Bicycle repair workshop", place: "Woodlands Avenue 6 void deck", lat: 1.4360, lng: 103.7868,
    description: "Fix bicycles for families who rely on them to get to school and work." },
  { key: "E15", org: "pantry", start: 12, time: "16:00", hours: 2, needed: 4, review: "reject", adminNote: "Please add the exact meeting point",
    situation: "Rejected by the admin, with a note",
    title: "Pop-up toy swap", place: "Tampines", lat: 1.3530, lng: 103.9450,
    description: "Bring a toy, take a toy." },
];

/**
 * Applications are done in this order; the organization decides right after each one.
 * @typedef {{ volunteer: string, event: string, final: 'pending' | 'approved' | 'rejected' | 'withdrawn', message?: string, daysAgo: number }} Application
 */
/** @type {Application[]} */
const APPLICATIONS = [
  { volunteer: "priya", event: "E1", final: "approved", daysAgo: 18 },
  { volunteer: "farah", event: "E1", final: "approved", daysAgo: 17 },
  { volunteer: "ravi", event: "E2", final: "approved", daysAgo: 11 },
  { volunteer: "priya", event: "E2", final: "approved", daysAgo: 10 },
  { volunteer: "jason", event: "E3", final: "approved", daysAgo: 6 },
  { volunteer: "weiling", event: "E3", final: "approved", daysAgo: 5 },
  { volunteer: "farah", event: "E4", final: "approved", daysAgo: 5 },
  { volunteer: "marcus", event: "E4", final: "approved", daysAgo: 4 },
  { volunteer: "marcus", event: "E5", final: "approved", daysAgo: 3 },
  { volunteer: "ravi", event: "E5", final: "approved", daysAgo: 2 },
  { volunteer: "jason", event: "E6", final: "rejected", daysAgo: 4, message: "I can only stay until 10am." },
  { volunteer: "priya", event: "E6", final: "approved", daysAgo: 4, message: "I can also drive bags to the blocks after." },
  { volunteer: "farah", event: "E6", final: "approved", daysAgo: 3 },
  { volunteer: "ravi", event: "E6", final: "approved", daysAgo: 3 },
  { volunteer: "priya", event: "E7", final: "approved", daysAgo: 5 },
  { volunteer: "weiling", event: "E7", final: "approved", daysAgo: 4 },
  { volunteer: "jason", event: "E7", final: "approved", daysAgo: 3 },
  { volunteer: "farah", event: "E8", final: "approved", daysAgo: 2 },
  { volunteer: "jason", event: "E8", final: "approved", daysAgo: 2 },
  { volunteer: "marcus", event: "E10", final: "withdrawn", daysAgo: 6 },
  { volunteer: "priya", event: "E10", final: "approved", daysAgo: 5 },
  { volunteer: "farah", event: "E10", final: "approved", daysAgo: 2 },
  { volunteer: "jason", event: "E11", final: "approved", daysAgo: 2 },
  { volunteer: "priya", event: "E12", final: "pending", daysAgo: 3 },
  { volunteer: "marcus", event: "E12", final: "pending", daysAgo: 3, message: "I'm free after 6pm on weekdays, but Saturdays work too." },
  { volunteer: "farah", event: "E12", final: "pending", daysAgo: 2 },
  { volunteer: "jason", event: "E12", final: "pending", daysAgo: 2, message: "I tutor P1 kids, happy to help with labels." },
  { volunteer: "weiling", event: "E12", final: "pending", daysAgo: 1 },
  { volunteer: "ravi", event: "E13", final: "approved", daysAgo: 3 },
  { volunteer: "weiling", event: "E13", final: "approved", daysAgo: 2 },
  { volunteer: "marcus", event: "E13", final: "pending", daysAgo: 1 },
];

/**
 * @typedef {{ event: string, volunteer: string, title: string, description?: string, dueDays: number, time: string, done: boolean }} Task
 * dueDays counts from today and should match the event's final date.
 */
/** @type {Task[]} */
const TASKS = [
  { event: "E1", volunteer: "priya", title: "Hand out food packs at table 1", dueDays: -14, time: "09:00", done: true },
  { event: "E1", volunteer: "farah", title: "Carry rice bags from the van", dueDays: -14, time: "08:45", done: true },
  { event: "E2", volunteer: "ravi", title: "Bring spare parts for the fans", dueDays: -7, time: "10:00", done: true },
  { event: "E5", volunteer: "marcus", title: "Set up the tables and kettles", dueDays: 0, time: "14:00", done: true },
  { event: "E6", volunteer: "priya", title: "Pack rice bags at station 2", dueDays: 2, time: "09:00", done: false },
  { event: "E6", volunteer: "farah", title: "Label bags with the family numbers", dueDays: 2, time: "09:00", done: true },
  { event: "E7", volunteer: "priya", title: "Drive food packs to Blk 501–505", description: "Car park B. We'll load the boot for you.", dueDays: 3, time: "11:30", done: false },
  { event: "E7", volunteer: "weiling", title: "Welcome families at the door", description: "Help Chinese-speaking aunties and uncles find their bags.", dueDays: 3, time: "09:30", done: false },
  { event: "E10", volunteer: "farah", title: "Load the bags into the van", dueDays: 8, time: "14:00", done: false },
  { event: "E13", volunteer: "ravi", title: "Push the trolleys at the supermarket", dueDays: 13, time: "10:00", done: false },
];

/**
 * @typedef {{ from: 'person' | 'org', body: string }} Line
 * @typedef {{ person: string, org: string, topic: string, lines: Line[], hoursAgo: number, report?: { line: number, reason: string } }} Chat
 */
/** @type {Chat[]} */
const CHATS = [
  { person: "siti", org: "pantry", topic: "About: Hygiene kits for seniors living alone", hoursAgo: 50, lines: [
    { from: "person", body: "Hi! I've offered 10 bars of soap. Can I drop them off this Saturday morning?" },
    { from: "org", body: "Thank you, Siti! Saturday 9am–12pm works. Please come to the void deck at Blk 201, next to the letter boxes." },
    { from: "person", body: "Great. Is it okay if my husband brings them instead?" },
    { from: "org", body: "Of course! Just tell our volunteer it's for Tampines Kampung Pantry." },
    { from: "person", body: "Will do. See you on Saturday!" },
  ] },
  { person: "ahmad", org: "pantry", topic: "About: Cooking oil and canned food", hoursAgo: 20, lines: [
    { from: "person", body: "Selamat pagi. Saya mahu menderma 6 botol minyak masak. Bila saya boleh hantar?" },
    { from: "org", body: "Good morning, Ahmad! Thank you. You can drop them off on Saturday between 9am and 12pm at the void deck of Blk 201." },
    { from: "person", body: "Baik, terima kasih. Saya akan datang pada pagi Sabtu bersama anak saya." },
    { from: "org", body: "See you then! We'll accept your offer once we've checked our stock." },
  ] },
  { person: "weiling", org: "circle", topic: "About: Comfortable clothes for seniors", hoursAgo: 40, lines: [
    { from: "person", body: "你好！我已经送了6条运动裤。请问你们还需要别的东西吗？" },
    { from: "org", body: "Hi Wei Ling, thank you so much! The seniors are very happy with them. We still need warm blankets if you can help." },
    { from: "person", body: "好的，我这个星期会再带几条毯子过来。" },
    { from: "org", body: "Wonderful, thank you! We're open on weekdays from 10am to 5pm." },
  ] },
  { person: "priya", org: "hearts", topic: "About: Saturday food packing", hoursAgo: 30, lines: [
    { from: "person", body: "Hi! I'm confirmed for Saturday food packing. Should I bring anything?" },
    { from: "org", body: "Hi Priya! Just comfortable shoes and a water bottle. We'll provide gloves and aprons." },
    { from: "person", body: "Noted, thanks. I can also drive the packs to the blocks afterwards." },
    { from: "org", body: "That would be a big help. We've added it to your tasks." },
  ] },
  { person: "siti", org: "hearts", topic: "Your offer: 2 pieces of Cooking pots", hoursAgo: 90, lines: [
    { from: "org", body: "Thank you for offering 2 pieces of Cooking pots. We couldn't accept it: Doesn't match the size or condition — we need 24–28 cm pots for family meals." },
    { from: "person", body: "Oh I see, mine is only 20 cm. I'll look for a bigger one!" },
  ] },
  { person: "daniel", org: "hearts", topic: "About: Storybooks and exercise books for our reading corner", hoursAgo: 70, lines: [
    { from: "person", body: "Hi, I saw my storybook offer was declined. Did I do something wrong?" },
    { from: "org", body: "Not at all, Daniel! Your books are in Chinese, and our volunteers can only read with the children in English or Malay for now." },
    { from: "org", body: "Toa Payoh Care Circle runs a Chinese reading group — they may love them." },
    { from: "person", body: "That makes sense. I'll check with them. Thanks for explaining!" },
  ] },
  { person: "daniel", org: "woodlands", topic: "Test: suspicious message", hoursAgo: 12, report: { line: 1, reason: "Asked for money" }, lines: [
    { from: "person", body: "Hi, do you collect old school bags? I have a few in good condition." },
    { from: "org", body: "Yes! But first please transfer a $50 admin fee to 9000 0099 by PayNow so we can book a collection slot." },
    { from: "person", body: "Donations on KampongShare are always free, so I won't be paying a fee." },
  ] },
];

// ===========================================================================================
// Helpers
// ===========================================================================================

const SG = "Asia/Singapore";
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const DRY_RUN = process.argv.includes("--dry-run");

/** The step being worked on, for the error message. */
let currentStep = "starting";
/** @param {string} name */
function step(name) {
  currentStep = name;
  console.log(`\n▸ ${name}`);
}
/** @param {string} text */
function done(text) {
  console.log(`  ✓ ${text}`);
}

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
 * Today + n days in Singapore, as YYYY-MM-DD (deadlines are whole Singapore days, REQUIREMENTS.md 11).
 * @param {number} n
 * @returns {string}
 */
function sgDate(n) {
  return new Date(Date.now() + n * DAY).toLocaleDateString("en-CA", { timeZone: SG });
}

/**
 * A Singapore time n days from today, as an ISO string with the +08:00 offset.
 * @param {number} n
 * @param {string} time "HH:MM"
 * @returns {string}
 */
function sgTime(n, time) {
  return `${sgDate(n)}T${time}:00+08:00`;
}

/**
 * Hours from now (negative = in the past), as an ISO string.
 * @param {number} hours
 * @returns {string}
 */
function hoursFromNow(hours) {
  return new Date(Date.now() + hours * HOUR).toISOString();
}

/**
 * The start and end of an event that starts n days from today ('now' = an hour ago).
 * @param {DemoEvent} e
 * @param {number | 'now'} day
 */
function eventTimes(e, day) {
  const startsAt = day === "now" ? hoursFromNow(-1) : sgTime(day, e.time);
  return { starts_at: startsAt, ends_at: new Date(new Date(startsAt).getTime() + e.hours * HOUR).toISOString() };
}

/** @param {number} ms */
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Throws a clear error when a Supabase call failed; returns its data otherwise.
 * @template T
 * @param {{ data: T, error: { message: string } | null } | { data: any, error: any }} result
 * @param {string} what
 * @returns {NonNullable<T>}
 */
function must(result, what) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  if (result.data == null) throw new Error(`${what}: nothing came back`);
  return /** @type {NonNullable<T>} */ (result.data);
}

/**
 * For updates with .select("id"): no row changed means the database didn't allow it.
 * @param {{ data: unknown[] | null, error: { message: string } | null }} result
 * @param {string} what
 */
function changed(result, what) {
  const rows = must(result, what);
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`${what}: the database didn't change anything (not allowed?)`);
}

/** @param {string} key @returns {Person} */
function person(key) {
  const found = PEOPLE.find((p) => p.key === key);
  if (!found) throw new Error(`Unknown person "${key}" in the demo data`);
  return found;
}
/** @param {string} key @returns {Org} */
function org(key) {
  const found = ORGANIZATIONS.find((o) => o.key === key);
  if (!found) throw new Error(`Unknown organization "${key}" in the demo data`);
  return found;
}
/** @param {string} key @returns {Req} */
function req(key) {
  const found = REQUESTS.find((r) => r.key === key);
  if (!found) throw new Error(`Unknown request "${key}" in the demo data`);
  return found;
}
/** @param {string} key @returns {DemoEvent} */
function ev(key) {
  const found = EVENTS.find((e) => e.key === key);
  if (!found) throw new Error(`Unknown event "${key}" in the demo data`);
  return found;
}
/** @param {string} ref "<request key>.<item key>" */
function splitItem(ref) {
  const [requestKey, itemKey] = ref.split(".");
  const request = req(requestKey);
  const item = request.items.find((i) => i.key === itemKey);
  if (!item) throw new Error(`Unknown item "${ref}" in the demo data`);
  return { request, item };
}

// ===========================================================================================
// Dry run: checks the demo data above (no database, no .env needed)
// ===========================================================================================

/**
 * Works out what the database will hold after the seed, and checks every promised situation.
 * @returns {{ problems: string[], expectedScores: { key: string, score: number }[] }}
 */
function checkDemoData() {
  /** @type {string[]} */
  const problems = [];
  /** @param {boolean} ok @param {string} label */
  const expect = (ok, label) => {
    if (!ok) problems.push(label);
  };

  expect(PEOPLE.length === 15, `15 accounts (found ${PEOPLE.length})`);
  for (const o of ORGANIZATIONS) expect(PEOPLE.some((p) => p.key === o.key && p.kind === "organization"), `${o.name} has an account`);
  const categories = new Set(REQUESTS.filter((r) => r.review === "approve").flatMap((r) => r.items.map((i) => i.category)));
  for (const c of ["food", "clothing", "hygiene", "household", "baby", "education", "other"]) expect(categories.has(c), `an approved request uses category ${c}`);

  // exact item details: every item has a size; photos exist; conditions meet the minimum; descriptions given
  const rank = { new: 4, like_new: 3, good: 2, fair: 1 };
  for (const r of REQUESTS) for (const i of r.items) expect(Boolean(detailsOf(i).size), `${r.key}.${i.key} (${i.name}) has a size`);
  for (const o of OFFERS) {
    const { item } = splitItem(o.item);
    const d = detailsOf(item);
    if (o.photo) expect(existsSync(join(PHOTO_DIR, o.photo)), `photo ${o.photo} exists`);
    if (o.condition && d.cond && item.category !== "food") expect(rank[o.condition] >= rank[d.cond], `${o.item}: offered condition meets ${d.cond}`);
  }
  expect(OFFERS.some((o) => o.final === "rejected" && o.rejectNote?.startsWith("Doesn't match the size")), "one offer rejected as “Doesn't match the size”");

  // offers → what each item will have (committed = accepted + delivered, received = delivered)
  /** @type {Record<string, { committed: number, received: number }>} */
  const totals = {};
  /** @type {Set<string>} */
  const active = new Set();
  for (const o of OFFERS) {
    const { request, item } = splitItem(o.item);
    expect(request.review === "approve", `offer on ${o.item}: the request is approved`);
    expect(Boolean(person(o.donor).roles?.includes("donor")), `${o.donor} can donate`);
    const t = (totals[o.item] ??= { committed: 0, received: 0 });
    if (o.final === "accepted" || o.final === "delivered") t.committed += o.qty;
    if (o.final === "delivered") t.received += o.qty;
    expect(t.committed <= item.qty, `${o.item}: promised no more than needed`);
    if (o.final === "pending" || o.final === "accepted") {
      const k = `${o.donor}|${o.item}`;
      expect(!active.has(k), `${o.donor} has only one active offer on ${o.item}`);
      active.add(k);
    }
  }
  /** @param {string} ref */
  const tot = (ref) => totals[ref] ?? { committed: 0, received: 0 };
  /** @param {Req} r */
  const allRemaining = (r) => r.items.map((i) => i.qty - tot(`${r.key}.${i.key}`).committed);

  expect(allRemaining(req("R1")).every((n) => n === 0) && req("R1").items.every((i) => tot(`R1.${i.key}`).received === 0), "R1 fully covered, nothing delivered");
  expect(req("R2").items.every((i) => tot(`R2.${i.key}`).received >= i.qty), "R2 everything delivered (fulfilled)");
  const r3 = tot("R3.rice");
  expect(r3.committed === 6 && r3.received > 0 && r3.received < 6, "R3 6 of 10, some accepted and some delivered");
  expect(!OFFERS.some((o) => o.item.startsWith("R4.")) && req("R4").deadline === 2 && req("R4").urgency === "critical", "R4 urgent, no offers, 2 days");
  expect(req("R5").deadline === 0, "R5 deadline today");
  expect(req("R6").moveDeadlineTo === -1 && OFFERS.some((o) => o.item.startsWith("R6.") && o.final === "pending"), "R6 past deadline with a pending offer");
  expect(Boolean(req("R7").close) && OFFERS.some((o) => o.item.startsWith("R7.") && o.final === "pending"), "R7 closed with a pending offer");
  expect(req("R8").review === "wait" && req("R8").org === "hearts", "R8 waiting, from Jurong Hearts");
  expect(req("R9").review === "reject" && Boolean(req("R9").adminNote), "R9 rejected with a note");
  const r10 = allRemaining(req("R10"));
  expect(r10.filter((n) => n === 0).length === 1 && r10.filter((n, i) => n > 0 && n < req("R10").items[i].qty).length === 1 && r10.filter((n, i) => n === req("R10").items[i].qty).length === 1, "R10 one item full, one partial, one empty");
  expect(ev("E11").linkRequest === "R11" && ev("E11").org === req("R11").org, "E11 linked to R11 of the same organization");
  expect(REQUESTS.length === 19, `19 requests (found ${REQUESTS.length})`);
  expect(REQUESTS.every((r) => r.org !== "bedok"), "requests come from organizations 1–4");

  const offerStates = new Set(OFFERS.map((o) => /** @type {string} */ (o.final)));
  for (const s of ["pending", "accepted", "delivered", "rejected", "cancelled"]) expect(offerStates.has(s), `an offer is ${s}`);
  expect(OFFERS.filter((o) => o.final === "delivered").length >= 8, "at least 8 delivered offers");
  for (const d of ["siti", "ahmad", "weiling"]) expect(OFFERS.some((o) => o.donor === d && o.final === "pending"), `${d} has a pending offer`);
  expect(OFFERS.some((o) => o.donor === "daniel" && o.final === "rejected") && OFFERS.some((o) => o.donor === "daniel" && o.final === "cancelled"), "Daniel has a rejected and a cancelled offer");

  // events and applications
  expect(EVENTS.length === 15, `15 events (found ${EVENTS.length})`);
  for (const a of APPLICATIONS) {
    expect(Boolean(person(a.volunteer).roles?.includes("volunteer")), `${a.volunteer} can volunteer`);
    expect(ev(a.event).review === "approve", `application to ${a.event}: the event is approved`);
  }
  /** @param {string} key @param {string} state */
  const count = (key, state) => APPLICATIONS.filter((a) => a.event === key && a.final === state).length;
  for (const e of EVENTS) expect(!e.needed || count(e.key, "approved") <= e.needed, `${e.key}: no more approved than places`);
  expect(count("E6", "approved") === 3 && ev("E6").needed === 3 && APPLICATIONS.some((a) => a.event === "E6" && a.volunteer === "jason" && a.final === "rejected"), "E6 full (3 of 3) with Jason rejected");
  expect(ev("E7").needed - count("E7", "approved") === 1, "E7 one spot left");
  expect(ev("E8").needed === 10 && count("E8", "approved") === 2, "E8 2 of 10");
  expect(!APPLICATIONS.some((a) => a.event === "E9"), "E9 no applications");
  expect(count("E10", "approved") === ev("E10").needed && APPLICATIONS.some((a) => a.event === "E10" && a.volunteer === "marcus" && a.final === "withdrawn"), "E10 full, Marcus withdrew");
  const e10 = APPLICATIONS.filter((a) => a.event === "E10" && a.final === "approved");
  expect(e10[e10.length - 1]?.volunteer === "farah", "E10 Farah took the last spot");
  expect(count("E12", "pending") === 5, "E12 5 pending applications");
  expect(count("E13", "approved") * 2 === ev("E13").needed && APPLICATIONS.some((a) => a.event === "E13" && a.volunteer === "marcus" && a.final === "pending"), "E13 half full, Marcus pending");
  expect(["E1", "E2"].every((k) => Boolean(ev(k).complete)) && ev("E1").moveTo === -14 && ev("E2").moveTo === -7, "E1 and E2 completed 14 and 7 days ago");
  expect(APPLICATIONS.some((a) => a.event === "E2" && a.volunteer === "ravi" && a.final === "approved") && APPLICATIONS.some((a) => a.event === "E2" && a.volunteer === "priya" && a.final === "approved"), "E2 Ravi and Priya took part");
  expect(ev("E3").moveTo === -1 && !ev("E3").complete, "E3 ended yesterday, not completed");
  expect(Boolean(ev("E4").cancel) && count("E4", "approved") > 0, "E4 cancelled with approved volunteers");
  expect(ev("E5").start === "now", "E5 happening now");
  expect(ev("E14").review === "wait" && ev("E14").org === "woodlands", "E14 waiting, from Woodlands");
  expect(ev("E15").review === "reject" && Boolean(ev("E15").adminNote), "E15 rejected with a note");
  const appStates = new Set(APPLICATIONS.map((a) => /** @type {string} */ (a.final)));
  for (const s of ["pending", "approved", "rejected", "withdrawn"]) expect(appStates.has(s), `an application is ${s}`);
  for (const t of TASKS) expect(APPLICATIONS.some((a) => a.event === t.event && a.volunteer === t.volunteer && a.final === "approved"), `task "${t.title}": the volunteer is approved for ${t.event}`);
  expect(TASKS.filter((t) => t.event === "E1").every((t) => t.done), "E1 tasks are done");

  // Kavitha has no activity at all
  expect(!OFFERS.some((o) => o.donor === "kavitha") && !APPLICATIONS.some((a) => a.volunteer === "kavitha") && !CHATS.some((c) => c.person === "kavitha"), "Kavitha has no activity");
  // messages
  for (const c of CHATS) expect(org(c.org).approve, `chat with ${c.org}: the organization is approved`);
  const started = CHATS.reduce((acc, c) => ({ ...acc, [c.person]: (acc[c.person] ?? 0) + 1 }), /** @type {Record<string, number>} */ ({}));
  expect(Object.values(started).every((n) => n <= 5), "nobody starts more than 5 conversations a day");
  expect(CHATS.some((c) => c.report && c.topic.startsWith("Test:")), "the reported message is in a “Test:” conversation");

  // expected "Most needed" order with the app's formula (open requests that aren't past their deadline)
  const expectedScores = REQUESTS.filter((r) => r.review === "approve" && !r.close && !(r.moveDeadlineTo !== undefined && r.moveDeadlineTo < 0))
    .filter((r) => !r.items.every((i) => tot(`${r.key}.${i.key}`).received >= i.qty))
    .map((r) => ({
      key: r.key,
      score: scoreRequest({ deadline: sgDate(r.deadline), urgency: r.urgency, items: r.items.map((i) => ({ quantity_needed: i.qty, quantity_remaining: i.qty - tot(`${r.key}.${i.key}`).committed })) }).score,
    }))
    .sort((a, b) => b.score - a.score);
  expect(expectedScores[0]?.key === "R4" && expectedScores[0].score > (expectedScores[1]?.score ?? 0), "R4 tops “Most needed” on its own");
  return { problems, expectedScores };
}

// ===========================================================================================
// The seed
// ===========================================================================================

async function main() {
  const { problems, expectedScores } = checkDemoData();
  if (DRY_RUN) {
    console.log(`Accounts ${PEOPLE.length} · requests ${REQUESTS.length} · offers ${OFFERS.length} · events ${EVENTS.length} · applications ${APPLICATIONS.length} · tasks ${TASKS.length} · conversations ${CHATS.length}`);
    console.log(`Expected “Most needed”: ${expectedScores.slice(0, 4).map((s) => `${s.key} ${s.score}`).join(" · ")}`);
    if (problems.length) {
      console.log(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
      process.exitCode = 1;
    } else {
      const guide = demoGuide(); // builds DEMO.md's text (not saved) so a broken reference shows up now
      console.log(`Every promised situation checks out; DEMO.md would have ${guide.split("\n").length} lines. Nothing was written.`);
    }
    return;
  }

  // ---------- 0. setup
  step("Checking .env and the demo data");
  if (problems.length) throw new Error(`the demo data has problems:\n- ${problems.join("\n- ")}`);
  const env = readEnv();
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "DEMO_PASSWORD"].filter((name) => !env[name]);
  if (missing.length) throw new Error(`missing in .env: ${missing.join(", ")} (the values are never printed)`);
  if (env.DEMO_PASSWORD.length < 8) throw new Error("DEMO_PASSWORD in .env must be at least 8 characters");
  const url = env.SUPABASE_URL.replace(/\/+$/, "");
  const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, noSession);
  done("ok");

  step("Making sure the database hasn't been seeded yet");
  // admin accounts may use @example.com too (they survive the reset), so they don't count
  const admins = new Set(must(await admin.from("profiles").select("id").eq("role", "admin"), "listing admins").map((row) => row.id));
  for (let page = 1; ; page++) {
    const { users } = must(await admin.auth.admin.listUsers({ page, perPage: 1000 }), "listing accounts");
    if (users.some((u) => !admins.has(u.id) && u.email?.toLowerCase().endsWith("@example.com"))) {
      console.log("\nAlready seeded — run supabase/reset_data_keep_admins.sql first (Supabase SQL Editor), then run this again.");
      process.exitCode = 1;
      return;
    }
    if (users.length < 1000) break;
  }
  done("no demo accounts yet");

  step("Emptying the private offer-photos folder (photos from an earlier seed)");
  let removedPhotos = 0;
  for (const folder of must(await admin.storage.from("offer-photos").list("", { limit: 1000 }), "listing offer photos")) {
    for (const sub of must(await admin.storage.from("offer-photos").list(folder.name, { limit: 1000 }), "listing offer photos")) {
      const files = must(await admin.storage.from("offer-photos").list(`${folder.name}/${sub.name}`, { limit: 100 }), "listing offer photos");
      const paths = files.map((f) => `${folder.name}/${sub.name}/${f.name}`);
      if (paths.length) must(await admin.storage.from("offer-photos").remove(paths), "removing old offer photos");
      removedPhotos += paths.length;
    }
  }
  done(removedPhotos ? `${removedPhotos} removed` : "already empty");

  /** @type {Map<string, string>} person key → user id */
  const userId = new Map();
  /** @type {Map<string, import('@supabase/supabase-js').SupabaseClient>} person key → signed-in client */
  const clients = new Map();
  /**
   * A client signed in as this demo person (anon key, so every database rule applies).
   * @param {string} key
   */
  async function as(key) {
    const existing = clients.get(key);
    if (existing) return existing;
    const client = createClient(url, env.SUPABASE_ANON_KEY, noSession);
    must(await client.auth.signInWithPassword({ email: person(key).email, password: env.DEMO_PASSWORD }), `signing in as ${person(key).name}`);
    clients.set(key, client);
    return client;
  }
  /** @param {Map<string, string>} map @param {string} key */
  const id = (map, key) => /** @type {string} */ (map.get(key));

  // ---------- 1. accounts
  step(`Creating ${PEOPLE.length} accounts`);
  for (const p of PEOPLE) {
    /** @type {Record<string, unknown>} */
    const data = { full_name: p.name, phone: p.phone, privacy_consent: true, age_confirmed: true };
    if (p.kind === "organization") data.role = "organization";
    else Object.assign(data, { roles: p.roles, area: p.area, postal_code: p.postal }, p.volunteer ?? {});
    const created = must(
      await admin.auth.admin.createUser({ email: p.email, password: env.DEMO_PASSWORD, email_confirm: true, user_metadata: data }),
      `creating ${p.email}`,
    );
    userId.set(p.key, created.user.id);
  }
  done(PEOPLE.map((p) => p.name).join(", "));

  step("Admin: approving the volunteer accounts");
  const volunteers = PEOPLE.filter((p) => p.roles?.includes("volunteer"));
  for (const v of volunteers) changed(await admin.from("profiles").update({ volunteer_approval: "approved" }).eq("id", id(userId, v.key)).select("id"), `approving volunteer ${v.name}`);
  done(volunteers.map((v) => v.name).join(", "));

  // ---------- 2. organizations
  step("Organizations create their profiles");
  /** @type {Map<string, string>} organization key → id */
  const orgId = new Map();
  for (const o of ORGANIZATIONS) {
    const row = must(
      await (await as(o.key)).from("organizations").insert({ name: o.name, description: o.description, address: o.address, postal_code: o.postal, phone: o.phone, latitude: o.lat, longitude: o.lng }).select("id").single(),
      `${o.name} creating its profile`,
    );
    orgId.set(o.key, row.id);
  }
  done(`${ORGANIZATIONS.length} organizations, waiting for approval`);

  step("Admin: approving organizations");
  for (const o of ORGANIZATIONS.filter((x) => x.approve)) changed(await admin.from("organizations").update({ approval: "approved" }).eq("id", id(orgId, o.key)).select("id"), `approving ${o.name}`);
  done(`approved ${ORGANIZATIONS.filter((x) => x.approve).length}; ${ORGANIZATIONS.filter((x) => !x.approve).map((x) => x.name).join(", ")} is still waiting`);

  // ---------- 3. requests
  step("Organizations post donation requests");
  /** @type {Map<string, string>} */
  const requestId = new Map();
  /** @type {Map<string, string>} "<request>.<item>" → item id */
  const itemId = new Map();
  for (const r of REQUESTS) {
    const client = await as(r.org);
    const row = must(
      await client.from("donation_requests").insert({
        organization_id: id(orgId, r.org), title: r.title, description: r.description, urgency: r.urgency,
        deadline: sgDate(r.deadline), dropoff_instructions: r.dropoff,
      }).select("id").single(),
      `${r.key} "${r.title}"`,
    );
    requestId.set(r.key, row.id);
    const items = must(
      await client.from("request_items").insert(r.items.map((i) => {
        const d = detailsOf(i);
        return {
          request_id: row.id, name: i.name, category: i.category, unit: i.unit, quantity_needed: i.qty,
          size_spec: d.size, material: d.material ?? null, min_condition: i.category === "food" ? "any" : d.cond ?? "any",
          item_details: d.details ?? null, details_required: Boolean(d.describe),
        };
      })).select("id,name"),
      `${r.key} items`,
    );
    for (const i of r.items) itemId.set(`${r.key}.${i.key}`, /** @type {string} */ (items.find((x) => x.name === i.name)?.id));
  }
  done(`${REQUESTS.length} requests with ${itemId.size} items`);

  step("Admin: reviewing requests");
  for (const r of REQUESTS.filter((x) => x.review !== "wait")) {
    const change = r.review === "reject" ? { status: "rejected", admin_note: r.adminNote } : { status: "open" };
    changed(await admin.from("donation_requests").update(change).eq("id", id(requestId, r.key)).select("id"), `reviewing ${r.key}`);
  }
  done(REQUESTS.map((r) => `${r.key} ${r.review === "approve" ? "open" : r.review === "wait" ? "waiting" : "rejected"}`).join(" · "));

  // ---------- 4. offers
  step("Donors make offers");
  /** @type {string[]} */
  const offerIds = [];
  for (const [index, o] of OFFERS.entries()) {
    const { item } = splitItem(o.item);
    const d = detailsOf(item);
    const what = `${person(o.donor).name} offering ${o.qty} ${item.unit} of ${item.name} (${o.item})`;
    /** @type {Record<string, unknown>} */
    const offer = {
      request_item_id: id(itemId, o.item), quantity: o.qty, message: o.message ?? null, food_safety_confirmed: item.category === "food",
      // the condition is required when the item asks for one (the database checks it meets the minimum)
      offer_condition: o.condition ?? (item.category !== "food" ? d.cond ?? null : null),
      offer_details: o.details ?? (d.describe ? `${item.name}, ${d.size}` : null),
    };
    let row;
    if (o.photo) {
      // as on the site: the donor uploads the photo to their own private folder, then offers with it
      const client = await as(o.donor);
      const path = `${id(userId, o.donor)}/seed-${index + 1}/1.jpg`;
      must(await client.storage.from("offer-photos").upload(path, readFileSync(join(PHOTO_DIR, o.photo)), { contentType: "image/jpeg" }), `uploading ${o.photo}`);
      row = must(await client.from("donation_offers").insert({ ...offer, photo_paths: [path] }).select("id").single(), what);
    } else {
      // an older offer, from before photos were required (the admin client sets the donor)
      row = must(await admin.from("donation_offers").insert({ ...offer, donor_id: id(userId, o.donor) }).select("id").single(), what);
    }
    offerIds.push(row.id);
  }
  done(`${OFFERS.length} offers, all waiting (${OFFERS.filter((o) => o.photo).length} with photos)`);

  step("Organizations accept, reject and mark offers delivered; a donor cancels");
  for (const [index, o] of OFFERS.entries()) {
    const { request } = splitItem(o.item);
    const offer = offerIds[index];
    const what = `${o.final}: ${person(o.donor).name} on ${o.item}`;
    const orgClient = await as(request.org);
    if (o.final === "accepted" || o.final === "delivered") {
      changed(await orgClient.from("donation_offers").update({ status: "accepted" }).eq("id", offer).select("id"), what);
      if (o.final === "delivered") changed(await orgClient.from("donation_offers").update({ status: "delivered" }).eq("id", offer).select("id"), what);
    } else if (o.final === "rejected") {
      changed(await orgClient.from("donation_offers").update({ status: "rejected", reject_note: o.rejectNote ?? null }).eq("id", offer).select("id"), what);
    } else if (o.final === "cancelled") {
      changed(await (await as(o.donor)).from("donation_offers").update({ status: "cancelled" }).eq("id", offer).select("id"), what);
    }
  }
  const counts = OFFERS.reduce((acc, o) => ({ ...acc, [o.final]: (acc[o.final] ?? 0) + 1 }), /** @type {Record<string, number>} */ ({}));
  done(Object.entries(counts).map(([s, n]) => `${n} ${s}`).join(", "));

  step("Closing requests (their waiting offers become “Request closed”)");
  for (const r of REQUESTS.filter((x) => x.close)) {
    changed(await (await as(r.org)).from("donation_requests").update({ status: "closed", close_reason: r.close }).eq("id", id(requestId, r.key)).select("id"), `closing ${r.key}`);
    done(`${r.key} closed: ${r.close}`);
  }

  // ---------- 5. events
  step("Organizations post events");
  /** @type {Map<string, string>} */
  const eventId = new Map();
  for (const e of EVENTS) {
    const row = must(
      await (await as(e.org)).from("events").insert({
        organization_id: id(orgId, e.org), title: e.title, description: e.description, location_name: e.place, latitude: e.lat, longitude: e.lng,
        ...eventTimes(e, e.start), volunteers_needed: e.needed, donation_request_id: e.linkRequest ? id(requestId, e.linkRequest) : null,
      }).select("id").single(),
      `${e.key} "${e.title}"`,
    );
    eventId.set(e.key, row.id);
  }
  done(`${EVENTS.length} events`);

  step("Admin: reviewing events");
  for (const e of EVENTS.filter((x) => x.review !== "wait")) {
    const change = e.review === "reject" ? { approval: "rejected", admin_note: e.adminNote } : { approval: "approved" };
    changed(await admin.from("events").update(change).eq("id", id(eventId, e.key)).select("id"), `reviewing ${e.key}`);
  }
  done(`approved ${EVENTS.filter((x) => x.review === "approve").length}, 1 waiting, 1 rejected`);

  // ---------- 6. volunteering
  step("Volunteers apply; organizations decide; a volunteer withdraws");
  /** @type {string[]} */
  const applicationIds = [];
  for (const a of APPLICATIONS) {
    const e = ev(a.event);
    const row = must(
      await (await as(a.volunteer)).from("volunteer_applications").insert({ event_id: id(eventId, a.event), message: a.message ?? null }).select("id").single(),
      `${person(a.volunteer).name} applying to ${a.event}`,
    );
    applicationIds.push(row.id);
    const what = `${a.final}: ${person(a.volunteer).name} on ${a.event}`;
    if (a.final === "approved" || a.final === "rejected") {
      changed(await (await as(e.org)).from("volunteer_applications").update({ status: a.final }).eq("id", row.id).select("id"), what);
    } else if (a.final === "withdrawn") {
      changed(await (await as(a.volunteer)).from("volunteer_applications").update({ status: "withdrawn" }).eq("id", row.id).select("id"), what);
    }
  }
  done(`${APPLICATIONS.length} applications`);

  step("Organizations assign tasks; volunteers tick some off");
  for (const t of TASKS) {
    const row = must(
      await (await as(ev(t.event).org)).from("volunteer_tasks").insert({
        event_id: id(eventId, t.event), volunteer_id: id(userId, t.volunteer), title: t.title, description: t.description ?? null, due_at: sgTime(t.dueDays, t.time),
      }).select("id").single(),
      `task "${t.title}"`,
    );
    if (t.done) changed(await (await as(t.volunteer)).from("volunteer_tasks").update({ status: "done" }).eq("id", row.id).select("id"), `${t.volunteer} finishing "${t.title}"`);
  }
  done(`${TASKS.length} tasks, ${TASKS.filter((t) => t.done).length} done`);

  // ---------- 7. cancelled, past and completed events (after the applications)
  step("Cancelling, moving into the past and completing events");
  for (const e of EVENTS.filter((x) => x.cancel)) {
    changed(await (await as(e.org)).from("events").update({ status: "cancelled", cancel_reason: e.cancel }).eq("id", id(eventId, e.key)).select("id"), `cancelling ${e.key}`);
  }
  for (const e of EVENTS.filter((x) => x.moveTo !== undefined)) {
    changed(await admin.from("events").update(eventTimes(e, /** @type {number} */ (e.moveTo))).eq("id", id(eventId, e.key)).select("id"), `moving ${e.key} into the past`);
  }
  for (const e of EVENTS.filter((x) => x.complete)) {
    changed(await (await as(e.org)).from("events").update({ status: "completed", outcome_summary: e.complete }).eq("id", id(eventId, e.key)).select("id"), `completing ${e.key}`);
  }
  done(EVENTS.filter((x) => x.cancel || x.moveTo !== undefined).map((e) => `${e.key} ${e.cancel ? "cancelled" : e.complete ? `completed ${-(e.moveTo ?? 0)} days ago` : "ended yesterday"}`).join(" · "));

  // ---------- 8. messages
  step("Messages (and one report)");
  /** @type {{ chat: Chat, conversation: string, messages: string[] }[]} */
  const conversations = [];
  for (const c of CHATS) {
    const conversation = /** @type {string} */ (must(await (await as(c.person)).rpc("start_conversation", { p_org_id: id(orgId, c.org), p_topic: c.topic }), `${person(c.person).name} messaging ${org(c.org).name}`));
    /** @type {string[]} */
    const messages = [];
    for (const line of c.lines) {
      const sender = line.from === "person" ? c.person : c.org;
      const row = must(await (await as(sender)).from("messages").insert({ conversation_id: conversation, body: line.body }).select("id").single(), `a message from ${sender}`);
      messages.push(row.id);
      await pause(40); // keeps the order clear
    }
    if (c.report) must(await (await as(c.person)).from("message_reports").insert({ message_id: messages[c.report.line], reason: c.report.reason }).select("id").single(), `${person(c.person).name} reporting a message`);
    conversations.push({ chat: c, conversation, messages });
  }
  done(`${CHATS.length} conversations, ${CHATS.reduce((n, c) => n + c.lines.length, 0)} messages, ${CHATS.filter((c) => c.report).length} report`);

  // ---------- 9. dates in the past (admin), after the normal actions
  step("Moving dates into the past");
  for (const r of REQUESTS.filter((x) => x.moveDeadlineTo !== undefined)) {
    changed(await admin.from("donation_requests").update({ deadline: sgDate(/** @type {number} */ (r.moveDeadlineTo)) }).eq("id", id(requestId, r.key)).select("id"), `moving ${r.key}'s deadline`);
    done(`${r.key}'s deadline is now ${r.moveDeadlineTo === -1 ? "yesterday" : `${-(r.moveDeadlineTo ?? 0)} days ago`}`);
  }
  // natural "posted / offered / applied / sent" times; anything the database refuses is skipped, not fatal
  let skipped = 0;
  /** @param {string} table @param {string} rowId @param {Record<string, string>} change */
  const backdate = async (table, rowId, change) => {
    const { error } = await admin.from(table).update(change).eq("id", rowId);
    if (error) skipped++;
  };
  for (const r of REQUESTS) await backdate("donation_requests", id(requestId, r.key), { created_at: hoursFromNow(-r.postedDaysAgo * 24 - 3) });
  for (const [index, o] of OFFERS.entries()) await backdate("donation_offers", offerIds[index], { created_at: hoursFromNow(-Math.min(o.daysAgo, splitItem(o.item).request.postedDaysAgo - 1) * 24 - 2) });
  for (const [index, a] of APPLICATIONS.entries()) await backdate("volunteer_applications", applicationIds[index], { created_at: hoursFromNow(-a.daysAgo * 24 - 1) });
  for (const { chat, conversation, messages } of conversations) {
    const times = messages.map((_, i) => hoursFromNow(-chat.hoursAgo + i * 0.75));
    for (const [i, messageId] of messages.entries()) await backdate("messages", messageId, { created_at: times[i] });
    await backdate("conversations", conversation, { created_at: times[0], last_message_at: times[times.length - 1] });
  }
  done(`posted, offered, applied and message times spread over the past two weeks${skipped ? ` (${skipped} left as they were)` : ""}`);

  // ---------- 10. AI urgency scores (the app's formula)
  step(`Scoring approved requests${env.NVIDIA_API_KEY ? " (with AI explanations)" : " (no NVIDIA key: plain explanations)"}`);
  const deps = { env, fetch };
  let withAi = 0;
  /** @type {{ key: string, score: number }[]} */
  const scores = [];
  for (const r of REQUESTS.filter((x) => x.review === "approve")) {
    const request = await loadRequest(id(requestId, r.key), deps);
    if (!request) continue;
    const result = await scoreAndSave(request, deps);
    if (result.ai) withAi++;
    if (!r.close && !(r.moveDeadlineTo !== undefined && r.moveDeadlineTo < 0) && request.status === "open") scores.push({ key: r.key, score: result.score });
  }
  scores.sort((a, b) => b.score - a.score);
  done(`${REQUESTS.filter((x) => x.review === "approve").length} scored, ${withAi} with an AI explanation`);
  done(`“Most needed”: ${scores.slice(0, 3).map((s) => `${s.key} (${s.score})`).join(", ")}`);
  if (scores[0]?.key !== "R4") console.log("  ! R4 isn't first in “Most needed” — check its deadline and urgency.");

  // ---------- 11. DEMO.md
  step("Writing DEMO.md");
  writeFileSync("DEMO.md", demoGuide());
  done("DEMO.md (it's in .gitignore)");

  console.log("\nDemo logins (password: DEMO_PASSWORD in .env)");
  for (const p of PEOPLE) console.log(`  ${p.email.padEnd(34)} ${roleLabel(p)}`);
  console.log("\nAll done. Open DEMO.md for where to find each situation and the 3-minute demo route.");
}

// ===========================================================================================
// DEMO.md
// ===========================================================================================

/** @param {Person} p */
function roleLabel(p) {
  if (p.kind === "organization") return org(p.key).approve ? "Organization" : "Organization (waiting for approval)";
  return (p.roles ?? []).map((r) => (r === "donor" ? "Donor" : "Volunteer")).join(" + ");
}
/** @param {string} key */
const login = (key) => `${person(key).name} (\`${person(key).email}\`)`;
/** @param {string} key */
const orgLogin = (key) => `${org(key).name} (\`${person(key).email}\`)`;

/** The demo guide written at the end (no password in it). @returns {string} */
function demoGuide() {
  const logins = PEOPLE.map((p) => `| ${p.kind === "organization" ? org(p.key).name : p.name} | \`${p.email}\` | ${roleLabel(p)} | ${p.show} |`);

  /** @type {[string, string, string, string][]} situation, log in as, page, what you see */
  const rows = [];
  for (const r of REQUESTS) {
    const where = r.review === "wait" || r.review === "reject" ? "Organization → Requests → History or Active" : "Organization → Requests (also Browse needs)";
    rows.push([`${r.key}: ${r.situation}`, orgLogin(r.org), where, `“${r.title}”`]);
  }
  for (const e of EVENTS) {
    rows.push([`${e.key}: ${e.situation}`, orgLogin(e.org), e.key === "E3" ? "Organization → Overview (Needs your action)" : "Organization → Events (Volunteers opens the list)", `“${e.title}”`]);
  }
  rows.push(
    ["Offer: pending", login("siti"), "My offers → Active", "Blankets on R6 (deadline passed — waiting for the organization)"],
    ["Offer: accepted, with drop-off", login("siti"), "My offers → Active, and Overview → Ready to drop off", "10 bars of soap (R14) with the drop-off address"],
    ["Offer: delivered (stamp)", login("siti"), "My offers → History", "Delivered · Thank you! stamps"],
    ["Offer: rejected, with a note", login("daniel"), "My offers → History, then Messages", "Storybooks (R15) and Jurong Hearts' reply"],
    ["Offer: cancelled by the donor", login("daniel"), "My offers → History", "Track pants (R16)"],
    ["Item details on a notice", "Anyone (logged out is fine)", "Browse needs → Starter kits (R10) → Offer", "Cooking pots: 24–28 cm · Stainless steel · Like new or better, “With a lid”, donors describe their item"],
    ["Halal-only food, size 4 diapers, school shoes", "Anyone", "Browse needs → R12, R13 and R15", "Canned sardines “Halal-certified only”; Diapers (size 4); School shoes EU 30–36, Good or better"],
    ["Offer with condition, description and photo", login("weiling"), "Donating → My offers → Cooking pots → See timeline", "Like new · 26 cm stainless steel pots with lids, plus her photo"],
    ["Needed vs offered, with photos", orgLogin("hearts"), "Offers → the board", "Ahmad's school shoes in New (Needed: EU 30–36 · Good or better / Offered: Good · …) with the photo"],
    ["AI check: Halal, size and salt", "Anyone (logged out is fine)", "Home → What can you give?", "See “Make it fail” below: pork luncheon meat isn't sent to R17, rice is; instant noodles get a question (R19)"],
    ["Quick-pick rules", orgLogin("pantry"), "Requests → New request → an item's Other details", "Buttons such as “Halal-certified only” add the rule in English"],
    ["What can I donate?", "Anyone", "Browse needs → What can I donate?", "The general rules in your language"],
    ["Find me where to help (AI)", login("priya"), "Volunteering → Find events", `See “Find me where to help” below: E13 needs a driver, E8 needs someone who can lift 10 kg`],
    ["No “Use my profile” (matching off)", login("marcus"), "Volunteering → Find events", "Only the text box: Marcus didn't allow matching"],
    ["Rejected: doesn't match the size", login("siti"), "My offers → History, then Messages", "20 cm pot (R10) with Jurong Hearts' note and message"],
    ["Offer: “Request closed”", login("weiling"), "Donating → My offers → History", "Rice for Deepavali hampers (R7): Got enough from a school drive"],
    ["Empty states", login("kavitha"), "Overview, My offers, Messages", "Pinny and “nothing here yet” messages"],
    ["Two roles: Donating ↔ Volunteering", login("weiling"), "Top bar avatar menu", "Switch between the donor and volunteer dashboards"],
    ["Translation from Malay", orgLogin("pantry"), "Messages → Ahmad Ismail", "Ahmad's messages in English, with See original"],
    ["Translation from Chinese", orgLogin("circle"), "Messages → Wei Ling Chen", "Wei Ling's messages in English, with See original"],
    ["Reported message", "Admin", "Browse → Reported", "“Asked for money” from Daniel (Test: suspicious message)"],
    ["Organization waiting for approval", "Admin", "To review → Organizations", "Bedok Bright Futures Club"],
    ["Request waiting for approval (R8)", "Admin", "To review → Requests", `“${req("R8").title}”`],
    ["Event waiting for approval (E14)", "Admin", "To review → Events", `“${ev("E14").title}”`],
    ["Applications waiting (E12)", orgLogin("hearts"), "Events → Back-to-school book wrapping → Volunteers", "5 people waiting: View, Approve or Reject"],
  );
  const situations = rows.map((r) => `| ${r.join(" | ")} |`);

  return `# KampongShare demo

Everything here is fictional, made by \`scripts/seed.js\`. To start again: run \`supabase/reset_data_keep_admins.sql\` in the Supabase SQL Editor, then \`npm run seed\`.

## 1. Logins

**Password for every demo account:** see \`DEMO_PASSWORD\` in \`.env\`.
**Admin:** your own admin account.

| Who | Email | Role | What to show |
| --- | --- | --- | --- |
${logins.join("\n")}

## 2. Where to find each situation

| Situation | Log in as | Page | What you see |
| --- | --- | --- | --- |
${situations.join("\n")}

## 3. Three-minute demo route

1. **Home page, logged out** (\`/\`): "Most needed" shows the pinned notices, with **${req("R4").title}** first. Scroll to **What can you give?**, type \`I have 5 bags of rice\` and press **Find matches**: AI-suggested matches with one-line reasons.
2. **Log in as Siti** (\`${person("siti").email}\`): **Find needs** → on **${req("R4").title}** press **Offer** → in the panel, **Offer** → choose 5 → condition **New** → **Add photos** (any picture, e.g. \`scripts/demo-photos/rice-5kg.jpg\`) → **Offer 5 packs**.
3. **Log out, log in as Tampines Kampung Pantry** (\`${person("pantry").email}\`): **Offers** → the board (New · Accepted · Delivered) → Siti's offer is in **New** → **Accept offer** → it moves to **Accepted** → **Mark delivered**.
4. **Log in as Siti again**: **My offers** → **History** shows **Delivered · Thank you!** (with Pinny the first time).
5. **Back as Tampines Kampung Pantry**: the chat icon → **Messages** → **Ahmad Ismail**: his Malay messages appear in English (press **See original** to show the Malay).
6. **Home page**: the **Upcoming events** map. Open **${ev("E6").title}** (full), **${ev("E7").title}** (one spot left) and **${ev("E5").title}** (happening now).
7. **Log in as your admin**: **To review** → **Organizations** → **Bedok Bright Futures Club** → **Approve**. Then **Browse** → **Reported**: Daniel's "Asked for money" report → **Mark resolved**.

## 4. Make it fail: the AI check

Two separate AIs build the donation plan. The **first** finds requests by what each item *is* and never sees the requests' rules. The **second** checks every pairing against the general rules (Browse needs → **What can I donate?**) and each request's own rules (size, condition, material, details such as "Halal-certified only"): **match**, **block** (only a clear conflict with a written rule) or **ask** (when it depends on the label). It takes about 10–20 seconds.

1. **Home page → What can you give?**, type \`4 cans of pork luncheon meat and 3 bags of rice\` → **Find matches**.
   - **Your donation plan · Checked by AI ✓**: the rice goes to **${req("R17").title}**.
   - **Not matched**: pork luncheon meat → not sent to “${req("R17").title}” (Halal-certified only). Press **Why?** for the checker's reason. The rice still has its place, so one blocked item never hides the rest.
2. Type \`4 cans of Halal-certified chicken luncheon meat\` → matched to the canned meat. It's not a list of banned words: the checker reasons about what the item really is.
3. Type \`5 packs of instant noodles\` → **Needs your answer**: the checker asks whether they are low-salt, because **${req("R19").title}** says "Low-salt, soft and easy to chew (for seniors)". **Yes** checks again and matches; **No** leaves that request out; **Not sure** says "Check the label, then try again".
4. Bonus: \`home-cooked curry\` → "can't be donated: No cooked or home-made food." (a general rule, so it applies everywhere).
5. If the AI is slow or down, there is **no plan at all**: "We couldn't check your items right now" with **Try again**. Nothing unchecked is ever shown.
6. Organizations: when posting a request, the **Other details** field has quick-pick rules (e.g. **Halal-certified only**, **Low-salt, soft (seniors)**). The label is in your language; the rule is added in English so the checker always reads the same words.

## 5. Find me where to help: AI volunteer matching

The same two-AI design for volunteers. The **first** AI picks up to 5 events from when you're free and what you like doing; the **second** checks each one against what the event writes down that it needs: **${ev("E13").title}** says "Driver with licence needed", **${ev("E8").title}** says "Must be able to lift 10 kg bags of soil". It blocks only a clear conflict with your own words, and asks when you didn't say.

1. **Log in as Priya** (\`${person("priya").email}\`) → **Volunteering** → **Find events**. Priya allowed matching, so **Use my profile** is there: it sends only her days, times, interests, skills and area (never her name or contact details).
2. Type \`I can't drive and I have a bad back, I like gardening and helping seniors\` → **Find events**. **Not a fit**: ${ev("E13").title} (driver needed) and ${ev("E8").title} (lifting 10 kg), each with a **Why?**. Events without written needs that suit her appear under **Events that fit you · Checked by AI ✓**.
3. Type \`I like gardening\` → **Needs your answer**: "Can you lift about 10 kg?" for ${ev("E8").title}. **Yes** checks again and it fits; **No** leaves it out.
4. Press the example \`Free Saturday mornings, I can drive, I like helping seniors\`: events that need a driver fit, with a reason such as "Needs a driver; you said you can drive". **Apply** opens the normal application form on that event's card.
5. **Log in as Marcus** (\`${person("marcus").email}\`): he didn't allow matching, so there is no **Use my profile** button.
6. If the AI is slow or down: "We couldn't check right now. Please try again." and no list at all.

Which events show depends on today's date (the seed sets them days ahead), so the days in your answers matter.
`;
}

main().catch((error) => {
  console.log(`\nStopped at step "${currentStep}": ${error instanceof Error ? error.message : String(error)}`);
  console.log("Fix the problem, run supabase/reset_data_keep_admins.sql, then run the seed again.");
  process.exitCode = 1;
});
