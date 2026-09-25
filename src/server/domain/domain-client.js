/**
 * Cross-domain service client.
 *
 * A domain reads another domain over its public REST contract, never over its database. This
 * module holds the one transport: origin per domain, timeout, bounded retry of transient
 * failures, and a short read cache. Reads are public; writes carry the service key.
 *
 * @module src/server/domain/domain-client.js
 * @namespace DomainClient
 */
import { loggerFactory } from '../ops/logger.js';
import { hostPortsFactory } from '../network/router.js';
import { deployConfServer, ownsApi } from './consumed-api.js';
import { API_BASE_PATH, DOMAIN_API_VERSION } from './api-contract.js';

const logger = loggerFactory(import.meta);

const DEFAULTS = {
  timeoutMs: Number(process.env.DOMAIN_API_TIMEOUT_MS || 5000),
  retries: Number(process.env.DOMAIN_API_RETRIES || 2),
  cacheTtlMs: Number(process.env.DOMAIN_API_CACHE_TTL_MS || 30000),
};

/** The API a domain is known by: the host that owns it serves the domain. */
const DOMAIN_API = Object.freeze({
  'object-layer': 'object-layer',
  'item-ledger': 'item-ledger',
  cyberia: 'cyberia-instance',
});

/**
 * The local origin of a domain this deploy serves itself: the port its owning host listens on,
 * from the same port map the proxy routes by. Empty when no host of the deploy owns the domain.
 * @param {string} domain
 * @returns {string}
 */
const localDomainUrl = (domain) => {
  const confServer = deployConfServer();
  const api = DOMAIN_API[domain];
  if (!confServer || !api || !process.env.PORT) return '';
  const host = Object.keys(confServer).find((name) => ownsApi(confServer[name]['/'], api));
  const port = host ? hostPortsFactory(confServer)[`${host}/`] : undefined;
  return port ? `http://127.0.0.1:${port}` : '';
};

/**
 * Origin of each domain's API: the configured one, else the local origin of the host of this
 * deploy that owns it. A domain with neither is unreachable, never a database. The contract path
 * (`/api/v1`) is the client's, never configuration.
 * @param {string} domain - `object-layer`, `item-ledger` or `cyberia`.
 * @returns {string}
 * @memberof DomainClient
 */
export const domainOrigin = (domain) =>
  ({
    'object-layer': process.env.OBJECT_LAYER_API_ORIGIN,
    'item-ledger': process.env.ITEM_LEDGER_API_ORIGIN,
    cyberia: process.env.CYBERIA_API_ORIGIN,
  })[domain] || localDomainUrl(domain);

/** Status codes worth another attempt: the request never reached a decision. */
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

class DomainError extends Error {
  /**
   * @param {string} message
   * @param {{domain:string,path:string,status:number,retryable:boolean}} context
   */
  constructor(message, context) {
    super(message);
    this.name = 'DomainError';
    Object.assign(this, context);
  }
}

const cache = new Map();

const cacheGet = (key, ttlMs) => {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > ttlMs) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reads one resource of a domain.
 *
 * A read is idempotent and safe to retry: a transient failure is attempted `retries` times with
 * a growing delay, a refusal (4xx other than the retryable ones) is raised at once. `null` is
 * the answer to a 404, never an exception.
 *
 * @param {Object} params
 * @param {string} params.domain - `object-layer`, `item-ledger` or `cyberia`.
 * @param {string} params.path - Path under the domain's API base, without a leading slash.
 * @param {Object} [params.query] - Query parameters.
 * @param {number} [params.cacheTtlMs] - Read cache lifetime; 0 disables the cache.
 * @returns {Promise<Object|null>} The `data` of the response, or null when absent.
 * @memberof DomainClient
 */
export async function domainRead({ domain, path, query = {}, cacheTtlMs = DEFAULTS.cacheTtlMs }) {
  const base = domainOrigin(domain);
  if (!base) throw new DomainError(`No API origin configured for domain "${domain}"`, { domain, path, status: 0, retryable: false });

  const url = new URL(`${base.replace(/\/$/, '')}/${API_BASE_PATH}/${path}`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, value);
  const key = url.toString();

  if (cacheTtlMs > 0) {
    const hit = cacheGet(key, cacheTtlMs);
    if (hit !== undefined) return hit;
  }

  let lastError;
  for (let attempt = 0; attempt <= DEFAULTS.retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULTS.timeoutMs);
    try {
      const response = await fetch(key, {
        method: 'GET',
        headers: { accept: 'application/json', 'x-domain-api-version': DOMAIN_API_VERSION },
        signal: controller.signal,
      });
      if (response.status === 404) {
        if (cacheTtlMs > 0) cache.set(key, { at: Date.now(), value: null });
        return null;
      }
      if (!response.ok) {
        const retryable = RETRYABLE.has(response.status);
        lastError = new DomainError(`GET ${key} answered ${response.status}`, { domain, path, status: response.status, retryable });
        if (!retryable) throw lastError;
      } else {
        const body = await response.json();
        const value = body?.data ?? null;
        if (cacheTtlMs > 0) cache.set(key, { at: Date.now(), value });
        return value;
      }
    } catch (error) {
      if (error instanceof DomainError && !error.retryable) throw error;
      lastError = error.name === 'AbortError' ? new DomainError(`GET ${key} timed out after ${DEFAULTS.timeoutMs}ms`, { domain, path, status: 0, retryable: true }) : error;
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < DEFAULTS.retries) await sleep(2 ** attempt * 100);
  }
  logger.warn(`Domain read failed: ${lastError?.message}`);
  throw lastError;
}

/**
 * Writes to a domain. A write carries the service key and is never retried: the caller decides,
 * because only the caller knows whether the operation is idempotent.
 *
 * @param {Object} params
 * @param {string} params.domain - Target domain.
 * @param {string} params.path - Path under the domain's API base.
 * @param {Object} params.body - JSON body.
 * @param {string} [params.method='POST']
 * @returns {Promise<Object|null>} The `data` of the response.
 * @memberof DomainClient
 */
export async function domainWrite({ domain, path, body, method = 'POST' }) {
  const base = domainOrigin(domain);
  if (!base) throw new DomainError(`No API origin configured for domain "${domain}"`, { domain, path, status: 0, retryable: false });
  const serviceKey = process.env.DOMAIN_API_SERVICE_KEY || '';
  if (!serviceKey) throw new DomainError('DOMAIN_API_SERVICE_KEY is required for a cross-domain write', { domain, path, status: 0, retryable: false });

  const url = `${base.replace(/\/$/, '')}/${API_BASE_PATH}/${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULTS.timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-domain-api-version': DOMAIN_API_VERSION,
        'x-domain-origin': process.env.DEFAULT_DEPLOY_HOST || '',
        authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new DomainError(`${method} ${url} answered ${response.status}`, { domain, path, status: response.status, retryable: false });
    }
    return (await response.json())?.data ?? null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Empties the read cache. */
export const clearDomainCache = () => cache.clear();

export { DomainError };
