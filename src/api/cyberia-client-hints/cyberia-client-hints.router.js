/**
 * @module src/api/cyberia-client-hints
 *
 * Client presentation hints — read-only REST endpoint, off the simulation path.
 * It serves optional per-instance overrides of render policy: palette, camera
 * defaults, status-icon visuals, interpolation window, dev-overlay flag.
 *
 * Endpoints:
 *   GET /api/cyberia-client-hints/:instanceCode
 *     -> 200 { palette, entityColorKeys, statusIcons, cameraSmoothing,
 *              cameraZoom, defaultWidthScreenFactor,
 *              defaultHeightScreenFactor, interpolationMs, devUi }
 *     -> 404 when no instance carries that code. The client then uses its
 *            own built-in defaults, the normal path for a fresh deployment.
 *   GET /api/cyberia-client-hints/
 *     -> 200 canonical defaults, same shape, no DB read.
 *
 * Out of scope: gameplay state and authentication. Presentation hints hold no
 * simulation field and no secret.
 */

import express from 'express';
import { crossOriginMiddleware } from '../../server/network/middlewares.js';
import { CyberiaClientHintsController } from './cyberia-client-hints.controller.js';

class CyberiaClientHintsRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.use(crossOriginMiddleware);

    // GET /:code -> resolved hints. See the resolution order in
    // cyberia-client-hints.service.js.
    router.get('/:code', async (req, res) => await CyberiaClientHintsController.getByCode(req, res, options));

    // GET / -> canonical defaults. No DB read.
    router.get('/', async (req, res) => await CyberiaClientHintsController.getDefaults(req, res, options));

    return router;
  }
}

const ApiRouter = (options) => CyberiaClientHintsRouter.router(options);

export { ApiRouter, CyberiaClientHintsRouter };
