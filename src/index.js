/**
 * Underpost index npm package
 * @module src/index.js
 * @namespace Underpost
 */

import { loggerFactory, setUpInfo } from './server/logger.js';

const logger = loggerFactory(import.meta);

const underpost = {
  /**
   * Logs information about the current process environment to the console.
   *
   * This function is used to log details about
   * the execution context, such as command-line arguments,
   * environment variables, the process's administrative privileges,
   * and the maximum available heap space size.
   *
   * @memberof Underpost
   */
  setUpInfo: async () => await setUpInfo(logger),
};

const up = underpost;

export { underpost, up };

export default underpost;
