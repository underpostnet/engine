import { getNpmRootPath } from '../server/conf.js';
import { shellExec } from '../server/process.js';

class UnderpostBaremetal {
  static API = {
    callback(
      options = {
        dev: false,
        controlServerInitDb: false,
      },
    ) {
      const npmRoot = getNpmRootPath();
      const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;
      if (options.controlServerInitDb === true) {
        shellExec(`node ${underpostRoot}/bin/deploy maas db`);
      }
    },
  };
}

export default UnderpostBaremetal;
