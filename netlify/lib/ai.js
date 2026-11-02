// @ts-check
// Shared NVIDIA Build helpers for the Netlify Functions and scripts (server side only — never the browser).
// REQUIREMENTS.md 4.6: never send personal data to the AI; callers strip it first with stripPersonalData().

/** The NVIDIA Build model. Change it here only.
 *  nemotron-3.5-lightning-30b-a3b answers in about 1–2 s with correct JSON when its "thinking" is
 *  turned off (THINKING_OFF below). On 30 Oct 2026 nemotron-3.5-bolt-e4b stopped answering (> 20 s,
 *  so every AI feature fell back), and google/gemma-4-31b-it timed out (> 25 s) on 24 Oct 2026. */
export const MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";

/** The model for Pinny's agent mode (tool calling, REQUIREMENTS.md 6.8). Tested on 2 Nov 2026: lightning
 *  supports OpenAI-style "tools" — it picked search_requests / prepare_offer with correct arguments and
 *  returned valid JSON, usually in 1–5 s a round (outliers 11–21 s, so the agent keeps a 20 s budget).
 *  Llama 3.x is retired (410), gpt-oss-20b timed out (> 30 s), and the other Nemotron / Kimi models
 *  aren't available on this account (404). */
export const AGENT_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";

/** Lightning is a reasoning model: without this it spends its tokens thinking and returns no answer. */
const THINKING_OFF = { chat_template_kwargs: { enable_thinking: false } };

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const TIMEOUT_MS = 10000;
/** NVIDIA sometimes leaves a request waiting ~28 s while the same request sent again answers in under 1 s
 *  (measured 2 Nov 2026). So if there's no answer after this long, one identical second try starts and
 *  whichever answers first wins (the other is cancelled). At most 2 requests per call. */
const SECOND_TRY_AFTER_MS = 3000;

/**
 * Runs `attempt` once, and once more in parallel if the first hasn't answered after SECOND_TRY_AFTER_MS.
 * Returns the first non-null result, or null when both fail or the time runs out.
 * @template T
 * @param {(signal: AbortSignal) => Promise<T | null>} attempt never throws; null = failed
 * @param {number} timeoutMs
 * @returns {Promise<T | null>}
 */
async function withSecondTry(attempt, timeoutMs) {
  const controllers = [new AbortController(), new AbortController()];
  const overall = AbortSignal.timeout(timeoutMs);
  overall.addEventListener("abort", () => controllers.forEach((c) => c.abort()));
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const result = await new Promise((resolve) => {
    let pending = 1;
    /** @param {AbortController} controller */
    const run = (controller) =>
      attempt(AbortSignal.any([controller.signal, overall])).then((value) => {
        pending -= 1;
        if (value !== null) resolve(value);
        else if (pending === 0 && (started === 2 || overall.aborted)) resolve(null);
        else if (pending === 0) startSecond();
      });
    let started = 1;
    const startSecond = () => {
      if (started === 2 || overall.aborted) return;
      started = 2;
      pending += 1;
      run(controllers[1]);
    };
    run(controllers[0]);
    // only worth a second try when there's time left for it to answer
    if (timeoutMs > SECOND_TRY_AFTER_MS + 1500) timer = setTimeout(startSecond, SECOND_TRY_AFTER_MS);
    overall.addEventListener("abort", () => resolve(null));
  });
  clearTimeout(timer);
  controllers.forEach((c) => c.abort());
  return /** @type {T | null} */ (result);
}

/**
 * Removes anything that looks like personal data before text goes to the AI.
 * @param {string} text
 * @returns {string}
 */
export function stripPersonalData(text) {
  return text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[removed]") // emails
    .replace(/\b[STFGM]\d{7}[A-Z]\b/gi, "[removed]") // NRIC / FIN
    .replace(/(\+?65[\s-]?)?\b[3689]\d{3}[\s-]?\d{4}\b/g, "[removed]") // Singapore phone numbers
    .replace(/\d{7,}/g, "[removed]") // any other long number
    .replace(/\b\d{6}\b/g, "[removed]"); // postal codes
}

/**
 * Sends a chat to NVIDIA Build (OpenAI-compatible). Returns the reply text, or null if the AI
 * isn't configured, fails or times out — callers always have a fallback.
 * @param {{ role: 'system' | 'user', content: string }[]} messages
 * @param {{ apiKey?: string, maxTokens?: number, fetch?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<string | null>}
 */
export async function chat(messages, options = {}) {
  // Tolerate a key pasted with the "Bearer " prefix from NVIDIA's sample code.
  const apiKey = options.apiKey?.trim().replace(/^Bearer\s+/i, "");
  if (!apiKey) return null;
  const doFetch = options.fetch ?? fetch;
  const requestBody = JSON.stringify({ model: MODEL, temperature: 0, max_tokens: options.maxTokens ?? 300, ...THINKING_OFF, messages });
  return withSecondTry(async (signal) => {
    try {
      const response = await doFetch(NVIDIA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: requestBody,
        signal,
      });
      if (!response.ok) return null;
      const body = await response.json();
      const content = body?.choices?.[0]?.message?.content;
      return typeof content === "string" && content.trim() ? content.trim() : null;
    } catch {
      return null;
    }
  }, options.timeoutMs ?? TIMEOUT_MS);
}

/**
 * @typedef {{ id: string, type: 'function', function: { name: string, arguments: string } }} ToolCall
 * @typedef {{ role: 'system' | 'user', content: string }
 *   | { role: 'assistant', content: string, tool_calls?: ToolCall[] }
 *   | { role: 'tool', tool_call_id: string, content: string }} AgentMessage
 */

/**
 * One round of a tool-calling chat (OpenAI-compatible "tools"). Returns the text and any tool calls the
 * model chose, or null if the AI isn't configured, fails or times out.
 * @param {AgentMessage[]} messages
 * @param {{ tools?: object[], json?: boolean, apiKey?: string, maxTokens?: number, fetch?: typeof fetch, timeoutMs?: number }} [options]
 *   without `tools` the model has to answer in text; `json` makes that text a JSON object (response_format)
 * @returns {Promise<{ content: string, toolCalls: ToolCall[] } | null>}
 */
export async function chatWithTools(messages, options = {}) {
  const apiKey = options.apiKey?.trim().replace(/^Bearer\s+/i, "");
  if (!apiKey) return null;
  const doFetch = options.fetch ?? fetch;
  /** @type {Record<string, unknown>} */
  const body = { model: AGENT_MODEL, temperature: 0, max_tokens: options.maxTokens ?? 450, ...THINKING_OFF, messages };
  if (options.tools?.length) Object.assign(body, { tools: options.tools, tool_choice: "auto" });
  else if (options.json) body.response_format = { type: "json_object" };
  const requestBody = JSON.stringify(body);
  return withSecondTry(async (signal) => {
    try {
      const response = await doFetch(NVIDIA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: requestBody,
        signal,
      });
      if (!response.ok) return null;
      const message = (await response.json())?.choices?.[0]?.message;
      if (!message) return null;
      /** @type {ToolCall[]} */
      const toolCalls = Array.isArray(message.tool_calls)
        ? message.tool_calls.filter((/** @type {any} */ c) => c?.type === "function" && typeof c.function?.name === "string" && typeof c.id === "string")
        : [];
      const content = typeof message.content === "string" ? message.content.trim() : "";
      if (!content && !toolCalls.length) return null;
      return { content, toolCalls };
    } catch {
      return null;
    }
  }, options.timeoutMs ?? TIMEOUT_MS);
}
