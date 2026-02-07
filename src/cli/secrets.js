/**
 * Secrets module for managing the secrets of the application.
 * @module src/cli/secrets.js
 * @namespace UnderpostSecret
 */

import dotenv from 'dotenv';
import { shellExec } from '../server/process.js';
import fs from 'fs-extra';
import Underpost from '../index.js';

dotenv.config();

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
        const envObj = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
        for (const key of Object.keys(envObj)) {
          Underpost.env.set(key, envObj[key]);
        }
      },
    },
  };
}

export default UnderpostSecret;
