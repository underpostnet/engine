/**
 * Platform cache: cache-aside reads over Valkey with in-process coalescing, TTL policies,
 * namespace invalidation and metrics.
 *
 * A domain service names what it caches; this module knows no model and no DTO. Valkey is the
 * provider, never the source of truth: when it is down or fails, a read degrades to the loader
 * and the answer is authoritative, only uncached.
 *
 * Key: `cache:{environment}:{domain}:{resource}:{scope}:{identifier}:{variant}`, where the
 * scope carries the content view of the request and any user scope the caller adds. The
 * namespace (`environment:domain:resource`) holds a version; an invalidation bumps it, so keys
 * of the old version are never read again and expire by their TTL. No mutation scans keys.
 *
 * @module src/server/storage/cache.js
 * @namespace CacheService
 */
import crypto from 'crypto';
import * as promClient from 'prom-client';
import { ValkeyAPI } from '../../db/valkey/Valkey.js';
import { currentContentView } from '../../db/content-view.js';
import { loggerFactory } from '../ops/logger.js';

const logger = loggerFactory(import.meta);

const MINUTE = 60_000;

/**
 * TTL by mutability of the cached value.
 * @memberof CacheService
 */
export const CACHE_POLICY = Object.freeze({
  /** Content addressed by its identity: a key never names other content. */
  immutable: Object.freeze({ ttlMs: 7 * 24 * 60 * MINUTE }),
  /** Registries and public lists: read often, written rarely, invalidated on every write. */
  registry: Object.freeze({ ttlMs: 5 * MINUTE }),
  /** Management data: short-lived, invalidated after every mutation. */
  mutable: Object.freeze({ ttlMs: 30_000 }),
});

/** Versions outlive every value of their namespace. */
const VERSION_TTL_MS = 30 * 24 * 60 * MINUTE;

const environment = () => process.env.NODE_ENV || 'development';

const metric = (Type, config) => promClient.register.getSingleMetric(config.name) ?? new Type(config);
const operations = metric(promClient.Counter, {
  name: 'underpost_cache_operations_total',
  help: 'Cache reads by outcome, writes, invalidations and provider errors',
  labelNames: ['namespace', 'result'],
});
const loadSeconds = metric(promClient.Histogram, {
  name: 'underpost_cache_load_seconds',
  help: 'Time the loader takes on a cache miss',
  labelNames: ['namespace'],
});
const writeSeconds = metric(promClient.Histogram, {
  name: 'underpost_cache_write_seconds',
  help: 'Time a cache write takes',
  labelNames: ['namespace'],
});

/** Loads in flight, by key: concurrent misses share one loader call. */
const inflight = new Map();

const segment = (value) => String(value ?? '').replace(/:/g, '_');

/**
 * @typedef {Object} CacheNamespace
 * @property {{host:string,path:string}} instance - Valkey instance of the deployment context.
 * @property {string} prefix - `cache:{environment}:{domain}:{resource}`.
 * @property {string} label - `{domain}:{resource}`, the metrics label.
 * @property {number} ttlMs
 * @memberof CacheService
 */

class CacheService {
  /**
   * One resource of one domain under one policy. The domain is the deployment context that
   * serves it: two hosts of a deploy never share a value.
   * @param {{host?:string,path?:string}} options - Router options.
   * @param {string} resource - Resource name, an API name or one of its parts.
   * @param {{ttlMs:number}} [policy=CACHE_POLICY.mutable]
   * @returns {CacheNamespace}
   */
  static namespace(options, resource, policy = CACHE_POLICY.mutable) {
    const host = options?.host || '';
    const path = options?.path || '/';
    const domain = segment(`${host}${path}`);
    return {
      instance: { host, path },
      prefix: `cache:${environment()}:${domain}:${segment(resource)}`,
      label: `${domain}:${segment(resource)}`,
      ttlMs: policy.ttlMs,
    };
  }

