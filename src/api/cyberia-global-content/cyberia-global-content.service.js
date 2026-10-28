import { DataQuery } from '../../server/storage/data-query.js';
import { listGlobalContent, unregisterGlobalContent } from '../../projects/cyberia/catalog/global-content.js';

class CyberiaGlobalContentService {
  /**
   * GET `/`: a page of global content, each row with its item, its availability and the item ids
   * bound to it.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<{data:Object[],total:number,page:number,totalPages:number}>}
   */
  static get = async (req, res, options) => {
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);
    const { data, total } = await listGlobalContent(options, { query, sort, skip, limit });
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  };

  /**
   * DELETE `/:cid`: removes a definition from global content, while no item and no player holds it.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static delete = async (req, res, options) => await unregisterGlobalContent(options, req.params.cid);
}

export { CyberiaGlobalContentService };
