/**
 * ItemLedgerBalance service: ownership and supply reads over the balance projection.
 *
 * @module src/api/item-ledger-balance/item-ledger-balance.service.js
 * @namespace ItemLedgerBalanceService
 */
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { normalizeAddress, normalizeTokenId } from '../item-ledger/item-ledger.model.js';
import { ItemLedgerBalanceDto } from './item-ledger-balance.model.js';

const held = { balance: { $ne: '0' } };

const page = async (Model, query, req, select) => {
  const { sort, skip, limit, page } = DataQuery.parse(req.query);
  const [data, total] = await Promise.all([
    Model.find(query).sort(Object.keys(sort).length ? sort : { updatedAt: -1 }).limit(limit).skip(skip).select(select),
    Model.countDocuments(query),
  ]);
  return { data, total, page, totalPages: Math.ceil(total / limit) };
};

class ItemLedgerBalanceService {
  /**
   * GET handler.
   *
   * - `/token/:chainId/:contractAddress/:tokenId` — the holders of one token type.
   * - `/owner/:chainId/:contractAddress/:ownerAddress` — what one address holds.
   * - `/supply/:chainId/:contractAddress/:tokenId` — projected supply and holder count.
   * - `/` — paginated rows.
   *
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static get = async (req, res, options) => {
    const ItemLedgerBalance = DataBaseProviderService.getModel('ItemLedgerBalance', options);
    const select = ItemLedgerBalanceDto.select.get();
    const contract = () => ({ chainId: Number(req.params.chainId), contractAddress: normalizeAddress(req.params.contractAddress) });

    if (req.path.startsWith('/token/')) {
      return await page(ItemLedgerBalance, { ...contract(), tokenId: normalizeTokenId(req.params.tokenId), ...held }, req, select);
    }
    if (req.path.startsWith('/owner/')) {
      return await page(ItemLedgerBalance, { ...contract(), ownerAddress: normalizeAddress(req.params.ownerAddress), ...held }, req, select);
    }
    if (req.path.startsWith('/supply/')) {
      const key = { ...contract(), tokenId: normalizeTokenId(req.params.tokenId) };
      const rows = await ItemLedgerBalance.find({ ...key, ...held }, { balance: 1 }).lean();
      return { ...key, supply: rows.reduce((sum, row) => sum + BigInt(row.balance), 0n).toString(10), holders: rows.length };
    }
    const { query } = DataQuery.parse(req.query);
    return await page(ItemLedgerBalance, query, req, select);
  };
}

export { ItemLedgerBalanceService };
