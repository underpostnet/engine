/**
 * Minimal Google Gemini (Generative Language API) chat client.
 *
 * Kept intentionally thin: a single text/JSON completion helper used by the
 * Top-Down PCG saga generator. No streaming, no tool-calls — the saga
 * orchestration only needs one structured JSON payload per request.
 *
 * General purpose, but for now only the `:generateContent` endpoint is wired,
 * matching the Gemma model family (e.g. `gemma-4-26b-a4b-it`). Authentication
 * uses the `x-goog-api-key` header sourced from `GEMINI_API_KEY`.
 *
 * @module src/projects/cyberia/gemini-client.js
 * @namespace GeminiClient
 */

import axios from 'axios';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

/** Generative Language API model base. The model id + `:generateContent` is appended. */
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Default model id (Gemma instruction-tuned model). */
const GEMINI_DEFAULT_MODEL = 'gemma-4-26b-a4b-it';

/**
 * Best-effort extraction of a single JSON object from a model text response.
 * Tolerates markdown fences and leading/trailing prose.
 *
 * @param {string} text
 * @returns {Object}
 */
function parseJsonLoose(text) {
  let candidate = String(text || '').trim();

  // Strip a ```json ... ``` (or bare ``` ... ```) fence if present.
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidate = fence[1].trim();

  try {
    return JSON.parse(candidate);
  } catch {
    // Fall back to the widest {...} span.
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error('Failed to parse JSON from Gemini response.');
  }
}

class GeminiClient {
  /**
   * @param {Object} [options]
   * @param {string} [options.apiKey] - Gemini API key. Falls back to `process.env.GEMINI_API_KEY`.
   * @param {string} [options.model] - Model id (default: `gemma-4-26b-a4b-it`).
   * @param {string} [options.baseURL] - Override the model base URL.
   * @param {number} [options.timeout] - Request timeout in ms (default: 300000).
   */
  constructor({ apiKey, model = GEMINI_DEFAULT_MODEL, baseURL = GEMINI_API_BASE, timeout = 300000 } = {}) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY;
    this.model = model;
    this.baseURL = baseURL;
    this.timeout = timeout;
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not set. Export it or add it to your --env-path file.');
    }
  }

  /**
   * Run a single `:generateContent` request and return the answer text,
   * skipping any thinking parts the model emits.
   *
   * @async
   * @param {Object} params
   * @param {string} params.prompt - Full prompt text (system + user merged).
   * @param {Object} [params.generationConfig] - Passed through to the API.
   * @returns {Promise<string>} The concatenated answer text.
   */
  async generateContent({ prompt, generationConfig = {} }) {
    const url = `${this.baseURL}/${this.model}:generateContent`;
    logger.info(`Gemini request → model=${this.model}`);

    const { data } = await axios.post(
      url,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
      },
      {
        headers: { 'x-goog-api-key': this.apiKey, 'Content-Type': 'application/json' },
        timeout: this.timeout,
      },
    );

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts
      .filter((p) => p && typeof p.text === 'string' && !p.thought)
      .map((p) => p.text)
      .join('');

    if (!text) throw new Error('Gemini returned an empty completion.');

    const usage = data?.usageMetadata;
    if (usage) {
      logger.info(
        `Gemini usage → prompt=${usage.promptTokenCount} candidates=${usage.candidatesTokenCount} ` +
          `total=${usage.totalTokenCount}`,
      );
    }

    return text;
  }

  /**
   * Run a single completion and parse the answer as JSON.
   *
   * Gemma models do not support a dedicated JSON response mode, so the schema
   * is requested in-prompt and the response is parsed leniently.
   *
   * @async
   * @param {Object} params
   * @param {string} params.system - System prompt (defines the output ontology / schema).
   * @param {string} params.user - User prompt (the high-level theme seed).
   * @param {string} [params.thinkingLevel='high'] - Gemini thinking level.
   * @returns {Promise<Object>} Parsed JSON object from the model response.
   */
  async chatJson({ system, user, thinkingLevel = 'high' }) {
    const prompt = [
      system,
      '',
      user,
      '',
      'Respond with ONLY a single valid JSON object. Do not wrap it in markdown fences and do not add any prose.',
    ].join('\n');

    const text = await this.generateContent({
      prompt,
      generationConfig: { thinkingConfig: { thinkingLevel } },
    });

    return parseJsonLoose(text);
  }
}

export { GeminiClient, GEMINI_API_BASE, GEMINI_DEFAULT_MODEL, parseJsonLoose };
