/**
 * Secrets module for managing the secrets of the application.
 * @module src/cli/secrets.js
 * @namespace UnderpostSecret
 */

import { shellExec } from '../server/process.js';
import fs from 'fs-extra';
import dotenv from 'dotenv';
import Underpost from '../index.js';
import { loadConf } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';

const logger = loggerFactory(import.meta);

/**
 * @class UnderpostSecret
 * @description Manages the secrets of the application.
 * @memberof UnderpostSecret
 */
class UnderpostSecret {
  static API = {
    /**
     * @method underpost
     * @description Manages the secrets of the application.
     * @memberof UnderpostSecret
     */
    underpost: {
      createFromEnvFile(envPath) {
        Underpost.env.clean();
        const envObj = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
        for (const key of Object.keys(envObj)) {
          Underpost.env.set(key, envObj[key]);
        }
      },
    },

    /**
     * Removes all filesystem traces of secrets after deployment startup.
     * Centralizes the defense-in-depth cleanup performed
     * @memberof UnderpostSecret
     */
    globalSecretClean() {
      loadConf('clean');
      fs.removeSync('/tmp/.env.production');
      fs.removeSync('/tmp/.env.development');
      fs.removeSync('./engine-private');
      Underpost.env.clean();
    },
  };
}

export default UnderpostSecret;
