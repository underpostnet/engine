/**
 * ItemLedgerCheckpoint service: how far the projection of each contract reaches.
 *
 * @module src/api/item-ledger-checkpoint/item-ledger-checkpoint.service.js
 * @namespace ItemLedgerCheckpointService
 */
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { normalizeAddress } from '../item-ledger/item-ledger.model.js';
import { ItemLedgerCheckpointDto } from './item-ledger-checkpoint.model.js';

class ItemLedgerCheckpointService {
  /**
   * GET `/` (every contract) or `/:chainId/:contractAddress` (one contract).
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static get = async (req, res, options) => {
    const ItemLedgerCheckpoint = DataBaseProviderService.getModel('ItemLedgerCheckpoint', options);
    const select = ItemLedgerCheckpointDto.select.get();
    if (req.params.chainId) {
      const checkpoint = await ItemLedgerCheckpoint.findOne({
        chainId: Number(req.params.chainId),
        contractAddress: normalizeAddress(req.params.contractAddress),
      }).select(select);
      if (!checkpoint) throw new Error('Contract is not indexed');
      return checkpoint;
    }
    return { data: await ItemLedgerCheckpoint.find({}).select(select) };
  };
}

export { ItemLedgerCheckpointService };
