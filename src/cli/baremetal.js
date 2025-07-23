import { getNpmRootPath, getUnderpostRootPath } from '../server/conf.js';
import { shellExec } from '../server/process.js';
import dotenv from 'dotenv';
import { loggerFactory } from '../server/logger.js';
import { getLocalIPv4Address } from '../server/dns.js';

const logger = loggerFactory(import.meta);

class UnderpostBaremetal {
  static API = {
    callback(
      options = {
        dev: false,
        controlServerInstall: false,
        controlServerDbInit: false,
        controlServerDbUninstall: false,
        controlServerInit: false,
        controlServerUninstall: false,
        controlServerStop: false,
        controlServerStart: false,
        controlServerLogin: false,
        getUsers: false,
        newApiKey: false,
      },
    ) {
      dotenv.config({ path: `${getUnderpostRootPath()}/.env`, override: true });
      const npmRoot = getNpmRootPath();
      const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;
      const dbProviderId = 'postgresql-17';
      if (options.controlServerLogin === true) {
        shellExec(`MAAS_ADMIN_USERNAME=$(underpost config get --plain MAAS_ADMIN_USERNAME)
APIKEY=$(maas apikey --username "$MAAS_ADMIN_USERNAME")
maas login "$MAAS_ADMIN_USERNAME" "http://localhost:5240/MAAS/" "$APIKEY"`);
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
      if (options.controlServerStart === true) {
        shellExec(`sudo snap restart maas`);
      }
      if (options.controlServerStop === true) {
        shellExec(`sudo snap stop maas`);
      }
      if (options.controlServerDbInit === true) {
        shellExec(`node ${underpostRoot}/bin/deploy ${dbProviderId} install`);
        shellExec(
          `node ${underpostRoot}/bin/deploy pg-drop-db ${process.env.DB_PG_MAAS_NAME} ${process.env.DB_PG_MAAS_USER}`,
        );
        shellExec(`node ${underpostRoot}/bin/deploy maas db`);
      }
      if (options.controlServerDbUninstall === true) {
        shellExec(`node ${underpostRoot}/bin/deploy ${dbProviderId} uninstall`);
      }
      if (options.controlServerInstall === true) {
        shellExec(`chmod +x ${underpostRoot}/manifests/maas/maas-setup.sh`);
        shellExec(`${underpostRoot}/manifests/maas/maas-setup.sh`);
        shellExec(`${underpostRoot}/manifests/maas/nat-iptables.sh`);
      }
      if (options.controlServerInit === true) {
        shellExec(`node ${underpostRoot}/bin/deploy maas reset`);
      }
      if (options.getUsers === true) {
        // <consumer_key>:<consumer_token>:<secret>
        const MAAS_API_TOKEN = shellExec(`maas apikey --username ${process.env.MAAS_ADMIN_USERNAME}`, {
          stdout: true,
        }).trim();
        const IP_ADDRESS = getLocalIPv4Address();
        const [consumer_key, consumer_token, secret] = MAAS_API_TOKEN.split(`\n`)[0].split(':');
        const users = shellExec(
          `curl --header "Authorization: OAuth oauth_version=1.0, oauth_signature_method=PLAINTEXT, oauth_consumer_key=${consumer_key}, oauth_token=${consumer_token}, oauth_signature=&${secret}, oauth_nonce=$(uuidgen), oauth_timestamp=$(date +%s)" http://${IP_ADDRESS}:5240/MAAS/api/2.0/users/`,
          {
            silent: true,
          },
        );
        logger.info('Users', JSON.parse(users));
      }
      if (options.newApiKey === true) {
        shellExec(`maas apikey --generate --username ${process.env.MAAS_ADMIN_USERNAME}`);
        // Delete api key
        // maas apikey --delete 'consumer_key:consumer_token:secret' --username ${process.env.MAAS_ADMIN_USERNAME}
        // List api keys
        // maas apikey --with-names --username ${process.env.MAAS_ADMIN_USERNAME}
      }
    },
  };
}

export default UnderpostBaremetal;
