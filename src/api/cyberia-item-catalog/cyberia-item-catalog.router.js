import express from 'express';
import { moderatorGuard } from '../../server/security/auth.js';
import { CyberiaItemCatalogController } from './cyberia-item-catalog.controller.js';

class CyberiaItemCatalogRouter {
  /**
   * Reads are public; the IPFS diagnostics, an import from the Object Layer authority, binding,
   * unbinding and reconciling need a moderator.
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    const moderator = [options.authMiddleware, moderatorGuard];
    const handle = (method) => async (req, res) => await CyberiaItemCatalogController[method](req, res, options);
    router.get(`/unbound`, handle('unbound'));
    router.get(`/resolve`, handle('resolve'));
    router.get(`/import/search`, ...moderator, handle('importSearch'));
    router.get(`/import/:cid`, ...moderator, handle('importPreview'));
    router.get(`/:id/history`, handle('history'));
    router.get(`/:id/diagnostics`, ...moderator, handle('diagnostics'));
    router.get(`/:id`, handle('get'));
    router.get(`/`, handle('get'));
    router.post(`/reconcile`, ...moderator, handle('reconcile'));
    router.post(`/import/preview`, ...moderator, handle('importDocumentPreview'));
    router.post(`/import`, ...moderator, handle('importDefinition'));
    router.post(`/`, ...moderator, handle('post'));
    router.delete(`/:id`, ...moderator, handle('delete'));
    return router;
  }
}

const ApiRouter = (options) => CyberiaItemCatalogRouter.router(options);

export { ApiRouter, CyberiaItemCatalogRouter };
