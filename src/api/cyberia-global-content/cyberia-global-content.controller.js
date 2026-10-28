import { serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaGlobalContentService } from './cyberia-global-content.service.js';

class CyberiaGlobalContentController {
  static get = serviceHandler(CyberiaGlobalContentService.get, { pagination: true });
  static delete = serviceHandler(CyberiaGlobalContentService.delete);
}

export { CyberiaGlobalContentController };
