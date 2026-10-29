/**
 * Retry policy of the platform: which failures are worth another attempt, and when to make it.
 *
 * A transient failure never reached a decision: a timeout, a reset connection, a temporary DNS
 * failure, HTTP 408, 425, 429 or 5xx, an unavailable database. A permanent failure is a decision:
 * invalid content, a refusal, a conflict. Only a transient failure is retried. The delay grows
 * exponentially with full jitter, stays under a ceiling, and never comes before a `Retry-After`.
 *
 * @module src/server/runtime/retry.js
 * @namespace Retry
 */

/** HTTP statuses that never reached a decision. */
const TRANSIENT_STATUS = new Set([408, 425, 429, 499, 500, 502, 503, 504, 420]);

/** Socket and resolver codes of a connection that may succeed on the next attempt. */
const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

/** Driver error names of a database that is unreachable for now. */
const TRANSIENT_NAMES = new Set([
  'AbortError',
  'TimeoutError',
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoServerSelectionError',
  'MongoNotConnectedError',
]);

/** Absolute ceiling of one wait, whatever a `Retry-After` asks for. */
const MAX_WAIT_MS = 10 * 60 * 1000;

/**
 * The HTTP status an error carries, under any of the names the transports use.
 * @param {Error} error
 * @returns {number|undefined}
 * @memberof Retry
 */
export const errorStatus = (error) => {
  const status = error?.status ?? error?.statusCode ?? error?.http_code ?? error?.response?.status;
  return Number.isInteger(status) ? status : undefined;
};

/**
 * Whether a failure is transient. An error that states `retryable` decides for itself.
 * @param {Error} error
 * @returns {boolean}
 * @memberof Retry
 */
export const isTransientError = (error) => {
  if (!error) return false;
  if (typeof error.retryable === 'boolean') return error.retryable;
  const status = errorStatus(error);
  if (status !== undefined) return TRANSIENT_STATUS.has(status);
  const code = error.code ?? error.cause?.code;
  if (TRANSIENT_CODES.has(code)) return true;
  if (TRANSIENT_NAMES.has(error.name) || TRANSIENT_NAMES.has(error.cause?.name)) return true;
  return /timed out|timeout|socket hang up|network/i.test(String(error.message ?? ''));
};

/**
 * The wait a `Retry-After` header asks for: seconds, or an HTTP date.
 * @param {string|number|null|undefined} value
 * @param {number} [now=Date.now()]
 * @returns {number|undefined} Milliseconds, or undefined when the header is absent or invalid.
 * @memberof Retry
 */
export const retryAfterMs = (value, now = Date.now()) => {
  if (value === null || value === undefined || value === '') return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds >= 0 ? Math.min(seconds * 1000, MAX_WAIT_MS) : undefined;
  const at = Date.parse(String(value));
  return Number.isNaN(at) ? undefined : Math.min(Math.max(0, at - now), MAX_WAIT_MS);
};

/**
 * The wait before attempt `attempt + 1`: exponential backoff with full jitter, at most `maxDelayMs`,
 * and at least what the dependency asked for.
 * @param {Object} params
 * @param {number} params.attempt - 1-based attempt that just failed.
 * @param {number} [params.baseDelayMs=500]
 * @param {number} [params.maxDelayMs=30000]
 * @param {number} [params.retryAfter] - Milliseconds the dependency asked for.
 * @param {() => number} [params.random=Math.random]
 * @returns {number} Milliseconds.
 * @memberof Retry
 */
export const retryDelayMs = ({ attempt, baseDelayMs = 500, maxDelayMs = 30000, retryAfter, random = Math.random }) => {
  const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
  const jittered = Math.floor(ceiling * random());
  return Math.min(MAX_WAIT_MS, Math.max(jittered, retryAfter ?? 0));
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `fn` until it succeeds, a failure is permanent, or the attempts run out.
 * @template T
 * @param {(attempt:number) => Promise<T>} fn
 * @param {Object} [policy]
 * @param {number} [policy.attempts=5] - Attempts in all, the first included.
 * @param {number} [policy.baseDelayMs=500]
 * @param {number} [policy.maxDelayMs=30000]
 * @param {(error:Error) => boolean} [policy.isRetryable=isTransientError]
 * @param {(event:{attempt:number,delayMs:number,error:Error}) => void} [policy.onRetry]
 * @param {(ms:number) => Promise<void>} [policy.wait]
 * @returns {Promise<T>}
 * @throws {Error} The last failure; `attempts` on it counts the attempts made.
 * @memberof Retry
 */
export async function withRetry(
  fn,
  { attempts = 5, baseDelayMs = 500, maxDelayMs = 30000, isRetryable = isTransientError, onRetry, wait = sleep } = {},
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= attempts || !isRetryable(error)) {
        if (error && typeof error === 'object') error.attempts = attempt;
        throw error;
      }
      const delayMs = retryDelayMs({ attempt, baseDelayMs, maxDelayMs, retryAfter: error?.retryAfterMs });
      onRetry?.({ attempt, delayMs, error });
      await wait(delayMs);
    }
  }
}

/**
 * Stops calls to a dependency that keeps failing: after `threshold` transient failures in a row it
 * opens for `cooldownMs`, and one success closes it.
 * @memberof Retry
 */
export class CircuitBreaker {
  /**
   * @param {Object} [params]
   * @param {number} [params.threshold=5]
   * @param {number} [params.cooldownMs=30000]
   * @param {() => number} [params.now=Date.now]
   */
  constructor({ threshold = 5, cooldownMs = 30000, now = Date.now } = {}) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
    this.now = now;
    this.failures = 0;
    this.openedAt = 0;
  }

  /** Milliseconds until the breaker lets a call through; 0 while it is closed. */
  get waitMs() {
    if (this.failures < this.threshold) return 0;
    return Math.max(0, this.openedAt + this.cooldownMs - this.now());
  }

  succeeded() {
    this.failures = 0;
    this.openedAt = 0;
  }

  failed() {
    this.failures++;
    if (this.failures >= this.threshold) this.openedAt = this.now();
  }
}
