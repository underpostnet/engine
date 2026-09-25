/**
 * Publication of Object Layer definitions: the one path that makes a definition canonical.
 *
 * The Object Layer authority is the only writer of canonical definitions. A host that consumes
 * Object Layer never stores one: it keeps its authoring work as `draft` documents, asks the
 * authority to store the content, and keeps the answer as a `cache` copy. When the authority
 * does not answer, the draft stays a draft and the caller gets a {@link PublicationError}.
 *
 * @module src/api/object-layer/object-layer.publication.js
 * @namespace ObjectLayerPublication
 */
import { loggerFactory } from '../../server/ops/logger.js';
import { consumesOf } from '../../server/domain/consumed-api.js';
import { domainOrigin } from '../../server/domain/domain-client.js';
import { publishObjectLayer } from '../../server/domain/object-layer-resolver.js';
import { createPinRecord } from '../ipfs/ipfs.service.js';
import { IpfsClient } from '../ipfs/ipfs.client.js';
import { canonicalObjectLayerBytes, objectLayerIdentity } from './object-layer.identity.js';
import { CACHE_POLICY, CacheService } from '../../server/storage/cache.js';

const logger = loggerFactory(import.meta);

/**
 * The cache of the definitions a host serves: every list, every key, and the render File an item
 * label resolves to. Every write to the host's ObjectLayer collection or its atlases invalidates it.
 * @param {{host?:string,path?:string}} [options] - Router options.
 * @returns {import('../../server/storage/cache.js').CacheNamespace}
 * @memberof ObjectLayerPublication
 */
export const objectLayerCache = (options) => CacheService.namespace(options, 'object-layer', CACHE_POLICY.registry);

/**
 * A definition that could not be published. The draft it names stays stored and unbound.
 * @memberof ObjectLayerPublication
 */
export class PublicationError extends Error {
  /**
   * @param {string} cid - The draft's cid.
   * @param {string} reason
   */
  constructor(cid, reason) {
    super(`Object Layer ${cid} is kept as a draft: ${reason}`);
    this.name = 'PublicationError';
    this.cid = cid;
  }
}

/**
 * Whether a host is the Object Layer authority: it serves the API and consumes it from nobody.
 * @param {{host?:string,path?:string,consumes?:Object<string,string>}} [options] - Router options.
 * @returns {boolean}
 * @memberof ObjectLayerPublication
 */
export const isObjectLayerAuthority = (options) => !consumesOf(options)['object-layer'];

/**
 * Pins the canonical bytes of a definition to IPFS under the item's MFS path and records the
 * pin. The node assigns the same CID the identity computed; a different one is reported.
 * @param {Object} params
 * @param {import('mongoose').Model} params.ObjectLayer - Bound ObjectLayer model.
 * @param {Object} params.definition - Canonical definition (document or payload).
 * @param {Object} [params.options] - Router options ({ host, path }).
 * @returns {Promise<boolean>} True when the node holds the pin.
 * @memberof ObjectLayerPublication
 */
export async function pinCanonical({ ObjectLayer, definition, options }) {
  const itemId = definition?.data?.item?.id;
  const { cid } = objectLayerIdentity(definition);
  const mfsPath = `/object-layer/${itemId}/${itemId}_data.json`;
  let published = false;
  try {
    const ipfsResult = await IpfsClient.addToIpfs(
      canonicalObjectLayerBytes(definition),
      `${itemId}_data.json`,
      mfsPath,
    );
    if (ipfsResult && ipfsResult.cid !== cid)
      logger.error(`IPFS assigned ${ipfsResult.cid} to "${itemId}" but its canonical cid is ${cid}`);
    else if (ipfsResult) {
      await createPinRecord({ cid, resourceType: 'object-layer-data', mfsPath, options });
      published = true;
    }
  } catch (error) {
    logger.warn(`Failed to pin canonical bytes of "${itemId}": ${error.message}`);
  }
  await ObjectLayer.setPublished(cid, published);
  await CacheService.invalidate(objectLayerCache(options));
  return published;
}

/**
 * Stores a definition as canonical content. On the authority it is written and pinned here; on
 * a consumer it is kept as a draft until the authority stores it, then cached.
 *
 * @param {Object} params
 * @param {import('mongoose').Model} params.ObjectLayer - Bound ObjectLayer model of this host.
 * @param {Object} params.payload - `{ profile, data, createdBy?, _id? }`.
 * @param {Object} [params.options] - Router options of this host.
 * @param {(definition:Object)=>Promise<{cid:string}>} [params.publish] - Authority write; defaults to the domain client.
 * @returns {Promise<Object>} The stored document, `canonical` or `cache`.
 * @throws {PublicationError} When a consumer cannot get the content stored at the authority.
 * @memberof ObjectLayerPublication
 */
