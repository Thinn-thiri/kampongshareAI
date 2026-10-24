// @ts-check
// Scores every open donation request with the transparent urgency formula (and an AI explanation
// when NVIDIA_API_KEY is set). Run with: node scripts/score-requests.js
// Uses the service role key from .env and never prints it. Prints only counts.

import { readFileSync, existsSync } from "node:fs";
import { loadRequest, scoreAndSave, supabaseRest } from "../netlify/lib/score.js";

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
 * Scores all open requests one by one and prints a short summary.
 * @returns {Promise<void>}
 */
async function main() {
  const env = readEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.");
    process.exitCode = 1;
    return;
  }
  const deps = { env, fetch };
  const rows = await supabaseRest(deps).request("donation_requests?select=id&status=eq.open");
  console.log(`Scoring ${rows.length} open requests${env.NVIDIA_API_KEY ? " (with AI explanations)" : " (no NVIDIA key: plain explanations)"}…`);

  let withAi = 0;
  let failed = 0;
  for (const { id } of rows) {
    try {
      const request = await loadRequest(id, deps);
      if (!request) continue;
      const result = await scoreAndSave(request, deps);
      if (result.ai) withAi++;
    } catch {
      failed++;
    }
  }
  console.log(`Done: ${rows.length - failed} scored (${withAi} with an AI explanation)${failed ? `, ${failed} failed` : ""}.`);
  if (failed) process.exitCode = 1;
}

main();
