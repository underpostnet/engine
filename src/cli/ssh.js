import { getNpmRootPath } from '../server/conf.js';
import { shellExec } from '../server/process.js';

class UnderpostSSH {
  static API = {
    /**
     * @method callback
     * @param {object} options
     * @param {boolean} options.generate - Generates new ssh credential and stores it in current private keys file storage.
     * @description Import and start ssh server and client based on current default deployment ID.
     */
    callback: async (
      options = {
        generate: false,
      },
    ) => {
      // only import + start
      // node bin/deploy ssh root@<host> <password> import

      // generate + import + start
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
