/**
 * Secrets module for managing the secrets of the application.
 * @module src/cli/secrets.js
 * @namespace UnderpostSecret
 */

import { shellExec } from '../server/process.js';
import fs from 'fs-extra';
import dotenv from 'dotenv';
import Underpost from '../index.js';
import { getUnderpostRootPath } from '../server/conf.js';

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
        const globalEnvPath = `${getUnderpostRootPath()}/.env`;
        if (fs.existsSync(globalEnvPath)) fs.removeSync(globalEnvPath);
        const envObj = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
        for (const key of Object.keys(envObj)) {
          Underpost.env.set(key, envObj[key]);
        }
      },
    },
  };
}

export default UnderpostSecret;
