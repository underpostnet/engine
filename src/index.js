/**
 * Underpost index npm package
 * @module src/index.js
 * @namespace Underpost
 */

import UnderpostBaremetal from './cli/baremetal.js';
import UnderpostCloudInit from './cli/cloud-init.js';
import UnderpostKickStart from './cli/kickstart.js';
import UnderpostCluster from './cli/cluster.js';
import UnderpostDB from './cli/db.js';
import UnderpostDeploy from './cli/deploy.js';
import UnderpostRootEnv from './cli/env.js';
import UnderpostFileStorage from './cli/fs.js';
import UnderpostImage from './cli/image.js';
import UnderpostLxd from './cli/lxd.js';
import UnderpostMonitor from './cli/monitor.js';
import UnderpostRepository from './cli/repository.js';
import UnderpostRun from './cli/run.js';
import UnderpostSecret from './cli/secrets.js';
import UnderpostSSH from './cli/ssh.js';
import UnderpostStatic from './cli/static.js';
import UnderpostTest from './cli/test.js';

import UnderpostDns from './server/dns.js';
import UnderpostBackup from './server/backup.js';
import UnderpostCron from './server/cron.js';
import UnderpostStartUp from './server/start.js';
import UnderpostTLS from './server/tls.js';

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
  static version = 'v2.99.6';

  /**
   * Required Node.js major version
   * @static
   * @type {String}
   * @memberof Underpost
   */
  static majorNodejsVersion = 'v24';

  /**
   * Repository cli API
   * @static
   * @type {UnderpostRepository.API}
   * @memberof Underpost
   */
  static get repo() {
    return UnderpostRepository.API;
  }
  /**
   * Root Env cli API
   * @static
   * @type {UnderpostRootEnv.API}
   * @memberof Underpost
   */
  static get env() {
    return UnderpostRootEnv.API;
  }
  /**
   * Test cli API
   * @static
   * @type {UnderpostTest.API}
   * @memberof Underpost
   */
  static get test() {
    return UnderpostTest.API;
  }

  /**
   * Static cli API
   * @static
   * @type {UnderpostStatic.API}
   * @memberof Underpost
   */
  static get static() {
    return UnderpostStatic.API;
  }

  /**
   * Cluster cli API
   * @static
   * @type {UnderpostCluster.API}
   * @memberof Underpost
   */
  static get cluster() {
    return UnderpostCluster.API;
  }
  /**
   * Image cli API
   * @static
   * @type {UnderpostImage.API}
   * @memberof Underpost
   */
  static get image() {
    return UnderpostImage.API;
  }
  /**
   * Secrets cli API
   * @static
   * @type {UnderpostSecret.API}
   * @memberof Underpost
   */
  static get secret() {
    return UnderpostSecret.API;
  }
  /**
   * Database cli API
   * @static
   * @type {UnderpostDB.API}
   * @memberof Underpost
   */
  static get db() {
    return UnderpostDB.API;
  }
  /**
   * Deployment cli API
   * @static
   * @type {UnderpostDeploy.API}
   * @memberof Underpost
   */
  static get deploy() {
    return UnderpostDeploy.API;
  }
  /**
   * File Storage cli API
   * @static
   * @type {UnderpostFileStorage.API}
   * @memberof Underpost
   */
  static get fs() {
    return UnderpostFileStorage.API;
  }
  /**
   * Monitor cli API
   * @static
   * @type {UnderpostMonitor.API}
   * @memberof Underpost
   */
  static get monitor() {
    return UnderpostMonitor.API;
  }
  /**
   * SSH cli API
   * @static
   * @type {UnderpostSSH.API}
   * @memberof Underpost
   */
  static get ssh() {
    return UnderpostSSH.API;
  }
  /**
   * LXD cli API
   * @static
   * @type {UnderpostLxd.API}
   * @memberof Underpost
   */
  static get lxd() {
    return UnderpostLxd.API;
  }

  /**
   * Cloud Init cli API
   * @static
   * @type {UnderpostCloudInit.API}
   * @memberof Underpost
   */
  static get cloudInit() {
    return UnderpostCloudInit.API;
  }

  /**
   * KickStart cli API
   * @static
   * @type {UnderpostKickStart.API}
   * @memberof Underpost
   */
  static get kickstart() {
    return UnderpostKickStart.API;
  }

  /**
   * Run cli API
   * @static
   * @type {UnderpostRun.API}
   * @memberof Underpost
   */
  static get run() {
    return UnderpostRun.API;
  }

  /**
   * Baremetal cli API
   * @static
   * @type {UnderpostBaremetal.API}
   * @memberof Underpost
   */
  static get baremetal() {
    return UnderpostBaremetal.API;
  }

  /**
   * Dns cli API
   * @static
   * @type {UnderpostDns.API}
   * @memberof Underpost
   */
  static get dns() {
    return UnderpostDns.API;
  }

  /**
   * BackUp cli API
   * @static
   * @type {UnderpostBackup.API}
   * @memberof Underpost
   */
  static get backup() {
    return UnderpostBackup.API;
  }

  /**
   * Cron cli API
   * @static
   * @type {UnderpostCron.API}
   * @memberof Underpost
   */
  static get cron() {
    return UnderpostCron.API;
  }

  /**
   * Start Up cli API
   * @static
   * @type {UnderpostStartUp.API}
   * @memberof Underpost
   */
  static get start() {
    return UnderpostStartUp.API;
  }

  /**
   * TLS/SSL server utilities API
   * @static
   * @type {UnderpostTLS.API}
   * @memberof Underpost
   */
  static get tls() {
    return UnderpostTLS.API;
  }
}

if (!process.version || !process.version.startsWith(`${Underpost.majorNodejsVersion}.`))
  console.warn(
    `${`Underpost Warning: Required Node.js version is `.red}${`${Underpost.majorNodejsVersion}.x`.bgBlue.bold.white}${`, you are using `.red}${process.version.bgRed.bold.white}`,
  );

const up = Underpost;

const underpost = Underpost;

export {
  underpost,
  up,
  Underpost,
  UnderpostBaremetal,
  UnderpostCloudInit,
  UnderpostCluster,
  UnderpostDB,
  UnderpostDeploy,
  UnderpostRootEnv,
  UnderpostFileStorage,
  UnderpostImage,
  UnderpostStatic,
  UnderpostLxd,
  UnderpostMonitor,
  UnderpostRepository,
  UnderpostRun,
  UnderpostSecret,
  UnderpostSSH,
  UnderpostTest,
  UnderpostDns,
  UnderpostBackup,
  UnderpostCron,
  UnderpostStartUp,
  UnderpostTLS,
};

export default Underpost;
