import { getNpmRootPath, getUnderpostRootPath } from '../server/conf.js';
import { shellExec } from '../server/process.js';
import dotenv from 'dotenv';
class UnderpostBaremetal {
  static API = {
    callback(
      options = {
        dev: false,
        controlServerInstall: false,
        controlServerInitDb: false,
        controlServerInit: false,
        controlServerUninstall: false,
        controlServerStop: false,
        controlServerStart: false,
      },
    ) {
      dotenv.config({ path: `${getUnderpostRootPath()}/.env`, override: true });
      const npmRoot = getNpmRootPath();
      const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;
      const dbProviderId = 'postgresql-14';
      if (options.controlServerUninstall === true) {
        // Stop MAAS services
        shellExec(`sudo systemctl stop maas.pebble || true`);
        shellExec(`sudo snap stop maas`);
        shellExec(`sudo snap remove maas --purge || true`);

        // Remove Snap residual data
        shellExec(`sudo rm -rf /var/snap/maas`);
        shellExec(`sudo rm -rf ~/snap/maas`);

        // Remove MAAS config and data directories
        shellExec(`sudo rm -rf /etc/maas`);
        shellExec(`sudo rm -rf /var/lib/maas`);
        shellExec(`sudo rm -rf /var/log/maas`);
      }
      if (options.controlServerStart === true) {
        shellExec(`sudo snap restart maas`);
      }
      if (options.controlServerStop === true) {
        shellExec(`sudo snap stop maas`);
      }
      if (options.controlServerInitDb === true) {
        shellExec(`node ${underpostRoot}/bin/deploy ${dbProviderId} install`);
        shellExec(
          `node ${underpostRoot}/bin/deploy pg-drop-db ${process.env.DB_PG_MAAS_NAME} ${process.env.DB_PG_MAAS_USER}`,
        );
        shellExec(`node ${underpostRoot}/bin/deploy maas db`);
      }
      if (options.controlServerInstall === true) {
        shellExec(`chmod +x ${underpostRoot}/manifests/maas/maas-setup.sh`);
        shellExec(`${underpostRoot}/manifests/maas/maas-setup.sh`);
      }
      if (options.controlServerInit === true) {
        shellExec(`node ${underpostRoot}/bin/deploy maas reset`);
      }
    },
  };
}

export default UnderpostBaremetal;
