'use strict';

/**
 * Provider-agnostic LLM client.
 *
 * Reads LLM_PROVIDER / LLM_API_KEY / LLM_MODEL / LLM_BASE_URL from env vars
 * (per ARCHITECTURE.md §7) and exposes a single function, `complete()`,
 * that the rest of the backend calls without knowing which provider is
 * behind it. Swapping providers is a `.env` change, not a code change.
 *
 * Supported LLM_PROVIDER values: "anthropic" (default), "openai", or any
 * OpenAI-compatible endpoint reachable via LLM_BASE_URL (e.g. local Ollama,
 * Groq, etc — anything that speaks the OpenAI chat/completions shape).
 *
 * `complete()` always returns a plain string (the model's reply text).
 * Callers that need structured JSON back are responsible for asking the
 * model to reply in JSON (see llm/prompts.js) and parsing the string
 * themselves — this client stays a thin, dumb transport layer.
 */

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_MAX_TOKENS = 1024;

/**
 * @typedef {{ role: 'system'|'user'|'assistant', content: string }} ChatMessage
 */

/**
 * Splits a message list into an optional system prompt + the remaining
 * user/assistant turns — Anthropic's API wants system separated out,
 * OpenAI-compatible APIs want it inline as a "system" message.
 * @param {ChatMessage[]} messages
 */
function splitSystem(messages) {
  const systemParts = messages.filter((m) => m.role === 'system').map((m) => m.content);
  const rest = messages.filter((m) => m.role !== 'system');
  return { system: systemParts.join('\n\n') || undefined, rest };
}

/**
 * @param {ChatMessage[]} messages
 * @param {{ maxTokens?: number, temperature?: number }} options
 */
async function callAnthropic(messages, options) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('LLM_API_KEY is not set (required for LLM_PROVIDER=anthropic)');
  const baseUrl = process.env.LLM_BASE_URL || 'https://api.anthropic.com';
  const model = process.env.LLM_MODEL || DEFAULT_ANTHROPIC_MODEL;
  const { system, rest } = splitSystem(messages);

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options.temperature,
      system,
      messages: rest,
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${bodyText}`);
  }
  const data = await res.json();
  return (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

/**
 * Handles both hosted OpenAI and any OpenAI-compatible endpoint
 * (LLM_BASE_URL override — local Ollama, Groq, etc).
 * @param {ChatMessage[]} messages
 * @param {{ maxTokens?: number, temperature?: number }} options
 */
async function callOpenAiCompatible(messages, options) {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || 'https://api.openai.com';
  const model = process.env.LLM_MODEL || DEFAULT_OPENAI_MODEL;

  if (!apiKey && !process.env.LLM_BASE_URL) {
    throw new Error('LLM_API_KEY is not set (required for LLM_PROVIDER=openai without a local LLM_BASE_URL)');
  }

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options.temperature,
      messages,
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`OpenAI-compatible API error ${res.status}: ${bodyText}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/**
 * Sends a chat completion request to whichever provider LLM_PROVIDER
 * selects, and returns the reply text.
 *
 * @param {ChatMessage[]} messages
 * @param {{ maxTokens?: number, temperature?: number }} [options]
 * @returns {Promise<string>}
 */
async function complete(messages, options = {}) {
  const provider = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();

  switch (provider) {
    case 'anthropic':
      return callAnthropic(messages, options);
    case 'openai':
    case 'groq':
    case 'ollama':
    case 'openai-compatible':
      return callOpenAiCompatible(messages, options);
    default:
      throw new Error(
        `Unknown LLM_PROVIDER "${provider}". Supported: anthropic, openai, groq, ollama, openai-compatible.`
      );
  }
}

module.exports = { complete };
