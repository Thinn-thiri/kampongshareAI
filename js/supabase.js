// @ts-check
// Creates the shared Supabase client `sb`. Needs the supabase-js CDN script and js/config.js loaded first.

/** @typedef {import('@supabase/supabase-js').SupabaseClient} SupabaseClient */

/** @type {SupabaseClient | null} */
const sb = createSupabaseClient();

/**
 * The Supabase client for database calls; throws if js/config.js isn't filled in yet.
 * @returns {SupabaseClient}
 */
function db() {
  if (!sb) throw new Error("Supabase not configured");
  return sb;
}

/**
 * Returns a client, or null (with a console warning) while js/config.js still has placeholders.
 * @returns {SupabaseClient | null}
 */
function createSupabaseClient() {
  const configured = SUPABASE_URL.startsWith("https://") && !SUPABASE_ANON_KEY.startsWith("YOUR_");
  if (!configured) {
    console.warn("Supabase not configured — add your URL and anon key to js/config.js");
    return null;
  }
  /** @type {any} */
  const supabaseLib = /** @type {any} */ (window).supabase;
  return supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
