/**
 * Module for managing server side rendering
 * @module src/server/ssr.js
 * @namespace SSR
 */

import fs from 'fs-extra';
import dotenv from 'dotenv';
import vm from 'node:vm';

import Underpost from '../index.js';

import { srcFormatted, JSONweb } from './client-formatted.js';
import { loggerFactory } from './logger.js';
import { getRootDirectory } from './process.js';

dotenv.config();

const logger = loggerFactory(import.meta);

/**
 * Creates a server-side rendering component function from a given file path.
 * It reads the component file, formats it, and executes it in a sandboxed Node.js VM context to extract the component.
 * @param {string} [componentPath='./src/client/ssr/Render.js'] - The path to the SSR component file.
 * @returns {Promise<Function>} A promise that resolves to the SSR component function.
 * @memberof SSR
 */
const ssrFactory = async (componentPath = `./src/client/ssr/Render.js`) => {
  const context = { SrrComponent: () => {}, npm_package_version: Underpost.version };
  vm.createContext(context);
  vm.runInContext(await srcFormatted(fs.readFileSync(componentPath, 'utf8')), context);
  return context.SrrComponent;
};

/**
 * Sanitizes an HTML string by adding a nonce to all script and style tags for Content Security Policy (CSP).
 * The nonce is retrieved from `res.locals.nonce`.
 * @param {object} res - The Express response object.
 * @param {object} req - The Express request object.
 * @param {string} html - The HTML string to sanitize.
 * @returns {string} The sanitized HTML string with nonces.
 * @memberof SSR
 */
const sanitizeHtml = (res, req, html) => {
  const nonce = res.locals.nonce;

  return html
    .replace(/<script(?=\s|>)/gi, `<script nonce="${nonce}"`)
    .replace(/<style(?=\s|>)/gi, `<style nonce="${nonce}"`);
};

/**
 * Factory function to create Express middleware for handling 404 and 500 errors.
 * It generates server-side rendered HTML for these error pages. If static error pages exist, it redirects to them.
 * @param {object} options - The options for creating the middleware.
 * @param {object} options.app - The Express app instance.
 * @param {string} options.directory - The directory for the instance's static files.
 * @param {string} options.rootHostPath - The root path for the host's public files.
 * @param {string} options.path - The base path for the instance.
 * @returns {Promise<{error500: Function, error400: Function}>} A promise that resolves to an object containing the 500 and 404 error handling middleware.
 * @memberof SSR
 */
const ssrMiddlewareFactory = async ({ app, directory, rootHostPath, path }) => {
  const Render = await ssrFactory();
  const ssrPath = path === '/' ? path : `${path}/`;

  // Build default html src for 404 and 500

  const defaultHtmlSrc404 = Render({
    title: '404 Not Found',
    ssrPath,
    ssrHeadComponents: '',
    ssrBodyComponents: (await ssrFactory(`./src/client/ssr/body/404.js`))(),
    renderPayload: {
      apiBasePath: process.env.BASE_API,
      version: Underpost.version,
    },
    renderApi: {
      JSONweb,
    },
  });
  const path404 = `${directory ? directory : `${getRootDirectory()}${rootHostPath}`}/404/index.html`;
  const page404 = fs.existsSync(path404) ? `${path === '/' ? '' : path}/404` : undefined;

  const defaultHtmlSrc500 = Render({
    title: '500 Server Error',
    ssrPath,
    ssrHeadComponents: '',
    ssrBodyComponents: (await ssrFactory(`./src/client/ssr/body/500.js`))(),
    renderPayload: {
      apiBasePath: process.env.BASE_API,
      version: Underpost.version,
    },
    renderApi: {
      JSONweb,
    },
  });
  const path500 = `${directory ? directory : `${getRootDirectory()}${rootHostPath}`}/500/index.html`;
  const page500 = fs.existsSync(path500) ? `${path === '/' ? '' : path}/500` : undefined;

  return {
    error500: function (err, req, res, next) {
      logger.error(err, err.stack);
      if (page500) return res.status(500).redirect(page500);
      else {
        res.set('Content-Type', 'text/html');
        return res.status(500).send(sanitizeHtml(res, req, defaultHtmlSrc500));
      }
    },
    error400: function (req, res, next) {
      // if /<path>/home redirect to /<path>
      const homeRedirectPath = `${path === '/' ? '' : path}/home`;
      if (req.url.startsWith(homeRedirectPath)) {
        const redirectUrl = req.url.replace('/home', '');
        return res.redirect(redirectUrl.startsWith('/') ? redirectUrl : `/${redirectUrl}`);
      }

      if (page404) return res.status(404).redirect(page404);
      else {
        res.set('Content-Type', 'text/html');
        return res.status(404).send(sanitizeHtml(res, req, defaultHtmlSrc404));
      }
    },
  };
};

export { ssrMiddlewareFactory, ssrFactory, sanitizeHtml };
