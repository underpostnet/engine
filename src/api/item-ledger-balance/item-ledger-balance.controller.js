import { buildCrudController, serviceHandler } from '../../server/network/middlewares.js';
import { ItemLedgerBalanceService } from './item-ledger-balance.service.js';

const ItemLedgerBalanceController = buildCrudController(ItemLedgerBalanceService, {
  get: serviceHandler(ItemLedgerBalanceService.get, { pagination: true, crossOrigin: true }),
});

export { ItemLedgerBalanceController };
