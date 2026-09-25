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
 * The platform cache keyed by instance code serves the hot path; a resolved
 * document stays for the mutable policy's TTL, the defaults are never kept.
 */

import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { resolveHostKeyContext } from '../../server/runtime/conf.js';
import { CacheService } from '../../server/storage/cache.js';
import {
  buildClientHints,
  CYBERIA_CLIENT_HINTS_DEFAULTS,
} from '../../client/components/cyberia/SharedDefaultsCyberia.js';

const logger = loggerFactory(import.meta);

const hintsCache = (options) => CacheService.namespace(options, 'cyberia-client-hints');

/**
 * Resolve the merged client-hints document for an instance code.
 *
 * @param {string} code
 * @param {Object} options  Engine routing context.
 * @param {string} [options.host='default'] DataBaseProviderService host key.
 * @param {string} [options.path='/']       DataBaseProviderService path key.
 * @returns {Promise<{data: object, source: 'presentation-hints'|'instance-conf'|'presentation-hints-fallback'|'defaults'}>}
 */
export async function resolveClientHints(code, options = {}) {
  const context = { host: options.host || 'default', path: options.path || '/' };
  const resolved = code
    ? await CacheService.getOrLoad(hintsCache(context), {
        identifier: code,
        load: async () => await resolveStoredClientHints(code, context),
      })
    : await resolveStoredClientHints(code, context);
  return resolved ?? { data: CYBERIA_CLIENT_HINTS_DEFAULTS, source: 'defaults' };
}

/**
 * The stored hints of an instance code, or null when only the canonical defaults answer.
 * @param {string} code
 * @param {{host:string,path:string}} context
 * @returns {Promise<{data: object, source: 'presentation-hints'|'instance-conf'|'presentation-hints-fallback'}|null>}
 */
async function resolveStoredClientHints(code, context) {
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
    return null;
  }

  // 1. Preferred source: the CyberiaClientHints collection.
  if (HintsModel && code) {
    const hint = await HintsModel.findOne({ code }).lean().catch(() => null);
    if (hint) return { data: buildClientHints(hint), source: 'presentation-hints' };
  }

  // 2. Instances that keep their presentation fields on CyberiaInstanceConf.
  if (ConfModel && code) {
    const fromConf =
      (await ConfModel.findOne({ code }).lean().catch(() => null)) ||
      (await ConfModel.findById(code).lean().catch(() => null));
    if (fromConf) return { data: buildClientHints(fromConf), source: 'instance-conf' };
  }

  // 3. Any CyberiaClientHints document, when the requested code has none but
  //    another instance does. Beats falling straight through to defaults.
  if (HintsModel) {
    const anyHint = await HintsModel.findOne({}).lean().catch(() => null);
    if (anyHint) return { data: buildClientHints(anyHint), source: 'presentation-hints-fallback' };
  }

  // 4. Canonical defaults: never kept, so a later DB insert wins.
  return null;
}
