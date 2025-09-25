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
    /**
     * @method callback
     * @description Manages SSH key generation and connection setup based on the default deployment ID.
     * This function will either generate a new SSH key pair or import an existing one,
     * then initiate the SSH connection process.
     * @param {object} [options={ generate: false }] - Options for the SSH callback.
     * @param {boolean} [options.generate=false] - If true, generates a new SSH key pair. Otherwise, it imports the existing one.
     * @memberof UnderpostSSH
     * @returns {Promise<void>}
     */
    callback: async (
      options = {
        generate: false,
      },
    ) => {
      // Example usage for importing an existing key:
      // node bin/deploy ssh root@<host> <password> import

      // Example usage for generating a new key:
      // node bin/deploy ssh root@<host> <password>

      shellExec(
        `node bin/deploy ssh root@${process.env.DEFAULT_DEPLOY_HOST} ${process.env.DEFAULT_DEPLOY_PASSWORD ?? `''`}${
          options.generate === true ? '' : ' import'
        }`,
      );
    },
  };
}

export default UnderpostSSH;
