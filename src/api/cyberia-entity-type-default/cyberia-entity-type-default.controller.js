import { buildCrudController, serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaEntityTypeDefaultService } from './cyberia-entity-type-default.service.js';

const CyberiaEntityTypeDefaultController = buildCrudController(CyberiaEntityTypeDefaultService, {
  // Which instances run on this default. The link is stored on CyberiaInstanceConf.entityDefaults,
  // so reading it is an ordinary conf read; only the write needs a route of its own.
  setInstances: serviceHandler(CyberiaEntityTypeDefaultService.setInstances),
  // Point one instance's conf at every default its own map content needs.
  sync: serviceHandler(CyberiaEntityTypeDefaultService.sync),
});

export { CyberiaEntityTypeDefaultController };
