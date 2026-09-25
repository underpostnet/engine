/**
 * ItemLedger service: registry reads and binding writes.
 *
 * @module src/api/item-ledger/item-ledger.service.js
 * @namespace ItemLedgerService
 */
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { resolveObjectLayer, resolveTokenSupply } from '../../server/domain/object-layer-resolver.js';
import { ItemLedgerDto, objectLayerTokenId } from './item-ledger.model.js';

class ItemLedgerService {
  /**
   * GET handler.
   *
   * - `/cid/:cid` — every binding of one Object Layer.
   * - `/token-id/:cid` — the token id a CID derives to, without a database read.
   * - `/token/:chainId/:contractAddress/:tokenId` — the binding of one token type.
   * - `/asset/:chainId/:contractAddress/:tokenId` — the binding with the canonical content it
   *   represents and its projected supply, resolved across domains.
   * - `/:id` — one binding by document id.
   * - `/` — paginated bindings.
   *
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static get = async (req, res, options) => {
    /** @type {import('./item-ledger.model.js').ItemLedgerModel} */
    const ItemLedger = DataBaseProviderService.getModel('ItemLedger', options);
    const select = ItemLedgerDto.select.get();

    if (req.path.startsWith('/token-id/')) {
      const objectLayerCid = req.params.cid;
      return { objectLayerCid, tokenId: objectLayerTokenId(objectLayerCid) };
    }
    if (req.path.startsWith('/cid/')) {
      return { data: await ItemLedger.findByCid(req.params.cid).select(select) };
    }
    if (req.path.startsWith('/token/')) {
      const binding = await ItemLedger.findByToken(req.params).select(select);
      if (!binding) throw new Error('ItemLedger binding not found');
      return binding;
    }
    if (req.path.startsWith('/asset/')) {
      const binding = await ItemLedger.findByToken(req.params).select(select).lean();
      if (!binding) throw new Error('ItemLedger binding not found');
      const [objectLayer, supply] = await Promise.all([
        resolveObjectLayer(binding.objectLayerCid, options),
        resolveTokenSupply(binding, options),
      ]);
      return { binding, objectLayer, ...supply };
    }
    if (req.params.id) {
      const binding = await ItemLedger.findById(req.params.id).select(select);
      if (!binding) throw new Error('ItemLedger binding not found');
      return binding;
    }

    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);
    const [data, total] = await Promise.all([
      ItemLedger.find(query).sort(sort).limit(limit).skip(skip).select(select),
      ItemLedger.countDocuments(query),
    ]);
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  };

  /**
   * POST handler: records the binding of an Object Layer registered on a contract.
   * @param {Object} req - Express request with body `{ objectLayerCid, chainId, contractAddress, itemId?, tokenId?, txHash? }`.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static post = async (req, res, options) => {
    /** @type {import('./item-ledger.model.js').ItemLedgerModel} */
    const ItemLedger = DataBaseProviderService.getModel('ItemLedger', options);
    return await ItemLedger.bind(req.body);
  };

  /**
   * DELETE handler: removes one binding by document id.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static delete = async (req, res, options) => {
    /** @type {import('./item-ledger.model.js').ItemLedgerModel} */
    const ItemLedger = DataBaseProviderService.getModel('ItemLedger', options);
    if (!req.params.id) throw new Error('ItemLedger binding id is required');
    const deleted = await ItemLedger.findByIdAndDelete(req.params.id);
    if (!deleted) throw new Error('ItemLedger binding not found');
    return deleted;
  };
}

export { ItemLedgerService };
