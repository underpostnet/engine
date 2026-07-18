/**
 * Express middleware and controller/router helpers for engine APIs.
 *
 * @module src/server/middlewares.js
 */

import { loggerFactory } from './logger.js';
import { moderatorGuard, adminGuard } from './auth.js';

const logger = loggerFactory(import.meta);

/**
 * The public-read CORS policy: reflect the request origin (or allow any)
 * and mark the resource embeddable cross-origin.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const setCrossOriginHeaders = (req, res) => {
  if (req && req.headers && req.headers.origin) res.set('Access-Control-Allow-Origin', req.headers.origin);
  else res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
};

/** Express middleware form of {@link setCrossOriginHeaders}. */
const crossOriginMiddleware = (req, res, next) => {
  setCrossOriginHeaders(req, res);
  next();
};

/**
 * Shallow request copy with `page`/`limit` parsed to integers.
 * `path` and `params` are copied explicitly because spreading an Express
 * request drops prototype getters.
 * @param {import('express').Request} req
 */
const withParsedPagination = (req) => {
  const { page, limit } = req.query;
  return {
    ...req,
    path: req.path,
    params: req.params,
    query: { ...req.query, page: parseInt(page), limit: parseInt(limit) },
  };
};

const sendSuccess = (res, data) => res.status(200).json({ status: 'success', data });

const sendError = (res, error, status = 400) => res.status(status).json({ status: 'error', message: error.message });

/**
 * Binary response with cross-origin and content headers.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{ buffer: Buffer, mimetype: string, filename: string, disposition?: 'inline'|'attachment' }} blob
 */
const sendBlob = (req, res, { buffer, mimetype, filename, disposition = 'inline' }) => {
  setCrossOriginHeaders(req, res);
  res.setHeader('Content-Type', mimetype);
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
  return res.status(200).end(buffer);
};

/**
 * Wraps a controller body with error logging and the error response envelope.
 * @param {(req, res, options) => Promise<any>} fn
 * @param {{ errorStatus?: number }} [config]
 */
const controllerHandler =
  (fn, { errorStatus = 400 } = {}) =>
  async (req, res, options) => {
    try {
      return await fn(req, res, options);
    } catch (error) {
      logger.error(error, error.stack);
      return sendError(res, error, errorStatus);
    }
  };

/**
 * Builds a controller method that delegates to a service method and wraps the
 * result in the success envelope.
 * @param {(req, res, options) => Promise<any>} serviceFn
 * @param {{ errorStatus?: number, crossOrigin?: boolean, pagination?: boolean }} [config]
 */
const serviceHandler = (serviceFn, { errorStatus = 400, crossOrigin = false, pagination = false } = {}) =>
  controllerHandler(
    async (req, res, options) => {
      if (crossOrigin) setCrossOriginHeaders(req, res);
      const result = await serviceFn(pagination ? withParsedPagination(req) : req, res, options);
      return sendSuccess(res, result);
    },
    { errorStatus },
  );

/**
 * Builds a standard CRUD controller class (static post/get/put/delete) from a
 * service exposing the same methods. `get` parses pagination.
 * @param {{ post, get, put, delete }} service
 * @param {Object<string, Function>} [extend] - Extra or overriding static handlers.
 */
const buildCrudController = (service, extend = {}) => {
  class CrudController {
    static post = serviceHandler(service.post);
    static get = serviceHandler(service.get, { pagination: true });
    static put = serviceHandler(service.put);
    static delete = serviceHandler(service.delete);
  }
  Object.assign(CrudController, extend);
  return CrudController;
};

/**
 * Registers the standard CRUD routes with the standard guard policy:
 * public reads, moderator-guarded writes, admin-guarded collection delete.
 * Custom routes must be registered before calling this (generic `/:id` routes
 * capture everything).
 * @param {import('express').Router} router
 * @param {{ post, get, put, delete }} Controller
 * @param {import('../../api/types.js').RouterOptions} options
 * @param {{ readGuards?: Function[], writeGuards?: Function[], deleteAllGuards?: Function[] }} [config]
 *   Pass empty arrays for unguarded endpoints (e.g. player-written progress)
 *   or explicit guard chains (e.g. admin-only reads).
 * @returns {import('express').Router}
 */
const registerCrudRoutes = (router, Controller, options, { readGuards = [], writeGuards, deleteAllGuards } = {}) => {
  const write = writeGuards ?? [options.authMiddleware, moderatorGuard];
  const deleteAll = deleteAllGuards ?? [options.authMiddleware, adminGuard];
  const handle = (method) => async (req, res) => await Controller[method](req, res, options);
  router.post(`/:id`, ...write, handle('post'));
  router.post(`/`, ...write, handle('post'));
  router.get(`/:id`, ...readGuards, handle('get'));
  router.get(`/`, ...readGuards, handle('get'));
  router.put(`/:id`, ...write, handle('put'));
  router.put(`/`, ...write, handle('put'));
  router.delete(`/:id`, ...write, handle('delete'));
  router.delete(`/`, ...deleteAll, handle('delete'));
  return router;
};

export {
  setCrossOriginHeaders,
  crossOriginMiddleware,
  withParsedPagination,
  sendSuccess,
  sendError,
  sendBlob,
  controllerHandler,
  serviceHandler,
  buildCrudController,
  registerCrudRoutes,
};
