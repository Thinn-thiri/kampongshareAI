// @ts-check
// Shared NVIDIA Build helpers for the Netlify Functions and scripts (server side only — never the browser).
// REQUIREMENTS.md 4.6: never send personal data to the AI; callers strip it first with stripPersonalData().

/** The NVIDIA Build model. Change it here only.
 *  nemotron-3.5-lightning-30b-a3b answers in about 1–2 s with correct JSON when its "thinking" is
 *  turned off (THINKING_OFF below). On 30 Oct 2026 nemotron-3.5-bolt-e4b stopped answering (> 20 s,
 *  so every AI feature fell back), and google/gemma-4-31b-it timed out (> 25 s) on 24 Oct 2026. */
export const MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";

/** Lightning is a reasoning model: without this it spends its tokens thinking and returns no answer. */
const THINKING_OFF = { chat_template_kwargs: { enable_thinking: false } };

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const TIMEOUT_MS = 10000;

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
  try {
    const response = await doFetch(NVIDIA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: MODEL, temperature: 0, max_tokens: options.maxTokens ?? 300, ...THINKING_OFF, messages }),
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim() ? content.trim() : null;
  } catch {
    return null;
  }
}
