/**
 * Minimal DeepSeek chat client targeting the OpenAI-compatible endpoint.
 *
 * Kept intentionally thin: a single JSON-mode completion helper used by the
 * Top-Down PCG saga generator. No streaming, no tool-calls — the saga
 * orchestration only needs one structured JSON payload per request.
 *
 * @module src/server/deepseek-client.js
 * @namespace DeepSeekClient
 */

import axios from 'axios';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

/** Default OpenAI-compatible DeepSeek completions endpoint. */
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

/** Default model id (DeepSeek-V3 family chat model). */
const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';

class DeepSeekClient {
  /**
   * @param {Object} [options]
   * @param {string} [options.apiKey] - DeepSeek API key. Falls back to `process.env.DEEPSEEK_API_KEY`.
   * @param {string} [options.model] - Model id (default: `deepseek-chat`).
   * @param {string} [options.baseURL] - Override completions endpoint.
   * @param {number} [options.timeout] - Request timeout in ms (default: 120000).
   */
  constructor({ apiKey, model = DEEPSEEK_DEFAULT_MODEL, baseURL = DEEPSEEK_API_URL, timeout = 120000 } = {}) {
    this.apiKey = apiKey || process.env.DEEPSEEK_API_KEY;
    this.model = model;
    this.baseURL = baseURL;
    this.timeout = timeout;
    if (!this.apiKey) {
      throw new Error('DEEPSEEK_API_KEY is not set. Export it or add it to your --env-path file.');
    }
  }

  /**
   * Run a single chat completion in JSON mode and return the parsed object.
   *
   * @async
   * @param {Object} params
   * @param {string} params.system - System prompt (defines the output ontology / schema).
   * @param {string} params.user - User prompt (the high-level theme seed).
   * @param {number} [params.temperature=1.0] - Sampling temperature.
   * @param {number} [params.maxTokens=8192] - Max completion tokens.
   * @returns {Promise<Object>} Parsed JSON object from the model response.
   */
  async chatJson({ system, user, temperature = 1.0, maxTokens = 8192 }) {
    logger.info(`DeepSeek request → model=${this.model}`);
    const { data } = await axios.post(
      this.baseURL,
      {
        model: this.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
        temperature,
        max_tokens: maxTokens,
      },
      {
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        timeout: this.timeout,
      },
    );

    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('DeepSeek returned an empty completion.');

    const usage = data?.usage;
    if (usage) logger.info(`DeepSeek usage → prompt=${usage.prompt_tokens} completion=${usage.completion_tokens}`);

    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse DeepSeek JSON payload: ${error.message}`);
    }
  }
}

export { DeepSeekClient, DEEPSEEK_API_URL, DEEPSEEK_DEFAULT_MODEL };
