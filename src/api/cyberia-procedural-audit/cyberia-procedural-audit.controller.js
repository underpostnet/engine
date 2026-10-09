import { serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaProceduralAuditService } from './cyberia-procedural-audit.service.js';

const CyberiaProceduralAuditController = {
  get: serviceHandler(CyberiaProceduralAuditService.get, { pagination: true }),
};

export { CyberiaProceduralAuditController };
