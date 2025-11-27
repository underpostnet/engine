/**
 * Static site generation module
 * @module src/cli/static.js
 * @namespace UnderpostStatic
 */

import fs from 'fs-extra';
import { ssrFactory } from '../server/ssr.js';
import { shellExec } from '../server/process.js';
import Underpost from '../index.js';
import { JSONweb } from '../server/client-formatted.js';

/**
 * @class UnderpostStatic
 * @description Static site generation class
 * @memberof UnderpostStatic
 */
class UnderpostStatic {
  static API = {
    /**
     * Generate static HTML file
     * @param {Object} options - Options for static generation
     * @param {string} options.page - Page identifier
     * @param {string} options.title - Page title
     * @param {string} options.outputPath - Output file path
     * @param {string} options.deployId - Deployment identifier
     * @param {string} options.buildHost - Build host
     * @param {string} options.buildPath - Build path
     * @param {string} options.env - Environment (development/production)
     * @param {boolean} options.build - Whether to trigger build
     * @param {boolean} options.dev - Development mode flag
     * @memberof UnderpostStatic
     * @returns {Promise<void>}
     */
    async callback(
      options = {
        page: '',
        title: '',
        outputPath: '',
        deployId: '',
        buildHost: '',
        buildPath: '',
        env: '',
        build: false,
        dev: false,
      },
    ) {
      if (!options.outputPath) options.outputPath = '.';
      if (!options.buildPath) options.buildPath = '/';
      if (!options.env) options.env = 'production';

      if (options.page) {
        const Render = await ssrFactory();
        const SsrComponent = await ssrFactory(options.page);
        const htmlSrc = Render({
          title: options.title || 'Home',
          ssrPath: '/',
          ssrHeadComponents: '',
          ssrBodyComponents: SsrComponent(),
          // buildId: options.deployId || 'local',
          renderPayload: {
            // apiBaseProxyPath,
            // apiBaseHost,
            // apiBasePath: process.env.BASE_API,
            version: Underpost.version,
            ...(options.env === 'development' ? { dev: true } : undefined),
          },
          renderApi: {
            JSONweb,
          },
        });
        fs.writeFileSync(options.outputPath, htmlSrc, 'utf8');
      }
      if (options.deployId && options.build) {
        shellExec(`underpost env ${options.deployId} ${options.env}`);
        shellExec(
          `npm run build ${options.deployId}${options.buildHost ? ` ${options.buildHost} ${options.buildPath}` : ``}`,
        );
      }
    },
  };
}

export default UnderpostStatic;
