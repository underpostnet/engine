import { getNpmRootPath, getUnderpostRootPath } from '../server/conf.js';
import { shellExec } from '../server/process.js';
import dotenv from 'dotenv';
class UnderpostBaremetal {
  static API = {
    callback(
      options = {
        dev: false,
        controlServerInitDb: false,
        controlServerReset: false,
      },
    ) {
      dotenv.config({ path: `${getUnderpostRootPath()}/.env`, override: true });
      const npmRoot = getNpmRootPath();
      const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;
      const dbProviderId = 'postgresql-14';
      if (options.controlServerInitDb === true) {
        shellExec(`node ${underpostRoot}/bin/deploy ${dbProviderId} install`);
        shellExec(
          `node ${underpostRoot}/bin/deploy pg-drop-db ${process.env.DB_PG_MAAS_NAME} ${process.env.DB_PG_MAAS_USER}`,
        );
        shellExec(`node ${underpostRoot}/bin/deploy maas db`);
      }
      if (options.controlServerReset === true) {
        shellExec(`node ${underpostRoot}/bin/deploy maas reset`);
      }
    },
  };
}

export default UnderpostBaremetal;
