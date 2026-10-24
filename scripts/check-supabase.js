// @ts-check
// Checks the connection to Supabase and that the database has the latest schema.
// Run with: node scripts/check-supabase.js
// It never prints a key or anything else from .env — only OK / MISSING.

import { readFileSync, existsSync } from "node:fs";

/** Columns that only exist in the latest schema: [table, column]. */
const REQUIRED_COLUMNS = [
  ["profiles", "is_donor"],
  ["profiles", "consented_at"],
  ["organizations", "approval"],
  ["events", "approval"],
  ["donation_requests", "dropoff_instructions"],
  ["donation_offers", "food_safety_confirmed"],
  ["organizations", "postal_code"],
  ["profiles", "volunteer_approval"],
  ["profile_contacts", "phone"],
];

/** Friendly labels for the public_stats() totals. */
const STAT_LABELS = {
  items_delivered: "Items delivered",
  completed_donations: "Completed donations",
  open_requests: "Open requests",
  upcoming_events: "Upcoming events",
  organizations: "Organizations",
};

/** @type {string[]} */
const missing = [];
let schemaMissing = false;

/**
 * @param {string} message
 */
function ok(message) {
  console.log(`  OK       ${message}`);
}

/**
 * @param {string} message
 */
function fail(message) {
  console.log(`  MISSING  ${message}`);
  missing.push(message);
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
 * Reads the public URL and anon key from js/config.js.
 * @returns {{ url: string, anonKey: string }}
 */
function readConfig() {
  const source = readFileSync("js/config.js", "utf8");
  const url = source.match(/SUPABASE_URL\s*=\s*"([^"]*)"/)?.[1] ?? "";
  const anonKey = source.match(/SUPABASE_ANON_KEY\s*=\s*"([^"]*)"/)?.[1] ?? "";
  return { url, anonKey };
}

/**
 * @param {string} url
 * @returns {string}
 */
function normaliseUrl(url) {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Decodes the middle part of a JWT, or returns null if the key isn't a JWT.
 * @param {string} key
 * @returns {Record<string, unknown> | null}
 */
function jwtPayload(key) {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Request headers for a key. New-style sb_secret_/sb_publishable_ keys only go in `apikey`.
 * @param {string} key
 * @returns {Record<string, string>}
 */
function authHeaders(key) {
  /** @type {Record<string, string>} */
  const headers = { apikey: key };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  return headers;
}

/**
 * Short, key-free description of a failed response.
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function describeError(response) {
  let detail = "";
  try {
    const body = await response.json();
    detail = [body.code, body.message].filter(Boolean).join(" ");
  } catch {
    // not JSON — the status code is enough
  }
  return `HTTP ${response.status}${detail ? ` — ${detail}` : ""}`;
}

/**
 * Checks the settings, the schema columns and public_stats, then prints a summary.
 * @returns {Promise<void>}
 */
async function main() {
  console.log("\nKampongShare — Supabase check\n");

  // 1. Settings
  console.log("Settings");
  const env = readEnv();
  const config = readConfig();
  const envUrl = normaliseUrl(env.SUPABASE_URL ?? "");
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (envUrl) ok("SUPABASE_URL is set in .env");
  else fail("SUPABASE_URL in .env");
  if (serviceKey) ok("SUPABASE_SERVICE_ROLE_KEY is set in .env");
  else fail("SUPABASE_SERVICE_ROLE_KEY in .env");

  const configUrl = normaliseUrl(config.url);
  if (configUrl && !configUrl.startsWith("YOUR_") && configUrl === envUrl) ok("URL in js/config.js matches .env");
  else fail("URL in js/config.js doesn't match the one in .env");

  const projectRef = envUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)?.[1];
  const anon = jwtPayload(config.anonKey);
  if (!config.anonKey || config.anonKey.startsWith("YOUR_")) {
    fail("anon key in js/config.js");
  } else if (anon && anon.role !== "anon") {
    fail(`anon key in js/config.js — it's a "${anon.role}" key; use the anon (public) key`);
  } else if (anon && projectRef && anon.ref !== projectRef) {
    fail("anon key in js/config.js — it belongs to a different Supabase project");
  } else {
    ok("anon key in js/config.js looks right");
  }

  if (!envUrl || !serviceKey || !config.anonKey) {
    return summary();
  }

  // 2. Latest schema (service role key, no rows read)
  console.log("\nDatabase schema");
  for (const [table, column] of REQUIRED_COLUMNS) {
    try {
      const response = await fetch(`${envUrl}/rest/v1/${table}?select=${column}&limit=0`, {
        headers: authHeaders(serviceKey),
      });
      if (response.ok) ok(`${table}.${column}`);
      else {
        fail(`${table}.${column} (${await describeError(response)})`);
        schemaMissing = true;
      }
    } catch (error) {
      fail(`${table}.${column} (couldn't reach Supabase: ${error instanceof Error ? error.message : error})`);
    }
  }

  // 3. Public totals (anon key, same as a visitor's browser)
  console.log("\nPublic totals (public_stats)");
  try {
    const response = await fetch(`${envUrl}/rest/v1/rpc/public_stats`, {
      method: "POST",
      headers: { ...authHeaders(config.anonKey), "Content-Type": "application/json" },
      body: "{}",
    });
    if (!response.ok) {
      fail(`public_stats function (${await describeError(response)})`);
      schemaMissing = true;
    } else {
      const rows = await response.json();
      const stats = Array.isArray(rows) ? rows[0] : rows;
      ok("public_stats works with the anon key");
      for (const [key, label] of Object.entries(STAT_LABELS)) {
        console.log(`           ${label}: ${stats?.[key] ?? 0}`);
      }
    }
  } catch (error) {
    fail(`public_stats function (couldn't reach Supabase: ${error instanceof Error ? error.message : error})`);
  }

  summary();
}

/**
 * Prints "everything is OK" or the list of missing things, and sets the exit code.
 * @returns {void}
 */
function summary() {
  console.log("");
  if (missing.length === 0) {
    console.log("Result: everything is OK ✅\n");
    return;
  }
  console.log(`Result: ${missing.length} thing(s) MISSING ❌`);
  for (const item of missing) console.log(`  - ${item}`);
  if (schemaMissing) {
    console.log(
      "\nIf columns or public_stats are missing, your tables are from an older version.\n" +
        "In the Supabase SQL Editor, run supabase/reset_database.sql, then the file in\n" +
        "supabase/migrations/ (this deletes test data). Then run this check again.",
    );
  }
  console.log("");
  process.exitCode = 1;
}

main();
