import { serviceHandler } from '../../server/middlewares.js';
import { CryptoService } from './crypto.service.js';

class CryptoController {
  static post = serviceHandler(CryptoService.post);
  static get = serviceHandler(CryptoService.get);
  static delete = serviceHandler(CryptoService.delete);
}

export { CryptoController };
