import { buildCrudController, serviceHandler } from '../../server/network/middlewares.js';
import { ItemLedgerService } from './item-ledger.service.js';

const ItemLedgerController = buildCrudController(ItemLedgerService, {
  get: serviceHandler(ItemLedgerService.get, { pagination: true, crossOrigin: true }),
});

export { ItemLedgerController };
