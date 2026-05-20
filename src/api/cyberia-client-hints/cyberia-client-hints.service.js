/**
 * @module src/api/cyberia-client-hints/cyberia-client-hints.service.js
 *
 * Read-only service layer for client presentation hints.
 *
 * Resolution order (highest priority first):
 *   1. CyberiaClientHints collection — the dedicated presentation-overrides
 *      collection. Always preferred when present.
 *   2. Compatibility read on CyberiaInstanceConf with the same `code` —
 *      covers instances seeded before CyberiaClientHints existed.
 *   3. Canonical compile-time defaults from
 *      SharedDefaultsCyberia.js. The C client bakes the
 *      same defaults at compile time, so this branch returns exactly the
 *      values the client already has.
 *
 * Caching: in-memory TTL cache keyed by instance code. Read-only on the
 * hot path; cache writes happen on cache miss + DB hit. CMS writes that
 * mutate the underlying collection should call `clientHintsInvalidate(code)`.
 *
 * Output is a plain JSON-friendly object whose shape matches the C
 * client's compile-time layout.
 */

import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import {
  buildClientHints,
  CYBERIA_CLIENT_HINTS_DEFAULTS,
} from '../../client/components/cyberia/SharedDefaultsCyberia.js';

const logger = loggerFactory(import.meta);

// TTL chosen long enough that bursty client fetches are absorbed, short
// enough that an editor change shows up within ~30s without manual flush.
const CACHE_TTL_MS = 30_000;

// One per instance code. value: { data, expiresAt }
const cache = new Map();

function now() {
  return Date.now();
}

function cacheGet(code) {
  const entry = cache.get(code);
  if (!entry) return null;
  if (entry.expiresAt < now()) {
    cache.delete(code);
    return null;
  }
  return entry.data;
}

function cacheSet(code, data) {
  cache.set(code, { data, expiresAt: now() + CACHE_TTL_MS });
}

/** Invalidate a cache entry. CMS write paths should call this after
 *  mutating either CyberiaClientHints or CyberiaInstanceConf for
 *  the given code. */
export function clientHintsInvalidate(code) {
  if (code) {
    cache.delete(code);
  } else {
    cache.clear();
  }
}

/**
 * Resolve the merged client-hints document for an instance code.
 *
 * @param {string} code
 * @param {Object} options  Engine routing context.
 * @param {string} [options.host='default'] DataBaseProvider host key.
 * @param {string} [options.path='/']       DataBaseProvider path key.
 * @returns {Promise<{data: object, source: 'cache'|'presentation-hints'|'instance-conf'|'defaults'}>}
 */
export async function resolveClientHints(code, options = {}) {
  if (code) {
    const cached = cacheGet(code);
    if (cached) {
      return { data: cached, source: 'cache' };
    }
  }

  const host = options.host || 'default';
  const path = options.path || '/';
  const dbInstance = DataBaseProvider.instance?.[`${host}${path}`];
  const models = dbInstance?.mongoose?.models ?? null;
  if (!models) {
    logger.warn('client-hints: mongoose models not available for', `${host}${path}`, '— returning defaults');
    return { data: CYBERIA_CLIENT_HINTS_DEFAULTS, source: 'defaults' };
  }

  // 1. Preferred — CyberiaClientHints collection (src/api/cyberia-client-hints/cyberia-client-hints.model.js).
  const HintsModel = models.CyberiaClientHints;
  if (HintsModel && code) {
    const hint = await HintsModel.findOne({ code }).lean().catch(() => null);
    if (hint) {
      const merged = buildClientHints(hint);
      cacheSet(code, merged);
      return { data: merged, source: 'presentation-hints' };
    }
  }

  // 2. Compatibility read — for instances seeded before CyberiaClientHints
  //    existed, look up the same code in CyberiaInstanceConf and read its
  //    presentation-shaped fields directly.
  const ConfModel = models.CyberiaInstanceConf;
  if (ConfModel && code) {
    const fromConf =
      (await ConfModel.findOne({ code }).lean().catch(() => null)) ||
      (await ConfModel.findById(code).lean().catch(() => null));
    if (fromConf) {
      const merged = buildClientHints(fromConf);
      cacheSet(code, merged);
      return { data: merged, source: 'instance-conf' };
    }
  }

  // 3. Any available CyberiaClientHints document — used when the requested
  //    code has no record yet but another instance (e.g. the one the Go
  //    server is currently running) does.  This avoids pure built-in
  //    defaults in fresh environments where only a different code is seeded.
  if (HintsModel) {
    const anyHint = await HintsModel.findOne({}).lean().catch(() => null);
    if (anyHint) {
      const merged = buildClientHints(anyHint);
      // Cache under the requested code so subsequent requests are fast,
      // but with a shorter TTL (5 s) so a proper seed wins quickly.
      if (code) cache.set(code, { data: merged, expiresAt: now() + 5_000 });
      return { data: merged, source: 'presentation-hints-fallback' };
    }
  }

  // 4. Canonical defaults. Not cached — we do not poison the cache with
  //    a default that could mask a later DB insert.
  return { data: CYBERIA_CLIENT_HINTS_DEFAULTS, source: 'defaults' };
}
