/**
 * ItemLedgerTransfer service: provenance reads over the transfer projection.
 *
 * @module src/api/item-ledger-transfer/item-ledger-transfer.service.js
 * @namespace ItemLedgerTransferService
 */
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { normalizeAddress, normalizeTokenId } from '../item-ledger/item-ledger.model.js';
import { ItemLedgerTransferDto } from './item-ledger-transfer.model.js';

const page = async (Model, query, req, select) => {
  const { sort, skip, limit, page } = DataQuery.parse(req.query);
  const order = Object.keys(sort).length ? sort : { blockNumber: 1, logIndex: 1, batchIndex: 1 };
  const [data, total] = await Promise.all([
    Model.find(query).sort(order).limit(limit).skip(skip).select(select),
    Model.countDocuments(query),
  ]);
  return { data, total, page, totalPages: Math.ceil(total / limit) };
};

class ItemLedgerTransferService {
  /**
   * GET handler.
   *
   * - `/token/:chainId/:contractAddress/:tokenId` — the provenance of one token type, in chain order.
   * - `/owner/:chainId/:contractAddress/:ownerAddress` — every leg an address sent or received.
   * - `/tx/:chainId/:contractAddress/:txHash` — the legs of one transaction.
   * - `/` — paginated legs.
   *
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static get = async (req, res, options) => {
    const ItemLedgerTransfer = DataBaseProviderService.getModel('ItemLedgerTransfer', options);
    const select = ItemLedgerTransferDto.select.get();
    const contract = () => ({ chainId: Number(req.params.chainId), contractAddress: normalizeAddress(req.params.contractAddress) });

    if (req.path.startsWith('/token/')) {
      return await page(ItemLedgerTransfer, { ...contract(), tokenId: normalizeTokenId(req.params.tokenId) }, req, select);
    }
    if (req.path.startsWith('/owner/')) {
      const ownerAddress = normalizeAddress(req.params.ownerAddress);
      return await page(ItemLedgerTransfer, { ...contract(), $or: [{ from: ownerAddress }, { to: ownerAddress }] }, req, select);
    }
    if (req.path.startsWith('/tx/')) {
      return await page(ItemLedgerTransfer, { ...contract(), txHash: String(req.params.txHash).toLowerCase() }, req, select);
    }
    const { query } = DataQuery.parse(req.query);
    return await page(ItemLedgerTransfer, query, req, select);
  };
}

export { ItemLedgerTransferService };
