/**
 * Environment module for managing the environment variables of the underpost root
 * @module src/cli/env.js
 * @namespace UnderpostEnv
 */

import { getNpmRootPath, writeEnv } from '../server/conf.js';
import fs from 'fs-extra';
import { loggerFactory } from '../server/logger.js';
import dotenv from 'dotenv';

dotenv.config();

const logger = loggerFactory(import.meta);

/**
 * @class UnderpostEnv
 * @description Manages the environment variables of the underpost root.
 * @memberof UnderpostEnv
 */
class UnderpostRootEnv {
  static API = {
    /**
     * @method set
     * @description Sets an environment variable in the underpost root environment.
     * @param {string} key - The key of the environment variable to set.
     * @param {string} value - The value of the environment variable to set.
     * @memberof UnderpostEnv
     */
    set(key, value) {
      const exeRootPath = `${getNpmRootPath()}/underpost`;
      const envPath = `${exeRootPath}/.env`;
      let env = {};
      if (fs.existsSync(envPath)) env = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
      env[key] = value;
      writeEnv(envPath, env);
    },
    /**
     * @method delete
     * @description Deletes an environment variable from the underpost root environment.
     * @param {string} key - The key of the environment variable to delete.
     * @memberof UnderpostEnv
     */
    delete(key) {
      const exeRootPath = `${getNpmRootPath()}/underpost`;
      const envPath = `${exeRootPath}/.env`;
      let env = {};
      if (fs.existsSync(envPath)) env = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
      delete env[key];
      writeEnv(envPath, env);
    },
    /**
     * @method get
     * @description Gets an environment variable from the underpost root environment.
     * @param {string} key - The key of the environment variable to get.
     * @param {string} value - The value of the environment variable to get.
     * @param {object} options - Options for getting the environment variable.
     * @param {boolean} [options.plain=false] - If true, returns the environment variable value as a string.
     * @memberof UnderpostEnv
     */
    get(key, value, options = { plain: false }) {
      const exeRootPath = `${getNpmRootPath()}/underpost`;
      const envPath = `${exeRootPath}/.env`;
      if (!fs.existsSync(envPath)) {
        logger.error(`Unable to find underpost root environment`);
        return undefined;
      }
      const env = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
      options?.plain === true ? console.log(env[key]) : logger.info(`${key}(${typeof env[key]})`, env[key]);
      return env[key];
    },
    /**
     * @method list
     * @description Lists all environment variables in the underpost root environment.
     * @memberof UnderpostEnv
     */
    list() {
      const exeRootPath = `${getNpmRootPath()}/underpost`;
      const envPath = `${exeRootPath}/.env`;
      if (!fs.existsSync(envPath)) {
        logger.error(`Unable to find underpost root environment`);
        return {};
      }
      const env = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
      logger.info('underpost root', env);
      return env;
    },
    /**
     * @method clean
     * @description Cleans the underpost root environment by removing the environment file.
     * @memberof UnderpostEnv
     */
    clean() {
      const exeRootPath = `${getNpmRootPath()}/underpost`;
      const envPath = `${exeRootPath}/.env`;
      fs.removeSync(envPath);
    },
  };
}

export default UnderpostRootEnv;
