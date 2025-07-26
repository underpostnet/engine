import dotenv from 'dotenv';
import { shellExec } from '../server/process.js';
import fs from 'fs-extra';
import UnderpostBaremetal from './baremetal.js';
import { loggerFactory } from '../server/logger.js';
import { getNpmRootPath } from '../server/conf.js';

dotenv.config();

const logger = loggerFactory(import.meta);

class UnderpostCloudInit {
  static API = {
    buildTools({ workflowId, nfsHostPath, hostname, callbackMetaData, dev }) {
      const { systemProvisioning, chronyc, networkInterfaceName, debootstrap } =
        UnderpostBaremetal.API.workflowsConfig[workflowId];
      const { timezone, chronyConfPath } = chronyc;
      const nfsHostToolsPath = `${nfsHostPath}/underpost`;

      // Determine the root path for npm and underpost.
      const npmRoot = getNpmRootPath();
      const underpostRoot = dev === true ? '.' : `${npmRoot}/underpost`;

      switch (systemProvisioning) {
        case 'ubuntu': {
          if (fs.existsSync(`${nfsHostToolsPath}`)) fs.removeSync(`${nfsHostToolsPath}`);
          fs.mkdirSync(`${nfsHostToolsPath}`, { recursive: true });

          logger.info('Build', `${nfsHostToolsPath}/date.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/date.sh`,
            UnderpostBaremetal.API.stepsRender(
              UnderpostBaremetal.API.systemProvisioningFactory[systemProvisioning].timezone({
                timezone,
                chronyConfPath,
              }),
              false,
            ),
            'utf8',
          );

          logger.info('Build', `${nfsHostToolsPath}/keyboard.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/keyboard.sh`,
            UnderpostBaremetal.API.stepsRender(
              UnderpostBaremetal.API.systemProvisioningFactory[systemProvisioning].keyboard(),
              false,
            ),
            'utf8',
          );

          logger.info('Build', `${nfsHostToolsPath}/host.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/host.sh`,
            `echo -e "127.0.0.1   localhost\n127.0.1.1   ${hostname}" | tee -a /etc/hosts`,
            'utf8',
          );

          logger.info('Build', `${nfsHostToolsPath}/dns.sh`);
          // echo "nameserver ${process.env.MAAS_DNS}" | tee /etc/resolv.conf > /dev/null
          fs.writeFileSync(
            `${nfsHostToolsPath}/dns.sh`,
            `rm /etc/resolv.conf
echo 'nameserver 8.8.8.8' > /run/systemd/resolve/stub-resolv.conf
ln -sf /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf`,
            'utf8',
          );

          logger.info('Build', `${nfsHostToolsPath}/start.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/start.sh`,
            `#!/bin/bash
set -x
# sudo cloud-init --all-stages
${UnderpostBaremetal.API.stepsRender(
  [
    `/underpost/date.sh`,
    `sleep 3`,
    `/underpost/reset.sh`,
    `sleep 3`,
    `cloud-init init --local`,
    `sleep 3`,
    `cloud-init init`,
    `sleep 3`,
    `cloud-init modules --mode=config`,
    `sleep 3`,
    `cloud-init modules --mode=final`,
    `sleep 3`,
    `/underpost/enlistment.sh`,
  ],
  false,
)}`,
            'utf8',
          );

          logger.info('Build', `${nfsHostToolsPath}/reset.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/reset.sh`,
            `sudo cloud-init clean --seed --configs all --machine-id # --logs
sudo rm -rf /var/lib/cloud/*
echo '' > /var/log/cloud-init.log
echo '' > /var/log/cloud-init-output.log`,
            'utf8',
          );

          logger.info('Build', `${nfsHostToolsPath}/help.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/help.sh`,
            `echo "=== Cloud init utils ==="
echo "sudo cloud-init --all-stages"
echo "sudo cloud-init clean --logs --seed --configs all --machine-id --reboot"
echo "sudo cloud-init init --local"
echo "sudo cloud-init init"
echo "sudo cloud-init modules --mode=config"
echo "sudo cloud-init modules --mode=final"`,
            'utf8',
          );

          logger.info('Build', `${nfsHostToolsPath}/test.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/test.sh`,
            `echo -e "\n=== Current date/time ==="
date '+%Y-%m-%d %H:%M:%S'
echo -e "\n=== Keyboard layout ==="
cat /etc/default/keyboard
echo -e "\n=== Registered users ==="
cut -d: -f1 /etc/passwd`,
            'utf8',
          );

          logger.info('Build', `${nfsHostToolsPath}/shutdown.sh`);
          fs.writeFileSync(`${nfsHostToolsPath}/shutdown.sh`, `sudo shutdown -h now`, 'utf8');

          logger.info('Build', `${nfsHostToolsPath}/mac.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/mac.sh`,
            `echo "$(cat /sys/class/net/${networkInterfaceName}/address)" > /underpost/mac`,
            'utf8',
          );

          logger.info('Build', `${nfsHostToolsPath}/device_scan.sh`);
          fs.copySync(`${underpostRoot}/manifests/maas/device-scan.sh`, `${nfsHostToolsPath}/device_scan.sh`);

          logger.info('Build', `${nfsHostToolsPath}/config-path.sh`);
          fs.writeFileSync(`${nfsHostToolsPath}/config-path.sh`, `echo "/etc/cloud/cloud.cfg.d/90_maas.cfg"`, 'utf8');

          logger.info('Build', `${nfsHostToolsPath}/enlistment.sh`);
          fs.writeFileSync(`${nfsHostToolsPath}/enlistment.sh`, ``, 'utf8');

          logger.info('Import ssh keys');
          shellExec(`sudo rm -rf ${nfsHostPath}/root/.ssh`);
          shellExec(`sudo rm -rf ${nfsHostPath}/home/root/.ssh`);
          logger.info('Copy', `/root/.ssh -> ${nfsHostPath}/root/.ssh`);
          fs.copySync(`/root/.ssh`, `${nfsHostPath}/root/.ssh`);

          logger.info('Enable tools execution and test');
          UnderpostBaremetal.API.crossArchRunner({
            nfsHostPath,
            debootstrapArch: debootstrap.image.architecture,
            callbackMetaData,
            steps: [
              `chmod +x /underpost/date.sh`,
              `chmod +x /underpost/keyboard.sh`,
              `chmod +x /underpost/dns.sh`,
              `chmod +x /underpost/help.sh`,
              `chmod +x /underpost/config-path.sh`,
              `chmod +x /underpost/host.sh`,
              `chmod +x /underpost/test.sh`,
              `chmod +x /underpost/start.sh`,
              `chmod +x /underpost/reset.sh`,
              `chmod +x /underpost/shutdown.sh`,
              `chmod +x /underpost/device_scan.sh`,
              `chmod +x /underpost/mac.sh`,
              `chmod +x /underpost/enlistment.sh`,
              `sudo chmod 700 ~/.ssh/`,
              `sudo chmod 600 ~/.ssh/authorized_keys`,
              `sudo chmod 644 ~/.ssh/known_hosts`,
              `sudo chmod 600 ~/.ssh/id_rsa`,
              `sudo chmod 600 /etc/ssh/ssh_host_ed25519_key`,
              `chown -R root:root ~/.ssh`,
              `/underpost/test.sh`,
            ],
          });

          break;
        }
        default:
          throw new Error('Invalid system provisioning: ' + systemProvisioning);
      }
    },
  };
}

export default UnderpostCloudInit;