  /**
   * A deterministic variant segment for a query: its parameters sorted by name as the URL standard
   * sorts them, so the same query in any parameter order gives the same segment.
   * @param {Object<string, string|string[]>} [query] - A parsed query string, as `req.query` holds it.
   * @returns {string}
   */
  static variant(query) {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(query ?? {}))
      for (const item of [value].flat()) params.append(name, item);
    params.sort();
    return crypto.createHash('sha1').update(params.toString()).digest('hex').slice(0, 16);
  }

  /**
   * Reads a value, loading and storing it on a miss. Concurrent misses of one key in this
   * process share one load. A provider failure is counted and the loader answers.
   * @param {CacheNamespace} namespace
   * @param {Object} params
   * @param {string} params.identifier - What is cached: `list`, a cid, a code.
   * @param {string} [params.scope='public'] - User or role scope; the content view is always added.
   * @param {string} [params.variant=''] - Query variant, from {@link CacheService.variant}.
   * @param {() => Promise<*>} params.load - The authoritative read.
   * @param {boolean} [params.binary=false] - The value is a Buffer.
   * @returns {Promise<*>} The loaded or cached value.
   */
  static async getOrLoad(namespace, { identifier, scope = 'public', variant = '', load, binary = false }) {
    const view = `${currentContentView()}.${segment(scope)}`;
    const local = `${namespace.prefix}:${view}:${segment(identifier)}:${segment(variant)}`;
    if (!ValkeyAPI.isConnected(namespace.instance)) {
      operations.inc({ namespace: namespace.label, result: 'bypass' });
      return await coalesce(local, load);
    }
    let key;
    try {
      const version = Number(await ValkeyAPI.get(namespace.instance, `${namespace.prefix}:version`)) || 0;
      key = local.replace(`${namespace.prefix}:`, `${namespace.prefix}:v${version}:`);
      const hit = await ValkeyAPI.get(namespace.instance, key);
      if (hit !== null) {
        operations.inc({ namespace: namespace.label, result: 'hit' });
        return binary ? Buffer.from(hit.base64, 'base64') : hit;
      }
    } catch (error) {
      operations.inc({ namespace: namespace.label, result: 'error' });
      logger.warn(`Cache read failed for ${namespace.label}: ${error.message}`);
      return await coalesce(local, load);
    }
    operations.inc({ namespace: namespace.label, result: 'miss' });
    return await coalesce(local, async () => {
      const value = await timed(loadSeconds, namespace.label, load);
      if (value === undefined || value === null) return value;
      try {
        const stored = binary ? { base64: value.toString('base64') } : value;
        await timed(writeSeconds, namespace.label, () =>
          ValkeyAPI.set(namespace.instance, key, stored, namespace.ttlMs),
        );
      } catch (error) {
        operations.inc({ namespace: namespace.label, result: 'error' });
        logger.warn(`Cache write failed for ${namespace.label}: ${error.message}`);
      }
      return value;
    });
  }

  /**
   * Invalidates every value of a namespace, in every scope and variant, by bumping its
   * version. Idempotent and safe when the provider is down: the values then expire on their own.
   * @param {CacheNamespace} namespace
   * @returns {Promise<void>}
   */
  static async invalidate(namespace) {
    if (!ValkeyAPI.isConnected(namespace.instance)) return;
    try {
      await ValkeyAPI.incr(namespace.instance, `${namespace.prefix}:version`, VERSION_TTL_MS);
      operations.inc({ namespace: namespace.label, result: 'invalidate' });
    } catch (error) {
      operations.inc({ namespace: namespace.label, result: 'error' });
      logger.warn(`Cache invalidation failed for ${namespace.label}: ${error.message}`);
    }
  }

  /**
   * Removes every key of a deployment context's environment: the operator's reset, never a
   * mutation's. Scans the keyspace in batches.
   * @param {{host?:string,path?:string}} options - Router options.
   * @returns {Promise<number>} Keys removed.
   */
  static async clear(options) {
    const { instance, prefix } = CacheService.namespace(options, '');
    const pattern = `${prefix.replace(/:$/, '')}:*`;
    const client = ValkeyAPI.client(instance);
    let cursor = '0';
    let removed = 0;
    do {
      const [next, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
      cursor = next;
      if (keys.length > 0) removed += await client.del(...keys);
    } while (cursor !== '0');
    return removed;
  }
}

const coalesce = async (key, load) => {
  if (inflight.has(key)) return await inflight.get(key);
  const pending = load().finally(() => inflight.delete(key));
  inflight.set(key, pending);
  return await pending;
};

const timed = async (histogram, namespace, fn) => {
  const end = histogram.startTimer({ namespace });
  try {
    return await fn();
  } finally {
    end();
  }
};

export { CacheService };
