/**
 * @module src/api/types
 * @description Shared type definitions for the Express router layer.
 */

/**
 * Injected dependencies and runtime configuration for every API router instance.
 * Keyed per-host/path by the multi-tenant engine (see src/runtime/express/Express.js).
 *
 * @typedef {Object} RouterOptions
 * @property {import('express').Application} app - Express application instance.
 * @property {string} host - Per-runtime host identifier (e.g. "nexodev.org").
 * @property {string} path - Per-runtime path prefix (e.g. "/" or "/cyberia").
 * @property {string} apiPath - Computed base URL for the API layer.
 * @property {string[]} origins - Allowed origins for CORS validation.
 * @property {import('express').RequestHandler} authMiddleware - Dynamically generated JWT auth middleware (keyed by host+path).
 * @property {Object} [db] - DataBaseProviderService configuration or instance reference.
 * @property {Object} [mailer] - MailerProvider configuration or instance reference.
 * @property {Object} [png] - Cached mailer image buffers (populated by UserRouter on first load).
 * @property {Record<string, Buffer>} [png.buffer] - Map of image key to raw PNG buffer.
 * @property {Function} [png.header] - Sets CORS/Content-Type response headers for PNG responses.
 */

export { };
