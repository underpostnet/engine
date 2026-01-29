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
     * @param {object} options - Options for setting the environment variable.
     * @param {string} [options.deployId=''] - Deployment ID associated with the environment variable.
     * @param {boolean} [options.build=false] - If true, triggers a build after setting the environment variable.
     * @memberof UnderpostEnv
     */
    set(key, value, options = { deployId: '', build: false }) {
      const _set = (envPath, key, value) => {
        let env = {};
        if (fs.existsSync(envPath)) env = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
        env[key] = value;
        writeEnv(envPath, env);
      };
      if (options.build) {
        const deployIdList = options.deployId
          ? [options.deployId]
          : fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').split(',');
        for (const deployId of deployIdList)
          for (const envFile of ['test', 'development', 'production'])
            _set(`./engine-private/conf/${deployId}/.env.${envFile}`, key, value);
        return;
      }
      const exeRootPath = `${getNpmRootPath()}/underpost`;
      const envPath = `${exeRootPath}/.env`;
      _set(envPath, key, value);
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
     * @param {boolean} [options.disableLog=false] - If true, disables logging of the environment variable value.
     * @memberof UnderpostEnv
     */
    get(key, value, options = { plain: false, disableLog: false }) {
      const exeRootPath = `${getNpmRootPath()}/underpost`;
      const envPath = `${exeRootPath}/.env`;
      if (!fs.existsSync(envPath)) {
        logger.warn(`Empty environment variables`);
        return undefined;
      }
      const env = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
      if (!options.disableLog)
        options?.plain === true ? console.log(env[key]) : logger.info(`${key}(${typeof env[key]})`, env[key]);
      return env[key];
    },
    /**
     * @method list
     * @description Lists all environment variables in the underpost root environment.
     * @param {string} key - Not used for list operation.
     * @param {string} value - Not used for list operation.
     * @param {object} options - Options for listing environment variables.
     * @param {string} [options.filter] - Filter keyword to match against keys or values.
     * @memberof UnderpostEnv
     */
    list(key, value, options = {}) {
      const exeRootPath = `${getNpmRootPath()}/underpost`;
      const envPath = `${exeRootPath}/.env`;
      if (!fs.existsSync(envPath)) {
        logger.warn(`Empty environment variables`);
        return {};
      }
      let env = dotenv.parse(fs.readFileSync(envPath, 'utf8'));

      // Apply filter if provided
      if (options.filter) {
        const filterKeyword = options.filter.toLowerCase();
        const filtered = {};
        for (const [envKey, envValue] of Object.entries(env)) {
          const keyMatch = envKey.toLowerCase().includes(filterKeyword);
          const valueMatch = String(envValue).toLowerCase().includes(filterKeyword);
          if (keyMatch || valueMatch) {
            filtered[envKey] = envValue;
          }
        }
        env = filtered;
        logger.info(`underpost root (filtered by: ${options.filter})`, env);
      } else {
        logger.info('underpost root', env);
      }

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
