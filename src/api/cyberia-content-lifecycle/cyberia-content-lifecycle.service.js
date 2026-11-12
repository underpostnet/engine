/**
 * CyberiaContentLifecycle service: read access to the content lifecycles this engine reaches, the plan
 * of each one, and the context of the monitor. The `cyberia content lifecycle` CLI of each host writes
 * the cycles; the monitor module decides where this engine reads them.
 *
 * @module src/api/cyberia-content-lifecycle/cyberia-content-lifecycle.service.js
 * @namespace CyberiaContentLifecycleService
 */
import {
  monitorCycles,
  monitorPlan,
  monitorRuntime,
} from '../../projects/cyberia/content/content-lifecycle-monitor.js';

class CyberiaContentLifecycleService {
  /**
   * GET `/:id` (the plan of one cycle) or `/` (a page of cycle summaries, newest change first).
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').ApiRouterContext} options - The API context.
   * @returns {Promise<Object>}
   */
  static get = async (req, res, options) =>
    req.params.id ? await monitorPlan(req.params.id, options) : await monitorCycles(req, options);

  /**
   * GET `/runtime`: where this engine reads the cycles, the state of its share and its Development Sandbox.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').ApiRouterContext} options - The API context.
   * @returns {Promise<Object>}
   */
  static runtime = async (req, res, options) => await monitorRuntime(options);
}

export { CyberiaContentLifecycleService };
