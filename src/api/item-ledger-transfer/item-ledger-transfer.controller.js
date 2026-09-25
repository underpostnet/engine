import { buildCrudController, serviceHandler } from '../../server/network/middlewares.js';
import { ItemLedgerTransferService } from './item-ledger-transfer.service.js';

const ItemLedgerTransferController = buildCrudController(ItemLedgerTransferService, {
  get: serviceHandler(ItemLedgerTransferService.get, { pagination: true, crossOrigin: true }),
});

export { ItemLedgerTransferController };
