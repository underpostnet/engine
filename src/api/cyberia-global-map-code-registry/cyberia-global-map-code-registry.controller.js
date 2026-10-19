import { serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaGlobalMapCodeRegistryService } from './cyberia-global-map-code-registry.service.js';

class CyberiaGlobalMapCodeRegistryController {
  static resolve = serviceHandler(CyberiaGlobalMapCodeRegistryService.resolve, { crossOrigin: true, errorStatus: 404 });
  static get = serviceHandler(CyberiaGlobalMapCodeRegistryService.get, { pagination: true });
  static reconcile = serviceHandler(CyberiaGlobalMapCodeRegistryService.reconcile);
}

export { CyberiaGlobalMapCodeRegistryController };
