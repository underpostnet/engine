/**
 * @module src/api/cyberia-client-hints/cyberia-client-hints.service.js
 *
 * Read-only service layer for client presentation hints.
 *
 * Resolution order, highest priority first:
 *   1. CyberiaClientHints collection, the dedicated overrides collection.
 *   2. Presentation fields on CyberiaInstanceConf with the same `code`.
 *   3. Canonical defaults from SharedDefaultsCyberia.js, the same values the
 *      client holds built in.
 *
 * An in-memory TTL cache keyed by instance code serves the hot path. A write
 * to either collection must call `clientHintsInvalidate(code)`.
 */

import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { resolveHostKeyContext } from '../../server/runtime/conf.js';
import {
  buildClientHints,
  CYBERIA_CLIENT_HINTS_DEFAULTS,
} from '../../client/components/cyberia/SharedDefaultsCyberia.js';

const logger = loggerFactory(import.meta);

// TTL absorbs bursty client fetches and still shows an editor change in ~30s.
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

/** Invalidate one cache entry, or the whole cache when `code` is empty. */
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
 * @param {string} [options.host='default'] DataBaseProviderService host key.
 * @param {string} [options.path='/']       DataBaseProviderService path key.
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
  const context = { host, path };
  const id = resolveHostKeyContext(context);

  let HintsModel = null;
  let ConfModel = null;
  try {
    HintsModel = DataBaseProviderService.getModel('CyberiaClientHints', context);
  } catch {
    // model may not be mounted on this context
  }
  try {
    ConfModel = DataBaseProviderService.getModel('CyberiaInstanceConf', context);
  } catch {
    // model may not be mounted on this context
  }

  if (!HintsModel && !ConfModel) {
    logger.warn('client-hints: mongoose models not available for', id, '— returning defaults');
    return { data: CYBERIA_CLIENT_HINTS_DEFAULTS, source: 'defaults' };
  }

  // 1. Preferred source: the CyberiaClientHints collection.
  if (HintsModel && code) {
    const hint = await HintsModel.findOne({ code }).lean().catch(() => null);
    if (hint) {
      const merged = buildClientHints(hint);
      cacheSet(code, merged);
      return { data: merged, source: 'presentation-hints' };
    }
  }

  // 2. Instances that keep their presentation fields on CyberiaInstanceConf.
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

  // 3. Any CyberiaClientHints document, when the requested code has none but
  //    another instance does. Beats falling straight through to defaults.
  if (HintsModel) {
    const anyHint = await HintsModel.findOne({}).lean().catch(() => null);
    if (anyHint) {
      const merged = buildClientHints(anyHint);
      // Short TTL under the requested code so a later seed wins quickly.
      if (code) cache.set(code, { data: merged, expiresAt: now() + 5_000 });
      return { data: merged, source: 'presentation-hints-fallback' };
    }
  }

  // 4. Canonical defaults. Never cached, so a later DB insert wins.
  return { data: CYBERIA_CLIENT_HINTS_DEFAULTS, source: 'defaults' };
}
