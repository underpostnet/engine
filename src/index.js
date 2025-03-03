/**
 * Underpost index npm package
 * @module src/index.js
 * @namespace Underpost
 */

import UnderpostCluster from './cli/cluster.js';
import UnderpostCron from './cli/cron.js';
import UnderpostDB from './cli/db.js';
import UnderpostDeploy from './cli/deploy.js';
import UnderpostRootEnv from './cli/env.js';
import UnderpostImage from './cli/image.js';
import UnderpostRepository from './cli/repository.js';
import UnderpostScript from './cli/script.js';
import UnderpostSecret from './cli/secrets.js';
import UnderpostTest from './cli/test.js';

/**
 * Underpost main module methods
 * @class
 * @memberof Underpost
 */
class Underpost {
  /**
   * Underpost engine version
   * @static
   * @type {String}
   * @memberof Underpost
   */
  static version = 'v2.8.5';
  /**
   * Repository cli API
   * @static
   * @type {UnderpostRepository.API}
   * @memberof Underpost
   */
  static repo = UnderpostRepository.API;
  /**
   * Root Env cli API
   * @static
   * @type {UnderpostRootEnv.API}
   * @memberof Underpost
   */
  static env = UnderpostRootEnv.API;
  /**
   * Test cli API
   * @static
   * @type {UnderpostTest.API}
   * @memberof Underpost
   */
  static test = UnderpostTest.API;
  /**
   * Cluster cli API
   * @static
   * @type {UnderpostCluster.API}
   * @memberof Underpost
   */
  static cluster = UnderpostCluster.API;
  /**
   * Image cli API
   * @static
   * @type {UnderpostImage.API}
   * @memberof Underpost
   */
  static image = UnderpostImage.API;
  /**
   * Secrets cli API
   * @static
   * @type {UnderpostSecret.API}
   * @memberof Underpost
   */
  static secret = UnderpostSecret.API;
  /**
   * Scripts cli API
   * @static
   * @type {UnderpostScript.API}
   * @memberof Underpost
   */
  static script = UnderpostScript.API;
  /**
   * Database cli API
   * @static
   * @type {UnderpostDB.API}
   * @memberof Underpost
   */
  static db = UnderpostDB.API;
  /**
   * Deployment cli API
   * @static
   * @type {UnderpostDeploy.API}
   * @memberof Underpost
   */
  static deploy = UnderpostDeploy.API;
  /**
   * Cron cli API
   * @static
   * @type {UnderpostCron.API}
   * @memberof Underpost
   */
  static cron = UnderpostCron.API;
}

const up = Underpost;

const underpost = Underpost;

export { underpost, up, Underpost };

export default Underpost;
