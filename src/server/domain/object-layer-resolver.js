/**
 * Resolves canonical Object Layers and their ledger state across domains.
 *
 * ItemLedger and Cyberia read Object Layer content here, never from another domain's database.
 * The owner of an API answers from its own model. A consumer — a host that declares the API in
 * `consumes`, or one that holds no model for it — asks the owning domain over its API. With no
 * owner URL configured, a consumer reads its local cache, and a host with neither gets `null`.
 *
 * @module src/server/domain/object-layer-resolver.js
 * @namespace ObjectLayerResolver
 */
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { canonicalObjectLayer } from '../../client/components/object-layer/ObjectLayerProtocol.js';
import { domainOrigin, domainRead, domainWrite } from './domain-client.js';

const localModel = (name, options) => {
  try {
    return DataBaseProviderService.getModel(name, options);
  } catch {
    return null;
  }
};

/**
 * The local model to answer from, or null to ask the owning domain. The owner answers from its
 * model. A consumer asks the owner, and reads its local cache only when no owner URL is set.
 * @param {string} name - Model name.
 * @param {string} api - API the model belongs to.
 * @param {string} domain - Domain that owns the API.
 * @param {import('../../api/types.js').RouterOptions} [options]
 * @returns {import('mongoose').Model|null}
 */
const localSource = (name, api, domain, options) =>
  options?.consumes?.[api] && domainOrigin(domain) ? null : localModel(name, options);

/**
 * The canonical Object Layer a CID names.
 * @param {string} cid - Canonical Object Layer CID.
 * @param {import('../../api/types.js').RouterOptions} [options] - Router options of the calling deployment.
 * @returns {Promise<Object|null>}
 * @memberof ObjectLayerResolver
 */
export async function resolveObjectLayer(cid, options) {
  const ObjectLayer = localSource('ObjectLayer', 'object-layer', 'object-layer', options);
  if (ObjectLayer) return await ObjectLayer.findByCid(cid).lean();
  if (domainOrigin('object-layer')) return await domainRead({ domain: 'object-layer', path: `object-layer/${cid}` });
  return null;
}

/**
 * Stores a definition at the Object Layer authority, which answers with its identity. Only the
 * canonical content travels: labels, storage refs and ledger state stay with the caller.
 * @param {Object} definition - An Object Layer document or payload.
 * @returns {Promise<{cid:string,contentHash:string,created:boolean}>}
 * @throws {Error} When no authority URL is configured, or the authority refuses the content.
 * @memberof ObjectLayerResolver
 */
export async function publishObjectLayer(definition) {
  return await domainWrite({
    domain: 'object-layer',
    path: 'object-layer/canonical',
    body: canonicalObjectLayer(definition),
  });
}

/**
 * The ItemLedger bindings of a CID, across chains and contracts.
 * @param {string} cid - Canonical Object Layer CID.
 * @param {import('../../api/types.js').RouterOptions} [options] - Router options of the calling deployment.
 * @returns {Promise<Object[]>}
 * @memberof ObjectLayerResolver
 */
export async function resolveLedgerBindings(cid, options) {
  const ItemLedger = localSource('ItemLedger', 'item-ledger', 'item-ledger', options);
  if (ItemLedger) return await ItemLedger.findByCid(cid).lean();
  if (domainOrigin('item-ledger')) {
    const answer = await domainRead({ domain: 'item-ledger', path: `item-ledger/cid/${cid}` });
    return answer?.data ?? [];
  }
  return [];
}

/**
 * Which of several CIDs ItemLedger registers. Read from the local projection on the ItemLedger
 * host, from its API anywhere else.
 * @param {string[]} cids - Canonical Object Layer CIDs.
 * @param {import('../../api/types.js').RouterOptions} [options] - Router options of the calling deployment.
 * @returns {Promise<Set<string>>}
 * @memberof ObjectLayerResolver
 */
export async function resolveRegisteredCids(cids, options) {
  if (cids.length === 0) return new Set();
  const ItemLedger = localSource('ItemLedger', 'item-ledger', 'item-ledger', options);
  if (ItemLedger) return new Set(await ItemLedger.distinct('objectLayerCid', { objectLayerCid: { $in: cids } }));
  const registered = await Promise.all(
    cids.map(async (cid) => ((await resolveLedgerBindings(cid, options)).length ? cid : null)),
  );
  return new Set(registered.filter(Boolean));
}

/**
 * Supply and holder count of one token type, from the ownership projection.
 * @param {{chainId:number,contractAddress:string,tokenId:string}} token
 * @param {import('../../api/types.js').RouterOptions} [options] - Router options of the calling deployment.
 * @returns {Promise<{supply:string,holders:number}|null>}
 * @memberof ObjectLayerResolver
 */
export async function resolveTokenSupply({ chainId, contractAddress, tokenId }, options) {
  const ItemLedgerBalance = localSource('ItemLedgerBalance', 'item-ledger-balance', 'item-ledger', options);
  if (!ItemLedgerBalance) {
    if (!domainOrigin('item-ledger')) return null;
    return await domainRead({
      domain: 'item-ledger',
      path: `item-ledger-balance/supply/${chainId}/${contractAddress}/${tokenId}`,
    });
  }
  const rows = await ItemLedgerBalance.find(
    { chainId, contractAddress, tokenId, balance: { $ne: '0' } },
    { balance: 1 },
  ).lean();
  return { supply: rows.reduce((sum, row) => sum + BigInt(row.balance), 0n).toString(10), holders: rows.length };
}
