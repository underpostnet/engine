/**
 * Secrets module for managing the secrets of the application.
 * @module src/cli/secrets.js
 * @namespace UnderpostSecret
 */

import dotenv from 'dotenv';
import { shellExec } from '../server/process.js';
import fs from 'fs-extra';
import UnderpostRootEnv from './env.js';

dotenv.config();

/**
 * @class UnderpostSecret
 * @description Manages the secrets of the application.
 * @memberof UnderpostSecret
 */
class UnderpostSecret {
  static API = {
    /**
     * @method docker
     * @description Manages the secrets of the application.
     * @memberof UnderpostSecret
     */
    docker: {
      /**
       * @method init
       * @description Initializes the docker secrets.
       * @memberof UnderpostSecret
       */
      init() {
        shellExec(`docker swarm init`);
      },
      /**
       * @method createFromEnvFile
       * @description Creates a secret from an env file.
       * @param {string} envPath - The path to the env file.
       * @memberof UnderpostSecret
       */
      createFromEnvFile(envPath) {
        const envObj = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
        for (const key of Object.keys(envObj)) {
          UnderpostSecret.API.docker.set(key, envObj[key]);
        }
      },
      set(key, value) {
        shellExec(`docker secret rm ${key}`);
        shellExec(`echo "${value}" | docker secret create ${key} -`);
      },
      list() {
        shellExec(`docker secret ls`);
      },
    },
    /**
     * @method underpost
     * @description Manages the secrets of the application.
     * @memberof UnderpostSecret
     */
    underpost: {
      createFromEnvFile(envPath) {
        const envObj = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
        for (const key of Object.keys(envObj)) {
          UnderpostRootEnv.API.set(key, envObj[key]);
        }
      },
    },
  };
}

export default UnderpostSecret;
