import { buildCrudController, serviceHandler } from '../../server/network/middlewares.js';
import { ItemLedgerCheckpointService } from './item-ledger-checkpoint.service.js';

const ItemLedgerCheckpointController = buildCrudController(ItemLedgerCheckpointService, {
  get: serviceHandler(ItemLedgerCheckpointService.get, { crossOrigin: true }),
});

export { ItemLedgerCheckpointController };
