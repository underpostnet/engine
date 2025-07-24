import { getNpmRootPath, getUnderpostRootPath } from '../server/conf.js';
import { shellExec } from '../server/process.js';
import dotenv from 'dotenv';
import { loggerFactory } from '../server/logger.js';
import { getLocalIPv4Address } from '../server/dns.js';

const logger = loggerFactory(import.meta);

class UnderpostBaremetal {
  static API = {
    callback(
      workflowId,
      hostname,
      ipAddress,
      options = {
        dev: false,
        controlServerInstall: false,
        controlServerUninstall: false,
        controlServerDbInstall: false,
        controlServerDbUninstall: false,
        commission: false,
      },
    ) {
      dotenv.config({ path: `${getUnderpostRootPath()}/.env`, override: true });
      const npmRoot = getNpmRootPath();
      const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;
      const dbProviderId = 'postgresql-17';

      if (options.controlServerInstall === true) {
        shellExec(`chmod +x ${underpostRoot}/manifests/maas/maas-setup.sh`);
        shellExec(`chmod +x ${underpostRoot}/manifests/maas/nat-iptables.sh`);
        shellExec(`${underpostRoot}/manifests/maas/maas-setup.sh`);
        shellExec(`${underpostRoot}/manifests/maas/nat-iptables.sh`);
      }

      if (options.controlServerUninstall === true) {
        // Stop MAAS services
        shellExec(`sudo snap stop maas.pebble || true`);
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

      if (options.controlServerDbInstall === true) {
        shellExec(`node ${underpostRoot}/bin/deploy ${dbProviderId} install`);
        shellExec(
          `node ${underpostRoot}/bin/deploy pg-drop-db ${process.env.DB_PG_MAAS_NAME} ${process.env.DB_PG_MAAS_USER}`,
        );
        shellExec(`node ${underpostRoot}/bin/deploy maas db`);
      }
      if (options.controlServerDbUninstall === true) {
        shellExec(`node ${underpostRoot}/bin/deploy ${dbProviderId} uninstall`);
      }
    },
  };
}

export default UnderpostBaremetal;