export async function publishDefinition({ ObjectLayer, payload, options, publish = publishObjectLayer }) {
  if (isObjectLayerAuthority(options)) {
    const definition = await ObjectLayer.upsertByIdentity(payload, { origin: 'canonical' });
    definition.published = await pinCanonical({ ObjectLayer, definition, options });
    return definition;
  }

  const draft = await ObjectLayer.upsertByIdentity(payload, { origin: 'draft' });
  await CacheService.invalidate(objectLayerCache(options));
  if (draft.origin !== 'draft') return draft;
  if (!domainOrigin('object-layer')) throw new PublicationError(draft.cid, 'no Object Layer authority is configured');
  let stored;
  try {
    stored = await publish(draft);
  } catch (error) {
    throw new PublicationError(draft.cid, error.message);
  }
  if (stored?.cid !== draft.cid) throw new PublicationError(draft.cid, `the authority stored it as ${stored?.cid}`);
  const cached = await ObjectLayer.upsertByIdentity(payload, { origin: 'cache' });
  await CacheService.invalidate(objectLayerCache(options));
  return cached;
}

/**
 * Has the canonical bytes of a stored definition pinned again under its MFS path
 * (`/object-layer/<item>/<item>_data.json`). The authority pins them itself; a consumer sends the
 * definition to the authority, which stores known content as it is and pins it. Idempotent. The
 * MFS path is the authority's alone: this is how a restore repairs it, never by writing it.
 * @param {Object} params
 * @param {import('mongoose').Model} params.ObjectLayer - Bound ObjectLayer model of this host.
 * @param {Object} params.definition - Stored definition (document or lean).
 * @param {Object} [params.options] - Router options of this host.
 * @param {(definition:Object)=>Promise<{cid:string}>} [params.publish] - Authority write; defaults to the domain client.
 * @returns {Promise<boolean>} True when the canonical bytes are pinned.
 * @throws {Error} When the authority stores the content under another identity.
 * @memberof ObjectLayerPublication
 */
export async function repinCanonical({ ObjectLayer, definition, options, publish = publishObjectLayer }) {
  if (isObjectLayerAuthority(options)) return await pinCanonical({ ObjectLayer, definition, options });
  const stored = await publish(definition);
  if (stored?.cid !== definition.cid) throw new Error(`The authority stored ${definition.cid} as ${stored?.cid}`);
  return true;
}

/**
 * Removes the pin records of canonical bytes a consumer holds. They are the authority's alone
 * ({@link pinCanonical}); a consumer copy can only go stale and point an MFS path at other bytes.
 * Idempotent; a no-op on the authority.
 * @param {Object} params
 * @param {import('mongoose').Model} params.Ipfs - Bound Ipfs registry model of this host.
 * @param {Object} [params.options] - Router options of this host.
 * @returns {Promise<number>} Records removed.
 * @memberof ObjectLayerPublication
 */
export async function dropConsumerCanonicalPins({ Ipfs, options }) {
  if (isObjectLayerAuthority(options)) return 0;
  return (await Ipfs.deleteMany({ resourceType: 'object-layer-data' })).deletedCount;
}

/**
 * Keeps a copy of a definition the authority holds, for a consumer to serve. The content must
 * be the canonical content: its identity is checked against the cid it was asked for.
 * @param {Object} params
 * @param {import('mongoose').Model} params.ObjectLayer - Bound ObjectLayer model of this host.
 * @param {string} params.cid - The cid asked for.
 * @param {Object} params.definition - The authority's answer.
 * @param {Object} [params.options] - Router options of this host.
 * @returns {Promise<Object>} The `cache` document.
 * @memberof ObjectLayerPublication
 */
export async function cacheCanonical({ ObjectLayer, cid, definition, options }) {
  const identity = objectLayerIdentity(definition);
  if (identity.cid !== cid)
    throw new Error(`The authority answered ${cid} with content that hashes to ${identity.cid}`);
  const cached = await ObjectLayer.upsertByIdentity(
    { schemaVersion: definition.schemaVersion, profile: definition.profile, data: definition.data },
    { origin: 'cache' },
  );
  await CacheService.invalidate(objectLayerCache(options));
  return cached;
}
