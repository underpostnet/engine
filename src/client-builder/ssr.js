/**
 * Module for managing server side rendering
 * @module src/client-builder/ssr.js
 * @namespace ServerSideRendering
 */

import fs from 'fs-extra';
import vm from 'node:vm';

import Underpost from '../index.js';

import { srcFormatted } from './client-formatted.js';
import { loggerFactory } from '../server/ops/logger.js';

const logger = loggerFactory(import.meta);

/**
 * Creates a server-side rendering component function from a given file path.
 * It reads the component file, formats it, and executes it in a sandboxed Node.js VM context to extract the component.
 * @param {string} [componentPath='./src/client/ssr/RootDocument.js'] - The path to the SSR component file.
 * @returns {Promise<Function>} A promise that resolves to the SSR component function.
 * @memberof ServerSideRendering
 */
const ssrFactory = async (componentPath = `./src/client/ssr/RootDocument.js`) => {
  const context = { SSRComponent: () => {}, npm_package_version: Underpost.version };
  vm.createContext(context);
  vm.runInContext(await srcFormatted(fs.readFileSync(componentPath, 'utf8')), context);
  return context.SSRComponent;
};

/**
 * Sanitizes an HTML string by adding a nonce to all script and style tags for Content Security Policy (CSP).
 * The nonce is retrieved from `res.locals.nonce`.
 * @param {object} res - The Express response object.
 * @param {object} req - The Express request object.
 * @param {string} html - The HTML string to sanitize.
 * @returns {string} The sanitized HTML string with nonces.
 * @memberof ServerSideRendering
 */
const sanitizeHtml = (res, req, html) => {
  const nonce = res.locals.nonce;

  return html
    .replace(/<script(?=\s|>)/gi, `<script nonce="${nonce}"`)
    .replace(/<style(?=\s|>)/gi, `<style nonce="${nonce}"`);
};

/**
 * Creates the Express middleware that terminates an unmatched request and an
 * unhandled error.
 *
 * Both return a bare status and nothing else. Status page delivery belongs to
 * the edge: the gateway intercepts the status and serves the declared document
 * from `underpost-gateway`, preserving this response's code and the client's
 * URI. A runtime that rendered its own page, redirected to one, or fetched one
 * over HTTP would be competing with that — and would be the only one of the
 * three runtimes doing so.
 * @param {string} [path] - The instance's proxy sub-path, used only to alias `/home`.
 * @returns {Promise<{error500: Function, error400: Function}>} The two terminators.
 * @memberof ServerSideRendering
 */
const ssrMiddlewareFactory = async ({ path = '/' } = {}) => ({
  error500: function (err, req, res, next) {
    logger.error(err, err.stack);
    return res.sendStatus(500);
  },
  error400: function (req, res, next) {
    // `/<path>/home` is an alias of `/<path>`, not a missing route.
    const homeRedirectPath = `${path === '/' ? '' : path}/home`;
    if (req.url.startsWith(homeRedirectPath)) {
      const redirectUrl = req.url.replace('/home', '');
      return res.redirect(redirectUrl.startsWith('/') ? redirectUrl : `/${redirectUrl}`);
    }
    return res.sendStatus(404);
  },
});

export { ssrMiddlewareFactory, ssrFactory, sanitizeHtml };
