/**
 * Underpost index npm package
 * @module src/index.js
 * @namespace Underpost
 */

import UnderpostCluster from './cli/cluster.js';
import UnderpostRootEnv from './cli/env.js';
import UnderpostImage from './cli/image.js';
import UnderpostRepository from './cli/repository.js';
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
  static version = 'v2.8.44';
  /**
   * Repository cli API
   * @static
   * @type {UnderpostRepository}
   * @memberof Underpost
   */
  static repo = UnderpostRepository;
  /**
   * Root Env cli API
   * @static
   * @type {UnderpostRootEnv}
   * @memberof Underpost
   */
  static env = UnderpostRootEnv;
  /**
   * Test cli API
   * @static
   * @type {UnderpostTest}
   * @memberof Underpost
   */
  static test = UnderpostTest;
  /**
   * Cluster cli API
   * @static
   * @type {UnderpostCluster}
   * @memberof Underpost
   */
  static cluster = UnderpostCluster;
  /**
   * Image cli API
   * @static
   * @type {UnderpostImage}
   * @memberof Underpost
   */
  static image = UnderpostImage;
}

const up = Underpost;

const underpost = Underpost;

export { underpost, up, Underpost };

export default Underpost;
