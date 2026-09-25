import { buildCrudController, serviceHandler } from '../../server/network/middlewares.js';
import { WalletAccountService } from './wallet-account.service.js';

const WalletAccountController = buildCrudController(WalletAccountService, {
  get: serviceHandler(WalletAccountService.get, { crossOrigin: true }),
});

export { WalletAccountController };
