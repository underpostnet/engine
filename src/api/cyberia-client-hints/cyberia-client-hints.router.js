/**
 * @module src/api/cyberia-client-hints
 *
 * Client presentation hints — read-only REST endpoint.
 *
 * Purpose
 * -------
 * The cyberia-server (Go authoritative simulation) and the WS init payload
 * carry *only* simulation contracts. Client-render policy (palette, camera
 * defaults, status-icon visuals, interpolation window, dev-overlay flag)
 * lives off the simulation path entirely.
 *
 * This endpoint exposes optional per-instance overrides of those values.
 * The client is required to function with no calls to this endpoint at
 * all (it ships built-in defaults that match the canonical engine
 * defaults 1-to-1 — see cyberia-client/src/domain/presentation_defaults.h).
 *
 * Endpoint
 * --------
 *   GET /api/cyberia-client-hints/:instanceCode
 *     -> 200 { palette, entityColorKeys, statusIcons, cameraSmoothing,
 *              cameraZoom, defaultWidthScreenFactor,
 *              defaultHeightScreenFactor, interpolationMs, devUi }
 *     -> 404 if no instance with that code exists in the database — the
 *            client falls back to its built-in defaults on 404 (this is
 *            the normal path for stateless servers / fresh deployments).
 *
 *   GET /api/cyberia-client-hints/
 *     -> 200 canonical defaults — same shape as above, no DB read.
 *
 * What it intentionally does NOT do
 * ---------------------------------
 *   - It does not touch gameplay state (no entity, map, economy, skill,
 *     equipment, or stat fields).
 *   - It is not consumed by cyberia-server; the Go process never calls
 *     this endpoint.
 *   - It is not authenticated. Presentation hints are not secret.
 */

import express from 'express';
import { crossOriginMiddleware } from '../../server/middlewares.js';
import { CyberiaClientHintsController } from './cyberia-client-hints.controller.js';

class CyberiaClientHintsRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.use(crossOriginMiddleware);

    // GET /:code -> resolved hints.
    // Resolution order is documented in cyberia-client-hints.service.js:
    //   1. In-memory TTL cache.
    //   2. CyberiaClientHints collection (preferred).
    //   3. Legacy presentation fields on CyberiaInstanceConf (back-compat).
    //   4. Canonical client defaults (never cached so a later DB insert wins).
    router.get('/:code', async (req, res) => await CyberiaClientHintsController.getByCode(req, res, options));

    // GET / -> canonical defaults. No DB read. Documentation/diagnostic.
    router.get('/', async (req, res) => await CyberiaClientHintsController.getDefaults(req, res, options));

    return router;
  }
}

const ApiRouter = (options) => CyberiaClientHintsRouter.router(options);

export { ApiRouter, CyberiaClientHintsRouter };
