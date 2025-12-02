/**
 * SSH module for managing SSH key generation and connection setup.
 * @module src/cli/ssh.js
 * @namespace UnderpostSSH
 */

import { shellExec } from '../server/process.js';

/**
 * @class UnderpostSSH
 * @description Manages SSH key generation and connection setup.
 * @memberof UnderpostSSH
 */
class UnderpostSSH {
  static API = {
    callback: async (options = { generate: false }) => {},
  };
}

export default UnderpostSSH;
