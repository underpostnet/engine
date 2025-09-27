import fs from 'fs-extra';
import dotenv from 'dotenv';
import Underpost from '../index.js';

import { ssrFactory, JSONweb } from './client-formatted.js';
import { loggerFactory } from './logger.js';
import { getRootDirectory } from './process.js';

dotenv.config();

const logger = loggerFactory(import.meta);

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

  const sanitizeHtml = (res, req, html) => {
    const nonce = res.locals.nonce;

    return html
      .replace(/<script(?=\s|>)/gi, `<script nonce="${nonce}"`)
      .replace(/<style(?=\s|>)/gi, `<style nonce="${nonce}"`);
  };

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

export { ssrMiddlewareFactory };
