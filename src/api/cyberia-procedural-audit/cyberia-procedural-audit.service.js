/**
 * CyberiaProceduralAudit service: read access to the audit records of the Procedural Engine. They are written by the
 * engine only, never over HTTP.
 *
 * @module src/api/cyberia-procedural-audit/cyberia-procedural-audit.service.js
 * @namespace CyberiaProceduralAuditService
 */
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { CyberiaProceduralAuditDto } from './cyberia-procedural-audit.model.js';

/** The query parameters that filter a list by one field. */
const FILTERS = ['jobId', 'jobItemId', 'action'];

class CyberiaProceduralAuditService {
  /**
   * GET `/` (paginated; `?jobId=`, `?jobItemId=`, `?action=` filter).
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static get = async (req, res, options) => {
    const CyberiaProceduralAudit = DataBaseProviderService.getModel('CyberiaProceduralAudit', options);
    const select = CyberiaProceduralAuditDto.select.get();
    const { skip, limit, page } = DataQuery.parse(req.query);
    const filter = Object.fromEntries(
      FILTERS.filter((name) => req.query[name]).map((name) => [name, String(req.query[name])]),
    );
    const [data, total] = await Promise.all([
      CyberiaProceduralAudit.find(filter).sort({ createdAt: 1 }).limit(limit).skip(skip).select(select),
      CyberiaProceduralAudit.countDocuments(filter),
    ]);
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  };
}

export { CyberiaProceduralAuditService };
