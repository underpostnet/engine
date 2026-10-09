/**
 * CyberiaProceduralJobItem service: read access to the candidates of the Procedural Engine. They are written by the
 * engine only, never over HTTP.
 *
 * @module src/api/cyberia-procedural-job-item/cyberia-procedural-job-item.service.js
 * @namespace CyberiaProceduralJobItemService
 */
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { CyberiaProceduralJobItemDto } from './cyberia-procedural-job-item.model.js';

/** The query parameters that filter a list by one field. */
const FILTERS = ['jobId', 'targetItemId', 'status'];

class CyberiaProceduralJobItemService {
  /**
   * GET `/` (paginated; `?jobId=`, `?targetItemId=`, `?status=` filter) or `/:id` (one record).
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static get = async (req, res, options) => {
    const CyberiaProceduralJobItem = DataBaseProviderService.getModel('CyberiaProceduralJobItem', options);
    const select = CyberiaProceduralJobItemDto.select.get();
    if (req.params.id) {
      const record = await CyberiaProceduralJobItem.findById(req.params.id).select(select);
      if (!record) throw Object.assign(new Error('Job item not found'), { status: 404 });
      return record;
    }
    const { skip, limit, page } = DataQuery.parse(req.query);
    const filter = Object.fromEntries(
      FILTERS.filter((name) => req.query[name]).map((name) => [name, String(req.query[name])]),
    );
    const [data, total] = await Promise.all([
      CyberiaProceduralJobItem.find(filter).sort({ jobId: 1, ordinal: 1 }).limit(limit).skip(skip).select(select),
      CyberiaProceduralJobItem.countDocuments(filter),
    ]);
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  };
}

export { CyberiaProceduralJobItemService };
