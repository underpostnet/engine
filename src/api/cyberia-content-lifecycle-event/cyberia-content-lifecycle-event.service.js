/**
 * CyberiaContentLifecycleEvent service: read access to the journal of a content lifecycle, where this
 * engine reads the cycles.
 *
 * @module src/api/cyberia-content-lifecycle-event/cyberia-content-lifecycle-event.service.js
 * @namespace CyberiaContentLifecycleEventService
 */
import { monitorEvents } from '../../projects/cyberia/content/content-lifecycle-monitor.js';

class CyberiaContentLifecycleEventService {
  /**
   * GET `/?cycleId=&page=&limit=`: a page of the journal of one cycle, newest first.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').ApiRouterContext} options - The API context.
   * @returns {Promise<{data:Object[], total:number, page:number, totalPages:number}>}
   */
  static get = async (req, res, options) =>
    await monitorEvents(
      {
        cycleId: typeof req.query.cycleId === 'string' ? req.query.cycleId.trim() : '',
        page: req.query.page,
        limit: req.query.limit,
      },
      options,
    );
}

export { CyberiaContentLifecycleEventService };
