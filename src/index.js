/**
 * Underpost index npm package
 * @module src/index.js
 * @namespace Underpost
 */

import UnderpostBaremetal from './cli/baremetal.js';
import UnderpostCloudInit from './cli/cloud-init.js';
import UnderpostCluster from './cli/cluster.js';
import UnderpostCron from './cli/cron.js';
import UnderpostDB from './cli/db.js';
import UnderpostDeploy from './cli/deploy.js';
import UnderpostRootEnv from './cli/env.js';
import UnderpostFileStorage from './cli/fs.js';
import UnderpostImage from './cli/image.js';
import UnderpostLxd from './cli/lxd.js';
import UnderpostMonitor from './cli/monitor.js';
import UnderpostRepository from './cli/repository.js';
import UnderpostRun from './cli/run.js';
import UnderpostScript from './cli/script.js';
import UnderpostSecret from './cli/secrets.js';
import UnderpostSSH from './cli/ssh.js';
import UnderpostStatic from './cli/static.js';
import UnderpostTest from './cli/test.js';
import UnderpostStartUp from './server/start.js';

/**
 * Underpost main module methods
 * @class Underpost
 * @memberof Underpost
 */
class Underpost {
  /**
   * Underpost engine version
   * @static
   * @type {String}
   * @memberof Underpost
   */
  static version = 'v2.96.0';
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
   * Underpost Start Up cli API
   * @static
   * @type {UnderpostStartUp.API}
   * @memberof Underpost
   */
  static start = UnderpostStartUp.API;
  /**
   * Static cli API
   * @static
   * @type {UnderpostStatic.API}
   * @memberof Underpost
   */
  static static = UnderpostStatic.API;

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
  /**
   * File Storage cli API
   * @static
   * @type {UnderpostFileStorage.API}
   * @memberof Underpost
   */
  static fs = UnderpostFileStorage.API;
  /**
   * Monitor cli API
   * @static
   * @type {UnderpostMonitor.API}
   * @memberof Underpost
   */
  static monitor = UnderpostMonitor.API;
  /**
   * SSH cli API
   * @static
   * @type {UnderpostSSH.API}
   * @memberof Underpost
   */
  static ssh = UnderpostSSH.API;
  /**
   * LXD cli API
   * @static
   * @type {UnderpostLxd.API}
   * @memberof Underpost
   */
  static lxd = UnderpostLxd.API;

  /**
   * Cloud Init cli API
   * @static
   * @type {UnderpostCloudInit.API}
   * @memberof Underpost
   */
  static cloudInit = UnderpostCloudInit.API;

  /**
   * Run cli API
   * @static
   * @type {UnderpostRun.API}
   * @memberof Underpost
   */
  static run = UnderpostRun.API;

  /**
   * Baremetal cli API
   * @static
   * @type {UnderpostBaremetal.API}
   * @memberof Underpost
   */
  static baremetal = UnderpostBaremetal.API;
}

const up = Underpost;

const underpost = Underpost;

export {
  underpost,
  up,
  Underpost,
  UnderpostBaremetal,
  UnderpostCloudInit,
  UnderpostCluster,
  UnderpostCron,
  UnderpostDB,
  UnderpostDeploy,
  UnderpostRootEnv,
  UnderpostFileStorage,
  UnderpostImage,
  UnderpostLxd,
  UnderpostMonitor,
  UnderpostRepository,
  UnderpostRun,
  UnderpostScript,
  UnderpostSecret,
  UnderpostSSH,
  UnderpostTest,
  UnderpostStartUp,
};

export default Underpost;
